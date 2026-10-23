import {failedTasks} from '../src/desktop/task-failure';
import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {editPlanSteps,linkPlan,validatePlan} from '../src/desktop/plans';
import type {Plan,Workflow} from '../src/desktop/types';
const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.forEach(r=>r.dispose());runtimes.length=0;roots.forEach(p=>fs.rmSync(p,{recursive:true,force:true}));roots.length=0;vi.restoreAllMocks();vi.useRealTimers();});
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const result=(text:string)=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}});
function setup(home?:string, emit:ConstructorParameters<typeof DesktopRuntime>[0]=()=>{}){const dir=home??fs.mkdtempSync(path.join(os.tmpdir(),'pvta-plan-'));if(!home)roots.push(dir);const r=new DesktopRuntime(emit,dir);runtimes.push(r);r.store.data.preferences.choice={backend:'api',model:'mock/mini'};return {r,dir,spy:vi.spyOn(r.engine,'run')};}
async function plan(r:DesktopRuntime){const chatId=await req(r,'newChat') as string;const p:Plan={id:'plan',chatId,title:'Giáo án',revision:0,approved:false,steps:['Tìm hiểu','Soạn','Kiểm tra'].map((goal,i)=>({id:'s'+i,goal,task:'Nhiệm vụ '+i,files:[],risk:'',status:'waiting'}))};r.store.data.chats[0]!.messages.push({id:'m',role:'assistant',text:'',at:1,plan:p});linkPlan(p,r.store.data.workflows??=[]);return p;}
it('links plans idempotently and edits preserve only the completed unchanged prefix',()=>{const p:Plan={id:'p',chatId:'c',title:'P',approved:true,steps:[0,1,2].map(i=>({id:''+i,goal:'G'+i,task:'T'+i,files:[],risk:'',status:'done',output:'saved'}))};const list:Workflow[]=[];linkPlan(p,list);linkPlan(p,list);expect(list).toHaveLength(1);editPlanSteps(p,p.steps.map((s,i)=>({...s,task:i===1?'changed':s.task})));expect(p.steps.map(s=>s.status)).toEqual(['done','waiting','waiting']);expect(p.steps[2]?.output).toBeUndefined();expect(p.approved).toBe(false);});
it('runs the actual task, stores results and resumes after explicit skip without repeating done work',async()=>{const {r,spy}=setup();const p=await plan(r);spy.mockImplementation(async o=>{if(/Tóm tắt|Đặt một tên/.test(o.system??''))return result('summary');const prompt=o.buildPrompt?.(false,false)??'';if(prompt.includes('NHIỆM VỤ HIỆN TẠI ĐÃ DUYỆT:\nThực hiện bước đã duyệt: Nhiệm vụ 1'))throw Error('mất wifi');return result('kết quả bước');});await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['done','error','blocked']);expect(failedTasks(r.store.data.chats)[0]).toMatchObject({targetId:`plan-${p.id}-s1`,reason:'mất wifi'});expect(r.store.data.workflows![0]!.runs[0]!.steps[0]!.output).toBe('kết quả bước');await req(r,'skipPlanStep',{id:p.id,stepId:'s1'});await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['done','skipped','blocked']);await req(r,'replacePlanInput',{id:p.id,revision:0,stepId:'s2',dependencyId:'s1',value:'Dữ liệu thay thế đã kiểm tra'});await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['done','skipped','done']);expect(failedTasks(r.store.data.chats)).toEqual([]);expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(3);});
it('recovers interrupted steps and completed output on restart',async()=>{const {r,dir}=setup();const p=await plan(r);p.steps[0]!.status='done';p.steps[0]!.output='đã lưu';p.steps[1]!.status='running';r.store.save();const second=setup(dir).r;const recovered=second.store.data.chats[0]!.messages[0]!.plan!;expect(recovered.steps[0]!.output).toBe('đã lưu');expect(recovered.steps[1]!.status).toBe('interrupted');expect(second.store.data.workflows).toHaveLength(1);});
it('rejects stale popup edits, skipping unfinished work and out of order execution',async()=>{const {r}=setup();const p=await plan(r);await req(r,'editPlan',{id:p.id,revision:0,steps:p.steps});await expect(req(r,'editPlan',{id:p.id,revision:0,steps:p.steps})).rejects.toThrow('cửa sổ khác');await expect(req(r,'skipPlanStep',{id:p.id,stepId:'s0'})).rejects.toThrow('Chỉ bỏ qua');await expect(req(r,'runPlan',{id:p.id,stepId:'s2'})).rejects.toThrow('các bước trước');});
it('workflow edits update the same plan and deletion preserves the plan without recreating the workflow on restart',async()=>{const {r,dir}=setup();const p=await plan(r);const w=r.store.data.workflows![0]!;await req(r,'workflowSave',{workflow:{...w,planRevision:p.revision??0,steps:w.steps.map(s=>({...s,prompt:'changed'}))}});expect(p.steps[0]!.task).toBe('changed');await req(r,'workflowDelete',{id:w.id});expect(r.store.data.workflows).toHaveLength(0);expect(p.workflowHidden).toBe(true);expect(p.steps[0]!.task).toBe('changed');const restored=setup(dir).r;expect(restored.store.data.workflows).toHaveLength(0);expect(restored.store.data.chats[0]!.messages[0]!.plan?.workflowHidden).toBe(true);});
it('makes plan web search available and preserves failed verification in model context',async()=>{const {r,spy}=setup();const id=await req(r,'newChat');vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('offline'));spy.mockResolvedValueOnce(result('```pvta-read\n{"tool":"office_web_search","args":{"query":"5512 phụ lục giáo án"}}\n```')).mockResolvedValue(result('Chưa xác minh nguồn. Thầy cô dạy lớp nào?'));await req(r,'send',{chatId:id,text:'Soạn giáo án',plan:true});expect(spy.mock.calls[0]![0].system).toContain('đối tượng học sinh');expect(spy.mock.calls[1]![0].buildPrompt?.(false,false)).toContain('mạng không khả dụng');});
it('manual refinement runs inside the open app even with schedule disabled',async()=>{const {r}=setup();r.store.data.preferences.refine={enabled:false,time:'22:30',everyDays:1,model:'auto'};const out=await req(r,'runRefineNow') as any;expect(out.state).toBe('done');expect(r.view().refine.running).toBe(false);expect(r.store.data.preferences.refine.enabled).toBe(false);});
it('keeps pending learning across restart and reports missing lightweight models',async()=>{const {r,dir}=setup();const id=await req(r,'newChat');await req(r,'feedback',{chatId:id,text:'Lần sau dùng chữ đen'});await (r as any).learnNext();expect(r.view().learning?.message).toContain('AI nhẹ');expect(r.view().learning?.pending).toBe(1);const second=setup(dir).r;expect(second.view().learning?.pending).toBe(1);});
it('shows a learned skill as a proposal without installing it',async()=>{const {r,spy}=setup();r.config.set({api:{openai:{key:'test',model:'mock-mini'}}});const id=await req(r,'newChat');spy.mockResolvedValue(result(JSON.stringify({rule:'',skill:{name:'learned-kiem-tra-bang',description:'Khi kiểm tra bố cục bảng giáo dục',body:'Xác định hàng tiêu đề. Kiểm tra đơn vị của từng cột. Đối chiếu dòng tổng trước khi hoàn tất.'}})));await req(r,'feedback',{chatId:id,text:'Hãy nhớ quy trình kiểm tra bảng'});await (r as any).learnNext();expect(r.view().data.learnedDrafts?.[0]).toMatchObject({name:'learned-kiem-tra-bang',status:'proposed'});expect(fs.existsSync(path.join(r.skills.dir,'learned-kiem-tra-bang','SKILL.md'))).toBe(false);});

