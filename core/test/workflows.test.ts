import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows.js';
import {claudeBackend} from '../src/backends/claude.js';
import {codexBackend} from '../src/backends/codex.js';
import {agyBackend} from '../src/backends/agy.js';
import type {Workflow} from '../src/desktop/types.js';

function setup(opts:{fail?:string;delay?:number}={}){
 const list:Workflow[]=[];const calls:{text:string;choice:unknown;run?:{permission:string}}[]=[];
 const runner=new WorkflowRunner({list:()=>list,changed:()=>{},model:async(text,_s,signal,choice,run)=>{
  calls.push({text,choice,run});
  if(opts.delay)await new Promise((ok,no)=>{const t=setTimeout(ok,opts.delay);signal.addEventListener('abort',()=>{clearTimeout(t);no(signal.reason);});});
  if(opts.fail&&text.includes(opts.fail))throw Error('boom');
  return 'OUT:'+text.slice(0,12);
 }});
 const wf=normalizeWorkflow({name:'T',folder:'/tmp',steps:[{name:'a',prompt:'alpha',choice:{backend:'claude',model:'m1'},access:'full'},{name:'b',prompt:'beta {{prev}}'},{name:'c',prompt:'gamma'}]});
 list.push(wf);return {runner,wf,calls};
}

