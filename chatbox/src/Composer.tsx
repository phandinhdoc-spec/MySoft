import {t as uiText} from './i18n';
import React,{useEffect,useMemo,useState} from 'react';
import {BUILTIN_PROMPTS,PROMPT_CATEGORIES,modelsOf,TRIGGERS,TRIGGER_HINT,matchesQuery,pathToken,dirOf,type LibraryPrompt,type TriggerChar,type TriggerKind} from '@pvta/shared';
import {rpc,type ViewState} from './ipc';
import {Icon} from './Icon';
import {useObjectMenu} from './ObjectMenu';
import {StandardizeBox} from './Standardize';
import {SCOPE_LABEL,scopeOf} from './source-filter';
import type {ContextFile} from './notebook-files';
import {effectiveRules,type RuleLike,type RuleScope,type RuleScopeKind} from './profile';

/** Gợi ý khi ô chat còn trống: các ký tự @ / # được tô như phím để dễ nhận ra. */
export function ComposerHint(){
 const parts=TRIGGER_HINT.split(/(\$\$|[@/#$])/);
 return <p className="composer-hint" id="composer-hint">{parts.map((p,i)=>p==='@'||p==='/'||p==='#'||p==='$'||p==='$$'?<kbd key={i}>{p}</kbd>:<React.Fragment key={i}>{p}</React.Fragment>)}</p>;
}

/** Biểu tượng có chú thích hiện khi rê chuột hoặc dùng bàn phím: tên và hướng dẫn sử dụng. */
export function Tip({name,guide,children,align='left'}:{name:string;guide:string;children:React.ReactNode;align?:'left'|'right'}){
 return <span className={`tip-wrap tip-${align}`} title={`${name}: ${guide}`}>{children}<span className="tip" aria-hidden="true"><strong>{name}</strong><small>{guide}</small></span></span>;
}
export function TriggerButton({char,onClick,active}:{char:TriggerChar;onClick:()=>void;active:boolean}){
 const t=TRIGGERS[char];const icon={'@':'at','/':'slash','#':'hash','$':'dollar','$$':'folder'}[char];
 return <Tip name={`${t.name} · ${char}`} guide={t.guide}><button type="button" className={`trigger-button ${active?'on':''}`} aria-label={`${t.name}. ${t.guide}`} aria-pressed={active} onClick={onClick}><Icon name={icon}/></button></Tip>;
}

export interface MenuItem{id:string;title:string;desc?:string;group?:string;value:string;star?:boolean}
const catName=(id:string)=>PROMPT_CATEGORIES.find(c=>c.id===id)?.name??uiText("Của tôi");
const MAX_ITEMS=40;

/** Nguồn cho `$` (tệp trong ngữ cảnh) và `$$` (thư mục): tệp đang hiện trong «Tài liệu trong ngữ cảnh» và dự án đang mở. */
export interface PickContext{files:ContextFile[];project?:{folders?:string[];outputDir?:string;learning?:{folders:string[]};ruleBook?:RuleLike[]};chat?:{ruleBook?:RuleLike[]}}
const scopeName=(k:RuleScopeKind)=>k==='profile'?uiText("Cá nhân"):k==='project'?uiText("Dự án"):uiText("Hội thoại này");
const baseName=(p:string)=>p.split(/[\\/]/).filter(Boolean).pop()??p;
const GROUP_ORDER=['project','chat','notebook','learning'] as const;

function fileItems(query:string,ctx:PickContext):MenuItem[]{
 const dup=new Map<string,number>();for(const f of ctx.files)dup.set(f.name,(dup.get(f.name)??0)+1);
 return ctx.files.filter(f=>matchesQuery(`${f.name} ${f.path} ${f.notebook?.name??''}`,query))
  .map(f=>{const scope=scopeOf(f);const group=f.notebook?`${SCOPE_LABEL.notebook}: ${f.notebook.name}`:SCOPE_LABEL[scope];
   // Tệp trùng tên thì chèn đường dẫn đầy đủ để PVTA không đọc nhầm; tệp của sổ nguồn không có đường dẫn tệp thật nên dùng tên.
   const value=pathToken(!f.notebook&&dup.get(f.name)!>1?f.path:f.name);
   return {id:f.id,title:f.name,desc:f.notebook?f.notebook.name:f.path,group,value,order:GROUP_ORDER.indexOf(scope)} as MenuItem&{order:number};})
  .sort((a,b)=>(a as MenuItem&{order:number}).order-(b as MenuItem&{order:number}).order||a.group!.localeCompare(b.group!,'vi'));
}
function folderItems(query:string,ctx:PickContext):MenuItem[]{
 const seen=new Set<string>();const out:MenuItem[]=[];
 const add=(path:string,group:string)=>{const key=path.replace(/[\\/]+$/,'');if(!key||seen.has(key))return;seen.add(key);if(!matchesQuery(`${baseName(key)} ${key}`,query))return;out.push({id:'dir:'+key,title:baseName(key),desc:key,group,value:pathToken(key)});};
 const p=ctx.project;
 for(const f of p?.folders??[])add(f,f===p?.outputDir?uiText("Thư mục dự án · lưu chính"):uiText("Thư mục dự án"));
 if(p?.outputDir)add(p.outputDir,uiText("Thư mục dự án · lưu chính"));
 for(const f of p?.learning?.folders??[])add(f,uiText("Học hỏi"));
 for(const f of ctx.files)if(!f.notebook&&f.purpose!=='learning')add(dirOf(f.path),uiText("Thư mục chứa tài liệu"));
 const order=[uiText("Thư mục dự án · lưu chính"),uiText("Thư mục dự án"),uiText("Thư mục chứa tài liệu"),uiText("Học hỏi")];
 return out.sort((a,b)=>order.indexOf(a.group!)-order.indexOf(b.group!));
}

/** Danh sách theo ký tự đã gõ: @ lời nhắc (yêu thích → của tôi → mẫu dựng sẵn), / kỹ năng đang bật, # quy tắc, $ tệp trong ngữ cảnh, $$ thư mục. */
export function menuItems(kind:TriggerKind,query:string,state:ViewState,ctx:PickContext={files:[]}):MenuItem[]{
 let items:MenuItem[]=[];
 if(kind==='files')items=fileItems(query,ctx);
 else if(kind==='folders')items=folderItems(query,ctx);
 else if(kind==='prompts'){
  const fav=new Set(state.prompts.favorites);

  const all:LibraryPrompt[]=[...state.prompts.own,...BUILTIN_PROMPTS];
  items=all.map(p=>({id:p.id,title:p.title,desc:p.desc??p.text.slice(0,80),group:p.own?uiText("Của tôi"):catName(p.category),value:p.text,star:fav.has(p.id),hay:`${p.title} ${p.desc??''} ${p.text} ${catName(p.category)}`}) as MenuItem&{hay:string})
   .filter(i=>matchesQuery((i as MenuItem&{hay:string}).hay,query))
   .sort((a,b)=>Number(!!b.star)-Number(!!a.star));
 }else if(kind==='skills'){
  items=state.skills.filter(s=>s.load!=='off'&&matchesQuery(`${s.name} ${s.description}`,query)).map(s=>({id:s.name,title:`/${s.name}`,desc:s.description||uiText("Quy trình cá nhân."),group:s.name.startsWith('office-')||s.name.startsWith('pvta-')?uiText("Đi kèm PVTA"):s.name.startsWith('learned-')?uiText("PVTA đã học"):uiText("Của thầy cô"),value:s.name}));
 }else{
  items=effectiveRules({profile:state.data.ruleBook,project:ctx.project?.ruleBook,chat:ctx.chat?.ruleBook}).filter(r=>matchesQuery(`${r.title} ${r.key} ${r.text}`,query)).map(r=>({id:`${r.scope}:${r.id}`,title:`#${r.key}`,desc:`${r.title}: ${r.text.slice(0,80)}`,group:`${scopeName(r.scope)} · ${r.always?(r.scope==='project'?uiText("Toàn cục"):uiText("Luôn áp dụng")):(r.scope==='project'?uiText("Cục bộ · gọi khi cần"):uiText("Gọi khi cần"))}`,value:r.key}));
 }
 return items.slice(0,MAX_ITEMS);
}

export function TriggerMenu({char,items,selected,onPick,onHover,onManage,onClose}:{char:TriggerChar;items:MenuItem[];selected:number;onPick:(i:MenuItem)=>void;onHover:(n:number)=>void;onManage:()=>void;onClose:()=>void}){
 const t=TRIGGERS[char];
 useEffect(()=>{document.getElementById('trigger-option-'+selected)?.scrollIntoView({block:'nearest'});},[selected]);
 let last='';
 return <div className="trigger-menu" role="listbox" aria-label={t.name} onMouseDown={e=>e.preventDefault()}>
  <header><strong><span className="trigger-char">{char}</span> {t.name}</strong><small>{uiText("↑↓ chọn · Enter chèn · Esc đóng")}</small><button type="button" className="menu-close" aria-label={uiText("Đóng")} onClick={onClose}>{uiText("×")}</button></header>
  <div className="trigger-list">{items.map((it,i)=>{const heading=it.group!==last?it.group:undefined;last=it.group??'';return <React.Fragment key={it.id}>{heading&&<div className="trigger-group">{heading}</div>}<button type="button" id={'trigger-option-'+i} role="option" aria-selected={i===selected} className={i===selected?'selected':''} onMouseEnter={()=>onHover(i)} onClick={()=>onPick(it)}><span className="trigger-title">{it.star?'★ ':''}{it.title}</span><small>{it.desc}</small></button></React.Fragment>;})}
   {!items.length&&<p className="trigger-empty">{char==='@'?uiText("Chưa có lời nhắc phù hợp."):char==='/'?uiText("Chưa có kỹ năng phù hợp."):char==='$'?uiText("Chưa có tài liệu phù hợp. Bấm “Đính kèm tệp khác” để thêm."):char==='$$'?uiText("Chưa có thư mục phù hợp. Bấm “Chọn thư mục khác” để chọn."):uiText("Chưa có quy tắc nào. Bấm “Quản lý quy tắc” để thêm.")}</p>}</div>
  <footer><button type="button" onClick={onManage}>⚙ {t.manage}</button></footer>
 </div>;
}

/** Quản lý thư viện lời nhắc: xem mẫu dựng sẵn, thêm / sửa / xóa lời nhắc của thầy cô, đánh dấu yêu thích. */
export function PromptManager({state,report,notice,onActions}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;onActions?:(actions:React.ReactNode)=>void}){
 const [editing,setEditing]=useState<Partial<LibraryPrompt>|undefined>();const [query,setQuery]=useState('');
 const [selectedId,setSelectedId]=useState<string>('');
 const fav=new Set(state.prompts.favorites);
 const all=useMemo(()=>[...state.prompts.own,...BUILTIN_PROMPTS].filter(p=>matchesQuery(`${p.title} ${p.desc??''} ${p.text}`,query)),[state.prompts.own,query]);
 const selectedPrompt=all.find(p=>p.id===selectedId)||all[0];

 const handleAdd=()=>{
  setEditing({category:'cua-toi',title:'',text:''});
 };
 const handleEdit=()=>{
  if(selectedPrompt){
   if(selectedPrompt.own){
    setEditing(selectedPrompt);
   }else{
    setEditing({title:selectedPrompt.title,text:selectedPrompt.text,category:selectedPrompt.category});
    notice(uiText("Đã nhân bản mẫu dựng sẵn để chỉnh sửa."));
   }
  }else{
   notice(uiText("Chưa có lời nhắc nào để sửa. Bấm Thêm để tạo mới."));
  }
 };
 const handleDelete=()=>{
  if(selectedPrompt){
   if(selectedPrompt.own){
    if(confirm(uiText("Xóa lời nhắc “{0}”?",[selectedPrompt.title]))){
     void rpc('deletePrompt',{id:selectedPrompt.id}).then(()=>{
      notice(uiText("Đã xóa lời nhắc."));
      if(selectedId===selectedPrompt.id)setSelectedId('');
     }).catch(report);
    }
   }else{
    notice(uiText("Mẫu có sẵn của hệ thống không thể xóa."));
   }
  }else{
   notice(uiText("Chưa có lời nhắc nào để xóa."));
  }
 };

 useEffect(()=>{
  onActions?.(<div className="manager-header-toolbar">
   <button type="button" className="primary btn-compact" title={uiText("Thêm prompt mẫu mới")} onClick={handleAdd}>{uiText("＋ Thêm")}</button>
   <button type="button" className="btn-compact" disabled={!selectedPrompt} title={uiText("Sửa prompt mẫu đang chọn")} onClick={handleEdit}>{uiText("✎ Sửa")}</button>
   <button type="button" className="danger btn-compact" disabled={!selectedPrompt||!selectedPrompt?.own} title={uiText("Xóa prompt mẫu đang chọn")} onClick={handleDelete}>{uiText("🗑 Xóa")}</button>
  </div>);
 },[selectedPrompt]);

 const menu=useObjectMenu<string>({contextKey:'prompts',onError:report,commands:id=>{
  const p=[...state.prompts.own,...BUILTIN_PROMPTS].find(p=>p.id===id);if(!p)return [];
  return [{id:'favorite',label:fav.has(id)?uiText("Bỏ yêu thích"):uiText("Yêu thích"),run:()=>rpc('favoritePrompt',{id,on:!fav.has(id)})},
   ...(p.own?[{id:'edit',label:uiText("Sửa"),run:()=>setEditing(p)},{id:'delete',label:uiText("Xóa"),danger:true,run:()=>{if(confirm(uiText("Xóa lời nhắc “{0}”?",[p.title])))return rpc('deletePrompt',{id});}}]:[{id:'copy',label:uiText("Nhân bản"),run:()=>setEditing({title:p.title,text:p.text,category:p.category})}])];
 }});
 if(editing)return <form className="settings-section" onSubmit={e=>{e.preventDefault();void rpc('savePrompt',{prompt:editing}).then(()=>{notice(uiText("Đã lưu lời nhắc."));setEditing(undefined);}).catch(report);}}>
  <label>{uiText("Tên")}<input required maxLength={80} value={editing.title??''} onChange={e=>setEditing({...editing,title:e.target.value})} placeholder={uiText("Ví dụ: Phiếu học tập nhóm")}/></label>
  <label>{uiText("Nhóm")}<select value={editing.category??'cua-toi'} onChange={e=>setEditing({...editing,category:e.target.value})}><option value="cua-toi">{uiText("Của tôi")}</option>{PROMPT_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label>{uiText("Nội dung")}<textarea required className="editor" maxLength={20000} value={editing.text??''} onChange={e=>setEditing({...editing,text:e.target.value})} placeholder={uiText("Viết chỗ cần điền dạng [mô tả], ví dụ: Soạn đề [số câu] câu cho bài [tên bài].")}/></label>
    <StandardizeBox kind="prompt" text={editing.text??''} onApply={r=>setEditing({...editing,text:r.text})} report={report}/>
  <p className="muted small">{uiText("Chỗ trống dạng [mô tả] được chọn sẵn khi chèn; bấm Tab để nhảy tới chỗ trống kế tiếp. Danh sách chỗ trống cũng hiện phía trên khung chat và đổi màu khi đã điền.")}</p>
  <div className="modal-actions"><button type="button" onClick={()=>setEditing(undefined)}>{uiText("Hủy")}</button><button className="primary" type="submit">{uiText("Lưu lời nhắc")}</button></div></form>;
 return <div className="manager">
  <div className="manager-toolbar-strip">
   <div className="manager-selected-label">
    {selectedPrompt?<>{uiText("Đang chọn:")} <strong>{selectedPrompt.title}</strong> ({selectedPrompt.own?uiText("Của tôi"):catName(selectedPrompt.category)})</>:uiText("Chưa chọn lời nhắc")}
   </div>
   <div className="manager-toolbar-actions">
    <button type="button" className="primary btn-compact" onClick={handleAdd}>{uiText("＋ Thêm")}</button>
    <button type="button" className="btn-compact" disabled={!selectedPrompt} onClick={handleEdit}>{uiText("✎ Sửa")}</button>
    <button type="button" className="danger btn-compact" disabled={!selectedPrompt||!selectedPrompt?.own} onClick={handleDelete}>{uiText("🗑 Xóa")}</button>
   </div>
  </div>
  <div className="row"><input autoFocus placeholder={uiText("Tìm lời nhắc…")} value={query} onChange={e=>setQuery(e.target.value)}/><button className="primary" onClick={handleAdd}>{uiText("＋ Lời nhắc mới")}</button></div>
  <div className="manager-list">{all.map(p=><article key={p.id} className={`manager-item ${selectedPrompt?.id===p.id?'selected':''}`} onClick={()=>setSelectedId(p.id)} onDoubleClick={handleEdit} {...menu.handlers(p.id)}><div><strong>{fav.has(p.id)?'★ ':''}{p.title}</strong><small>{p.own?uiText("Của tôi"):catName(p.category)} · {p.desc??p.text.slice(0,90)}</small></div>
   <div className="manager-actions">{menu.trigger(p.id,uiText("Thao tác lời nhắc {0}",[p.title]))}</div></article>)}
   {!all.length&&<p className="muted">{uiText("Không có lời nhắc phù hợp.")}</p>}</div>
  {menu.menu}<p className="muted small">{uiText("Mẫu dựng sẵn không sửa trực tiếp được; dùng “Nhân bản” để có bản của riêng thầy cô.")}</p></div>;
}

/** Quản lý quy tắc đặt tên: gọi bằng #khóa trong ô chat; “luôn áp dụng” thì dùng cho mọi yêu cầu. */
export function RuleManager({state,report,notice,scope={kind:'profile'},onActions}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;scope?:RuleScope;onActions?:(actions:React.ReactNode)=>void}){
 const [editing,setEditing]=useState<{id?:string;title:string;text:string;always:boolean}|undefined>();
 const [selectedId,setSelectedId]=useState<string>('');
 const rules=(scope.kind==='profile'?state.data.ruleBook:(scope.kind==='project'?state.data.projects.find(p=>p.id===scope.id):state.data.chats.find(c=>c.id===scope.id))?.ruleBook)??[];
 const project=scope.kind==='project';
 const selectedRule=rules.find(r=>r.id===selectedId)||rules[0];

 const handleAdd=()=>{
  setEditing({title:'',text:'',always:false});
 };
 const handleEdit=()=>{
  if(selectedRule){
   setEditing({id:selectedRule.id,title:selectedRule.title,text:selectedRule.text,always:selectedRule.always});
  }else{
   notice(uiText("Chưa có quy tắc nào để sửa. Bấm Thêm để tạo mới."));
  }
 };
 const handleDelete=()=>{
  if(selectedRule){
   if(confirm(uiText("Xóa quy tắc “{0}”?",[selectedRule.title]))){
    void rpc('deleteRule',{id:selectedRule.id,scope}).then(()=>{
     notice(uiText("Đã xóa quy tắc."));
     if(selectedId===selectedRule.id)setSelectedId('');
    }).catch(report);
   }
  }else{
   notice(uiText("Chưa có quy tắc nào để xóa."));
  }
 };

 useEffect(()=>{
  onActions?.(<div className="manager-header-toolbar">
   <button type="button" className="primary btn-compact" title={uiText("Thêm quy tắc mới")} onClick={handleAdd}>{uiText("＋ Thêm")}</button>
   <button type="button" className="btn-compact" disabled={!selectedRule} title={uiText("Sửa quy tắc đang chọn")} onClick={handleEdit}>{uiText("✎ Sửa")}</button>
   <button type="button" className="danger btn-compact" disabled={!selectedRule} title={uiText("Xóa quy tắc đang chọn")} onClick={handleDelete}>{uiText("🗑 Xóa")}</button>
  </div>);
 },[selectedRule,scope]);

 const menu=useObjectMenu<string>({contextKey:'rules',onError:report,commands:id=>{
  const r=rules.find(r=>r.id===id);if(!r)return [];
  return [{id:'edit',label:uiText("Sửa"),run:()=>setEditing({id:r.id,title:r.title,text:r.text,always:r.always})},
   {id:'delete',label:uiText("Xóa"),danger:true,run:()=>{if(confirm(uiText("Xóa quy tắc “{0}”?",[r.title])))return rpc('deleteRule',{id,scope});}}];
 }});
 if(editing)return <form className="settings-section" onSubmit={e=>{e.preventDefault();void rpc('saveRule',{rule:editing,scope}).then(()=>{notice(uiText("Đã lưu quy tắc."));setEditing(undefined);}).catch(report);}}>
  <label>{uiText("Tên quy tắc")}<input required maxLength={80} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})} placeholder={uiText("Ví dụ: Giọng văn gần gũi")}/></label>
  <label>{uiText("Nội dung")}<textarea required className="editor" maxLength={20000} value={editing.text} onChange={e=>setEditing({...editing,text:e.target.value})} placeholder={uiText("Điều PVTA cần tuân theo, ví dụ: Xưng “thầy cô”, câu ngắn, không dùng từ Hán Việt khó.")}/></label>
  <StandardizeBox kind="rule" text={editing.text} title={editing.title} onApply={r=>setEditing({...editing,text:r.text,title:r.title||editing.title})} report={report}/>
  <label className="toggle-row"><div><strong>{project?uiText("Toàn cục (cả dự án)"):uiText("Luôn áp dụng")}</strong><small>{project?uiText("Áp dụng cho mọi chat trong dự án, không cần gõ #. Nếu tắt, quy tắc là cục bộ: chỉ chạy khi thầy cô gọi bằng #tên."):uiText("Dùng cho mọi yêu cầu, không cần gõ #. Nếu tắt, quy tắc chỉ dùng khi thầy cô gọi bằng #tên.")}</small></div><input type="checkbox" checked={editing.always} onChange={e=>setEditing({...editing,always:e.target.checked})}/></label>
  <div className="modal-actions"><button type="button" onClick={()=>setEditing(undefined)}>{uiText("Hủy")}</button><button className="primary" type="submit">{uiText("Lưu quy tắc")}</button></div></form>;
 return <div className="manager">
  <div className="manager-toolbar-strip">
   <div className="manager-selected-label">
    {selectedRule?<>{uiText("Đang chọn:")} <strong>#{selectedRule.key}</strong> ({selectedRule.title})</>:uiText("Chưa chọn quy tắc")}
   </div>
   <div className="manager-toolbar-actions">
    <button type="button" className="primary btn-compact" onClick={handleAdd}>{uiText("＋ Thêm")}</button>
    <button type="button" className="btn-compact" disabled={!selectedRule} onClick={handleEdit}>{uiText("✎ Sửa")}</button>
    <button type="button" className="danger btn-compact" disabled={!selectedRule} onClick={handleDelete}>{uiText("🗑 Xóa")}</button>
   </div>
  </div>
  <div className="row"><p className="muted small grow">{uiText("Gõ")}<kbd>#</kbd> {scope.kind==='profile'?uiText("trong ô chat để chọn quy tắc. Quy tắc cá nhân áp dụng cho mọi hội thoại, dự án và sổ nguồn. Quy tắc chung viết sẵn ở Cài đặt vẫn luôn được áp dụng."):scope.kind==='project'?uiText("trong ô chat để chọn quy tắc. Quy tắc dự án chỉ áp dụng trong dự án này."):uiText("trong ô chat để chọn quy tắc. Quy tắc này chỉ áp dụng trong hội thoại này.")}</p><button className="primary" onClick={handleAdd}>{uiText("＋ Quy tắc mới")}</button></div>
  <div className="manager-list">{rules.map(r=><article key={r.id} className={`manager-item ${selectedRule?.id===r.id?'selected':''}`} onClick={()=>setSelectedId(r.id)} onDoubleClick={handleEdit} {...menu.handlers(r.id)}><div><strong>#{r.key}{r.always?(project?' · '+uiText("toàn cục"):' · '+uiText("luôn áp dụng")):(project?' · '+uiText("cục bộ"):'')}</strong><small>{r.title}: {r.text.slice(0,140)}</small></div>
   <div className="manager-actions">{menu.trigger(r.id,uiText("Thao tác quy tắc {0}",[r.title]))}</div></article>)}
   {menu.menu}{!rules.length&&<div className="empty-card"><h3>{uiText("Chưa có quy tắc nào")}</h3><p>{uiText("Ví dụ: “Giọng văn gần gũi”, “Trình bày đề kiểm tra”. Đặt một lần, gọi lại bằng # khi cần.")}</p></div>}</div></div>;
}

