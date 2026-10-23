import os from 'node:os';
import fs from 'node:fs';
import {execFile} from 'node:child_process';

export interface IdleThresholds{maxCpu:number;minFreeRatio:number;minFreeBytes:number}
/** Máy "rảnh": CPU dưới 40%, bộ nhớ còn dùng được tối thiểu 20% và 1,5 GiB. */
export const DEFAULT_IDLE:IdleThresholds={maxCpu:0.4,minFreeRatio:0.2,minFreeBytes:1.5*2**30};
export type CpuSample={idle:number;total:number}[];
export const snapshotCpu=():CpuSample=>os.cpus().map(c=>{const t=c.times;return {idle:t.idle,total:t.user+t.nice+t.sys+t.idle+t.irq};});
/** Tỷ lệ CPU bận giữa hai lần lấy mẫu (0..1). */
export function cpuUsage(a:CpuSample,b:CpuSample):number{
 let idle=0,total=0;const n=Math.min(a.length,b.length);
 for(let i=0;i<n;i++){idle+=b[i]!.idle-a[i]!.idle;total+=b[i]!.total-a[i]!.total;}
 return total>0?Math.min(1,Math.max(0,1-idle/total)):0;
}
export async function sampleCpu(ms=1000,snap:()=>CpuSample=snapshotCpu,sleep=(t:number)=>new Promise<void>(r=>setTimeout(r,t))):Promise<number>{const a=snap();await sleep(ms);return cpuUsage(a,snap());}

/** Linux: MemAvailable trong /proc/meminfo (kB → byte). */
export function parseMemAvailable(meminfo:string):number|undefined{const m=/^MemAvailable:\s+(\d+)\s*kB/im.exec(meminfo);return m?Number(m[1])*1024:undefined;}
/** macOS: vm_stat; bộ nhớ dùng được ≈ free + inactive + speculative + purgeable. */
export function parseVmStat(out:string):number|undefined{
 const size=/page size of (\d+) bytes/i.exec(out);if(!size)return undefined;
 const pages=(label:string)=>{const m=new RegExp(`^Pages ${label}:\\s+(\\d+)\\.`,'im').exec(out);return m?Number(m[1]):0;};
 const total=pages('free')+pages('inactive')+pages('speculative')+pages('purgeable');
 return total>0?total*Number(size[1]):undefined;
}
const run=(cmd:string,args:string[])=>new Promise<string>(resolve=>execFile(cmd,args,{timeout:5000},(e,out)=>resolve(e?'':String(out))));
export async function availableMemory(platform:NodeJS.Platform=process.platform):Promise<{free:number;total:number}>{
 const total=os.totalmem();let free:number|undefined;
 if(platform==='linux'){try{free=parseMemAvailable(fs.readFileSync('/proc/meminfo','utf8'));}catch{/* dùng os.freemem */}}
 else if(platform==='darwin')free=parseVmStat(await run('vm_stat',[]));
 return {free:free??os.freemem(),total};
}
export interface IdleReport{idle:boolean;cpu:number;freeRatio:number;freeBytes:number;reason?:string}
export function judgeIdle(cpu:number,mem:{free:number;total:number},th:IdleThresholds=DEFAULT_IDLE):IdleReport{
 const freeRatio=mem.total>0?mem.free/mem.total:0;
 const reasons:string[]=[];
 if(cpu>th.maxCpu)reasons.push(`CPU đang bận ${Math.round(cpu*100)}%`);
 if(freeRatio<th.minFreeRatio||mem.free<th.minFreeBytes)reasons.push(`RAM còn trống ít (${Math.round(freeRatio*100)}%)`);
 return {idle:reasons.length===0,cpu,freeRatio,freeBytes:mem.free,reason:reasons.join('; ')||undefined};
}
export async function checkIdle(th=DEFAULT_IDLE):Promise<IdleReport>{
 const cpu=await sampleCpu();const mem=await availableMemory();return judgeIdle(cpu,mem,th);
}
/** Chờ tới khi máy rảnh. Trả false nếu hết thời gian chờ hoặc bị hủy; khi đó lần sau chạy tiếp từ nhật ký. */
export async function waitUntilIdle(o:{signal:AbortSignal;pollMs?:number;maxWaitMs?:number;check?:()=>Promise<IdleReport>;sleep?:(ms:number)=>Promise<void>;now?:()=>number}):Promise<boolean>{
 const check=o.check??(()=>checkIdle());const sleep=o.sleep??(ms=>new Promise<void>(r=>setTimeout(r,ms)));const now=o.now??Date.now;
 const end=now()+(o.maxWaitMs??20*60_000);
 for(;;){
  if(o.signal.aborted)return false;
  if((await check()).idle)return true;
  if(now()>=end)return false;
  await sleep(o.pollMs??30_000);
 }
}