describe('workflows',()=>{
 it('keeps project identity in model calls even when no working folder is selected',async()=>{
  const {runner,wf,calls}=setup();wf.folder=undefined;wf.projectId='project-a';wf.steps.forEach(s=>s.access='read');
  expect((await runner.run(wf.id)).status).toBe('success');
  for(const call of calls)expect(call.run).toMatchObject({projectId:'project-a',permission:'read'});
 });
 it.each(['chat','prompt'] as const)('chạy với đầu vào %s mà không cần thư mục',async kind=>{
  const {runner,wf,calls}=setup();wf.folder=undefined;
  wf.steps.forEach(s=>s.access='read');
  wf.input={kind,value:'Soạn bài về lực. Giữ nguyên {{prev}} trong dữ liệu.'};
  wf.steps[0]!.prompt='Yêu cầu: {{input}}';
  expect((await runner.run(wf.id)).status).toBe('success');
  expect(calls[0]!.text).toBe('Yêu cầu: '+wf.input.value);
  expect(calls[1]!.text).toContain(wf.input.value);
  expect(calls.every(c=>!c.run?.cwd&&c.run?.permission==='read'&&c.run?.unlimited===true)).toBe(true);
  expect(normalizeWorkflow(wf).input).toEqual(wf.input);
 });
 it('đọc nội dung một tệp và báo lỗi nếu tệp không còn tồn tại',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-workflow-'));
  try{
   const file=path.join(dir,'input.md');fs.writeFileSync(file,'Bài học: lực ma sát.');
   const {runner,wf,calls}=setup();wf.folder=undefined;wf.steps.forEach(s=>s.access='read');wf.input={kind:'file',value:file};
   expect((await runner.run(wf.id)).status).toBe('success');expect(calls[0]!.text).toContain('Bài học: lực ma sát.');
   fs.unlinkSync(file);await expect(runner.run(wf.id)).rejects.toThrow();
   expect(wf.runs[0]!.status).toBe('error');expect(runner.isRunning(wf.id)).toBe(false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('dùng thư mục đầu vào làm thư mục chạy và kiểm tra đầu vào rỗng',async()=>{
  const {runner,wf,calls}=setup();wf.folder=undefined;wf.input={kind:'folder',value:os.tmpdir()};
  expect((await runner.run(wf.id)).status).toBe('success');expect(calls[0]!.run?.permission).toBe('full');
  wf.input={kind:'chat',value:'  '};await expect(runner.run(wf.id)).rejects.toThrow('Chưa nhập đầu vào');
  expect(()=>normalizeWorkflow({input:{kind:'chat',value:'a'.repeat(60_001)}})).toThrow('60.000');
 });
 it('chạy tuần tự, chuyển kết quả và đúng quyền từng nút',async()=>{
  const {runner,wf,calls}=setup();const r=await runner.run(wf.id);
  expect(r.status).toBe('success');
  expect(calls.map(c=>c.run?.permission)).toEqual(['full','read','read']);
  expect(calls[1]!.text.startsWith('beta OUT:alpha')).toBe(true);
  expect(calls[2]!.text).toContain('KẾT QUẢ BƯỚC TRƯỚC');
  expect(calls[0]!.choice).toEqual({backend:'claude',model:'m1'});
 });
 it('dừng khi lỗi và bỏ qua nút còn lại; continueOnError thì chạy tiếp',async()=>{
  const a=setup({fail:'beta'});expect((await a.runner.run(a.wf.id)).steps.map(s=>s.status)).toEqual(['success','error','skipped']);
  const b=setup({fail:'beta'});b.wf.steps[1]!.continueOnError=true;const r=await b.runner.run(b.wf.id);
  expect(r.steps.map(s=>s.status)).toEqual(['success','error','success']);expect(r.status).toBe('error');
 });
 it('dừng được giữa chừng',async()=>{
  const {runner,wf}=setup({delay:200});const p=runner.run(wf.id);await new Promise(r=>setTimeout(r,30));
  expect(runner.isRunning(wf.id)).toBe(true);runner.cancel(wf.id);
  expect((await p).status).toBe('cancelled');expect(runner.isRunning(wf.id)).toBe(false);
 });
 it('nút Chỉnh sửa cần thư mục; dữ liệu vào được làm sạch',async()=>{
  const {runner,wf}=setup();wf.folder=undefined;await expect(runner.run(wf.id)).rejects.toThrow(/thư mục/);
  const bad=normalizeWorkflow({name:'x'.repeat(500),steps:Array.from({length:50},()=>({choice:{backend:'evil',model:'x'}}))});
  expect(bad.name).toHaveLength(100);expect(bad.steps).toHaveLength(50);expect(bad.steps[0]!.choice).toBe('auto');
 });
});

describe('quyền ghi của CLI',()=>{
 const flat=(inv:{args:{flag:string;value?:string}[]})=>inv.args.flatMap(a=>a.value===undefined?[a.flag]:[a.flag,a.value]);
 it('Claude/Codex cần workspaceWrite; AGY luôn được tự duyệt công cụ',()=>{
  const base={model:'m',prompt:'p'};
  expect(flat(codexBackend.invocation({...base,permission:'full'}))).toContain('read-only');
  expect(flat(claudeBackend.invocation({...base,permission:'full'}))).not.toContain('Read,Edit,Write,Glob,Grep,Bash');
  expect(flat(agyBackend.invocation({...base,permission:'full'}))).toContain('--dangerously-skip-permissions');
  expect(flat(codexBackend.invocation({...base,permission:'read',workspaceWrite:true}))).toContain('workspace-write');
  const c=flat(claudeBackend.invocation({...base,permission:'read',workspaceWrite:true}));
  expect(c).toContain('--allowedTools');expect(c).toContain('Read,Edit,Write,Glob,Grep,Bash');
  expect(flat(agyBackend.invocation({...base,permission:'read',workspaceWrite:true}))).not.toContain('plan');
 });
 it('agy: prompt rỗng, ngắn và dài đều dùng NDJSON stdin, kể cả plain fallback',()=>{
  for(const prompt of ['', 'Câu hỏi ngắn', 'x'.repeat(200_000)]){
   const inv=agyBackend.invocation({model:'m',prompt,permission:'read',plain:true});
   expect(flat(inv)).not.toContain('-p');
   expect(flat(inv)).toEqual(expect.arrayContaining(['--input-format','--output-format','stream-json']));
   expect(JSON.parse(inv.stdin!)).toEqual({event:'user',message:{content:prompt}});
   expect(inv.stdin!.endsWith('\n')).toBe(true);
  }
 });
});
it('only lists result paths that exist, preserving paths with spaces',async()=>{
 const {workflowOutputFiles}=await import('../src/desktop/workflows');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-output-'));
 try{const file=path.join(dir,'Bài học.docx');fs.writeFileSync(file,'fixture');expect(workflowOutputFiles(`Kết quả: [Tệp](${file}) và \`${file}\`. Thiếu: \`${dir}/missing.xlsx\``)).toEqual([file]);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

describe('đa nhánh',()=>{
 function graph(){
  const wf=normalizeWorkflow({name:'Nhánh',mode:'parallel',maxConcurrency:2,steps:[
   {id:'a',name:'A',prompt:'A',dependsOn:[]},{id:'b',name:'B',prompt:'B',dependsOn:[]},
   {id:'c',name:'Gộp',prompt:'Gộp {{prev}}',dependsOn:['a','b']},
  ]});
  return wf;
 }
 it('chạy hai nhánh đồng thời, hợp nhất theo thứ tự phụ thuộc dù hoàn tất ngược',async()=>{
  const wf=graph(),calls:string[]=[];const pending=new Map<string,(v:string)=>void>();
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async text=>{calls.push(text);if(text.startsWith('Gộp'))return text;return new Promise(resolve=>pending.set(text,resolve));}});
  const task=runner.run(wf.id);await Promise.resolve();
  expect(calls).toEqual(['A','B']);pending.get('B')!('kết quả B');await Promise.resolve();expect(calls).toHaveLength(2);
  pending.get('A')!('kết quả A');const run=await task;
  expect(run.status).toBe('success');expect(calls[2]).toBe('Gộp [A]\nkết quả A\n\n[B]\nkết quả B');
 });
 it('quy tắc lõi tính một lần cho lượt chạy và có trong lời nhắc mọi bước',async()=>{
  const wf=graph(),systems:string[]=[];let made=0;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},coreRules:async()=>{made++;return '\nQUY TẮC LÕI THỬ';},model:async(text,system)=>{systems.push(system);return text;}});
  expect((await runner.run(wf.id)).status).toBe('success');
  expect(made).toBe(1);expect(systems).toHaveLength(3);for(const s of systems)expect(s.endsWith('\nQUY TẮC LÕI THỬ')).toBe(true);
 });
 it('nhánh lỗi không dừng nhánh độc lập; chạy lại giữ kết quả tốt',async()=>{
  const wf=graph(),calls:string[]=[];let fail=true;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async text=>{calls.push(text);if(text==='A'&&fail)throw Error('boom');return text;}});
  expect((await runner.run(wf.id)).steps.map(s=>s.status)).toEqual(['error','success','skipped']);
  fail=false;calls.length=0;expect((await runner.run(wf.id,true)).status).toBe('success');expect(calls).toHaveLength(2);expect(calls).not.toContain('B');
  expect(wf.runs[1]!.steps[0]!.status).toBe('error');
 });
 it('chạy lại bước tổng hợp nếu một nhánh lỗi được phép tiếp tục',async()=>{
  const wf=graph();wf.steps[0]!.continueOnError=true;let fail=true;const calls:string[]=[];
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async text=>{calls.push(text);if(text==='A'&&fail)throw Error('boom');return text;}});
  expect((await runner.run(wf.id)).steps.map(s=>s.status)).toEqual(['error','success','success']);
  fail=false;calls.length=0;await runner.run(wf.id,true);expect(calls).toHaveLength(2);expect(calls[1]).toContain('Gộp');
 });
 it('sau khi sửa nút, chạy lại chỉ chạy nút lỗi và nút sau, giữ kết quả nút trước',async()=>{
  const wf=graph(),calls:string[]=[];let fail=true;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async text=>{calls.push(text);if(text==='B'&&fail)throw Error('boom');return text;}});
  expect((await runner.run(wf.id)).steps.map(s=>s.status)).toEqual(['success','error','skipped']);
  fail=false;wf.steps[2]!.prompt='Gộp lại {{prev}}';calls.length=0;
  expect((await runner.run(wf.id,true)).status).toBe('success');
  expect(calls).toEqual(['B','Gộp lại [A]\nA\n\n[B]\nB']);
 });
 it('sửa nút đã thành công thì chạy lại kèm các nút sau nó, không dùng kết quả cũ',async()=>{
  const wf=graph(),calls:string[]=[];let fail=true;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async text=>{calls.push(text);if(text==='B'&&fail)throw Error('boom');return text;}});
  await runner.run(wf.id);fail=false;wf.steps[0]!.prompt='A2';calls.length=0;
  expect((await runner.run(wf.id,true)).status).toBe('success');
  expect(calls).toEqual(['A2','B','Gộp [A]\nA2\n\n[B]\nB']);
 });
 it.each([1,2,4])('giới hạn đồng thời %s và chạy độc quyền khi ghi',async limit=>{
  const wf=graph();wf.maxConcurrency=limit;wf.folder=os.tmpdir();wf.steps=Array.from({length:8},(_,i)=>({...wf.steps[0]!,id:String(i),access:i===3?'full':'read'}));
  let active=0,peak=0,writing=false;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async(_t,_s,_a,_c,run)=>{
   expect(writing).toBe(false);if(run?.permission==='full'){expect(active).toBe(0);writing=true;}
   active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;writing=false;return 'ok';
  }});
  expect((await runner.run(wf.id)).status).toBe('success');expect(peak).toBeLessThanOrEqual(limit);expect(peak).toBeGreaterThanOrEqual(Math.min(limit,2));
 });
 it('dừng tất cả nhánh và không khởi chạy bước tổng hợp',async()=>{
  const wf=graph();let count=0;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async(_t,_s,signal)=>{count++;return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  const task=runner.run(wf.id);await Promise.resolve();runner.cancel(wf.id);const run=await task;
  expect(run.status).toBe('cancelled');expect(count).toBe(2);expect(run.steps.map(s=>s.status)).toEqual(['error','error','skipped']);
 });
 it('kiểm tra vòng lặp, ID trùng, tham chiếu thiếu và tự chờ',()=>{
  for(const steps of [
   [{id:'a',dependsOn:['b']},{id:'b',dependsOn:['a']}],
   [{id:'a'},{id:'a'}],[{id:'a',dependsOn:['missing']}],[{id:'a',dependsOn:['a']}],
  ])expect(()=>normalizeWorkflow({mode:'parallel',steps})).toThrow();
 });
 it('lan truyền bỏ qua với danh sách không theo thứ tự phụ thuộc',async()=>{
  const wf=graph();wf.steps.reverse();wf.steps[1]!.dependsOn=['a'];
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async()=>{throw Error('boom');}});
  expect((await runner.run(wf.id)).steps.map(s=>s.status)).toEqual(['skipped','skipped','error']);
 });
});

