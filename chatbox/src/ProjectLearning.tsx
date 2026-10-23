import {t as uiText} from './i18n';
import React,{useState} from 'react';
import {pickFiles,rpc,type ViewState} from './ipc';
import './projectTools.css';
import {useObjectMenu} from './ObjectMenu';
type Project=ViewState['data']['projects'][number];
type File=ViewState['data']['attachments'][number];

export function ProjectLearning({project,files,report}:{project:Project;files:File[];report:(e:unknown)=>void}){
 const [notes,setNotes]=useState(project.learning?.notes??'');
 const [enabled,setEnabled]=useState(project.learning?.enabled??true);
 const [busy,setBusy]=useState(false);const [status,setStatus]=useState('');
 const sources=files.filter(f=>f.scope==='project'&&f.scopeId===project.id&&f.purpose==='learning');
 const dirty=notes!==(project.learning?.notes??'')||enabled!==(project.learning?.enabled??true);
 async function run(task:()=>Promise<void>){setBusy(true);setStatus('');try{await task();}catch(e){report(e);}finally{setBusy(false);}}
 async function attach(){const paths=await pickFiles(true);if(!paths.length)return;const result=await rpc<{count:number;errors:string[]}>('projectLearningAttach',{projectId:project.id,paths});setStatus(result.errors.length?uiText("Đã xử lí thư mục; một số tệp chưa đọc được: {0}",[result.errors.join('; ')]):uiText("Đã lập chỉ mục {0} tệp. Tài liệu cũ chỉ dùng tham khảo cách làm.",[result.count]));}
 async function draft(){
  if(notes.trim()&&!window.confirm(uiText("Thay nội dung ghi chú đang soạn bằng bản nháp rút từ tài liệu? Ghi chú đã lưu vẫn giữ đến khi bấm Lưu kinh nghiệm.")))return;
  const result=await rpc<{notes:string;sourceCount:number;partial:boolean}>('projectLearningDraft',{projectId:project.id});setNotes(result.notes);
  setStatus(uiText("Bản nháp từ {0} tài liệu{1}. Hãy xem, sửa và bấm Lưu kinh nghiệm để sử dụng.",[result.sourceCount,result.partial?' (chỉ đọc một phần do giới hạn độ dài)':'']));
 }
 const menu=useObjectMenu<string>({contextKey:project.id,onError:report,commands:folder=>{
  if(!project.learning?.folders.includes(folder))return [];
  const disabledReason=busy?uiText("Đang xử lí"):undefined;
  return [{id:'read',label:uiText("Đọc lại"),disabledReason,run:()=>run(async()=>{const result=await rpc<{count:number;errors:string[]}>('projectLearningAttach',{projectId:project.id,paths:[folder]});setStatus(result.errors.length?result.errors.join('; '):uiText("Đã đọc lại thư mục Học hỏi."));})},
   {id:'unlink',label:uiText("Bỏ liên kết"),disabledReason,run:()=>run(async()=>{await rpc('removeProjectLearningFolder',{projectId:project.id,folder});setStatus(uiText("Đã bỏ liên kết và chỉ mục thư mục; tệp gốc và ghi chú kinh nghiệm được giữ nguyên."));})}];
 }});
 return <div className="project-learning">
  <p><strong>{project.name}</strong> {uiText("có hai nhóm nguồn: tài liệu hiện tại cung cấp dữ kiện mới; Học hỏi lưu nguồn tham khảo về cách viết, quy trình và lưu ý.")}</p>
  <div className="project-learning-example"><strong>{uiText("Ví dụ: báo cáo STEM")}</strong><p>{uiText("Thư mục dự án năm nay: văn bản mới, thông số và số liệu mới.")}</p><p>{uiText("Thư mục Học hỏi: báo cáo năm trước, mẫu cách viết, quy trình và kinh nghiệm. Số liệu cũ chỉ thuộc báo cáo cũ.")}</p></div>
  <fieldset disabled={busy}>
   <legend>{uiText("Nguồn Học hỏi")}</legend>
   <button type="button" onClick={()=>void run(attach)}>{uiText("＋ Chọn thư mục Học hỏi")}</button>
   <small>{uiText("Chọn thư mục có sẵn trên máy hoặc thư mục đám mây đã đồng bộ. PVTA đọc và lưu chỉ mục cục bộ; tệp gốc được giữ nguyên. Mỗi lượt tối đa 60 tệp, sâu 8 cấp; thư mục rỗng vẫn được ghi nhớ.")}</small>
   {(project.learning?.folders??[]).map(folder=><div className="project-learning-folder" key={folder} {...menu.handlers(folder)}><span>{folder}</span>{menu.trigger(folder,uiText("Thao tác thư mục {0}",[folder]))}</div>)}
   {menu.menu}
   {!project.learning?.folders.length&&<p className="muted">{uiText("Chưa chọn thư mục Học hỏi.")}</p>}
   {sources.length>0&&<details><summary>{sources.length} {uiText("tài liệu tham khảo đã lập chỉ mục")}</summary>{sources.map(file=><details className="project-learning-source" key={file.id}><summary>{file.name}</summary><small>{file.path}</small>{file.image?<p>{uiText("Ảnh: chưa trích xuất văn bản để rút kinh nghiệm.")}</p>:<pre>{file.segments.slice(0,6).map(s=>`[${s.ref}] ${s.text}`).join('\n').slice(0,6000)||uiText("Chưa có chữ trích xuất.")}</pre>}</details>)}</details>}
  </fieldset>
  <fieldset disabled={busy}>
   <legend>{uiText("Kinh nghiệm dùng lại")}</legend>
   <button type="button" disabled={!sources.some(f=>!f.image&&f.segments.some(s=>s.text.trim()))} onClick={()=>void run(draft)}>{uiText("Rút kinh nghiệm từ tài liệu")}</button>
   <small>{uiText("AI tạo bản nháp về cách viết, quy trình và lưu ý, kèm nguồn. Thầy cô kiểm tra trước khi lưu; ghi chú đã duyệt được lưu thành tệp Markdown riêng trong thư mục Học hỏi và ghi nhớ cho dự án.")}</small>
   <label>{uiText("Ghi chú kinh nghiệm")}<textarea className="editor" value={notes} maxLength={12000} onChange={e=>setNotes(e.target.value)} placeholder={uiText("Cách viết và bố cục…\nQuy trình thực hiện…\nLưu ý và kiểm tra…")}/></label>
   <label className="project-learning-toggle"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{uiText("Dùng Học hỏi trong các hội thoại của dự án")}</label>
   {project.learning?.noteFile&&<small>{uiText("Tệp kinh nghiệm:")} {project.learning.noteFile.path}</small>}
   <small>{uiText("Tắt để ngừng gửi nguồn và kinh nghiệm Học hỏi trong các lượt AI tiếp theo. Nội dung đã trao đổi trong hội thoại vẫn còn.")}</small>
   <button className="primary" type="button" disabled={!dirty||(!project.learning?.folders.length&&notes.trim()!==(project.learning?.notes??''))} onClick={()=>void run(async()=>{const result=await rpc<{notesPath?:string}>('saveProjectLearning',{projectId:project.id,notes,enabled});setNotes(notes.trim());setStatus(result.notesPath?uiText("Đã lưu kinh nghiệm cho dự án và tệp Markdown trong Học hỏi."):uiText("Đã lưu trạng thái sử dụng Học hỏi."));})}>{uiText("Lưu kinh nghiệm")}</button>
   {!project.learning?.folders.length&&<small>{uiText("Chọn thư mục Học hỏi để lưu ghi chú kinh nghiệm.")}</small>}
   {dirty&&<small>{uiText("Có thay đổi chưa lưu. Chỉ bản đã lưu được dùng trong hội thoại.")}</small>}
  </fieldset>
  {busy&&<p role="status">{uiText("Đang xử lí… Rút kinh nghiệm có thể cần đến 90 giây.")}</p>}
  {status&&<p role="status">{status}</p>}
 </div>;
}
