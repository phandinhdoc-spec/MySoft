import {t as uiText} from './i18n';
import React,{useMemo,useState} from 'react';
import type {ViewState} from './ipc';
import type {Workflow} from '../../core/src/desktop/types';
import {selectWorkflows} from './workflow-tools';
import {useObjectMenu} from './ObjectMenu';
import {Icon} from './Icon';
import {WorkflowListIcon} from './WorkflowListIcon';
import {rpc} from './ipc';
import {openChatWindow} from './chat-window';

const labels:Record<string,string>={new:uiText("Chưa chạy"),running:uiText("Đang chạy"),success:uiText("Hoàn tất"),error:uiText("Cần kiểm tra"),cancelled:uiText("Đã dừng"),paused:uiText("Chờ duyệt")};
const dateKey=(at:number)=>{const d=new Date(at);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const dateLabel=(at:number)=>new Date(at).toLocaleDateString('vi-VN');
export function WorkflowBrowser({state,selectedId,onSelect,onDelete,onPin,onDuplicate,onExport,onError,runningIds=[],busyIds=[]}:{state:ViewState;selectedId:string;onSelect:(id:string)=>void;onDelete:(w:Workflow)=>void;onPin?:(w:Workflow)=>void|Promise<unknown>;onDuplicate?:(w:Workflow)=>void|Promise<unknown>;onExport?:(w:Workflow)=>void;onError?:(e:unknown)=>void;/** ID quy trình đang chạy (chờ phản hồi chạy). */runningIds?:readonly string[];/** ID quy trình đang có thao tác thư viện; chỉ khóa đúng mục đó. */busyIds?:readonly string[]}){
 const [view,setView]=useState<'icons'|'list'|'details'>(()=>{try{const v=localStorage.getItem('pvta.workflowView');return v==='icons'||v==='details'?v:'list';}catch{return 'list';}});
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[sort,setSort]=useState('created'),[project,setProject]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[page,setPage]=useState(0);
 const rows=useMemo(()=>{
  const links=new Map<string,{projectId?:string;at:number}>();
  for(const c of state.data.chats){for(const m of c.messages)if(m.plan)links.set(m.plan.id,{projectId:c.projectId,at:m.at});if(c.workflowDesign?.workflowId)links.set(c.workflowDesign.workflowId,{projectId:c.projectId,at:c.messages[0]?.at??c.updatedAt});}
  return (state.data.workflows??[]).map(w=>{const link=links.get(w.planId??w.id);return {w:{...w,createdAt:w.createdAt??link?.at??w.updatedAt},projectId:link?.projectId??'',projectName:state.data.projects?.find(p=>p.id===link?.projectId)?.name??uiText("Cá nhân")};});
 },[state.data.workflows,state.data.chats,state.data.projects]);
 const byId=new Map(rows.map(r=>[r.w.id,r]));
 const visible=selectWorkflows(rows.filter(r=>(project==='all'||r.projectId===project)&&(!from||dateKey(r.w.createdAt!)>=from)&&(!to||dateKey(r.w.createdAt!)<=to)).map(r=>r.w),query,status,sort);
 const pageCount=Math.max(1,Math.ceil(visible.length/30)),currentPage=Math.min(page,pageCount-1),shown=visible.slice(currentPage*30,(currentPage+1)*30);
 const update=(set:(v:string)=>void,value:string)=>{set(value);setPage(0);};
 const changeView=(v:typeof view)=>{setView(v);try{localStorage.setItem('pvta.workflowView',v);}catch{}};
 const isRunning=(w:Workflow)=>busyIds.includes(w.id)||runningIds.includes(w.id)||w.runs.some(r=>r.status==='running')||!!(w.planId&&state.data.chats.some(c=>c.messages.some(m=>m.plan?.id===w.planId&&m.plan?.steps.some(s=>s.status==='running'))));
 const menu=useObjectMenu<string>({contextKey:JSON.stringify([selectedId,view,query,status,sort,project,from,to,currentPage,runningIds.join(),busyIds.join(),state.data.workflows,state.data.chats]),onError,commands:id=>{
  const w=state.data.workflows?.find(w=>w.id===id);if(!w)return [];
  const reason=isRunning(w)?uiText("Dừng quy trình trước khi thay đổi."):undefined;
  return [
   {id:'chat',label:uiText("Mở đoạn chat"),icon:'↗',run:async()=>{const chatId=await rpc<string>('workflowOpenChat',{id:w.id});await openChatWindow(chatId);}},
   {id:'pin',label:w.pinned?uiText("Bỏ ghim"):'Ghim',icon:'☆',disabledReason:reason??(!onPin?uiText("Chưa có thao tác ghim."):undefined),run:()=>onPin?.(w)},
   {id:'copy',label:uiText("Nhân bản"),icon:'⧉',disabledReason:reason??(!onDuplicate?uiText("Chưa có thao tác nhân bản."):undefined),run:()=>onDuplicate?.(w)},
   {id:'export',label:uiText("Xuất mẫu"),icon:'↗',disabledReason:!onExport?uiText("Chưa có thao tác xuất mẫu."):undefined,run:()=>onExport?.(w)},
   {id:'delete',label:uiText("Xóa quy trình"),icon:uiText("×"),group:'danger',danger:true,disabledReason:reason,run:()=>onDelete(w)},
  ];
 }});
 return <aside className="wf-browser" aria-label={uiText("Danh sách quy trình")}>
  <header><div><strong>{uiText("Thư viện quy trình")}</strong><small>{visible.length} / {rows.length} {uiText("quy trình")}</small></div><div className="wf-view-switch" role="group" aria-label={uiText("Kiểu hiển thị")}>{([['icons','▦',uiText("Biểu tượng")],['list','☰',uiText("Danh sách")],['details','▤',uiText("Chi tiết")]] as const).map(([v,icon,label])=><button key={v} aria-label={label} title={label} aria-pressed={view===v} onClick={()=>changeView(v)}>{icon}</button>)}</div></header>
  <input className="wf-search" type="search" aria-label={uiText("Tìm quy trình")} placeholder={uiText("Tìm tên quy trình hoặc bước…")} value={query} onChange={e=>update(setQuery,e.target.value)}/>
  <div className="wf-browser-filters">
   <label>{uiText("Dự án")}<select value={project} onChange={e=>update(setProject,e.target.value)}><option value="all">{uiText("Tất cả dự án")}</option><option value="">{uiText("Cá nhân")}</option>{state.data.projects?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>{uiText("Sắp xếp")}<select value={sort} onChange={e=>update(setSort,e.target.value)}><option value="created">{uiText("Mới tạo trước")}</option><option value="name">{uiText("Tên A–Z")}</option><option value="recent">{uiText("Mới cập nhật")}</option><option value="oldest">{uiText("Cũ trước")}</option></select></label>
   <label>{uiText("Trạng thái")}<select value={status} onChange={e=>update(setStatus,e.target.value)}><option value="all">{uiText("Tất cả")}</option><option value="pinned">{uiText("Đã ghim")}</option>{Object.entries(labels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <details className="wf-date-filter"><summary>{uiText("Ngày tạo")} {from||to?' · Đang lọc':''}</summary><label>{uiText("Từ ngày")}<input type="date" aria-label={uiText("Từ ngày")} value={from} onChange={e=>update(setFrom,e.target.value)}/></label><label>{uiText("Đến ngày")}<input type="date" aria-label={uiText("Đến ngày")} value={to} onChange={e=>update(setTo,e.target.value)}/></label></details>
  </div>
  {(query||status!=='all'||project!=='all'||from||to)&&<button className="wf-clear-filter" onClick={()=>{setQuery('');setStatus('all');setProject('all');setFrom('');setTo('');setPage(0);}}>{uiText("Xóa bộ lọc")}</button>}
  <div className={`wf-browser-items wf-view-${view}`}>
   {view==='details'&&<div className="wf-detail-head"><button onClick={()=>update(setSort,'name')}>{uiText("Tên ↕")}</button><span>{uiText("Dự án")}</span><button onClick={()=>update(setSort,'created')}>{uiText("Ngày tạo ↓")}</button><span/></div>}
   {shown.map(w=>{const row=byId.get(w.id)!;const plan=w.planId?state.data.chats.flatMap(c=>c.messages).find(m=>m.plan?.id===w.planId)?.plan:undefined;
    const s=plan&&!plan.approved?'unapproved':runningIds.includes(w.id)||plan?.steps.some(step=>step.status==='running')?'running':w.runs[0]?.status??(plan?.steps.some(step=>step.status==='error'||step.status==='blocked')?'error':plan?.steps.length&&plan.steps.every(step=>step.status==='done')?'success':'new');
    const label=s==='unapproved'?uiText("Chưa duyệt"):s==='new'&&plan?.approved?uiText("Đã duyệt · Chưa chạy"):s==='new'&&!plan?uiText("Chưa duyệt · Chưa chạy"):labels[s];
    return <article key={w.id} tabIndex={-1} {...menu.handlers(w.id)} className={`wf-entry ${w.id===selectedId?'selected':''}`}>
    <button className="wf-entry-open" onClick={()=>onSelect(w.id)} aria-pressed={w.id===selectedId} title={w.name}>
     <span className={`wf-file-icon wf-file-${s}`}><WorkflowListIcon size={view==='icons'?28:18}/></span><span className="wf-entry-title"><strong>{w.pinned?'★ ':''}{w.name}</strong><small>{w.steps.length} {uiText("bước ·")} {label}</small></span><span className="wf-entry-project">{row.projectName}</span><time dateTime={new Date(w.createdAt!).toISOString()}>{dateLabel(w.createdAt!)}</time>
    </button>{menu.trigger(w.id,uiText("Thao tác quy trình: {0}",[w.name]),'wf-entry-menu')}
   </article>;})}
   {!shown.length&&<div className="wf-browser-empty"><Icon name="workflow" size={32}/><p>{rows.length?uiText("Không có quy trình phù hợp."):uiText("Chưa có quy trình.")}</p></div>}
  </div>
  <footer><span>Trang {currentPage+1} / {pageCount}</span><button aria-label={uiText("Trang trước")} disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>←</button><button aria-label="Trang sau" disabled={currentPage>=pageCount-1} onClick={()=>setPage(currentPage+1)}>→</button></footer>
 {menu.menu}</aside>;
}
