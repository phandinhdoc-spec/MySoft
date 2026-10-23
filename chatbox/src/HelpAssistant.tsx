import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useObjectMenu} from './ObjectMenu';
import {HELP_ASK_EVENT,registerHelp,helpMenuEvents,type HelpContext} from './help-context';
import {t} from './i18n';
import './help-assistant.css';
import {helpEditCommands} from './help-edit-menu';

type Answer={question:string;hits:{id:string;title:string;text:string}[]};
function HelpChat({context,onClose,onRead}:{context:HelpContext;onClose:()=>void;onRead:(id:string)=>void}){
 const [question,setQuestion]=useState(''),[answers,setAnswers]=useState<Answer[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLElement>(null),end=useRef<HTMLDivElement>(null),alive=useRef(true),locked=useRef(false);
 useEffect(()=>{alive.current=true;const before=document.activeElement as HTMLElement|null;root.current?.querySelector('input')?.focus();return ()=>{alive.current=false;before?.focus?.();};},[]);
 useEffect(()=>{end.current?.scrollIntoView?.({block:'nearest'});},[answers,busy]);
 const ask=async(value:string)=>{
  if(!value.trim()||locked.current)return;locked.current=true;setBusy(true);setError('');
  try{
   const {helpBrain}=await import('./help-brain');
   const hits=helpBrain().ask(value.slice(0,500),context).map(h=>({id:h.e.s.id,title:h.e.s.title,text:h.e.text}));
   if(alive.current){setAnswers(a=>[...a,{question:value,hits}]);setQuestion('');}
  }catch{if(alive.current)setError(t('Không tải được hướng dẫn. Hãy thử lại.'));}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 return <section ref={root} className="help-chat" role="dialog" aria-label={t('Hỏi PVTA')} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
  if(e.key==='Tab'){
   const nodes=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input');if(!nodes?.length)return;
   const first=nodes[0]!,last=nodes[nodes.length-1]!;
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
 }}>
  <header><div><strong>{t('Hỏi PVTA')}</strong><small>{t('Tra cứu hướng dẫn trên máy')}</small></div><button type="button" aria-label={t('Đóng hỏi PVTA')} onClick={onClose}>×</button></header>
  <p className="help-chat-context">{t('Vị trí vừa chọn')}: <strong>{context.label}</strong> <small>({context.x}, {context.y})</small></p>
  <div className="help-chat-log" role="log" aria-live="polite">
   <p>{t('Hỏi về tính năng vừa chọn hoặc một chức năng khác. Câu trả lời là trích đoạn từ sách hướng dẫn, không cần kết nối AI.')}</p>
   {!answers.length&&<button type="button" onClick={()=>void ask(t('Chỗ này dùng như thế nào?'))}>{t('Chỗ này dùng như thế nào?')}</button>}
   {answers.map((answer,i)=><React.Fragment key={i}><p className="help-chat-question">{answer.question}</p><div className="help-chat-answer">
    {answer.hits.length?answer.hits.map(hit=><div key={hit.id}><button type="button" className="help-chat-source" onClick={()=>onRead(hit.id)}>{hit.title} ↗</button><p>{hit.text}</p></div>):<p>{t('Chưa tìm thấy căn cứ trong hướng dẫn. Hãy nêu tên chức năng cụ thể hoặc mở mục lục; PVTA không suy đoán tính năng.')}</p>}
   </div></React.Fragment>)}
   {busy&&<p role="status">{t('Đang tra cứu…')}</p>}{error&&<p role="alert">{error}</p>}<div ref={end}/>
  </div>
  <form onSubmit={e=>{e.preventDefault();void ask(question);}}><input aria-label={t('Câu hỏi về PVTA')} maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder={t('Hỏi cách dùng một tính năng…')}/><button type="submit" disabled={busy||!question.trim()}>{t('Hỏi')}</button></form>
  <footer><button type="button" onClick={()=>onRead(context.topic??'gioi-thieu')}>{t('Mở sách hướng dẫn')}</button></footer>
 </section>;
}

/** Bắt ngữ cảnh trước các menu con; các menu đối tượng vẫn giữ nguyên lệnh riêng. */
export function HelpAssistant({onRead}:{onRead:(id:string)=>void}){
 const [context,setContext]=useState<HelpContext|null>(null);
 const [menuError,setMenuError]=useState('');
 const menu=useObjectMenu<Element>({contextKey:'global-help',commands:helpEditCommands,onError:()=>setMenuError(t('Không thực hiện được thao tác soạn thảo. Kiểm tra quyền clipboard hoặc dùng phím tắt.'))});
 const open=useRef(menu.open);open.current=menu.open;
 useEffect(()=>{
  const unregister=registerHelp();let mounted=true;
  const receive=(event:Event)=>{setContext((event as CustomEvent<HelpContext>).detail);};
  const capture=(e:MouseEvent)=>{
   const target=e.target instanceof Element?e.target:null;if(!target||target.closest('.object-menu,.help-chat'))return;
   // Đợi React xử lý menu đối tượng. Chỉ mở menu chung khi chưa có menu nào nhận sự kiện.
   e.preventDefault();
   queueMicrotask(()=>{if(mounted&&!helpMenuEvents.has(e))open.current(target,target,e.clientX,e.clientY,target);});
  };
  document.addEventListener('contextmenu',capture,true);
  window.addEventListener(HELP_ASK_EVENT,receive);
  return ()=>{mounted=false;unregister();document.removeEventListener('contextmenu',capture,true);window.removeEventListener(HELP_ASK_EVENT,receive);};
 },[]);
 return <>{menu.menu}{menuError&&<div role="alert" className="toast" onClick={()=>setMenuError('')}>{menuError}</div>}{context&&createPortal(<HelpChat key={`${context.x}:${context.y}:${context.label}`} context={context} onClose={()=>setContext(null)} onRead={id=>{setContext(null);onRead(id);}}/>,document.querySelector('dialog[open]')??document.body)}</>;
}
