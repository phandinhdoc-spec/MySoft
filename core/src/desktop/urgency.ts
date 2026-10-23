import {execFile} from 'node:child_process';
import os from 'node:os';

/**
 * Cờ việc gấp: điều tiết số bước Quy trình chạy cùng lúc theo CPU/RAM và áp lực bộ nhớ.
 * Cờ xanh giữ cấu hình của từng quy trình; cờ đỏ tính theo máy, có trần.
 * Áp lực RAM chạm mức vàng (cảnh báo) trở lên thì không mở thêm bước song song:
 * bước đang chạy vẫn chạy tiếp, chỉ không ép thêm.
 */
export type MemoryPressure='normal'|'warn'|'critical'|'unknown';
/** limit: số bước song song tối đa hiện tại; 0 = theo cấu hình từng quy trình (cờ xanh, RAM ổn). */
export interface UrgencyView{urgent:boolean;until?:number;pressure:MemoryPressure;limit:number;note:string}

export const URGENT_MAX=8;
export const URGENT_MINUTES=30;
const STEP_BYTES=600*1024**2;
const RESERVE_BYTES=1.5*1024**3;
const SAMPLE_MS=3000;
const BACKOFF_MS=5*60_000;

/** macOS: kern.memorystatus_vm_pressure_level là chỉ số Activity Monitor dùng (1 xanh, 2 vàng, 4 đỏ). */
export function parseMacPressure(raw:string):MemoryPressure{
 const n=Number(String(raw).trim());
 return n===1?'normal':n===2?'warn':n===4?'critical':'unknown';
}
/** Hệ khác: ước lượng từ RAM còn trống. */
export function pressureFromFree(free:number,total:number):MemoryPressure{
 if(!(total>0)||!(free>=0))return 'unknown';
 const r=free/total;
 return r<0.08?'critical':r<0.15?'warn':'normal';
}
export function readMacPressure():Promise<MemoryPressure>{
 return new Promise(resolve=>{
  execFile('/usr/sbin/sysctl',['-n','kern.memorystatus_vm_pressure_level'],{timeout:2000},(err,out)=>resolve(err?'unknown':parseMacPressure(String(out))));
 });
}
export function readPressure(platform:string=process.platform):Promise<MemoryPressure>{
 return platform==='darwin'?readMacPressure():Promise.resolve(pressureFromFree(os.freemem(),os.totalmem()));
}
const strained=(p:MemoryPressure)=>p==='warn'||p==='critical';

/** Số bước tối đa khi cờ đỏ. macOS dùng tổng RAM vì "RAM trống" trên Mac luôn thấp do bộ đệm; áp lực bộ nhớ là phanh chính. */
export function urgentLimit(o:{cpus:number;total:number;free:number;platform:string;pressure:MemoryPressure;backoff?:number}){
 if(strained(o.pressure))return 1;
 const cpuCap=Math.max(1,o.cpus-1);
 const room=o.platform==='darwin'?o.total*0.3:o.free-RESERVE_BYTES;
 const ramCap=Math.max(1,Math.floor(room/STEP_BYTES));
 let n=Math.max(1,Math.min(URGENT_MAX,cpuCap,ramCap));
 for(let i=0;i<(o.backoff??0);i++)n=Math.max(1,Math.floor(n/2));
 return n;
}
/** Cờ xanh: giữ đúng số bước quy trình đã đặt (1–4), trừ khi RAM đang căng. */
export function normalLimit(requested:number,pressure:MemoryPressure){
 const n=Math.max(1,Math.min(4,Math.floor(requested)||1));
 return strained(pressure)?1:n;
}
export function isRateLimit(message:string){return /\b429\b|rate.?limit|too many requests|quá nhiều yêu cầu|vượt hạn mức/i.test(message);}

export interface UrgencyOptions{changed():void;now?:()=>number;sample?:()=>Promise<MemoryPressure>;cpus?:()=>number;total?:()=>number;free?:()=>number;platform?:string}
export class UrgencyGovernor{
 private urgent=false;private until=0;private backoff=0;private backoffUntil=0;private used=false;
 private pressure:MemoryPressure='unknown';private sampledAt=0;private sampling?:Promise<MemoryPressure>;
 private timer?:ReturnType<typeof setTimeout>;private lastLimit=1;
 constructor(private o:UrgencyOptions){}
 private now(){return this.o.now?.()??Date.now();}
 private machine(){return {cpus:this.o.cpus?.()??(os.availableParallelism?.()??os.cpus().length),total:this.o.total?.()??os.totalmem(),free:this.o.free?.()??os.freemem(),platform:this.o.platform??process.platform};}
 isUrgent(){this.expire();return this.urgent;}
 set(on:boolean,minutes=URGENT_MINUTES){
  if(this.timer){clearTimeout(this.timer);this.timer=undefined;}
  this.urgent=on;this.used=false;this.backoff=0;
  if(on){
   const ms=Math.max(1,Math.min(180,minutes))*60_000;this.until=this.now()+ms;
   this.timer=setTimeout(()=>{this.timer=undefined;this.set(false);},ms);this.timer.unref?.();
  }else this.until=0;
  this.o.changed();return this.view();
 }
 private expire(){if(this.urgent&&this.now()>=this.until)this.set(false);if(this.backoff&&this.now()>=this.backoffUntil)this.backoff=0;}
 async samplePressure(){
  if(this.now()-this.sampledAt<SAMPLE_MS&&this.pressure!=='unknown')return this.pressure;
  this.sampling??=(this.o.sample??(()=>readPressure(this.o.platform)))().catch(()=>'unknown' as MemoryPressure).finally(()=>{this.sampling=undefined;});
  const before=this.pressure;this.pressure=await this.sampling;this.sampledAt=this.now();
  if(before!==this.pressure)this.o.changed();
  return this.pressure;
 }
 /** Gọi trước mỗi lần mở bước mới. */
 async limit(requested:number){
  this.expire();
  const pressure=await this.samplePressure();
  const n=this.urgent?urgentLimit({...this.machine(),pressure,backoff:this.backoff}):normalLimit(requested,pressure);
  if(this.urgent)this.used=true;
  if(n!==this.lastLimit){this.lastLimit=n;this.o.changed();}
  return n;
 }
 /** Nhà cung cấp báo quá nhiều yêu cầu: giảm một nửa trong 5 phút. */
 rateLimited(){this.backoff=Math.min(3,this.backoff+1);this.backoffUntil=this.now()+BACKOFF_MS;this.o.changed();}
 /** Hết việc đang chạy: cờ đỏ đã được dùng thì tự về xanh. */
 idle(){if(this.urgent&&this.used)this.set(false);}
 view():UrgencyView{
  this.expire();
  // limit = 0 khi cờ xanh và RAM ổn: theo cấu hình từng quy trình.
  const p=this.pressure,limit=this.urgent?urgentLimit({...this.machine(),pressure:p,backoff:this.backoff}):strained(p)?1:0;
  const brake=strained(p)?' Áp lực RAM đang ở mức '+(p==='warn'?'vàng':'đỏ')+': không mở thêm bước song song.':'';
  const note=this.urgent?`Cờ đỏ: việc gấp, tối đa ${limit} bước Quy trình chạy song song.${this.backoff?' Đang giảm vì nhà cung cấp báo quá nhiều yêu cầu.':''}${brake}`:`Cờ xanh: chạy mặc định theo cấu hình từng quy trình.${brake}`;
  return {urgent:this.urgent,...(this.urgent?{until:this.until}:{}),pressure:p,limit,note};
 }
 dispose(){if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
}