const survey=()=>({objective:'Soạn bài theo mục tiêu',topic:'Bài X',documentType:'Giáo án',subject:'KHTN',grade:'8',output:'Giáo án 2 tiết, có đánh giá',facts:['Người dùng: lớp 8, hai tiết, trình độ hỗn hợp'],proposals:['Thảo luận nhóm để giải thích hiện tượng'],assumptions:['Có thể dùng phiếu giấy'],questions:[],sources:[{title:'Tài liệu của lớp',locator:'bai.md [Đoạn 1]',accessedOn:'2026-10-19',scope:'Mục tiêu bài X lớp 8',status:'read'}],limitations:['Chưa xác minh hướng dẫn địa phương']});
const planAnswer=(brief:unknown)=>'```pvta-plan\n'+JSON.stringify({title:'Bài X',brief,steps:[{goal:'Soạn',task:'Soạn và đối chiếu mục tiêu',files:[],risk:''}]})+'\n```';
it('requires a survey and does not create a workflow for an unsurveyed plan',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');spy.mockResolvedValue(result(planAnswer(undefined)));
 const message=await req(r,'send',{chatId:id,text:'Soạn giáo án',plan:true}) as any;
 expect(message.plan).toBeUndefined();expect(message.text).toContain('Thiếu khảo sát');expect(r.store.data.workflows??[]).toHaveLength(0);
});
it('asks unresolved material questions instead of exposing an approvable plan',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');spy.mockResolvedValue(result(planAnswer({...survey(),questions:['Thầy cô dạy trong bao nhiêu tiết?']})));
 const message=await req(r,'send',{chatId:id,text:'Soạn giáo án',plan:true}) as any;
 expect(message.plan).toBeUndefined();expect(message.text).toContain('bao nhiêu tiết');expect(r.store.data.workflows??[]).toHaveLength(0);
});
it('persists an editable survey with source provenance and passes it to execution',async()=>{
 const {r,spy,dir}=setup();const id=await req(r,'newChat');spy.mockResolvedValue(result(planAnswer(survey())));
 const message=await req(r,'send',{chatId:id,text:'Lập kế hoạch bài X',plan:true}) as any;
 expect(message.plan.context).toContain('### Dữ kiện');expect(message.plan.context).toContain('### Giả định');expect(message.plan.context).toContain('2026-10-19');expect(message.plan.context).toContain('Mục tiêu bài X lớp 8');
 const second=setup(dir).r;expect(second.store.data.chats[0]!.messages.find(m=>m.plan)?.plan?.context).toBe(message.plan.context);
 await req(r,'editPlan',{id:message.plan.id,steps:message.plan.steps,context:message.plan.context+'\nĐiều chỉnh: 3 tiết',revision:0});
 spy.mockResolvedValue(result('Đã soạn'));await req(r,'runPlan',{id:message.plan.id});
 expect(spy.mock.calls.some(([o])=>o.buildPrompt?.(false,false).includes('Điều chỉnh: 3 tiết'))).toBe(true);
});
it('rejects sources without scope or valid access dates but allows explicit unverified sources',async()=>{
 const {planSurveyContext}=await import('../src/desktop/plans');const b=survey();
 expect(()=>planSurveyContext({...b,sources:[{...b.sources[0],scope:''}]})).toThrow('phạm vi');
 expect(()=>planSurveyContext({...b,sources:[{...b.sources[0],accessedOn:'2026-02-30'}]})).toThrow('ngày truy cập');
 expect(planSurveyContext({...b,sources:[{...b.sources[0],status:'unverified',accessedOn:''}]}).context).toContain('Chưa truy cập');
 expect(planSurveyContext({...b,subject:'Không áp dụng',grade:'Không áp dụng',sources:[]}).context).toContain('Không áp dụng');
});

