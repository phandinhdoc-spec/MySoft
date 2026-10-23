import {useEffect,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type {PDFDocumentProxy} from 'pdfjs-dist';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

export default function PdfPreview({file,onClose}:{file:File;onClose:()=>void}){
 const [doc,setDoc]=useState<PDFDocumentProxy>();
 const [page,setPage]=useState(1);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const canvas=useRef<HTMLCanvasElement>(null);
 const box=useRef<HTMLDivElement>(null);
 const [width,setWidth]=useState(320);
 useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(160,entries[0]!.contentRect.width)));observer.observe(el);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  let alive=true;let task:ReturnType<typeof pdfjs.getDocument>|undefined;
  setDoc(undefined);setPage(1);setError('');setLoading(true);
  void file.arrayBuffer().then(bytes=>{if(!alive)return;task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});return task.promise;}).then(pdf=>{if(alive&&pdf)setDoc(pdf);}).catch(e=>{if(alive){setError(e?.name==='PasswordException'?'PDF có mật khẩu, hãy mở khóa trước khi xem.':`Không mở được PDF: ${e.message??e}`);setLoading(false);}});
  return()=>{alive=false;void task?.destroy();};
 },[file]);
 useEffect(()=>{
  if(!doc)return;let alive=true;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  setLoading(true);setError('');
  void doc.getPage(page).then(p=>{if(!alive||!canvas.current)return;const el=canvas.current;const base=p.getViewport({scale:1});const ratio=Math.min(window.devicePixelRatio||1,2);const view=p.getViewport({scale:Math.min((width-8)/base.width,2)*ratio});el.width=view.width;el.height=view.height;el.style.width=`${view.width/ratio}px`;el.style.height=`${view.height/ratio}px`;render=p.render({canvasContext:el.getContext('2d')!,viewport:view});return render.promise;}).then(()=>{if(alive)setLoading(false);}).catch(e=>{if(alive&&e?.name!=='RenderingCancelledException'){setError(`Không hiển thị được trang: ${e.message??e}`);setLoading(false);}});
  return()=>{alive=false;render?.cancel();};
 },[doc,page,width]);
 return <section aria-label="Xem trước PDF" style={{border:'1px solid #ccd5df',borderRadius:10,padding:8,margin:'8px 0'}}>
 <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong style={{overflowWrap:'anywhere',flex:1}}>{file.name}</strong><button onClick={onClose} aria-label="Đóng xem trước PDF">×</button></div>
 <div style={{display:'flex',gap:8,alignItems:'center',margin:'8px 0'}}><button disabled={!doc||page<=1} onClick={()=>setPage(p=>p-1)}>‹</button><span>Trang {page} / {doc?.numPages??'…'}</span><button disabled={!doc||page>=doc.numPages} onClick={()=>setPage(p=>p+1)}>›</button></div>
 {loading&&<p role="status">Đang mở PDF…</p>}{error&&<p role="alert">{error}</p>}
 <div ref={box} style={{maxHeight:'55vh',overflow:'auto',background:'#edf0f4'}}><canvas ref={canvas} style={{display:error?'none':'block',margin:'auto'}}/></div>
 </section>;
}
