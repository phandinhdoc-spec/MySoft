import {t as uiText} from './i18n';
import type {OfficeTarget} from './OfficeEditor';
const OfficeEditor=React.lazy(()=>import('./OfficeEditor'));
import {DocumentReader,useDocumentPreview} from './DocumentPreview';
import React,{useRef,useState,useEffect} from 'react';
import type {PdfWorkspaceProps} from './PdfWorkspace';

// Khung PDF (pdf.js, pdf-lib) nằm trong gói riêng, chỉ tải khi thầy cô mở một PDF.
const PdfWorkspace=React.lazy(()=>import('./PdfWorkspace'));

const KEY='pvta.pdfSplit';
function readRatio():number{try{const v=Number(localStorage.getItem(KEY));return v>=25&&v<=75?v:55;}catch{return 55;}}
function saveRatio(v:number){try{localStorage.setItem(KEY,String(Math.round(v)));}catch{/* không lưu được thì thôi */}}

/** Chia đôi màn hình: PDF bên trái (hoặc phía trên khi cửa sổ hẹp), chat bên phải. Kéo thanh giữa để đổi tỉ lệ. */
export function PdfSplit({pdf,children}:{pdf:PdfWorkspaceProps&{key?:string};children:React.ReactNode}){
 const [ratio,setRatio]=useState(readRatio);
 const box=useRef<HTMLDivElement>(null);
 const vertical=()=>window.matchMedia('(max-width:1000px)').matches;
 function drag(e:React.PointerEvent<HTMLDivElement>){
  const el=box.current;if(!el)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  const move=(ev:PointerEvent)=>{const r=el.getBoundingClientRect();const v=vertical()?(ev.clientY-r.top)/r.height*100:(ev.clientX-r.left)/r.width*100;setRatio(Math.min(75,Math.max(25,v)));};
  const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);setRatio(v=>{saveRatio(v);return v;});};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);
 }
 function key(e:React.KeyboardEvent){
  const d=e.key==='ArrowLeft'||e.key==='ArrowUp'?-3:e.key==='ArrowRight'||e.key==='ArrowDown'?3:0;
  if(d){e.preventDefault();setRatio(v=>{const n=Math.min(75,Math.max(25,v+d));saveRatio(n);return n;});}
 }
 const {key:_k,...props}=pdf;
 return <div ref={box} className="pdf-split" style={{['--pdf-w' as any]:`${ratio}%`,...(vertical()?{gridTemplateRows:`minmax(260px,${ratio}%) 7px minmax(240px,1fr)`}:{})}}>
  <React.Suspense fallback={<div className="pdf-loading-pane">{uiText("Đang chuẩn bị khung PDF…")}</div>}><PdfWorkspace key={pdf.key} {...props}/></React.Suspense>
  <div className="split-handle" role="separator" aria-orientation="vertical" aria-label={uiText("Kéo để đổi độ rộng khung PDF và khung chat")} aria-valuenow={Math.round(ratio)} aria-valuemin={25} aria-valuemax={75} tabIndex={0} onPointerDown={drag} onKeyDown={key}/>
  <div className="chat-pane">{children}</div>
 </div>;
}

/** Khung chat thường, hoặc chia đôi với PDF khi đang mở PDF. */
export function ChatLayout({pdf,children,scope,office,onOfficeClose,onOfficeAsk,notice}:{office?:OfficeTarget|null;onOfficeClose?:()=>void;onOfficeAsk?:(s:string)=>void;notice?:(s:string)=>void;scope?:string;pdf:(PdfWorkspaceProps&{key?:string})|null;children:React.ReactNode}){
 const {action,close}=useDocumentPreview();
 useEffect(()=>()=>close(),[scope,close]);
 return office?<div className="office-edit-split"><React.Suspense fallback={<p>{uiText("Đang mở tài liệu…")}</p>}><OfficeEditor key={office.attachmentId} target={office} onClose={onOfficeClose!} onAsk={onOfficeAsk!} notice={notice!}/></React.Suspense><div className="chat-pane">{children}</div></div>:pdf?<PdfSplit pdf={pdf}>{children}</PdfSplit>:action?<div className="document-workspace"><div className="chat-stack">{children}</div><DocumentReader/></div>:<div className="chat-stack">{children}</div>;
}
