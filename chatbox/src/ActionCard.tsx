import {t as uiText} from './i18n';
import {useObjectMenu,type ObjectCommand} from './ObjectMenu';
import {QuickFile,requestFileEdit} from './QuickFile';
import {useDocumentPreview} from './DocumentPreview';
import React,{useRef,useState} from 'react';
import {rpc,savePath,type Action} from './ipc';
import {OfficePreview} from './OfficePanel';
export function ActionCard({action:a,report,notice}:{action:Action;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const documentPreview=useDocumentPreview();
 const [running,setRunning]=useState('');const [preview,setPreview]=useState(false);
 const inFlight=useRef(false);
 const activePath=a.savedPath??a.output??a.path;
 const name=activePath.split(/[\\/]/).pop();
 async function act(method:string,params:Record<string,unknown>={}){
  if(inFlight.current)return;inFlight.current=true;setRunning(method);
  try{
   const result=await rpc<any>(method,{id:a.id,...params});
   if(result?.uploadError){notice(result.uploadError);return;}
   if(method==='undoOutput')notice(uiText("Đã cất bản kết quả gốc vào kho hoàn tác.")+(a.savedPath?uiText(" Bản sao tại {0} vẫn được giữ nguyên.",[a.savedPath]):''));
   else if(method==='saveOutput')notice(uiText("Đã lưu bản sao tại: {0}",[result?.path??params.path??'']));
   else if(method==='openOutput')notice(uiText("Đã mở tệp: {0}",[result?.path??activePath]));
   else if(method==='revealOutput')notice(uiText("Đã mở thư mục chứa tệp: {0}",[result?.path??activePath]));
   else notice(uiText("Đã thực hiện."));
  }catch(e){report(e);}finally{inFlight.current=false;setRunning('');}
 }
 /** «Lưu như…»: chọn tên và nơi lưu mới, không đổi nơi lưu của hội thoại/dự án. */
 async function saveAs(){const path=await savePath(name??'PVTA.docx').catch(report);if(path)await act('saveOutput',{path});}
 /** Nút «Lưu» (vào nơi đã chọn) và «Lưu như…» hiện ngay trên thẻ khi đã có tệp kết quả. */
 const saveButtons=a.state==='done'&&a.output?<><button disabled={!!running} onClick={()=>void act('saveOutput')}>{uiText("Lưu")}</button><button disabled={!!running} onClick={()=>void saveAs()}>{uiText("Lưu như…")}</button></>:null;
 const menu=useObjectMenu({contextKey:a.id,onError:report,commands:()=>{
  const disabledReason=running?uiText("Đang xử lý…"):undefined;
  const commands:ObjectCommand[]=[];
  if((a.state==='done'&&a.output)||a.savedPath){
   commands.push(
    {id:'open',label:uiText("Mở"),group:'open',disabledReason,run:()=>act('openOutput')},
    {id:'revealFolder',label:uiText("Mở thư mục"),group:'open',disabledReason,run:()=>act('revealOutput')},
   );
  }
  const editPath=a.draftSession?(a.draftSavedPath??a.path):a.state==='done'&&a.output?activePath:undefined;
  if(editPath&&/\.(docx|xlsx|pptx|pdf|md|txt|csv)$/i.test(editPath))commands.push({id:'edit',label:uiText("Chỉnh sửa"),disabledReason,run:()=>requestFileEdit(editPath)});
  if(a.document||a.content)commands.push({id:'side',label:uiText("Xem cạnh chat"),run:()=>documentPreview.show(a)});
  commands.push({id:'preview',label:preview?uiText("Ẩn nội dung"):uiText("Xem trước nội dung"),run:()=>setPreview(v=>!v)});
  if((a.state==='done'&&a.output)||a.savedPath){
   if(/\.(docx?|docm|dotx|xlsx?|xlsm|xltx|pptx?|pptm|potx)$/i.test(activePath))commands.push({id:'openOffice',label:uiText("Mở bằng Microsoft Office"),group:'app',disabledReason,run:()=>act('openOutput',{app:'office'})});
   commands.push({id:'openVscode',label:uiText("Mở bằng Visual Studio Code"),group:'app',disabledReason,run:()=>act('openOutput',{app:'vscode'})},
    {id:'reveal',label:uiText("Hiện trong Finder / trình quản lý tệp"),disabledReason,run:()=>act('revealOutput')},
    {id:'save',label:uiText("Lưu"),disabledReason,run:()=>act('saveOutput')},
    {id:'saveAs',label:uiText("Lưu như…"),disabledReason,run:()=>saveAs()});
   if(a.state==='done'&&a.outputHash)commands.push({id:'undo',label:uiText("Hoàn tác"),danger:true,group:'undo',disabledReason,run:()=>{if(confirm(uiText("Cất bản kết quả trên máy vào kho hoàn tác? Tệp đã tải lên web, bản sao và tệp nguồn được giữ nguyên.")))return act('undoOutput');}});
  }
  return commands;
 }});
 return <section className={`action-card action-${a.state}`} aria-busy={!!running} {...menu.handlers(a.id)}><div className="artifact-heading" onDoubleClick={()=>{if(!running&&((a.state==='done'&&a.output)||a.savedPath))void act('openOutput');}}><span className="artifact-icon">{a.kind==='create_typst'?'T':a.kind==='office_live'?'↗':/xlsx$/i.test(name??'')?'X':/pptx$/i.test(name??'')?'P':'W'}</span><div>{a.state==='done'&&a.output?<QuickFile path={activePath}><strong role="button" tabIndex={0} style={{cursor:'pointer'}} title={uiText("Bấm để mở ngay: {0}",[activePath])} onClick={e=>{e.stopPropagation();if(!running)void act('openOutput');}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!running){e.preventDefault();e.stopPropagation();void act('openOutput');}}}>{name}</strong></QuickFile>:<strong>{name}</strong>}<small>{a.kind==='create_typst'?uiText("Gói ZIP: PDF + mã nguồn .typ chỉnh sửa được"):a.kind==='office_live'?uiText("Tài liệu Office đang mở"):a.kind==='edit_excel'||a.kind==='patch_office'?uiText("Chỉnh sửa trên bản sao"):uiText("Tệp kết quả")}</small></div><span className="badge">{running?uiText("Đang xử lý…"):a.state==='pending'?uiText("Chờ duyệt"):a.state==='done'?(a.draftSession?(a.draftSavedPath?uiText("Đã lưu phiên chỉnh sửa"):uiText("Bản nháp · Chưa lưu")):a.uploadError?uiText("Chưa tải lên"):a.cloudUrl?uiText("Đã lưu trên web"):a.savedPath?uiText("Đã lưu bản sao"):uiText("Đã tạo trên máy")):a.state==='undone'?uiText("Đã hoàn tác"):uiText("Đã bỏ qua")}</span></div><p>{a.reason}</p>{a.draftSession&&<p>{a.draftSavedPath?'Đã lưu: '+a.draftSavedPath:uiText("Đã cập nhật bản nháp; xem trạng thái hiện tại trong trình sửa.")}</p>}{a.state==='pending'&&(a.destination||a.outputDir)&&<p className="artifact-destination">{uiText("Nơi lưu:")} {a.destination?.url??a.projectUrl??a.outputDir}</p>}
 {(a.state==='done'||a.savedPath)&&(a.output||a.savedPath)&&<div className="artifact-locations" style={{fontSize:12,margin:'6px 0 8px',padding:'8px 10px',borderRadius:8,background:'var(--sidebar)',border:'1px solid var(--line)',display:'flex',flexDirection:'column',gap:4}}>
  {a.output&&a.state==='done'&&<div style={{overflowWrap:'anywhere'}}>📁 <strong>{uiText("Nơi lưu trên máy:")}</strong> <code role="button" tabIndex={0} className="pvta-file-ref" title={uiText("Bấm để mở ngay: {0}",[a.output])} onClick={()=>{if(!running)void act('openOutput',{preferSaved:false});}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!running){e.preventDefault();void act('openOutput',{preferSaved:false});}}}>{a.output}</code></div>}
  {a.tempOutput&&a.state==='done'&&<div role="alert" style={{overflowWrap:'anywhere',color:'#9a3412',fontWeight:600}}>⚠ {uiText("Đang ở thư mục tạm dùng chung: mọi người trên máy đều đọc và ghi được, hệ điều hành có thể tự xóa. Chưa có nơi lưu hợp lệ: bấm «Lưu như…» để chọn nơi lưu.")}</div>}
  {a.savedPath&&<div style={{overflowWrap:'anywhere',color:'var(--accent)'}}>💾 <strong>{uiText("Bản sao đã lưu:")}</strong> <code role="button" tabIndex={0} className="pvta-file-ref" title={uiText("Bấm để mở ngay: {0}",[a.savedPath])} onClick={()=>{if(!running)void act('openOutput',{preferSaved:true});}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!running){e.preventDefault();void act('openOutput',{preferSaved:true});}}}>{a.savedPath}</code></div>}
 </div>}
 {a.cloudUrl&&<button className="primary" onClick={()=>void rpc('openLink',{url:a.cloudUrl}).catch(report)}>{uiText("Mở tệp trong thư mục dự án ↗")}</button>}{a.uploadError&&<div role="status" className="upload-notice"><p>{a.uploadError}</p><button disabled={!!running} onClick={()=>void act('retryUpload')}>{uiText("Thử tải lên lại")}</button><small>{uiText("Bản trên máy được giữ lại, không cần tạo lại tệp.")}</small></div>}
 {preview&&<div className="artifact-preview">{a.document&&<OfficePreview document={a.document}/>} {a.content&&<pre>{a.content}</pre>}{a.replacements?.map((r,i)=><div className="replacement" key={i}><del>{r.old}</del><ins>{r.new}</ins></div>)}{a.style&&<p>{uiText("Định dạng:")} {a.style.font??uiText("Giữ phông")} · {a.style.size??uiText("Giữ cỡ")} pt</p>}{a.kind==='office_live'&&<><p>{uiText("Kiểm tra nội dung tại bảng PVTA trong Office trước khi áp dụng. Dùng Hoàn tác của Office ngay sau thao tác nếu cần khôi phục.")}</p><pre>{JSON.stringify(a.args,null,2)}</pre></>}<small className="file-path">{activePath}</small></div>}
 <div className="card-actions">{a.state==='pending'?<><button disabled={!!running} onClick={()=>void act('declineAction')}>{uiText("Bỏ qua")}</button><button className="primary" disabled={!!running} onClick={()=>void act('approveAction')}>{running?uiText("Đang thực hiện…"):a.kind==='office_live'?uiText("Duyệt trong Office"):a.kind==='open_file'?uiText("Mở tài liệu"):uiText("Áp dụng · Tạo tệp")}</button></>:(a.state==='done'&&a.output)||a.savedPath?<><button className="primary" disabled={!!running} onClick={()=>void act('openOutput')}>{uiText("Mở tệp ↗")}</button>{saveButtons}</>:null}{menu.trigger(a.id,uiText("Thao tác tệp kết quả: {0}",[name]))}</div>{menu.menu}</section>;
}
