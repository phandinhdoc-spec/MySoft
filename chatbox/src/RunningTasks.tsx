import {t as uiText} from './i18n';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {rpc,type ViewState} from './ipc';
import './running-tasks.css';

type Props={state?:ViewState;busy:Set<string>;onChat:(id:string)=>void;onWorkflow:(id:string)=>void;report?:(e:unknown)=>void};

/**
 * Ba chấm cạnh đường dẫn là nút quản lí mọi việc đang chạy (hội thoại, quy trình).
 * Bấm để mở danh sách; mỗi dòng có Mở và Dừng. Ẩn bằng ×, Esc hoặc bấm ra ngoài.
 */
export function RunningTasks({state,busy,onChat,onWorkflow,report}:Props){
 const chats=state?.data.chats.filter(c=>busy.has(c.id))??[];
 const workflows=state?.data.workflows?.filter(w=>!w.planId&&w.runs.some(r=>r.status==='running'&&!r.endedAt))??[];
 const total=chats.length+workflows.length;
 const [open,setOpen]=useState(false);
 const box=useRef<HTMLSpanElement>(null);
 const panel=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({left:8,top:8});
 useLayoutEffect(()=>{
  if(!open)return;
  const place=()=>{const anchor=box.current?.getBoundingClientRect();const menu=panel.current;if(!anchor||!menu)return;setPosition({left:Math.max(8,Math.min(anchor.left,window.innerWidth-menu.offsetWidth-8)),top:Math.max(8,Math.min(anchor.bottom+6,window.innerHeight-menu.offsetHeight-8))});};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,total]);
 useEffect(()=>{if(!total)setOpen(false);},[total]);
 useEffect(()=>{
  if(!open)return;
  const outside=(e:Event)=>{if(box.current&&!box.current.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(false);};
  // Esc ẩn danh sách trước; chặn lan lên để không dừng nhầm hội thoại đang chạy.
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);};
 },[open]);
 if(!total)return null;
 const fail=(e:unknown)=>{if(report)report(e);};
 const stopChat=(id:string)=>void rpc('cancel',{chatId:id}).catch(fail);
 const stopWorkflow=(id:string)=>void rpc('workflowCancel',{id}).catch(fail);
 return <span className="running-menu" ref={box}>
  <button type="button" className="running-trigger" aria-haspopup="true" aria-expanded={open} aria-label={uiText("{0} công việc đang chạy",[total])} title={uiText("{0} công việc đang chạy",[total])} onClick={()=>setOpen(v=>!v)}>
   <span className="busy-dots" aria-hidden="true"><i/><i/><i/></span>{total>1&&<span className="running-count">{total}</span>}
  </button>
  {open&&createPortal(<div ref={panel} style={position} className="running-popover" role="region" aria-label={uiText("Việc đang chạy")}>
   <header><strong>{total} {uiText("đang chạy")}</strong><button type="button" aria-label={uiText("Ẩn danh sách")} title={uiText("Ẩn danh sách")} onClick={()=>setOpen(false)}>{uiText("×")}</button></header>
   <ul>
    {chats.map(c=><li key={c.id}><button type="button" className="running-open" title={`${uiText("Mở hội thoại để tiếp tục")}: ${c.title}`} onClick={()=>{onChat(c.id);setOpen(false);}}><span aria-hidden="true">↗ </span>{c.title}</button><button type="button" className="running-stop" aria-label={uiText("Dừng {0}",[c.title])} onClick={()=>stopChat(c.id)}>{uiText("Dừng")}</button></li>)}
    {workflows.map(w=><li key={w.id}><button type="button" className="running-open" title={w.name} onClick={()=>{onWorkflow(w.id);setOpen(false);}}>{w.name}</button><button type="button" className="running-stop" aria-label={uiText("Dừng {0}",[w.name])} onClick={()=>stopWorkflow(w.id)}>{uiText("Dừng")}</button></li>)}
   </ul>
  </div>,document.body)}
 </span>;
}