function contracted(p:Plan){p.steps=p.steps.map((s,i)=>({...s,inputs:['Thông tin người dùng'],outputs:['Sản phẩm '+i],completion:'Đối chiếu mục tiêu',onError:'Dừng và hỏi',dependsOn:i?[p.steps[i-1]!.id]:[]}));return p;}
it('blocks approval for cycles, dangling dependencies, missing inputs and conflicting outputs before model execution',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));
 p.steps[0]!.dependsOn=['s2'];await expect(req(r,'runPlan',{id:p.id})).rejects.toThrow('vòng');
 p.steps[0]!.dependsOn=['deleted'];await expect(req(r,'runPlan',{id:p.id})).rejects.toThrow('không tồn tại');
 p.steps[0]!.dependsOn=[];p.steps[1]!.inputs=[];await expect(req(r,'runPlan',{id:p.id})).rejects.toThrow('đầu vào');
 p.steps[1]!.inputs=['Có dữ liệu'];p.steps[1]!.dependsOn=[];p.steps[1]!.outputs=p.steps[0]!.outputs;
 await expect(req(r,'runPlan',{id:p.id})).rejects.toThrow('Xung đột');expect(spy).not.toHaveBeenCalled();expect(p.approved).toBe(false);expect(r.store.data.workflows![0]!.runs).toHaveLength(0);
 p.steps[1]!.dependsOn=['s0'];expect(validatePlan(p).map(s=>s.id)).toEqual(['s0','s1','s2']);
});
it('preserves every contract through both edit routes, rejects stale writes and archives versions',async()=>{
 const {r}=setup();const p=contracted(await plan(r));linkPlan(p,r.store.data.workflows!);
 await req(r,'editPlan',{id:p.id,revision:0,steps:p.steps.map(s=>({...s,completion:'Đạt mục tiêu mới'}))});
 const w=r.store.data.workflows![0]!;expect(w.steps[0]!.completion).toBe('Đạt mục tiêu mới');
 await req(r,'workflowSave',{workflow:{...w,planRevision:1,steps:w.steps.map(s=>({...s,inputs:['Phiếu khảo sát'],outputs:[s.id+'.docx'],onError:'Báo dữ liệu thiếu'}))}});
 expect(p.steps[0]).toMatchObject({inputs:['Phiếu khảo sát'],outputs:['s0.docx'],onError:'Báo dữ liệu thiếu',completion:'Đạt mục tiêu mới',dependsOn:[]});
 expect(p.versions?.map(v=>v.revision)).toEqual([0,1]);expect(p.versions?.[0]?.steps[0]?.completion).toBe('Đối chiếu mục tiêu');
 const before=JSON.stringify(p);await expect(req(r,'workflowSave',{workflow:{...w,planRevision:1}})).rejects.toThrow('cửa sổ khác');expect(JSON.stringify(p)).toBe(before);
 await expect(req(r,'editPlan',{id:p.id,steps:p.steps})).rejects.toThrow('cửa sổ khác');
});
it('runs a dependency before its consumer regardless of display order and pins approved definitions across edits and restart',async()=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));p.steps=[p.steps[2]!,p.steps[0]!,p.steps[1]!];spy.mockResolvedValue(result('Đã thực hiện'));
 await req(r,'runPlan',{id:p.id,revision:0});
 const calls=spy.mock.calls.map(([o])=>o.buildPrompt?.(false,false)??'').filter(t=>t.includes('NHIỆM VỤ HIỆN TẠI ĐÃ DUYỆT:'));
 expect(calls[0]).toContain('Thực hiện bước đã duyệt: Nhiệm vụ 0');expect(calls[1]).toContain('Thực hiện bước đã duyệt: Nhiệm vụ 1');expect(calls[2]).toContain('Thực hiện bước đã duyệt: Nhiệm vụ 2');
 const run=r.store.data.workflows![0]!.runs[0]!;expect(run.approvedPlan?.revision).toBe(0);const pinned=JSON.stringify(run);
 await req(r,'editPlan',{id:p.id,revision:0,steps:p.steps.map(s=>({...s,task:'Việc mới'})),context:'Bối cảnh mới'});
 expect(JSON.stringify(run)).toBe(pinned);expect(run.approvedPlan?.steps[0]?.task).toBe('Nhiệm vụ 2');
 await expect(req(r,'runPlan',{id:p.id,revision:0})).rejects.toThrow('cửa sổ khác');
 r.store.save();const second=setup(dir).r;expect(second.store.data.workflows![0]!.runs[0]!.approvedPlan).toEqual(run.approvedPlan);
});
it('does not rewrite a finished run when the user accepts skipping a failed step',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));spy.mockRejectedValue(Error('offline'));await req(r,'runPlan',{id:p.id});
 const run=r.store.data.workflows![0]!.runs[0]!;const original=JSON.stringify(run);await req(r,'skipPlanStep',{id:p.id,stepId:'s0'});expect(JSON.stringify(run)).toBe(original);expect(p.steps[0]!.status).toBe('skipped');
});

