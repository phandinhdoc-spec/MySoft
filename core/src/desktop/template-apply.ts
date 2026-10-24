import type {Plan,PlanStep,Workflow,WorkflowStep,DesktopData} from './types.js';
import {editPlanSteps,linkPlan,planContract} from './plans.js';
import {MAX_STEPS,MAX_WORKFLOWS,normalizeWorkflow} from './workflows.js';
import {expandTemplate,type TemplateRefs,type TemplateValues} from './workflow-templates.js';

/**
 * Nơi chèn. Không có gì = tạo quy trình mới (dùng khi gọi từ hội thoại).
 * planId/workflowId = thêm cả khối bước vào Plan/quy trình đang có; không đổi, không ghi đè bước cũ.
 */
export interface InsertTarget {planId?:string;workflowId?:string;name?:string;projectId?:string}

export interface InsertDeps {
 data:DesktopData;
 /** Tra kỹ năng, quy tắc, lời nhắc theo phạm vi (dự án, hội thoại) của nơi chèn. */
 refs(scope:{projectId?:string;chatId?:string}):TemplateRefs;
 findPlan(id:string):Plan;
 planBusy(plan:Plan):boolean;
 workflowBusy(id:string):boolean;
}

const PLAN_TASK_MAX=4000,WORKFLOW_PROMPT_MAX=20_000;
const shortId=()=>globalThis.crypto.randomUUID().replace(/-/g,'').slice(0,6);

/** Phụ thuộc tường minh của danh sách bước hiện có (quy trình tuần tự = mỗi bước chờ bước trước). */
function explicitDeps<T extends {id:string;dependsOn?:string[]}>(steps:T[],sequential:boolean):string[][]{
 return steps.map((s,i)=>sequential?(i?[steps[i-1]!.id]:[]):(s.dependsOn??(i?[steps[i-1]!.id]:[])));
}

/** Gợi ý nối: mỗi bước cuối của phần cũ → mỗi bước đầu của khối mới. Chỉ là dữ liệu hiển thị (nét đứt), không ghi vào dependsOn. */
function suggestLinks(existing:{id:string}[],deps:string[][],blockRoots:string[]){
 const depended=new Set(deps.flat());
 const ends=existing.filter(s=>!depended.has(s.id)).map(s=>s.id).slice(0,3);
 return ends.flatMap(from=>blockRoots.slice(0,3).map(to=>({id:globalThis.crypto.randomUUID(),from,to,reason:'Bước cuối của phần cũ → bước đầu của khối vừa chèn'})));
}

/**
 * Chèn quy trình mẫu: thêm cả khối bước (mã mới, phụ thuộc bên trong khối được giữ) vào quy trình/Plan hiện có,
 * hoặc tạo quy trình mới nếu không chỉ định nơi chèn. Khối chưa nối với bước cũ; PVTA chỉ gợi ý liên kết nét đứt.
 * Các bước chèn vào là bản sao độc lập: sửa chúng không đổi mẫu. Không chạy gì.
 */
