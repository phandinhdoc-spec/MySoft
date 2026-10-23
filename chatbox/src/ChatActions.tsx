import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {rpc,type Chat} from './ipc';
import {useObjectMenu} from './ObjectMenu';
import {openChatWindow} from './chat-window';

type Nb={id:string;name:string};
function NotebookPicker({chat,report,close}:{chat:Chat;report:(e:unknown)=>void;close:()=>void}){
 const [items,setItems]=useState<Nb[]>();const [ids,setIds]=useState<string[]>(chat.notebookIds??[]);const [busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;void rpc<Nb[]>('nb.list').then(v=>{if(alive)setItems(v);}).catch(e=>{if(alive){setItems([]);report(e);}});return()=>{alive=false;};},[report]);
 async function toggle(id:string){if(busy)return;const next=ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];setBusy(true);
  try{await rpc('setNotebookLinks',{scope:'chat',id:chat.id,notebookIds:next});setIds(next);}catch(e){report(e);}finally{setBusy(false);}}
 return <div role="menu" aria-label={uiText("Thêm sổ nguồn")}>
  {!items?<p className="muted small">{uiText("Đang tải…")}</p>:!items.length?<p className="muted small">{uiText("Chưa có Sổ nguồn.")}</p>:items.map(nb=><button key={nb.id} type="button" role="menuitemradio" aria-checked={ids.includes(nb.id)} disabled={busy} onClick={e=>{e.stopPropagation();void toggle(nb.id);}}><span aria-hidden="true">{ids.includes(nb.id)?'✓':''}</span><span>{nb.name}</span></button>)}
 </div>;
}
type Result={deleted?:boolean;project?:string};
interface Props{chat:Chat;projects:{id:string;name:string}[];variant:'menu'|'inline';report:(e:unknown)=>void;onDone?:(r:Result)=>void;children?:React.ReactNode;className?:string}

/** Both row triggers share commands; editing and deletion keep explicit forms. */
export function ChatActions({chat,projects,report,onDone,children,className=''}:Props){
 const [mode,setMode]=useState<'rename'|'delete'>();const [name,setName]=useState('');const [busy,setBusy]=useState(false);
 const box=useRef<HTMLDivElement>(null),form=useRef<HTMLDivElement>(null);const running=useRef(false);
 const menu=useObjectMenu({contextKey:chat.id,onError:report,commands:()=>[
  {id:'open-window',label:uiText("Mở trong cửa sổ mới"),run:()=>openChatWindow(chat.id)},
  {id:'rename',label:uiText("Đổi tên"),disabledReason:busy?uiText("Đang xử lý"):undefined,run:()=>{setName(chat.title);setMode('rename');}},
  {id:'pin',label:chat.pinned?uiText("Bỏ ghim"):uiText("Ghim"),disabledReason:busy?uiText("Đang xử lý"):undefined,run:()=>run('pinChat',{pinned:!chat.pinned},{})},
  {id:'move',label:uiText("Chuyển vào dự án"),disabledReason:busy?uiText("Đang xử lý"):undefined,run:()=>{},submenu:<div role="menu" aria-label={uiText("Đưa «{0}» vào dự án",[chat.title])}>
   {[{id:'',name:uiText("Chat độc lập")},...projects].map(p=><button key={p.id} type="button" role="menuitemradio" aria-checked={(chat.projectId??'')===p.id} disabled={busy} onClick={e=>{e.stopPropagation();if((chat.projectId??'')===p.id){menu.close(true);return;}void run('moveChat',{projectId:p.id},{project:p.id});}}><span aria-hidden="true">{(chat.projectId??'')===p.id?'✓':''}</span><span>{p.name}</span></button>)}
  </div>},
  {id:'notebook',label:uiText("Thêm sổ nguồn"),run:()=>{},submenu:<NotebookPicker chat={chat} report={report} close={()=>menu.close(true)}/>},
  {id:'delete',label:uiText("Xóa"),danger:true,group:'delete',disabledReason:busy?uiText("Đang xử lý"):undefined,run:()=>setMode('delete')},
 ]});
 useEffect(()=>{setMode(undefined);},[chat.id]);
 useEffect(()=>{
  if(!mode)return;
  form.current?.querySelector<HTMLElement>('input,select,button')?.focus();
  const off=(e:MouseEvent)=>{if(!running.current&&box.current&&!box.current.contains(e.target as Node)&&!form.current?.contains(e.target as Node))setMode(undefined);};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!running.current)setMode(undefined);};
  document.addEventListener('mousedown',off);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('mousedown',off);document.removeEventListener('keydown',esc);};
 },[mode]);
 async function run(method:string,params:Record<string,unknown>,result:Result){
  if(running.current)return;running.current=true;setBusy(true);
  try{await rpc(method,{chatId:chat.id,...params});onDone?.(result);setMode(undefined);menu.close(true);}
  catch(e){report(e);}finally{running.current=false;setBusy(false);}
 }
 return <div className={`chat-object ${className}`} ref={box} {...menu.handlers(chat.id)}>
  {children}{menu.menu}
  {mode&&createPortal(<div ref={form} className="chat-object-form" role="dialog" aria-label={uiText("Thao tác với {0}",[chat.title])} onClick={e=>e.stopPropagation()}>
   {mode==='rename'&&<form className="chat-rename" onSubmit={e=>{e.preventDefault();const title=name.trim();if(!title||title===chat.title){setMode(undefined);return;}void run('renameChat',{title},{});}}>
    <input autoFocus aria-label={uiText("Tên mới của cuộc trò chuyện")} maxLength={150} value={name} onChange={e=>setName(e.target.value)}/>
    <button className="primary" disabled={busy||!name.trim()}>{uiText("Lưu")}</button><button type="button" disabled={busy} onClick={()=>setMode(undefined)}>{uiText("Hủy")}</button>
   </form>}
   {mode==='delete'&&<span className="chat-delete-confirm"><span>{uiText("Xóa «")} {chat.title}»?</span><button className="danger" disabled={busy} onClick={()=>void run('deleteChat',{},{deleted:true})}>{uiText("Xóa hẳn")}</button><button disabled={busy} onClick={()=>setMode(undefined)}>{uiText("Giữ lại")}</button></span>}
  </div>,document.body)}
 </div>;
}