it('continues independent work, blocks missing results and records replacement in the approved run',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));p.steps[2]!.dependsOn=[];
 spy.mockImplementation(async o=>{const text=o.buildPrompt?.(false,false)??'';if(text.includes('NHIỆM VỤ HIỆN TẠI ĐÃ DUYỆT:\nThực hiện bước đã duyệt: Nhiệm vụ 0'))throw Error('offline');return result('Kết quả nhánh độc lập');});
 await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['error','blocked','done']);
 expect(p.steps[0]!.logs?.at(-1)?.text).toContain('offline');expect(p.steps[2]!.endedAt).toBeDefined();
 const old=JSON.stringify(r.store.data.workflows![0]!.runs[0]);
 await req(r,'skipPlanStep',{id:p.id,stepId:'s0'});
 await expect(req(r,'replacePlanInput',{id:p.id,revision:99,stepId:'s1',dependencyId:'s0',value:'X'})).rejects.toThrow('cửa sổ khác');
 await req(r,'replacePlanInput',{id:p.id,revision:0,stepId:'s1',dependencyId:'s0',value:'Nguồn bổ sung'});
 await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['skipped','done','done']);
 expect(JSON.stringify(r.store.data.workflows![0]!.runs[1])).toBe(old);
 expect(r.store.data.workflows![0]!.runs[0]!.approvedPlan?.steps[1]?.replacements?.s0).toBe('Nguồn bổ sung');
 expect(spy.mock.calls.some(([o])=>o.buildPrompt?.(false,false).includes('Nguồn bổ sung'))).toBe(true);
});
it('stopping a plan keeps unstarted independent work waiting and never skips it',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));p.steps[1]!.dependsOn=[];
 spy.mockImplementation(async()=>{await req(r,'cancel',{chatId:p.chatId});throw Error('cancelled');});
 await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['interrupted','waiting','waiting']);
});

it('retrying a failed branch unblocks its consumer without rerunning a completed independent branch',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));p.steps[2]!.dependsOn=[];
 spy.mockRejectedValueOnce(Error('temporary')).mockResolvedValue(result('Kết quả'));
 await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['error','blocked','done']);
 const completedAt=p.steps[2]!.endedAt;const review=await req(r,'inspectPlanRecovery',{id:p.id,stepId:'s0'}) as any;await req(r,'resolvePlanRecovery',{id:p.id,stepId:'s0',revision:0,token:review.token,decision:'retry',evidence:'Đã kiểm tra, chưa có tác động ngoài'});await req(r,'runPlan',{id:p.id,stepId:'s0'});
 expect(p.steps[0]!.status).toBe('done');await req(r,'runPlan',{id:p.id});
 expect(p.steps.map(s=>s.status)).toEqual(['done','done','done']);expect(p.steps[2]!.endedAt).toBe(completedAt);
 expect(p.steps[0]!.logs?.filter(l=>l.text==='Bắt đầu thực hiện.')).toHaveLength(2);
});
it('blocks consumers of legacy completed steps with no saved output',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));p.steps[0]!.status='done';spy.mockResolvedValue(result('Kết quả'));
 await req(r,'runPlan',{id:p.id});expect(p.steps.map(s=>s.status)).toEqual(['interrupted','blocked','blocked']);
 expect(spy.mock.calls.filter(([o])=>o.buildPrompt?.(false,false).includes('NHIỆM VỤ HIỆN TẠI ĐÃ DUYỆT:'))).toHaveLength(0);
});

it('does not replay an interrupted step until a fresh review explicitly authorizes it',async()=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));const file=path.join(dir,'result.txt');fs.writeFileSync(file,'already written');p.steps[0]!.files=[file];p.steps[0]!.status='interrupted';
 spy.mockResolvedValue(result('new output'));
 await req(r,'runPlan',{id:p.id});expect(p.steps[0]!.status).toBe('interrupted');expect(spy).not.toHaveBeenCalled();
 const review=await req(r,'inspectPlanRecovery',{id:p.id,stepId:'s0'}) as any;
 fs.writeFileSync(file,'changed after review');
 await expect(req(r,'resolvePlanRecovery',{id:p.id,stepId:'s0',revision:0,token:review.token,decision:'retry',evidence:'Checked remote request and file'})).rejects.toThrow('đổi');
 const fresh=await req(r,'inspectPlanRecovery',{id:p.id,stepId:'s0'}) as any;
 await req(r,'resolvePlanRecovery',{id:p.id,stepId:'s0',revision:0,token:fresh.token,decision:'complete',evidence:'Đã kiểm tra nội dung tệp và hệ thống đích: hoàn thành'});
 await req(r,'runPlan',{id:p.id});expect(p.steps[0]!.output).toContain('Đã kiểm tra');expect(p.steps.every(s=>s.status==='done')).toBe(true);
 const calls=spy.mock.calls.map(([o])=>o.buildPrompt?.(false,false)??'');expect(calls.some(t=>t.includes('NHIỆM VỤ HIỆN TẠI ĐÃ DUYỆT:\nThực hiện bước đã duyệt: Nhiệm vụ 0'))).toBe(false);
});
it('persists checkpoint before model side effects and detects changed completed files',async()=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));const file=path.join(dir,'output.txt');p.steps[0]!.files=[file];
 spy.mockImplementation(async()=>{const disk=JSON.parse(fs.readFileSync(r.store.file,'utf8'));expect(disk.chats[0].messages[0].plan.steps.find((s:any)=>s.status==='running').checkpoint.runId).toBeTruthy();fs.writeFileSync(file,'output');return result('saved');});
 await req(r,'runPlan',{id:p.id,stepId:'s0'});expect(p.steps[0]!.checkpoint?.after?.[0]?.state).toBe('file');
 fs.writeFileSync(file,'external edit');spy.mockClear();await req(r,'runPlan',{id:p.id});expect(spy).not.toHaveBeenCalled();
});
it('finds multiple unfinished jobs using history and journal without starting either',async()=>{
 const {r,spy}=setup();const p=await plan(r);p.steps[0]!.status='interrupted';
 const other=await plan(r);other.id='other';other.title='Bài khác';
 const a=r.journal.start({kind:'plan-step',chatId:other.chatId,planId:other.id});r.journal.finish(a,'interrupted','thí nghiệm ánh sáng');
 r.store.data.chats.find(c=>c.id===p.chatId)!.messages.push({id:'history',role:'user',at:2,text:'thí nghiệm ánh sáng'});
 const rows=await req(r,'resumeCandidates',{query:'thí nghiệm ánh sáng'}) as any[];
 expect(new Set(rows.map(x=>x.id))).toEqual(new Set(['plan','other']));expect(spy).not.toHaveBeenCalled();
});
it('persists action evidence before automatic writes and recovers without duplicating them',async()=>{
 const {r,spy,dir}=setup();const p=await plan(r);r.store.data.preferences.access='full';
 const output=path.join(dir,'created.txt');r.store.data.chats[0]!.outputDir=dir;
 spy.mockResolvedValue(result('Kết quả\n```pvta-action\n'+JSON.stringify({kind:'write_text',path:output,content:'saved',reason:'test'})+'\n```'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});
 const cp=p.steps[0]!.checkpoint!;expect(cp.messageId).toBeTruthy();expect(cp.before).toEqual([]);
 expect(r.store.data.chats[0]!.messages.find(m=>m.id===cp.messageId)?.actions?.[0]?.state).toBe('done');
 p.steps[0]!.status='running';r.store.save();const second=setup(dir);
 const restored=second.r.store.data.chats[0]!.messages[0]!.plan!;
 const report=await req(second.r,'inspectPlanRecovery',{id:p.id,stepId:'s0'}) as any;
 expect(report.actions[0].state).toBe('done');expect(report.current.some((f:any)=>f.path===output&&f.state==='file')).toBe(true);
 await expect(req(second.r,'runPlan',{id:p.id,stepId:'s0'})).rejects.toThrow('đối chiếu khôi phục');expect(second.spy).not.toHaveBeenCalled();expect(restored.steps[0]!.status).toBe('interrupted');expect(fs.readFileSync(output,'utf8')).toBe('saved');
});