export function insertTemplate(d:InsertDeps,templateId:string,target:InsertTarget,values:TemplateValues):{kind:'plan'|'workflow';id:string;inserted:string[]}{
 const tpl=(d.data.workflowTemplates??[]).find(t=>t.id===templateId);
 if(!tpl)throw Error('Không tìm thấy quy trình mẫu.');
 const workflows=(d.data.workflows??=[]);
 const group=shortId(),prefix=`${group}.`;
 if(target.workflowId){
  const wf=workflows.find(w=>w.id===target.workflowId);
  if(!wf)throw Error('Không tìm thấy quy trình.');
  if(wf.planId)return insertTemplate(d,templateId,{planId:wf.planId},values);
  if(d.workflowBusy(wf.id))throw Error('Dừng quy trình trước khi chèn quy trình mẫu.');
  if(wf.steps.length+tpl.steps.length>MAX_STEPS)throw Error(`Quy trình tối đa ${MAX_STEPS} nút; còn chỗ cho ${Math.max(0,MAX_STEPS-wf.steps.length)} nút nhưng mẫu có ${tpl.steps.length}.`);
  const block=expandTemplate(tpl,values,d.refs({projectId:wf.projectId}),{prefix,maxPrompt:WORKFLOW_PROMPT_MAX});
  const deps=explicitDeps(wf.steps,wf.mode!=='parallel');
  const old=wf.steps.map((s,i)=>({...s,dependsOn:deps[i]!}));
  const added:WorkflowStep[]=block.map(b=>({id:b.id,name:b.name,prompt:b.prompt,resources:b.resources,choice:b.choice,access:b.access,inputs:b.inputs,outputs:b.outputs,dependsOn:b.dependsOn,completion:b.completion,onError:b.onError}));
  const steps=[...old,...added];
  added.forEach(s=>{s.templateCopy=true;s.origin={templateId:tpl.id,group};});
  const roots=added.filter(b=>!b.dependsOn!.length).map(b=>b.id);
  const links=[...(wf.suggestedLinks??[]),...suggestLinks(old,deps,roots)];
  const next=normalizeWorkflow({...wf,steps,suggestedLinks:links,mode:'parallel',maxConcurrency:wf.mode==='parallel'?(wf.maxConcurrency??2):(steps.some(x=>(x.dependsOn?.length??0)!==1)?2:1)},wf);
  const earlier=new Map(wf.steps.filter(s=>s.insertGroup).map(s=>[s.id,s.insertGroup!]));
  next.steps.forEach(s=>{if(s.id.startsWith(prefix))s.insertGroup=group;else if(earlier.has(s.id))s.insertGroup=earlier.get(s.id);});
  Object.assign(wf,next);
  return {kind:'workflow',id:wf.id,inserted:added.map(s=>s.id)};
 }
 if(target.planId){
  const plan=d.findPlan(target.planId);
  if(d.planBusy(plan))throw Error('Dừng kế hoạch trước khi chèn quy trình mẫu.');
  if(plan.steps.length+tpl.steps.length>20)throw Error(`Kế hoạch tối đa 20 bước; còn chỗ cho ${Math.max(0,20-plan.steps.length)} bước nhưng mẫu có ${tpl.steps.length}.`);
  const chat=d.data.chats.find(c=>c.id===plan.chatId);
  const block=expandTemplate(tpl,values,d.refs({projectId:chat?.projectId,chatId:chat?.id}),{prefix,maxPrompt:PLAN_TASK_MAX});
  const old=plan.steps.map((s,i)=>({...s,...planContract(s,i,plan.steps)}));
  const added:PlanStep[]=block.map(b=>({id:b.id,goal:b.name,task:b.prompt,resources:b.resources,files:[],risk:'',status:'waiting',inputs:b.inputs,outputs:b.outputs,dependsOn:b.dependsOn,completion:b.completion,onError:b.onError}));
  const roots=added.filter(b=>!b.dependsOn!.length).map(b=>b.id);
  const links=suggestLinks(old,old.map(s=>s.dependsOn),roots);
  added.forEach(s=>{s.templateCopy=true;});
  editPlanSteps(plan,[...old,...added]);
  // Nguồn gốc gán sau khi lưu bước: editPlanSteps chỉ giữ nguồn gốc của bước đã có, bước mới do chèn này tạo ra.
  const created=new Set(added.map(s=>s.id));
  plan.steps.forEach(s=>{if(created.has(s.id)&&s.templateCopy)s.origin={templateId:tpl.id,group};});
  const wf=linkPlan(plan,workflows);
  wf.suggestedLinks=[...(wf.suggestedLinks??[]),...links];
  return {kind:'plan',id:plan.id,inserted:added.map(s=>s.id)};
 }
 if(workflows.length>=MAX_WORKFLOWS)throw Error(`Tối đa ${MAX_WORKFLOWS} quy trình.`);
 const block=expandTemplate(tpl,values,d.refs({projectId:target.projectId}),{maxPrompt:WORKFLOW_PROMPT_MAX});
 const wf:Workflow=normalizeWorkflow({name:(target.name??'').trim()||tpl.name,mode:'parallel',maxConcurrency:2,steps:block.map(b=>({id:b.id,name:b.name,prompt:b.prompt,resources:b.resources,choice:b.choice,access:b.access,inputs:b.inputs,outputs:b.outputs,dependsOn:b.dependsOn,completion:b.completion,onError:b.onError}))});
 if(target.projectId&&d.data.projects.some(p=>p.id===target.projectId))wf.projectId=target.projectId;
 wf.steps.forEach(s=>{s.templateCopy=true;s.origin={templateId:tpl.id,group};});
 workflows.push(wf);
 return {kind:'workflow',id:wf.id,inserted:wf.steps.map(s=>s.id)};
}

