import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJson} from '../storage.js';
import type {RefineStatus} from '../types.js';

export const refinePaths=(home:string)=>{
 const dir=path.join(home,'refine');
 return {dir,journal:path.join(dir,'journal.jsonl'),manifest:path.join(dir,'manifest.json'),last:path.join(dir,'last.json'),schedule:path.join(dir,'schedule.json'),lock:path.join(dir,'refine.lock'),cwd:path.join(dir,'cwd'),backup:path.join(dir,'backup'),appLock:path.join(home,'chatbox','app.lock')};
};
export const sha=(text:string)=>crypto.createHash('sha1').update(text).digest('hex').slice(0,16);
export function readJson<T>(file:string,fallback:T):T{try{return JSON.parse(fs.readFileSync(file,'utf8')) as T;}catch{return fallback;}}

/** Dấu vân tay các mục đã biên tập: lần sau chỉ xử lý mục mới hoặc mục đã đổi (cuốn chiếu). */
export interface Manifest{version:1;lastRunAt?:number;schedule?:{key:string;nextAt:number};items:Record<string,{hash:string;fails?:number}>}
export const MAX_FAILS=3;
export function readManifest(home:string):Manifest{
 const m=readJson<Partial<Manifest>>(refinePaths(home).manifest,{});
 return {version:1,schedule:m.schedule&&typeof m.schedule.nextAt==='number'?m.schedule:undefined,lastRunAt:typeof m.lastRunAt==='number'?m.lastRunAt:undefined,items:m.items&&typeof m.items==='object'?m.items:{}};
}
export function writeManifest(home:string,m:Manifest){atomicJson(refinePaths(home).manifest,m);}
export function readLast(home:string):RefineStatus|undefined{const v=readJson<RefineStatus|null>(refinePaths(home).last,null);return v&&typeof v.at==='number'?v:undefined;}
export function writeLast(home:string,s:RefineStatus){atomicJson(refinePaths(home).last,s);}

export type JournalDone={t:'done';at:number;key:string;before:string;after:string|null;result:'updated'|'unchanged'|'dropped'|'failed';note?:string};
export type JournalRow={t:'start';at:number;run:string}|JournalDone;

/** Nhật ký tạm: ghi tới đâu hay tới đó; chạy xong thì xóa. Dòng cuối bị đứt (mất điện) được bỏ qua. */
export class RefineJournal{
 constructor(readonly file:string){}
 exists():boolean{return fs.existsSync(this.file);}
 rows():JournalRow[]{
  if(!this.exists())return [];
  const out:JournalRow[]=[];
  for(const line of fs.readFileSync(this.file,'utf8').split('\n')){if(!line.trim())continue;try{const r=JSON.parse(line);if(r&&(r.t==='start'||r.t==='done'))out.push(r);}catch{/* dòng đứt */}}
  return out;
 }
 private append(row:JournalRow){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});fs.appendFileSync(this.file,JSON.stringify(row)+'\n',{mode:0o600});}
 start(run:string,at:number){this.append({t:'start',at,run});}
 done(row:Omit<JournalDone,'t'>){this.append({t:'done',...row});}
 doneRows():JournalDone[]{return this.rows().filter((r):r is JournalDone=>r.t==='done');}
 clear(){fs.rmSync(this.file,{force:true});}
}
