import type {PromptReviewReply,PromptReadyReply,PromptReview} from '../../core/src/desktop/workflow-prompts';

/** `run`: chạy với bản đã duyệt, không ghi vào bản sao. `save`: chỉ ghi bản tốt vào nút bản sao, không chạy. `null`: đóng, không chạy. */
export type ReviewDecision={promptEdits:Record<string,string>;action:'run'|'save'}|null;
/**
 * `failed` giữ thông báo lỗi trên khung xem trước; `stale` = bản nháp hoặc tài nguyên đã đổi, cần duyệt lại.
 * `review` giữ bản nháp khi lưu thất bại để người dùng đối chiếu; không lưu gì.
 * `saved` xác nhận đã ghi các nút bản sao; chưa chạy.
 */
export type ReviewState=
 |{phase:'preparing';cancel:()=>void}
 |{phase:'review';reply:PromptReviewReply;decide:(d:ReviewDecision)=>void}
 |{phase:'saved';steps:string[]}
 |{phase:'failed';message:string;stale:boolean;review?:PromptReview};
let state:ReviewState|null=null;
let active=false;
const listeners=new Set<()=>void>();
export const reviewSnapshot=()=>state;
export function subscribeReview(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
function publish(next:ReviewState|null){state=next;for(const fn of listeners)fn();}

/** Chỉ đóng thông báo lỗi hoặc xác nhận đã lưu; không đụng tới bản đang viết lại hoặc đang chờ duyệt. */
export function dismissReviewNotice(){if(state?.phase==='failed'||state?.phase==='saved')publish(null);}

const STALE=/hết hiệu lực|cần duyệt lại|cần duyệt lời nhắc|đã đổi/;
const messageOf=(e:unknown)=>(e instanceof Error?e.message:String(e))||'Không rõ lỗi.';

/** Every UI run entry uses the same handshake; a raw RPC caller also receives a draft, never an implicit approval. */
export async function withPromptReview<T>(method:string,params:Record<string,unknown>,send:(method:string,params:Record<string,unknown>)=>Promise<T>):Promise<T>{
 if(!['workflowRun','chatWorkflow','runPlan'].includes(method))return send(method,params);
 if(active)throw Error('Đang chuẩn bị hoặc duyệt một quy trình. Hoàn tất hoặc đóng bản đang xem trước.');
 active=true;let cancelled=false,released=false,stopped=false,failed:string|undefined,kept:PromptReview|undefined;
 publish({phase:'preparing',cancel:()=>{cancelled=true;publish(null);void send('workflowPromptCancel',{id:params.workflowId??params.id,plan:method==='runPlan'}).catch(()=>{});}});
 try{
  const result=await send(method,{...params,promptPrepare:true});
  if(result&&typeof result==='object'&&'promptReady' in result){
   if(cancelled)throw Error('Đã dừng; quy trình chưa chạy.');
   const ready=result as unknown as PromptReadyReply;publish(null);active=false;released=true;
   const executed=await send(ready.resume.method,ready.resume.params);
   if(executed&&typeof executed==='object'&&'promptReview' in executed)throw Error('Quy trình vừa thay đổi và cần duyệt lời nhắc. Bấm Chạy để xem bản mới.');
   return executed;
  }
  if(!result||typeof result!=='object'||!('promptReview' in result))return result;
  const reply=result as unknown as PromptReviewReply;
  if(cancelled){stopped=true;await send('workflowPromptCancel',{id:reply.promptReview.workflowId});throw Error('Đã dừng; quy trình chưa chạy.');}
  const decision=await new Promise<ReviewDecision>(decide=>publish({phase:'review',reply,decide}));
  if(!decision){publish(null);stopped=true;await send('workflowPromptCancel',{id:reply.promptReview.workflowId});throw Error('Đã đóng bản xem trước; quy trình chưa chạy.');}
  if(decision.action==='save'){
   // Giữ khung xem trước cho tới khi lưu xong. Lỗi (ví dụ bản nháp đã cũ) sẽ giữ bản nháp trên khung.
   kept=reply.promptReview;
   const saved=await send('workflowPromptSave',{method:reply.resume.method,params:reply.resume.params,promptApproval:reply.promptReview.token,promptEdits:decision.promptEdits});
   const steps=(saved&&typeof saved==='object'&&Array.isArray((saved as {steps?:unknown}).steps))?(saved as unknown as {steps:string[]}).steps:[];
   active=false;released=true;publish({phase:'saved',steps});
   return saved;
  }
  publish(null);
  active=false;released=true;
  return await send(reply.resume.method,{...reply.resume.params,promptEdits:decision.promptEdits,promptApproval:reply.promptReview.token});
 }catch(e){
  // Người dùng tự dừng hoặc đóng không phải lỗi; mọi lỗi khác được giữ trên khung và vẫn ném lên để báo.
  if(!cancelled&&!stopped)failed=messageOf(e);
  throw e;
 }finally{
  if(failed!==undefined){active=false;publish({phase:'failed',message:failed,stale:STALE.test(failed),...(kept?{review:kept}:{})});}
  else if(!released){publish(null);active=false;}
 }
}
