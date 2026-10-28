import {t as uiText} from './i18n';
import {EditFileButton} from './QuickFile';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {rpc,type ViewState} from './ipc';
import {DEFAULT_QUERY,EMPTY_QUERY,SCOPE_LABEL,bookCounts,originLabel,SORT_LABEL,TYPE_LABEL,ageText,filterSources,isFiltered,isFresh,matchingSegments,refreshMessage,scopeCounts,scopeOf,sizeText,typeOf,type ScopeFilter,type SortKey,type SourceQuery,type TypeFilter} from './source-filter';
import './projectTools.css';
import type {ContextFile} from './notebook-files';
import {MESSAGE_DRAG_TYPE,type MessageDraft} from './message-to-project';
import {useObjectMenu,type ObjectCommand} from './ObjectMenu';
export type {ContextFile};
interface SourceIndexInfo{indexing:boolean;roots:{root:string;files:number;at:number;method:string;truncated:boolean}[]}
/** Kéo một tệp trong danh sách nguồn thả vào ô soạn tin để tham chiếu tới tệp đó. */
export const SOURCE_REF_TYPE='application/x-pvta-source-ref';
const SCOPE_META:Record<Exclude<ScopeFilter,'all'>,string>={project:uiText("Tài liệu hiện tại của dự án"),chat:uiText("Tệp hội thoại"),learning:uiText("Học hỏi · chỉ tham khảo cách làm"),notebook:uiText("Sổ nguồn")};

