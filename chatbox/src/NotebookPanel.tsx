import {t as uiText} from './i18n';
import {QuickFile} from './QuickFile';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {rpc,subscribe,pickFiles,type ViewState} from './ipc';
import {choiceKey,parseKey,modelGroups} from './model-groups';
import type {ModelChoice} from '@pvta/shared';
import {Markdown} from './Markdown';
import './notebook.css';
import {useObjectMenu} from './ObjectMenu';

type Source={id:string;kind:'file'|'audio'|'youtube'|'web';title:string;origin:string;state:'dang-doc'|'san-sang'|'loi';error?:string;note?:string;chars:number;on:boolean};
type Citation={n:number;sourceId:string;title:string;ref:string;quote:string;url?:string};
type Msg={id:string;role:'user'|'assistant';text:string;at:number;citations?:Citation[];grounded?:boolean};
type Book={id:string;name:string;sources:Source[];messages:Msg[];choice?:ModelChoice};
type Item={id:string;name:string;sources:number;updatedAt:number};
const FILTER={name:uiText("Tài liệu, âm thanh, video"),extensions:['pdf','docx','xlsx','pptx','md','txt','csv','mp3','wav','m4a','aac','ogg','flac','mp4','mov','mkv','webm','avi']};
const ICON:Record<Source['kind'],string>={file:'▤',audio:'♪',youtube:'▶',web:'⌘'};
const STARTERS=[uiText("Tóm tắt các nguồn"),uiText("Những ý chính là gì?"),uiText("Tạo 5 câu hỏi ôn tập kèm đáp án từ nguồn"),uiText("Các khái niệm quan trọng và định nghĩa")];

/** Trạng thái dùng chung của Sổ nguồn: thanh bên quản lí nguồn, khung phải trò chuyện với nguồn. */
export function useNotebook({report:reportIn,notice:noticeIn,navigationRequest,enabled=true}:{navigationRequest?:{bookId:string;id:string;title:string};report:(e:unknown)=>void;notice:(s:string)=>void;enabled?:boolean}){
 /* report/notice của App đổi danh tính mỗi lần vẽ; giữ bản ổn định để các effect không chạy lặp. */
 const reportRef=useRef(reportIn),noticeRef=useRef(noticeIn);reportRef.current=reportIn;noticeRef.current=noticeIn;
 const report=useCallback((e:unknown)=>reportRef.current(e),[]),notice=useCallback((m:string)=>noticeRef.current(m),[]);
 const [items,setItems]=useState<Item[]>([]);const [book,setBook]=useState<Book>();const [url,setUrl]=useState('');const [busy,setBusy]=useState(false);
 const [cite,setCite]=useState<Citation>();const [view,setView]=useState<{title:string;text:string}>();const [name,setName]=useState<string>();const [sure,setSure]=useState(false);
 const current=useRef<string>();current.current=book?.id;
 const loadList=useCallback(()=>rpc<Item[]>('nb.list').then(setItems).catch(report),[report]);
 const open=useCallback((id:string)=>rpc<Book>('nb.get',{id}).then(b=>{setBook(b);setCite(undefined);setSure(false);setName(undefined);}).catch(report),[report]);
 useEffect(()=>{if(enabled)void loadList();},[loadList,enabled]);
 useEffect(()=>{if(!enabled)return;let off:(()=>void)|undefined;let alive=true;void subscribe(e=>{if(e.event!=='notebook')return;const id=(e.data as {id?:string})?.id;void loadList();if(id&&id===current.current)void rpc<Book>('nb.get',{id}).then(b=>{if(alive&&current.current===b.id)setBook(b);}).catch(()=>{});}).then(f=>{if(alive)off=f;else f();});return()=>{alive=false;off?.();};},[loadList,enabled]);
 useEffect(()=>{if(enabled&&!book&&!navigationRequest&&items[0])void open(items[0].id);},[items,book,open,enabled]);
 useEffect(()=>{if(!enabled||!navigationRequest)return;let alive=true;setView(undefined);
  void rpc<Book>('nb.get',{id:navigationRequest.bookId}).then(b=>{if(!alive)return;setBook(b);setCite(undefined);setSure(false);setName(undefined);
   const source=b.sources.find(s=>s.id===navigationRequest.id);if(source?.state==='san-sang')void rpc<string>('nb.sourceText',{id:b.id,sid:source.id}).then(text=>{if(alive)setView({title:source.title,text});}).catch(e=>{if(alive)report(e);});
  }).catch(e=>{if(alive)report(e);});return()=>{alive=false;};
 },[navigationRequest,enabled]);
 const create=async()=>{try{const b=await rpc<Book>('nb.create',{name:uiText("Sổ nguồn {0}",[items.length+1])});setBook(b);setName(b.name);void loadList();}catch(e){report(e);}};
 const addFiles=async()=>{if(!book)return;try{const paths=await pickFiles(false,FILTER);if(!paths.length)return;const r=await rpc<{queued:number;errors:string[]}>('nb.addFiles',{id:book.id,paths});if(r.errors.length)notice(r.errors.join('\n'));if(r.queued)notice(uiText("Đang đọc {0} nguồn. Âm thanh/video lần đầu cần tải bộ phiên âm (vài trăm MB).",[r.queued]));void open(book.id);}catch(e){report(e);}};
 const addUrl=async()=>{if(!book||!url.trim())return;try{await rpc('nb.addUrl',{id:book.id,url});setUrl('');void open(book.id);}catch(e){report(e);}};
 const ask=async(text:string)=>{if(!book||!text.trim()||busy)return;setBusy(true);setBook(b=>b&&{...b,messages:[...b.messages,{id:'tmp',role:'user',text,at:Date.now()}]});try{await rpc('nb.ask',{id:book.id,question:text});}catch(e){report(e);}finally{setBusy(false);void open(book.id);}};
 const ready=book?.sources.filter(s=>s.on&&s.state==='san-sang').length??0;
 return {items,book,setBook,url,setUrl,busy,cite,setCite,view,setView,name,setName,sure,setSure,current,loadList,open,create,addFiles,addUrl,ask,ready,report};
}
export type NotebookController=ReturnType<typeof useNotebook>;

