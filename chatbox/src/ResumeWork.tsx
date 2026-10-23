import {t as uiText} from './i18n';
import React,{useState,useEffect} from 'react';
import {rpc} from './ipc';
type Candidate={id:string;chatId:string;title:string;revision:number;updatedAt:number;done:string[];remaining:{goal:string;status:string}[]};
export function ResumeWork({projectId,onResume}:{projectId?:string;onResume:(chatId:string)=>void}){
 const [query,setQuery]=useState(''),[rows,setRows]=useState<Candidate[]>([]),[error,setError]=useState('');
 useEffect(()=>{let alive=true;const refresh=()=>rpc<Candidate[]>('resumeCandidates',{query,projectId}).then(r=>{if(alive){setRows(r);setError('');}}).catch(e=>{if(alive)setError(String(e));});void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{alive=false;clearInterval(timer);};},[query,projectId]);
 return <section aria-label={uiText("Tiếp tục công việc")}><h2>{uiText("Việc còn dở / bị gián đoạn")}</h2><label>{uiText("Tìm trong Plan, lịch sử và nhật kí")}<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={uiText("Tên bài, tài liệu hoặc công việc…")}/></label>{error&&<p role="alert">{error}</p>}{rows.length>1&&<p>{uiText("Có nhiều việc phù hợp. Chọn đúng công việc để xem; chưa tự động chạy.")}</p>}{!rows.length&&<p>{uiText("Không có công việc phù hợp.")}</p>}{rows.map(r=><details key={r.id}><summary>{r.title} · {new Date(r.updatedAt).toLocaleString('vi-VN')}</summary><p>{uiText("Mã:")} {r.id} {uiText("· Phiên bản")} {r.revision}</p><p>{uiText("Đã xong:")} {r.done.join('; ')||uiText("Chưa có")}</p><p>{uiText("Còn lại:")} {r.remaining.map(s=>s.goal+(s.status==='interrupted'?' (bị gián đoạn)':s.status==='error'?' (lỗi)':'')).join('; ')}</p><button onClick={()=>onResume(r.chatId)}>{uiText("Mở hội thoại để đối chiếu và tiếp tục")}</button></details>)}</section>;
}
