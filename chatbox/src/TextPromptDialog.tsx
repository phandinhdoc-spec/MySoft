import React,{useEffect,useRef,useState} from 'react';
import {t as uiText} from './i18n';
import './template.css';

/** Hộp thoại nhập văn bản (thay window.prompt, vốn không chạy trong webview Tauri/macOS). Ctrl/⌘+Enter để gửi. */
export function TextPromptDialog({title,label,confirmLabel,onSubmit,onClose}:{title:string;label:string;confirmLabel?:string;onSubmit:(value:string)=>void|Promise<void>;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 const [value,setValue]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{const d=ref.current!;const prev=document.activeElement as HTMLElement|null;if(d.showModal)d.showModal();else d.setAttribute('open','');return()=>{d.close?.();prev?.focus();};},[]);
 async function submit(){const v=value.trim();if(busy||!v)return;setBusy(true);try{await onSubmit(v);onClose();}finally{setBusy(false);}}
 return <dialog ref={ref} className="tpl-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}>
  <header><strong>{title}</strong><button aria-label={uiText("Đóng")} onClick={onClose}>✕</button></header>
  <div className="tpl-body">
   <label>{label}<textarea autoFocus rows={5} value={value} onChange={e=>setValue(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();void submit();}}}/></label>
   <div className="tpl-actions"><button onClick={onClose}>{uiText("Hủy")}</button><button className="primary" disabled={busy||!value.trim()} onClick={()=>void submit()}>{confirmLabel??uiText("Gửi")}</button></div>
  </div>
 </dialog>;
}
