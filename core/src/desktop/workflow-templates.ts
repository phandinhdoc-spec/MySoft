import type {ModelChoice} from '@pvta/shared';
import {MAX_WORKFLOW_STEPS} from './workflow-limits.js';
import {cleanWorkflowResources} from './workflow-scoped-resources.js';
import type {TemplateOutput,TemplateParam,TemplateStep,WorkflowTemplate} from './types.js';

/**
 * Quy trình mẫu = quy trình có đầu vào chưa xác định (tham số điền mỗi lần dùng) và đầu ra do người dùng quy định.
 * Mô-đun thuần: chuẩn hóa mẫu, dựng bước cụ thể từ mẫu (việc chèn vào Plan/quy trình nằm ở template-apply.ts).
 */
export const MAX_TEMPLATES=200,MAX_TEMPLATE_STEPS=MAX_WORKFLOW_STEPS,MAX_TEMPLATE_PARAMS=30,MAX_VALUE=8000;
const KEY=/^[A-Za-z0-9_-]{1,40}$/;
const RESERVED=new Set(['input','prev']);
const STR=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';
const BACKENDS=['agy','claude','codex','api'];
/** Model của khâu: 'auto' hoặc {backend,model}; giá trị lạ báo lỗi rõ thay vì bỏ qua âm thầm. */
export function stepChoice(v:unknown,where:string):ModelChoice|'auto'{
 if(v===undefined||v===null||v==='auto')return 'auto';
 const c=v as any;
 if(typeof c!=='object'||typeof c.model!=='string'||!c.model.trim()||c.model.length>200||!BACKENDS.includes(c.backend))throw Error(`Model của ${where} không hợp lệ.`);
 return {...c,model:c.model.trim()} as ModelChoice;
}
const PLACEHOLDER=/\{\{([^{}]+?)\}\}/g;

/** Bước cụ thể (đã điền tham số), dùng chung cho Plan và Quy trình. */
export interface ConcreteStep {resources?:TemplateStep['resources'];id:string;name:string;prompt:string;access:'read'|'full';choice:ModelChoice|'auto';inputs:string[];outputs:string[];dependsOn:string[];completion:string;onError:string}
/** Nơi tra nội dung kỹ năng, quy tắc và lời nhắc mẫu; trả undefined nếu không tìm thấy. */
export interface TemplateRefs {skill(name:string):string|undefined;rule(key:string):string|undefined;prompt(id:string):string|undefined}
export interface TemplateValues {params?:Record<string,unknown>;output?:unknown}

const names=(v:unknown,label:string):string[]|undefined=>{
 if(v===undefined)return undefined;
 if(!Array.isArray(v)||v.length>20||v.some(x=>typeof x!=='string'||!x.trim()||x.length>200))throw Error(`${label} không hợp lệ.`);
 return [...new Set((v as string[]).map(x=>x.trim()))];
};
const list=(v:unknown,label:string):string[]|undefined=>{
 if(v===undefined)return undefined;
 if(!Array.isArray(v)||v.length>20||v.some(x=>typeof x!=='string'||x.length>2000))throw Error(`${label} không hợp lệ.`);
 return [...v] as string[];
};

