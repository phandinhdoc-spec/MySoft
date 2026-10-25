import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {atomicJson} from './storage.js';
import {maskPersonal} from '../learner.js';
import {findUnsafe} from '../skills.js';
import type {ModelChoice} from '@pvta/shared';
import {lightFeedbackModel,feedbackRuleKey} from './feedback-learning.js';
import {validateSchema} from './learning-schema.js';

export type SignalGroup='workflow'|'research'|'planning'|'unclassified';
export type SignalKind='feedback'|'draft'|'execution'|'search'|'read';
export interface SignalInput {
 group:SignalGroup; kind:SignalKind; sourceId:string;
 chatId?:string; projectId?:string; workflowId?:string; planId?:string;
 runId?:string; stepId?:string;
 outcome:'unverified'|'succeeded'|'failed'|'interrupted';
 text?:string; sourceVersion?:string;
 researchSubtype?:'legal'|'news'|'professional';
}
export interface LearningSignal extends SignalInput {
 id:string; key:string; capturedAt:string; text:string;
 status:'pending'|'running'|'interrupted'|'error'|'processed'|'unclassified';
 retries:number; proposal?:{status:'proposed';rule:string}; duplicateOf?:string;
}
/** Never infer a functional group from prose or a model's answer. */
export function signalGroup(context:{planning?:boolean;workflow?:boolean;research?:boolean}):SignalGroup {
 const groups:SignalGroup[]=[];
 if(context.planning)groups.push('planning');
 if(context.workflow)groups.push('workflow');
 if(context.research)groups.push('research');
 return groups.length===1?groups[0]!:'unclassified';
}
export function signalText(text:string):string {
 return maskPersonal(text)
  .replace(/(?:[A-Za-z]:\\|\/)[^\s,;]+/g,'[path]')
  .replace(/(?:api[_ -]?key|token|password|mật khẩu|khóa bí mật)\s*[:=]\s*\S+/gi,'[secret]')
  .replace(/\b(?:sk-|ghp_|github_pat_)[\w-]+/g,'[secret]')
  .replace(/\s+/g,' ').trim().slice(0,1200);
}
export const signalHash=(text:string)=>createHash('sha256').update(text).digest('hex');
const string={type:'string',minLength:1,maxLength:200};
const inboxSchema={type:'object',required:['schemaVersion','items'],additionalProperties:false,properties:{schemaVersion:{const:1},items:{type:'array',maxItems:10000,items:{
 type:'object',additionalProperties:false,required:['id','key','capturedAt','group','kind','sourceId','outcome','text','status','retries'],properties:{
  id:string,duplicateOf:string,key:{type:'string',pattern:'^[a-f0-9]{64}$'},capturedAt:{type:'string',format:'date-time'},
  group:{enum:['workflow','research','planning','unclassified']},kind:{enum:['feedback','draft','execution','search','read']},
  sourceId:{type:'string',minLength:1,maxLength:1000},chatId:string,projectId:string,workflowId:string,planId:string,runId:string,stepId:string,
  outcome:{enum:['unverified','succeeded','failed','interrupted']},text:{type:'string',maxLength:1200},sourceVersion:{type:'string',pattern:'^[a-f0-9]{64}$'},
  researchSubtype:{enum:['legal','news','professional']},status:{enum:['pending','running','interrupted','error','processed','unclassified']},retries:{type:'integer',minimum:0,maximum:3},
  proposal:{type:'object',required:['status','rule'],additionalProperties:false,properties:{status:{const:'proposed'},rule:{type:'string',maxLength:160}}}
 }
}}}};