it('cancellation of independent final branches stays cancelled',async()=>{
 const wf=normalizeWorkflow({mode:'parallel',steps:[{prompt:'A'},{prompt:'B'}]});
 const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},model:async(_t,_s,signal)=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
 const task=runner.run(wf.id);await Promise.resolve();runner.cancel(wf.id);expect((await task).status).toBe('cancelled');
});
it('a writing step blocks other workflows and cancelled lock waiters do not call AI',async()=>{
 const writer=normalizeWorkflow({folder:os.tmpdir(),steps:[{prompt:'write',access:'full'}]});
 const reader=normalizeWorkflow({steps:[{prompt:'read'}]});
 let finish!:(value:string)=>void;const calls:string[]=[];
 const runner=new WorkflowRunner({list:()=>[writer,reader],changed:()=>{},model:async text=>{calls.push(text);return new Promise(resolve=>finish=resolve);}});
 const writing=runner.run(writer.id);await Promise.resolve();const reading=runner.run(reader.id);await Promise.resolve();
 expect(calls).toEqual(['write']);runner.cancel(reader.id);expect((await reading).status).toBe('cancelled');
 finish('done');expect((await writing).status).toBe('success');expect(calls).toEqual(['write']);
});

it('loads a serialized legacy workflow without graph or contract fields and keeps sequential execution',async()=>{
 const {wf}=setup();delete wf.mode;delete wf.maxConcurrency;
 for(const step of wf.steps){delete step.dependsOn;delete step.inputs;delete step.outputs;delete step.completion;delete step.onError;}
 const restored:Workflow=JSON.parse(JSON.stringify(wf));
 const calls:string[]=[];
 const runner=new WorkflowRunner({list:()=>[restored],changed:()=>{},model:async text=>{calls.push(text);return 'Kết quả '+calls.length;}});
 const run=await runner.run(restored.id);
 expect(run.steps.map(s=>s.status)).toEqual(['success','success','success']);
 expect(calls[0]).toBe('alpha');expect(calls[1]).toBe('beta Kết quả 1');expect(calls[2]).toContain('Kết quả 2');
 expect(normalizeWorkflow(restored).mode).toBe('sequential');
 expect(restored.runs[0]).toBe(run);
});