/** Cửa sổ thêm quy tắc mới độc lập */
export function AddRuleDialog({scope,onSaved,onCancel,report}:{scope:RuleScope;onSaved:()=>void;onCancel:()=>void;report:(e:unknown)=>void}){
 const [title,setTitle]=useState('');
 const [text,setText]=useState('');
 const [always,setAlways]=useState(false);
 const [busy,setBusy]=useState(false);
 const project=scope.kind==='project';
 return <form className="settings-section" onSubmit={e=>{
  e.preventDefault();
  if(!title.trim()||!text.trim())return;
  setBusy(true);
  void rpc('saveRule',{rule:{title:title.trim(),text:text.trim(),always},scope}).then(()=>{
   onSaved();
  }).catch(report).finally(()=>setBusy(false));
 }}>
  <label>{uiText("Tên quy tắc")}<input autoFocus required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder={uiText("Ví dụ: Giọng văn gần gũi")}/></label>
  <label>{uiText("Nội dung")}<textarea required className="editor" maxLength={20000} value={text} onChange={e=>setText(e.target.value)} placeholder={uiText("Điều PVTA cần tuân theo, ví dụ: Xưng “thầy cô”, câu ngắn, không dùng từ Hán Việt khó.")}/></label>
  <StandardizeBox kind="rule" text={text} title={title} onApply={r=>{setText(r.text);if(r.title)setTitle(r.title);}} report={report}/>
  <label className="toggle-row"><div><strong>{project?uiText("Toàn cục (cả dự án)"):uiText("Luôn áp dụng")}</strong><small>{project?uiText("Áp dụng cho mọi chat trong dự án, không cần gõ #. Nếu tắt, quy tắc là cục bộ: chỉ chạy khi thầy cô gọi bằng #tên."):uiText("Dùng cho mọi yêu cầu, không cần gõ #. Nếu tắt, quy tắc chỉ dùng khi thầy cô gọi bằng #tên.")}</small></div><input type="checkbox" checked={always} onChange={e=>setAlways(e.target.checked)}/></label>
  <div className="modal-actions"><button type="button" disabled={busy} onClick={onCancel}>{uiText("Hủy")}</button><button className="primary" type="submit" disabled={busy||!title.trim()||!text.trim()}>{busy?uiText("Đang lưu…"):uiText("Lưu quy tắc")}</button></div>
 </form>;
}