/** Làm sạch dữ liệu từ giao diện trước khi lưu. Báo lỗi rõ khi tham số hoặc đồ thị bước sai. */
export function normalizeTemplate(input:any,old?:WorkflowTemplate,now=Date.now(),newId=()=>globalThis.crypto.randomUUID()):WorkflowTemplate{
 if(!input||typeof input!=='object')throw Error('Thiếu dữ liệu quy trình mẫu.');
 const name=STR(input.name,100).trim();
 if(!name)throw Error('Hãy đặt tên cho quy trình mẫu.');
 const rawParams=Array.isArray(input.params)?input.params:[];
 if(rawParams.length>MAX_TEMPLATE_PARAMS)throw Error(`Tối đa ${MAX_TEMPLATE_PARAMS} tham số.`);
 const seen=new Set<string>();
 const params:TemplateParam[]=rawParams.map((p:any):TemplateParam=>{
  const key=STR(p?.key,40).trim();
  if(!KEY.test(key))throw Error(`Khóa tham số “${key}” chỉ gồm chữ không dấu, số, gạch ngang hoặc gạch dưới (tối đa 40 ký tự).`);
  if(RESERVED.has(key))throw Error(`Khóa “${key}” đã dành cho hệ thống.`);
  if(seen.has(key))throw Error(`Khóa tham số “${key}” bị trùng.`);seen.add(key);
  const def=STR(p?.default,MAX_VALUE);
  return {key,label:STR(p?.label,100).trim()||key,...(p?.hint?{hint:STR(p.hint,300)}:{}),required:p?.required!==false&&!def.trim(),...(def?{default:def}:{}),...(p?.long===true?{long:true}:{})};
 });
 const rawSteps=Array.isArray(input.steps)?input.steps:[];
 if(!rawSteps.length)throw Error('Quy trình mẫu cần ít nhất một khâu.');
 if(rawSteps.length>MAX_TEMPLATE_STEPS)throw Error(`Tối đa ${MAX_TEMPLATE_STEPS} khâu.`);
 const checkPlaceholders=(text:string,where:string)=>{for(const m of text.matchAll(PLACEHOLDER)){const k=m[1]!.trim();if(!seen.has(k)&&!RESERVED.has(k))throw Error(`${where} dùng {{${k}}} nhưng chưa có tham số này.`);}};
 const ids=new Set<string>();
 const steps:TemplateStep[]=rawSteps.map((s:any):TemplateStep=>{
  const id=STR(s?.id,60).trim()||newId().slice(0,36);
  if(ids.has(id))throw Error('ID khâu bị trùng.');ids.add(id);
  const sname=STR(s?.name,100).trim()||'Khâu mới';
  const prompt=STR(s?.prompt,12_000);
  if(!prompt.trim())throw Error(`Khâu “${sname}” chưa có prompt.`);
  checkPlaceholders(prompt,`Khâu “${sname}”`);
  const skills=names(s?.skills,'Danh sách kỹ năng'),rules=names(s?.rules,'Danh sách quy tắc'),prompts=names(s?.prompts,'Danh sách lời nhắc mẫu');
  const dependsOn=s?.dependsOn===undefined?undefined:(()=>{if(!Array.isArray(s.dependsOn)||s.dependsOn.some((x:unknown)=>typeof x!=='string'))throw Error('Danh sách khâu cần chờ không hợp lệ.');return [...new Set(s.dependsOn as string[])];})();
  return {id,name:sname,prompt,resources:cleanWorkflowResources(s?.resources),access:s?.access==='full'?'full':'read',choice:stepChoice(s?.choice,`khâu “${sname}”`),...(skills?.length?{skills}:{}),...(rules?.length?{rules}:{}),...(prompts?.length?{prompts}:{}),inputs:list(s?.inputs,'Đầu vào'),outputs:list(s?.outputs,'Đầu ra'),dependsOn,completion:s?.completion===undefined?undefined:STR(s.completion,4000),onError:s?.onError===undefined?undefined:STR(s.onError,4000)};
 });
 const output:TemplateOutput={mode:input.output?.mode==='fixed'?'fixed':'ask',text:STR(input.output?.text,4000)};
 if(output.mode==='fixed'&&!output.text.trim())throw Error('Đầu ra cố định cần mô tả. Hoặc chọn “Quy định mỗi lần dùng”.');
 checkPlaceholders(output.text,'Đầu ra');
 return {id:old?.id??(STR(input.id,80).trim()||newId()),name,...(input.description?{description:STR(input.description,600)}:{}),params,steps:topoSort(steps),output,createdAt:old?.createdAt??now,updatedAt:now};
}

/** Sắp theo thứ tự phụ thuộc (ổn định); báo lỗi nếu có vòng hoặc khâu không tồn tại. */
export function topoSort<T extends {id:string;dependsOn?:string[]}>(steps:T[]):T[]{
 const byId=new Map(steps.map(s=>[s.id,s]));
 const state=new Map<string,1|2>(),out:T[]=[];
 const visit=(i:number)=>{
  const s=steps[i]!;
  if(state.get(s.id)===2)return;
  if(state.get(s.id)===1)throw Error('Quan hệ chờ giữa các khâu tạo thành vòng lặp.');
  state.set(s.id,1);
  for(const d of s.dependsOn??(i?[steps[i-1]!.id]:[])){const dep=byId.get(d);if(!dep)throw Error('Khâu cần chờ không tồn tại.');visit(steps.indexOf(dep));}
  state.set(s.id,2);out.push(s);
 };
 steps.forEach((_,i)=>visit(i));
 return out;
}

const fill=(text:string,values:Record<string,string>)=>text.replace(PLACEHOLDER,(m,k:string)=>{const key=k.trim();return Object.prototype.hasOwnProperty.call(values,key)?values[key]!:m;});

/** Giá trị tham số cuối cùng: dùng giá trị người dùng nhập, nếu trống dùng mặc định; thiếu mục bắt buộc thì báo lỗi nêu tên. */
export function resolveParams(tpl:WorkflowTemplate,given:Record<string,unknown>|undefined):Record<string,string>{
 const out:Record<string,string>={},missing:string[]=[];
 for(const p of tpl.params){
  const raw=given?.[p.key];
  if(raw!==undefined&&typeof raw!=='string'&&typeof raw!=='number')throw Error(`Giá trị của “${p.label}” không hợp lệ.`);
  const v=(raw===undefined?'':String(raw)).trim()||(p.default??'').trim();
  if(v.length>MAX_VALUE)throw Error(`Giá trị của “${p.label}” dài quá ${MAX_VALUE} ký tự.`);
  if(!v&&p.required)missing.push(p.label);
  out[p.key]=v;
 }
 if(missing.length)throw Error('Chưa điền: '+missing.join(', ')+'.');
 return out;
}

