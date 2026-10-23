import {t as uiText} from './i18n';
import React,{useState,useEffect} from 'react';
import {rpc,type Plan,type PlanStep} from './ipc';
import type {recoveryReport} from '../../core/src/desktop/plan-recovery';
type Review=ReturnType<typeof recoveryReport>&{token:string};
export function PlanRecovery({plan,step,busy,report,autoOpen=false,onRetryConfirmed}:{autoOpen?:boolean;onRetryConfirmed?:()=>Promise<unknown>;plan:Plan;step:PlanStep;busy:boolean;report:(e:unknown)=>void}){
 useEffect(()=>{if(autoOpen)void inspect();},[]);
 const [review,setReview]=useState<Review>(),[evidence,setEvidence]=useState(''),[pending,setPending]=useState(false);
 async function inspect(){setPending(true);try{setReview(await rpc<Review>('inspectPlanRecovery',{id:plan.id,stepId:step.id}));}catch(e){report(e);}finally{setPending(false);}}
 async function resolve(decision:'complete'|'retry'){if(!review)return;setPending(true);try{await rpc('resolvePlanRecovery',{id:plan.id,stepId:step.id,revision:review.revision,token:review.token,decision,evidence});setReview(undefined);setEvidence('');if(decision==='retry')await onRetryConfirmed?.();}catch(e){report(e);setReview(undefined);}finally{setPending(false);}}
 return <div><button disabled={busy||pending} onClick={()=>void inspect()}>{uiText("Đối chiếu khôi phục")}</button>{review&&<section aria-label={uiText("Đối chiếu khôi phục")}><p role="alert">{review.warning}</p><p>{uiText("Mã công việc:")} {review.planId} {uiText("· Lượt:")} {review.runId??uiText("Chưa có mốc cũ")} {uiText("· Phiên bản:")} {review.revision}</p>
 <table><thead><tr><th>{uiText("Tệp")}</th><th>{uiText("Đối chiếu")}</th></tr></thead><tbody>{review.current.map(m=>{const old=(review.after.length?review.after:review.before).find(x=>x.path===m.path);return <tr key={m.path}><td>{m.path}</td><td>{m.state==='unknown'?m.reason:!old?uiText("Chưa có mốc cũ"):JSON.stringify(old)===JSON.stringify(m)?uiText("Không đổi so với mốc lưu"):uiText("Đã thay đổi")}{m.state==='missing'?' · Không tồn tại':''}</td></tr>;})}</tbody></table>
 {!review.current.length&&<p>{uiText("Không có đường dẫn tệp cụ thể để kiểm tra tự động.")}</p>}
 <details open><summary>{uiText("Kết quả và thao tác ghi nhận")}</summary><pre style={{whiteSpace:'pre-wrap'}}>{review.output||uiText("Chưa ghi nhận kết quả.")}</pre>{review.actions.map(a=><p key={a.id}>{a.kind} · {a.state} · {a.output??a.path}{a.cloudUrl&&` · ${a.cloudUrl}`}{a.uploadError&&` · ${a.uploadError}`}</p>)}</details>
 <label>{uiText("Kết quả đối chiếu thực tế (tệp, bản nháp Office, yêu cầu đã gửi tới hệ thống ngoài)")}<textarea value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder={uiText("Đã kiểm tra gì? Phần nào đã hoàn tất hoặc chắc chắn chưa thực hiện?")}/></label>
 <p>{uiText("Xác nhận hoàn thành sẽ dùng nội dung đối chiếu làm kết quả bước. Cho phép thử lại có thể lặp thao tác nếu xác minh chưa đủ. Các đề xuất chưa áp dụng của lần cũ sẽ bị hủy.")}</p>
 <button disabled={busy||pending||!evidence.trim()} onClick={()=>void resolve('complete')}>{uiText("Xác nhận kết quả đã hoàn thành")}</button>
 {step.status!=='done'&&<button disabled={busy||pending||!evidence.trim()} onClick={()=>void resolve('retry')}>{onRetryConfirmed?uiText("Đã đối chiếu, thử lại bước này"):uiText("Đã đối chiếu, cho phép thử lại")}</button>}
 <button disabled={pending} onClick={()=>setReview(undefined)}>{uiText("Giữ nguyên, chưa tiếp tục")}</button></section>}</div>;
}
