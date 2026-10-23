import {t as uiText} from './i18n';
import React,{useState} from 'react';
import {rpc,pickFiles} from './ipc';

/** Không gian làm việc nhiều thư mục của một dự án (như workspace trong VS Code): thêm, gỡ, chọn thư mục lưu chính. */
export function ProjectWorkspace({projectId,folders,outputDir,report,notice}:{projectId?:string;folders?:string[];outputDir?:string;report:(e:unknown)=>void;notice?:(s:string)=>void}){
 const [busy,setBusy]=useState(false);
 if(!projectId)return <p className="muted">{uiText("Lưu dự án trước rồi mới thêm thư mục làm việc.")}</p>;
 const run=async(f:()=>Promise<unknown>)=>{setBusy(true);try{await f();}catch(e){report(e);}finally{setBusy(false);}};
 const add=()=>run(async()=>{const dirs=await pickFiles(true);if(!dirs.length)return;const r=await rpc<{added:string[];skipped:string[]}>('projectAddFolders',{projectId,folders:dirs});if(r.skipped.length)notice?.(r.skipped.join('\n'));});
 return <fieldset className="project-workspace" disabled={busy}><legend>{uiText("Không gian làm việc · nhiều thư mục")}</legend>
  {folders?.length?<ul>{folders.map(f=><li key={f}><code title={f}>{f}</code>{f===outputDir&&<strong> {uiText("· lưu chính")}</strong>}
   <button type="button" onClick={()=>{if(confirm(uiText("Gỡ thư mục này khỏi dự án? Tệp trên máy được giữ nguyên.")))void run(()=>rpc('projectRemoveFolder',{projectId,folder:f}));}}>{uiText("Gỡ")}</button></li>)}</ul>:<small>{uiText("Chưa có thư mục nào.")}</small>}
  <button type="button" onClick={()=>void add()}>{uiText("＋ Thêm thư mục")}</button>
  <small>{uiText("AI nhìn thấy tất cả thư mục trong dự án; tệp mới được lưu ở thư mục lưu chính (đổi trong ô «Thư mục làm việc đã ghi nhớ»).")}</small></fieldset>;
}
