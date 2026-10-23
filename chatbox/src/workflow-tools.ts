import {t as uiText} from './i18n';
import {MAX_WORKFLOW_STEPS} from '../../core/src/desktop/workflow-limits';
import type {Workflow,WorkflowStep} from '../../core/src/desktop/types';

export type WorkflowDraft=Pick<Workflow,'id'|'name'|'folder'|'input'|'steps'|'mode'|'maxConcurrency'|'pinned'>&Partial<Pick<Workflow,'frames'|'suggestedLinks'|'outputDir'|'attachments'|'codeTimeoutMs'>>;
export function selectWorkflows(list:Workflow[],query:string,status:string,sort:string){
 const key=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi');
 return list.filter(w=>{
  const text=[w.name,...w.steps.map(s=>s.name)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi');
  return text.includes(key)&&(status==='all'||(status==='pinned'?w.pinned:(w.runs[0]?.status??'new')===status));
 }).sort((a,b)=>(sort==='created'?0:Number(!!b.pinned)-Number(!!a.pinned))||(sort==='created'?(b.createdAt??b.updatedAt)-(a.createdAt??a.updatedAt):sort==='name'?a.name.localeCompare(b.name,'vi'):sort==='oldest'?a.updatedAt-b.updatedAt:b.updatedAt-a.updatedAt));
}
/** A copy has fresh identities, no history or Plan link, and keeps dependency topology. */
export function copyWorkflow(source:WorkflowDraft,name=uiText("{0} (bản sao)",[source.name])):WorkflowDraft{
 const ids=new Map(source.steps.map(s=>[s.id,crypto.randomUUID()]));
 return {id:crypto.randomUUID(),name:name.slice(0,100),folder:source.folder,...(source.outputDir?{outputDir:source.outputDir}:{}),...(source.attachments?.length?{attachments:[...source.attachments]}:{}),...(source.codeTimeoutMs?{codeTimeoutMs:source.codeTimeoutMs}:{}),...(source.frames?.length?{frames:source.frames.map(f=>({...f,id:crypto.randomUUID(),stepIds:f.stepIds.map(id=>ids.get(id)).filter(Boolean) as string[]}))}:{}),input:source.input?structuredClone(source.input):undefined,mode:source.mode,maxConcurrency:source.maxConcurrency,pinned:false,steps:source.steps.map(s=>({...structuredClone(s),templateCopy:true,promptFormat:undefined,id:ids.get(s.id)!,dependsOn:s.dependsOn?.map(id=>ids.get(id)??id)}))};
}
/** Portable templates omit local paths, input contents and execution history. */
export function exportWorkflow(source:WorkflowDraft){
 return JSON.stringify({format:'pvta-workflow',version:1,workflow:{name:source.name,mode:source.mode,maxConcurrency:source.maxConcurrency,steps:source.steps.map(({insertGroup:_g,files:_f,...x})=>x),...(source.frames?.length?{frames:source.frames}:{})}},null,2);
}
export function importWorkflow(text:string):WorkflowDraft{
 if(text.length>600_000)throw Error(uiText("Mẫu quá lớn (tối đa 600.000 ký tự)."));
 const data=JSON.parse(text);
 const w=data?.workflow;
 if(data?.format!=='pvta-workflow'||data.version!==1||!w||typeof w.name!=='string'||!Array.isArray(w.steps)||w.steps.length<1||w.steps.length>MAX_WORKFLOW_STEPS)throw Error(`Mẫu PVTA không hợp lệ; cần từ 1 đến ${MAX_WORKFLOW_STEPS} bước.`);
 const ids=new Set<string>();
 for(const s of w.steps){
  if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)||typeof s.name!=='string'||typeof s.prompt!=='string'||s.prompt.length>20_000)throw Error(uiText("Dữ liệu bước không hợp lệ."));
  ids.add(s.id);
 }
 for(const s of w.steps)if(s.dependsOn!==undefined&&(!Array.isArray(s.dependsOn)||s.dependsOn.some((id:unknown)=>typeof id!=='string'||!ids.has(id))))throw Error(uiText("Mẫu có kết nối không hợp lệ."));
 // Imported templates always start with read-only permissions; users enable editing explicitly.
 const steps:WorkflowStep[]=w.steps.map((s:WorkflowStep)=>({id:s.id,name:s.name,prompt:s.prompt,choice:'auto',access:'read',dependsOn:s.dependsOn,continueOnError:s.continueOnError===true,inputs:s.inputs,outputs:s.outputs,completion:s.completion,onError:s.onError}));
 const frames=(Array.isArray(w.frames)?w.frames:[]).slice(0,20).filter((f:any)=>f&&Array.isArray(f.stepIds)).map((f:any)=>({id:String(f.id??crypto.randomUUID()),name:String(f.name??'Khung').slice(0,100),stepIds:f.stepIds.filter((x:unknown)=>typeof x==='string'&&ids.has(x)),decl:String(f.decl??'').slice(0,4000)}));
 return copyWorkflow({id:'import',name:w.name,steps,...(frames.length?{frames}:{}),mode:w.mode==='parallel'?'parallel':'sequential',maxConcurrency:w.maxConcurrency},uiText("{0} (đã nhập)",[w.name]));
}
