export interface HelpContext{x:number;y:number;label:string;topic?:string}
export const HELP_ASK_EVENT='pvta:ask-help';
export const helpMenuEvents=new WeakSet<Event>();
let users=0;
export function registerHelp(){users++;return ()=>{users--;};}
export const helpAvailable=()=>users>0;

/** Chỉ thu nhãn giao diện, không lấy giá trị ô nhập hoặc nội dung chat. */
export function helpContext(target:Element,x:number,y:number):HelpContext{
 const explicit=target.closest<HTMLElement>('[data-help-topic]')?.dataset.helpTopic;
 const control=target.closest('button,input,textarea,select,[role=tab],[role=menuitem]');
 const sensitive=!!target.closest('.messages,.message,.markdown,.office-editor,[contenteditable=true]');
 const label=(sensitive?'':control?.getAttribute('aria-label')||control?.getAttribute('title')||(control?.tagName==='BUTTON'?control.textContent:''))?.trim().slice(0,100)||'Vùng làm việc';
 const zones:[string,string][]=[['.help-dialog','hoi-pvta'],['.wf-manager,.wf-visual-editor','quy-trinh'],['.md-toolbar,.step-md-toolbar','soan-markdown'],['.composer,.composer-area','gui-tin'],['.topbar','gioi-thieu'],['.sidebar','gioi-thieu'],['.office-editor','xem-nhanh']];
 const labels:[RegExp,string][]=[[/quy trình|workflow/i,'quy-trinh'],[/kỹ năng|skill/i,'ky-nang'],[/quy tắc/i,'quy-tac-hoc'],[/lời nhắc|prompt/i,'goi-nhanh'],[/api/i,'khoa-api'],[/model|chọn ai|suy nghĩ/i,'chon-model'],[/dự án/i,'du-an'],[/tệp|đính kèm|gửi/i,'gui-tin'],[/git/i,'github'],[/cài đặt/i,'chon-ai'],[/hướng dẫn/i,'hoi-pvta'],[/markdown|in đậm|in nghiêng/i,'soan-markdown']];
 const topic=explicit||labels.find(([pattern])=>pattern.test(label))?.[1]||zones.find(([selector])=>target.closest(selector))?.[1];
 return {x,y,label,topic};
}
export function askHelp(context:HelpContext){window.dispatchEvent(new CustomEvent(HELP_ASK_EVENT,{detail:context}));}
