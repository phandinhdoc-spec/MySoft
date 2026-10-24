import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LearningSignals,signalGroup,signalText,signalHash,type SignalInput} from '../src/desktop/learning-signals';
import {DesktopRuntime} from '../src/desktop/runtime';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows';
vi.mock('../src/refs',async importOriginal=>({...await importOriginal<typeof import('../src/refs')>(),ddg:vi.fn(async()=>[{url:'https://example.org/source',title:'Source'}]),fetchRefText:vi.fn(async()=>({text:'Retrieved text',truncated:true}))}));
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
const models=[{backend:'api' as const,model:'openai/mock-mini'}];
const input:SignalInput={group:'planning',kind:'draft',chatId:'chat-a',sourceId:'message-a',outcome:'unverified',text:'Bản nháp chưa chạy.'};
function root(){const p=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-signals-'));roots.push(p);return p;}
function inbox(){return new LearningSignals(path.join(root(),'signals.json'));}
function runtime(){const r=new DesktopRuntime(()=>{},root());runtimes.push(r);return r;}
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));vi.restoreAllMocks();});
it('uses explicit context and isolates ambiguous context',()=>{
 expect(signalGroup({planning:true})).toBe('planning');expect(signalGroup({workflow:true})).toBe('workflow');expect(signalGroup({research:true})).toBe('research');
 expect(signalGroup({planning:true,workflow:true})).toBe('unclassified');expect(signalGroup({})).toBe('unclassified');
});
it('retains unknown research subtype for classification without invoking AI',async()=>{
 const q=inbox();q.capture({...input,group:'research',kind:'read'});q.capture({...input,group:'unclassified'});
 const extract=vi.fn();expect(await q.process(models,new AbortController().signal,()=>true,extract)).toBe('empty');expect(extract).not.toHaveBeenCalled();expect(q.all().every(x=>x.status==='unclassified')).toBe(true);
});
it('draft and feedback cannot claim execution success; read is not factual verification',()=>{
 const q=inbox();for(const kind of ['draft','feedback','search','read'] as const)q.capture({...input,kind,outcome:'succeeded'});
 expect(q.all().map(x=>x.outcome)).toEqual(['unverified','unverified','unverified','unverified']);
 q.capture({...input,kind:'execution',outcome:'failed',runId:'run',stepId:'step'});expect(q.all().at(-1)?.outcome).toBe('failed');
});
it('deduplicates source observations across restart but never merges chats or runs',()=>{
 const q=inbox();expect(q.capture(input)).toBe(true);expect(q.capture(input)).toBe(false);
 const next=new LearningSignals(q.file);expect(next.capture(input)).toBe(false);expect(next.capture({...input,chatId:'chat-b'})).toBe(true);
 for(const runId of ['run1','run2'])next.capture({...input,kind:'execution',runId});expect(next.all()).toHaveLength(4);
});
it('redacts contacts, paths and secrets before persistence',()=>{
 const q=inbox();q.capture({...input,text:'a@example.com https://private.test/a?key=x /Users/name/private.docx C:\\Users\\name\\secret.txt token=abc sk-privatekey'});
 const raw=fs.readFileSync(q.file,'utf8');for(const secret of ['a@example.com','private.test','private.docx','secret.txt','abc','sk-privatekey'])expect(raw).not.toContain(secret);
 expect(signalText('0351234567')).toContain('[sđt]');
});
it('keeps a pending item without a light model and yields to foreground work',async()=>{
 const q=inbox();q.capture(input);const extract=vi.fn();
 expect(await q.process([],new AbortController().signal,()=>true,extract)).toBe('missing-model');
 expect(await q.process(models,new AbortController().signal,()=>false,extract)).toBe('deferred');expect(extract).not.toHaveBeenCalled();expect(q.all()[0]).toMatchObject({status:'pending',retries:0});
});
it('interrupts without spending retries and resumes after restart; late result is ignored',async()=>{
 const q=inbox();q.capture(input);const ctl=new AbortController();
 expect(await q.process(models,ctl.signal,()=>true,async()=>{ctl.abort();return '{"rule":"Không dùng bản nháp như kết quả."}';})).toBe('interrupted');
 expect(q.all()[0]).toMatchObject({status:'interrupted',retries:0});expect(q.all()[0]?.proposal).toBeUndefined();
 const next=new LearningSignals(q.file);await next.process(models,new AbortController().signal,()=>true,async()=>'{"rule":"Phân biệt bản nháp và kết quả."}');
 expect(next.all()[0]?.proposal).toEqual({status:'proposed',rule:'Phân biệt bản nháp và kết quả.'});
});
it('persists retries and does not batch conversations or accept model-selected group',async()=>{
 const q=inbox();q.capture(input);q.capture({...input,chatId:'chat-b',sourceId:'other',text:'Không được gửi cùng lượt.'});
 const extract=vi.fn(async(prompt:string)=>{expect(prompt).not.toContain('Không được gửi cùng lượt');return '{"rule":"Đối chiếu trước khi chạy.","group":"chat","status":"active"}';});
 await q.process(models,new AbortController().signal,()=>true,extract);expect(q.all()[0]).toMatchObject({group:'planning',proposal:{status:'proposed'}});expect(q.all()[1]?.status).toBe('pending');
 for(let i=0;i<3;i++)await q.process(models,new AbortController().signal,()=>true,async()=>'{broken');
 const next=new LearningSignals(q.file);expect(next.pending()).toBe(false);expect(next.all()[1]?.retries).toBe(3);next.retry();expect(next.pending()).toBe(true);
});
it('recovers a running observation and refuses corrupt inbox without overwriting it',()=>{
 const q=inbox();q.capture(input);const data=JSON.parse(fs.readFileSync(q.file,'utf8'));data.items[0].status='running';fs.writeFileSync(q.file,JSON.stringify(data));
 expect(new LearningSignals(q.file).all()[0]?.status).toBe('interrupted');fs.writeFileSync(q.file,'broken');expect(()=>new LearningSignals(q.file)).toThrow();expect(fs.readFileSync(q.file,'utf8')).toBe('broken');
});
it('routes functional feedback away from Chat and prevents legacy reflection activation',async()=>{
 const r=runtime();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});const c=r.store.data.chats[0]!;c.planningSession='plan';r.store.data.preferences.reflect=true;
 const model=vi.spyOn(r as any,'model').mockResolvedValue('{"rule":"Tách dữ kiện và giả định."}');
 await r.dispatch({id:'feedback',method:'feedback',params:{chatId,text:'Lần sau tách dữ kiện và giả định'}});
 expect((r as any).learningQueue).toHaveLength(0);expect((r as any).signals.all()[0]).toMatchObject({group:'planning',kind:'feedback'});
 await (r as any).reflectNow(chatId,true);expect(model).not.toHaveBeenCalled();
 r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});await (r as any).learnNext();
 expect(r.store.data.learned).toEqual([]);expect((r as any).signals.all()[0].proposal.status).toBe('proposed');
});
it('captures an actual planning turn as draft even when the model says completed',async()=>{
 const r=runtime();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});
 vi.spyOn(r as any,'ask').mockResolvedValue({id:'reply',role:'assistant',text:'Đã hoàn thành mọi việc.',at:Date.now()});
 vi.spyOn(r as any,'scheduleSummary').mockImplementation(()=>{});vi.spyOn(r as any,'scheduleTitle').mockImplementation(()=>{});vi.spyOn(r as any,'selfWarm').mockImplementation(()=>{});
 await r.dispatch({id:'send',method:'send',params:{chatId,text:'Hãy nhớ tách giả định.',plan:true}});
 const items=(r as any).signals.all();expect(items.some((x:any)=>x.group==='planning'&&x.kind==='draft'&&x.outcome==='unverified')).toBe(true);expect((r as any).learningQueue).toHaveLength(0);
});
it('workflow runner emits terminal evidence for success, failure and cancellation',async()=>{
 const wf=normalizeWorkflow({name:'test',steps:[{id:'a',name:'a',prompt:'hello',access:'read'}]});const observed=vi.fn(),started=vi.fn();let mode='success';let runner:WorkflowRunner;
 runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},started,observed,model:async()=>{if(mode==='error')throw Error('failure');if(mode==='cancel')runner.cancel(wf.id);return 'answer';}});
 await runner.run(wf.id);expect(observed.mock.calls[0]?.[2].status).toBe('success');
 mode='error';await runner.run(wf.id);expect(observed.mock.calls[1]?.[2].status).toBe('error');
 mode='cancel';await runner.run(wf.id);expect(observed.mock.calls[2]?.[3]).toBe(true);expect(started).toHaveBeenCalledTimes(3);
});
it('captures search and read separately and keeps research corrections out of Chat',async()=>{
 const r=runtime();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});
 vi.spyOn(r as any,'scheduleSummary').mockImplementation(()=>{});vi.spyOn(r as any,'scheduleTitle').mockImplementation(()=>{});vi.spyOn(r as any,'selfWarm').mockImplementation(()=>{});
 vi.spyOn(r as any,'model')
  .mockResolvedValueOnce('```pvta-read\n{"tool":"office_web_search","args":{"query":"public topic"}}\n```')
  .mockResolvedValueOnce('```pvta-read\n{"tool":"office_web_read","args":{"url":"https://example.org/source"}}\n```')
  .mockResolvedValue('Đây là phần tóm tắt.');
 await r.dispatch({id:'send',method:'send',params:{chatId,text:'Lần sau tìm và đối chiếu nguồn.'}});
 const items=(r as any).signals.all();expect(items.filter((x:any)=>x.kind==='search'||x.kind==='read')).toHaveLength(2);
 expect(items.every((x:any)=>x.group==='research'&&x.outcome==='unverified'&&x.status==='unclassified')).toBe(true);
 expect((r as any).learningQueue).toHaveLength(0);
 await r.dispatch({id:'feedback',method:'feedback',params:{chatId,text:'Lần sau đọc bản gốc.'}});
 expect((r as any).signals.all().at(-1)).toMatchObject({group:'research',kind:'feedback',status:'unclassified'});
});
it('deduplicates proposals in the same scope while preserving every evidence source',async()=>{
 const q=inbox();for(const [sourceId,chatId] of [['one','chat-a'],['two','chat-a'],['three','chat-b']])q.capture({...input,sourceId:sourceId!,chatId});
 for(let i=0;i<3;i++)await q.process(models,new AbortController().signal,()=>true,async()=>'{"rule":"Đối chiếu trước khi chạy."}');
 const rows=new LearningSignals(q.file).all();expect(rows).toHaveLength(3);expect(rows[1]?.duplicateOf).toBe(rows[0]?.id);expect(rows[1]?.proposal).toBeUndefined();expect(rows[2]?.proposal).toBeDefined();
});
it.each(['legal','news','professional'] as const)('keeps research subtype %s without accepting factual claims from retrieved text',async researchSubtype=>{
 const q=inbox();q.capture({...input,group:'research',kind:'read',researchSubtype,outcome:'succeeded'});
 await q.process(models,new AbortController().signal,()=>true,async prompt=>{expect(JSON.parse(prompt)).toMatchObject({researchSubtype,outcome:'unverified'});return '{"rule":"Đối chiếu nguồn trước khi sử dụng."}';});
 expect(q.all()[0]).toMatchObject({group:'research',researchSubtype,proposal:{status:'proposed'}});
});
it('fails closed on inbox write error rather than rerouting functional evidence to Chat',async()=>{
 const r=runtime();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});r.store.data.chats[0]!.planningSession='plan';
 vi.spyOn((r as any).signals,'capture').mockImplementation(()=>{throw Error('disk');});
 expect(await r.dispatch({id:'feedback',method:'feedback',params:{chatId,text:'Lần sau tách dữ kiện.'}})).toEqual({queued:false});
 delete r.store.data.chats[0]!.planningSession;
 expect(await r.dispatch({id:'again',method:'feedback',params:{chatId,text:'Lần sau đọc nguồn.'}})).toEqual({queued:false});
 expect((r as any).learningQueue).toHaveLength(0);expect(r.view().learning?.message).toContain('Không lưu được tín hiệu');
});

