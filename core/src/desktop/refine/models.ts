import {API_PROVIDER_IDS,API_PROVIDERS,modelsOf,type ApiProvider,type ModelCatalog,type ModelChoice} from '@pvta/shared';
import type {RefineSettings} from '../types.js';

export interface Candidate{choice:ModelChoice;label:string;tier:1|2|3|4}
export interface ChainInput{
 backends:{id:'agy'|'claude'|'codex';installed:boolean;auth:'ready'|'missing'|'unknown'}[];
 catalog:ModelCatalog;
 api:{id:ApiProvider;configured:boolean;model?:string;models:{id:string;label?:string}[]}[];
}
const SONNET=/sonnet/i;
/** Bản nhẹ/nhanh: không đủ sâu để biên tập chặt chẽ. */
const WEAK=/flash|(^|[^a-z])mini($|[^a-z])|nano|(^|[^a-z])lite($|[^a-z])|haiku|small|tiny|instant|(^|[^a-z])fast($|[^a-z])/i;
/** Họ model cùng đẳng cấp Sonnet trở lên. */
const EQUIVALENT=/opus|sonnet|gpt-5|gemini[\w.-]*pro|\bpro\b|deepseek|kimi|glm|qwen[\w.-]*(max|plus)/i;
const usable=(b:ChainInput['backends'][number]|undefined)=>!!b&&b.installed&&b.auth!=='missing';
const text=(m:{id:string;label?:string})=>`${m.id} ${m.label??''}`;

/**
 * Thứ tự chọn model biên tập nền:
 * 1) Sonnet của agy; 2) Sonnet của CommandCode; 3) Claude (Sonnet); 4) model khác cùng đẳng cấp Sonnet.
 * Trả về cả các bậc sau để gặp lỗi thì dùng bậc kế tiếp.
 */
export function refineChain(i:ChainInput):Candidate[]{
 const out:Candidate[]=[];const seen=new Set<string>();
 const add=(choice:ModelChoice,label:string,tier:Candidate['tier'])=>{const key=`${choice.backend}/${choice.model}`;if(seen.has(key))return;seen.add(key);out.push({choice,label,tier});};
 const agy=i.backends.find(b=>b.id==='agy');const agyModels=usable(agy)?modelsOf(i.catalog,'agy'):[];
 for(const m of agyModels)if(SONNET.test(text(m)))add({backend:'agy',model:m.id},`agy · ${m.label??m.id}`,1);
 const cc=i.api.find(a=>a.id==='commandcode');const ccModels=cc?.configured?cc.models:[];
 const ccChoice=(m:{id:string})=>({backend:'api' as const,model:m.id.startsWith('commandcode/')?m.id:`commandcode/${m.id}`});
 for(const m of ccModels)if(SONNET.test(text(m)))add(ccChoice(m),`CommandCode · ${m.label??m.id}`,2);
 const claude=i.backends.find(b=>b.id==='claude');
 if(usable(claude))add({backend:'claude',model:'sonnet'},'Claude · Sonnet',3);
 for(const m of agyModels)if(EQUIVALENT.test(text(m))&&!WEAK.test(text(m)))add({backend:'agy',model:m.id},`agy · ${m.label??m.id}`,4);
 for(const m of ccModels)if(EQUIVALENT.test(text(m))&&!WEAK.test(text(m)))add(ccChoice(m),`CommandCode · ${m.label??m.id}`,4);
 for(const id of API_PROVIDER_IDS){
  if(id==='commandcode'||id==='compatible')continue;
  const a=i.api.find(x=>x.id===id);if(!a?.configured)continue;
  const info=API_PROVIDERS[id];
  const pool=[...(a.model?[{id:a.model}]:[]),...(a.models.length?a.models:info.models)];
  const pick=pool.find(m=>!WEAK.test(text(m))&&EQUIVALENT.test(text(m)))??pool.find(m=>!WEAK.test(text(m))&&m.id===info.defaultModel);
  if(pick)add({backend:'api',model:`${id}/${pick.id}`},`${info.label} · ${(pick as {label?:string}).label??pick.id}`,4);
 }
 const codex=i.backends.find(b=>b.id==='codex');
 if(usable(codex))add({backend:'codex',model:'default'},'Codex · mặc định',4);
 return out;
}
/** Thầy cô chọn model riêng thì chỉ dùng model đó; để Tự động thì đi theo chuỗi ưu tiên. */
export function chainFor(settings:RefineSettings,input:ChainInput):Candidate[]{
 if(settings.model!=='auto')return [{choice:settings.model,label:`${settings.model.backend} · ${settings.model.model}`,tier:1}];
 return refineChain(input);
}
