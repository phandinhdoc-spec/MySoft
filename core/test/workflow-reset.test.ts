import {afterEach,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeWorkflow,WorkflowRunner} from '../src/desktop/workflows';
import {archiveWorkflowFiles,captureWorkflowFiles,workflowFiles,resetPlanState} from '../src/desktop/workflow-reset';
import type {Chat,Plan,WorkflowRun} from '../src/desktop/types';
import {markFiles} from '../src/desktop/plan-recovery';

const roots:string[]=[];
it('never claims unrelated files in a shared working directory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-reset-'));roots.push(dir);
 const run:WorkflowRun={id:'r',status:'error',startedAt:1,steps:[]};
 const before=workflowFiles(dir);const file=path.join(dir,'teacher.txt');fs.writeFileSync(file,'teacher');
 captureWorkflowFiles(run,dir,before);archiveWorkflowFiles(run);
 expect(fs.readFileSync(file,'utf8')).toBe('teacher');
});
it('preserves generated files edited after capture and legacy files without fingerprints',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-reset-'));roots.push(dir);
 const run:WorkflowRun={id:'r',status:'error',startedAt:1,steps:[],workdir:dir};
 const before=workflowFiles(dir);const file=path.join(dir,'output.txt');fs.writeFileSync(file,'generated');
 captureWorkflowFiles(run,dir,before);fs.writeFileSync(file,'teacher edit');archiveWorkflowFiles(run);
 expect(fs.readFileSync(file,'utf8')).toBe('teacher edit');
 run.generatedFiles=[file];archiveWorkflowFiles(run);expect(fs.existsSync(file)).toBe(true);
});
afterEach(()=>roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true})));
it.each([false,true])('uses Plan creation evidence and preserves later edits (edited=%s)',edited=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-reset-'));roots.push(dir);
 const file=path.join(dir,'plan.txt');const before=markFiles([file]);fs.writeFileSync(file,'generated');const after=markFiles([file]);
 if(edited)fs.writeFileSync(file,'teacher edit');
 const plan:Plan={id:'p',chatId:'c',title:'Plan',approved:true,steps:[{id:'s',goal:'A',task:'A',files:[],outputs:[file],risk:'',status:'error',checkpoint:{runId:'r',revision:0,at:1,inputs:{},before,after}}]};
 const run:WorkflowRun={id:'r',status:'error',startedAt:1,steps:[]};
 resetPlanState({messages:[]} as unknown as Chat,plan,run);
 expect(fs.existsSync(file)).toBe(edited);
 if(edited)expect(fs.readFileSync(file,'utf8')).toBe('teacher edit');
 else expect(fs.readFileSync(run.resetBackup![0]!.to,'utf8')).toBe('generated');
});
it('reset starts at node one and preserves unproven files in a shared directory',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-reset-'));roots.push(dir);
 const input=path.join(dir,'input.txt'),output=path.join(dir,'partial.txt');fs.writeFileSync(input,'source');
 const w=normalizeWorkflow({name:'Reset',folder:dir,steps:[{id:'a',prompt:'!bien $x = 1\nFirst',access:'full'},{id:'b',prompt:'Second',access:'full'}]});
 let fail=true;const calls:string[]=[];
 const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async text=>{calls.push(text);if(text.startsWith('First')){expect(fs.existsSync(output)).toBe(!fail);fs.writeFileSync(output,'partial');}if(fail)throw Error('network disconnected');return 'done';}});
 expect((await runner.run(w.id)).status).toBe('error');
 await expect(runner.run(w.id,true)).rejects.toThrow('trạng thái biến');
 fail=false;calls.length=0;
 const fresh=await runner.run(w.id,false,undefined,undefined,true);
 expect(fresh.status).toBe('success');expect(calls).toHaveLength(2);expect(calls[0]).toMatch(/^First/);
 expect(fs.readFileSync(input,'utf8')).toBe('source');expect(w.runs[1]!.resetBackup).toBeTruthy();
 expect(w.runs[1]!.steps[0]!.error).toContain('network disconnected');
});
it('clears Plan recovery gates and dependencies while preserving the historical run',()=>{
 const plan:Plan={id:'p',chatId:'c',title:'Plan',approved:true,steps:[
  {id:'a',goal:'A',task:'A',files:[],risk:'',status:'error',output:'partial',error:'network',checkpoint:{runId:'r',revision:0,at:1,inputs:{},before:[],messageId:'m'}},
  {id:'b',goal:'B',task:'B',files:[],risk:'',dependsOn:['a'],status:'blocked',error:'missing',replacements:{a:'stale'}},
 ]};
 const chat={messages:[{id:'m',actions:[{id:'action',state:'pending'}]}]} as Chat;
 const old:WorkflowRun={id:'r',startedAt:1,status:'error',steps:[{stepId:'a',name:'A',status:'error',error:'network'}]};
 resetPlanState(chat,plan,old);
 expect(plan.steps.map(s=>s.status)).toEqual(['waiting','waiting']);
 expect(plan.steps[0]!.checkpoint).toBeUndefined();expect(plan.steps[1]!.replacements).toBeUndefined();
 expect(chat.messages[0]!.actions![0]!.state).toBe('declined');expect(old.steps[0]!.error).toBe('network');
});
it('archives generated files reversibly but preserves inputs and symlink targets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-reset-'));roots.push(dir);
 const input=path.join(dir,'input'),output=path.join(dir,'output'),link=path.join(dir,'link');
 fs.writeFileSync(input,'original');fs.writeFileSync(output,'generated');fs.symlinkSync(input,link);
 const real=fs.realpathSync(output);
 const run:WorkflowRun={id:'r',status:'error',startedAt:1,steps:[],generatedFiles:[input,real,link],generatedFileHashes:{[real]:markFiles([real])[0]!.hash!}};
 archiveWorkflowFiles(run,[input]);
 expect(fs.existsSync(output)).toBe(false);expect(fs.readFileSync(run.resetBackup![0]!.to,'utf8')).toBe('generated');
 expect(fs.readFileSync(input,'utf8')).toBe('original');expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
});
it('records partial files after cancellation and refuses reset while a run is active',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-reset-'));roots.push(dir);
 const file=path.join(dir,'cancelled.txt');
 const w=normalizeWorkflow({name:'Stop',folder:dir,steps:[{id:'a',prompt:'Write',access:'full'}]});
 let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 let wait=true;
 const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async(_t,_s,signal)=>{
  expect(fs.existsSync(file)).toBe(!wait);fs.writeFileSync(file,'partial');started();
  if(wait)await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return 'done';
 }});
 const running=runner.run(w.id);await ready;
 await expect(runner.run(w.id,false,undefined,undefined,true)).rejects.toThrow('đang chạy');
 runner.cancel(w.id);expect((await running).status).toBe('cancelled');
 wait=false;expect((await runner.run(w.id,false,undefined,undefined,true)).status).toBe('success');
 expect(w.runs[1]!.resetBackup).toHaveLength(0);
});
