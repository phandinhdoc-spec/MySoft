import {t as uiText} from './i18n';
import React,{useEffect,useRef} from 'react';

/** Native modal supplies focus trapping, Escape and focus restoration. */
export function WorkflowDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;const previous=document.activeElement as HTMLElement|null;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');return()=>{dialog.close?.();previous?.focus();};},[]);
 return <dialog ref={ref} role="dialog" aria-label={title} className="wf-step-dialog" onCancel={e=>{e.preventDefault();onClose();}}><header><strong>{title}</strong><button aria-label={uiText("Đóng cửa sổ sửa bước")} onClick={onClose}>✕</button></header>{children}<footer><small>{uiText("Thay đổi được giữ trong bản nháp. Lưu để áp dụng.")}</small><button onClick={onClose}>Xong</button></footer></dialog>;
}
