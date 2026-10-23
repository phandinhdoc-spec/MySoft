import type {Plan} from './ipc';

export type PlanDraft={revision:number;context:string;steps:Plan['steps']};
export const draftKey=(id:string,graphView:boolean)=>`pvta:plan-draft:${id}:${graphView?'workflow':'chat'}`;
export function readPlanDraft(storage:Pick<Storage,'getItem'>,key:string):PlanDraft|undefined{
 try{
  const value=JSON.parse(storage.getItem(key)??'null');
  if(!value||!Number.isInteger(value.revision)||typeof value.context!=='string'||!Array.isArray(value.steps))return;
  if(!value.steps.every((s:Plan['steps'][number])=>s&&typeof s.id==='string'&&typeof s.goal==='string'&&typeof s.task==='string'&&Array.isArray(s.files)))return;
  return value;
 }catch{return;}
}
export function draftConflicts(draft:PlanDraft,plan:Plan){return draft.revision!==(plan.revision??0);}
