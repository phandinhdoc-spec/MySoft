import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {rpc} from './ipc';
import './quick-file.css';
export function requestFileEdit(path:string){window.dispatchEvent(new CustomEvent('pvta-edit-file',{detail:{path}}));}
export function EditFileButton({path}:{path:string}){
 const isOffice=/\.(docx?|xlsx?|pptx?|docm|xlsm|pptm|dotx|xltx|potx)$/i.test(path);
 const isEditable=/\.(docx|xlsx|pptx|pdf|md|txt|csv)$/i.test(path);
 if(!isOffice&&!isEditable)return null;
 return <span className="quick-file-actions" style={{display:'inline-flex',gap:6,flexWrap:'wrap'}}>{isOffice&&<button onClick={()=>void rpc('openFileRef',{ref:path,app:'office'})}>{uiText("Mở bằng Microsoft Office ↗")}</button>}{isEditable&&<button className="primary" onClick={()=>requestFileEdit(path)}>{uiText("Chỉnh sửa tệp này bằng PVTA")}</button>}</span>;
}
interface Preview{name:string;segments:{ref:string;text:string}[];image?:boolean;data?:string;draft?:boolean}
/** Read-only hover view. No working copy is created until the explicit edit button is pressed. */
export function QuickFile({path,children}:{path:string;children?:React.ReactNode}){
 const anchor=useRef<HTMLSpanElement>(null);const timer=useRef<ReturnType<typeof setTimeout>>();const [position,setPosition]=useState<{left:number;top:number}>();const [preview,setPreview]=useState<Preview>();const [error,setError]=useState('');
 function cancel(){clearTimeout(timer.current);}
 function hide(){cancel();timer.current=setTimeout(()=>setPosition(undefined),250);}
 function open(){cancel();const r=anchor.current?.getBoundingClientRect();if(r)setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-380)),top:r.top>350?r.top-334:Math.min(r.bottom+6,Math.max(8,window.innerHeight-330))});}
 function show(){cancel();timer.current=setTimeout(open,350);}
 useEffect(()=>()=>cancel(),[]);
 useEffect(()=>{if(!position){setPreview(undefined);return;}let alive=true;setPreview(undefined);setError('');void rpc<Preview>('fileQuickPreview',{path}).then(v=>{if(alive)setPreview(v);}).catch(e=>{if(alive)setError(String(e));});const dismiss=()=>setPosition(undefined);window.addEventListener('resize',dismiss);return()=>{alive=false;window.removeEventListener('resize',dismiss);};},[!!position,path]);
 return <span ref={anchor} className="quick-file-anchor" onClick={e=>{if(!e.defaultPrevented&&(e.target as Element).closest('[data-file-open]'))open();}} tabIndex={0} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)&&!(e.relatedTarget instanceof Element&&e.relatedTarget.closest('.quick-file-popup')))hide();}} onKeyDown={e=>{if(e.key==='Escape'){cancel();setPosition(undefined);}if(e.key===' '&&e.target===e.currentTarget){e.preventDefault();show();}}}>{children??path.split(/[\\/]/).pop()}{position&&createPortal(<section className="quick-file-popup" role="dialog" aria-label={uiText("Xem nhanh tệp")} style={position} onMouseEnter={cancel} onMouseLeave={hide} onFocus={cancel} onBlur={hide} onKeyDown={e=>{if(e.key==='Escape'){setPosition(undefined);anchor.current?.focus();}}}><header><strong>{preview?.name??path.split(/[\\/]/).pop()}</strong><button aria-label={uiText("Đóng xem nhanh")} onClick={()=>setPosition(undefined)}>{uiText("×")}</button></header><div className="quick-file-body">{error?<p role="alert">{error}</p>:!preview?<p>{uiText("Đang xem nhanh…")}</p>:preview.data?<img src={preview.data} alt={preview.name}/>:preview.segments.length?preview.segments.map((s,i)=><div key={i}><small>{s.ref}</small><pre>{s.text}</pre></div>):<p>{uiText("Không có nội dung chữ để xem nhanh.")}</p>}</div><footer><small>{preview?.draft?uiText("Bản nháp chưa lưu · Chỉ xem"):uiText("Chỉ xem · Nội dung trích xuất")}</small><EditFileButton path={path}/></footer></section>,document.body)}</span>;
}