/** Separate capture inbox until registry cutover. No activation or legacy writes. */
export class LearningSignals {
 private items:LearningSignal[]=[];
 private busy=false;
 constructor(readonly file:string){
  if(!fs.existsSync(file))return;
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024*1024)throw Error('Unsafe learning signal inbox');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  validateSchema(data,inboxSchema);
  if(data.schemaVersion!==1||!Array.isArray(data.items)||data.items.length>10000)throw Error('Invalid learning signal inbox');
  for(const row of data.items){
   if(!row||typeof row.id!=='string'||typeof row.key!=='string'||typeof row.sourceId!=='string'||typeof row.text!=='string'||
    !['workflow','research','planning','unclassified'].includes(row.group)||!['feedback','draft','execution','search','read'].includes(row.kind)||
    !['unverified','succeeded','failed','interrupted'].includes(row.outcome)||!['pending','running','interrupted','error','processed','unclassified'].includes(row.status)||
    !Number.isInteger(row.retries)||row.retries<0||row.proposal&&(row.proposal.status!=='proposed'||typeof row.proposal.rule!=='string'))throw Error('Invalid learning signal record');
   if(row.kind!=='execution'&&row.outcome!=='unverified'||row.group==='unclassified'&&row.status!=='unclassified'||row.group==='research'&&!row.researchSubtype&&row.status!=='unclassified')throw Error('Inconsistent signal classification');
   this.items.push({...row,status:row.status==='running'?'interrupted':row.status});
  }
  for(const row of this.items)if(row.duplicateOf&&!this.items.some(x=>x.id===row.duplicateOf&&x.proposal&&this.sameScope(x,row)))throw Error('Invalid duplicate evidence reference');
 }
 private sameScope(a:SignalInput,b:SignalInput){return a.group===b.group&&a.chatId===b.chatId&&a.projectId===b.projectId&&a.workflowId===b.workflowId&&a.planId===b.planId&&a.researchSubtype===b.researchSubtype;}
 all():LearningSignal[]{return structuredClone(this.items);}
 private save(next:LearningSignal[]){const data=JSON.parse(JSON.stringify({schemaVersion:1,items:next}));validateSchema(data,inboxSchema);atomicJson(this.file,data);this.items=data.items;}
 capture(input:SignalInput):boolean {
  const text=signalText(input.text??'');
  if(findUnsafe(text))return false;
  // Drafts and retrieved text never constitute verified execution or factual truth.
  const outcome=input.kind==='execution'?input.outcome:'unverified';
  const identity=[input.group,input.kind,input.chatId,input.projectId,input.workflowId,input.planId,input.runId,input.stepId,input.sourceId,input.sourceVersion,outcome];
  const legacyKey=signalHash(JSON.stringify(identity));
  // Preserve existing keys for observations that still await subtype classification.
  if(input.researchSubtype)identity.push(input.researchSubtype);
  const key=signalHash(JSON.stringify(identity));
  if(this.items.some(x=>x.key===key||(x.key===legacyKey&&x.researchSubtype===input.researchSubtype)))return false;
  if(this.items.length>=10000)throw Error('Learning signal inbox full; evidence retained');
  const unclassified=input.group==='unclassified'||input.group==='research'&&!input.researchSubtype;
  this.save([...this.items,{...input,text,outcome,key,id:randomUUID(),capturedAt:new Date().toISOString(),status:unclassified?'unclassified':'pending',retries:0}]);
  return true;
 }
 pending(){return this.items.some(x=>['pending','interrupted','error'].includes(x.status)&&x.retries<3);}
 retry(){this.save(this.items.map(x=>x.status==='error'?{...x,retries:0,status:'pending'}:x));}
 async process(options:ModelChoice[],signal:AbortSignal,idle:()=>boolean,extract:(prompt:string,choice:ModelChoice)=>Promise<string>):Promise<string> {
  if(this.busy||signal.aborted||!idle())return 'deferred';
  const item=this.items.find(x=>['pending','interrupted','error'].includes(x.status)&&x.retries<3);
  if(!item)return 'empty';
  const choice=lightFeedbackModel(options);if(!choice)return 'missing-model';
  const update=(patch:Partial<LearningSignal>)=>this.save(this.items.map(x=>x.id===item.id?{...x,...patch}:x));
  this.busy=true;
  try{
   update({status:'running'});
   // A single observation per extraction: never concatenate other chats or groups.
   const result=await extract(JSON.stringify({group:item.group,kind:item.kind,outcome:item.outcome,text:item.text,researchSubtype:item.researchSubtype}),choice);
   if(signal.aborted||!idle()){update({status:'interrupted'});return 'interrupted';}
   const parsed=JSON.parse(result.replace(/```(?:json)?/g,'').trim());
   if(typeof parsed.rule!=='string'||parsed.rule.length>160||findUnsafe(parsed.rule))throw Error('Invalid signal proposal');
   const rule=signalText(parsed.rule);
   const duplicate=this.items.find(x=>x.proposal&&this.sameScope(x,item)&&feedbackRuleKey(x.proposal.rule)===feedbackRuleKey(rule));
   update({status:'processed',...(duplicate?{duplicateOf:duplicate.id}:rule?{proposal:{status:'proposed',rule}}:{})});
   return 'processed';
  }catch{
   const interrupted=signal.aborted||!idle();
   update({status:interrupted?'interrupted':'error',retries:item.retries+(interrupted?0:1)});
   return interrupted?'interrupted':'error';
  }finally{this.busy=false;}
 }
}