/** Chấp nhận (nét đứt → nét liền) hoặc bỏ một gợi ý liên kết. Chấp nhận = thêm phụ thuộc thật; kiểm tra không tạo vòng. */
export function resolveSuggestedLink(wf:Workflow,linkId:string,accept:boolean):void{
 const link=wf.suggestedLinks?.find(l=>l.id===linkId);
 if(!link)throw Error('Gợi ý liên kết không còn tồn tại.');
 wf.suggestedLinks=wf.suggestedLinks!.filter(l=>l.id!==linkId);
 if(!wf.suggestedLinks.length)delete wf.suggestedLinks;
 if(!accept)return;
 if(wf.planId)throw Error('Quy trình gắn với Plan: sửa phụ thuộc trong Plan.');
 const deps=explicitDeps(wf.steps,wf.mode!=='parallel');
 const steps=wf.steps.map((s,i)=>({...s,dependsOn:s.id===link.to?[...new Set([...deps[i]!,link.from])]:deps[i]!}));
 const keep=wf.suggestedLinks;
 const next=normalizeWorkflow({...wf,steps,mode:'parallel',maxConcurrency:wf.maxConcurrency??2},wf);
 Object.assign(wf,next);if(keep?.length)wf.suggestedLinks=keep;else delete wf.suggestedLinks;
}

/**
 * Chỉnh cho LẦN CHẠY NÀY, chỉ áp lên bản sao quy trình vừa tạo từ mẫu (mẫu không bị đổi):
 * - access: đổi quyền từng khâu theo mã khâu của mẫu (read/full).
 * - note: ghi chú thêm, nối vào lời nhắc mọi khâu.
 * Ném lỗi nếu khâu không tồn tại, quyền sai hoặc lời nhắc vượt giới hạn.
 */
export interface RunEdits{access?:Record<string,string>;note?:string}
const RUN_NOTE_MAX=2000;
export function applyRunEdits(wf:Workflow,edits:RunEdits|undefined):void{
 if(!edits)return;
 for(const [id,access] of Object.entries(edits.access??{})){
  const step=wf.steps.find(s=>s.id===id);
  if(!step)throw Error('Có khâu không còn trong quy trình mẫu. Tải lại trang rồi thử lại.');
  if(access!=='read'&&access!=='full')throw Error('Quyền của khâu không hợp lệ.');
  step.access=access;
 }
 const note=(edits.note??'').trim();
 if(!note)return;
 if(note.length>RUN_NOTE_MAX)throw Error(`Ghi chú thêm tối đa ${RUN_NOTE_MAX} ký tự.`);
 for(const step of wf.steps){
  const next=`${step.prompt}\n\nYÊU CẦU THÊM CHO LẦN CHẠY NÀY (từ hội thoại, không ghi vào mẫu):\n${note}`;
  if(next.length>WORKFLOW_PROMPT_MAX)throw Error(`Lời nhắc khâu "${step.name}" quá dài khi thêm ghi chú. Rút ngắn ghi chú.`);
  step.prompt=next;
 }
}
