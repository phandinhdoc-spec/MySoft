import React,{useEffect,useMemo,useState} from 'react';
import {t as uiText} from './i18n';
import {Icon} from './Icon';
import {rpc,type ViewState} from './ipc';
import {FilePreview} from './WorkspaceContext';
import {EditFileButton} from './QuickFile';
import {chatTools,type Section,type ToolFile} from './chat-tools';
import './projectTools.css';

type Kind='rules'|'skills'|'prompts';
interface Props{state:ViewState;chatId:string;title:string;pinned:boolean;expanded:boolean;onPin:()=>void;onExpand:()=>void;onClose:()=>void;onInsert:(text:string,kind:Kind)=>void;onManage:(kind:Kind)=>void}
interface Preview{name:string;segments:{ref:string;text:string}[];data?:string;draft?:boolean}

/** Cửa sổ tiện ích của một hội thoại (dùng khi chat không thuộc dự án): quy tắc, kỹ năng, lời nhắc mẫu, tệp của phiên và xem trước. */
export function ChatToolsWindow({state,chatId,title,pinned,expanded,onPin,onExpand,onClose,onInsert,onManage}:Props){
 const tools=useMemo(()=>chatTools(state,chatId),[state,chatId]);
 const [filter,setFilter]=useState<'all'|'text'|'image'>('all');const [selected,setSelected]=useState('');
 useEffect(()=>setSelected(''),[chatId]);
 const files=tools.files.filter(f=>filter==='all'||(filter==='image')===f.image);
 const file=tools.files.find(f=>f.key===selected);
 const imageCount=tools.files.filter(f=>f.image).length;
 return <aside className={`project-tools-window chat-tools-window ${expanded?'expanded':''}`} role="region" aria-label={uiText("Tiện ích của chat")}>
  <header><div><strong>{uiText("Tiện ích của chat")}</strong><small>{title}</small></div><button className="project-pin" aria-pressed={pinned} title={pinned?uiText("Bỏ ghim để tự ẩn khi rời bảng"):uiText("Ghim bảng luôn hiển thị")} onClick={onPin}><Icon name="pin"/>{pinned?uiText("Đã ghim"):uiText("Tự ẩn")}</button><button aria-label={expanded?uiText("Thu nhỏ bảng"):uiText("Mở rộng bảng")} onClick={onExpand}>{expanded?'↙':'↗'}</button><button aria-label={uiText("Đóng tiện ích của chat")} onClick={onClose}>{uiText("×")}</button></header>
  <div className="project-tools-groups">
   <ToolGroup kind="rules" icon="hash" heading={uiText("Quy tắc")} section={tools.rules} onManage={onManage} manage={uiText("Quản lý quy tắc")}
    render={r=><button key={`${r.scope}:${r.id}`} className="chat-tool-item" title={r.text} onClick={()=>onInsert(`#${r.key}`,'rules')}><span>#{r.key}</span><small>{r.title} · {r.reason==='chat'?uiText("Riêng chat này"):r.reason==='always'?uiText("Luôn áp dụng"):r.reason==='mentioned'?uiText("Đã gọi {0} lần",[r.uses]):r.uses?uiText("Dùng {0} lần",[r.uses]):uiText("Gọi khi cần")}</small></button>}/>
   <ToolGroup kind="skills" icon="skills" heading={uiText("Kỹ năng")} section={tools.skills} onManage={onManage} manage={uiText("Quản lý kỹ năng")}
    render={s=><button key={s.name} className="chat-tool-item" title={s.description} onClick={()=>onInsert(`/${s.name}`,'skills')}><span>/{s.name}</span><small>{s.reason==='mentioned'?uiText("Đã gọi {0} lần",[s.uses]):s.uses?uiText("Dùng {0} lần",[s.uses]):s.description||uiText("Quy trình cá nhân.")}</small></button>}/>
   <ToolGroup kind="prompts" icon="at" heading={uiText("Lời nhắc mẫu")} section={tools.prompts} onManage={onManage} manage={uiText("Thư viện lời nhắc")}
    render={p=><button key={p.id} className="chat-tool-item" title={p.text} onClick={()=>onInsert(p.text,'prompts')}><span>{p.favorite?'★ ':''}{p.title}</span><small>{p.reason==='used'?uiText("Đã dùng {0} lần trong chat",[p.uses]):p.uses?uiText("Dùng {0} lần",[p.uses]):p.own?uiText("Của tôi"):(p.desc??p.text.slice(0,80))}</small></button>}/>
   <section className="project-tools-actions chat-tools-files"><h3><Icon name="file"/>{uiText("Tệp của phiên")} <em className="chat-tool-count">{tools.files.length}</em></h3>
    {tools.files.length>0&&<div className="chat-tool-filter" role="group" aria-label={uiText("Lọc tệp")}>{(['all','text','image'] as const).map(k=><button key={k} aria-pressed={filter===k} onClick={()=>setFilter(k)}>{k==='all'?uiText("Tất cả"):k==='text'?uiText("Văn bản · {0}",[tools.files.length-imageCount]):uiText("Ảnh · {0}",[imageCount])}</button>)}</div>}
    {files.map(f=><button key={f.key} className={`chat-tool-item ${f.key===selected?'selected':''}`} aria-pressed={f.key===selected} title={f.path} onClick={()=>setSelected(f.key)}><span>{f.image?'🖼 ':'📄 '}{f.name}</span><small>{f.origin==='ai'?uiText("PVTA tạo"):uiText("Thầy cô đưa vào")}{f.at?` · ${new Date(f.at).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}`:''}</small></button>)}
    {!tools.files.length&&<small>{uiText("Chưa có tệp nào. Tệp thầy cô đính kèm và tệp PVTA tạo trong chat này sẽ hiện ở đây.")}</small>}
    {tools.files.length>0&&!files.length&&<small>{uiText("Không có tệp thuộc loại này.")}</small>}
   </section>
  </div>
  <section className="project-preview-pane" aria-label={uiText("Xem trước tệp của phiên")}><header><Icon name="eye"/><strong>{uiText("Xem trước")}</strong></header>
   {!file?<p className="project-preview-empty">{uiText("Chọn một tệp trong danh sách để xem trước.")}</p>:file.attachment?<FilePreview file={file.attachment} chatId={chatId}/>:<PathPreview file={file}/>}
  </section>
 </aside>;
}

function ToolGroup<T>({kind,icon,heading,section,render,onManage,manage}:{kind:Kind;icon:string;heading:string;section:Section<T>;render:(item:T)=>React.ReactNode;onManage:(k:Kind)=>void;manage:string}){
 const total=section.inChat.length+section.common.length;
 return <section className={`project-tools-actions chat-tools-${kind}`}><h3><Icon name={icon}/>{heading}</h3>
  {section.inChat.length>0&&<><div className="chat-tool-sub">{uiText("Trong chat này")}</div>{section.inChat.map(render)}</>}
  {section.common.length>0&&<><div className="chat-tool-sub">{uiText("Thường dùng")}</div>{section.common.map(render)}</>}
  {!total&&<small>{uiText("Chưa có mục nào.")}</small>}
  <button type="button" className="btn-compact chat-tool-manage" onClick={()=>onManage(kind)}>⚙ {manage}</button>
 </section>;
}

/** Xem trước tệp do PVTA tạo (chưa đính kèm vào chat): đọc qua lõi, chỉ xem. */
export function PathPreview({file}:{file:Pick<ToolFile,'name'|'path'>}){
 const [preview,setPreview]=useState<Preview>();const [error,setError]=useState('');
 useEffect(()=>{let alive=true;setPreview(undefined);setError('');void rpc<Preview>('fileQuickPreview',{path:file.path}).then(v=>{if(alive)setPreview(v);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});return()=>{alive=false;};},[file.path]);
 return <section className="context-preview" aria-label={uiText("Bản xem trước")}><strong>{file.name}</strong><EditFileButton path={file.path}/><small>{file.path}</small>
  {error?<p role="alert">{error}</p>:!preview?<p>{uiText("Đang tải…")}</p>:preview.data?<img src={preview.data} alt={file.name}/>:preview.segments.length?preview.segments.map((s,i)=><div key={i}><small>{s.ref}</small><pre>{s.text}</pre></div>):<p>{uiText("Chưa có nội dung để xem trước.")}</p>}
 </section>;
}
