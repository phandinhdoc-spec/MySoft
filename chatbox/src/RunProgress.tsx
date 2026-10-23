import {t as uiText} from './i18n';
import React,{useEffect,useId,useState,useRef} from 'react';
import type {AiProgressEntry} from '@pvta/shared';
import './run-progress.css';

export function appendProgress(rows:AiProgressEntry[],entry:AiProgressEntry):AiProgressEntry[]{
 const index=rows.findIndex(row=>row.id===entry.id);
 if(index<0)return [...rows,entry].slice(-100);
 return rows.map((row,i)=>i===index?entry:row);
}
const status={running:uiText("Đang chạy"),done:uiText("Hoàn tất"),error:uiText("Lỗi"),interrupted:uiText("Đã dừng")};
const elapsed=(ms:number)=>{const seconds=Math.max(0,Math.floor(ms/1000));return seconds<60?uiText("{0} giây",[seconds]):uiText("{0} phút {1} giây",[Math.floor(seconds/60),seconds%60]);};

export function RunProgress({running,entries}:{running:boolean;entries:AiProgressEntry[]}){
 const [open,setOpen]=useState(false),[now,setNow]=useState(Date.now),[startedAt]=useState(Date.now);
 const id=useId(),panel=useRef<HTMLElement>(null),following=useRef(true);
 useEffect(()=>{if(open&&following.current&&panel.current)panel.current.scrollTop=panel.current.scrollHeight;},[entries,open]);
 useEffect(()=>{if(!running||!open)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running,open]);
 useEffect(()=>{if(!running)setOpen(false);},[running]);
 if(!running)return null;
 return <div className="run-progress">
  <button type="button" className="run-progress-toggle" aria-label={open?uiText("Ẩn tiến trình AI"):uiText("Xem tiến trình AI")} title={open?uiText("Ẩn tiến trình AI"):uiText("Xem tiến trình AI")} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>
   <span className="run-progress-dots" aria-hidden="true"><i/><i/><i/></span>
  </button>
  {open&&<section ref={panel} id={id} onScroll={e=>{const el=e.currentTarget;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<48;}} className="run-progress-panel" aria-label={uiText("Tiến trình xử lý AI")}>
   <header><strong>{uiText("Tiến trình xử lý")}</strong><span>{elapsed(now-(entries[0]?.at??startedAt))}</span><button aria-label={uiText("Thu gọn tiến trình AI")} onClick={()=>setOpen(false)}>✕</button></header>
   <p className="run-progress-current" role="status">{[...entries].reverse().find(entry=>entry.state==='running')?.title??uiText("Đang chờ cập nhật tiến trình…")}</p>
   {!entries.length?<p className="muted">{uiText("Đang chuẩn bị yêu cầu…")}</p>:<ol className="run-progress-timeline">
    {entries.map(entry=><li key={entry.id} className={`run-progress-${entry.state}`}>
     <div className="run-progress-row"><strong>{entry.title}</strong><small>{status[entry.state]} · {elapsed((entry.endedAt??now)-entry.at)}</small></div>
     {entry.detail&&<p>{entry.detail}</p>}
     {(entry.input||entry.output)&&<details><summary>{uiText("Đầu vào / kết quả")}</summary>{entry.input&&<div className="run-progress-io"><small>{uiText("ĐẦU VÀO")}</small><pre>{entry.input}</pre></div>}{entry.output&&<div className="run-progress-io"><small>{uiText("KẾT QUẢ")}</small><pre>{entry.output}</pre></div>}</details>}
    </li>)}
   </ol>}
  </section>}
 </div>;
}
