import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {dismissReviewNotice,reviewSnapshot,subscribeReview,type ReviewState} from './workflow-prompt-review';
import {editReviewedPrompt} from '../../core/src/desktop/prompt-edit';
import './workflow-prompt-review.css';
const fields=[['muc_tieu','Mục tiêu'],['dau_ra','Đầu ra'],['rang_buoc','Ràng buộc'],['tieu_chi_hoan_thanh','Tiêu chí hoàn thành']] as const;
const readField=(prompt:string,key:string):string=>{try{return JSON.parse(prompt.split('\n').find(line=>line.startsWith(key+': '))?.slice(key.length+2)??'""');}catch{return '';}};
const editField=(prompt:string,key:string,value:string)=>prompt.split('\n').map(line=>line.startsWith(key+': ')?`${key}: ${JSON.stringify(value)}`:line).join('\n');

/** Cùng luật với lúc duyệt ở core: chỉ kiểm tra các nút đã sửa. Trả về lỗi đầu tiên hoặc null. */
export function reviewEditProblem(steps:{id:string;name:string;prompt:string}[],edits:Record<string,string>):string|null{
 for(const s of steps){
  const text=edits[s.id];
  if(text===undefined)continue;
  try{editReviewedPrompt(s.prompt,text);}catch(e){return `Nút “${s.name}”: ${e instanceof Error?e.message:String(e)}`;}
 }
 return null;
}
const titleOf=(s:ReviewState)=>{
 if(s.phase==='review')return `Duyệt lời nhắc: ${s.reply.promptReview.name}`;
 if(s.phase==='saved')return 'Đã lưu vào bản sao';
 if(s.phase==='failed')return s.stale?'Cần duyệt lại':'Có lỗi khi duyệt lời nhắc';
 return 'Đang viết lại prompt…';
};

/** Participates in layout. On narrow surfaces users switch between workspace and preview. */
export function WorkflowPromptDock({children}:{children:React.ReactNode}){
 const state=useSyncExternalStore(subscribeReview,reviewSnapshot);
 const [editing,setEditing]=useState(false),[showWork,setShowWork]=useState(false),[busy,setBusy]=useState(false);
 const [edits,setEdits]=useState<Record<string,string>>({});
 const token=state?.phase==='review'?state.reply.promptReview.token:undefined;
 useEffect(()=>{setEditing(false);setShowWork(false);setBusy(false);setEdits({});},[token]);
 const review=state?.phase==='review'?state.reply.promptReview:undefined;
 const kept=state?.phase==='failed'?state.review:undefined;
 const problem=review?reviewEditProblem(review.steps,edits):null;
 // Đóng khung: bản đang duyệt bị hủy, không chạy; đang viết lại thì dừng; lỗi hoặc đã lưu thì chỉ ẩn thông báo.
 const close=()=>{if(!state)return;if(state.phase==='review')state.decide(null);else if(state.phase==='preparing')state.cancel();else dismissReviewNotice();};
 const decide=(action:'run'|'save')=>{if(!state||state.phase!=='review'||!review||reviewEditProblem(review.steps,edits))return;setBusy(true);state.decide({promptEdits:edits,action});};
 const canSave=!!review?.steps.some(s=>s.canSave);
 return <div className={`prompt-review-layout ${state?'has-review':''} ${showWork?'show-work':''}`}>
  {state&&<button className="prompt-review-switch" onClick={()=>setShowWork(v=>!v)}>{showWork?'Xem bản viết lại':'Xem vùng làm việc'}</button>}
  <div className="prompt-review-work">{children}</div>
  {state&&<aside className={`prompt-review-pane prompt-review-${state.phase}`} aria-label="Xem trước prompt quy trình" aria-busy={state.phase==='preparing'||busy}>
   <header><strong>{titleOf(state)}</strong><button aria-label="Đóng xem trước" onClick={close}>×</button></header>
   {state.phase==='preparing'&&<p role="status">PVTA đang làm rõ đầu vào, đầu ra của từng nút. Chưa chạy quy trình.</p>}
   {state.phase==='saved'&&<div className="prompt-review-body">
    <p role="status">Đã ghi bản tốt vào {state.steps.length} nút bản sao: {state.steps.join(', ')||'không có nút nào'}. Quy trình chưa chạy; bấm Chạy để dùng bản đã lưu.</p>
    <div><button onClick={dismissReviewNotice}>Đóng</button></div>
   </div>}
   {state.phase==='failed'&&<div className="prompt-review-body">
    <p role="alert" className={state.stale?'prompt-review-stale':'prompt-review-error'}>{state.stale?'Bản nháp không còn khớp quy trình, tài nguyên hoặc phiên bản Plan, nên chưa lưu. Bấm Chạy trên quy trình để xem và duyệt lại.':'Không hoàn tất được bước duyệt lời nhắc. Bấm Chạy trên quy trình để thử lại.'}</p>
    <pre>{state.message}</pre>
    {kept&&<>
     <p>Bản nháp được giữ để đối chiếu (chưa lưu vào đâu):</p>
     {kept.steps.map(s=><section key={s.id}><h3>{s.name}</h3><pre>{s.prompt}</pre></section>)}
    </>}
    <div><button onClick={dismissReviewNotice}>Đóng</button></div>
   </div>}
   {review&&<>
    <div className="prompt-review-body">
     <p>Đầu vào/đầu ra có thể để trống khi soạn nút. Đầu ra của bước trước được chuyển tiếp theo liên kết hiện có.</p>
     {editing&&<p role="status">Chỉnh các mục bên dưới, rồi bấm Xem lại. Muốn đổi yêu cầu gốc hoặc tệp, đóng xem trước và sửa nút.</p>}
     {review.steps.map(s=><section key={s.id}><h3>{s.name}</h3><details><summary>Prompt gốc</summary><pre>{s.original}</pre></details>{editing?fields.map(([key,label])=><label key={key}>{label}<textarea aria-label={`${label}: ${s.name}`} rows={3} maxLength={4000} value={readField(edits[s.id]??s.prompt,key)} onChange={e=>{const value=e.target.value;setEdits(v=>({...v,[s.id]:editField(v[s.id]??s.prompt,key,value)}));}}/></label>):<pre>{edits[s.id]??s.prompt}</pre>}</section>)}
    </div>
    <footer>
     <small>“Duyệt và chạy ngay” chỉ dùng cho lần chạy này, không ghi vào nút bản sao. Nút gốc của Plan luôn giữ nguyên.</small>
     {canSave&&<small>“Lưu vào bản sao” ghi bản tốt vào nút bản sao rồi dừng, chưa chạy.</small>}
     {problem&&<small role="alert">{problem} Sửa mục đó rồi bấm Xem lại.</small>}
     <div>
      <button onClick={()=>setEditing(v=>!v)} disabled={busy}>{editing?'Xem lại':'Sửa lại'}</button>
      {canSave&&<button disabled={!!problem||busy} onClick={()=>decide('save')}>Lưu vào bản sao</button>}
      <button className="primary" disabled={!!problem||busy} onClick={()=>decide('run')}>Duyệt và chạy ngay</button>
     </div>
    </footer>
   </>}
  </aside>}
 </div>;
}
