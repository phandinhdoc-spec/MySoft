import {expect,it,vi} from 'vitest';
import {draftMarkdownWorkflow,parseMarkdownWorkflow} from '../src/desktop/workflow-markdown';
import {DesktopRuntime} from '../src/desktop/runtime';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeWorkflow} from '../src/desktop/workflows';
import {importWorkflow,exportWorkflow} from '../../chatbox/src/workflow-tools';

const answer=()=>({name:'Sinh đề',params:[],output:{mode:'fixed',text:'Ba tệp Word'},steps:[
 {name:'Đọc đề',prompt:'Đọc {{input}}. Giữ !bien và $ten.',waitFor:[],outputs:['cau-1.md']},
 {name:'Biến thể',prompt:'Tạo ba biến thể từ {{prev}}.',waitFor:[1]},
 {name:'Kiểm tra',prompt:'Rà soát trước khi xuất Word.',waitFor:[2]},
]});
it('passes free-form Markdown as data and preserves dependencies and prompts',async()=>{
 const model=vi.fn().mockResolvedValue(JSON.stringify(answer()));
 const source='# Ý tưởng\nĐọc đề, tạo biến thể rồi kiểm tra.';
 const draft=await draftMarkdownWorkflow(source,new AbortController().signal,model);
 expect(JSON.parse(model.mock.calls[0]![0])).toEqual({markdown:source});
 expect(draft.steps[1]!.dependsOn).toEqual([draft.steps[0]!.id]);
 expect(draft.steps[0]!.prompt).toContain('!bien và $ten');
 expect(draft.steps.every(s=>s.access==='read'&&s.choice==='auto')).toBe(true);
});
it('rejects invalid JSON, empty input, excessive input, invalid dependencies and cycles',async()=>{
 const model=vi.fn();const signal=new AbortController().signal;
 await expect(draftMarkdownWorkflow('',signal,model)).rejects.toThrow('trống');
 await expect(draftMarkdownWorkflow('x'.repeat(100001),signal,model)).rejects.toThrow('100.000');
 expect(model).not.toHaveBeenCalled();
 expect(()=>parseMarkdownWorkflow('invalid')).toThrow('JSON');
 const data=answer();data.steps[0]!.waitFor=[3];
 expect(()=>parseMarkdownWorkflow(JSON.stringify(data))).toThrow('vòng lặp');
 data.steps[0]!.waitFor=[4];
 expect(()=>parseMarkdownWorkflow(JSON.stringify(data))).toThrow('quan hệ chờ');
});
it('does not silently truncate model output or accept unknown placeholders',()=>{
 expect(()=>parseMarkdownWorkflow(JSON.stringify({...answer(),description:'x'.repeat(601)}))).toThrow('600');
 const data=answer();data.steps[0]!.prompt='{{missing}}';
 expect(()=>parseMarkdownWorkflow(JSON.stringify(data))).toThrow('chưa có tham số');
 data.steps[0]!.prompt='x'.repeat(12001);
 expect(()=>parseMarkdownWorkflow(JSON.stringify(data))).toThrow('12000');
});
it('does not accept a result after cancellation',async()=>{
 const ctl=new AbortController();
 await expect(draftMarkdownWorkflow('Nguồn',ctl.signal,async()=>{ctl.abort();return JSON.stringify(answer());})).rejects.toThrow();
});
it('preserves workflows above twenty nodes and rejects overflow rather than dropping nodes',()=>{
 const data={...answer(),steps:Array.from({length:50},(_,i)=>({name:`Khâu ${i+1}`,prompt:'Nhiệm vụ',waitFor:i?[i]:[]}))};
 const template=parseMarkdownWorkflow(JSON.stringify(data));
 const workflow=normalizeWorkflow({name:template.name,steps:template.steps,mode:'parallel'});
 const imported=importWorkflow(exportWorkflow(workflow));
 expect(imported.steps).toHaveLength(50);
 expect(imported.steps[49]!.dependsOn).toEqual([imported.steps[48]!.id]);
 data.steps.push({name:'Thừa',prompt:'Không được mất âm thầm',waitFor:[]});
 expect(()=>parseMarkdownWorkflow(JSON.stringify(data))).toThrow('50');
 expect(()=>normalizeWorkflow({name:'Quá giới hạn',steps:data.steps})).toThrow('50');
});
it('drafts via RPC without saving, then saves and creates a workflow without running it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-md-test-'));
 const runtime=new DesktopRuntime(()=>{},dir);
 const model=vi.spyOn(runtime as any,'model').mockResolvedValue(JSON.stringify(answer()));
 const call=(method:string,params:Record<string,unknown>)=>runtime.dispatch({id:crypto.randomUUID(),method,params});
 try{
  const draft=await call('workflowMarkdownDraft',{text:'# Tạo đề\nBa mã đề.'}) as any;
  expect(runtime.store.data.workflowTemplates??[]).toHaveLength(0);
  expect(runtime.store.data.workflows??[]).toHaveLength(0);
  expect(model.mock.calls[0]![7]).toMatchObject({permission:'read',allowMcp:false});
  const id=await call('templateSave',{template:draft});
  const created=await call('templateInsert',{templateId:id,target:{},params:{}}) as any;
  const workflow=runtime.store.data.workflows!.find(w=>w.id===created.id)!;
  expect(workflow.steps).toHaveLength(3);
  expect(workflow.runs).toHaveLength(0);
  expect(workflow.steps[1]!.dependsOn).toEqual([workflow.steps[0]!.id]);
 }finally{runtime.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});
