import {t as uiText} from './i18n';
import {MAX_WORKFLOW_STEPS} from '../../core/src/desktop/workflow-limits';
import {WorkflowDialog} from './WorkflowDialog';
import {WorkflowGraph} from './WorkflowGraph';
import {WorkflowBrowser} from './WorkflowBrowser';
import {PlanCard} from './PlanCard';
import {SaveTemplateDialog,TemplateInsertDialog,TemplateManager,type TemplateTarget} from './TemplateDialogs';
import {QuickFile} from './QuickFile';
import {LinkedNotebooks} from './LinkedNotebooks';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BUILTIN_PROMPTS,modelsOf,type ModelChoice} from '@pvta/shared';
import {rpc,pickFiles,type ViewState} from './ipc';
import type {Workflow,WorkflowStep,WorkflowRun,WorkflowStepRun} from '../../core/src/desktop/types';
import {Icon} from './Icon';
import {Badge,ToolButton,ToolGroup,ToolSep,WfGlyph} from './WorkflowToolkit';
import {CodeApproval} from './CodeApproval';
import {StepComposer} from './StepComposer';
import {StepInputsZone,StepOutputsZone,stepDiagnostic,stepDirectives,stepVariables} from './WorkflowStepZones';
import './workflow.css';
import {forkWorkflow,insertWorkflowAfter,layoutWorkflow} from './workflow-graph';

import {copyWorkflow,exportWorkflow,importWorkflow,type WorkflowDraft as BaseDraft} from './workflow-tools';
type Draft=BaseDraft&{planRevision?:number};
import {choiceKey,parseKey,modelGroups} from './model-groups';
const STATUS:Record<string,string>={blocked:uiText("Bị chặn"),waiting:uiText("Chờ"),running:uiText("Đang chạy"),success:'Xong',error:uiText("Lỗi"),skipped:uiText("Bỏ qua"),cancelled:uiText("Đã dừng"),paused:uiText("Chờ duyệt nấc tiếp theo")};
const newStep=():WorkflowStep=>({id:crypto.randomUUID(),name:uiText("Bước mới"),prompt:'',choice:'auto',access:'read'});
const duration=(a?:number,b?:number)=>{if(!a)return '';const s=Math.max(0,Math.round(((b??Date.now())-a)/1000));return s<60?uiText("{0} giây",[s]):uiText("{0} phút {1} giây",[Math.floor(s/60),s%60]);};
const clock=(t:number)=>new Date(t).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});

function StatusDot({status}:{status:string}){return <span className={`wf-dot wf-${status}`} title={STATUS[status]??status} aria-label={STATUS[status]??status}>{status==='success'?'✓':status==='error'?'!':status==='skipped'?'–':''}</span>;}


