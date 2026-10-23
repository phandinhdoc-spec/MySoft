import {afterEach,it,expect,vi} from 'vitest';
import {wordStructureTool} from '../src/office/wordstructure';
afterEach(()=>vi.unstubAllGlobals());
function setup(){
 const items=['Báo cáo','Mục tiêu','Phạm vi'].map(text=>({text,style:'Normal',styleBuiltIn:'Normal',isListItem:false,font:{size:13,bold:false},parentTableOrNullObject:{isNullObject:true,load:vi.fn()}}));
 const ctx={document:{body:{paragraphs:{items,load:vi.fn()}}},sync:vi.fn().mockResolvedValue(undefined)};
 vi.stubGlobal('Office',{context:{requirements:{isSetSupported:()=>true}}});
 vi.stubGlobal('Word',{run:(f:any)=>f(ctx)});return {items,ctx};
}
it('assigns real semantic styles to exact paragraphs without changing text',async()=>{
 const {items}=setup();await wordStructureTool('office_word_apply_outline',{items:[{index:0,expectedText:'Báo cáo',role:'title'},{index:1,expectedText:'Mục tiêu',role:'heading1'},{index:2,expectedText:'Phạm vi',role:'heading2'}]});
 expect(items.map(p=>p.styleBuiltIn)).toEqual(['Title','Heading1','Heading2']);
 expect(items.map(p=>p.text)).toEqual(['Báo cáo','Mục tiêu','Phạm vi']);
 expect(items[1]!.font.size).toBeGreaterThan(items[2]!.font.size);
});
it('a stale later anchor rejects the whole batch before any paragraph is changed',async()=>{
 const {items}=setup();await expect(wordStructureTool('office_word_apply_outline',{items:[{index:0,expectedText:'Báo cáo',role:'title'},{index:1,expectedText:'Nội dung cũ',role:'heading1'}]})).rejects.toThrow('thay đổi');
 expect(items.map(p=>p.styleBuiltIn)).toEqual(['Normal','Normal','Normal']);
});
it('returns paginated structure with a next pointer',async()=>{
 setup();const result:any=await wordStructureTool('office_word_get_structure',{start:0,count:2});expect(result.next).toBe(2);expect(result.total).toBe(3);expect(result.paragraphs).toHaveLength(2);
});

function indexSetup(style='Heading1',existing=false){
 const {items,ctx}=setup();items[1]!.styleBuiltIn=style;
 const field={updateResult:vi.fn()};const control={tag:'',title:'',getRange:()=>({insertField:vi.fn(()=>field)}),insertTable:vi.fn(()=>({headerRowCount:0}))};
 const insertField=vi.fn(()=>field);control.getRange=()=>({insertField});
 const target={getRange:()=>({insertContentControl:()=>control})};
 const heading={styleBuiltIn:'',font:{},insertParagraph:vi.fn(()=>target)};
 const insertParagraph=vi.fn(()=>heading);Object.assign(items[0]!,{insertParagraph});
 Object.assign(ctx.document,{contentControls:{getByTag:()=>({items:existing?[{}]:[],load:vi.fn()})}});
 Object.assign(ctx.document.body,{getRange:()=>({fields:{items:[],load:vi.fn()}})});
 vi.stubGlobal('Office',{context:{requirements:{isSetSupported:()=>true},platform:'PC'},PlatformType:{OfficeOnline:'OfficeOnline'}});
 return {insertParagraph,insertField,field,control};
}
it('creates an updateable TOC field rather than static page numbers',async()=>{
 const {insertField,field}=indexSetup();await wordStructureTool('office_word_insert_index',{kind:'toc',afterIndex:0,expectedText:'Báo cáo'});
 expect(insertField).toHaveBeenCalledWith('Start','TOC','\\o "1-3" \\h \\z \\u');expect(field.updateResult).toHaveBeenCalledOnce();
});
it('does not duplicate an existing generated index',async()=>{
 const {insertParagraph}=indexSetup('Heading1',true);const result:any=await wordStructureTool('office_word_insert_index',{kind:'toc',afterIndex:0,expectedText:'Báo cáo'});
 expect(result.created).toBe(false);expect(insertParagraph).not.toHaveBeenCalled();
});
it('requires table captions before inserting a list of tables',async()=>{
 const {insertParagraph}=indexSetup();await expect(wordStructureTool('office_word_insert_index',{kind:'tables',afterIndex:0,expectedText:'Báo cáo'})).rejects.toThrow('chú thích bảng');
 expect(insertParagraph).not.toHaveBeenCalled();
});
