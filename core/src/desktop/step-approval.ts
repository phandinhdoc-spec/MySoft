import type {Plan,PlanStep} from './types.js';

/** Shared by the UI and RPC; replacement data alone does not approve a stage. */
export function planStepBlock(plan:Plan,step:PlanStep):string {
 if(step.status==='done')return 'Giai đoạn đã hoàn tất.';
 if(step.status==='skipped')return 'Giai đoạn đã được bỏ qua.';
 if(step.status==='running')return 'Giai đoạn đang chạy.';
 const dependencies=(s:PlanStep)=>{const i=plan.steps.findIndex(p=>p.id===s.id);return s.dependsOn??(i>0?[plan.steps[i-1]!.id]:[]);};
 const deps=new Set<string>(),pending=[...dependencies(step)];
 while(pending.length){const id=pending.pop()!;if(deps.has(id))continue;deps.add(id);const s=plan.steps.find(s=>s.id===id);if(s)pending.push(...dependencies(s));}
 const missing=[...deps].filter(id=>{const s=plan.steps.find(s=>s.id===id);return s?.status!=='done'||!s.output?.trim();});
 return missing.length?'Chờ các bước trước hoàn tất: '+missing.map(id=>plan.steps.find(s=>s.id===id)?.goal??id).join(', '):'';
}

/** Recognize an explicit self-report, not mentions of unfinished work in source text. */
export function declaredIncomplete(output:string):boolean {
 const opening=output.normalize('NFC').trim().split(/\n\s*\n/)[0]!.replace(/[*_#]/g,'').trim();
 return /^\[PVTA_STEP:INCOMPLETE\]/i.test(output.trim())||/^(?:Bước|Giai đoạn)\s+(?:[“"‘][^”"’\n]+[”"’]\s+|này\s+)?(?:chưa|không)\s+(?:hoàn tất|hoàn thành)(?=[\s.!:;]|$)/iu.test(opening);
}
export function hasIncompleteResult(step:PlanStep):boolean {
 return !!step.output&&declaredIncomplete(step.output)&&step.checkpoint?.resolution?.decision!=='complete';
}