it('persists only a boolean pin and preserves history when changing pin state',()=>{
 const old=normalizeWorkflow({name:'Pinned',pinned:true,steps:[]});
 old.runs=[{id:'run',startedAt:1,status:'success',steps:[]}];
 const saved=normalizeWorkflow({...old,pinned:false},old);
 expect(old.pinned).toBe(true);expect(saved.pinned).toBe(false);expect(saved.runs).toBe(old.runs);
 expect(normalizeWorkflow({pinned:'true'}).pinned).toBe(false);
});


describe('duyệt từng nấc',()=>{
 it('bước sau lỗi: sửa bước sau rồi chạy lại thì lấy lại kết quả bước trước, không gọi lại AI',async()=>{
  const opts:{fail?:string}={fail:'beta'};const {runner,wf,calls}=setup(opts);
  expect((await runner.run(wf.id)).steps.map(s=>s.status)).toEqual(['success','error','skipped']);
  expect(calls).toHaveLength(2);
  opts.fail=undefined;wf.steps[2]!.prompt='gamma sửa';calls.length=0;
  expect((await runner.run(wf.id,true)).steps.map(s=>s.status)).toEqual(['success','success','success']);
  expect(calls).toHaveLength(2);expect(calls[0]!.text).toContain('OUT:alpha');expect(calls[1]!.text).toContain('gamma sửa');
 });
 it('chỉ chạy nấc đã chọn, nối kết quả, giữ nguyên lịch sử và từ chối vượt nấc',async()=>{
  const {runner,wf,calls}=setup();const [a,b,c]=wf.steps;
  await expect(runner.run(wf.id,false,b!.id)).rejects.toThrow('các bước trước');expect(calls).toHaveLength(0);expect(wf.runs).toHaveLength(0);
  const first=await runner.run(wf.id,false,a!.id);const snapshot=JSON.stringify(first);
  expect(first.status).toBe('paused');expect(first.steps.map(s=>s.status)).toEqual(['success','waiting','waiting']);expect(calls).toHaveLength(1);
  await expect(runner.run(wf.id,false,c!.id)).rejects.toThrow('các bước trước');expect(wf.runs).toHaveLength(1);
  await expect(runner.run(wf.id,false,a!.id)).rejects.toThrow('đã hoàn tất');
  const second=await runner.run(wf.id,false,b!.id);expect(second.status).toBe('paused');expect(calls[1]!.text).toContain('OUT:alpha');expect(calls).toHaveLength(2);
  expect(JSON.stringify(first)).toBe(snapshot);expect((await runner.run(wf.id,false,c!.id)).status).toBe('success');expect(calls).toHaveLength(3);
 });
 it('nhánh độc lập vẫn phải duyệt riêng, hợp nhất chờ đủ nhánh và khóa yêu cầu trùng',async()=>{
  const {runner,wf,calls}=setup({delay:10});wf.mode='parallel';wf.steps[0]!.dependsOn=[];wf.steps[1]!.dependsOn=[];wf.steps[2]!.dependsOn=wf.steps.slice(0,2).map(s=>s.id);
  const task=runner.run(wf.id,false,wf.steps[1]!.id);
  await expect(runner.run(wf.id,false,wf.steps[1]!.id)).rejects.toThrow('đang chạy');await task;
  expect(calls).toHaveLength(1);await expect(runner.run(wf.id,false,wf.steps[2]!.id)).rejects.toThrow('các bước trước');
  await runner.run(wf.id,false,wf.steps[0]!.id);await runner.run(wf.id,false,wf.steps[2]!.id);expect(calls).toHaveLength(3);
 });
 it('không dùng kết quả cũ sau khi đổi đầu vào và không mất kết quả khi dừng nấc sau',async()=>{
  const {runner,wf,calls}=setup({delay:20});const first=await runner.run(wf.id,false,wf.steps[0]!.id);
  wf.input={kind:'chat',value:'Dữ liệu mới'};await expect(runner.run(wf.id,false,wf.steps[1]!.id)).rejects.toThrow('các bước trước');expect(wf.runs[0]).toBe(first);expect(calls).toHaveLength(1);
  delete wf.input;const task=runner.run(wf.id,false,wf.steps[1]!.id);await Promise.resolve();runner.cancel(wf.id);
  const cancelled=await task;expect(cancelled.steps[0]!.status).toBe('success');expect(cancelled.steps[2]!.status).toBe('waiting');expect(cancelled.status).toBe('cancelled');
 });
});