it('broadcasts saved edits to two clients and rejects their concurrent stale submission',async()=>{
 const views:ReturnType<DesktopRuntime['view']>[][]=[[],[]];
 const {r,spy}=setup(undefined,event=>{if(event.event==='state')for(const client of views)client.push(structuredClone(event.data as ReturnType<DesktopRuntime['view']>));});
 const p=await plan(r);const stale=structuredClone(p);
 await req(r,'editPlan',{id:p.id,revision:0,context:'Lớp 8, không có mạng',steps:p.steps});
 const current=(i:number)=>views[i]!.at(-1)!.data.chats.flatMap(c=>c.messages).find(m=>m.plan?.id===p.id)!.plan!;
 expect(current(0)).toEqual(current(1));expect(current(1).context).toBe('Lớp 8, không có mạng');
 await expect(req(r,'editPlan',{id:p.id,revision:0,context:'Bản cũ',steps:stale.steps})).rejects.toThrow('cửa sổ khác');
 const w=structuredClone(r.view().data.workflows![0]!);
 await req(r,'workflowSave',{workflow:{...w,planRevision:1,steps:w.steps.map(s=>({...s,prompt:'Kiểm tra bằng phiếu giấy'}))}});
 expect(current(0)).toEqual(current(1));expect(current(0).steps[0]!.task).toBe('Kiểm tra bằng phiếu giấy');
 expect(current(0).approved).toBe(false);expect(spy).not.toHaveBeenCalled();
});

it('clarifies missing lesson inputs across turns and creates only an unapproved draft after answers',async()=>{
 const {r,spy}=setup();const chatId=await req(r,'newChat');
 const questions=['Bài học và lớp nào?','Thời lượng và trình độ học sinh?','Điều kiện lớp và đầu ra mong muốn?'];
 spy.mockResolvedValue(result(planAnswer({questions})));
 const first=await req(r,'send',{chatId,text:'Soạn giáo án giúp tôi',plan:true}) as {text:string;plan?:Plan};
 expect(first.plan).toBeUndefined();for(const q of questions)expect(first.text).toContain(q);
 expect(r.store.data.workflows??[]).toHaveLength(0);
 const brief={...survey(),topic:'Lực ma sát',facts:['Người dùng: lớp 8, hai tiết, trình độ hỗn hợp, không mạng'],assumptions:[],sources:[],limitations:['Chưa xác minh văn bản hướng dẫn; cần kiểm tra trước khi soạn']};
 spy.mockResolvedValue(result(planAnswer(brief)));
 const second=await req(r,'send',{chatId,text:'Lực ma sát, lớp 8, hai tiết, trình độ hỗn hợp; không mạng, cần bản Word và phiếu giấy.',plan:true}) as {plan:Plan};
 expect(second.plan.approved).toBe(false);expect(second.plan.context).toContain('không mạng');
 expect(second.plan.context).toContain('Chưa xác minh');expect(r.store.data.workflows).toHaveLength(1);
 expect(r.store.data.workflows![0]!.runs).toHaveLength(0);
});


it('duyệt đúng một giai đoạn từ Plan hoặc quy trình, không tự chạy giai đoạn sau',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));spy.mockResolvedValue(result('Kết quả đã lưu'));
 await req(r,'runPlan',{id:p.id,stepId:'s0',revision:0});expect(p.steps.map(s=>s.status)).toEqual(['done','waiting','waiting']);
 expect(r.store.data.workflows![0]!.runs[0]!.status).toBe('paused');
 await expect(req(r,'runPlan',{id:p.id,stepId:'s2',revision:0})).rejects.toThrow('các bước trước');
 await expect(req(r,'runPlan',{id:p.id,stepId:'s0',revision:0})).rejects.toThrow('đã hoàn tất');
 await req(r,'workflowRun',{id:p.workflowId,stepId:'s1',revision:0});expect(p.steps.map(s=>s.status)).toEqual(['done','done','waiting']);
 await expect(req(r,'workflowRun',{id:p.workflowId,stepId:'s2',revision:99})).rejects.toThrow('cửa sổ khác');
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(2);
});
it('chặn duyệt giai đoạn khi kết quả trước đã đổi sau khi chạy',async()=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));const file=path.join(dir,'result.txt');fs.writeFileSync(file,'original');p.steps[0]!.files=[file];spy.mockResolvedValue(result('Đã đọc'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});fs.writeFileSync(file,'changed');
 await expect(req(r,'runPlan',{id:p.id,stepId:'s1'})).rejects.toThrow('các bước trước');expect(p.steps[0]!.status).toBe('interrupted');expect(p.steps[1]!.status).toBe('waiting');
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(1);
});

