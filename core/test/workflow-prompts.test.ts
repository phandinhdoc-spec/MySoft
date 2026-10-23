import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowPrompts,editReviewedPrompt,promptWorkflow,rewriteSteps,rewriteYaml,type PromptReviewReply,REWRITE_SYSTEM} from '../src/desktop/workflow-prompts';
import {normalizeWorkflow,WorkflowRunner} from '../src/desktop/workflows';
import {DesktopRuntime} from '../src/desktop/runtime';
import {editPlanSteps,linkPlan,validatePlan} from '../src/desktop/plans';
import type {Plan,WorkflowRun} from '../src/desktop/types';

const answer=JSON.stringify({muc_tieu:'Soạn theo yêu cầu gốc',dau_ra:'Kết quả đáp ứng yêu cầu',rang_buoc:'Không bịa dữ liệu',tieu_chi_hoan_thanh:'Đáp ứng yêu cầu gốc'});
const workflow=()=>normalizeWorkflow({name:'Bài học',steps:[{id:'a',name:'Soạn',prompt:'Dùng {{input}} /soan-bai #ngan'},{id:'b',name:'Rà',prompt:'Rà {{prev}}'}]});
const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));vi.restoreAllMocks();});
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-review-'));roots.push(dir);return dir;}
const dispatch=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const approve=(r:DesktopRuntime,d:PromptReviewReply,extra:Record<string,unknown>={})=>dispatch(r,d.resume.method,{...d.resume.params,promptApproval:d.promptReview.token,...extra});
/** Lưu bản tốt vào bản sao qua RPC riêng, không chạy. */
const saveDraft=(r:DesktopRuntime,d:PromptReviewReply,extra:Record<string,unknown>={})=>dispatch(r,'workflowPromptSave',{method:d.resume.method,params:d.resume.params,promptApproval:d.promptReview.token,...extra});
function runtime(){
 const dir=temp(),r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.store.data.preferences.choice={backend:'api',model:'mock/model'};
 const spy=vi.spyOn(r.engine,'run').mockImplementation(async o=>({text:o.system===REWRITE_SYSTEM?answer:'Kết quả đã làm',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never));
 return {r,spy,dir};
}

describe('prompt review',()=>{
 it('generates explicit YAML wiring and preserves placeholders, skills, rules and original text',()=>{
  const w=workflow(),s=w.steps[1]!;s.files=['/a b/nguon.md'];s.prompt+='\nGiữ toàn bộ bảng: A: B';
  const yaml=rewriteYaml(w,s,answer);
  expect(yaml).toContain('buoc_truoc: ["a"]');expect(yaml).toContain('tep: ["/a b/nguon.md"]');
  expect(yaml).toContain('  Rà {{prev}}\n  Giữ toàn bộ bảng: A: B');expect(yaml).toContain('dau_ra:');
  expect(rewriteYaml(w,w.steps[0]!,answer)).toContain('/soan-bai #ngan');
  expect(()=>rewriteYaml(w,s,'Không phải JSON')).toThrow();expect(()=>rewriteYaml(w,s,'{}')).toThrow('thiếu');
 });
 it('does not rewrite original Plan nodes or language workflows, including legacy frame declarations',()=>{
  const w=workflow();w.planId='plan';w.steps[1]!.templateCopy=true;
  expect(rewriteSteps(w).map(s=>s.id)).toEqual(['b']);
  w.steps[0]!.prompt='!bien so-lan = 0';expect(rewriteSteps(w)).toEqual([]);
  w.steps[0]!.prompt='gốc';w.frames=[{id:'f',name:'F',stepIds:['a'],decl:'{{a = 1}}'}];expect(rewriteSteps(w)).toEqual([]);
 });
 it('protects original Plan nodes inside referenced workflows',()=>{
  const child=workflow();child.planId='plan';child.steps[1]!.templateCopy=true;
  const parent=normalizeWorkflow({steps:[{id:'sub',prompt:'nested',subWorkflowId:child.id}]});
  const flat=promptWorkflow(parent,[child,parent]);expect(rewriteSteps(flat).map(s=>s.id)).toEqual(['sub.b']);
  expect(flat.steps.every(s=>!s.templateCopy)).toBe(true);
 });
 it('only permits descriptive YAML edits; frozen wiring and original instructions cannot disappear',()=>{
  const w=workflow(),before=rewriteYaml(w,w.steps[0]!,answer);
  expect(editReviewedPrompt(before,before.replace('Không bịa dữ liệu','Giữ đúng dữ liệu'))).toContain('Giữ đúng dữ liệu');
  expect(()=>editReviewedPrompt(before,before.replace('{{input}}',''))).toThrow();
  expect(()=>editReviewedPrompt(before,before.replace('buoc_truoc: []','buoc_truoc: ["b"]'))).toThrow();
 });
 it.each(['prompt','file','link','context'] as const)('rejects stale approval after %s changes',async change=>{
  const w=workflow(),file=path.join(temp(),'source.txt');fs.writeFileSync(file,'one');w.steps[0]!.files=[file];
  const service=new WorkflowPrompts(),context={rule:'old'};const d=await service.prepare(w,context,'run',async()=>answer);
  if(change==='prompt')w.steps[0]!.prompt='changed';if(change==='file')fs.writeFileSync(file,'new content');
  if(change==='link')w.steps[1]!.dependsOn=[];if(change==='context')context.rule='new';
  expect(()=>service.consume(d!.token,w,context,'run')).toThrow('hết hiệu lực');service.dispose();
 });
 it('binds approval to its action, consumes once and cancellation discards drafts',async()=>{
  const w=workflow(),s=new WorkflowPrompts(),d=await s.prepare(w,{},'run',async()=>answer);
  expect(()=>s.consume(d!.token,w,{},'different')).toThrow();
  s.consume(d!.token,w,{},'run');expect(()=>s.consume(d!.token,w,{},'run')).toThrow();
  const next=await s.prepare(w,{},'run',async()=>answer);s.cancel(w.id);expect(()=>s.consume(next!.token,w,{},'run')).toThrow();
 });
 it('fingerprints executed prompts and invalidates dependent results when an approved prompt changes',async()=>{
  const w=workflow(),calls:string[]=[];
  const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async text=>{calls.push(text);if(text.includes('Rà'))throw Error('fail');return 'OUT';}});
  const first={source:'source',prompts:{a:'Soạn A',b:'Rà B'}};
  const run=await runner.run(w.id,false,undefined,first);expect(w.steps[0]!.prompt).not.toBe('Soạn A');
  expect(run.steps[0]!.fingerprint).toBeTruthy();expect(run.approvedPrompts).toEqual(first);
  calls.length=0;await runner.run(w.id,true,undefined,first);expect(calls).toHaveLength(1);
  calls.length=0;await runner.run(w.id,true,undefined,{...first,prompts:{...first.prompts,a:'Soạn C'}});expect(calls).toHaveLength(2);
 });
 it('reuses the exact approved prompts for retry when source and resources have not changed',async()=>{
  const w=workflow(),s=new WorkflowPrompts(),model=vi.fn(async()=>answer);
  const d=await s.prepare(w,{},'run',model),{approved}=s.consume(d!.token,w,{},'run');model.mockClear();
  const retry=await s.prepare(w,{},'retry',model,approved);expect(model).not.toHaveBeenCalled();expect(retry!.steps[0]!.prompt).toBe(approved.prompts.a);
 });
 it('keeps upstream approval reusable when only a later node changes',async()=>{
  const w=workflow(),service=new WorkflowPrompts(),model=vi.fn(async()=>answer);
  const d=await service.prepare(w,{},'run',model),{approved}=service.consume(d!.token,w,{},'run');
  w.steps[1]!.prompt+=' yêu cầu mới';model.mockClear();
  const next=await service.prepare(w,{},'retry',model,approved);
  expect(model).toHaveBeenCalledTimes(1);expect(next!.steps[0]!.prompt).toBe(approved.prompts.a);
 });
});

