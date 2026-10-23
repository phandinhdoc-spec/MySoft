import {t as uiText} from './i18n';
import {useObjectMenu} from './ObjectMenu';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {PDFDocumentProxy,PDFPageProxy,PageViewport} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {savePath,pickFiles} from './ipc';
import {readPdf,writePdf,vietnameseFont} from './pdfio';
import {buildPdf,cssColor,pageKey,type Color,type Edit,type NewEdit,type PageRef,type Pt} from './pdfedit';

pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;

type Tool='select'|'region'|'highlight'|'whiteout'|'text'|'ink'|'erase';
interface Source{name:string;bytes:Uint8Array;proxy:PDFDocumentProxy;sizes:{w:number;h:number;rotate:number}[]}
interface Snapshot{pages:PageRef[];edits:Edit[]}
export interface RegionAsk{text:string;page:number;image:string;request:string}
export interface PdfWorkspaceProps{path:string;name:string;onClose:()=>void;onAsk:(quote:string,page:number)=>void;onSaved:(path:string)=>void;notice:(s:string)=>void;report:(e:unknown)=>void;
 /** Khoanh vùng: lõi lưu ảnh và OCR. */ onRegion?:(data:string)=>Promise<{path:string;text:string;note:string}>;
 /** Gửi vùng khoanh (ảnh + chữ OCR) kèm yêu cầu cho PVTA. */ onAskRegion?:(r:RegionAsk)=>void}

const TOOLS:[Tool,string,string][]=[
 ['select','I',uiText("Chọn chữ: bôi đen một đoạn để hỏi PVTA hoặc sao chép")],
 ['region','⬚',uiText("Khoanh vùng: kéo chuột quanh công thức, hình, bảng, bài tập… PVTA đọc chữ (OCR), nhìn ảnh và làm theo yêu cầu")],
 ['highlight','▮',uiText("Tô sáng: kéo chuột quanh đoạn cần tô")],
 ['whiteout','▭',uiText("Che trắng: kéo chuột để che đáp án khi in hoặc chiếu. Chỉ che phần hình, chữ bên dưới vẫn còn trong tệp (vẫn sao chép được)")],
 ['text','T',uiText("Chèn chữ: bấm vào chỗ cần ghi (điểm, nhận xét…)")],
 ['ink','✎',uiText("Vẽ tay: gạch, khoanh tròn, đánh dấu")],
 ['erase','⌫',uiText("Xóa chú thích: bấm vào nét, chữ hoặc vùng đã thêm")],
];
const TOOL_LABEL:Record<Tool,string>={select:uiText("Chọn chữ"),region:uiText("Khoanh vùng"),highlight:uiText("Tô sáng"),whiteout:uiText("Che trắng"),text:uiText("Chèn chữ"),ink:uiText("Vẽ tay"),erase:uiText("Xóa")};
const COLOR_LIST:[Color,string][]=[['red',uiText("Đỏ")],['blue',uiText("Xanh dương")],['black',uiText("Đen")],['green',uiText("Xanh lá")]];
const uid=()=>Math.random().toString(36).slice(2,10);
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));

async function openSource(name:string,bytes:Uint8Array):Promise<Source>{
 let proxy:PDFDocumentProxy;
 try{proxy=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true}).promise;}
 catch(e:any){throw Error(e?.name==='PasswordException'?uiText("Tệp PDF có mật khẩu bảo vệ nên chưa mở được."):uiText("Không mở được {0}: tệp có thể bị hỏng.",[name]));}
 const sizes=[];
 for(let i=1;i<=proxy.numPages;i++){const p=await proxy.getPage(i);const v=p.getViewport({scale:1});sizes.push({w:v.width,h:v.height,rotate:p.rotate});}
 return {name,bytes,proxy,sizes};
}
const baseName=(p:string)=>p.split(/[\\/]/).pop()??p;
const dirOf=(p:string)=>{const i=Math.max(p.lastIndexOf('/'),p.lastIndexOf('\\'));return i>0?p.slice(0,i+1):'';};