export type FolderChoice='new'|'project'|'chat';
/** Hộp thoại sau khi chọn thư mục: mặc định tạo dự án mới với tên gợi ý (sửa được). */
export function FolderDialog({path,projectName,inProject,busy,onCancel,onConfirm}:{path:string;projectName?:string;inProject:boolean;busy:boolean;onCancel:()=>void;onConfirm:(choice:FolderChoice,name:string)=>void}){
 const [choice,setChoice]=useState<FolderChoice>('new');const [name,setName]=useState('');
 useEffect(()=>{let alive=true;void rpc<string>('suggestProjectName',{path}).then(n=>{if(alive)setName(n);}).catch(()=>{});return()=>{alive=false;};},[path]);
 return <form className="folder-dialog" onSubmit={e=>{e.preventDefault();onConfirm(choice,name.trim());}}>
  <p className="folder-path"><Icon name="project"/><code title={path}>{path}</code></p>
  <label className={`choice ${choice==='new'?'chosen':''}`}><input type="radio" name="folder-choice" checked={choice==='new'} onChange={()=>setChoice('new')}/><div><strong>{uiText("Tạo dự án mới (khuyên dùng)")}</strong><small>{uiText("PVTA nhớ thư mục này làm nơi lưu tệp mới và đọc các tài liệu bên trong.")}</small>
   {choice==='new'&&<input autoFocus aria-label={uiText("Tên dự án")} required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder={uiText("Tên dự án")}/>}</div></label>
  {inProject?<label className={`choice ${choice==='project'?'chosen':''}`}><input type="radio" name="folder-choice" checked={choice==='project'} onChange={()=>setChoice('project')}/><div><strong>{uiText("Thêm vào dự án “")} {projectName}”</strong><small>{uiText("Gộp tài liệu trong thư mục vào dự án đang mở.")}</small></div></label>
   :<label className={`choice ${choice==='chat'?'chosen':''}`}><input type="radio" name="folder-choice" checked={choice==='chat'} onChange={()=>setChoice('chat')}/><div><strong>{uiText("Chỉ đính kèm vào cuộc trò chuyện này")}</strong><small>{uiText("Không tạo dự án; tài liệu chỉ dùng trong hội thoại hiện tại.")}</small></div></label>}
  <div className="modal-actions"><button type="button" onClick={onCancel} disabled={busy}>{uiText("Hủy")}</button><button className="primary" type="submit" disabled={busy||(choice==='new'&&!name.trim())}>{busy?uiText("Đang đọc tài liệu…"):choice==='new'?uiText("Tạo dự án"):uiText("Thêm thư mục")}</button></div>
 </form>;
}