export function FilePreview({file,chatId,query=''}:{file?:ContextFile;chatId:string;query?:string}){
 const [image,setImage]=useState('');const [error,setError]=useState('');const [nbText,setNbText]=useState('');
 useEffect(()=>{let alive=true;setImage('');setError('');if(file?.image)void rpc<string>('attachmentImage',{chatId,attachmentId:file.id}).then(v=>{if(alive)setImage(v);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[file?.id,file?.fingerprint,chatId]);
 // Tệp của sổ nguồn: nội dung nằm trong sổ, nạp khi xem.
 useEffect(()=>{let alive=true;setNbText('');if(file?.notebook)void rpc<string>('nb.sourceText',{id:file.notebook.id,sid:file.notebook.sid}).then(v=>{if(alive)setNbText(v);}).catch(e=>{if(alive)setNbText(String(e));});return()=>{alive=false;};},[file?.id,file?.fingerprint]);
 // Đang tìm trong nội dung: đưa các đoạn khớp lên đầu để thấy ngay vì sao tệp này hiện ra.
 const hits=useMemo(()=>file&&!file.image&&query.trim().length>=2?matchingSegments(file,query):[],[file,query]);
 const segments=hits.length?hits:file?.segments??[];
 return <section className="context-preview" aria-label={uiText("Bản xem trước")}>{file?<><strong>{file.name}</strong>{file.notebook?<small>{uiText("Sổ nguồn")}: {file.notebook.name}{!file.notebook.on?' · '+uiText("đang tắt, AI không đọc"):''}</small>:file.purpose!=='learning'&&<EditFileButton path={file.path}/>}<small>{file.path}</small>{file.notebook?(nbText?<pre>{nbText.slice(0,6000)}</pre>:<p>{uiText("Đang tải nội dung…")}</p>):file.image?(image?<img src={image} alt={file.name}/>:<p>{error||uiText("Đang tải ảnh…")}</p>):<><small>{uiText("Bản xem trước văn bản trích xuất")}</small>{hits.length>0&&<span className="hit-label">{uiText("Đoạn khớp «")} {query.trim()}»: {hits.length}</span>}{segments.length?segments.slice(0,8).map((s,i)=><div key={i}><small>{s.ref}</small><pre>{s.text.slice(0,2400)}</pre></div>):<p>{uiText("Chưa có nội dung để xem trước.")}</p>}</>}</>:<p>{uiText("Chọn tài liệu bên trái để xem trước.")}</p>}</section>;
}

/** Khung «Xem nguồn»: danh sách tài liệu có tìm kiếm, lọc theo phạm vi/loại, sắp xếp và cập nhật tệp mới; bên phải là bản xem trước. */
export function SourceContext({files,office,rag,onOffice,chatId,projectId='',onProjectDrop,onMessageDrop,notice,report}:{files:ContextFile[];office:ViewState['office'];rag:boolean;onOffice:()=>void;chatId:string;projectId?:string;onProjectDrop?:(id:string)=>void;onMessageDrop?:(draft:MessageDraft)=>void;notice?:(s:string)=>void;report?:(e:unknown)=>void}){
 const [selectedId,setSelectedId]=useState('');const [over,setOver]=useState(false);const [q,setQ]=useState<SourceQuery>(DEFAULT_QUERY);const [busy,setBusy]=useState(false);const [ai,setAi]=useState<{query:string;ids:string[]}|null>(null);const [aiBusy,setAiBusy]=useState(false);const [open,setOpen]=useState(false);const [grouped,setGrouped]=useState(false);const [index,setIndex]=useState<SourceIndexInfo|null>(null);
 // Đổi dự án/hội thoại: đóng khung, bỏ từ khóa, bộ lọc và tệp đang chọn của nơi trước.
 useEffect(()=>{setOpen(false);setQ(DEFAULT_QUERY);setSelectedId('');setAi(null);setIndex(null);},[chatId,projectId]);
 // Chưa mở chat (trang dự án) vẫn tìm/cập nhật được theo dự án.
 const scope=chatId?{chatId}:projectId?{projectId}:null;
 const selected=office?.sessions.find(s=>s.id===office.selected);
 const trimmed=q.query.trim();
 // Gõ đến đâu AI tìm đến đó (dùng model mặc định của hồ sơ); lúc chờ vẫn hiện kết quả theo tên/nội dung. Lỗi AI thì giữ kết quả thường, không báo lỗi.
 const aiActive=!!ai&&ai.query===trimmed&&ai.ids.length>0;
 const shown=useMemo(()=>aiActive?ai!.ids.map(id=>files.find(f=>f.id===id)).filter((f):f is ContextFile=>!!f):filterSources(files,q),[files,q,ai,aiActive]);
 const aiSeq=useRef(0);
 const runAi=useRef<(query:string)=>void>(()=>{});
 runAi.current=(query:string)=>{
  if(!scope||!open)return;const seq=++aiSeq.current;setAiBusy(true);
  void rpc<string[]>('aiSourceSearch',{...scope,query}).then(ids=>{if(aiSeq.current===seq)setAi({query,ids});}).catch(()=>{if(aiSeq.current===seq)setAi(null);}).finally(()=>{if(aiSeq.current===seq)setAiBusy(false);});
 };
 useEffect(()=>{
  if(trimmed.length<2){aiSeq.current++;setAi(null);setAiBusy(false);return;}
  if(ai?.query===trimmed)return;
  const timer=setTimeout(()=>runAi.current(trimmed),700);return()=>clearTimeout(timer);
 },[trimmed,open,chatId,projectId]);
 // Chỉ mục nguồn (cây thư mục): đọc khi mở khung và mỗi khi danh sách tệp đổi.
 useEffect(()=>{
  if(!open||!scope)return;let alive=true;
  void rpc<SourceIndexInfo>('sourceTree',scope).then(v=>{if(alive)setIndex(v);}).catch(()=>{});
  return()=>{alive=false;};
 },[open,chatId,projectId,files.length]);
 const counts=useMemo(()=>scopeCounts(files,q),[files,q]);
 const books=useMemo(()=>bookCounts(files,q),[files,q]);
 const totals=useMemo(()=>{const t:Record<string,number>={project:0,chat:0,learning:0,notebook:0};for(const f of files)t[scopeOf(f)]!++;return t;},[files]);
 const types=useMemo(()=>[...new Set(files.map(typeOf))].sort(),[files]);
 const groups=useMemo(()=>{
  if(!grouped)return [{key:'',label:'',items:shown}];
  const map=new Map<string,ContextFile[]>();
  for(const f of shown){const dir=f.notebook?f.notebook.name:f.path.replace(/[\\/][^\\/]*$/,'');(map.get(dir)??map.set(dir,[]).get(dir)!).push(f);}
  return [...map].map(([key,items])=>({key,label:key.split(/[\\/]/).filter(Boolean).slice(-2).join('/')||key,items}));
 },[shown,grouped]);
 const file=shown.find(f=>f.id===selectedId)??shown[0];
 const sourceMenu=useObjectMenu<string>({contextKey:`${chatId}:${projectId}`,onError:e=>{if(report)report(e);else notice?.(e instanceof Error?e.message:String(e));},commands:id=>{
  const target=files.find(f=>f.id===id);if(!target)return [];
  const disabledReason=target.notebook?uiText('Nguồn trong sổ không phải tệp đính kèm trên máy.'):!target.path?uiText('Tài liệu chưa có đường dẫn trên máy.'):undefined;
  const open=(app:'default'|'office'|'vscode')=>rpc('openFileRef',{ref:target.path,chatId,app});
  const commands:ObjectCommand[]=[{id:'open',label:uiText('Mở bằng ứng dụng mặc định'),disabledReason,run:()=>open('default')}];
  if(/\.(docx?|docm|dotx|xlsx?|xlsm|xltx|pptx?|pptm|potx)$/i.test(target.name))commands.push({id:'office',label:uiText('Mở bằng Microsoft Office'),disabledReason,run:()=>open('office')});
  commands.push({id:'vscode',label:uiText('Mở bằng Visual Studio Code'),disabledReason,run:()=>open('vscode')});
  return commands;
 }});
 const patch=(p:Partial<SourceQuery>)=>setQ(v=>({...v,...p}));
 const filtered=isFiltered(q);
 async function refresh(){
  if(busy||!scope)return;setBusy(true);
  try{const r=await rpc('refreshFiles',scope);notice?.(refreshMessage(r));}
  catch(e){if(report)report(e);else notice?.(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 function move(delta:number,e:React.KeyboardEvent){
  const ordered=groups.flatMap(g=>g.items);if(!ordered.length)return;e.preventDefault();
  const i=Math.max(0,ordered.findIndex(f=>f.id===file?.id));const next=ordered[Math.min(ordered.length-1,Math.max(0,i+delta))]!;
  setSelectedId(next.id);requestAnimationFrame(()=>document.getElementById('source-item-'+next.id)?.scrollIntoView({block:'nearest'}));
 }
 const canDrop=(e:React.DragEvent)=>(!!onProjectDrop&&e.dataTransfer.types.includes('application/x-pvta-attachment'))||(!!onMessageDrop&&e.dataTransfer.types.includes(MESSAGE_DRAG_TYPE));
 return <details className={`source-context ${over?'context-drop-active':''}`} open={open} onToggle={e=>setOpen((e.currentTarget as HTMLDetailsElement).open)} onDragOver={e=>{if(canDrop(e)){e.preventDefault();e.dataTransfer.dropEffect='copy';setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={e=>{
   if(!canDrop(e))return;
   e.preventDefault();e.stopPropagation();setOver(false);
   const raw=e.dataTransfer.getData(MESSAGE_DRAG_TYPE);
   if(raw&&onMessageDrop){let draft:MessageDraft;try{draft=JSON.parse(raw) as MessageDraft;}catch{report?.(new Error(uiText("Không đọc được đoạn chat vừa kéo.")));return;}onMessageDrop(draft);return;}
   const id=e.dataTransfer.getData('application/x-pvta-attachment');if(id&&onProjectDrop)onProjectDrop(id);
  }}>
  <summary title={onProjectDrop||onMessageDrop?uiText("Kéo tệp đính kèm hoặc đoạn chat vào đây. Tệp gốc được giữ nguyên."):undefined}><span className="context-dot"/><strong>{files.length?uiText("{0} tài liệu trong ngữ cảnh",[files.length]):selected?.name??uiText("Không gian của bạn")}</strong><span>{uiText("Xem nguồn ⌄")}</span></summary>
  {(files.length>0||!!scope)&&<div className="source-tools">
   <div className="source-row source-row-main">
    <input type="search" aria-label={uiText("Tìm tài liệu theo tên hoặc nội dung")} placeholder={q.content?uiText("Tìm theo tên và trong nội dung…"):uiText("Tìm theo tên hoặc đường dẫn…")} value={q.query} onChange={e=>patch({query:e.target.value})} onKeyDown={e=>{if(e.key==='Escape'&&q.query){e.preventDefault();e.stopPropagation();patch({query:''});}else if(e.key==='Enter'&&trimmed.length>=2){e.preventDefault();runAi.current(trimmed);}}}/>
    <label className="source-check" title={uiText("Tìm cả trong nội dung")}><input type="checkbox" checked={q.content} onChange={e=>patch({content:e.target.checked})}/> {uiText("Nội dung")}</label>
    <select aria-label={uiText("Lọc theo loại tệp")} value={q.type} onChange={e=>patch({type:e.target.value as TypeFilter})}><option value="documents">{uiText("Tài liệu")}</option><option value="image">{TYPE_LABEL.image}</option><option value="all">{TYPE_LABEL.all}</option>{types.filter(t=>t!=='image').map(t=><option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
    {(totals.chat!>0||totals.learning!>0||totals.notebook!>0||q.scope!=='all')&&<select aria-label={uiText("Lọc theo nơi lưu")} value={q.scope} onChange={e=>{const s=e.target.value as ScopeFilter;patch({scope:s,book:s==='notebook'?q.book:''});}}>{(['all','project','chat','learning','notebook'] as ScopeFilter[]).filter(s=>s==='all'||totals[s]!>0||q.scope===s).map(s=><option key={s} value={s}>{SCOPE_LABEL[s]} ({counts[s]})</option>)}</select>}
    {q.scope==='notebook'&&books.length>1&&<select aria-label={uiText("Lọc theo sổ nguồn")} value={q.book} onChange={e=>patch({book:e.target.value})}><option value="">{uiText("Mọi sổ")}</option>{books.map(b=><option key={b.id} value={b.id}>{b.name} ({b.count})</option>)}</select>}
    <select aria-label={uiText("Sắp xếp")} value={q.sort} onChange={e=>patch({sort:e.target.value as SortKey})}>{(Object.keys(SORT_LABEL) as SortKey[]).map(k=><option key={k} value={k}>{SORT_LABEL[k]}</option>)}</select>
    <button type="button" className={`source-refresh ${grouped?'on':''}`} aria-pressed={grouped} onClick={()=>setGrouped(v=>!v)} title={uiText("Nhóm tài liệu theo thư mục chứa")} aria-label={uiText("Nhóm theo thư mục")}>▤</button>
    <button type="button" className="source-refresh" disabled={busy||!scope} onClick={()=>void refresh()} title={uiText("Quét lại các thư mục đã nhớ: đọc tệp mới, đọc lại tệp đã sửa, gỡ tệp đã bị xóa. Tệp gốc luôn được giữ nguyên.")} aria-label={uiText("↻ Cập nhật tệp mới")}>{busy?'…':'↻'}</button>
    <span className="source-count" role="status" aria-live="polite">{filtered||aiActive?uiText("Hiển thị {0}/{1}",[shown.length,files.length]):uiText("{0} tài liệu",[files.length])}{aiBusy?' · '+uiText("✦ AI đang tìm…"):aiActive?' · '+uiText("✦ AI"):''}</span>
    {(filtered||aiActive)&&<button type="button" className="source-refresh" onClick={()=>{setQ(EMPTY_QUERY);setAi(null);}} title={uiText("Xóa bộ lọc")} aria-label={uiText("Xóa bộ lọc")}>✕</button>}
   </div>
   {index&&(index.indexing||index.roots.length>0)&&<div className="source-index" role="status" aria-live="polite">{index.indexing?uiText("Đang lập chỉ mục thư mục…"):uiText("Chỉ mục: {0} tệp trong {1} thư mục nguồn",[index.roots.reduce((n,r)=>n+r.files,0),index.roots.length])}{index.roots.some(r=>r.truncated)&&' · '+uiText("đã cắt bớt vì quá lớn")}</div>}
  </div>}
  <div className="source-body source-split">
   <div className="source-list" aria-label={uiText("Danh sách nguồn")} onKeyDown={e=>{if(e.key==='ArrowDown')move(1,e);else if(e.key==='ArrowUp')move(-1,e);}}>
    {selected&&<button onClick={onOffice}>{selected.host} · {selected.name} ↗</button>}
    {groups.map(g=><React.Fragment key={g.key}>{grouped&&<div className="source-group" title={g.key}>📁 {g.label} <small>({g.items.length})</small></div>}{g.items.map(f=>{const meta=[originLabel(f,SCOPE_META),f.notebook&&!f.notebook.on?uiText("đang tắt"):f.notebook&&f.notebook.state!=='san-sang'?(f.notebook.state==='loi'?uiText("lỗi đọc"):uiText("đang đọc")):'',sizeText(f.bytes),ageText(f.at)].filter(Boolean).join(' · ');return <button className={`source-item ${file?.id===f.id?'selected':''}`} id={'source-item-'+f.id} key={f.id} {...sourceMenu.handlers(f.id)} draggable onDragStart={e=>{e.dataTransfer.setData(SOURCE_REF_TYPE,JSON.stringify({name:f.name,path:f.notebook?'':f.path}));e.dataTransfer.setData('text/plain',f.notebook?f.name:f.path);e.dataTransfer.effectAllowed='copy';}} onMouseEnter={()=>setSelectedId(f.id)} onFocus={()=>setSelectedId(f.id)} onClick={()=>setSelectedId(f.id)} aria-pressed={file?.id===f.id}><span>▤</span><span><strong>{f.name}{isFresh(f)&&<span className="source-new">{uiText("Mới")}</span>}</strong><small className="source-meta">{meta}</small></span></button>;})}</React.Fragment>)}
    {!files.length&&<p>{uiText("Đính kèm tài liệu để bắt đầu.")}</p>}
    {files.length>0&&!shown.length&&<p className="source-empty">{uiText("Không có tài liệu khớp bộ lọc.")}<button type="button" onClick={()=>setQ(EMPTY_QUERY)}>{uiText("Xóa bộ lọc")}</button></p>}
    {files.length>0&&!rag&&<p>{uiText("Tra cứu tự động đang tắt.")}</p>}
   </div>
   <FilePreview file={file} chatId={chatId} query={q.content?q.query:''}/>
   {sourceMenu.menu}
  </div>
 </details>;
}
