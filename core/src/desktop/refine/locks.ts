import fs from 'node:fs';
import path from 'node:path';
import {refinePaths} from './files.js';

export function pidAlive(pid:number):boolean{
 if(!Number.isInteger(pid)||pid<=0)return false;
 try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code==='EPERM';}
}
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

/** PVTA đang mở: tiến trình còn sống và nhịp tim (thời điểm sửa tệp khóa) còn mới. */
export function appRunning(home:string,now=Date.now(),maxAgeMs=90_000):boolean{
 const file=refinePaths(home).appLock;
 try{const st=fs.statSync(file);const pid=Number(JSON.parse(fs.readFileSync(file,'utf8')).pid);return pidAlive(pid)&&now-st.mtimeMs<maxAgeMs;}catch{return false;}
}
/** Ứng dụng ghi khóa khi chạy và làm mới mỗi 20 giây; biên tập nền nhìn khóa này để biết có phải nhường không. */
export function holdAppLock(home:string,pid=process.pid,beatMs=20_000):()=>void{
 const file=refinePaths(home).appLock;
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 fs.writeFileSync(file,JSON.stringify({pid,at:Date.now()}),{mode:0o600});
 const timer=setInterval(()=>{try{const now=new Date();fs.utimesSync(file,now,now);}catch{try{fs.writeFileSync(file,JSON.stringify({pid,at:Date.now()}),{mode:0o600});}catch{/* ổ đĩa lỗi: bỏ qua */}}},beatMs);
 timer.unref?.();
 let released=false;
 return ()=>{if(released)return;released=true;clearInterval(timer);try{const cur=JSON.parse(fs.readFileSync(file,'utf8'));if(cur.pid===pid)fs.rmSync(file,{force:true});}catch{/* đã mất */}};
}

export function acquireRefineLock(home:string,pid=process.pid,now=Date.now()):boolean{
 const file=refinePaths(home).lock;fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 for(let attempt=0;attempt<2;attempt++){
  try{fs.writeFileSync(file,JSON.stringify({pid,at:now}),{flag:'wx',mode:0o600});return true;}
  catch(e){
   if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
   try{const cur=JSON.parse(fs.readFileSync(file,'utf8'));if(pidAlive(Number(cur.pid)))return false;}catch{/* khóa hỏng: coi như cũ */}
   fs.rmSync(file,{force:true});
  }
 }
 return false;
}
export function refineRunning(home:string):boolean{
 try{const lock=JSON.parse(fs.readFileSync(refinePaths(home).lock,'utf8'));return pidAlive(Number(lock.pid));}catch{return false;}
}
export function releaseRefineLock(home:string,pid=process.pid){
 const file=refinePaths(home).lock;
 try{const cur=JSON.parse(fs.readFileSync(file,'utf8'));if(cur.pid===pid)fs.rmSync(file,{force:true});}catch{/* không có */}
}
/** Gọi lúc PVTA mở: nếu biên tập nền đang chạy thì xin dừng và chờ ngắn để không giành ghi dữ liệu. */
export async function stopRefiner(home:string,waitMs=4000):Promise<boolean>{
 const file=refinePaths(home).lock;let pid=0;
 try{pid=Number(JSON.parse(fs.readFileSync(file,'utf8')).pid);}catch{return false;}
 if(!pidAlive(pid)||pid===process.pid)return false;
 try{process.kill(pid,'SIGTERM');}catch{return false;}
 const end=Date.now()+waitMs;while(Date.now()<end&&pidAlive(pid))await sleep(100);
 return true;
}
