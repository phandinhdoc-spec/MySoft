import {describe,it,expect} from 'vitest';
import {confirmsWorkflow,parseDesignedWorkflow,designWorkflowTurn} from '../src/desktop/workflow-designer.js';
import type {Chat,Workflow} from '../src/desktop/types.js';
const payload=JSON.stringify({name:'Soạn đề',steps:[{name:'Soạn',prompt:'Soạn đề theo tiêu chí đã thống nhất.'},{name:'Rà soát',prompt:'Kiểm tra {{prev}}.'}]});
function fixture(text='Tôi cần một đề kiểm tra KHTN lớp 6.'){
 const c:Chat={id:'chat',title:'Thiết kế',messages:[{id:'u',role:'user',text,at:0}],summary:'',updatedAt:0,workflowDesign:{}};
 const list:Workflow[]=[];const ctl=new AbortController();let system='';
 const deps={list:()=>list,changed:()=>{},model:async(_text:string,s:string)=>{system=s;return payload;}};
 return {c,list,ctl,deps,system:()=>system};
}
describe('workflow designer',()=>{
 it('recognizes explicit confirmation, not discussion or negation',()=>{
  for(const t of ['Làm ngay','làm đi!','Đồng ý tạo.','Xác nhận làm'])expect(confirmsWorkflow(t)).toBe(true);
  for(const t of ['chưa làm ngay','đừng tạo quy trình','khi tôi nói làm ngay thì tạo','Làm ngay có nghĩa gì?'])expect(confirmsWorkflow(t)).toBe(false);
 });
 it('discusses without saving even if AI emits a workflow',async()=>{
  const f=fixture();await designWorkflowTurn(f.c,'góp ý',false,f.ctl.signal,f.deps);
  expect(f.list).toHaveLength(0);expect(f.c.workflowDesign?.workflowId).toBeUndefined();expect(f.system()).toContain('phản biện');
 });
 it('creates on button confirmation and keeps existing input absent',async()=>{
  const f=fixture();await designWorkflowTurn(f.c,'mô tả',true,f.ctl.signal,f.deps);
  expect(f.list).toHaveLength(1);expect(f.list[0]?.input).toBeUndefined();expect(f.list[0]?.runs).toEqual([]);expect(f.c.workflowDesign?.workflowId).toBe(f.list[0]?.id);
  await expect(designWorkflowTurn(f.c,'Làm ngay',true,f.ctl.signal,f.deps)).rejects.toThrow('đã được tạo');expect(f.list).toHaveLength(1);
 });
 it('creates on textual confirmation',async()=>{
  const f=fixture();await designWorkflowTurn(f.c,'làm đi',false,f.ctl.signal,f.deps);expect(f.list).toHaveLength(1);
 });
 it('requires an output description',async()=>{
  const f=fixture('Làm ngay');await expect(designWorkflowTurn(f.c,'Làm ngay',true,f.ctl.signal,f.deps)).rejects.toThrow('mô tả');expect(f.list).toHaveLength(0);
 });
 it('ignores model supplied paths, permissions and IDs',()=>{
  const w=parseDesignedWorkflow(JSON.stringify({id:'existing',folder:'/tmp',input:{kind:'file',value:'/tmp/x'},name:'Test',steps:[{id:'foreign',name:'A',prompt:'B',access:'full',choice:{backend:'api',model:'x'}}]}));
  expect(w.id).not.toBe('existing');expect(w.folder).toBeUndefined();expect(w.input).toBeUndefined();expect(w.steps[0]?.access).toBe('read');expect(w.steps[0]?.choice).toBe('auto');
 });
 it('rejects malformed output without saving and allows retry',async()=>{
  const f=fixture();await expect(designWorkflowTurn(f.c,'Làm ngay',true,f.ctl.signal,{...f.deps,model:async()=>'{oops'})).rejects.toThrow('hợp lệ');expect(f.list).toHaveLength(0);expect(f.c.workflowDesign?.workflowId).toBeUndefined();
  await designWorkflowTurn(f.c,'Làm ngay',true,f.ctl.signal,f.deps);expect(f.list).toHaveLength(1);
 });
 it('does not save after cancellation',async()=>{
  const f=fixture();await expect(designWorkflowTurn(f.c,'Làm ngay',true,f.ctl.signal,{...f.deps,model:async()=>{f.ctl.abort();return payload;}})).rejects.toThrow();expect(f.list).toHaveLength(0);
 });
 it('rejects empty and oversized step lists',()=>{
  for(const steps of [[],[{name:'A',prompt:''}],Array.from({length:51},()=>({name:'A',prompt:'B'}))])expect(()=>parseDesignedWorkflow(JSON.stringify({name:'Test',steps}))).toThrow();
 });
});

it('maps AI dependency numbers to fresh IDs and rejects cycles',()=>{
 const value={name:'Đa nhánh',mode:'parallel',steps:[{name:'A',prompt:'A',waitFor:[]},{name:'B',prompt:'B',waitFor:[]},{name:'Gộp',prompt:'{{prev}}',waitFor:[1,2]}]};
 const wf=parseDesignedWorkflow(JSON.stringify(value));expect(wf.mode).toBe('parallel');expect(wf.steps[2]!.dependsOn).toEqual(wf.steps.slice(0,2).map(s=>s.id));
 value.steps[0]!.waitFor=[3];expect(()=>parseDesignedWorkflow(JSON.stringify(value))).toThrow('vòng lặp');
 value.steps[0]!.waitFor=[99];expect(()=>parseDesignedWorkflow(JSON.stringify(value))).toThrow('không hợp lệ');
});
it('đặt nút ở Chỉnh sửa chỉ khi model khai báo đầu ra là tệp', () => {
 const wf=parseDesignedWorkflow(JSON.stringify({name:'Soạn đề',steps:[{name:'Phân tích',prompt:'Phân tích yêu cầu.',writes:false},{name:'Xuất Word',prompt:'Ghi đề ra tệp Word.',writes:true},{name:'Rà soát',prompt:'Kiểm tra.'}]}));
 expect(wf.steps.map(s=>s.access)).toEqual(['read','full','read']);
});