const QUICK=[uiText("Giải thích nội dung này"),uiText("Giải bài này từng bước"),uiText("Tóm tắt ngắn gọn"),uiText("Dịch sang tiếng Việt"),uiText("Chuyển thành văn bản/công thức để chép")];
type Region={data:string;page:number;x:number;y:number;phase:'reading'|'ready';text:string;note:string;path:string;request:string};
export default function PdfWorkspace({path,name,onClose,onAsk,onSaved,notice,report,onRegion,onAskRegion}:PdfWorkspaceProps){
 const [region,setRegion]=useState<Region|null>(null);
 const [sources,setSources]=useState<Source[]>([]);
 const [pages,setPages]=useState<PageRef[]>([]);
 const [edits,setEdits]=useState<Edit[]>([]);
 const [history,setHistory]=useState<Snapshot[]>([]);
 const [savedAt,setSavedAt]=useState(0);
 const [scale,setScale]=useState(1);
 const [tool,setTool]=useState<Tool>('select');
 const [color,setColor]=useState<Color>('red');
 const [size,setSize]=useState(14);
 const [current,setCurrent]=useState(0);
 const [loading,setLoading]=useState(uiText("Đang mở PDF…"));
 const [failed,setFailed]=useState('');
 const [saving,setSaving]=useState(false);
 const [saveMenu,setSaveMenu]=useState(false);
 const [pick,setPick]=useState<{text:string;page:number;x:number;y:number}|null>(null);
 const scroller=useRef<HTMLDivElement>(null);
 const pageEls=useRef(new Map<number,HTMLElement>());
 const dirty=history.length!==savedAt;

 useEffect(()=>{
  let alive=true;let opened:Source|undefined;
  setLoading(uiText("Đang mở PDF…"));setFailed('');
  void (async()=>{
   try{
    const bytes=await readPdf(path,(d,t)=>{if(alive&&t>4e6)setLoading(uiText("Đang mở PDF… {0}%",[Math.round(d/t*100)]));});
    const src=await openSource(name,bytes);opened=src;
    if(!alive){void src.proxy.destroy();return;}
    setSources([src]);setPages(src.sizes.map((_,i)=>({doc:0,index:i,rot:0})));setEdits([]);setHistory([]);setSavedAt(0);
    const w=(scroller.current?.clientWidth??700)-48;const first=src.sizes[0];
    setScale(first?clamp(w/first.w,0.5,1.6):1);
    setLoading('');
   }catch(e){if(alive){setFailed(e instanceof Error?e.message:String(e));setLoading('');}}
  })();
  return()=>{alive=false;void opened?.proxy.destroy();};
 },[path,name]);
 useEffect(()=>()=>{for(const s of sources)void s.proxy.destroy();},[]);// eslint-disable-line react-hooks/exhaustive-deps

 const commit=useCallback((next:Partial<Snapshot>)=>{
  setHistory(h=>[...h.slice(-80),{pages,edits}]);
  if(next.pages)setPages(next.pages);
  if(next.edits)setEdits(next.edits);
 },[pages,edits]);
 const undo=useCallback(()=>{
  setHistory(h=>{const last=h.at(-1);if(!last)return h;setPages(last.pages);setEdits(last.edits);return h.slice(0,-1);});
 },[]);
 useEffect(()=>{if(history.length<savedAt)setSavedAt(-1);},[history.length,savedAt]);

 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement|null;if(t&&/^(TEXTAREA|INPUT)$/.test(t.tagName))return;
   if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&scroller.current?.closest('.pdf-workspace')?.contains(document.activeElement??null)){e.preventDefault();undo();}
   if(e.key==='Escape'&&tool!=='select'&&scroller.current?.closest('.pdf-workspace')?.contains(document.activeElement??null))setTool('select');
  };
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[undo,tool]);

 // Trang đang xem: trang chiếm nhiều diện tích nhất trong khung.
 useEffect(()=>{
  const root=scroller.current;if(!root)return;
  const ratios=new Map<number,number>();
  const io=new IntersectionObserver(entries=>{
   for(const en of entries)ratios.set(Number((en.target as HTMLElement).dataset.pos),en.intersectionRatio);
   let best=0,bestR=-1;for(const [k,r] of ratios)if(r>bestR){best=k;bestR=r;}
   setCurrent(best);
  },{root,threshold:[0,0.25,0.5,0.75,1]});
  for(const el of pageEls.current.values())io.observe(el);
  return()=>io.disconnect();
 },[pages,scale]);

 const goTo=(pos:number)=>{const el=pageEls.current.get(clamp(pos,0,pages.length-1));el?.scrollIntoView({behavior:'smooth',block:'start'});};
 const fit=()=>{const s=sources[pages[current]?.doc??0]?.sizes[pages[current]?.index??0];if(!s)return;const w=(scroller.current?.clientWidth??700)-48;setScale(clamp(w/(pages[current]!.rot%180?s.h:s.w),0.4,3));};
 const zoom=(f:number)=>setScale(s=>clamp(Math.round(s*f*100)/100,0.4,3));

 const pageOp=(pos:number,op:'left'|'right'|'up'|'down'|'delete')=>{
  const next=[...pages];const ref=next[pos];if(!ref)return;
  if(op==='left'||op==='right')next[pos]={...ref,rot:(ref.rot+(op==='right'?90:270))%360};
  else if(op==='up'&&pos>0)[next[pos-1],next[pos]]=[next[pos]!,next[pos-1]!];
  else if(op==='down'&&pos<next.length-1)[next[pos+1],next[pos]]=[next[pos]!,next[pos+1]!];
  else if(op==='delete'){if(next.length===1){notice(uiText("Tài liệu cần còn ít nhất một trang."));return;}next.splice(pos,1);}
  else return;
  commit({pages:next});
 };

 const pageMenu=useObjectMenu<string>({contextKey:path,preserveSelection:true,onError:report,commands:key=>{
  const pos=pages.findIndex(p=>pageKey(p.doc,p.index)===key);
  if(pos<0)return [];
  return ([['left',uiText("Xoay trái")],['right',uiText("Xoay phải")],['up',uiText("Đưa lên trước")],['down',uiText("Đưa xuống sau")],['delete',uiText("Xóa trang")]] as const).map(([op,label])=>({
   id:op,label,danger:op==='delete',group:op==='delete'?'delete':undefined,
   disabledReason:saving||loading?uiText("Đang xử lý PDF"):op==='up'&&pos===0?uiText("Đã ở đầu tài liệu"):op==='down'&&pos===pages.length-1?uiText("Đã ở cuối tài liệu"):op==='delete'&&pages.length===1?uiText("Cần giữ ít nhất một trang"):undefined,
   run:()=>pageOp(pos,op),
  }));
 }});

 async function merge(){
  try{
   const files=(await pickFiles()).filter(f=>/\.pdf$/i.test(f));
   if(!files.length){notice(uiText("Chọn tệp PDF để ghép vào cuối tài liệu."));return;}
   setLoading(uiText("Đang ghép PDF…"));
   const added:Source[]=[];
   for(const f of files)added.push(await openSource(baseName(f),await readPdf(f)));
   const base=sources.length;
   setSources(s=>[...s,...added]);
   commit({pages:[...pages,...added.flatMap((s,k)=>s.sizes.map((_,i)=>({doc:base+k,index:i,rot:0})))]});
   notice(uiText("Đã ghép {0} trang vào cuối tài liệu.",[added.reduce((n,s)=>n+s.sizes.length,0)]));
  }catch(e){report(e);}finally{setLoading('');}
 }

 async function save(overwrite:boolean){
  setSaveMenu(false);
  let dest:string|null=path;
  if(overwrite){if(!confirm(uiText("Ghi đè tệp gốc {0}?\nKhông hoàn tác được sau khi ghi. Nếu chưa chắc, chọn \"Lưu thành tệp mới\".",[name])))return;}
  else{
   const stem=name.replace(/\.pdf$/i,'');
   dest=await savePath(`${dirOf(path)}${stem}-da-sua.pdf`);
   if(!dest)return;
   if(!/\.pdf$/i.test(dest))dest+='.pdf';
  }
  setSaving(true);
  try{
   const bytes=await buildPdf(sources.map(s=>s.bytes),pages,edits,vietnameseFont);
   const out=await writePdf(dest,bytes);
   setSavedAt(history.length);
   notice(uiText("Đã lưu {0}.",[baseName(out)]));
   if(overwrite||confirm(uiText("Đã lưu {0}.\nMở bản vừa lưu? PVTA sẽ đọc bản mới thay cho bản cũ (tệp cũ vẫn giữ nguyên trên máy).",[baseName(out)])))onSaved(out);
  }catch(e){report(e);}finally{setSaving(false);}
 }

 function close(){if(dirty&&!confirm(uiText("Đóng PDF mà không lưu các chỉnh sửa?")))return;onClose();}

 // Bôi đen chữ → nút hỏi PVTA.
 function onMouseUp(e:React.MouseEvent){
  if(tool!=='select')return;
  const box=scroller.current;if(!box)return;
  const x=e.clientX,y=e.clientY;
  setTimeout(()=>{
   const sel=window.getSelection();const text=sel?.toString().replace(/\s+/g,' ').trim()??'';
   if(!text||!sel?.anchorNode||!box.contains(sel.anchorNode)){setPick(null);return;}
   const host=(sel.anchorNode instanceof Element?sel.anchorNode:sel.anchorNode.parentElement)?.closest('[data-pos]') as HTMLElement|null;
   const r=box.getBoundingClientRect();
   const half=150;const left=clamp(x-r.left,half,Math.max(half,box.clientWidth-half));
   setPick({text:text.slice(0,2000),page:Number(host?.dataset.pos??current)+1,x:left+box.scrollLeft,y:y-r.top+box.scrollTop});
  },0);
 }

 // Khoanh vùng → ảnh PNG → lõi OCR → bảng nhỏ để thầy cô sửa chữ nhận dạng và chọn yêu cầu.
 function captured(data:string,page:number,cx:number,cy:number){
  const box=scroller.current;if(!box||!onRegion)return;
  const r=box.getBoundingClientRect();const half=190;
  const at={x:clamp(cx-r.left,half,Math.max(half,box.clientWidth-half))+box.scrollLeft,y:cy-r.top+box.scrollTop};
  setRegion({data,page,...at,phase:'reading',text:'',note:'',path:'',request:''});
  void onRegion(data).then(o=>setRegion(g=>g&&g.data===data?{...g,phase:'ready',text:o.text,note:o.note,path:o.path}:g)).catch(e=>{report(e);setRegion(null);});
 }
 function sendRegion(request:string){
  if(!region||region.phase!=='ready'||!onAskRegion)return;
  onAskRegion({text:region.text.trim(),page:region.page,image:region.path,request:request.trim()});setRegion(null);
 }
 const byPage=useMemo(()=>{const m=new Map<string,Edit[]>();for(const e of edits){const k=pageKey(e.doc,e.page);m.set(k,[...(m.get(k)??[]),e]);}return m;},[edits]);
 const addEdit=useCallback((e:Edit)=>commit({edits:[...edits,e]}),[commit,edits]);
 const removeEdit=useCallback((id:string)=>commit({edits:edits.filter(e=>e.id!==id)}),[commit,edits]);

 return <section className="pdf-workspace" aria-label={`PDF: ${name}`}>
  <header className="pdf-toolbar">
   <div className="pdf-title" title={path}><span aria-hidden>▤</span><strong>{name}</strong>{dirty&&<small>{uiText("· chưa lưu")}</small>}</div>
   <div className="pdf-tools" role="toolbar" aria-label={uiText("Công cụ sửa PDF")}>
    <div className="pdf-group">{TOOLS.map(([t,icon,tip])=><button key={t} className={tool===t?'on':''} aria-pressed={tool===t} title={tip} onClick={()=>{setTool(t);setPick(null);}}><span className="pdf-ico">{icon}</span><span className="pdf-lbl">{TOOL_LABEL[t]}</span></button>)}</div>
    {(tool==='text'||tool==='ink')&&<div className="pdf-group">{COLOR_LIST.map(([c,label])=><button key={c} className={`pdf-swatch ${color===c?'on':''}`} title={label} aria-label={uiText("Màu {0}",[label])} aria-pressed={color===c} onClick={()=>setColor(c)}><i style={{background:cssColor(c)}}/></button>)}
     {tool==='text'&&<select aria-label={uiText("Cỡ chữ")} value={size} onChange={e=>setSize(Number(e.target.value))}>{[10,12,14,18,24,32].map(n=><option key={n} value={n}>{n} pt</option>)}</select>}</div>}
    <div className="pdf-group">
     <button title={uiText("Hoàn tác (Ctrl+Z)")} disabled={!history.length} onClick={undo}>↶<span className="pdf-lbl">{uiText("Hoàn tác")}</span></button>
     <button title={uiText("Ghép thêm tệp PDF vào cuối")} onClick={()=>void merge()}>⊕<span className="pdf-lbl">{uiText("Ghép PDF")}</span></button>
     <div className="pdf-save"><button className="primary" disabled={saving||!sources.length} onClick={()=>setSaveMenu(v=>!v)} aria-expanded={saveMenu}>{saving?uiText("Đang lưu…"):uiText("Lưu ▾")}</button>
      {saveMenu&&<div className="pdf-menu" role="menu"><button role="menuitem" onClick={()=>void save(false)}>{uiText("Lưu thành tệp mới…")}<small>{uiText("Giữ nguyên tệp gốc")}</small></button><button role="menuitem" onClick={()=>void save(true)}>{uiText("Ghi đè tệp gốc")}<small>{uiText("Thay nội dung")} {name}</small></button></div>}</div>
     <button className="pdf-close" title={uiText("Đóng PDF, chỉ giữ khung chat")} aria-label={uiText("Đóng PDF")} onClick={close}>{uiText("×")}</button>
    </div>
   </div>
  </header>
  <div className="pdf-subbar">
   <div className="pdf-group">
    <button title={uiText("Trang trước")} aria-label={uiText("Trang trước")} disabled={current<=0} onClick={()=>goTo(current-1)}>‹</button>
    <label className="pdf-pageno">Trang<input aria-label={uiText("Đi tới trang")} type="number" min={1} max={pages.length} value={pages.length?current+1:0} onChange={e=>goTo(Number(e.target.value)-1)}/>/ {pages.length}</label>
    <button title="Trang sau" aria-label="Trang sau" disabled={current>=pages.length-1} onClick={()=>goTo(current+1)}>›</button>
   </div>
   <div className="pdf-group">
    <button title={uiText("Thu nhỏ")} aria-label={uiText("Thu nhỏ")} onClick={()=>zoom(1/1.15)}>−</button>
    <button title={uiText("Vừa chiều rộng khung")} onClick={fit}>{Math.round(scale*100)}%</button>
    <button title={uiText("Phóng to")} aria-label={uiText("Phóng to")} onClick={()=>zoom(1.15)}>＋</button>
   </div>
   <button className="pdf-ask-page" title={uiText("Đưa số trang đang xem vào ô chat")} disabled={!pages.length} onClick={()=>onAsk('',current+1)}>{uiText("✦ Hỏi về trang")} {current+1}</button>
  </div>
  <div ref={scroller} className={`pdf-scroll tool-${tool}`} tabIndex={0} onMouseUp={onMouseUp} onMouseDown={e=>{if(!(e.target as HTMLElement).closest('.pdf-pick'))setPick(null);}} onClick={()=>setSaveMenu(false)}>
   {loading&&<div className="pdf-status">{loading}</div>}
   {failed&&<div className="pdf-status pdf-error" role="alert">{failed}<button onClick={onClose}>{uiText("Đóng")}</button></div>}
   {!failed&&pages.map((ref,pos)=>{const src=sources[ref.doc];const sz=src?.sizes[ref.index];if(!src||!sz)return null;
    return <div key={`${ref.doc}:${ref.index}`} className="pdf-page-wrap" tabIndex={0} {...pageMenu.handlers(pageKey(ref.doc,ref.index))} data-pos={pos} ref={el=>{if(el)pageEls.current.set(pos,el);else pageEls.current.delete(pos);}}>
     <div className="pdf-page-bar"><span>Trang {pos+1}{ref.doc>0&&<small> · {src.name}</small>}</span><span className="pdf-page-ops">
      {pageMenu.trigger(pageKey(ref.doc,ref.index),uiText("Thao tác trang {0}",[pos+1]))}</span></div>
     <PageView proxy={src.proxy} index={ref.index} rotation={(sz.rotate+ref.rot)%360} base={sz} scale={scale} root={scroller}
      edits={byPage.get(pageKey(ref.doc,ref.index))??[]} tool={tool} color={color} size={size}
      onAdd={e=>addEdit({...e,id:uid(),doc:ref.doc,page:ref.index} as Edit)} onRemove={removeEdit}
      onRegion={onRegion?(data,cx,cy)=>captured(data,pos+1,cx,cy):undefined}/>
    </div>;})}
   {region&&<div className="pdf-region-panel" style={{left:region.x,top:region.y+12}} role="dialog" aria-label={uiText("Vùng đã khoanh")} onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}>
    <header><strong>{uiText("Vùng khoanh · trang")} {region.page}</strong><button aria-label={uiText("Đóng")} onClick={()=>setRegion(null)}>{uiText("×")}</button></header>
    <img src={region.data} alt={uiText("Ảnh vùng đã khoanh")}/>
    {region.phase==='reading'?<p className="muted small">{uiText("Đang đọc chữ trong vùng…")}</p>:<>
     <label>{uiText("Chữ nhận dạng (sửa nếu sai)")}<textarea value={region.text} placeholder={region.note||uiText("Không đọc được chữ. PVTA vẫn sẽ nhìn ảnh vùng này.")} onChange={e=>setRegion({...region,text:e.target.value})}/></label>
     {region.note&&region.text===''&&<small className="muted">{region.note}</small>}
     <div className="pdf-region-quick">{QUICK.map(q=><button key={q} onClick={()=>sendRegion(q)}>{q}</button>)}</div>
     <form className="pdf-region-ask" onSubmit={e=>{e.preventDefault();sendRegion(region.request||uiText("Đọc và giải thích nội dung trong vùng này"));}}>
      <input autoFocus aria-label={uiText("Yêu cầu cho PVTA")} placeholder={uiText("Hoặc gõ yêu cầu: soạn đáp án, đổi số liệu, tạo câu hỏi tương tự…")} value={region.request} onChange={e=>setRegion({...region,request:e.target.value})}/>
      <button className="primary">{uiText("Gửi PVTA")}</button>
     </form>
     <div className="pdf-region-more"><button onClick={()=>{onAsk(region.text,region.page);setRegion(null);}} disabled={!region.text.trim()}>{uiText("Chèn chữ vào ô chat")}</button><button disabled={!region.text.trim()} onClick={()=>{void navigator.clipboard.writeText(region.text).then(()=>notice(uiText("Đã sao chép.")));}}>{uiText("Sao chép chữ")}</button></div>
    </>}
   </div>}
   {pick&&<div className="pdf-pick" style={{left:pick.x,top:pick.y+12}}>
    <button className="primary" onClick={()=>{onAsk(pick.text,pick.page);setPick(null);window.getSelection()?.removeAllRanges();}}>{uiText("✦ Hỏi PVTA về đoạn này")}</button>
    <button onClick={()=>{void navigator.clipboard.writeText(pick.text).then(()=>notice(uiText("Đã sao chép.")));setPick(null);}}>{uiText("Sao chép")}</button>
   </div>}
  </div>{pageMenu.menu}
 </section>;
}

