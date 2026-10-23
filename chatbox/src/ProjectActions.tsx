import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {rpc} from './ipc';
import {useObjectMenu} from './ObjectMenu';

interface Props{project:{id:string;name:string};report:(e:unknown)=>void;onOpen?:()=>void;onEdit:()=>void;onLearning?:()=>void;onTools?:()=>void;onDeleted?:()=>void;children?:React.ReactNode;className?:string}

/** Chuột phải (và phím Menu) mở danh sách lệnh của dự án, giống ChatActions. Không còn dấu ⋯. */
export function ProjectActions({project,report,onOpen,onEdit,onLearning,onTools,onDeleted,children,className=''}:Props){
 const [confirming,setConfirming]=useState(false);const [busy,setBusy]=useState(false);const [keepFolders,setKeepFolders]=useState(false);
 const box=useRef<HTMLDivElement>(null),form=useRef<HTMLDivElement>(null);const running=useRef(false);
 const menu=useObjectMenu({contextKey:project.id,onError:report,commands:()=>[
  ...(onOpen?[{id:'open',label:uiText("Mở dự án"),run:onOpen}]:[]),
  ...(onTools?[{id:'tools',label:uiText("Công cụ dự án"),run:onTools}]:[]),
  {id:'edit',label:uiText("Chỉnh sửa thông tin"),run:onEdit},
  ...(onLearning?[{id:'learning',label:uiText("Học hỏi"),run:onLearning}]:[]),
  {id:'delete',label:uiText("Xóa"),danger:true,group:'delete',disabledReason:busy?uiText("Đang xử lý"):undefined,run:()=>{setKeepFolders(false);setConfirming(true);}},
  {id:'delete-only',label:uiText("Chỉ xóa dự án (giữ thư mục trên máy)"),group:'delete',disabledReason:busy?uiText("Đang xử lý"):undefined,run:()=>{setKeepFolders(true);setConfirming(true);}},
 ]});
 useEffect(()=>{setConfirming(false);},[project.id]);
 useEffect(()=>{
  if(!confirming)return;
  form.current?.querySelector<HTMLElement>('button')?.focus();
  const off=(e:MouseEvent)=>{if(!running.current&&box.current&&!box.current.contains(e.target as Node)&&!form.current?.contains(e.target as Node))setConfirming(false);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!running.current)setConfirming(false);};
  document.addEventListener('mousedown',off);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('mousedown',off);document.removeEventListener('keydown',esc);};
 },[confirming]);
 async function remove(){
  if(running.current)return;running.current=true;setBusy(true);
  try{await rpc('deleteProject',keepFolders?{id:project.id,keepFolders:true}:{id:project.id});setConfirming(false);onDeleted?.();}
  catch(e){report(e);}finally{running.current=false;setBusy(false);}
 }
 return <div className={`chat-object project-object ${className}`} ref={box} {...menu.handlers(project.id)}>
  {children}{menu.menu}
  {confirming&&createPortal(<div ref={form} className="chat-object-form" role="dialog" aria-label={uiText("Xóa dự án {0}",[project.name])} onClick={e=>e.stopPropagation()}>
   <span className="chat-delete-confirm"><span>{keepFolders?<>{uiText("Chỉ xóa dự án «")}{project.name}»? {uiText("Thư mục trên máy, tệp trong đó và hội thoại được giữ nguyên.")}</>:<>{uiText("Xóa dự án «")}{project.name}»? {uiText("Tệp gốc và tệp trên đám mây được giữ nguyên.")}</>}</span><button className="danger" disabled={busy} onClick={()=>void remove()}>{keepFolders?uiText("Chỉ xóa dự án"):uiText("Xóa hẳn")}</button><button disabled={busy} onClick={()=>setConfirming(false)}>{uiText("Giữ lại")}</button></span>
  </div>,document.body)}
 </div>;
}
