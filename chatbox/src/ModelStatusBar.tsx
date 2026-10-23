import {t as uiText} from './i18n';
import React,{useEffect,useState} from 'react';
import {effortsFor,findModelInfo,modelsOf,type Effort,type UsageWindow} from '@pvta/shared';
import {rpc,type ViewState,type Preferences} from './ipc';
import type {ProviderUsage} from '@pvta/shared';
import './model-status.css';

const effortNames:Record<Effort,string>={low:uiText("Thấp"),medium:uiText("Vừa"),high:'Cao',xhigh:uiText("Rất cao"),max:uiText("Tối đa"),ultra:uiText("Chuyên sâu")};
function resetIn(ms:number){
 const mins=Math.max(0,Math.round(ms/60000));
 if(mins<60)return `${mins}m`;
 const hours=Math.floor(mins/60),rest=mins%60;
 if(hours<24)return rest?`${hours}h${String(rest).padStart(2,'0')}`:`${hours}h`;
 const days=Math.floor(hours/24),h=hours%24;
 return h?`${days}d ${h}h`:`${days}d`;
}
function Quota({label,window,updatedAt,now,unlimited}:{unlimited?:boolean;label:string;window?:UsageWindow;updatedAt?:number;now:number}){
 const expired=!!window?.resetsAt&&window.resetsAt<=now;
 const known=!expired&&window?.usedPercent!==undefined;
 const remaining=known?Math.max(0,Math.round(100-window!.usedPercent!)):undefined;
 const rejected=!expired&&window?.status==='rejected';
 const countdown=!expired&&window?.resetsAt?resetIn(window.resetsAt-now):'';
 const description=unlimited?uiText("Gói này không áp dụng cửa sổ hạn mức."):expired?uiText("Đã đến thời điểm đặt lại; chờ nguồn AI cập nhật."):known?uiText("Đã dùng {0}%; còn {1}%.",[Math.round(window!.usedPercent!),remaining]):rejected?uiText("Nguồn AI báo đã chạm hạn mức."):uiText("Nguồn AI chưa cung cấp số liệu hạn mức này.");
 const reset=window?.resetsAt?uiText(" Đặt lại: {0}.",[new Date(window.resetsAt).toLocaleString('vi-VN')]):'';
 const recordedAt=window?.updatedAt??updatedAt;
 const recorded=recordedAt?uiText(" Cập nhật: {0}.",[new Date(recordedAt).toLocaleString('vi-VN')]):'';
 return <span tabIndex={0} className={`model-quota ${rejected?'exhausted':''}`} title={`${label}: ${description}${reset}${recorded}`} aria-label={uiText("Hạn mức {0}: {1}",[label,description])}>
  {countdown&&<em className="model-quota-reset" title={`${label}${reset}`.trim()}>{countdown}</em>}<b>{remaining!==undefined?uiText("{0}%",[remaining]):unlimited?uiText("Không áp dụng"):rejected?uiText("Đã hết"):uiText("Chưa có số liệu")}</b>
  {known&&<meter min={0} max={100} value={remaining!} aria-label={uiText("Hạn mức {0} còn lại",[label])}/>}
 </span>;
}