describe('runtime review gate',()=>{
 it('requires review through workflowRun, uses approved YAML and only saves on request',async()=>{
  const {r,spy}=runtime(),w=workflow();w.steps.forEach(s=>s.templateCopy=true);r.store.data.workflows=[w];
  const originals=w.steps.map(s=>s.prompt);
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  expect(d.promptReview.steps).toHaveLength(2);expect(w.runs).toHaveLength(0);expect(spy.mock.calls.every(([o])=>o.system===REWRITE_SYSTEM)).toBe(true);
  const run=await approve(r,d) as WorkflowRun;expect(run.status).toBe('success');expect(w.steps.map(s=>s.prompt)).toEqual(originals);
  expect(spy.mock.calls.some(([o])=>o.system!==REWRITE_SYSTEM&&o.buildPrompt?.(false,false).includes('muc_tieu:'))).toBe(true);
  const next=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  expect(await saveDraft(r,next)).toEqual({promptSaved:true,steps:['Soạn','Rà']});expect(w.runs).toHaveLength(1);
  expect(w.steps[0]!.prompt).toContain('muc_tieu:');expect(w.steps[0]!.promptFormat).toBe('yaml-v1');
  const saved=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;expect(saved.promptReview.steps[0]!.prompt).toBe(w.steps[0]!.prompt);
 });
 it('rejects stale drafts via actual save RPC and never starts a run',async()=>{
  const {r}=runtime(),w=workflow();r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  await dispatch(r,'workflowSave',{workflow:{...w,steps:w.steps.map(s=>({...s,prompt:s.prompt+' đổi'}))}});
  await expect(approve(r,d)).rejects.toThrow('hết hiệu lực');expect(w.runs).toHaveLength(0);
 });
 it('saves the approved copy without running, keeps attachments and step wiring, and never touches the template',async()=>{
  const {r,spy}=runtime(),w=workflow();w.steps.forEach(s=>s.templateCopy=true);
  const file=path.join(temp(),'nguon.txt');fs.writeFileSync(file,'Tài liệu');w.steps[0]!.files=[file];
  r.store.data.workflows=[w];const tid=await dispatch(r,'templateSave',{template:{name:'Mẫu',params:[],steps:[{id:'s',prompt:'Mẫu gốc'}],output:{mode:'fixed',text:'Kết quả'}}}) as string;
  const tplBefore=structuredClone(r.store.data.workflowTemplates);
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;const callsBefore=spy.mock.calls.length;
  expect(await saveDraft(r,d)).toEqual({promptSaved:true,steps:['Soạn','Rà']});
  expect(spy.mock.calls.length).toBe(callsBefore);expect(w.runs).toHaveLength(0);
  expect(w.steps[0]!).toMatchObject({promptFormat:'yaml-v1',files:[file],templateCopy:true});expect(w.steps[0]!.prompt).toContain('muc_tieu:');
  expect(w.steps[1]!.prompt).toContain('muc_tieu:');expect(w.steps.map(s=>s.id)).toEqual(['a','b']);
  expect(r.store.data.workflowTemplates).toEqual(tplBefore);expect(tid).toBeTruthy();
 });
 it('refuses to save a draft whose approved version no longer matches, and keeps the draft unconsumed',async()=>{
  const {r}=runtime(),w=workflow();w.steps.forEach(s=>s.templateCopy=true);r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  await dispatch(r,'workflowSave',{workflow:{...w,steps:w.steps.map(s=>({...s,prompt:s.prompt+' đổi'}))}});
  const current=structuredClone(r.store.data.workflows![0]!);
  await expect(saveDraft(r,d)).rejects.toThrow('hết hiệu lực');
  expect(r.store.data.workflows![0]!.steps.map(s=>[s.prompt,s.promptFormat])).toEqual(current.steps.map(s=>[s.prompt,s.promptFormat]));
  expect(r.store.data.workflows![0]!.runs).toHaveLength(0);
 });
 it('refuses a save with no copy node to write, without starting a run',async()=>{
  const {r}=runtime(),w=workflow();r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  await expect(saveDraft(r,d)).rejects.toThrow('Chỉ lưu bản viết lại vào nút bản sao');expect(w.runs).toHaveLength(0);
 });
 it('retains inserted Plan provenance through editing, linking and restart; only the copy is rewritten',async()=>{
  const {r,dir,spy}=runtime(),chatId=await dispatch(r,'newChat') as string;
  const plan:Plan={id:'p',chatId,title:'Plan',approved:true,steps:[{id:'base',goal:'Gốc',task:'Nhiệm vụ đã duyệt',files:[],risk:'',status:'waiting'}]};
  r.store.data.chats[0]!.messages.push({id:'m',role:'assistant',text:'',at:1,plan});linkPlan(plan,r.store.data.workflows??=[]);
  const tid=await dispatch(r,'templateSave',{template:{name:'Mẫu',params:[],steps:[{id:'s',name:'Bản sao',prompt:'Soạn bài'}],output:{mode:'fixed',text:'Theo yêu cầu'}}}) as string;
  await dispatch(r,'templateInsert',{templateId:tid,target:{planId:'p'}});
  expect(plan.steps[1]!.templateCopy).toBe(true);editPlanSteps(plan,structuredClone(plan.steps));
  const w=linkPlan(plan,r.store.data.workflows!);expect(w.steps[1]!.templateCopy).toBe(true);
  const source=path.join(dir,'nguon.txt');fs.writeFileSync(source,'Tài liệu của bản sao');
  await dispatch(r,'workflowSave',{workflow:{...w,planRevision:plan.revision,steps:w.steps.map(s=>s.templateCopy?{...s,files:[source],inputs:[],outputs:[],completion:'',onError:''}:s)}});
  expect(()=>validatePlan(plan)).not.toThrow();expect(w.steps[1]!.files).toEqual([source]);
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  expect(d.promptReview.steps.map(s=>s.id)).toEqual([plan.steps[1]!.id]);expect(spy).toHaveBeenCalledTimes(1);
  await expect(dispatch(r,'workflowPromptSave',{method:'runPlan',params:{id:'p',revision:(plan.revision??0)+1},promptApproval:d.promptReview.token})).rejects.toThrow('Kế hoạch đã đổi');
  expect(w.steps[1]!.promptFormat).toBeUndefined();
  await saveDraft(r,d);expect(plan.steps[0]!.task).toBe('Nhiệm vụ đã duyệt');expect(plan.steps[1]!.task).toContain('muc_tieu:');
  expect(w.runs).toHaveLength(0);
  await approve(r,await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply);
  expect(w.runs[0]!.approvedPlan!.steps[1]!.task).toContain('muc_tieu:');
  expect(spy.mock.calls.some(([o])=>o.system!==REWRITE_SYSTEM&&o.buildPrompt?.(false,false).includes('Tài liệu của bản sao'))).toBe(true);
  r.store.save();const restored=new DesktopRuntime(()=>{},dir);runtimes.push(restored);
  expect(restored.store.data.workflows![0]!.steps[1]).toMatchObject({templateCopy:true,promptFormat:'yaml-v1'});
  expect(r.store.data.workflowTemplates![0]!.steps[0]!.prompt).toBe('Soạn bài');
 });
 it('chat route creates one copy, waits for approval, then posts results in the same chat',async()=>{
  const {r}=runtime(),chatId=await dispatch(r,'newChat') as string;
  const tid=await dispatch(r,'templateSave',{template:{name:'Mẫu',params:[],steps:[{id:'s',prompt:'Soạn'}],output:{mode:'fixed',text:'Kết quả'}}}) as string;
  const d=await dispatch(r,'chatWorkflow',{chatId,templateId:tid}) as PromptReviewReply;
  expect(r.store.data.workflows).toHaveLength(1);expect(r.store.data.chats[0]!.messages).toHaveLength(0);
  await approve(r,d);expect(r.store.data.workflows).toHaveLength(1);expect(r.store.data.chats[0]!.messages.at(-1)?.workflow?.status).toBe('success');
 });
 it('prepare-only bypass for language workflows never starts execution',async()=>{
  const {r,spy}=runtime(),w=workflow();w.steps=[{...w.steps[0]!,prompt:'!bien so-lan = 0\n!in $so-lan'}];r.store.data.workflows=[w];
  const ready=await dispatch(r,'workflowRun',{id:w.id,promptPrepare:true}) as any;
  expect(ready.promptReady).toBe(true);expect(spy).not.toHaveBeenCalled();expect(w.runs).toHaveLength(0);
  const run=await dispatch(r,ready.resume.method,ready.resume.params) as WorkflowRun;expect(run.status).toBe('success');
 });
});
