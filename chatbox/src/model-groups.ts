import {t as uiText} from './i18n';
import {modelsOf,type ModelChoice} from '@pvta/shared';
import type {ViewState} from './ipc';

/** Khóa ô chọn: "auto" hoặc "backend|model". */
export const choiceKey=(c:ModelChoice|'auto'|undefined)=>!c||c==='auto'?'auto':`${c.backend}|${c.model}`;
export const parseKey=(k:string):ModelChoice|'auto'=>{if(k==='auto')return 'auto';const i=k.indexOf('|');return {backend:k.slice(0,i),model:k.slice(i+1)} as ModelChoice;};

/** Danh sách model gom theo nguồn (chỉ backend đã cài và API đã cấu hình), dùng cho ô chọn model. */
export function modelGroups(state:ViewState){
 const groups:{label:string;items:{key:string;label:string}[]}[]=[];
 for(const [b,label] of [['agy','Gemini · agy'],['claude','Claude'],['codex','Codex']] as const){
  if(!state.backends?.find(x=>x.id===b)?.installed)continue;
  groups.push({label,items:modelsOf(state.catalog,b).map(m=>({key:`${b}|${m.id}`,label:m.label??m.id}))});
 }
 const cc=state.api?.find(a=>a.id==='commandcode');
 if(cc?.configured)groups.push({label:'CommandCode',items:cc.models.map(m=>({key:`api|commandcode/${m.id}`,label:m.label??m.id}))});
 const others=(state.api??[]).filter(a=>a.id!=='commandcode'&&a.configured).flatMap(a=>a.models.map(m=>({key:`api|${a.id}/${m.id}`,label:`${a.label} · ${m.label??m.id}`})));
 if(others.length)groups.push({label:uiText("API khác"),items:others});
 return groups;
}