interface PageViewProps{proxy:PDFDocumentProxy;index:number;rotation:number;base:{w:number;h:number;rotate:number};scale:number;root:React.RefObject<HTMLDivElement|null>;edits:Edit[];tool:Tool;color:Color;size:number;onAdd:(e:NewEdit)=>void;onRemove:(id:string)=>void;onRegion?:(data:string,clientX:number,clientY:number)=>void}

const PageView=React.memo(function PageView({proxy,index,rotation,base,scale,root,edits,tool,color,size,onAdd,onRemove,onRegion}:PageViewProps){
 const swap=(rotation-base.rotate)%180!==0;
 const width=(swap?base.h:base.w)*scale,height=(swap?base.w:base.h)*scale;
 const host=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);const textHost=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(false);
 const [page,setPage]=useState<PDFPageProxy>();
 const [drag,setDrag]=useState<{kind:'rect';a:[number,number];b:[number,number]}|{kind:'ink';pts:[number,number][]}|null>(null);
 const [draft,setDraft]=useState<{x:number;y:number;text:string}|null>(null);

 useEffect(()=>{
  const el=host.current;if(!el)return;
  const io=new IntersectionObserver(([en])=>setVisible(!!en?.isIntersecting),{root:root.current,rootMargin:'900px 0px'});
  io.observe(el);return()=>io.disconnect();
 },[root]);
 useEffect(()=>{if(!visible||page)return;let alive=true;void proxy.getPage(index+1).then(p=>{if(alive)setPage(p);});return()=>{alive=false;};},[visible,page,proxy,index]);
 const viewport:PageViewport|undefined=useMemo(()=>page?.getViewport({scale,rotation}),[page,scale,rotation]);

 useEffect(()=>{
  const c=canvas.current;if(!visible||!page||!viewport||!c)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  c.width=Math.floor(viewport.width*dpr);c.height=Math.floor(viewport.height*dpr);
  const task=page.render({canvasContext:c.getContext('2d')!,viewport,transform:dpr!==1?[dpr,0,0,dpr,0,0]:undefined});
  task.promise.catch(()=>{});
  return()=>task.cancel();
 },[visible,page,viewport]);
 useEffect(()=>{
  const t=textHost.current;if(!visible||!page||!viewport||!t)return;
  t.replaceChildren();
  const layer=new pdfjs.TextLayer({textContentSource:page.streamTextContent(),container:t,viewport});
  layer.render().catch(()=>{});
  return()=>layer.cancel();
 },[visible,page,viewport]);
 // Trang ra xa khỏi tầm nhìn: trả bộ nhớ của ảnh trang.
 useEffect(()=>{if(!visible&&canvas.current){canvas.current.width=0;canvas.current.height=0;}},[visible]);

 const toPdf=(x:number,y:number):Pt=>{const [a,b]=viewport!.convertToPdfPoint(x,y) as [number,number];return [a,b];};
 const toView=(p:Pt):[number,number]=>viewport!.convertToViewportPoint(p[0],p[1]) as [number,number];
 const local=(e:React.PointerEvent|React.MouseEvent):[number,number]=>{const r=(e.currentTarget as Element).getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};

 function down(e:React.PointerEvent<SVGSVGElement>){
  if(!viewport||e.button!==0)return;
  const p=local(e);
  if(tool==='highlight'||tool==='whiteout'||(tool==='region'&&onRegion)){e.currentTarget.setPointerCapture(e.pointerId);setDrag({kind:'rect',a:p,b:p});}
  else if(tool==='ink'){e.currentTarget.setPointerCapture(e.pointerId);setDrag({kind:'ink',pts:[p]});}
  else if(tool==='text'&&!draft){e.preventDefault();setDraft({x:p[0],y:p[1],text:''});}
 }
 function move(e:React.PointerEvent<SVGSVGElement>){
  if(!drag)return;const p=local(e);
  if(drag.kind==='rect')setDrag({...drag,b:p});
  else{const last=drag.pts.at(-1)!;if(Math.hypot(p[0]-last[0],p[1]-last[1])>2)setDrag({kind:'ink',pts:[...drag.pts,p]});}
 }
 /** Cắt vùng từ ảnh trang đã vẽ (độ phân giải thật), phóng to vùng nhỏ cho OCR dễ đọc. */
 function crop(x1:number,y1:number,x2:number,y2:number):string|undefined{
  const c=canvas.current;if(!c||!c.width)return undefined;
  const k=c.width/width;const sx=Math.max(0,Math.min(x1,x2)*k),sy=Math.max(0,Math.min(y1,y2)*k);
  const sw=Math.min(c.width-sx,Math.abs(x2-x1)*k),sh=Math.min(c.height-sy,Math.abs(y2-y1)*k);
  if(sw<4||sh<4)return undefined;
  let up=Math.min(3,Math.max(1,1200/sw));if(sw*sh*up*up>4e6)up=Math.sqrt(4e6/(sw*sh));const out=document.createElement('canvas');
  out.width=Math.round(sw*up);out.height=Math.round(sh*up);
  const g=out.getContext('2d')!;g.fillStyle='#fff';g.fillRect(0,0,out.width,out.height);g.imageSmoothingQuality='high';
  g.drawImage(c,sx,sy,sw,sh,0,0,out.width,out.height);
  return out.toDataURL('image/png');
 }
 function up(e?:React.PointerEvent<SVGSVGElement>){
  if(!drag||!viewport){setDrag(null);return;}
  if(drag.kind==='rect'&&tool==='region'){
   const [x1,y1]=drag.a,[x2,y2]=drag.b;setDrag(null);
   if(Math.abs(x2-x1)>8&&Math.abs(y2-y1)>8){const data=crop(x1,y1,x2,y2);if(data&&e)onRegion?.(data,e.clientX,e.clientY);}
   return;
  }
  if(drag.kind==='rect'){
   const [x1,y1]=drag.a,[x2,y2]=drag.b;
   if(Math.abs(x2-x1)>3&&Math.abs(y2-y1)>3){const a=toPdf(x1,y1),b=toPdf(x2,y2);const rect:[number,number,number,number]=[a[0],a[1],b[0],b[1]];onAdd(tool==='whiteout'?{kind:'whiteout',rect}:{kind:'highlight',rect});}
  }else if(drag.pts.length>1)onAdd({kind:'ink',points:drag.pts.map(([x,y])=>toPdf(x,y)),width:2,color});
  setDrag(null);
 }
 function commitDraft(){
  if(!draft||!viewport){setDraft(null);return;}
  const text=draft.text.replace(/\s+$/,'');
  if(text){
   // Gốc chữ: mép trái, đường chân chữ của dòng đầu. Góc quay giữ chữ nằm ngang trên màn hình.
   const at=toPdf(draft.x,draft.y+size*scale*0.95);const ref=toPdf(draft.x+10,draft.y+size*scale*0.95);
   const angle=Math.round(Math.atan2(ref[1]-at[1],ref[0]-at[0])*180/Math.PI);
   onAdd({kind:'text',at,text,size,angle,color});
  }
  setDraft(null);
 }

 const erase=(id:string)=>(e:React.MouseEvent)=>{if(tool!=='erase')return;e.stopPropagation();onRemove(id);};
 const shapes=viewport?edits.map(ed=>{
  if(ed.kind==='highlight'||ed.kind==='whiteout'){
   const [x1,y1]=toView([ed.rect[0],ed.rect[1]]),[x2,y2]=toView([ed.rect[2],ed.rect[3]]);
   return <rect key={ed.id} className={`pdf-${ed.kind}`} x={Math.min(x1,x2)} y={Math.min(y1,y2)} width={Math.abs(x2-x1)} height={Math.abs(y2-y1)} onClick={erase(ed.id)}/>;
  }
  if(ed.kind==='ink')return <polyline key={ed.id} className="pdf-ink" points={ed.points.map(p=>toView(p).join(',')).join(' ')} stroke={cssColor(ed.color)} strokeWidth={ed.width*scale} onClick={erase(ed.id)}/>;
  const rad=ed.angle*Math.PI/180;const lh=ed.size*1.25;
  const [ox,oy]=toView(ed.at);const [dx,dy]=toView([ed.at[0]+Math.cos(rad),ed.at[1]+Math.sin(rad)]);
  const deg=Math.atan2(dy-oy,dx-ox)*180/Math.PI;
  return <g key={ed.id} className="pdf-textmark" transform={`rotate(${deg} ${ox} ${oy})`} onClick={erase(ed.id)}>
   {ed.text.split(/\r?\n/).map((line,i)=><text key={i} x={ox} y={oy+i*lh*scale} fontSize={ed.size*scale} fill={cssColor(ed.color)}>{line}</text>)}
  </g>;
 }):null;

 return <div ref={host} className="pdf-page" style={{width,height,['--scale-factor' as any]:scale}}>
  <canvas ref={canvas} style={{width,height}} aria-hidden/>
  <div ref={textHost} className="textLayer"/>
  <svg className="pdf-overlay" width={width} height={height} onPointerDown={down} onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={()=>setDrag(null)}>
   {shapes}
   {drag?.kind==='rect'&&<rect className={tool==='region'?'pdf-region':tool==='whiteout'?'pdf-whiteout pdf-preview':'pdf-highlight'} x={Math.min(drag.a[0],drag.b[0])} y={Math.min(drag.a[1],drag.b[1])} width={Math.abs(drag.b[0]-drag.a[0])} height={Math.abs(drag.b[1]-drag.a[1])}/>}
   {drag?.kind==='ink'&&<polyline className="pdf-ink" points={drag.pts.map(p=>p.join(',')).join(' ')} stroke={cssColor(color)} strokeWidth={2*scale}/>}
  </svg>
  {draft&&<textarea className="pdf-draft" autoFocus aria-label={uiText("Nội dung chữ chèn vào PDF")} placeholder={uiText("Gõ chữ, Enter để đặt, Shift+Enter xuống dòng")}
   style={{left:draft.x,top:draft.y,fontSize:size*scale,color:cssColor(color)}} value={draft.text}
   onChange={e=>setDraft({...draft,text:e.target.value})} onBlur={commitDraft}
   onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitDraft();}if(e.key==='Escape'){e.preventDefault();setDraft(null);}}}/>}
 </div>;
});