it.each([false,true])('mở khóa bước sau khi bước trước dùng tên tệp đính kèm, kể cả mốc cũ (%s)',async legacy=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));
 const file=path.join(dir,'de-1.md');fs.writeFileSync(file,'Nội dung đề');
 r.store.data.attachments.push({id:'source',name:'de-1.md',path:file,scope:'chat',scopeId:p.chatId,fingerprint:'test',segments:[]});
 p.steps[0]!.files=['de-1.md'];spy.mockResolvedValue(result('Đáp án đã lưu'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});
 expect(p.steps[0]!.status).toBe('done');
 if(legacy)p.steps[0]!.checkpoint!.after!.push({path:'de-1.md',state:'unknown',reason:'Đường dẫn chưa tuyệt đối'});
 await req(r,'workflowRun',{id:p.workflowId,stepId:'s1'});
 expect(p.steps.map(s=>s.status)).toEqual(['done','done','waiting']);
 expect(p.steps[0]!.checkpoint?.after).toContainEqual({path:file,state:'file',hash:expect.any(String)});
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(2);
});

it('vẫn chặn bước sau nếu tệp được gọi bằng tên ngắn đã thực sự thay đổi',async()=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));const file=path.join(dir,'de.md');fs.writeFileSync(file,'Đề gốc');
 r.store.data.attachments.push({id:'source',name:'de.md',path:file,scope:'chat',scopeId:p.chatId,fingerprint:'test',segments:[]});
 p.steps[0]!.files=['de.md'];spy.mockResolvedValue(result('Đã đọc'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});fs.writeFileSync(file,'Đề đã đổi');
 await expect(req(r,'runPlan',{id:p.id,stepId:'s1'})).rejects.toThrow('các bước trước');
 expect(p.steps[0]!.status).toBe('interrupted');expect(p.steps[1]!.status).toBe('waiting');
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(1);
});

it.each([false,true])('mở khóa bước sau khi tên tiếng Việt khác dạng Unicode, kể cả mốc cũ (%s)',async legacy=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));
 const name='Đề kiểm tra.md',file=path.join(dir,name.normalize('NFD'));fs.writeFileSync(file,'Đề gốc');
 r.store.data.attachments.push({id:'source',name,path:file,scope:'chat',scopeId:p.chatId,fingerprint:'test',segments:[]});
 p.steps[0]!.files=[name.normalize('NFC')];spy.mockResolvedValue(result('Đã đọc đề'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});
 expect(p.steps[0]!.status).toBe('done');
 if(legacy)p.steps[0]!.checkpoint!.after!.push({path:name.normalize('NFC'),state:'unknown',reason:'Đường dẫn chưa tuyệt đối'});
 await req(r,'workflowRun',{id:p.workflowId,stepId:'s1'});
 expect(p.steps.map(s=>s.status)).toEqual(['done','done','waiting']);
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(2);
 fs.writeFileSync(file,'Đề đã thay đổi');
 await expect(req(r,'workflowRun',{id:p.workflowId,stepId:'s2'})).rejects.toThrow('các bước trước');
 expect(p.steps[0]!.status).toBe('interrupted');
});

it('không tự chọn tệp khi hai đường dẫn có cùng tên tiếng Việt sau chuẩn hóa',async()=>{
 const {r,spy,dir}=setup();const p=contracted(await plan(r));const name='Đề kiểm tra.md';
 for(const [i,form] of (['NFC','NFD'] as const).entries()){
  const folder=path.join(dir,String(i));fs.mkdirSync(folder);
  const file=path.join(folder,name.normalize(form));fs.writeFileSync(file,'Đề '+i);
  r.store.data.attachments.push({id:'source'+i,name,path:file,scope:'chat',scopeId:p.chatId,fingerprint:'test',segments:[]});
 }
 p.steps[0]!.files=[name];spy.mockResolvedValue(result('Đã đọc'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});
 await expect(req(r,'workflowRun',{id:p.workflowId,stepId:'s1'})).rejects.toThrow('các bước trước');
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(1);
});

it('keeps workflow creation and update dates stable when relinking at startup',async()=>{
 const {r,dir}=setup();const p=await plan(r);const w=r.store.data.workflows![0]!;
 w.createdAt=100;w.updatedAt=200;r.store.save();
 const restored=setup(dir).r;const saved=restored.store.data.workflows![0]!;
 expect(saved.createdAt).toBe(100);expect(saved.updatedAt).toBe(200);
 expect(saved.planId).toBe(p.id);
});
it('does not delete a linked workflow while its plan is running',async()=>{
 const {r}=setup();const p=await plan(r);(r as any).jobs.set(p.chatId,new AbortController());
 await expect(req(r,'workflowDelete',{id:p.workflowId})).rejects.toThrow('Dừng quy trình');
 expect(r.store.data.workflows).toHaveLength(1);expect(p.workflowHidden).not.toBe(true);
 (r as any).jobs.delete(p.chatId);
});

it('does not mark a model-declared incomplete stage done or run its dependent stage',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));
 spy.mockResolvedValue(result('**Bước “Tìm hiểu” chưa hoàn tất.** Chưa kiểm tra môi trường.'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});
 expect(p.steps[0]!.status).toBe('error');
 expect(p.steps[0]!.error).toContain('chưa hoàn tất');
 await expect(req(r,'runPlan',{id:p.id,stepId:'s1'})).rejects.toThrow('các bước trước');
 expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(1);
});

