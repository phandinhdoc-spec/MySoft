import {abbreviationRows,outlineHint,ROLE_STYLES,validateOutline,type ParagraphInfo} from './outline';
type Args=Record<string,unknown>;
async function paragraphs(ctx:Word.RequestContext){
 const ps=ctx.document.body.paragraphs;ps.load('items/text,items/style,items/styleBuiltIn,items/isListItem,items/font/size,items/font/bold');await ctx.sync();
 const tables=ps.items.map(p=>p.parentTableOrNullObject);for(const t of tables)t.load('isNullObject');await ctx.sync();
 const info:ParagraphInfo[]=ps.items.map((p,index)=>({index,text:p.text,style:p.styleBuiltIn==='Other'?p.style:String(p.styleBuiltIn),inTable:!tables[index]!.isNullObject,isList:p.isListItem,size:p.font.size,bold:p.font.bold}));
 return {ps,info};
}
function requireApi(version:string){if(!Office.context.requirements.isSetSupported('WordApi',version))throw Error(`Chức năng này cần WordApi ${version}; hãy cập nhật Word.`);}
export async function wordStructureTool(tool:string,a:Args){
 requireApi('1.3');
 return Word.run(async ctx=>{
  const {ps,info}=await paragraphs(ctx);
  if(tool==='office_word_get_structure'){
   const start=Math.max(0,Math.floor(Number(a.start)||0));const count=Math.max(1,Math.min(100,Math.floor(Number(a.count)||60)));
   return {total:info.length,next:start+count<info.length?start+count:null,paragraphs:info.slice(start,start+count).map(p=>({...p,text:p.text.slice(0,5000),truncated:p.text.length>5000,suggestion:outlineHint(p)})),note:'Gợi ý chỉ để tham khảo. AI phải đọc các trang và xét ngữ nghĩa/quan hệ cha-con trước khi gán style.'};
  }
  if(tool==='office_word_apply_outline'){
   const changes=validateOutline(a.items,info);
   const font=typeof a.font==='string'&&a.font.trim()?a.font.trim():'Times New Roman';
   const base=typeof a.bodySize==='number'?a.bodySize:13;
   if(!Number.isFinite(base)||base<9||base>18||font.length>100)throw Error('Phông hoặc cỡ chữ không hợp lệ.');
   const headingFont=typeof a.headingFont==='string'&&a.headingFont.trim()?a.headingFont.trim():font;
   if(headingFont.length>100)throw Error('Phông tiêu đề không hợp lệ.');
   const sizes=a.headingSizes;
   if(sizes!==undefined&&(!Array.isArray(sizes)||sizes.length!==3||!sizes.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=base&&n<=72)||sizes[0]<sizes[1]||sizes[1]<sizes[2]))throw Error('Cỡ các cấp đề mục không hợp lệ.');
   const color=typeof a.accent==='string'?a.accent:'#243B53';if(!/^#[\da-f]{6}$/i.test(color))throw Error('Màu nhấn phải là #rrggbb.');
   const textColor=typeof a.textColor==='string'?a.textColor:'#000000';if(!/^#[\da-f]{6}$/i.test(textColor))throw Error('Màu chữ không hợp lệ.');
   if(changes.some(c=>c.role==='tableCaption')){
    requireApi('1.5');const style=ctx.document.getStyles().getByNameOrNullObject(ROLE_STYLES.tableCaption);style.load('isNullObject');await ctx.sync();
    if(style.isNullObject)ctx.document.addStyle(ROLE_STYLES.tableCaption,'Paragraph');await ctx.sync();
   }
   for(const c of changes){
    const p=ps.items[c.index]!;const role=c.role;
    if(role==='tableCaption')p.style=ROLE_STYLES.tableCaption;else p.styleBuiltIn=ROLE_STYLES[role] as Word.BuiltInStyleName;
    p.font.name=role.startsWith('heading')||role==='title'?headingFont:font;p.font.color=role.startsWith('heading')||role==='title'?color:textColor;
    const level=Number(role.slice(-1));
    p.font.size=role==='title'?base+7:role==='subtitle'?base+1:role.startsWith('heading')?(Array.isArray(sizes)?sizes[Math.min(level,3)-1]:base+Math.max(0,4-level)):base;
    if(role!=='body')p.font.bold=role!=='subtitle'&&role!=='figureCaption';
    if(role==='title')p.alignment='Centered';
    else if(role.startsWith('heading'))p.alignment='Left';
    p.spaceBefore=role.startsWith('heading')?12:role==='body'?0:6;p.spaceAfter=role.startsWith('heading')?6:4;
   }
   await ctx.sync();return {applied:changes.length,note:'Đã gán style ngữ nghĩa theo đoạn và hệ chữ riêng; chưa thêm mục lục/danh mục. Đọc lại cấu trúc và xem PDF để kiểm tra.'};
  }
  if(tool==='office_word_insert_index'){
   requireApi('1.5');
   if(Office.context.platform===Office.PlatformType.OfficeOnline)throw Error('Hãy mở Word trên máy tính để tạo/cập nhật trường mục lục.');
   const kind=a.kind;if(!['toc','tables','abbreviations'].includes(String(kind)))throw Error('Loại danh mục không hợp lệ.');
   const tag=`pvta-index-${kind}`;const controls=ctx.document.contentControls.getByTag(tag);controls.load('items');await ctx.sync();
   if(controls.items.length)return {created:false,note:'Danh mục PVTA này đã có. Không chèn trùng; cập nhật danh mục hiện có trong Word.'};
   const title=kind==='toc'?'MỤC LỤC':kind==='tables'?'DANH MỤC BẢNG':'DANH MỤC TỪ VIẾT TẮT';
   if(info.some(p=>p.text.trim().toLocaleUpperCase('vi')===title))throw Error('Tài liệu đã có danh mục tương ứng; kiểm tra và cập nhật mục hiện có.');
   let rows:string[][]=[];
   if(kind==='abbreviations')rows=abbreviationRows(a.entries,info.map(p=>p.text).join('\n'));
   if(kind==='toc'&&!info.some(p=>/^Heading[1-3]$/.test(p.style)))throw Error('Cần gán Heading 1–3 trước khi tạo mục lục.');
   if(kind==='tables'&&!info.some(p=>p.style===ROLE_STYLES.tableCaption))throw Error('Cần nhận diện chú thích bảng và gán tableCaption trước; không tự bịa tên bảng.');
   // Refuse duplicate native indexes, even when a user chose a different heading.
   if(kind!=='abbreviations'){
    const fields=ctx.document.body.getRange().fields;fields.load('items/code');await ctx.sync();
    if(fields.items.some(f=>/\bTOC\b/i.test(f.code)&&(kind==='tables'?/PVTA Table Caption|\\c\s/i.test(f.code):!/PVTA Table Caption|\\c\s/i.test(f.code))))throw Error('Đã có trường mục lục/danh mục. Hãy cập nhật trường hiện có.');
   }
   const index=Number(a.afterIndex);const anchor=info[index];
   if(!Number.isInteger(index)||!anchor||anchor.inTable||anchor.text!==a.expectedText)throw Error('Vị trí chèn đã đổi hoặc không hợp lệ; đọc lại cấu trúc và chọn đoạn ngoài bảng.');
   const heading=ps.items[index]!.insertParagraph(title,'After');heading.styleBuiltIn='TocHeading';heading.font.name='Times New Roman';heading.font.size=15;heading.font.bold=true;
   const target=heading.insertParagraph('','After');const control=target.getRange().insertContentControl();control.tag=tag;control.title=title;
   if(kind==='abbreviations')control.insertTable(rows.length+1,2,'Start',[['Từ viết tắt','Nghĩa đầy đủ'],...rows]).headerRowCount=1;
   else{
    const field=control.getRange().insertField('Start','TOC',kind==='toc'?'\\o "1-3" \\h \\z \\u':'\\t "PVTA Table Caption,1" \\h \\z');
    await ctx.sync();try{field.updateResult();await ctx.sync();}catch{return {created:true,needsUpdate:true,note:'Đã chèn trường mục lục. Word chưa cập nhật được; chọn Cập nhật trường trong Word. Không chèn lại.'};}
   }
   await ctx.sync();return {created:true,note:'Đã chèn danh mục. Cập nhật trường trong Word khi nội dung hoặc số trang thay đổi.'};
  }
  throw Error('Công cụ cấu trúc không hợp lệ.');
 });
}
