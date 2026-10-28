import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {GithubProjectContext} from './GithubProjectContext';
import {Icon} from './Icon';
import {rpc,subscribe,type ViewState} from './ipc';
import {ChatActions} from './ChatActions';
import {ProjectActions} from './ProjectActions';
import {ProjectWorkspaces} from './ProjectWorkspaces';

export type SourceShortcut={id:string;bookId:string;bookName:string;title:string;addedAt:number};
type Props={githubProject?:ViewState['data']['projects'][number];panelKey?:string;state?:ViewState;nav:string;active:string;project:string;githubVisible:boolean;newDocs:number;onNavigate:(key:string)=>void;onChat:(id:string,projectId:string)=>void;onProject:(id:string)=>void;onProjectEdit:(id:string)=>void;onProjectLearning:(id:string)=>void;onProjectTools?:(id:string)=>void;onProjectDeleted:(id:string)=>void;report:(e:unknown)=>void;onWorkflow:(id:string)=>void;onGithub:(operation:string)=>void;onSource:(source:SourceShortcut)=>void};
const menus=[['chat','chat',uiText("Trò chuyện")],['github','github','GitHub'],['history','history',uiText("Lịch sử")],['projects','project',uiText("Dự án")],['office','office','Office'],['skills','skills',uiText("Kỹ năng")],['notebook','notebook',uiText("Sổ nguồn")],['tools','tools',uiText("Tiện ích")],['workflows','workflow',uiText("Quy trình")]] as const;
const expandable=new Set(['chat','github','projects','notebook','workflows']);
const githubActions=[['downloadFiles','git-fetch',uiText("Tải về máy")],['uploadFiles','git-push',uiText("Tải lên GitHub")],['sync','git-pull',uiText("Đồng bộ hai chiều")],['browseFiles','project',uiText("Duyệt file")],['actions','tools',uiText("Thẻ action")]] as const;
const match=(text:string,q:string)=>text.normalize('NFC').toLocaleLowerCase('vi').includes(q.trim().normalize('NFC').toLocaleLowerCase('vi'));
export function SidebarNav(p:Props){
 const [expanded,setExpanded]=useState(p.panelKey??''),[query,setQuery]=useState('');
 const [sources,setSources]=useState<SourceShortcut[]>([]),[sourceError,setSourceError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{if(p.panelKey){setExpanded(p.panelKey);setQuery('');}},[p.panelKey]);
 const search=useRef<HTMLInputElement>(null),container=useRef<HTMLElement>(null),hovered=useRef(false);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='/'||e.metaKey||e.ctrlKey||e.altKey||e.isComposing)return;const el=e.target as HTMLElement;if(el.closest('input,textarea,select,[contenteditable="true"]'))return;if(!hovered.current&&!container.current?.contains(el))return;if(!search.current)return;e.preventDefault();search.current.focus();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 useEffect(()=>{if(expanded!=='notebook')return;let alive=true,off:(()=>void)|undefined,version=0;
  const refresh=()=>{const request=++version;setLoading(true);void rpc<SourceShortcut[]>('nb.recentSources').then(rows=>{if(alive&&request===version){setSources(rows);setSourceError('');}}).catch(()=>{if(alive&&request===version)setSourceError(uiText("Không tải được nguồn. Mở Sổ nguồn để thử lại."));}).finally(()=>{if(alive&&request===version)setLoading(false);});};
  refresh();void subscribe(e=>{if(e.event==='notebook')refresh();}).then(f=>{if(alive)off=f;else f();}).catch(()=>{if(alive)setSourceError(uiText("Không nhận được cập nhật nguồn. Đóng rồi mở lại menu để tải mới."));});return()=>{alive=false;off?.();};
 },[expanded]);
 const openMenu=(key:string)=>{if(expanded!==key){setExpanded(key);setQuery('');}};
 const closeMenu=()=>{if(p.panelKey)return;setExpanded('');setQuery('');};
 const toggle=(key:string)=>{setExpanded(old=>old===key?'':key);setQuery('');};
 const chats=(p.state?.data.chats??[]).slice().sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.updatedAt-a.updatedAt).filter(c=>match(c.title,query)).slice(0,10);
 const linked=new Map<string,{projectId?:string;at:number;plan?:ViewState['data']['chats'][number]['messages'][number]['plan']}>();
 for(const c of p.state?.data.chats??[]){for(const m of c.messages)if(m.plan)linked.set(m.plan.id,{projectId:c.projectId,at:m.at,plan:m.plan});if(c.workflowDesign?.workflowId)linked.set(c.workflowDesign.workflowId,{projectId:c.projectId,at:c.messages[0]?.at??c.updatedAt});}
 const workflows=(p.state?.data.workflows??[]).slice().sort((a,b)=>(b.createdAt??linked.get(b.planId??b.id)?.at??b.updatedAt)-(a.createdAt??linked.get(a.planId??a.id)?.at??a.updatedAt)).slice(0,10);
 const projectName=(id?:string)=>p.state?.data.projects.find(x=>x.id===id)?.name??uiText("Cá nhân");
 return <nav ref={container} className={`sidebar-nav ${p.panelKey?'sidebar-panel-nav':''}`} aria-label={uiText("Điều hướng chính")} onPointerEnter={()=>{hovered.current=true;}} onPointerLeave={()=>{hovered.current=false;closeMenu();}}>
  {menus.filter(([key])=>!p.panelKey||key===p.panelKey).map(([key,icon,label])=>{const open=p.panelKey===key||expanded===key,hasChildren=!!p.panelKey||expandable.has(key);return <div className="side-menu" key={key} onPointerEnter={e=>{if(!p.panelKey&&e.pointerType!=='touch'&&hasChildren)openMenu(key);}} onPointerLeave={e=>{if(e.pointerType!=='touch')closeMenu();}}>
   <div className="side-menu-heading" hidden={!!p.panelKey}><button className={`side-menu-link ${(key==='github'?p.githubVisible:p.nav===key)?'selected':''}`} aria-expanded={hasChildren?open:undefined} aria-controls={hasChildren?`side-${key}`:undefined} onClick={e=>{e.currentTarget.focus();p.onNavigate(key);if(hasChildren)openMenu(key);}}><Icon name={icon}/><span>{label}</span>{key==='projects'&&<small>{p.state?.data.projects.length??0}</small>}{key==='tools'&&p.newDocs>0&&<small className="nav-dot">{p.newDocs>99?'99+':p.newDocs}</small>}</button>{hasChildren&&<button className="side-menu-toggle" aria-label={`${open?uiText("Thu gọn"):uiText("Mở rộng")} ${label}`} aria-expanded={open} aria-controls={`side-${key}`} onClick={e=>{e.currentTarget.focus();toggle(key);}}><span aria-hidden>{open?'⌄':'›'}</span></button>}</div>
   {hasChildren&&open&&<div id={`side-${key}`} className="side-submenu">
    {(key==='chat'||key==='history'||key==='projects')&&<div className="side-menu-search"><Icon name="search" size={14}/><input ref={search} type="search" aria-label={uiText("Tìm {0}",[label.toLocaleLowerCase('vi')])} placeholder={uiText("Ấn / để tìm…")} value={query} onChange={e=>setQuery(e.target.value)}/><kbd>/</kbd></div>}
    <div className={`side-menu-items side-items-${key}`}>
     {(key==='chat'||key==='history')&&chats.map(c=><ChatActions key={c.id} chat={c} projects={p.state!.data.projects} variant="menu" report={p.report} onDone={r=>{if(r.deleted&&c.id===p.active)p.onChat('','');else if(r.project!==undefined&&c.id===p.active)p.onChat(c.id,r.project);}}><button className={p.active===c.id&&p.nav==='chat'?'selected':''} title={`${c.title} · ${projectName(c.projectId)}`} onClick={()=>p.onChat(c.id,c.projectId??'')}><Icon name={c.projectId?'project':'chat'} size={16}/><span><strong>{c.pinned?'📌 ':''}{c.title}</strong><small>{c.projectId?projectName(c.projectId):uiText("Trò chuyện rời")}</small></span></button></ChatActions>)}
     {key==='projects'&&<ProjectWorkspaces compact projects={p.state?.data.projects??[]} workspaces={p.state?.data.workspaces} query={query} report={p.report} renderProject={x=><ProjectActions key={x.id} project={x} report={p.report} onEdit={()=>p.onProjectEdit(x.id)} onLearning={()=>p.onProjectLearning(x.id)} onTools={p.onProjectTools?()=>p.onProjectTools!(x.id):undefined} onDeleted={()=>p.onProjectDeleted(x.id)}><button className={p.project===x.id?'selected':''} title={x.name} onClick={()=>p.onProject(x.id)}><Icon name="project" size={16}/><span><strong>{x.name}</strong><small>{p.state?.data.chats.filter(c=>c.projectId===x.id).length??0} {uiText("cuộc trò chuyện")}</small></span></button></ProjectActions>}/>}
     {key==='github'&&<GithubProjectContext project={p.githubProject}/>}
     {key==='github'&&githubActions.map(([id,icon,title])=><button key={id} onClick={()=>p.onGithub(id)}><Icon name={icon} size={16}/><span>{title}</span></button>)}
     {key==='notebook'&&sources.map(s=><button key={`${s.bookId}:${s.id}`} title={`${s.title} · ${s.bookName}`} onClick={()=>p.onSource(s)}><Icon name="notebook" size={16}/><span><strong>{s.title}</strong><small>{s.bookName}</small></span></button>)}
     {key==='workflows'&&workflows.map(w=>{const link=linked.get(w.planId??w.id),plan=link?.plan,run=w.runs[0]?.status;const status=plan?(!plan.approved?uiText("Chưa duyệt"):plan.steps.some(s=>s.status==='error'||s.status==='interrupted')?uiText("Bị lỗi / gián đoạn"):plan.steps.some(s=>s.status==='running')?uiText("Đang chạy"):plan.steps.length>0&&plan.steps.every(s=>s.status==='done')?uiText("Đã xong"):uiText("Chờ chạy")):({success:uiText("Đã xong"),error:uiText("Bị lỗi"),cancelled:uiText("Đã dừng"),paused:uiText("Chưa duyệt"),running:uiText("Đang chạy"),new:uiText("Chưa duyệt")}[run??'new']??uiText("Chưa duyệt"));return <button key={w.id} title={`${w.name} · ${status} · ${projectName(link?.projectId)}`} onClick={()=>p.onWorkflow(w.id)}><Icon name={link?.projectId?'project':'workflow'} size={16}/><span><strong>{w.name}</strong><small><b className={`side-status ${status===uiText("Đã xong")?'done':/lỗi|dừng/.test(status)?'error':'pending'}`}>{status}</b> · {projectName(link?.projectId)}</small></span></button>;})}
     {(((key==='chat'||key==='history')&&!chats.length)||(key==='workflows'&&!workflows.length))&&<p>{uiText("Chưa có mục phù hợp.")}</p>}
     {key==='notebook'&&(sourceError||loading||!sources.length)&&<p role={sourceError?'alert':undefined}>{sourceError|| (loading?uiText("Đang tải nguồn…"):uiText("Chưa có nguồn."))}</p>}
    </div>
    {key==='chat'&&<button className="side-menu-all" onClick={()=>p.onNavigate('history')}>{uiText("Duyệt toàn bộ lịch sử →")}</button>}
    {key==='workflows'&&<button className="side-menu-all" onClick={()=>p.onWorkflow('')}>{uiText("Quản lí tất cả quy trình →")}</button>}
   </div>}
  </div>;})}
 </nav>;
}