it('repairs legacy done status when the saved output explicitly says the stage is incomplete',async()=>{
 const {r,dir}=setup();const p=contracted(await plan(r));
 p.steps[0]!.status='done';p.steps[0]!.output='**Bước “Tìm hiểu” chưa hoàn tất.** Chưa kiểm tra môi trường.';r.store.save();
 const restored=setup(dir).r;const saved=restored.store.data.chats[0]!.messages[0]!.plan!;
 expect(saved.steps[0]!.status).toBe('interrupted');expect(saved.steps[0]!.error).toContain('lượt cũ đã ghi Xong');
 await expect(req(restored,'workflowRun',{id:saved.workflowId,stepId:'s1'})).rejects.toThrow('các bước trước');
});
it('identifies the interrupted selected step instead of silently skipping it with a completed predecessor',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));spy.mockResolvedValue(result('Kết quả đã lưu'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});p.steps[1]!.status='interrupted';
 await expect(req(r,'workflowRun',{id:p.workflowId,stepId:'s1'})).rejects.toThrow('chính bước này');
 expect(p.steps[0]!.status).toBe('done');expect(r.journal.list().filter(a=>a.kind==='plan-step')).toHaveLength(1);
});
it('does not reinterpret source quotations or an explicit human completion confirmation',async()=>{
 const {declaredIncomplete,hasIncompleteResult}=await import('../src/desktop/step-approval');
 expect(declaredIncomplete('Đã hoàn tất. Tài liệu có câu: Bước này chưa hoàn tất.')).toBe(false);
 expect(declaredIncomplete('Bước “Kiểm tra” chưa hoàn thành.')).toBe(true);
 expect(hasIncompleteResult({...({} as any),output:'Bước này chưa hoàn tất.',checkpoint:{resolution:{decision:'complete'}}})).toBe(false);
});

it('retries only the interrupted second stage after explicit recovery approval',async()=>{
 const {r,spy}=setup();const p=contracted(await plan(r));spy.mockResolvedValue(result('Kết quả hợp lệ'));
 await req(r,'runPlan',{id:p.id,stepId:'s0'});p.steps[1]!.status='interrupted';
 const review=await req(r,'inspectPlanRecovery',{id:p.id,stepId:'s1'}) as any;
 await req(r,'resolvePlanRecovery',{id:p.id,stepId:'s1',revision:0,token:review.token,decision:'retry',evidence:'Đã kiểm tra ca thử: bước 2 chưa tạo tệp hay thực hiện thao tác ngoài.'});
 await req(r,'workflowRun',{id:p.workflowId,stepId:'s1'});
 expect(p.steps.map(s=>s.status)).toEqual(['done','done','waiting']);
 expect(r.journal.list().filter(a=>a.kind==='plan-step').map(a=>a.stepId).sort()).toEqual(['s0','s1']);
});

it('Plan defaults to unlimited beyond both old deadlines and remains cancellable',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');vi.useFakeTimers();
 let started!:()=>void;const entered=new Promise<void>(resolve=>started=resolve);let signal:AbortSignal|undefined;
 spy.mockImplementation(o=>{signal=o.signal;expect(o.timeoutMs).toBe(0);expect(o.workspaceWrite).toBe(false);expect(o.mcp).toBeUndefined();started();return new Promise(()=>{});});
 const sending=req(r,'send',{chatId:id,text:'Lập kế hoạch dài',plan:true});const rejected=expect(sending).rejects.toThrow('Đã dừng');await entered;
 await vi.advanceTimersByTimeAsync(16*60_000);expect(signal?.aborted).toBe(false);
 await req(r,'cancel',{chatId:id});await rejected;expect(r.store.data.chats[0]!.messages[0]!.planning?.phase).toBe('interrupted');
});
it('uses a user chosen total planning budget and rejects invalid budgets without adding a message',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');
 await expect(req(r,'send',{chatId:id,text:'Plan',plan:true,planningTimeoutMs:-1})).rejects.toThrow('Thời gian');expect(r.store.data.chats[0]!.messages).toHaveLength(0);
 vi.useFakeTimers();let started!:()=>void;const entered=new Promise<void>(resolve=>started=resolve);
 spy.mockImplementation(o=>{expect(o.timeoutMs).toBe(120000);started();return new Promise(()=>{});});
 const sending=req(r,'send',{chatId:id,text:'Plan',plan:true,planningTimeoutMs:120000});const rejected=expect(sending).rejects.toThrow('hết thời gian');await entered;await vi.advanceTimersByTimeAsync(120000);await rejected;
});
const proDraft=()=>{const raw=JSON.parse(planAnswer(survey()).split('\n')[1]!);raw.steps=[{id:'s1',goal:'Soạn và kiểm tra',task:'Soạn rồi đối chiếu mục tiêu',files:[],risk:'Thiếu dữ liệu',inputs:['Yêu cầu đã khảo sát'],outputs:['Giáo án'],dependsOn:[],completion:'Đủ mục tiêu và đánh giá',onError:'Dừng hỏi người dùng'}];return '```pvta-plan\n'+JSON.stringify(raw)+'\n```';};
it('Plan Pro critiques, repairs, checks and publishes only the accepted draft with a persisted checkpoint',async()=>{
 const {r,spy,dir}=setup();const id=await req(r,'newChat');let reviews=0;
 spy.mockImplementation(async o=>{if(o.system?.startsWith('PLAN PRO — PHẢN BIỆN'))return result(JSON.stringify(++reviews===1?{passed:false,issues:['Bổ sung kiểm tra thời lượng'],questions:[]}:{passed:true,issues:[],questions:[]}));return result(proDraft());});
 const m=await req(r,'send',{chatId:id,text:'Soạn giáo án',planningMode:'pro'}) as any;
 expect(reviews).toBe(2);expect(m.plan?.approved).toBe(false);expect(m.actions).toEqual([]);expect(r.store.data.workflows).toHaveLength(1);
 expect(r.store.data.chats[0]!.messages[0]!.planning).toMatchObject({mode:'pro',phase:'ready',round:2,timeoutMs:0,draft:proDraft()});
 expect(setup(dir).r.store.data.chats[0]!.messages[0]!.planning?.phase).toBe('ready');
});
it('Plan Pro never exposes a rejected or cyclic draft as an executable plan',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');const draft=proDraft().replace('"dependsOn":[]','"dependsOn":["s1"]');spy.mockResolvedValue(result(draft));
 const m=await req(r,'send',{chatId:id,text:'Soạn giáo án',planningMode:'pro'}) as any;
 expect(m.plan).toBeUndefined();expect(m.text).toContain('chưa vượt qua');expect(r.store.data.workflows??[]).toHaveLength(0);
 expect(r.store.data.chats[0]!.messages[0]!.planning).toMatchObject({phase:'error',round:3,draft});
});
it('Plan Pro asks reviewer questions without publishing a plan',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');spy.mockImplementation(async o=>result(o.system?.startsWith('PLAN PRO — PHẢN BIỆN')?JSON.stringify({passed:false,issues:[],questions:['Lớp có máy chiếu không?']}):proDraft()));
 const m=await req(r,'send',{chatId:id,text:'Soạn giáo án',planningMode:'pro'}) as any;expect(m.plan).toBeUndefined();expect(m.text).toContain('máy chiếu');expect(r.store.data.chats[0]!.messages[0]!.planning?.phase).toBe('questions');
});

