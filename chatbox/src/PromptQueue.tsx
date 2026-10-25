import type {Chat} from './ipc';
import {t} from './i18n';
import './prompt-queue.css';

export function PromptQueue({chat,busy,onChange}:{chat?:Chat;busy:boolean;onChange:(id:string,action:'up'|'down'|'remove'|'resume')=>void}){
 const items=chat?.pendingPrompts??[];
 if(!items.length)return null;
 return <section className="prompt-queue" aria-label={t('Hàng đợi prompt')}>
  <header><strong>{t('Hàng đợi prompt')} ({items.length})</strong>
   <span>{chat?.promptQueuePaused?t('Đã tạm dừng'):busy?t('Tự gửi sau câu trả lời hiện tại'):t('Chờ tiếp tục gửi')}</span>
   {!busy&&<button onClick={()=>onChange('','resume')}>{t('Tiếp tục gửi')}</button>}
  </header>
  <ol>{items.map((item,index)=><li key={item.id}>
   <div><small>{item.mode==='steer'?t('Chen ngang · chờ AI nhận bổ sung'):t('Xếp hàng')}</small><p>{item.text}</p></div>
   <div className="prompt-queue-actions">
    <button disabled={index===0} aria-label={t('Đưa prompt lên')} title={t('Đưa prompt lên')} onClick={()=>onChange(item.id,'up')}>↑</button>
    <button disabled={index===items.length-1} aria-label={t('Đưa prompt xuống')} title={t('Đưa prompt xuống')} onClick={()=>onChange(item.id,'down')}>↓</button>
    <button aria-label={t('Xóa prompt chờ')} title={t('Xóa prompt chờ')} onClick={()=>onChange(item.id,'remove')}>×</button>
   </div>
  </li>)}</ol>
 </section>;
}
