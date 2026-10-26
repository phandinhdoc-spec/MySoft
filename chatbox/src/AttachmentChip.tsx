import {t as uiText} from './i18n';
import React from 'react';
import {QuickFile,requestFileEdit} from './QuickFile';
import {rpc,type ViewState} from './ipc';
import {useObjectMenu,type ObjectCommand} from './ObjectMenu';
import {Icon} from './Icon';

type Attachment=ViewState['data']['attachments'][number];
export function AttachmentChip({file,chatId,onDraft,onProject,onPdf,report}:{file:Attachment;chatId:string;onDraft:()=>void;onProject?:()=>void;onPdf:()=>void;report:(e:unknown)=>void}){
 const menu=useObjectMenu({contextKey:`${chatId}:${file.id}`,onError:report,commands:()=>{
  const commands:ObjectCommand[]=[{id:'open',label:uiText("Xem / mở"),run:()=>{if(/\.pdf$/i.test(file.name))onPdf();else document.getElementById(`attachment-open-${file.id}`)?.click();}}];
  if(/\.(docx?|xlsx?|pptx?|pdf)$/i.test(file.name))commands.push({id:'openChitup',label:uiText("Mở bằng CHITUP OFFICE"),group:'open',run:()=>rpc('openFileRef',{ref:file.path,chatId,app:'chitup'})});
  commands.push({id:'openVscode',label:uiText("Mở bằng Visual Studio Code"),group:'open',run:()=>rpc('openFileRef',{ref:file.path,chatId,app:'vscode'})});
  if(/\.(md|txt|pdf)$/i.test(file.name))commands.push({id:'draft',label:uiText("Sửa Markdown"),run:onDraft});
  if(/\.(docx|xlsx|pptx|pdf|md|txt|csv)$/i.test(file.name))commands.push({id:'edit',label:uiText("Chỉnh sửa"),run:()=>requestFileEdit(file.path)});
  if(onProject)commands.push({id:'project',label:uiText("Thêm vào dự án"),run:onProject});
  commands.push({id:'remove',label:uiText("Gỡ khỏi hội thoại"),danger:true,group:'remove',run:async()=>{if(confirm(uiText("Gỡ {0} khỏi chỉ mục? Tệp gốc được giữ nguyên.",[file.name])))await rpc('removeAttachment',{id:file.id});}});
  return commands;
 }});
 return <span className="attachment-chip" title={file.path} onDoubleClick={()=>{void rpc('openFileRef',{ref:file.path,chatId}).catch(report);}} {...menu.handlers(file.id)} draggable onDragStart={e=>{e.dataTransfer.setData('application/x-pvta-attachment',file.id);e.dataTransfer.effectAllowed='copy';}}>
  <QuickFile path={file.path}><button id={`attachment-open-${file.id}`} data-file-open type="button" onClick={e=>{if(/\.pdf$/i.test(file.name)){e.preventDefault();onPdf();}}}><Icon name="file"/>{file.name}</button></QuickFile><small>{uiText("Đã đính kèm")}</small>{menu.trigger(file.id,uiText("Thao tác tệp: {0}",[file.name]))}{menu.menu}
 </span>;
}