export function WorkflowPanel({state,report,notice,onAutoCreate,selectedId,navigationRequest}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;onAutoCreate:()=>void;selectedId?:string;navigationRequest?:{id:string}}){
 const list=state.data.workflows??[];
 const [libraryWidth,setLibraryWidth]=useState(()=>{try{const value=Number(localStorage.getItem('pvta.workflowLibraryWidth'));return value>=20&&value<=60?value:36;}catch{return 36;}});
 const [libraryHidden,setLibraryHidden]=useState(false);
 const [hidden,setHidden]=useState<{setup:boolean;history:boolean}>(()=>{try{const v=JSON.parse(localStorage.getItem('pvta.workflowSections')??'{}');return {setup:v?.setup===true,history:v?.history===true};}catch{return {setup:false,history:false};}});
 const saveSections=(next:{setup:boolean;history:boolean})=>{try{localStorage.setItem('pvta.workflowSections',JSON.stringify(next));}catch{}return next;};
 const toggleSection=(key:'setup'|'history')=>setHidden(h=>saveSections({...h,[key]:!h[key]}));
 const layoutRef=useRef<HTMLDivElement>(null);
 const resizeLibrary=(value:number)=>{const width=Math.max(20,Math.min(60,value));setLibraryWidth(width);try{localStorage.setItem('pvta.workflowLibraryWidth',String(width));}catch{}};

 const [selId,setSelId]=useState(navigationRequest?.id??selectedId??'');
 const [draft,setDraft]=useState<Draft|null>(null);
 const [dirty,setDirty]=useState(false);
 const [stepId,setStepId]=useState('');
 const [openRun,setOpenRun]=useState('');
 const [tab,setTab]=useState<'workflows'|'templates'>('workflows');
 const [markdownRequest,setMarkdownRequest]=useState(0);
 const [saveTpl,setSaveTpl]=useState(false),[openTplId,setOpenTplId]=useState('');
 const [tplView,setTplView]=useState<null|{kind:'apply';target:TemplateTarget;templateId?:string}>(null);
 const [transfer,setTransfer]=useState<null|'import'|'export'>(null),[transferText,setTransferText]=useState('');
 const undo=useRef<Draft[]>([]),redo=useRef<Draft[]>([]);
 const mayLeave=()=>!dirty||confirm(uiText("Có thay đổi chưa lưu. Bỏ các thay đổi và tiếp tục?"));
 const select=(id:string)=>{if(id!==selId&&mayLeave())setSelId(id);};
 const saved=list.find(w=>w.id===selId);
 const linked=state.data.chats.flatMap(c=>c.messages).find(m=>m.plan?.id===saved?.planId)?.plan;
 const templates=[...BUILTIN_PROMPTS,...state.prompts.own];
 const groups=useMemo(()=>modelGroups(state),[state]);
 // Trạng thái thao tác theo ID quy trình: thao tác trên quy trình này không khóa quy trình khác.
 const [runPending,setRunPending]=useState<readonly string[]>([]);const operation=useRef(new Set<string>());
 const libraryOperation=useRef(new Set<string>()),[libraryPending,setLibraryPending]=useState<readonly string[]>([]);
 async function libraryAction(id:string,action:()=>Promise<unknown>){if(libraryOperation.current.has(id))return;libraryOperation.current.add(id);setLibraryPending(v=>[...v,id]);try{await action();}catch(e){report(e);}finally{libraryOperation.current.delete(id);setLibraryPending(v=>v.filter(x=>x!==id));}}
 const running=!!saved&&(runPending.includes(saved.id)||saved.runs.some(r=>r.status==='running'));
 // Kết quả bất đồng bộ phải đối chiếu với quy trình đã bắt đầu thao tác, không với quy trình đang chọn lúc trả về.
 const selRef=useRef(selId),dirtyRef=useRef(false),versionRef=useRef(0);
 selRef.current=selId;dirtyRef.current=dirty;
 // Chỉ chuyển sang bản mới khi người dùng vẫn ở quy trình đã bắt đầu và không có thay đổi chưa lưu.
 const openIfIdle=(newId:string,fromId:string,doneText:string)=>{if(selRef.current===fromId&&!dirtyRef.current){setSelId(newId);notice(doneText);return true;}notice(`${doneText} ${uiText("Có thay đổi chưa lưu nên chưa mở; chọn trong thư viện để mở.")}`);return false;};

 // Nạp bản nháp khi đổi quy trình; không ghi đè khi thầy cô đang sửa dở.
 useEffect(()=>{
  if(!saved){setDraft(null);return;}
  setDraft(d=>d&&d.id===saved.id&&dirty?d:{id:saved.id,name:saved.name,folder:saved.folder,input:saved.input,steps:saved.steps,mode:saved.mode,maxConcurrency:saved.maxConcurrency,pinned:saved.pinned,frames:saved.frames,suggestedLinks:saved.suggestedLinks,outputDir:saved.outputDir,attachments:saved.attachments,codeTimeoutMs:saved.codeTimeoutMs,planRevision:linked?.revision??0});
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[saved?.id,saved?.updatedAt,linked?.revision]);
 useEffect(()=>{setStepId('');setOpenRun('');setDirty(false);undo.current=[];redo.current=[];},[selId]);
 useEffect(()=>{if(selectedId&&selectedId!==selId)select(selectedId);},[selectedId]);
 useEffect(()=>{if(navigationRequest)select(navigationRequest.id);},[navigationRequest]);
 useEffect(()=>{if(!dirty)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return ()=>window.removeEventListener('beforeunload',guard);},[dirty]);

 const edit=(f:(d:Draft)=>Draft)=>{if(!draft)return;undo.current=[...undo.current.slice(-49),structuredClone(draft)];redo.current=[];versionRef.current++;setDraft(f(draft));setDirty(true);};
 function history(back:boolean){if(!draft)return;const from=back?undo:redo,to=back?redo:undo;const next=from.current.pop();if(next){to.current.push(structuredClone(draft));versionRef.current++;setDraft(next);setStepId(id=>next.steps.some(s=>s.id===id)?id:'');setDirty(true);}}
 async function duplicate(target=saved){const source=target?.id===draft?.id?draft:target;if(!source)return;if(target?.id===draft?.id&&dirty&&!confirm(uiText("Nhân bản từ nội dung đang sửa? Các thay đổi chỉ được lưu vào bản sao, bản gốc giữ nguyên.")))return;const from=selRef.current;try{const copy=copyWorkflow(source);await rpc('workflowSave',{workflow:copy});openIfIdle(copy.id,from,uiText("Đã nhân bản, không sao chép lịch sử chạy."));}catch(e){report(e);}}
 async function loadTemplate(){if(!mayLeave())return;const from=selRef.current;try{const copy=importWorkflow(transferText);await rpc('workflowSave',{workflow:copy});setTransfer(null);openIfIdle(copy.id,from,uiText("Đã nhập mẫu ở quyền Chỉ đọc. Kiểm tra prompt và model trước khi chạy."));}catch(e){report(e);}}
 function downloadTemplate(){try{const url=URL.createObjectURL(new Blob([transferText],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='quy-trinh-pvta.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){report(e);}}
 const patchStep=(id:string,p:Partial<WorkflowStep>)=>edit(d=>({...d,steps:d.steps.map(s=>s.id===id?{...s,...p}:s)}));
 const step=draft?.steps.find(s=>s.id===stepId);
 const graph=useMemo(()=>layoutWorkflow(draft?.steps??[]),[draft?.steps]);

 async function create(parallel=false){
  if(!mayLeave())return;
  const from=selRef.current;
  try{
   const id=crypto.randomUUID();
   const a={...newStep(),name:uiText("Nhánh 1"),dependsOn:[]};
   const b={...newStep(),name:uiText("Nhánh 2"),dependsOn:[]};
   await rpc('workflowSave',{workflow:{id,name:parallel?uiText("Quy trình đa nhánh"):uiText("Quy trình mới"),mode:parallel?'parallel':'sequential',maxConcurrency:2,steps:parallel?[a,b,{...newStep(),name:uiText("Tổng hợp"),prompt:uiText("Tổng hợp kết quả từ các nhánh sau:\n{{prev}}"),dependsOn:[a.id,b.id]}]:[{...newStep(),name:uiText("Bước 1")}]}});
   openIfIdle(id,from,uiText("Đã tạo quy trình mới."));
  }catch(e){report(e);}
 }
 async function save(){
  if(!draft)return false;
  const id=draft.id,version=versionRef.current;
  try{await rpc('workflowSave',{workflow:draft});if(selRef.current===id&&versionRef.current===version)setDirty(false);return true;}catch(e){report(e);return false;}
 }
 async function run(retry=false,targetId?:string){
  if(!draft||operation.current.has(draft.id)||running)return;
  const id=draft.id;
  const risky=targetId?draft.steps.find(s=>s.id===targetId)?.access==='full'&&['error','cancelled'].includes(saved?.runs[0]?.status??''):retry&&draft.steps.some(s=>s.access==='full');
  if(risky&&!confirm(uiText("Bước lỗi có thể đã sửa tệp trước khi dừng. Hãy đối chiếu tệp; tiếp tục chạy lại phần lỗi?")))return;
  operation.current.add(id);setRunPending(v=>[...v,id]);
  try{
   if(targetId&&dirty)return;
   const version=versionRef.current;
   if(dirty&&!(await save()))return;
   // Nếu người dùng sửa trong lúc lưu, không chạy bản cũ; yêu cầu chạy lại sau khi kiểm tra.
   if(versionRef.current!==version){notice(uiText("Nội dung đã đổi trong lúc lưu. Chưa chạy; hãy kiểm tra rồi chạy lại."));return;}
   if(selRef.current===id)setOpenRun('');
   await rpc('workflowRun',{id,retry,...(targetId?{stepId:targetId}:{})});
  }catch(e){report(e);}finally{operation.current.delete(id);setRunPending(v=>v.filter(x=>x!==id));}
 }
 async function remove(target=saved){
  if(!target)return;
  if(operation.current.has(target.id)||target.runs.some(r=>r.status==='running')){report(Error(uiText("Dừng quy trình trước khi xóa.")));return;}
  if(target.id===selRef.current&&!mayLeave())return;
  if(!confirm(uiText("Xóa quy trình “{0}” và lịch sử chạy khỏi danh sách? Tệp kết quả và Plan trong hội thoại vẫn được giữ.",[target.name])))return;
  try{await rpc('workflowDelete',{id:target.id});setSelId(cur=>cur===target.id?'':cur);notice(uiText("Đã xóa quy trình khỏi danh sách."));}catch(e){report(e);}
 }
 async function chooseInputFile(directory:boolean){try{const p=await pickFiles(directory,{name:uiText("Văn bản, PDF và Office"),extensions:['docx','xlsx','pptx','pdf','txt','md','typ','csv']});if(p[0])edit(d=>({...d,input:{kind:directory?'folder':'file',value:p[0]!}}));}catch(e){report(e);}}
 async function chooseFolder(){try{const p=await pickFiles(true);if(p[0])edit(d=>({...d,folder:p[0]}));}catch(e){report(e);}}
 function move(i:number,dir:-1|1){edit(d=>{const s=[...d.steps];const j=i+dir;if(j<0||j>=s.length)return d;[s[i],s[j]]=[s[j]!,s[i]!];return {...d,steps:s};});}
 function insert(at:number){const s=newStep();edit(d=>({...d,steps:[...d.steps.slice(0,at),s,...d.steps.slice(at)]}));setStepId(s.id);}

 // Trạng thái hiển thị trên từng nút: lấy từ lần chạy mới nhất.
 const latest:WorkflowRun|undefined=saved?.runs[0];
 const runOf=(id:string):WorkflowStepRun|undefined=>latest?.steps.find(s=>s.stepId===id);

 const stageAction=(s:WorkflowStep,i:number)=>{
  const deps=draft?.mode==='parallel'?(s.dependsOn??[]):i>0?[draft!.steps[i-1]!.id]:[];
  const missing=deps.filter(id=>runOf(id)?.status!=='success');
  const status=runOf(s.id)?.status;
  const reason=dirty?uiText("Lưu thay đổi trước khi duyệt."):running?uiText("Chờ công việc đang chạy kết thúc."):status==='success'?uiText("Giai đoạn đã hoàn tất."):missing.length?'Chờ các bước trước hoàn tất: '+missing.map(id=>draft?.steps.find(s=>s.id===id)?.name??id).join(', '):'';
  return <div className="stage-approval">{status==='success'?<span className="wf-completed" role="status">{uiText("✓ Đã hoàn tất")}</span>:<button className="primary" aria-label={uiText("Duyệt và chạy nấc: {0}",[s.name])} disabled={!!reason} title={reason||uiText("Chỉ chạy nấc này.")} onClick={()=>void run(false,s.id)}>{uiText("Duyệt và chạy")}</button>}{reason&&<small>{reason}</small>}</div>;
 };

 return <div className="workspace-panel wf wf-manager">
  <span className="eyebrow">{uiText("TỰ ĐỘNG HÓA")}</span><h1>{uiText("Quy trình")}</h1>
  <p className="muted wf-intro">{uiText("Duyệt, sắp xếp và làm việc với các quy trình của bạn.")}</p>
  <div className="wf-tabs" role="tablist" aria-label={uiText("Mục quản lí")}><button role="tab" aria-selected={tab==='workflows'} className={tab==='workflows'?'primary':''} onClick={()=>setTab('workflows')}>{uiText("Quy trình")}</button><button role="tab" aria-selected={tab==='templates'} className={tab==='templates'?'primary':''} onClick={()=>setTab('templates')}>{uiText("Quy trình mẫu")} ({(state.data.workflowTemplates??[]).length})</button></div>
  <button onClick={()=>{setTab('templates');setMarkdownRequest(n=>n+1);}}>Dựng từ Markdown</button>
  <div role="tabpanel" aria-label={uiText("Quy trình mẫu")} hidden={tab!=='templates'}><TemplateManager inline markdownRequest={markdownRequest} openId={openTplId} state={state} report={report} notice={notice} onClose={()=>setTab('workflows')} onUse={templateId=>setTplView({kind:'apply',target:{},templateId})}/></div>
  <div role="tabpanel" aria-label={uiText("Quy trình")} hidden={tab!=='workflows'}>
  <div className="wf-create-bar" aria-label={uiText("Tạo và nhập quy trình")}><strong>{uiText("TẠO QUY TRÌNH")}</strong><button className="primary" onClick={()=>{if(mayLeave())onAutoCreate();}}><Icon name="spark"/> {uiText("Tự tạo quy trình")}</button><button onClick={()=>void create()}>{uiText("＋ Quy trình mới")}</button><button onClick={()=>void create(true)}>{uiText("＋ Đa nhánh")}</button><span/><button onClick={()=>setTab('templates')}>{uiText("Quy trình mẫu")}</button><button onClick={()=>{setTransfer('import');setTransferText('');}}>{uiText("Nhập mẫu JSON")}</button></div>
  {transfer&&<section className="wf-editor" aria-label={transfer==='import'?uiText("Nhập mẫu"):uiText("Xuất mẫu")}><strong>{transfer==='import'?uiText("Nhập mẫu quy trình"):uiText("Xuất mẫu quy trình")}</strong><p className="muted small">{uiText("Mẫu chứa prompt và cấu trúc bước; không chứa lịch sử, đường dẫn hoặc nội dung đầu vào. Hãy kiểm tra prompt có thông tin riêng trước khi chia sẻ. Khi nhập, model chuyển về Tự động và quyền về Chỉ đọc.")}</p>{transfer==='import'&&<input aria-label={uiText("Chọn tệp mẫu JSON")} type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>2_400_000){report(Error(uiText("Tệp mẫu quá lớn.")));return;}void file.text().then(setTransferText).catch(report);}}}/>}<textarea rows={8} aria-label={uiText("Nội dung mẫu JSON")} readOnly={transfer==='export'} value={transferText} onChange={e=>setTransferText(e.target.value)}/><div className="wf-actions">{transfer==='import'?<button disabled={!transferText.trim()} onClick={()=>void loadTemplate()}>{uiText("Nhập thành quy trình mới")}</button>:<><button onClick={downloadTemplate}>{uiText("Tải mẫu JSON")}</button><button onClick={()=>void navigator.clipboard.writeText(transferText).then(()=>notice(uiText("Đã sao chép mẫu."))).catch(report)}>{uiText("Sao chép JSON")}</button></>}<button onClick={()=>setTransfer(null)}>{uiText("Đóng")}</button></div></section>}
  <div className="wf-layout-controls"><button aria-expanded={!libraryHidden} onClick={()=>setLibraryHidden(v=>!v)}>{libraryHidden?uiText("Hiện thư viện"):uiText("Thu gọn thư viện")}</button><button aria-expanded={!hidden.setup} title={uiText("Ẩn hoặc hiện phần thiết lập: sổ nguồn, cách chạy, đầu vào, thư mục")} onClick={()=>toggleSection('setup')}>{hidden.setup?uiText("Hiện thiết lập"):uiText("Ẩn thiết lập")}</button><button aria-expanded={!hidden.history} title={uiText("Ẩn hoặc hiện lịch sử chạy")} onClick={()=>toggleSection('history')}>{hidden.history?uiText("Hiện lịch sử chạy"):uiText("Ẩn lịch sử chạy")}</button><button onClick={()=>{resizeLibrary(36);setLibraryHidden(false);setHidden(saveSections({setup:false,history:false}));layoutRef.current?.querySelectorAll<HTMLElement>('.wf-canvas,.wf-browser-items').forEach(el=>el.style.removeProperty('height'));}}>{uiText("Đặt lại bố cục")}</button><small>{uiText("Kéo thanh chia để đổi độ rộng · Kéo góc dưới sơ đồ để đổi chiều cao · ⌘/Ctrl + lăn hoặc ⌘/Ctrl + (+, −) để thu phóng sơ đồ")}</small></div>
  <div ref={layoutRef} className={`wf-layout wf-resizable ${libraryHidden?'wf-library-hidden':''}`} style={{'--wf-library-width':`${libraryWidth}%`} as React.CSSProperties}>
   <div className="wf-library-pane" hidden={libraryHidden}><WorkflowBrowser state={state} selectedId={selId} onSelect={select} onDelete={w=>void libraryAction(w.id,()=>remove(w))} busyIds={libraryPending} runningIds={runPending} onError={report} onDuplicate={w=>libraryAction(w.id,()=>duplicate(w))} onExport={w=>{setTransfer('export');setTransferText(exportWorkflow(w.id===draft?.id?draft:w));}} onPin={w=>libraryAction(w.id,async()=>{if(w.id===draft?.id&&dirty){edit(d=>({...d,pinned:!d.pinned}));return;}await rpc('workflowPin',{id:w.id,pinned:!w.pinned});})}/></div>
   {!libraryHidden&&<div className="wf-divider" role="separator" tabIndex={0} aria-label={uiText("Độ rộng thư viện quy trình")} aria-orientation="vertical" aria-valuemin={20} aria-valuemax={60} aria-valuenow={Math.round(libraryWidth)} onDoubleClick={()=>resizeLibrary(36)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resizeLibrary(libraryWidth+(e.key==='ArrowLeft'?-2:2));}else if(e.key==='Home'){e.preventDefault();resizeLibrary(36);}}} onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=layoutRef.current!.getBoundingClientRect();resizeLibrary((e.clientX-rect.left)/rect.width*100);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/>}
   {draft&&saved?<section className="wf-main" aria-label={uiText("Khu vực làm việc quy trình")}>
    <div className="wf-head">
     <input className="wf-name" aria-label={uiText("Tên quy trình")} disabled={running} value={draft.name} maxLength={100} onChange={e=>edit(d=>({...d,name:e.target.value}))}/>
     <div className="wf-actions">
      {running?<ToolButton icon="stop" tone="danger" onClick={()=>void rpc('workflowCancel',{id:draft.id}).catch(report)}>{uiText("Dừng")}</ToolButton>:<ToolButton icon="play" tone="primary" disabled={!draft.steps.length} onClick={()=>void run()}>{uiText("Chạy")}</ToolButton>}
      <ToolButton icon="retry" disabled={running||!latest||!['error','cancelled'].includes(latest.status)} onClick={()=>void run(true)}>{uiText("Chạy lại phần lỗi")}</ToolButton>
      <ToolSep/>
      <ToolButton icon="trash" tone="danger" disabled={running} onClick={()=>void remove()} aria-label={uiText("Xóa quy trình")}>{uiText("Xóa")}</ToolButton>
     </div>
    </div>
    <div className="wf-toolbar" role="toolbar" aria-label={uiText("Công cụ quản lí quy trình")}>
     <ToolGroup label={uiText("Chỉnh sửa")}>
      <ToolButton icon="undo" disabled={running||!undo.current.length} onClick={()=>history(true)}>{uiText("Hoàn tác")}</ToolButton>
      <ToolButton icon="redo" disabled={running||!redo.current.length} onClick={()=>history(false)}>{uiText("Làm lại")}</ToolButton>
      <ToolButton icon="save" tone="primary" disabled={!dirty||running} onClick={()=>void save().then(ok=>ok&&notice(uiText("Đã lưu quy trình.")))}>{dirty?uiText("Lưu thay đổi"):uiText("Đã lưu")}</ToolButton>
     </ToolGroup>
     <ToolSep/>
     <ToolGroup label={uiText("Quản lí")}>
      <ToolButton icon="pin" aria-pressed={!!draft.pinned} className={draft.pinned?'on':''} disabled={running} onClick={()=>edit(d=>({...d,pinned:!d.pinned}))}>{draft.pinned?uiText("Bỏ ghim"):uiText("Ghim quy trình")}</ToolButton>
      <ToolButton icon="copy" onClick={()=>void duplicate()}>{uiText("Nhân bản")}</ToolButton>
     </ToolGroup>
     <ToolSep/>
     <ToolGroup label={uiText("Mẫu")}>
      <ToolButton icon="insert" disabled={running||dirty} title={dirty?uiText("Lưu thay đổi trước."):uiText("Chèn cả khối bước của quy trình mẫu vào cuối quy trình")} onClick={()=>setTplView({kind:'apply',target:{workflowId:draft.id}})}>{uiText("Chèn quy trình mẫu")}</ToolButton>
      <ToolButton icon="template" disabled={running} title={uiText("Lưu cấu trúc các bước thành mẫu dùng lại")} onClick={()=>void(async()=>{if(dirty&&!(await save()))return;setSaveTpl(true);})()}>{uiText("Lưu thành mẫu")}</ToolButton>
      <ToolButton icon="export" onClick={()=>{setTransfer('export');setTransferText(exportWorkflow(draft));}}>{uiText("Xuất mẫu")}</ToolButton>
     </ToolGroup>
     <ToolSep/>
     <ToolGroup label={uiText("Thay đổi")}>
      <ToolButton icon="discard" tone="danger" disabled={!dirty||running} onClick={()=>{if(confirm(uiText("Bỏ toàn bộ thay đổi chưa lưu?"))){setDraft({id:saved.id,name:saved.name,steps:saved.steps,folder:saved.folder,input:saved.input,mode:saved.mode,maxConcurrency:saved.maxConcurrency,pinned:saved.pinned,frames:saved.frames,suggestedLinks:saved.suggestedLinks,outputDir:saved.outputDir,attachments:saved.attachments,codeTimeoutMs:saved.codeTimeoutMs,planRevision:linked?.revision??0});setDirty(false);undo.current=[];redo.current=[];}}}>{uiText("Bỏ thay đổi")}</ToolButton>
     </ToolGroup>
    </div>
    {dirty&&<p className="muted small" role="status">{uiText("Có thay đổi chưa lưu. Bấm Lưu thay đổi để lưu cả trạng thái ghim.")}</p>}
    {latest&&<div className="wf-progress"><label>{uiText("Tiến độ lần chạy gần nhất")}<progress max={Math.max(1,latest.steps.length)} value={latest.steps.filter(s=>!['running','waiting'].includes(s.status)).length}/></label><span>{latest.steps.filter(s=>s.status==='success').length} {uiText("hoàn tất ·")} {latest.steps.filter(s=>s.status==='error').length} {uiText("lỗi ·")} {latest.steps.filter(s=>s.status==='waiting').length} {uiText("chờ")}</span></div>}
    {!hidden.setup&&<>
    <div className="wf-editor">
     <LinkedNotebooks compact scope="workflow" id={saved.id} ids={saved.notebookIds} report={report}/>
    <label>{uiText("Cách chạy")}<select disabled={running} value={draft.mode??'sequential'} onChange={e=>{const mode=e.target.value as 'sequential'|'parallel';edit(d=>({...d,mode,steps:mode==='parallel'?d.steps.map((s,i)=>({...s,dependsOn:s.dependsOn??(i?[d.steps[i-1]!.id]:[])})):d.steps}));}}><option value="sequential">{uiText("Tuần tự")}</option><option value="parallel">{uiText("Đa nhánh")}</option></select></label>
     {draft.mode==='parallel'&&<label>{uiText("Số bước chạy đồng thời")}<select disabled={running} value={draft.maxConcurrency??2} onChange={e=>{const maxConcurrency=Number(e.target.value);edit(d=>({...d,maxConcurrency}));}}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select><small>{uiText("Bước Chỉnh sửa chạy độc quyền giữa các quy trình. Tốc độ còn phụ thuộc RAM và giới hạn của AI.")}</small></label>}
     <label>{uiText("Đầu vào quy trình")}<select aria-label={uiText("Loại đầu vào")} disabled={running} value={draft.input?.kind??''} onChange={e=>{const kind=e.target.value as NonNullable<Workflow['input']>['kind'];edit(d=>({...d,input:kind?{kind,value:''}:undefined}));}}>
      <option value="">{uiText("Chỉ dùng prompt của từng bước")}</option><option value="folder">{uiText("Thư mục")}</option><option value="file">{uiText("Một tệp")}</option><option value="chat">{uiText("Nội dung chat của người dùng")}</option><option value="prompt">{uiText("Prompt mẫu")}</option>
     </select></label>
     {(draft.input?.kind==='folder'||draft.input?.kind==='file')&&<div className="wf-folder"><code>{draft.input.kind==='file'&&draft.input.value?<QuickFile path={draft.input.value}/>:draft.input.value||uiText("Chưa chọn")}</code><button disabled={running} onClick={()=>void chooseInputFile(draft.input?.kind==='folder')}>{uiText("Chọn")} {draft.input.kind==='folder'?uiText("thư mục"):uiText("tệp")}</button></div>}
     {draft.input?.kind==='chat'&&<label>{uiText("Lấy nội dung từ hội thoại")}<select disabled={running} value="" onChange={e=>{const c=state.data.chats.find(c=>c.id===e.target.value);if(c)edit(d=>({...d,input:{kind:'chat',value:c.messages.filter(m=>m.role==='user').map(m=>m.text).join('\n\n')}}));}}><option value="">{uiText("Chọn hội thoại hoặc nhập trực tiếp bên dưới")}</option>{state.data.chats.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
     {draft.input?.kind==='prompt'&&<label>{uiText("Thư viện prompt")}<select disabled={running} value="" onChange={e=>{const p=templates.find(p=>p.id===e.target.value);if(p)edit(d=>({...d,input:{kind:'prompt',value:p.text}}));}}><option value="">{uiText("Chọn mẫu hoặc nhập mẫu riêng bên dưới")}</option>{templates.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
     {(draft.input?.kind==='chat'||draft.input?.kind==='prompt')&&<label>{draft.input.kind==='chat'?uiText("Nội dung chat đầu vào"):uiText("Nội dung prompt mẫu")}<textarea rows={5} disabled={running} value={draft.input.value} onChange={e=>{const value=e.target.value;edit(d=>({...d,input:{...d.input!,value}}));}}/><small>{uiText("Nội dung được lưu cùng quy trình; có thể chỉnh lại trước khi chạy. Tối đa 60.000 ký tự.")}</small></label>}
     <p className="muted small">{uiText("Đầu vào được chuyển tới từng bước. Dùng")}<code>{'{{input}}'}</code> {uiText("để chèn tại vị trí mong muốn. Không cần chọn thư mục khi xử lý tệp, nội dung chat hoặc prompt mẫu ở chế độ chỉ đọc.")}</p>
    </div>
    <div className="wf-folder"><span>{uiText("Thư mục để sửa tệp (nếu cần):")}</span><code>{draft.folder??(draft.input?.kind==='folder'?draft.input.value:uiText("chưa chọn — chỉ cần cho nút Chỉnh sửa"))}</code><button onClick={()=>void chooseFolder()} disabled={running}><Icon name="folder-add" size={16}/> {uiText("Chọn")}</button>{draft.folder&&<button onClick={()=>edit(d=>({...d,folder:undefined}))} disabled={running}>{uiText("Bỏ")}</button>}</div>

    {(draft.frames??[]).some(f=>/\{\{[^{}]*=|!\{\{/.test(f.decl))&&<div className="wf-codebox" aria-label={uiText("Chạy mã trong khung")}>
     <header><WfGlyph name="shield" size={15}/><strong>{uiText("Chạy mã trong khung")}</strong><Badge tone={draft.outputDir?'ok':'warn'}>{draft.outputDir?uiText("Đã chọn thư mục đầu ra"):uiText("Bắt buộc chọn thư mục đầu ra")}</Badge></header>
     <p className="muted small">{uiText("Mỗi lượt chạy tạo một thư mục con trong thư mục đầu ra, chép vào đó mọi tệp và thư mục đính kèm (không giới hạn dung lượng), rồi sinh mã, phản biện, xin bạn duyệt và chạy tại đó. Bản gốc không bị sửa. Mặc định mỗi lần chạy mã tối đa 30 phút.")}</p>
     <div className="wf-folder"><span>{uiText("Thư mục đầu ra:")}</span><code>{draft.outputDir??uiText("chưa chọn")}</code><ToolButton icon="folder" disabled={running} onClick={()=>void(async()=>{try{const p=await pickFiles(true);if(p[0])edit(d=>({...d,outputDir:p[0]}));}catch(e){report(e);}})()}>{uiText("Chọn")}</ToolButton>{draft.outputDir&&<ToolButton icon="x" disabled={running} onClick={()=>edit(d=>({...d,outputDir:undefined}))}>{uiText("Bỏ")}</ToolButton>}</div>
     <div className="wf-folder"><span>{uiText("Đính kèm:")}</span>{(draft.attachments??[]).map(a=><code key={a} className="wf-attach">{a}<button type="button" aria-label={uiText("Bỏ đính kèm {0}",[a])} disabled={running} onClick={()=>edit(d=>({...d,attachments:(d.attachments??[]).filter(x=>x!==a)}))}><WfGlyph name="x" size={10}/></button></code>)}{!draft.attachments?.length&&<small className="muted">{uiText("chưa có")}</small>}<ToolButton icon="plus" disabled={running} onClick={()=>void(async()=>{try{const p=await pickFiles(false);if(p.length)edit(d=>({...d,attachments:[...new Set([...(d.attachments??[]),...p])]}));}catch(e){report(e);}})()}>{uiText("Tệp")}</ToolButton><ToolButton icon="folder" disabled={running} onClick={()=>void(async()=>{try{const p=await pickFiles(true);if(p[0])edit(d=>({...d,attachments:[...new Set([...(d.attachments??[]),p[0]!])]}));}catch(e){report(e);}})()}>{uiText("Thư mục")}</ToolButton></div>
    </div>}
    </>}
    {latest?.steps.filter(x=>x.code?.decision==='waiting').map(x=><CodeApproval key={x.stepId} workflowId={saved.id} runId={latest.id} step={x} workdir={latest.workdir} report={report}/>)}
    {draft.mode==='parallel'&&<div className="wf-graph-help"><p className="muted small">{uiText("Các nút cùng cột có thể chạy đồng thời. Mũi tên thể hiện bước cần chờ; một nút có thể nhận kết quả từ nhiều nhánh. Mở menu ⋯ trên bước → “Tạo nhánh song song” để thêm nhánh và nối vào bước tổng hợp phía sau.")}</p><button disabled={running||draft.steps.length>=MAX_WORKFLOW_STEPS} onClick={()=>insert(draft.steps.length)}>{uiText("＋ Nhánh độc lập")}</button>{graph.cyclic&&<p role="alert" className="wf-warn">{uiText("Quan hệ chờ đang tạo vòng lặp. Bỏ kết nối gây vòng lặp trước khi lưu hoặc chạy.")}</p>}</div>}
    <WorkflowGraph maxSteps={linked?20:MAX_WORKFLOW_STEPS} key={draft.id} storageKey={`pvta:graph:workflow:${draft.id}`} frames={draft.frames??[]} onFrames={frames=>edit(d=>({...d,frames}))} suggested={draft.suggestedLinks} onResolveLink={(linkId,accept)=>void(async()=>{try{if(dirty&&!(await save()))return;await rpc('workflowLinkResolve',{workflowId:draft.id,linkId,accept});notice(accept?uiText("Đã nối: liên kết nét đứt thành phụ thuộc thật."):uiText("Đã bỏ gợi ý liên kết."));}catch(e){report(e);}})()} nodes={draft.steps.map((s,i)=>({...s,fresh:!!s.insertGroup,status:runOf(s.id)?.status??'waiting',dependsOn:draft.mode==='parallel'?(s.dependsOn??[]):i?[draft.steps[i-1]!.id]:[]}))} disabled={running} onSelect={setStepId} nodeCommands={id=>{
     const i=draft.steps.findIndex(s=>s.id===id);const full=draft.steps.length>=MAX_WORKFLOW_STEPS?`Đã đạt giới hạn ${MAX_WORKFLOW_STEPS} bước.`:undefined;
     return [
      {id:'after',label:uiText("Thêm bước sau"),icon:'＋',group:'structure',disabledReason:full,run:()=>{if(draft.mode!=='parallel'){insert(i+1);return;}const s=newStep();edit(d=>({...d,steps:insertWorkflowAfter(d.steps,id,s)}));setStepId(s.id);}},
      {id:'fork',label:uiText("Tạo nhánh song song"),icon:'⑂',group:'structure',disabledReason:full,run:()=>{const s={...newStep(),name:uiText("Nhánh mới")};edit(d=>({...d,mode:'parallel',maxConcurrency:Math.max(2,d.maxConcurrency??2),steps:forkWorkflow(d.steps.map((s,i)=>({...s,dependsOn:d.mode==='parallel'?(s.dependsOn??[]):i?[d.steps[i-1]!.id]:[]})),id,s)}));setStepId(s.id);}},
      ...(draft.mode==='parallel'?[]:[{id:'earlier',label:uiText("Dời lên trước"),icon:'↑',group:'order',disabledReason:i===0?uiText("Đã là bước đầu."):undefined,run:()=>move(i,-1)},{id:'later',label:uiText("Dời xuống sau"),icon:'↓',group:'order',disabledReason:i===draft.steps.length-1?uiText("Đã là bước cuối."):undefined,run:()=>move(i,1)}]),
      {id:'delete',label:uiText("Xóa bước"),icon:uiText("×"),group:'danger',danger:true,run:()=>{edit(d=>({...d,steps:d.steps.filter(s=>s.id!==id).map(s=>({...s,dependsOn:s.dependsOn?.filter(x=>x!==id)}))}));setStepId('');}},
     ];
    }} onDependencies={(id,dependsOn,also)=>edit(d=>({...d,mode:'parallel',steps:d.steps.map((s,i)=>({...s,dependsOn:s.id===id?dependsOn:also?.[s.id]??(d.mode==='parallel'?(s.dependsOn??[]):i?[d.steps[i-1]!.id]:[])}))}))} renderAction={id=>{const i=draft.steps.findIndex(s=>s.id===id),s=draft.steps[i]!;return <><small>{STATUS[runOf(id)?.status??'waiting']} · {s.access==='full'?uiText("Chỉnh sửa"):uiText("Chỉ đọc")}</small><p>{s.prompt||uiText("Chưa có prompt")}</p>{stageAction(s,i)}</>;}} onAdd={()=>insert(draft.steps.length)}/>

    {linked&&<details className="wf-plan-advanced"><summary>{uiText("Chi tiết kế hoạch: đầu vào, đầu ra, tiêu chí hoàn thành, khôi phục")}</summary><p className="muted small">{uiText("Quy trình này sinh từ Plan. Tên bước và prompt sửa bằng nút ở sơ đồ phía trên; phần dưới dùng khi cần chỉnh hợp đồng từng bước hoặc duyệt từng nấc.")}</p><PlanCard state={state} key={linked.id} graphView plan={linked} busy={running} report={report} notice={notice} onRun={stepId=>rpc('runPlan',{id:linked.id,stepId,revision:linked.revision??0}).catch(report)}/></details>}

    {step&&<WorkflowDialog title={uiText("Sửa bước: {0}",[step.name])} onClose={()=>setStepId('')}><div className="wf-editor wf-step-editor">
     <div className="wf-step-head">
      <label>{uiText("Tên nút")}<input value={step.name} maxLength={100} disabled={running} onChange={e=>patchStep(step.id,{name:e.target.value})}/></label>
      <label>Model<select value={choiceKey(step.choice)} disabled={running} onChange={e=>patchStep(step.id,{choice:parseKey(e.target.value)})}>
       <option value="auto">{uiText("Tự động chọn AI")}</option>
       {groups.map(g=><optgroup key={g.label} label={g.label}>{g.items.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
       {step.choice!=='auto'&&!groups.some(g=>g.items.some(m=>m.key===choiceKey(step.choice)))&&<option value={choiceKey(step.choice)}>{step.choice.model} {uiText("(chưa cấu hình)")}</option>}
      </select></label>
      <div className="wf-field"><span className="wf-field-label">{uiText("Quyền")}</span>
       <div role="radiogroup" aria-label={uiText("Quyền của nút")} className="wf-seg">
        <button role="radio" aria-checked={step.access==='read'} className={step.access==='read'?'on':''} disabled={running} onClick={()=>patchStep(step.id,{access:'read'})}><Icon name="eye" size={16}/> {uiText("Chỉ đọc")}</button>
        <button role="radio" aria-checked={step.access==='full'} className={step.access==='full'?'on':''} disabled={running} onClick={()=>patchStep(step.id,{access:'full'})}><Icon name="pen" size={16}/> {uiText("Chỉnh sửa")}</button>
       </div>
      </div>
     </div>
     {step.access==='full'&&<p className="wf-warn">{uiText("Nút này được sửa tệp và chạy lệnh trực tiếp trong thư mục làm việc")} {draft.folder?`: ${draft.folder}`:' (cần chọn thư mục ở trên)'}.</p>}
     <StepInputsZone variables={stepVariables(draft,step.id)} hasDependencies={draft.mode==='parallel'&&(step.dependsOn??[]).length>0}>
      {draft.mode==='parallel'&&<fieldset disabled={running}><legend>{uiText("Các bước cần chờ")}</legend><p className="muted small">{uiText("Không chọn: chạy độc lập. Chọn nhiều bước: hợp nhất kết quả qua")} {'{{prev}}'}{uiText(". Không tạo vòng lặp.")}</p>{draft.steps.filter(s=>s.id!==step.id).map(s=><label className="wf-check" key={s.id}><input type="checkbox" checked={(step.dependsOn??[]).includes(s.id)} onChange={e=>patchStep(step.id,{dependsOn:e.target.checked?[...(step.dependsOn??[]),s.id]:(step.dependsOn??[]).filter(id=>id!==s.id)})}/>{s.name}</label>)}</fieldset>}
     </StepInputsZone>
     <div className="wf-prompt-field"><span className="wf-field-label">Prompt</span><StepComposer workflow={draft} stepId={step.id} state={state} value={step.prompt} onChange={(prompt,files)=>patchStep(step.id,{prompt,...(files?{files}:{})})} files={step.files??[]} onFiles={files=>patchStep(step.id,{files:files.length?files:undefined})} projectId={saved.projectId} disabled={running} filesDisabledReason={saved.planId&&!step.templateCopy?uiText("Quy trình sinh từ Plan chạy theo Plan nên chưa nhận tệp riêng cho từng nút; hãy đính kèm tệp trong hội thoại của Plan."):undefined} report={report} notice={notice}/></div>
     <StepOutputsZone step={step} directives={stepDirectives(step.prompt,step.id)} diagnostic={stepDiagnostic(draft,step.id)}>
      <label className="wf-check"><input type="checkbox" checked={!!step.continueOnError} disabled={running} onChange={e=>patchStep(step.id,{continueOnError:e.target.checked})}/> {uiText("Lỗi vẫn chạy tiếp")}</label>
     </StepOutputsZone>
     <div className="wf-step-foot">
      <button disabled={running||draft.steps.findIndex(s=>s.id===step.id)===0} onClick={()=>move(draft.steps.findIndex(s=>s.id===step.id),-1)} aria-label={uiText("Dời nút sang trái")}>←</button>
      <button disabled={running||draft.steps.findIndex(s=>s.id===step.id)===draft.steps.length-1} onClick={()=>move(draft.steps.findIndex(s=>s.id===step.id),1)} aria-label={uiText("Dời nút sang phải")}>→</button>
      <span className="wf-spacer"/>
      <button disabled={running} onClick={()=>{edit(d=>({...d,steps:d.steps.filter(s=>s.id!==step.id).map(s=>({...s,dependsOn:s.dependsOn?.filter(id=>id!==step.id)}))}));setStepId('');}}>{uiText("Xóa nút")}</button>
     </div>
    </div></WorkflowDialog>}

    {!hidden.history&&<>
    <h2 className="wf-h2">{uiText("Lịch sử chạy")}</h2>
    {saved.input&&<details><summary>{uiText("Đầu vào đang lưu (")}{saved.input.kind})</summary><pre className="wf-input-preview">{saved.input.value}</pre></details>}
    {!saved.runs.length&&<p className="muted small">{uiText("Chưa chạy lần nào.")}</p>}
    <div className="wf-runs">{saved.runs.map((r,n)=><div key={r.id} className={`wf-run wf-run-${r.status}`}>
     <button className="wf-run-head" aria-expanded={openRun===r.id||(!openRun&&n===0&&r.status==='running')} onClick={()=>setOpenRun(openRun===r.id?'':r.id)}><StatusDot status={r.status}/><strong>{STATUS[r.status]}</strong><span>{clock(r.startedAt)}</span><small>{duration(r.startedAt,r.endedAt)}</small><span className="wf-spacer"/><small>{r.steps.filter(s=>s.status==='success').length}/{r.steps.length} {uiText("nút xong")}</small></button>
     {(openRun===r.id||(!openRun&&n===0&&r.status==='running'))&&<ol className="wf-log">{r.steps.map(s=><li key={s.stepId}><div><StatusDot status={s.status}/><strong>{s.name}</strong><small>{STATUS[s.status]}{s.startedAt?` · ${duration(s.startedAt,s.endedAt)}`:''}</small></div>{s.code&&s.code.decision!=='waiting'&&<details><summary>{uiText("Mã đã sinh ({0}) · {1} cảnh báo",[s.code.lang,s.code.findings.length])}</summary><CodeApproval workflowId={saved.id} runId={r.id} step={s} workdir={r.workdir} report={report}/></details>}{s.status==='waiting'&&<p className="muted small">{(()=>{const index=saved.steps.findIndex(step=>step.id===s.stepId);const deps=saved.mode==='parallel'?(saved.steps[index]?.dependsOn??[]):index>0?[saved.steps[index-1]!.id]:[];const pending=deps.filter(id=>r.steps.find(p=>p.stepId===id)?.status!=='success').map(id=>saved.steps.find(p=>p.id===id)?.name??id);return pending.length?uiText("Chờ bước: {0}",[pending.join(', ')]):uiText("Chờ lượt chạy hoặc quyền truy cập tệp.");})()}</p>}{!!s.logs?.length&&<details><summary>{uiText("Nhật kí bước")}</summary>{s.logs.map((log,i)=><p key={i}>{clock(log.at)} — {log.text}</p>)}</details>}{s.error&&<pre className="wf-error">{s.error}</pre>}{s.output&&<details><summary>{uiText("Kết quả")}</summary>{s.outputFiles?.map(file=><div key={file}><QuickFile path={file}/></div>)}<pre>{s.output}</pre><button onClick={()=>void navigator.clipboard.writeText(s.output!).then(()=>notice(uiText("Đã sao chép."))).catch(report)}>{uiText("Sao chép")}</button></details>}</li>)}</ol>}
    </div>)}</div>
    </>}
   </section>:<section className="wf-main wf-empty"><Icon name="workflow" size={44}/><h2>{uiText("Khu vực làm việc")}</h2><p>{list.length?uiText("Chọn quy trình để bắt đầu"):uiText("Tạo quy trình đầu tiên để bắt đầu.")}</p><small>{uiText("Các bước, kết quả và lịch sử chạy sẽ mở ngay tại đây.")}</small></section>}
  </div>
  </div>
 {saveTpl&&draft&&<SaveTemplateDialog workflowId={draft.id} defaultName={uiText("Mẫu: {0}",[draft.name]).slice(0,100)} report={report} onClose={()=>setSaveTpl(false)} onSaved={id=>{notice(uiText("Đã lưu thành quy trình mẫu. Hãy thêm tham số {{khóa}} vào prompt rồi bấm Lưu mẫu."));setOpenTplId(id);setTab('templates');}}/>}
 {tplView?.kind==='apply'&&<TemplateInsertDialog state={state} target={tplView.target} initialTemplateId={tplView.templateId} report={report} onClose={()=>setTplView(null)} onDone={r=>{const msg=uiText("Đã chèn quy trình mẫu. Khối mới có khung màu riêng; bấm Lưu thay đổi hoặc Lưu để bỏ màu.");if(r.kind==='workflow'&&r.id!==draft?.id){if(openIfIdle(r.id,selRef.current,msg))setTab('workflows');}else notice(msg);}}/>}
 </div>;
}
