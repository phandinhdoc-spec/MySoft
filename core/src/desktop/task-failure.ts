import type {Chat} from './types.js';

/** Only failures crossing the AI boundary qualify, never file/recovery errors. */
export class AiTaskError extends Error {}
export interface TaskFailure {source:'ai';reason:string}
export function taskFailure(error:unknown,signal:AbortSignal,reason:string):TaskFailure|undefined {
 return !signal.aborted&&error instanceof AiTaskError?{source:'ai',reason}:undefined;
}
export interface FailedTask {chatId:string;projectId?:string;targetId:string;title:string;reason:string;at:number}
export function failedTasks(chats:Chat[]):FailedTask[]{
 const tasks:FailedTask[]=[];
 for(const chat of chats){
  for(const message of chat.messages){
   const plan=message.plan;
   if(plan&&plan.chatId===chat.id)for(const step of plan.steps){
    if(step.status==='error'&&step.failure?.source==='ai')tasks.push({chatId:chat.id,projectId:chat.projectId,targetId:`plan-${plan.id}-${step.id}`,title:step.goal,reason:step.failure.reason,at:step.endedAt??message.at});
   }
  }
  // A subsequent turn supersedes a chat failure; Plan failures remain per step.
  const last=chat.messages.at(-1);
  if(last?.error&&last.failure?.source==='ai')tasks.push({chatId:chat.id,projectId:chat.projectId,targetId:`message-${last.id}`,title:chat.title,reason:last.failure.reason,at:last.at});
 }
 return tasks.sort((a,b)=>b.at-a.at);
}