it('does not discard a classified research observation after an unresolved observation',()=>{
 const q=inbox();const observation={...input,group:'research' as const,kind:'read' as const};
 q.capture(observation);expect(q.capture({...observation,researchSubtype:'legal'})).toBe(true);
 const restored=new LearningSignals(q.file);
 expect(restored.capture(observation)).toBe(false);
 expect(restored.capture({...observation,researchSubtype:'legal'})).toBe(false);
 expect(restored.all().map(x=>x.status)).toEqual(['unclassified','pending']);
});

it('recognizes subtype observations saved with the previous inbox key format',()=>{
 const q=inbox();const observation={...input,group:'research' as const,kind:'read' as const,researchSubtype:'legal' as const};
 q.capture(observation);
 const data=JSON.parse(fs.readFileSync(q.file,'utf8'));
 data.items[0].key=signalHash(JSON.stringify([observation.group,observation.kind,observation.chatId,undefined,undefined,undefined,undefined,undefined,observation.sourceId,undefined,observation.outcome]));
 fs.writeFileSync(q.file,JSON.stringify(data));
 expect(new LearningSignals(q.file).capture(observation)).toBe(false);
});

it('keeps a research turn inside Plan unclassified, including subsequent feedback',async()=>{
 const r=runtime();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});
 const chat=r.store.data.chats[0]!;chat.planningSession='plan';
 chat.messages.push({id:'plan-user',role:'user',text:'Tìm nguồn cho kế hoạch.',at:Date.now()});
 // Exercise the real read-tool loop without the unrelated Plan drafting harness.
 vi.spyOn(r as any,'model')
  .mockResolvedValueOnce('```pvta-read\n{"tool":"office_web_search","args":{"query":"public topic"}}\n```')
  .mockResolvedValue('Bản nháp tham khảo.');
 await (r as any).ask(chat,'Tìm nguồn cho kế hoạch.',false,new AbortController().signal,'request');
 const rows=(r as any).signals.all();
 expect(rows[0]).toMatchObject({group:'unclassified',kind:'search',status:'unclassified',outcome:'unverified'});
 await r.dispatch({id:'feedback',method:'feedback',params:{chatId,text:'Lần sau đối chiếu bản gốc.'}});
 expect((r as any).signals.all().at(-1)).toMatchObject({group:'unclassified',kind:'feedback',status:'unclassified'});
 expect((r as any).learningQueue).toHaveLength(0);
});

it('keeps ordinary Chat feedback on the legacy queue and excludes old Plan results from reflection',async()=>{
 const r=runtime();const chatId=await r.dispatch({id:'new',method:'newChat',params:{}});
 const chat=r.store.data.chats[0]!;
 chat.messages.push({id:'old',role:'assistant',text:'Kế hoạch cũ',at:1,plan:{title:'PRIVATE PLAN',steps:[]} as any});
 chat.messages.push({id:'current',role:'user',text:'Lần sau trả lời ngắn hơn.',at:2});
 await r.dispatch({id:'feedback',method:'feedback',params:{chatId,text:'Lần sau trả lời ngắn hơn.'}});
 expect((r as any).learningQueue).toHaveLength(1);
 expect((r as any).signals.all()).toHaveLength(0);
 expect((r as any).reflectDigest(chat)).not.toContain('PRIVATE PLAN');
});
