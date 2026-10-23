import {t as uiText} from './i18n';
import React,{useEffect,useState} from 'react';
import {rpc,type ViewState} from './ipc';
import {AttachmentChip} from './AttachmentChip';
import {userInitial} from './profile';

type Attachment=ViewState['data']['attachments'][number];
const IMAGE=/\.(png|jpe?g|webp)$/i;

function Thumb({file}:{file:Attachment}){
 const [src,setSrc]=useState('');const [failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;setSrc('');setFailed(false);void rpc<{data?:string}>('fileQuickPreview',{path:file.path}).then(v=>{if(!alive)return;if(v.data)setSrc(v.data);else setFailed(true);}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[file.path,file.fingerprint]);
 if(failed)return null;
 return src?<img className="chat-attachment-image" src={src} alt={file.name} loading="lazy"/>:<div className="chat-attachment-image chat-attachment-loading" aria-busy="true">{uiText("Đang tải ảnh…")}</div>;
}

/** Tệp/ảnh đính kèm hiện ngay trong luồng hội thoại để cả thầy cô lẫn PVTA đều thấy chúng. */
export function ChatAttachments({files,chatId,userName,onDraft,onProject,onPdf,report}:{files:Attachment[];chatId:string;userName?:string;onDraft:(id:string)=>void;onProject?:(id:string)=>void;onPdf:(file:Attachment)=>void;report:(e:unknown)=>void}){
 if(!files.length)return null;
 return <article className="message user message-attachments" aria-label={uiText("Tệp đã đính kèm")}>
  <div className="message-avatar">{userInitial(userName)}</div>
  <div className="message-content">
   <div className="message-label"><span>{userName?.trim() ? uiText("{0} đã đính kèm", [userName.trim()]) : uiText("Thầy cô đã đính kèm")}</span><time>{uiText("{0} tệp",[String(files.length)])}</time></div>
   <div className="chat-attachment-grid">
    {files.map(a=><figure key={a.id} className="chat-attachment-item">
     {(a.image||IMAGE.test(a.name))&&<Thumb file={a}/>}
     <figcaption><AttachmentChip file={a} chatId={chatId} report={report} onDraft={()=>onDraft(a.id)} onProject={onProject?()=>onProject(a.id):undefined} onPdf={()=>onPdf(a)}/></figcaption>
    </figure>)}
   </div>
  </div>
 </article>;
}
