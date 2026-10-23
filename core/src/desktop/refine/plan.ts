import type {RefineSettings} from '../types.js';
import {readManifest,writeManifest,MAX_FAILS,sha,type JournalDone,type Manifest} from './files.js';

export interface SkillInfo{name:string;md:string}
export interface PlanItem{key:string;kind:'skill'|'rule';hash:string;ref:string}
export interface Plan{skills:PlanItem[];rules:PlanItem[]}

/** Hết hạn chưa: đã qua giờ hẹn hôm nay và đủ số ngày kể từ lần chạy trước. */
export function isDue(now:number,time:string,everyDays:number,lastRunAt?:number):boolean{
 const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);if(!m)return false;
 const start=new Date(now);start.setHours(Number(m[1]),Number(m[2]),0,0);
 if(now<start.getTime())return false;
 if(lastRunAt===undefined)return true;
 const day=(t:number)=>{const d=new Date(t);return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86_400_000);};
 return day(now)-day(lastRunAt)>=everyDays;
}
/** Mục đã xử lý trong lần chạy dở (theo nhật ký) với đúng nội dung hiện tại thì bỏ qua. */
function handled(rows:Map<string,JournalDone>,key:string,hash:string):boolean{
 const r=rows.get(key);return !!r&&(r.after===hash||r.before===hash);
}
/**
 * Lập danh sách việc: chỉ kỹ năng `learned-*` và sở thích đã học MỚI hoặc ĐÃ ĐỔI so với lần biên tập trước (cuốn chiếu).
 * Mục lỗi liên tiếp MAX_FAILS lần được để yên cho tới khi nội dung đổi.
 */
export function buildPlan(i:{skills:SkillInfo[];learned:{id:string;rule:string}[];manifest:Manifest;journal:JournalDone[]}):Plan{
 const rows=new Map<string,JournalDone>();for(const r of i.journal)rows.set(r.key,r);
 const need=(key:string,hash:string)=>{
  const m=i.manifest.items[key];
  if(m?.hash===hash){if(!m.fails)return false;if(m.fails>=MAX_FAILS)return false;}
  return !handled(rows,key,hash);
 };
 const skills:PlanItem[]=i.skills.filter(s=>/^learned-[a-z0-9-]{1,40}$/.test(s.name)).map(s=>({key:`skill:${s.name}`,kind:'skill' as const,hash:sha(s.md),ref:s.name})).filter(x=>need(x.key,x.hash));
 const rules:PlanItem[]=i.learned.map(l=>({key:`rule:${l.id}`,kind:'rule' as const,hash:sha(l.rule),ref:l.id})).filter(x=>need(x.key,x.hash));
 return {skills,rules};
}

/** Calendar dates preserve the configured local hour across daylight-saving changes. */
export function advanceSchedule(at:number,time:string,everyDays:number):number{
 const d=new Date(at);d.setDate(d.getDate()+everyDays);const [h,m]=time.split(':').map(Number);d.setHours(h!,m!,0,0);return d.getTime();
}
/** Persist the cadence independently of manual runs. Migrate the old last-run anchor once. */
export function ensureRefineSchedule(home:string,s:RefineSettings,now=Date.now()):number{
 const manifest=readManifest(home);const key=`${s.time}/${s.everyDays}`;
 if(manifest.schedule?.key===key)return manifest.schedule.nextAt;
 const d=new Date(now);const [h,m]=s.time.split(':').map(Number);d.setHours(h!,m!,0,0);
 const nextAt=!manifest.schedule&&manifest.lastRunAt!==undefined?advanceSchedule(manifest.lastRunAt,s.time,s.everyDays):d.getTime();
 manifest.schedule={key,nextAt};writeManifest(home,manifest);return nextAt;
}
export function scheduledView(at:number,s:RefineSettings,now=Date.now()):{nextAt:number;missedAt?:number}{
 let nextAt=at;while(nextAt<=now)nextAt=advanceSchedule(nextAt,s.time,s.everyDays);
 return {nextAt,...(at<=now?{missedAt:at}:{})};
}
export function completeSchedule(home:string,s:RefineSettings,now=Date.now()){
 const m=readManifest(home);if(m.schedule?.key!==`${s.time}/${s.everyDays}`)return;
 while(m.schedule.nextAt<=now)m.schedule.nextAt=advanceSchedule(m.schedule.nextAt,s.time,s.everyDays);
 writeManifest(home,m);
}