/** Dựng các bước cụ thể từ mẫu: điền tham số, nhúng quy tắc/kỹ năng/lời nhắc đã chọn, gắn đầu ra do người dùng quy định. */
export function expandTemplate(tpl:WorkflowTemplate,values:TemplateValues,refs:TemplateRefs,opts:{prefix?:string;maxPrompt:number}):ConcreteStep[]{
 const params=resolveParams(tpl,values.params);
 const outputText=tpl.output.mode==='fixed'?tpl.output.text:(typeof values.output==='string'?values.output:'').trim();
 if(tpl.output.mode==='ask'&&!outputText)throw Error('Hãy quy định đầu ra cho lần dùng này'+(tpl.output.text?` (gợi ý: ${tpl.output.text.slice(0,200)})`:'')+'.');
 const outFilled=fill(outputText,params).slice(0,2000);
 const prefix=opts.prefix??'';
 const sorted=tpl.steps;
 const id=(raw:string)=>(prefix+raw).slice(0,80);
 const deps=sorted.map((s,i)=>(s.dependsOn??(i?[sorted[i-1]!.id]:[])).map(id));
 const depended=new Set(deps.flat());
 return sorted.map((s,i):ConcreteStep=>{
  const base=fill(s.prompt,params);
  const sections:string[]=[];
  if(s.rules?.length)sections.push('QUY TẮC PHẢI TUÂN THEO:\n'+s.rules.map(k=>{const t=refs.rule(k);if(t===undefined)throw Error(`Không tìm thấy quy tắc “${k}” (khâu “${s.name}”).`);return `- #${k}: ${t}`;}).join('\n'));
  if(s.prompts?.length)sections.push('LỜI NHẮC MẪU ÁP DỤNG:\n'+s.prompts.map(k=>{const t=refs.prompt(k);if(t===undefined)throw Error(`Không tìm thấy lời nhắc mẫu “${k}” (khâu “${s.name}”).`);return t;}).join('\n---\n'));
  const terminal=!depended.has(id(s.id));
  if(terminal&&outFilled){sections.push('ĐẦU RA DO NGƯỜI DÙNG QUY ĐỊNH (bắt buộc đúng):\n'+outFilled);}
  const fixed=[base,...sections].join('\n\n');
  if(fixed.length>opts.maxPrompt)throw Error(`Khâu “${s.name}” sau khi điền tham số dài ${fixed.length} ký tự, vượt giới hạn ${opts.maxPrompt}. Rút gọn prompt, quy tắc hoặc giá trị tham số.`);
  let skillText='';
  if(s.skills?.length){
   const room=opts.maxPrompt-fixed.length-40;
   const parts=s.skills.map(k=>{const t=refs.skill(k);if(t===undefined)throw Error(`Không tìm thấy kỹ năng “${k}” (khâu “${s.name}”).`);return {k,t};});
   const per=Math.floor(room/parts.length);
   skillText='\n\nKỸ NĂNG ÁP DỤNG (làm theo quy trình trong kỹ năng):\n'+parts.map(({k,t})=>per>=300?`## ${k}\n${t.length>per-20?t.slice(0,per-40)+'\n…(đã rút gọn)':t}`:`## ${k} (xem skill “${k}” bằng office_skill_read)`).join('\n\n');
   if(fixed.length+skillText.length>opts.maxPrompt)skillText=skillText.slice(0,Math.max(0,opts.maxPrompt-fixed.length));
  }
  const outputs=[...(s.outputs??[s.name])];
  if(terminal&&outFilled)outputs.push(`${outFilled.split('\n')[0]!.slice(0,150)} — ${s.name}`);
  return {id:id(s.id),name:s.name,resources:s.resources?.map(r=>({...r,id:globalThis.crypto.randomUUID(),body:fill(r.body,params)})),prompt:fixed+skillText,access:s.access,choice:s.choice??'auto',inputs:(s.inputs??['Bối cảnh và yêu cầu đã ghi trong Plan']).map(x=>fill(x,params)),outputs:outputs.map(x=>fill(x,params)),dependsOn:deps[i]!,completion:fill(s.completion??`Hoàn thành khâu “${s.name}” đúng yêu cầu.`,params),onError:fill(s.onError??'Dừng, báo lỗi; chỉ bỏ qua khi người dùng chấp nhận.',params)};
 });
}

/** Tạo mẫu từ các bước đang có (quy trình hoặc Plan) để dùng lại; thầy cô thêm tham số rồi. */
export function templateFromSteps(name:string,steps:{id:string;name:string;prompt:string;resources?:TemplateStep['resources'];access?:'read'|'full';choice?:ModelChoice|'auto';inputs?:string[];outputs?:string[];dependsOn?:string[];completion?:string;onError?:string}[],now=Date.now()):WorkflowTemplate{
 return normalizeTemplate({name,description:'Tạo từ quy trình/Plan đã có. Thêm tham số {{khóa}} vào prompt cho phần thay đổi mỗi lần dùng.',params:[],steps:steps.map((s,i)=>({id:s.id,name:s.name,prompt:s.prompt,resources:s.resources,access:s.access??'read',choice:s.choice,inputs:s.inputs,outputs:s.outputs,dependsOn:s.dependsOn??(i?[steps[i-1]!.id]:[]),completion:s.completion,onError:s.onError})),output:{mode:'ask',text:''}},undefined,now);
}