export function ModelStatusBar({state,busy,onModel,onPatch}:{state:ViewState;busy:boolean;onModel:()=>void;onPatch:(patch:Partial<Preferences>)=>void}){
 const pref=state.data.preferences,choice=pref.choice==='auto'?undefined:pref.choice;
 const caps=Object.fromEntries(state.backends.map(backend=>[backend.id,{installed:backend.installed,efforts:backend.efforts}]));
 const info=choice&&choice.backend!=='api'?findModelInfo(modelsOf(state.catalog,choice.backend),choice.model)?.info:undefined;
 const levels=choice?effortsFor(choice.backend,choice.model,caps,state.catalog):[];
 const provider=choice?.backend==='api'?state.api.find(p=>choice.model.startsWith(p.id+'/')):undefined;
 const model=choice?(info?.label??provider?.models.find(m=>`${provider.id}/${m.id}`===choice.model)?.label??choice.model):uiText("Tự động chọn AI");
 const [fetched,setFetched]=useState<{backend:string;usage:ProviderUsage}>(),[fetching,setFetching]=useState(false);
 const source=provider?`api:${provider.id}`:choice?.backend;
 const canFetch=source==='claude'||source==='codex'||source==='api:commandcode';
 const usageRequest={backend:choice?.backend,...(provider?{provider:provider.id}:{})};
 const incoming=source==='claude'||source==='codex'?state.modelUsage?.[source]:undefined;
 const local=fetched&&fetched.backend===source?fetched.usage:undefined;
 const usage=local&&(local.checkedAt??local.updatedAt)>(incoming?.checkedAt??incoming?.updatedAt??0)?local:incoming;
 async function refreshUsage(force=false){
  if(!canFetch||!source)return;
  setFetching(true);
  try{const value=await rpc<ProviderUsage>('providerUsage',{...usageRequest,force});setFetched({backend:source,usage:value});}
  catch(error){setFetched({backend:source,usage:{...incoming,updatedAt:incoming?.updatedAt??Date.now(),checkedAt:Date.now(),error:error instanceof Error?error.message:uiText("Chưa đọc được hạn mức. Bấm làm mới để thử lại.")}});}
  finally{setFetching(false);}
 }
 useEffect(()=>{if(!canFetch||!source)return;let alive=true,pending=false;const refresh=async()=>{if(pending||document.visibilityState==='hidden')return;pending=true;try{const value=await rpc<ProviderUsage>('providerUsage',usageRequest);if(alive)setFetched({backend:source,usage:value});}catch(error){if(alive)setFetched({backend:source,usage:{...incoming,updatedAt:Date.now(),checkedAt:Date.now(),error:error instanceof Error?error.message:uiText("Chưa đọc được hạn mức.")}});}finally{pending=false;}};void refresh();const timer=setInterval(()=>void refresh(),120000);const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);};},[source,provider?.baseUrl]);
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60_000);return()=>clearInterval(timer);},[]);
 const speedViaEffort=choice?.backend==='api'&&levels.length>1;
 const effort=pref.effort&&levels.includes(pref.effort)?pref.effort:'';
 return <div className="composer-footer model-status-bar" aria-label={uiText("Model và hạn mức")}>
  <button className="model-control" title={`${provider?.label??choice?.backend??uiText("Tự động")} · ${model}`} onClick={onModel}><span className="model-dot"/><span className="model-name">{model}</span><small>⌄</small></button>
  <div className="model-status-controls">
   <label className="model-setting" title={!choice?uiText("Chọn model để đặt mức suy nghĩ."):levels.length?uiText("Mức suy nghĩ do nguồn AI hỗ trợ."):uiText("Model này chưa công bố tùy chọn mức suy nghĩ.")}><span>{uiText("Suy nghĩ")}</span><select aria-label={uiText("Mức suy nghĩ của model")} disabled={busy||!levels.length} value={effort} onChange={e=>onPatch({effort:e.target.value?e.target.value as Effort:null})}><option value="">{levels.length?'Theo model':choice?uiText("Nguồn chưa hỗ trợ"):uiText("Chọn model")}</option>{levels.map(level=><option key={level} value={level}>{effortNames[level]}</option>)}</select></label>
   <label className="model-setting" title={info?.fast?(info.fastNote??uiText("Chọn tốc độ được model hỗ trợ.")):uiText("Nguồn này chưa cung cấp chế độ tốc độ riêng; mức suy nghĩ thấp thường trả lời nhanh hơn.")}><span>{uiText("Tốc độ")}</span>{speedViaEffort?<select aria-label={uiText("Tốc độ của model")} title={uiText("Nhanh/Kỹ điều chỉnh mức suy nghĩ, không phải bậc ưu tiên của nhà cung cấp. Thời gian thực tế tùy nguồn AI.")} disabled={busy} value={!effort?'default':effort===levels[0]?'fast':effort===levels.at(-1)?'thorough':'balanced'} onChange={e=>onPatch({effort:e.target.value==='fast'?levels[0]:e.target.value==='thorough'?levels.at(-1):e.target.value==='balanced'?levels[Math.floor(levels.length/2)]:null})}><option value="default">Theo model</option><option value="fast">{uiText("Nhanh · ít suy nghĩ")}</option><option value="balanced">{uiText("Cân bằng")}</option><option value="thorough">{uiText("Kỹ · nhiều suy nghĩ")}</option></select>:!info?.fast?<span className="model-source-setting">{uiText("Theo nguồn")}</span>:<select aria-label={uiText("Tốc độ của model")} disabled={busy||!info?.fast} value={info?.fast&&choice?.speed?'fast':'normal'} onChange={e=>{if(choice&&info?.fast)onPatch({choice:{...choice,speed:e.target.value==='fast'?(info.fastTier??'fast'):undefined}});}}><option value="normal">{uiText("Thường")}</option><option value="fast">Nhanh</option></select>}</label>
   <div className="model-quotas" aria-label={uiText("Hạn mức từ nguồn AI")}><Quota label="5h" window={usage?.fiveHour} updatedAt={usage?.updatedAt} now={now} unlimited={usage?.unlimited}/><Quota label={uiText("Tuần")}window={usage?.week} updatedAt={usage?.updatedAt} now={now} unlimited={usage?.unlimited}/>{canFetch&&<button className="quota-refresh" aria-label={uiText("Làm mới hạn mức AI")} disabled={fetching} title={usage?.error??uiText("Đọc hạn mức trực tiếp từ phiên đăng nhập của nguồn AI")} onClick={()=>void refreshUsage(true)}>{fetching?'◌':'↻'}</button>}{(!canFetch||usage?.error)&&<span className="quota-fetch-note" title={usage?.error??uiText("Nguồn này chưa có kết nối đọc hạn mức tự động.")} role="status">{canFetch?uiText("Chưa cập nhật"):uiText("Nguồn chưa hỗ trợ")}</span>}</div>
  </div>
 </div>;
}