it('Plan Pro keeps the draft when cancelled during review and does not publish it',async()=>{
 const {r,spy,dir}=setup();const id=await req(r,'newChat');let started!:()=>void;const entered=new Promise<void>(resolve=>started=resolve);
 spy.mockImplementation(async o=>{if(o.system?.startsWith('PLAN PRO — PHẢN BIỆN')){started();return new Promise(()=>{});}return result(proDraft());});
 const sending=req(r,'send',{chatId:id,text:'Soạn giáo án',planningMode:'pro'});const rejected=expect(sending).rejects.toThrow('Đã dừng');await entered;
 expect(setup(dir).r.store.data.chats[0]!.messages[0]!.planning).toMatchObject({phase:'interrupted',draft:proDraft()});
 await req(r,'cancel',{chatId:id});await rejected;expect(r.store.data.chats[0]!.messages[0]!.planning).toMatchObject({phase:'interrupted',draft:proDraft()});expect(r.store.data.workflows??[]).toHaveLength(0);
});
it('the chosen deadline covers survey and review together rather than restarting each round',async()=>{
 const {r,spy}=setup();const id=await req(r,'newChat');vi.useFakeTimers();let started!:()=>void;const entered=new Promise<void>(resolve=>started=resolve);let drafting!:()=>void;const drafted=new Promise<void>(resolve=>drafting=resolve);
 spy.mockImplementation(async o=>{if(o.system?.startsWith('PLAN PRO — PHẢN BIỆN')){started();return new Promise(()=>{});}drafting();await new Promise(resolve=>setTimeout(resolve,40000));return result(proDraft());});
 const sending=req(r,'send',{chatId:id,text:'Soạn giáo án',planningMode:'pro',planningTimeoutMs:60000});const rejected=expect(sending).rejects.toThrow('hết thời gian');await drafted;await vi.advanceTimersByTimeAsync(40000);await entered;await vi.advanceTimersByTimeAsync(20000);await rejected;expect(r.store.data.chats[0]!.messages[0]!.planning?.draft).toBe(proDraft());
});

it('pins a linked workflow without changing Plan approval, revision, results or history and persists it',async()=>{
 const {r,dir}=setup();const p=await plan(r);p.approved=true;p.steps[0]!.status='done';p.steps[0]!.output='Kết quả đã giữ';const w=r.store.data.workflows![0]!;
 const before=structuredClone(p),definition=structuredClone(w.steps),runs=structuredClone(w.runs);
 await req(r,'workflowPin',{id:w.id,pinned:true});expect(p).toEqual(before);expect(w.steps).toEqual(definition);expect(w.runs).toEqual(runs);expect(w.pinned).toBe(true);
 const second=setup(dir).r;expect(second.store.data.workflows!.find(x=>x.id===w.id)?.pinned).toBe(true);
 await req(r,'workflowPin',{id:w.id,pinned:false});expect(w.pinned).toBe(false);
 await expect(req(r,'workflowPin',{id:'missing',pinned:true})).rejects.toThrow('không còn');await expect(req(r,'workflowPin',{id:w.id,pinned:'true'})).rejects.toThrow('không hợp lệ');
 (r as any).jobs.set(p.chatId,new AbortController());await expect(req(r,'workflowPin',{id:w.id,pinned:true})).rejects.toThrow('Dừng quy trình');expect(w.pinned).toBe(false);(r as any).jobs.delete(p.chatId);
});
it('keeps Plan activity and progress available to a newly opened window',async()=>{
 const {r,spy}=setup();const p=await plan(r);let release!:(value:any)=>void;
 spy.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const running=req(r,'runPlan',{id:p.id,stepId:'s0'});
 await vi.waitFor(()=>expect(spy).toHaveBeenCalled());
 try{const snapshot=await req(r,'view') as ReturnType<typeof r.view>;expect(snapshot.activeChatIds).toContain(p.chatId);expect(snapshot.chatProgress?.[p.chatId]?.length).toBeGreaterThan(0);}finally{release(result('Kết quả'));await running;}
 expect(r.view().activeChatIds).not.toContain(p.chatId);expect(r.view().chatProgress?.[p.chatId]).toBeUndefined();
});
