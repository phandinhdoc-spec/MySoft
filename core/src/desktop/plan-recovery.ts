import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Chat,Plan,PlanStep,Action} from './types.js';

export interface FileMark {path:string;state:'file'|'missing'|'unknown';hash?:string;reason?:string}
export interface PlanCheckpoint {runId:string;revision:number;at:number;inputs:unknown;before:FileMark[];after?:FileMark[];messageId?:string;activityId?:string;review?:{token:string;marks:FileMark[];actions:string};retryMarks?:FileMark[];resolution?:{at:number;decision:string;evidence:string}}
/** Bounded synchronous reads keep checkpoint creation atomic with respect to RPC edits. */
export function markFiles(paths:string[]):FileMark[]{
 return [...new Set(paths)].sort().map(file=>{
  if(!path.isAbsolute(file))return {path:file,state:'unknown',reason:'Đường dẫn chưa tuyệt đối'};
  try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>32*1024*1024)return {path:file,state:'unknown',reason:'Thư mục, liên kết hoặc tệp lớn: cần đối chiếu thủ công'};
   return {path:file,state:'file',hash:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  }catch(e){return {path:file,state:(e as NodeJS.ErrnoException).code==='ENOENT'?'missing':'unknown',reason:(e as NodeJS.ErrnoException).code==='ENOENT'?undefined:'Không đọc được tệp'};}
 });
}
export function stepActions(chat:Chat,step:PlanStep):Action[]{return chat.messages.find(m=>m.id===step.checkpoint?.messageId)?.actions??[];}
function resolveKnownPath(file:string,absolute:string[]):string{
 if(path.isAbsolute(file))return file;
 const relative=path.normalize(file);
 if(relative==='.'||relative==='..'||relative.startsWith('..'+path.sep))return file;
 // macOS paths and model-written Vietnamese names can use different Unicode
 // forms. Keep the actual filesystem path, and still reject ambiguous matches.
 const matches=absolute.filter(p=>p.normalize('NFC').endsWith(path.sep+relative.normalize('NFC')));
 return matches.length===1?matches[0]!:file;
}
export function stepPaths(chat:Chat,step:PlanStep):string[]{
 const paths=[...(step.checkpoint?.before.map(m=>m.path)??[]),...step.files,...(step.outputs??[]).filter(p=>path.isAbsolute(p)),...stepActions(chat,step).flatMap(a=>[a.path,a.output,a.savedPath].filter((p):p is string=>!!p))];
 // Plans often name an attachment without its directory. Resolve only against
 // paths already captured in this checkpoint or its actions; never guess a cwd.
 const absolute=[...new Set(paths.filter(p=>path.isAbsolute(p)))];
 return [...new Set(paths.map(p=>resolveKnownPath(p,absolute)))];
}
/** Older checkpoints also stored an unknown mark for the same attachment's name. */
function resolvedMarks(marks:FileMark[]):FileMark[]{
 const absolute=[...new Set(marks.map(m=>m.path).filter(p=>path.isAbsolute(p)))];
 return marks.filter(m=>m.state!=='unknown'||resolveKnownPath(m.path,absolute)===m.path);
}
export function sameMarks(a:FileMark[],b:FileMark[]){return JSON.stringify(a)===JSON.stringify(b);}
export function recoveryNeeded(chat:Chat,step:PlanStep):boolean{
 if(!['done','error','interrupted'].includes(step.status))return false;
 const cp=step.checkpoint,current=markFiles(stepPaths(chat,step));
 if(step.status!=='done')return !cp?.retryMarks||!sameMarks(cp.retryMarks,current);
 return !cp?.after||(current.some(m=>m.state==='unknown')&&cp.resolution?.decision!=='complete')||!sameMarks(resolvedMarks(cp.after),current);
}
export function recoveryReport(chat:Chat,plan:Plan,step:PlanStep){
 const marks=markFiles(stepPaths(chat,step));
 return {planId:plan.id,stepId:step.id,revision:plan.revision??0,status:step.status,checkpoint:step.checkpoint?.at,runId:step.checkpoint?.runId,
  before:step.checkpoint?.before??[],after:step.checkpoint?.after??[],current:marks,output:step.output??'',
  actions:stepActions(chat,step).map(a=>({id:a.id,kind:a.kind,state:a.state,path:a.path,output:a.output,cloudUrl:a.cloudUrl,uploadError:a.uploadError})),
  warning:'Dấu vân tay chỉ kiểm tra tệp đã biết, không chứng minh nội dung đạt yêu cầu hoặc yêu cầu bên ngoài chưa gửi. Đối chiếu hệ thống đích và bản nháp Office trước khi xác nhận; khi chưa chắc hãy giữ nguyên bước.'};
}
