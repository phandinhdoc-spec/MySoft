import React, {useEffect, useRef, useState} from 'react';
import {t as uiText} from './i18n';

export function Modal({title,onClose,children,actions}:{title:string;onClose:()=>void;children:React.ReactNode;actions?:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
 const [pos,setPos]=useState({x:0,y:0});
 const [hidden,setHidden]=useState(false);
 useEffect(()=>{
  const before=document.activeElement as HTMLElement;
  ref.current?.querySelector<HTMLElement>('button,input,textarea,select')?.focus();
  return ()=>before?.focus();
 },[]);
 return <div className={`modal-backdrop${hidden?' modal-minimized':''}`} onMouseDown={e=>{if(e.target===e.currentTarget&&!hidden)onClose();}}>
  <section ref={ref} className="modal" role="dialog" aria-modal={!hidden} aria-label={title} style={{transform:`translate(${pos.x}px,${pos.y}px)`}} onKeyDown={e=>{
   if(e.key==='Escape')onClose();
   if(e.key==='Tab'){
    const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]');
    if(!nodes?.length)return;
    const first=nodes[0],last=nodes[nodes.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  }}>
   <header className="modal-drag" title={uiText("Kéo tiêu đề để di chuyển cửa sổ")} onPointerDown={e=>{
    if((e.target as HTMLElement).closest('button'))return;
    drag.current={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y};
    e.currentTarget.setPointerCapture(e.pointerId);
   }} onPointerMove={e=>{
    const d=drag.current;
    if(d)setPos({x:d.ox+e.clientX-d.x,y:d.oy+e.clientY-d.y});
   }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
    <div className="modal-title-group">
     <h2>{title}</h2>
     {actions&&<div className="modal-header-actions" onPointerDown={e=>e.stopPropagation()}>{actions}</div>}
    </div>
    <button aria-label={hidden?uiText("Hiện cửa sổ"):uiText("Ẩn cửa sổ")} title={hidden?uiText("Hiện cửa sổ"):uiText("Ẩn cửa sổ để xem nội dung phía sau")} onClick={()=>setHidden(v=>!v)}>{hidden?uiText("▢"):uiText("–")}</button>
    <button aria-label={uiText("Đóng")} onClick={onClose}>{uiText("×")}</button>
   </header>
   <div className="modal-body" hidden={hidden}>{children}</div>
  </section>
 </div>;
}
