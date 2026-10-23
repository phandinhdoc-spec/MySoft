import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {extractHandoff,fallbackHandoff,handoffInput,handoffRules,needsHandoff} from '../src/desktop/handoff';
import {expandTemplate,normalizeTemplate} from '../src/desktop/workflow-templates';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows';
import {extract} from '../src/desktop/documents';
import type {Workflow} from '../src/desktop/types';

it('applies handoff only from 8 nodes',()=>{expect(needsHandoff(7)).toBe(false);expect(needsHandoff(8)).toBe(true);});
it('extracts, falls back and formats handoff',()=>{
 expect(extractHandoff('Kết quả dài\n\n## BÀN GIAO\nĐã làm: A\nTệp: /x.docx')).toBe('Đã làm: A\nTệp: /x.docx');
 expect(extractHandoff('không có phiếu')).toBeUndefined();
 expect(fallbackHandoff('abc')).toContain('abc');
 expect(handoffRules(2,9)).toContain('nút 3');
 expect(handoffInput([{name:'A',handoff:'h',ok:true},{name:'B',ok:false,error:'x'}])).toBe('[A]\nh\n\n[B]\nLỗi: x');
});
it('supports branched templates: independent roots and a merge step',()=>{
 const t=normalizeTemplate({name:'Nhánh',steps:[{id:'a',prompt:'A',dependsOn:[]},{id:'b',prompt:'B',dependsOn:[]},{id:'m',prompt:'Gộp {{prev}}',dependsOn:['a','b']}],output:{mode:'ask',text:''}});
 const s=expandTemplate(t,{output:'Tệp Word'},{skill:()=>undefined,rule:()=>undefined,prompt:()=>undefined},{maxPrompt:4000});
 expect(s.find(x=>x.id==='a')!.dependsOn).toEqual([]);expect(s.find(x=>x.id==='b')!.dependsOn).toEqual([]);
 expect(s.find(x=>x.id==='m')!.dependsOn).toEqual(['a','b']);
 expect(s.find(x=>x.id==='m')!.prompt).toContain('Tệp Word');expect(s.find(x=>x.id==='a')!.prompt).not.toContain('Tệp Word');
});
it('passes only the handoff note, with the rules, to the next node of a long workflow',async()=>{
 const calls:{text:string;system:string}[]=[];
 const wf:Workflow=normalizeWorkflow({name:'Dài',steps:Array.from({length:8},(_,i)=>({id:`s${i}`,name:`Nút ${i}`,prompt:`Làm ${i}`}))});
 const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async(text,system)=>{calls.push({text,system});return `KẾT QUẢ RẤT DÀI ${calls.length}\n## BÀN GIAO\nphiếu ${calls.length}`;}});
 const run=await runner.run(wf.id);
 expect(run.status).toBe('success');
 expect(calls[0]!.system).toContain('QUY TẮC BÀN GIAO');
 expect(calls[1]!.text).toContain('PHIẾU BÀN GIAO TỪ NÚT TRƯỚC');expect(calls[1]!.text).toContain('phiếu 1');expect(calls[1]!.text).not.toContain('KẾT QUẢ RẤT DÀI');
 expect(run.steps[0]!.handoff).toBe('phiếu 1');
});
it('does not add handoff to short workflows',async()=>{
 const calls:string[]=[];
 const wf:Workflow=normalizeWorkflow({name:'Ngắn',steps:[{id:'a',name:'A',prompt:'a'},{id:'b',name:'B',prompt:'b'}]});
 await new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async(_t,system)=>{calls.push(system);return 'xong';}}).run(wf.id);
 expect(calls.every(c=>!c.includes('QUY TẮC BÀN GIAO'))).toBe(true);
});
it('no longer rejects text attachments above 30 MB',async()=>{
 const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-big-')),'big.txt');
 fs.writeFileSync(f,('x'.repeat(99)+'\n').repeat(320_000)); // ~32 MB
 expect(fs.statSync(f).size).toBeGreaterThan(30*1024*1024);
 const r=await extract(f);expect(r.segments.length).toBe(320_001);
 fs.rmSync(path.dirname(f),{recursive:true,force:true});
});