/** Quản lí sổ và nguồn: chọn/đổi tên/xóa sổ, thêm tệp hoặc link, bật tắt từng nguồn. Đặt ở thanh bên trái (hoặc trong trang khi dùng riêng). */
export function NotebookSources({c,split}:{c:NotebookController;split?:boolean}){
 const {items,book,url,setUrl,busy,name,setName,sure,setSure,ready,report}=c;
 const bookMenu=useObjectMenu<string>({contextKey:book?.id??'',onError:report,commands:id=>book?.id===id?[
  {id:'rename',label:uiText("Đổi tên"),run:()=>setName(book.name)},
  {id:'delete',label:uiText("Xóa sổ"),danger:true,disabledReason:busy?uiText("Đang trả lời từ nguồn"):undefined,run:()=>setSure(true)},
 ]:[]});
 const sourceMenu=useObjectMenu<string>({contextKey:book?.id??'',onError:report,commands:sid=>{
  const s=book?.sources.find(s=>s.id===sid);if(!s||!book)return [];
  return [...(s.state==='san-sang'?[{id:'view',label:'Xem',run:async()=>{const id=book.id;const text=await rpc<string>('nb.sourceText',{id,sid});if(c.current.current===id)c.setView({title:s.title,text});}}]:[]),
   {id:'remove',label:uiText("Xóa nguồn"),danger:true,disabledReason:busy?uiText("Đang trả lời từ nguồn"):undefined,run:async()=>{const id=book.id;const next=await rpc<Book>('nb.removeSource',{id,sid});if(c.current.current===id)c.setBook(next);}}];
 }});
 return <aside className={`nb-sources ${split?'nb-sources-split':''}`}>
  <div className="nb-book" {...(book?bookMenu.handlers(book.id):{})}>
   {split&&<button className="primary nb-new" onClick={()=>void c.create()}>{uiText("＋ Sổ mới")}</button>}
   <select aria-label={uiText("Chọn sổ")} value={book?.id??''} onChange={e=>void c.open(e.target.value)}>{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sources})</option>)}</select>
   {book&&(name!==undefined
    ?<form className="nb-rename" onSubmit={e=>{e.preventDefault();void rpc<Book>('nb.rename',{id:book.id,name}).then(b=>{c.setBook(b);setName(undefined);void c.loadList();}).catch(report);}}><input autoFocus aria-label={uiText("Tên sổ")} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setName(undefined);}}/><button className="primary">{uiText("Lưu")}</button></form>
    :<div className="nb-book-ops">{bookMenu.trigger(book.id,uiText("Thao tác sổ {0}",[book.name]))}</div>)}
   {sure&&book&&<div className="nb-book-ops"><button className="danger" disabled={busy} onClick={()=>void rpc('nb.remove',{id:book.id}).then(()=>{c.setBook(undefined);setSure(false);void c.loadList();}).catch(report)}>{uiText("Xóa hẳn sổ")}</button><button onClick={()=>setSure(false)}>{uiText("Giữ")}</button></div>}
   {bookMenu.menu}
  </div>
  <h3>{uiText("Nguồn")}<small>{ready}/{book?.sources.length??0} {uiText("đang dùng")}</small></h3>
  <button className="nb-add" disabled={!book} onClick={()=>void c.addFiles()}>{uiText("＋ Thêm tệp (PDF, Word, Excel, âm thanh, video…)")}</button>
  <form className="nb-url" onSubmit={e=>{e.preventDefault();void c.addUrl();}}><input aria-label={uiText("Link YouTube hoặc trang web")} placeholder={uiText("Dán link YouTube hoặc trang web")} value={url} onChange={e=>setUrl(e.target.value)}/><button disabled={!book||!url.trim()}>{uiText("Thêm")}</button></form>
  <ul className="nb-list">{book?.sources.map(s=><li key={s.id} className={`nb-src nb-${s.state}`} {...sourceMenu.handlers(s.id)}>
   <label className="nb-src-main"><input type="checkbox" aria-label={uiText("Dùng nguồn {0}",[s.title])} checked={s.on} disabled={s.state!=='san-sang'} onChange={e=>void rpc<Book>('nb.toggle',{id:book.id,sid:s.id,on:e.target.checked}).then(c.setBook).catch(report)}/>
    <span className="nb-ico" aria-hidden>{ICON[s.kind]}</span><span className="nb-title" title={s.origin}>{s.kind==='file'?<QuickFile path={s.origin}>{s.title}</QuickFile>:s.title}</span></label>
   <small className="nb-state">{s.state==='dang-doc'?uiText("Đang đọc…"):s.state==='loi'?uiText("Lỗi: {0}",[s.error??'']):uiText("{0} ký tự{1}",[s.chars<1000?s.chars:`${Math.round(s.chars/1000)}k`,s.note?` · ${s.note}`:''])}</small>
   <span className="nb-src-ops">{sourceMenu.trigger(s.id,uiText("Thao tác nguồn {0}",[s.title]))}</span>
  </li>)}</ul>{sourceMenu.menu}
  {book&&!book.sources.length&&<p className="muted small">{uiText("Chưa có nguồn. Thêm ít nhất một tệp hoặc link.")}</p>}
 </aside>;
}

