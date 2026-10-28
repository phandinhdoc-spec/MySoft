import type {ProviderUsage} from '@pvta/shared';
import {safeJson} from './backends/types.js';
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
const timestamp=(value:unknown)=>{const n=number(value);return n!==undefined&&n>0&&n<10_000_000_000?n*1000:undefined;};
const percent=(value:unknown)=>{const n=number(value);return n!==undefined&&n>=0&&n<=100?n:undefined;};

/** No polling or credential access: consume only quota telemetry from the running CLI. */
export function parseProviderUsage(backend:string,line:string,now=Date.now()):ProviderUsage|undefined{
 const event=safeJson(line);if(!event)return;
 const usage:ProviderUsage={updatedAt:now};
 if(backend==='claude'&&event.type==='rate_limit_event'){
  const info=event.rate_limit_info;if(!info||typeof info!=='object')return;
  const type=info.rateLimitType??info.rate_limit_type;
  const key=type==='five_hour'?'fiveHour':type==='seven_day'?'week':undefined;if(!key)return;
  const fraction=number(info.utilization);
  const usedPercent=fraction!==undefined&&fraction>=0&&fraction<=1?fraction*100:undefined;
  const status=info.status==='allowed_warning'?'warning':['allowed','rejected'].includes(info.status)?info.status:undefined;
  const resetsAt=timestamp(info.resetsAt??info.resets_at);
  if(usedPercent===undefined&&status===undefined&&resetsAt===undefined)return;
  usage[key]={usedPercent,resetsAt,status,updatedAt:now};
 }else if(backend==='codex'){
  const raw=event.rate_limits??event.msg?.rate_limits??event.payload?.rate_limits??event.params?.rateLimits;
  if(!raw||typeof raw!=='object')return;
  for(const window of [raw.primary,raw.secondary]){
   if(!window||typeof window!=='object')continue;
   const minutes=number(window.window_minutes??window.windowDurationMins)??((number(window.limit_window_seconds)??0)/60);
   const key=minutes===300?'fiveHour':minutes===10080?'week':undefined;if(!key)continue;
   const usedPercent=percent(window.used_percent??window.usedPercent),resetsAt=timestamp(window.resets_at??window.resetsAt);
   if(usedPercent!==undefined||resetsAt!==undefined)usage[key]={usedPercent,resetsAt,updatedAt:now};
  }
 }else if(backend==='agy'){
  return parseUsageSnapshot('agy',event,now);
 }else return;
 return usage.fiveHour||usage.week?usage:undefined;
}

/** The /usage control reply uses percent units (unlike stream-event fractions). */
export function parseUsageSnapshot(backend:string,value:unknown,now=Date.now(),model?:string):ProviderUsage|undefined{
 if(!value||typeof value!=='object')return;
 const raw=value as Record<string,any>;
 if(backend==='claude'){
  const limits=raw.rate_limits;if(!limits||typeof limits!=='object')return;
  const result:ProviderUsage={updatedAt:now};
  for(const [field,key] of [['five_hour','fiveHour'],['seven_day','week']] as const){
   const item=limits[field];if(!item||typeof item!=='object')continue;
   const usedPercent=percent(item.utilization);
   const reset=typeof item.resets_at==='string'?Date.parse(item.resets_at):timestamp(item.resets_at);
   const resetsAt=reset!==undefined&&Number.isFinite(reset)?reset:undefined;
   if(usedPercent!==undefined||resetsAt!==undefined)result[key]={usedPercent,resetsAt,updatedAt:now};
  }
  return result.fiveHour||result.week?result:undefined;
 }
 if(backend==='agy'){
  const data=raw.command?.data??raw.result?.command?.data??raw.data??raw;
  const groups=Array.isArray(data?.groups)?(data.groups as Record<string,any>[]):[];
  const thirdParty=!!model&&/^(claude|gpt)/i.test(model);
  const group=groups.find(g=>thirdParty?(/claude|gpt/i.test(String(g?.name??''))||(Array.isArray(g?.buckets)&&g.buckets.some((b:any)=>String(b?.id??'').startsWith('3p-')))):(/gemini/i.test(String(g?.name??''))||(Array.isArray(g?.buckets)&&g.buckets.some((b:any)=>String(b?.id??'').startsWith('gemini-')))))??groups[0];
  const buckets=Array.isArray(group?.buckets)?group.buckets:Array.isArray(data?.buckets)?data.buckets:[];
  const result:ProviderUsage={updatedAt:now};
  for(const b of buckets){
   if(!b||typeof b!=='object')continue;
   const w=String(b.window??b.id??b.name??'').toLowerCase();
   const key=w==='5h'||w.endsWith('-5h')||/five\s*hour|5\s*h/.test(w)?'fiveHour':w==='weekly'||w.endsWith('-weekly')||/week/.test(w)?'week':undefined;
   if(!key)continue;
   const rem=number(b.remaining_fraction??b.remainingFraction);
   const usedPercent=rem!==undefined&&rem>=0&&rem<=1?(1-rem)*100:percent(b.used_percent??b.usedPercent);
   const resetRaw=b.reset_time??b.resetTime??b.resets_at??b.resetsAt;
   const reset=typeof resetRaw==='string'?Date.parse(resetRaw):timestamp(resetRaw);
   const resetsAt=reset!==undefined&&Number.isFinite(reset)?reset:undefined;
   const status=b.disabled===true||(rem!==undefined&&rem<=0)?'rejected':undefined;
   if(usedPercent!==undefined||resetsAt!==undefined||status!==undefined)result[key]={usedPercent,resetsAt,...(status?{status}:{}),updatedAt:now};
  }
  return result.fiveHour||result.week?result:undefined;
 }
 if(backend==='codex')return parseProviderUsage('codex',JSON.stringify({rate_limits:raw.rateLimits??raw.rate_limits}),now);
}
