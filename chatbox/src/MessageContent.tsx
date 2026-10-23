import {t as uiText} from './i18n';
import React from 'react';
import {rpc,type Message} from './ipc';
import {useObjectMenu} from './ObjectMenu';
import {TextPromptDialog} from './TextPromptDialog';
import {messageDraft,type MessageDraft} from './message-to-project';

export function MessageContent({message,chatId,notice,report,children,onProjectSave,projectName}:{message:Message;chatId:string;notice:(s:string)=>void;report:(e:unknown)=>void;children:React.ReactNode;onProjectSave?:(draft:MessageDraft)=>void;projectName?:string}){
 const [asking,setAsking]=React.useState(false);
 // Menu chuột phải có cho cả thầy cô và AI; câu trả lời lỗi thì không có.
 const available=!message.error;
 const aiAnswer=message.role==='assistant'&&available;
 const canSave=!!onProjectSave;
 const copy=async()=>{await navigator.clipboard.writeText(message.text);notice(uiText("Đã sao chép."));};
 const feedback=async()=>{
  setAsking(true);
 };
 const sendFeedback=async(text:string)=>{
  try{const result=await rpc('feedback',{chatId,text,about:message.text.slice(0,1200)});
  notice(result.queued?uiText("Đã nhận góp ý. AI nhẹ sẽ xử lý ngầm khi chat rảnh; xem kết quả ở Những điều đã học."):uiText("Tự học đang tắt. Bật tại Cài đặt → Chung."));}catch(e){report(e);}
 };
 const draft=()=>messageDraft(message.text,message.at);
 const saveToProject=()=>{if(onProjectSave)onProjectSave(draft());};
 const menu=useObjectMenu({contextKey:`${chatId}:${message.id}`,preserveSelection:true,onError:report,commands:()=>available?[
  {id:'copy',label:uiText("Sao chép"),run:copy},
  ...(aiAnswer?[{id:'feedback',label:uiText("Góp ý"),run:feedback}]:[]),
  ...(canSave?[{id:'project',label:uiText("Thêm vào dự án"),disabledReason:projectName?undefined:uiText("Chọn dự án trước"),run:saveToProject}]:[]),
 ]:[]});
 return <div className="message-content" {...(available?menu.handlers(message.id):{})}>{children}
  {available&&<div className="message-tools">{aiAnswer&&<button className="message-copy" title={uiText("Sao chép câu trả lời")} onClick={()=>void copy().catch(report)}>{uiText("▢ Sao chép")}</button>}{menu.trigger(message.id,uiText("Thao tác tin nhắn"))}</div>}{menu.menu}
  {asking&&<TextPromptDialog title={uiText("Góp ý")} label={uiText("Thầy cô muốn PVTA ghi nhớ điều gì về cách trình bày?")} onSubmit={sendFeedback} onClose={()=>setAsking(false)}/>}
 </div>;
}
