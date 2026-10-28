import React,{useRef,useState} from 'react';
import type {Project,ProjectWorkspace} from '../../core/src/desktop/types';
import {rpc} from './ipc';
import {t as uiText} from './i18n';
import './project-workspaces.css';

const PROJECT_DRAG='application/x-pvta-project';
type Props={projects:Project[];workspaces?:ProjectWorkspace[];query?:string;compact?:boolean;report:(error:unknown)=>void;renderProject:(project:Project)=>React.ReactNode};
/** Shared grouping for the project page and sidebar. Pointer handles also work in native webviews. */
export function ProjectWorkspaces({projects,workspaces=[],query='',compact=false,report,renderProject}:Props){
 const [editing,setEditing]=useState<{id?:string;name:string}|null>(null),[deleting,setDeleting]=useState<string|null>(null),[busy,setBusy]=useState(false),[over,setOver]=useState<string|null>(null);
 const root=useRef<HTMLDivElement>(null),pending=useRef(false),drag=useRef<{id:string;x:number;y:number;active:boolean}|null>(null);
 const match=(name:string)=>name.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'));
 async function run(method:string,params:Record<string,unknown>,done?:()=>void){
  if(pending.current)return;pending.current=true;setBusy(true);
  try{await rpc(method,params);done?.();}catch(error){report(error);}finally{pending.current=false;setBusy(false);}
 }
 function move(projectId:string,workspaceId:string){
  setOver(null);
  if(!projects.some(p=>p.id===projectId))return;
  void run('moveProjectToWorkspace',{projectId,workspaceId});
 }
 function target(x:number,y:number){
  const el=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-project-workspace]');
  return el&&root.current?.contains(el)?el.dataset.projectWorkspace??null:null;
 }
 const groups=[...workspaces.map(w=>({...w,items:projects.filter(p=>p.workspaceId===w.id)})),{id:'',name:uiText('Chưa nhóm'),collapsed:false,items:projects.filter(p=>!workspaces.some(w=>w.id===p.workspaceId))}];
 return <div ref={root} className={`project-workspaces ${compact?'compact':''}`}>
  <button className="workspace-create" disabled={busy} onClick={()=>{setEditing({name:''});setDeleting(null);}}>{uiText('＋ Tạo Workspace')}</button>
  {editing&&<form className="workspace-edit" onSubmit={e=>{e.preventDefault();void run('saveWorkspace',editing,()=>setEditing(null));}}>
   <input autoFocus aria-label={uiText('Tên Workspace')} placeholder={uiText('Ví dụ: Chương 1')} maxLength={100} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/>
   <button disabled={busy||!editing.name.trim()} type="submit">{uiText('Lưu')}</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>{uiText('Hủy')}</button>
  </form>}
  {!compact&&<p className="workspace-hint">{uiText('Kéo tay nắm ⋮⋮ của dự án vào Workspace để gom nhóm. Mỗi dự án thuộc tối đa một Workspace.')}</p>}
  {groups.map(group=>{
   const items=group.items.filter(p=>match(group.name)||match(p.name));
   if(query.trim()&&!items.length&&!match(group.name))return null;
   const expanded=!group.collapsed||!!query.trim();
   return <section key={group.id} data-project-workspace={group.id} className={`project-workspace ${over===group.id?'drop-active':''}`}
    onDragOver={e=>{if(e.dataTransfer.types.includes(PROJECT_DRAG)){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(group.id);}}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOver(null);}}
    onDrop={e=>{const id=e.dataTransfer.getData(PROJECT_DRAG);if(id){e.preventDefault();e.stopPropagation();move(id,group.id);}}}>
    <div className="workspace-heading">
     <button className="workspace-toggle" disabled={busy||!group.id} aria-expanded={expanded} title={group.name} onClick={()=>void run('setWorkspaceCollapsed',{id:group.id,collapsed:!group.collapsed})}><span aria-hidden>{group.id?(expanded?'⌄':'›'):'▱'}</span><strong>{group.name}</strong><small>{group.items.length}</small></button>
     {group.id&&<><button className="workspace-action" aria-label={uiText('Đổi tên {0}',[group.name])} disabled={busy} onClick={()=>{setEditing({id:group.id,name:group.name});setDeleting(null);}}>✎</button><button className="workspace-action" aria-label={uiText('Xóa Workspace {0}',[group.name])} disabled={busy} onClick={()=>setDeleting(group.id)}>×</button></>}
    </div>
    {deleting===group.id&&<div className="workspace-delete" role="alert"><p>{uiText('Xóa Workspace này? Các dự án sẽ về Chưa nhóm; tài liệu và hội thoại được giữ nguyên.')}</p><button disabled={busy} onClick={()=>void run('deleteWorkspace',{id:group.id},()=>setDeleting(null))}>{uiText('Xóa Workspace')}</button><button disabled={busy} onClick={()=>setDeleting(null)}>{uiText('Hủy')}</button></div>}
    {expanded&&<div className={compact?'workspace-project-list':'project-grid'}>
     {items.map(project=><div className="workspace-project" key={project.id} draggable={!busy} onDragStart={e=>{e.dataTransfer.setData(PROJECT_DRAG,project.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setOver(null)}>
      <button className="project-drag-handle" aria-label={uiText('Kéo dự án {0}',[project.name])} title={uiText('Kéo vào Workspace')} disabled={busy}
       onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:project.id,x:e.clientX,y:e.clientY,active:false};}}
       onPointerMove={e=>{const d=drag.current;if(!d)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)d.active=true;if(d.active)setOver(target(e.clientX,e.clientY));}}
       onPointerUp={e=>{const d=drag.current;drag.current=null;if(d?.active){const id=target(e.clientX,e.clientY);if(id!==null)move(d.id,id);}setOver(null);}}
       onPointerCancel={()=>{drag.current=null;setOver(null);}} onLostPointerCapture={()=>{drag.current=null;setOver(null);}}
       onDragStart={e=>e.preventDefault()}>⋮⋮</button>
      {renderProject(project)}
      <select className="project-workspace-select" aria-label={uiText('Workspace của {0}',[project.name])} disabled={busy} value={workspaces.some(w=>w.id===project.workspaceId)?project.workspaceId:''} onChange={e=>move(project.id,e.target.value)}>
       <option value="">{uiText('Chưa nhóm')}</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
     </div>)}
     {!items.length&&<p className="workspace-empty">{uiText('Kéo dự án vào đây')}</p>}
    </div>}
   </section>;
  })}
 </div>;
}
