import {it,expect} from 'vitest';
import {parseDeclarations,codeInstructions} from '../src/desktop/workflow-vars';
import {parseSelection,stepIdsFromNumbers,validateFrames,declarationsFor,cleanFrames,flattenWorkflow,assertNoCycle} from '../src/desktop/workflow-frames';
import {normalizeWorkflow} from '../src/desktop/workflows';
import type {Workflow} from '../src/desktop/types';

const f=(id:string,stepIds:string[],decl='')=>({id,name:id,stepIds,decl});
it('parses variables and functions but leaves {{prev}} and template keys alone',()=>{
 const d=parseDeclarations('Biến {{a = 2}} và {{ten = "An"}}, hàm !{{tinhTong: cộng hai số}} !{{dem}} cùng {{prev}} {{khoa}}');
 expect(d.vars).toEqual([{name:'a',value:'2'},{name:'ten',value:'"An"'}]);
 expect(d.funcs).toEqual([{name:'tinhTong',description:'cộng hai số'},{name:'dem',description:''}]);
 expect(()=>parseDeclarations('{{a = 1}} {{a = 2}}')).toThrow('hai lần');
 expect(()=>parseDeclarations('{{1x = 1}}')).toThrow('không hợp lệ');
 expect(()=>parseDeclarations('{{prev = 1}}')).toThrow('dành cho hệ thống');
 expect(()=>parseDeclarations('{{a = }}')).toThrow('chưa có giá trị');
 const text=codeInstructions(d);
 expect(text).toContain('BẮT BUỘC SINH MÃ');expect(text).toContain('- a = 2');expect(text).toContain('tinhTong: cộng hai số');
});
it('selects steps by number and ignores renumbering',()=>{
 expect(parseSelection('1,3,5-7',9)).toEqual([1,3,5,6,7]);
 expect(()=>parseSelection('0',3)).toThrow('ngoài khoảng');expect(()=>parseSelection('2-9',3)).toThrow('ngoài khoảng');expect(()=>parseSelection('a',3)).toThrow('cú pháp');expect(()=>parseSelection('',3)).toThrow('Chưa nhập');
 expect(stepIdsFromNumbers([{id:'x'},{id:'y'},{id:'z'}],'1,3')).toEqual(['x','z']);
});
it('validates frames: nesting ok, partial overlap rejected, depth and shadowing checked',()=>{
 const parent=validateFrames([f('A',['1','2','3','4'],'{{a = 1}}'),f('B',['1','2'],'{{b = 2}}'),f('C',['3'])]);
 expect(parent.get('B')).toBe('A');expect(parent.get('C')).toBe('A');expect(parent.get('A')).toBeUndefined();
 expect(()=>validateFrames([f('A',['1','2']),f('B',['2','3'])])).toThrow('chồng lên nhau');
 expect(()=>validateFrames([f('A',['1','2']),f('B',['1','2'])])).toThrow('cùng các nút');
 expect(()=>validateFrames([f('A',['1','2','3','4','5']),f('B',['1','2','3','4']),f('C',['1','2','3']),f('D',['1','2'])])).toThrow('quá 3 tầng');
 expect(()=>validateFrames([f('A',['1','2'],'{{a = 1}}'),f('B',['1'],'!{{a: che khuất}}')])).toThrow('che khuất');
 const frames=[f('A',['1','2'],'{{a = 1}}'),f('B',['1'],'!{{ham: x}}')];
 expect(declarationsFor(frames,'1').vars.map(v=>v.name)).toEqual(['a']);expect(declarationsFor(frames,'1').funcs.map(v=>v.name)).toEqual(['ham']);
 expect(declarationsFor(frames,'9')).toEqual({vars:[],funcs:[]});
});
it('cleans frames and keeps them through normalizeWorkflow; overlapping save is rejected',()=>{
 const steps=[{id:'a',prompt:'x'},{id:'b',prompt:'y'}];
 expect(cleanFrames([{id:'f',name:'K',stepIds:['a','zzz'],decl:'{{n = 1}}'},{id:'g',stepIds:['zzz']}],steps)).toEqual([f('f',['a'],'{{n = 1}}').valueOf()].map(x=>({...x,name:'K'})));
 const w=normalizeWorkflow({name:'W',steps,frames:[{id:'f',name:'K',stepIds:['a','b'],decl:'{{n = 1}}'}]});
 expect(w.frames).toHaveLength(1);
 expect(()=>normalizeWorkflow({name:'W',steps,frames:[{id:'f',stepIds:['a']},{id:'g',stepIds:['a','b']},{id:'h',stepIds:['b','a']}]})).toThrow();
});
const wfOf=(id:string,steps:any[],extra:any={}):Workflow=>({id,name:id,steps:steps.map(s=>({name:s.id,prompt:'p',choice:'auto',access:'read',...s})),runs:[],updatedAt:1,mode:'parallel',...extra});
it('flattens a sub-workflow node and rejects cycles',()=>{
 const child=wfOf('child',[{id:'c1',dependsOn:[]},{id:'c2',dependsOn:['c1']}],{frames:[f('cf',['c1','c2'],'{{x = 1}}')]});
 const parent=wfOf('parent',[{id:'p1',dependsOn:[]},{id:'node',subWorkflowId:'child',dependsOn:['p1']},{id:'p3',dependsOn:['node']}],{frames:[f('pf',['node'],'{{y = 2}}')]});
 const flat=flattenWorkflow(parent,[parent,child]);
 expect(flat.steps.map(s=>s.id)).toEqual(['p1','node.c1','node.c2','p3']);
 expect(flat.steps[1]!.dependsOn).toEqual(['p1']);expect(flat.steps[2]!.dependsOn).toEqual(['node.c1']);expect(flat.steps[3]!.dependsOn).toEqual(['node.c2']);
 expect(flat.frames.find(x=>x.id==='pf')!.stepIds).toEqual(['node.c1','node.c2']);
 expect(flat.frames.find(x=>x.id==='node.cf')!.stepIds).toEqual(['node.c1','node.c2']);
 const loopA=wfOf('A',[{id:'n',subWorkflowId:'B'}]),loopB=wfOf('B',[{id:'m',subWorkflowId:'A'}]);
 expect(()=>assertNoCycle(loopA,[loopA,loopB])).toThrow('vòng');
 expect(()=>assertNoCycle(wfOf('X',[{id:'n',subWorkflowId:'ghost'}]),[])).toThrow('không còn tồn tại');
});