const EVERY:[number,string][]=[[1,uiText("Hằng ngày")],[3,uiText("3 ngày một lần")],[7,uiText("Hằng tuần")],[30,uiText("Hằng tháng")]];
const STATE_TEXT:Record<string,string>={done:uiText("Hoàn tất"),'partial':uiText("Làm dở, sẽ làm tiếp lần sau"),'no-model':uiText("Chưa có model phù hợp"),'error':uiText("Có lỗi")};
/** Cài đặt biên tập nền: bật/tắt, giờ, tần suất, model. Chỉ chạy khi PVTA đã đóng và máy rảnh. */
export function RefineSettingsPanel({state,patch,report,notice}:{state:ViewState;patch:(p:Record<string,unknown>)=>Promise<void>;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const v=state.refine;const s=v.settings;
 const options=useMemo(()=>{
  const out:{value:string;label:string}[]=[];
  for(const b of state.backends.filter(x=>x.installed)){for(const m of modelsOf(state.catalog,b.id))out.push({value:`${b.id}|${m.id}`,label:`${b.id} · ${m.label??m.id}`});}
  for(const a of state.api.filter(x=>x.configured))for(const m of a.models)out.push({value:`api|${a.id}/${m.id}`,label:`${a.label} · ${m.label??m.id}`});
  return out;
 },[state.backends,state.catalog,state.api]);
 const current=s.model==='auto'?'auto':`${s.model.backend}|${s.model.model}`;
 const save=(next:Partial<typeof s>)=>patch({refine:{...s,...next}}).catch(report);
 const last=v.last;
 const [starting,setStarting]=useState(false);
 const run=(method:string)=>{if(starting)return;setStarting(true);void rpc(method).then(r=>notice(r.message||r.reason||uiText("Đã kết thúc lượt tổng hợp. Xem kết quả bên trên."))).catch(report).finally(()=>setStarting(false));};
 return <div className="settings-section">
  <p className="muted">{uiText("PVTA học được kỹ năng và quy tắc mới qua thời gian. Việc biên tập nền sẽ rà lại, sắp xếp chặt chẽ như JSON, chỉ phần mới hoặc đã thay đổi. Bấm")}<strong>{uiText("Làm ngay")}</strong> {uiText("để chạy riêng khi đang mở ứng dụng, không đổi mốc lịch. Chọn")}<strong>{uiText("Chạy bù")}</strong> {uiText("để xử lí lịch bị lỡ. Lịch tự động chạy")}<strong>{uiText("khi PVTA đã đóng")}</strong> {uiText("và máy đang rảnh (CPU, RAM); nếu bị ngắt giữa chừng thì lần sau làm tiếp từ nhật ký.")}</p>
  <label className="toggle-row"><div><strong>{uiText("Bật biên tập nền")}</strong><small>{uiText("Tắt thì PVTA không tự chạy gì ngoài giờ làm việc.")}</small></div><input type="checkbox" checked={s.enabled} onChange={e=>void save({enabled:e.target.checked})}/></label>
  <div className="row"><label>{uiText("Giờ chạy")}<input type="time" value={s.time} disabled={!s.enabled} onChange={e=>{if(/^\d\d:\d\d$/.test(e.target.value))void save({time:e.target.value});}}/></label>
   <label>{uiText("Tần suất")}<select value={s.everyDays} disabled={!s.enabled} onChange={e=>void save({everyDays:Number(e.target.value) as 1|3|7|30})}>{EVERY.map(([n,l])=><option key={n} value={n}>{l}</option>)}</select></label></div>
  <label>Model<select value={options.some(o=>o.value===current)||current==='auto'?current:'auto'} disabled={v.running} onChange={e=>{const val=e.target.value;if(val==='auto'){void save({model:'auto'});return;}const i=val.indexOf('|');void save({model:{backend:val.slice(0,i) as 'agy',model:val.slice(i+1)}});}}>
   <option value="auto">{uiText("Tự động (khuyên dùng): Sonnet của agy → CommandCode → Claude → model tương đương")}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  <label className="toggle-row"><div><strong>{uiText("Tự chạy bù khi mở PVTA")}</strong><small>{uiText("Mặc định chỉ thông báo; bật để tự xử lí lịch bị lỡ. Không đổi lịch định kì.")}</small></div><input type="checkbox" checked={s.autoCatchUp===true} onChange={e=>void save({autoCatchUp:e.target.checked})}/></label>
  <div className="refine-status" role="status">
   <p><strong>{uiText("Lịch của máy:")}</strong> {v.schedule.registered?uiText("đã đăng ký"):v.schedule.error?uiText("chưa đăng ký ({0})",[v.schedule.error]):uiText("chưa đăng ký")}</p>
   <p><strong>{uiText("Lịch kế tiếp:")}</strong> {v.nextAt?new Date(v.nextAt).toLocaleString('vi-VN'):uiText("Lịch tự động đang tắt")}</p>
   {v.missedAt&&<p>{uiText("Lịch bị lỡ:")} {new Date(v.missedAt).toLocaleString('vi-VN')}. <button disabled={v.running||starting} onClick={()=>run('catchUpRefine')}>{uiText("Chạy bù")}</button></p>}
   {v.progress&&<p>{v.progress.message} · {v.progress.completed}/{v.progress.total} {uiText("mục")}<progress max={Math.max(1,v.progress.total)} value={v.progress.completed}/></p>}
   <p><strong>{uiText("Đang chờ biên tập:")}</strong> {v.pending} {uiText("mục")}</p>
   <p><strong>{uiText("Lần gần nhất:")}</strong> {last?uiText("{0} · {1} · sửa {2}, giữ nguyên {3}{4}{5}",[new Date(last.at).toLocaleString('vi-VN'),STATE_TEXT[last.state]??last.state,last.updated,last.unchanged,last.failed?uiText(", lỗi {0}",[last.failed]):'',last.model?` · ${last.model}`:'']):uiText("chưa chạy lần nào")}</p>
   {last?.message&&<p className="muted small">{last.message}</p>}
  </div>
  <button disabled={v.running||starting} className="primary" onClick={()=>run('runRefineNow')}>{v.running?uiText("Đang tổng hợp…"):uiText("Làm ngay")}</button>{v.running&&<button onClick={()=>void rpc('stopRefineNow').catch(report)}>{uiText("Dừng và giữ tiến độ")}</button>}
  <button onClick={()=>void rpc('syncRefine').then(()=>notice(uiText("Đã kiểm tra lại lịch chạy nền."))).catch(report)}>{uiText("Kiểm tra lại lịch")}</button>
 </div>;
}
