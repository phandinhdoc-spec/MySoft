import {t as uiText} from './i18n';
import {WorkflowGraph} from './WorkflowGraph';
import {WorkflowDialog} from './WorkflowDialog';
import {planStepBlock} from '../../core/src/desktop/step-approval';
import {PlanRecovery} from './PlanRecovery';
import React,{useEffect,useState,useRef} from 'react';
import {rpc,type Plan,type ViewState} from './ipc';
import {TemplateInsertDialog} from './TemplateDialogs';
import {TextPromptDialog} from './TextPromptDialog';
import {draftKey,readPlanDraft,draftConflicts} from './plan-draft';
import {Markdown} from './Markdown';
import './workflow.css';
import {insertWorkflowAfter,layoutWorkflow} from './workflow-graph';
export const planStatus:Record<string,string>={blocked:uiText("Bị chặn"),waiting:uiText("Chờ"),running:uiText("Đang chạy"),done:'Xong',error:uiText("Lỗi"),interrupted:uiText("Bị ngắt"),skipped:uiText("Đã chấp nhận bỏ qua")};
export async function openPlanWorkflow(id:string){
 const url=`index.html#workflow=${encodeURIComponent(id)}`;
 if('__TAURI_INTERNALS__' in window){
  const {WebviewWindow}=await import('@tauri-apps/api/webviewWindow');const label='workflow-'+id;
  const existing=await WebviewWindow.getByLabel(label);if(existing){await existing.setFocus();return;}
  await new Promise<void>((resolve,reject)=>{const w=new WebviewWindow(label,{url,title:uiText("PVTA · Quy trình"),width:1000,height:760,minWidth:650,minHeight:480});void w.once('tauri://created',()=>resolve());void w.once('tauri://error',e=>reject(Error(String(e.payload))));});
 }else if(!window.open(url,'workflow-'+id,'popup,width=1000,height=760'))throw Error(uiText("Trình duyệt đã chặn cửa sổ bật lên."));
}
export function PlanCard({plan,busy,onRun,report,notice,graphView=false,onWorkflow,state}:{state?:ViewState;onWorkflow?:(id:string)=>void;graphView?:boolean;plan:Plan;busy:boolean;onRun:(id?:string)=>Promise<unknown>;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const key=draftKey(plan.id,graphView);
 const [restored]=useState(()=>readPlanDraft(localStorage,key));
 const [steps,setSteps]=useState(restored?.steps??plan.steps),[context,setContext]=useState(restored?.context??plan.context??''),[editing,setEditing]=useState(!!restored),[revision,setRevision]=useState(restored?.revision??plan.revision??0),[saving,setSaving]=useState(false);
 const [replaceFor,setReplaceFor]=useState<{stepId:string;stepGoal:string;depId:string;depGoal:string}|null>(null);
 const [showGraph,setShowGraph]=useState(graphView);
 const [selectedStep,setSelectedStep]=useState('');
 const [templateDialog,setTemplateDialog]=useState(false);
 const materialize=(value:Plan['steps'])=>value.map((s,i)=>({...s,dependsOn:s.dependsOn??(i?[value[i-1]!.id]:[])}));
 function beginEdit(id=''){if(running||saving)return;setSteps(materialize(steps));setEditing(true);setSelectedStep(id);}
 function addStep(){if(running||saving||steps.length>=20)return;const id=crypto.randomUUID();setSteps(v=>[...materialize(v),{id,goal:uiText("Bước mới"),task:'',files:[],risk:'',status:'waiting',inputs:[],outputs:[],dependsOn:[],completion:'',onError:uiText("Dừng và báo lỗi.")}]);setEditing(true);setSelectedStep(id);}
 function removeStep(id:string){setSteps(v=>materialize(v).filter(s=>s.id!==id).map(s=>({...s,dependsOn:s.dependsOn?.filter(d=>d!==id)})));setSelectedStep('');}
 const graph=layoutWorkflow(steps.map((s,i)=>({id:s.id,name:s.goal,prompt:s.task,choice:'auto',access:'read',dependsOn:s.dependsOn??(i?[steps[i-1]!.id]:[])})));
 const [pending,setPending]=useState(false);
 const [recoveryId,setRecoveryId]=useState('');
 const recoverySteps=plan.steps.filter(s=>['error','interrupted'].includes(s.status));
 const recoveryStep=plan.steps.find(s=>s.id===recoveryId);

 const operation=useRef(false);
 const conflict=editing&&draftConflicts({revision,context,steps},plan);
 const running=pending||busy||plan.steps.some(s=>s.status==='running');
 useEffect(()=>{if(!editing){setSteps(plan.steps);setContext(plan.context??'');setRevision(plan.revision??0);}},[plan,editing]);
 useEffect(()=>{if(editing){try{localStorage.setItem(key,JSON.stringify({revision,context,steps}));}catch{report(Error(uiText("Không lưu được bản sửa dở trên máy. Hãy lưu Plan trước khi đóng cửa sổ.")));}}},[key,editing,revision,context,steps]);
 function discard(){setSelectedStep('');localStorage.removeItem(key);setEditing(false);}
 async function run(stepId?:string){if(operation.current||running||editing)return;const target=stepId?plan.steps.find(s=>s.id===stepId):plan.steps.find(s=>!['done','skipped'].includes(s.status));if(target&&recoverySteps.includes(target)&&!target.checkpoint?.retryMarks){setRecoveryId(target.id);return;}operation.current=true;setPending(true);try{await onRun(stepId);}catch(e){report(e);}finally{operation.current=false;setPending(false);}}
 const stageAction=(s:Plan['steps'][number])=>{
  const reason=editing?uiText("Lưu Plan và Quy trình trước khi duyệt."):running?uiText("Chờ công việc đang chạy kết thúc."):planStepBlock(plan,s);
  return <div className="stage-approval">{s.status==='done'?<span className="wf-completed" role="status">{uiText("✓ Đã hoàn tất")}</span>:<button className="primary" aria-label={uiText("Duyệt và chạy giai đoạn: {0}",[s.goal])} disabled={!!reason||saving} title={reason||uiText("Chỉ chạy giai đoạn này, sau đó chờ duyệt nấc tiếp theo.")} onClick={()=>void run(s.id)}>{s.status==='running'?uiText("Đang chạy"):recoverySteps.some(x=>x.id===s.id)&&!s.checkpoint?.retryMarks?uiText("Đối chiếu và thử lại"):uiText("Duyệt và chạy")}</button>}{reason&&<small>{reason}</small>}</div>;
 };
 const patch=(i:number,value:Partial<Plan['steps'][number]>)=>setSteps(s=>s.map((x,n)=>n===i?{...x,...value}:x));
 async function save(){if(conflict||running||operation.current||graph.cyclic||steps.some(s=>s.dependsOn?.some(id=>!steps.some(d=>d.id===id))))return;operation.current=true;setSaving(true);try{await rpc('editPlan',{id:plan.id,steps,context,revision});localStorage.removeItem(key);setEditing(false);notice(uiText("Đã lưu Plan và quy trình. Chỉ chạy khi bấm Duyệt và chạy."));}catch(e){report(e);}finally{operation.current=false;setSaving(false);}}
 return <section className="plan-card" aria-label={uiText("Kế hoạch và quy trình")}>
  <header><span>{uiText("◇ PLAN ↔ QUY TRÌNH")}</span><strong>{plan.title}</strong><small>{uiText("Phiên bản")} {plan.revision??0} · {plan.approved?uiText("Đã duyệt"):uiText("Chờ duyệt")}</small></header>
  {editing&&<p role="status">{uiText("Bản sửa dở được giữ trên máy khi đóng cửa sổ. Bấm Lưu Plan và Quy trình để đồng bộ sang các cửa sổ khác.")}</p>}
  {conflict&&<div role="alert"><p>{uiText("Plan đã đổi ở cửa sổ khác. Bản sửa của thầy cô được giữ lại; không thể ghi đè phiên bản mới.")}</p><details><summary>{uiText("Xem bản mới để đối chiếu")}</summary><Markdown text={plan.context??''}/>{plan.steps.map(s=><div key={s.id}><strong>{s.goal}</strong><pre>{JSON.stringify(s,null,2)}</pre></div>)}</details><button onClick={()=>{if(confirm(uiText("Bỏ bản sửa tại cửa sổ này và tải phiên bản mới?")))discard();}}>{uiText("Bỏ bản sửa / tải bản mới")}</button></div>}
  <div className="plan-toolbar" role="group" aria-label={uiText("Duyệt và chạy Plan")}>
   <button aria-pressed={showGraph} onClick={()=>setShowGraph(v=>!v)}>{showGraph?uiText("Xem danh sách Plan"):uiText("Xem sơ đồ phụ thuộc")}</button>
   {running?<button className="danger" onClick={()=>void rpc('cancel',{chatId:plan.chatId}).catch(report)}>{uiText("Dừng")}</button>:<button disabled={editing||saving||!steps.length||steps.every(s=>['done','skipped'].includes(s.status))} className="primary plan-run-all" aria-label={uiText("Duyệt toàn bộ kế hoạch và chạy")} title={uiText("Duyệt toàn bộ kế hoạch rồi chạy lần lượt mọi giai đoạn còn lại.")} onClick={()=>{if(!plan.approved&&!confirm(uiText("Duyệt toàn bộ {0} giai đoạn của kế hoạch và chạy ngay?",[String(steps.length)])))return;void run();}}>{plan.approved?uiText("▶ Chạy tiếp toàn bộ kế hoạch"):uiText("✓ Duyệt toàn bộ & chạy")}</button>}
   {editing&&<small role="status">{uiText("Lưu Plan và Quy trình trước khi duyệt và chạy.")}</small>}
  </div>
  {!editing&&recoverySteps.length>0&&<div className="plan-recovery-notice" role="status"><strong>{uiText("Cần xử lí bước bị gián đoạn hoặc lỗi")}</strong>{recoverySteps.map(s=><p key={s.id}><b>{s.goal}</b>: {s.error||uiText("Chưa xác nhận kết quả của lần chạy trước.")} <button disabled={running} onClick={()=>setRecoveryId(s.id)}>{uiText("Đối chiếu bước này")}</button></p>)}</div>}
  {recoveryStep&&<div className="plan-recovery-notice"><strong>{uiText("Đối chiếu:")} {recoveryStep.goal}</strong><PlanRecovery key={recoveryStep.id} autoOpen plan={plan} step={recoveryStep} busy={running} report={report} onRetryConfirmed={async()=>{setRecoveryId('');await onRun(recoveryStep.id);}}/><button onClick={()=>setRecoveryId('')}>{uiText("Đóng đối chiếu")}</button></div>}
  {showGraph&&<WorkflowGraph key={plan.id} storageKey={`pvta:graph:plan:${plan.id}`} nodes={materialize(steps).map(s=>({id:s.id,name:s.goal,dependsOn:s.dependsOn,status:s.status==='done'?'success':s.status}))} disabled={running||saving||!!conflict} nodeCommands={id=>{const index=steps.findIndex(s=>s.id===id);const full=steps.length>=20?uiText("Đã đạt giới hạn 20 bước."):undefined;const add=(parallel:boolean)=>{const step={id:crypto.randomUUID(),goal:uiText("Bước mới"),task:'',files:[],risk:'',status:'waiting' as const,inputs:[],outputs:[],dependsOn:[],completion:'',onError:uiText("Dừng và báo lỗi.")};setSteps(v=>{const all=materialize(v),source=all.find(s=>s.id===id)!;return parallel?all.flatMap(s=>[{...s,dependsOn:s.dependsOn.includes(id)?[...s.dependsOn,step.id]:s.dependsOn},...(s.id===id?[{...step,dependsOn:[...source.dependsOn]}]:[])]):insertWorkflowAfter(all,id,step);});setEditing(true);setSelectedStep(step.id);};const move=(delta:number)=>{setSteps(v=>{const all=materialize(v);[all[index],all[index+delta]]=[all[index+delta]!,all[index]!];return all;});setEditing(true);};return [{id:'after',label:uiText("Thêm bước sau"),icon:'＋',group:'structure',disabledReason:full,run:()=>add(false)},{id:'fork',label:uiText("Tạo nhánh song song"),icon:'⑂',group:'structure',disabledReason:full,run:()=>add(true)},{id:'earlier',label:uiText("Dời lên trước"),icon:'↑',group:'order',disabledReason:index===0?uiText("Đã là bước đầu."):undefined,run:()=>move(-1)},{id:'later',label:uiText("Dời xuống sau"),icon:'↓',group:'order',disabledReason:index===steps.length-1?uiText("Đã là bước cuối."):undefined,run:()=>move(1)},{id:'delete',label:uiText("Xóa bước"),icon:uiText("×"),group:'danger',danger:true,run:()=>{removeStep(id);setEditing(true);}}];}} onSelect={id=>beginEdit(id)} onDependencies={(id,dependsOn,also)=>{setSteps(v=>materialize(v).map(s=>s.id===id?{...s,dependsOn}:also?.[s.id]?{...s,dependsOn:also[s.id]!}:s));setEditing(true);}} renderAction={id=><><small>{planStatus[steps.find(s=>s.id===id)!.status]}</small>{stageAction(steps.find(s=>s.id===id)!)}</>} onAdd={addStep}/>}
  {graph.cyclic&&<p role="alert">{uiText("Có vòng phụ thuộc; cần bỏ kết nối gây vòng lặp trước khi lưu.")}</p>}
  {editing?<label>{uiText("Bối cảnh, căn cứ và đối tượng")}<textarea rows={6} value={context} onChange={e=>setContext(e.target.value)}/></label>:context&&<details open><summary>{uiText("Bối cảnh và căn cứ")}</summary><Markdown text={context}/></details>}
  {plan.steps.some(s=>s.status==='interrupted')&&<p role="status">{uiText("Có bước bị gián đoạn. Tiếp tục giữ nguyên các bước đã xong; Chọn Đối chiếu khôi phục để kiểm tra tệp và xác nhận kết quả thực tế trước khi thử lại.")}</p>}
  <div className="plan-pipeline" aria-label={uiText("Tiến độ quy trình")}>{plan.steps.map((s,i)=><span key={s.id} className={`plan-stage plan-${s.status}`}>{i+1}. {s.goal}<small>{planStatus[s.status]}</small>{!showGraph&&stageAction(s)}</span>)}</div>
  {steps.map((s,i)=>{const content=<div className="plan-step" id={`plan-${plan.id}-${s.id}`} key={s.id}><span className="step-number">{i+1}</span><div>{editing?<fieldset className="wf-step-fields" disabled={running||saving}>
   <input aria-label={uiText("Mục tiêu")} value={s.goal} onChange={e=>patch(i,{goal:e.target.value})}/><textarea aria-label={uiText("Việc làm")} value={s.task} onChange={e=>patch(i,{task:e.target.value})}/>
   <input aria-label={uiText("Tệp liên quan")} value={s.files.join(', ')} onChange={e=>patch(i,{files:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})}/><input aria-label={uiText("Rủi ro")} value={s.risk} onChange={e=>patch(i,{risk:e.target.value})}/>
   <label>{uiText("Đầu vào (mỗi dòng một mục)")}<textarea value={(s.inputs??[]).join('\n')} onChange={e=>patch(i,{inputs:e.target.value.split('\n')})}/></label>
   <label>{uiText("Đầu ra (mỗi dòng một sản phẩm hoặc đường dẫn)")}<textarea value={(s.outputs??[]).join('\n')} onChange={e=>patch(i,{outputs:e.target.value.split('\n')})}/></label>
   <label>{uiText("Điều kiện hoàn thành")}<textarea value={s.completion??''} onChange={e=>patch(i,{completion:e.target.value})}/></label>
   <label>{uiText("Cách xử lí lỗi")}<textarea value={s.onError??''} onChange={e=>patch(i,{onError:e.target.value})}/></label>
   <fieldset><legend>{uiText("Các bước cần chờ")}</legend>{steps.filter(x=>x.id!==s.id).map(x=><label key={x.id}><input type="checkbox" checked={(s.dependsOn??[]).includes(x.id)} onChange={e=>patch(i,{dependsOn:e.target.checked?[...(s.dependsOn??[]),x.id]:(s.dependsOn??[]).filter(id=>id!==x.id)})}/>{x.goal}</label>)}</fieldset>
   <div className="row"><button disabled={!i} onClick={()=>setSteps(v=>{const n=[...v];[n[i-1],n[i]]=[n[i]!,n[i-1]!];return n;})}>↑</button><button disabled={i===steps.length-1} onClick={()=>setSteps(v=>{const n=[...v];[n[i+1],n[i]]=[n[i]!,n[i+1]!];return n;})}>↓</button><button onClick={()=>removeStep(s.id)}>{uiText("Xóa bước")}</button></div>
  </fieldset>:<><strong>{s.goal}</strong><p>{s.task}</p><dl><dt>{uiText("Đầu vào")}</dt><dd>{s.inputs?.join("; ")}</dd><dt>{uiText("Đầu ra")}</dt><dd>{s.outputs?.join("; ")}</dd><dt>{uiText("Hoàn thành khi")}</dt><dd>{s.completion}</dd><dt>{uiText("Xử lí lỗi")}</dt><dd>{s.onError}</dd><dt>{uiText("Chờ bước")}</dt><dd>{s.dependsOn?.map(id=>steps.find(x=>x.id===id)?.goal??uiText("Bước đã xóa")).join("; ")||uiText("Không")}</dd></dl><small>{uiText("Tệp:")} {s.files.join(', ')||uiText("Chưa xác định")} {uiText("· Rủi ro:")} {s.risk||uiText("Không")}</small><div className="step-state" role="status">{planStatus[s.status]}{s.error&&`: ${s.error}`}</div>
   {s.startedAt&&<p><time>{uiText("Bắt đầu:")} {new Date(s.startedAt).toLocaleString('vi-VN')}</time>{s.endedAt&&<> {uiText("· Kết thúc:")} {new Date(s.endedAt).toLocaleString('vi-VN')} · {Math.max(0,Math.round((s.endedAt-s.startedAt)/1000))} {uiText("giây")}</>}</p>}
   {!!s.logs?.length&&<details><summary>{uiText("Nhật kí bước")}</summary><ol>{s.logs.map((entry,n)=><li key={n}><time>{new Date(entry.at).toLocaleString('vi-VN')}</time> — {entry.text}</li>)}</ol></details>}
   {s.replacements&&<details><summary>{uiText("Đầu vào thay thế đã lưu")}</summary>{Object.entries(s.replacements).map(([id,value])=><div key={id}><strong>{steps.find(x=>x.id===id)?.goal}</strong><pre style={{whiteSpace:'pre-wrap'}}>{value}</pre></div>)}</details>}
   {s.status==='blocked'&&<div className="row">{steps.filter(d=>s.dependsOn?.includes(d.id)&&!s.replacements?.[d.id]?.trim()&&!(d.status==='done'&&d.output?.trim())).map(d=><button key={d.id} disabled={running} onClick={()=>setReplaceFor({stepId:s.id,stepGoal:s.goal,depId:d.id,depGoal:d.goal})}>{uiText("Bổ sung đầu vào:")} {d.goal}</button>)}</div>}
   {['done','error','interrupted'].includes(s.status)&&<PlanRecovery plan={plan} step={s} busy={running} report={report}/>}
   {s.output&&<details><summary>{uiText("Kết quả đã lưu")}</summary><Markdown text={s.output}/></details>}
   {['error','interrupted'].includes(s.status)&&<div className="row"><button disabled={running} onClick={()=>void run(s.id)}>{uiText("Thử lại bước này")}</button><button disabled={running} onClick={()=>{if(confirm(uiText("Bỏ qua “{0}”? Bước sau sẽ thiếu kết quả này.",[s.goal])))void rpc('skipPlanStep',{id:plan.id,stepId:s.id}).then(()=>run()).catch(report);}}>{uiText("Chấp nhận bỏ qua và tiếp tục")}</button></div>}
  </>}</div></div>;return selectedStep===s.id?<WorkflowDialog key={s.id} title={uiText("Sửa bước: {0}",[s.goal])} onClose={()=>setSelectedStep('')}>{content}</WorkflowDialog>:selectedStep?null:<React.Fragment key={s.id}>{content}</React.Fragment>;})}
  {!!plan.versions?.length&&<details><summary>{uiText("Các phiên bản trước")}</summary>{plan.versions.map(v=><details key={v.revision}><summary>{uiText("Phiên bản")} {v.revision} · {v.title}</summary><Markdown text={v.context??''}/>{v.steps.map(s=><div key={s.id}><strong>{s.goal}</strong><p>{s.task}</p><pre>{JSON.stringify({inputs:s.inputs,outputs:s.outputs,dependsOn:s.dependsOn,completion:s.completion,onError:s.onError},null,2)}</pre></div>)}</details>)}</details>}
  <div className="card-actions">{editing?<>{!showGraph&&<button disabled={saving||steps.length>=20} onClick={addStep}>{uiText("＋ Thêm bước")}</button>}<button disabled={saving} onClick={()=>{if(confirm(uiText("Bỏ các thay đổi chưa lưu?")))discard();}}>{uiText("Hủy sửa / tải bản mới")}</button><button disabled={saving||running||conflict||graph.cyclic} className="primary" onClick={()=>void save()}>{uiText("Lưu Plan và Quy trình")}</button></>:<>
   <button disabled={running} onClick={()=>beginEdit()}>{uiText("Chỉnh sửa trực tiếp")}</button>
   {state&&<button disabled={running} title={uiText("Chèn cả khối bước của quy trình mẫu vào cuối Plan, không đổi các bước cũ")} onClick={()=>setTemplateDialog(true)}>{uiText("Chèn quy trình mẫu")}</button>}
   {plan.workflowId&&<button onClick={()=>onWorkflow?onWorkflow(plan.workflowId!):void openPlanWorkflow(plan.workflowId!).catch(report)}>{uiText("Xem quy trình ↗")}</button>}
   <button onClick={()=>void rpc<string>('savePlan',{id:plan.id}).then(p=>notice(uiText("Đã lưu: {0}",[p]))).catch(report)}>{uiText("Lưu Markdown")}</button>
  </>}</div>
  {replaceFor&&<TextPromptDialog title={uiText("Bổ sung đầu vào")} label={uiText("Nhập nội dung thay thế kết quả “{0}” cho “{1}”. Nội dung này được lưu vào lượt chạy và gửi cho AI.",[replaceFor.depGoal,replaceFor.stepGoal])} confirmLabel={uiText("Lưu")} onClose={()=>setReplaceFor(null)} onSubmit={async value=>{try{await rpc('replacePlanInput',{id:plan.id,revision:plan.revision??0,stepId:replaceFor.stepId,dependencyId:replaceFor.depId,value});notice(uiText("Đã lưu đầu vào thay thế. Bấm Tiếp tục để chạy."));}catch(e){report(e);}}}/>}
  {templateDialog&&state&&<TemplateInsertDialog state={state} target={{planId:plan.id}} onClose={()=>setTemplateDialog(false)} onDone={()=>{localStorage.removeItem(key);setEditing(false);notice(uiText("Đã áp dụng quy trình mẫu. Xem lại Plan rồi bấm Duyệt và chạy."));}} report={report}/>}
 </section>;
}