/** Sổ nguồn kiểu NotebookLM: chỉ trả lời từ các nguồn thầy cô đưa vào, có trích dẫn.
 *  Khi có `controller` + `sourcesInSidebar`, danh sách nguồn nằm ở thanh bên trái và khung này dành toàn bộ chỗ cho trò chuyện. */
export function NotebookPanel({state,report,notice,openUrl,navigationRequest,controller,sourcesInSidebar}:{state?:ViewState;navigationRequest?:{bookId:string;id:string;title:string};report:(e:unknown)=>void;notice:(s:string)=>void;openUrl:(u:string)=>void;controller?:NotebookController;sourcesInSidebar?:boolean}){
 const own=useNotebook({report,notice,navigationRequest,enabled:!controller});const c=controller??own;
 const {items,book,busy,cite,setCite,view,setView,ready}=c;const split=!!sourcesInSidebar;
 const [q,setQ]=useState('');const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[book?.messages.length,busy]);
 const ask=(text=q)=>{if(!book||!text.trim()||busy)return;setQ('');void c.ask(text);};
 const groups=state?modelGroups(state):[];const modelKey=choiceKey(book?.choice);
 const setModel=(key:string)=>{if(!book)return;const choice=parseKey(key);void rpc<Book>('nb.setModel',{id:book.id,choice}).then(b=>{if(c.current.current===b.id)c.setBook(b);}).catch(report);};
 return <div className={`workspace-panel nb-panel ${split?'nb-split':''}`}>
  {split?<div className="nb-head"><div><span className="eyebrow">{uiText("SỔ NGUỒN")}</span><h1>{book?.name??uiText("Hỏi đáp từ tài liệu của thầy cô")}</h1><p>{uiText("PVTA chỉ trả lời từ các nguồn trong sổ và ghi rõ trích dẫn. Không có trong nguồn thì nói không có.")}</p></div><small className="nb-head-count">{ready}/{book?.sources.length??0} {uiText("nguồn đang dùng")}</small></div>
  :<div className="page-heading"><div><span className="eyebrow">{uiText("SỔ NGUỒN")}</span><h1>{uiText("Hỏi đáp từ tài liệu của thầy cô")}</h1><p>{uiText("PVTA chỉ trả lời từ các nguồn trong sổ và ghi rõ trích dẫn. Không có trong nguồn thì nói không có.")}</p></div><button className="primary" onClick={()=>void c.create()}>{uiText("＋ Sổ mới")}</button></div>}
  {!items.length&&!book?<div className="empty-card"><p>{uiText("Chưa có sổ nào. Tạo sổ, thêm PDF, Word, Excel, ghi âm, video hoặc link YouTube/trang web, rồi đặt câu hỏi.")}</p><button className="primary" onClick={()=>void c.create()}>{uiText("Tạo sổ đầu tiên")}</button></div>:
  <div className="nb-layout">
   {!split&&<NotebookSources c={c}/>}
   <section className="nb-chat">
    <div className="nb-messages">
     {book&&!book.messages.length&&<div className="nb-starters">{STARTERS.map(s=><button key={s} disabled={!ready||busy} onClick={()=>ask(s)}>{s}</button>)}</div>}
     {book?.messages.map(m=><article key={m.id} className={`nb-msg nb-${m.role}`}>
      {m.role==='assistant'&&m.grounded===false&&<small className="nb-warn">{uiText("Không dựa được vào nguồn")}</small>}
      <Markdown text={m.text}/>
      {!!m.citations?.length&&<div className="nb-cites">{m.citations.map(ct=><button key={ct.n} className={cite===ct?'on':''} title={`${ct.title} · ${ct.ref}`} onClick={()=>setCite(cite===ct?undefined:ct)}>[{ct.n}] {ct.title} · {ct.ref}</button>)}</div>}
     </article>)}
     {busy&&<p className="muted small">{uiText("PVTA đang đọc nguồn…")}</p>}
     <div ref={end}/>
    </div>
    {cite&&<aside className="nb-quote"><header><strong>[{cite.n}] {cite.title}</strong><small>{cite.ref}</small><button aria-label={uiText("Đóng trích dẫn")} onClick={()=>setCite(undefined)}>{uiText("×")}</button></header><blockquote>{cite.quote}</blockquote>{cite.url&&<button onClick={()=>openUrl(cite.url!)}>{uiText("Mở nguồn")} {cite.url.includes('youtube')?' đúng đoạn':''} ↗</button>}</aside>}
    <form className="nb-ask" onSubmit={e=>{e.preventDefault();ask();}}>
     <textarea aria-label={uiText("Câu hỏi cho sổ nguồn")} placeholder={ready?uiText("Hỏi về các nguồn đang chọn…"):uiText("Thêm và bật ít nhất một nguồn để hỏi")} value={q} disabled={!book} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();ask();}}}/>
     <div className="nb-ask-bar"><label className="nb-model" title={uiText("Model trả lời cho sổ này. Tự động = model chung trong Cài đặt.")}><span>{uiText("Model")}</span><select aria-label={uiText("Model cho sổ nguồn")} value={modelKey} disabled={!book||busy} onChange={e=>setModel(e.target.value)}>
      <option value="auto">{uiText("Tự động (model chung)")}</option>
      {groups.map(g=><optgroup key={g.label} label={g.label}>{g.items.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
      {modelKey!=='auto'&&!groups.some(g=>g.items.some(m=>m.key===modelKey))&&<option value={modelKey}>{book?.choice?.model} {uiText("(chưa cấu hình)")}</option>}
     </select></label>{book&&!!book.messages.length&&<button type="button" onClick={()=>void rpc<Book>('nb.clear',{id:book.id}).then(c.setBook).catch(report)}>{uiText("Xóa hội thoại")}</button>}<button className="primary" disabled={!ready||busy||!q.trim()}>{uiText("Hỏi")}</button></div>
    </form>
   </section>
  </div>}
  {view&&<div className="modal-backdrop" onClick={()=>setView(undefined)}><div className="modal" role="dialog" aria-label={view.title} onClick={e=>e.stopPropagation()}><header><h2>{view.title}</h2><button aria-label={uiText("Đóng")} onClick={()=>setView(undefined)}>{uiText("×")}</button></header><div className="modal-body"><pre className="nb-source-text">{view.text}</pre></div></div></div>}
 </div>;
}
