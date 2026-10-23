import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {readJson,refinePaths,sha} from './files.js';
import {atomicJson} from '../storage.js';

/**
 * Bộ lập lịch của hệ điều hành gọi `pvta-core --refine` MỖI GIỜ và khi đăng nhập.
 * Mỗi lần gọi, trình biên tập tự kiểm tra: tới giờ hẹn chưa, đủ tần suất chưa, PVTA có đang mở không, máy có rảnh không;
 * không thỏa thì thoát ngay (rất nhẹ). Nhờ vậy cũng bù được những lần máy tắt đúng giờ hẹn và chạy tiếp phần dở.
 */
export interface SchedulePlan{exec:string;args:string[]}
export interface ScheduleResult{registered:boolean;error?:string}
export type Runner=(cmd:string,args:string[],input?:string)=>Promise<{code:number;out:string}>;
export const LABEL='vn.pvta.refine';

/** Lệnh gọi lại chính chương trình này ở chế độ biên tập. Chỉ có trong bản đã cài (pkg) hoặc bản build pvta-core.cjs; khi chạy thử từ mã nguồn thì không đăng ký. */
export function schedulePlan(argv=process.argv,execPath=process.execPath,packaged=!!(process as {pkg?:unknown}).pkg):SchedulePlan|undefined{
 if(packaged)return {exec:execPath,args:['--refine']};
 const script=path.resolve(argv[1]??'');
 return /pvta-core\.cjs$/.test(script)?{exec:execPath,args:[script,'--refine']}:undefined;
}
const xml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function launchdPlist(p:SchedulePlan):string{
 const args=[p.exec,...p.args].map(a=>`    <string>${xml(a)}</string>`).join('\n');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>${LABEL}</string>\n  <key>ProgramArguments</key>\n  <array>\n${args}\n  </array>\n  <key>StartInterval</key><integer>3600</integer>\n  <key>RunAtLoad</key><true/>\n  <key>ProcessType</key><string>Background</string>\n  <key>LowPriorityIO</key><true/>\n  <key>Nice</key><integer>10</integer>\n  <key>StandardOutPath</key><string>/dev/null</string>\n  <key>StandardErrorPath</key><string>/dev/null</string>\n</dict>\n</plist>\n`;
}
const sq=(s:string)=>`"${s.replace(/(["\\])/g,'\\$1')}"`;
export function systemdUnits(p:SchedulePlan):{service:string;timer:string}{
 return {
  service:`[Unit]\nDescription=PVTA biên tập nền (chỉ chạy khi PVTA đóng và máy rảnh)\n\n[Service]\nType=oneshot\nNice=10\nIOSchedulingClass=idle\nExecStart=${[p.exec,...p.args].map(sq).join(' ')}\n`,
  timer:`[Unit]\nDescription=PVTA biên tập nền mỗi giờ\n\n[Timer]\nOnBootSec=5min\nOnUnitActiveSec=1h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`,
 };
}
/** Windows: chạy ẩn qua wscript để không nháy cửa sổ dòng lệnh. */
export function windowsLauncher(p:SchedulePlan):string{
 const q=(s:string)=>`""${s.replace(/"/g,'""""')}""`;
 return `CreateObject("WScript.Shell").Run "${[p.exec,...p.args].map(q).join(' ')}", 0, False\r\n`;
}
export const cronLines=(p:SchedulePlan)=>{const cmd=[p.exec,...p.args].map(sq).join(' ');return [`7 * * * * ${cmd} # pvta-refine`,`@reboot ${cmd} # pvta-refine`];};

export const defaultRunner:Runner=(cmd,args,input)=>new Promise(resolve=>{
 const child=execFile(cmd,args,{timeout:20_000,windowsHide:true},(e,out,err)=>resolve({code:e?(typeof (e as {code?:unknown}).code==='number'?(e as {code:number}).code:1):0,out:`${out}${err}`}));
 if(input!==undefined){child.stdin?.end(input);}
});

export interface ScheduleCtx{home:string;platform?:NodeJS.Platform;homeDir?:string;uid?:number;run?:Runner}
const ok=(r:{code:number})=>r.code===0;

async function installMac(c:Required<Omit<ScheduleCtx,'home'>>,p:SchedulePlan){
 const file=path.join(c.homeDir,'Library','LaunchAgents',`${LABEL}.plist`);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,launchdPlist(p));
 const domain=`gui/${c.uid}`;
 await c.run('launchctl',['bootout',`${domain}/${LABEL}`]);
 let r=await c.run('launchctl',['bootstrap',domain,file]);
 if(!ok(r))r=await c.run('launchctl',['load','-w',file]);
 if(!ok(r))throw Error(`launchctl: ${r.out.trim().slice(0,200)}`);
}
async function removeMac(c:Required<Omit<ScheduleCtx,'home'>>){
 const file=path.join(c.homeDir,'Library','LaunchAgents',`${LABEL}.plist`);
 await c.run('launchctl',['bootout',`gui/${c.uid}/${LABEL}`]);fs.rmSync(file,{force:true});
}
async function installLinux(c:Required<Omit<ScheduleCtx,'home'>>,p:SchedulePlan){
 const has=await c.run('systemctl',['--user','--version']);
 if(ok(has)){
  const dir=path.join(c.homeDir,'.config','systemd','user');fs.mkdirSync(dir,{recursive:true});
  const u=systemdUnits(p);fs.writeFileSync(path.join(dir,'pvta-refine.service'),u.service);fs.writeFileSync(path.join(dir,'pvta-refine.timer'),u.timer);
  await c.run('systemctl',['--user','daemon-reload']);
  const r=await c.run('systemctl',['--user','enable','--now','pvta-refine.timer']);
  if(ok(r))return;
 }
 // Không có systemd người dùng: dùng crontab.
 const cur=await c.run('crontab',['-l']);
 const keep=(ok(cur)?cur.out:'').split('\n').filter(l=>l.trim()&&!l.includes('# pvta-refine'));
 const w=await c.run('crontab',['-'],[...keep,...cronLines(p)].join('\n')+'\n');
 if(!ok(w))throw Error('Không đăng ký được systemd timer hoặc crontab.');
}
async function removeLinux(c:Required<Omit<ScheduleCtx,'home'>>){
 await c.run('systemctl',['--user','disable','--now','pvta-refine.timer']);
 const dir=path.join(c.homeDir,'.config','systemd','user');
 fs.rmSync(path.join(dir,'pvta-refine.service'),{force:true});fs.rmSync(path.join(dir,'pvta-refine.timer'),{force:true});
 await c.run('systemctl',['--user','daemon-reload']);
 const cur=await c.run('crontab',['-l']);
 if(ok(cur)&&cur.out.includes('# pvta-refine')){const keep=cur.out.split('\n').filter(l=>l.trim()&&!l.includes('# pvta-refine'));await c.run('crontab',['-'],keep.join('\n')+(keep.length?'\n':''));}
}
async function installWin(c:Required<Omit<ScheduleCtx,'home'>>,home:string,p:SchedulePlan){
 const vbs=path.join(refinePaths(home).dir,'run-refine.vbs');fs.mkdirSync(path.dirname(vbs),{recursive:true});fs.writeFileSync(vbs,windowsLauncher(p));
 const tr=`wscript.exe //B //Nologo "${vbs}"`;
 const a=await c.run('schtasks',['/Create','/F','/TN','PVTA\\Refine','/SC','HOURLY','/MO','1','/TR',tr]);
 if(!ok(a))throw Error(`schtasks: ${a.out.trim().slice(0,200)}`);
 await c.run('schtasks',['/Create','/F','/TN','PVTA\\RefineLogon','/SC','ONLOGON','/TR',tr]);
}
async function removeWin(c:Required<Omit<ScheduleCtx,'home'>>){
 await c.run('schtasks',['/Delete','/F','/TN','PVTA\\Refine']);await c.run('schtasks',['/Delete','/F','/TN','PVTA\\RefineLogon']);
}
function context(c:ScheduleCtx):Required<Omit<ScheduleCtx,'home'>>{
 return {platform:c.platform??process.platform,homeDir:c.homeDir??os.homedir(),uid:c.uid??(typeof process.getuid==='function'?process.getuid():0),run:c.run??defaultRunner};
}
export function readSchedule(home:string):ScheduleResult&{key?:string}{return readJson(refinePaths(home).schedule,{registered:false});}

/** Bật: đăng ký (bỏ qua nếu bản đăng ký giống hệt đã thành công). Tắt: gỡ. Không bao giờ ném lỗi; kết quả ghi lại để hiện ở Cài đặt. */
export async function syncSchedule(enabled:boolean,ctx:ScheduleCtx,plan:SchedulePlan|undefined=schedulePlan()):Promise<ScheduleResult>{
 if(!plan)return {registered:false,error:'Chỉ đăng ký lịch trong bản PVTA đã cài đặt.'};
 const c=context(ctx);const file=refinePaths(ctx.home).schedule;const key=sha(`${c.platform}|${plan.exec}|${plan.args.join(' ')}`);
 const prev=readSchedule(ctx.home);
 try{
  if(enabled){
   if(prev.registered&&prev.key===key)return {registered:true};
   if(c.platform==='darwin')await installMac(c,plan);else if(c.platform==='win32')await installWin(c,ctx.home,plan);else await installLinux(c,plan);
   atomicJson(file,{registered:true,key,at:Date.now()});return {registered:true};
  }
  if(!prev.registered&&!prev.key)return {registered:false};
  if(c.platform==='darwin')await removeMac(c);else if(c.platform==='win32')await removeWin(c);else await removeLinux(c);
  atomicJson(file,{registered:false,at:Date.now()});return {registered:false};
 }catch(e){
  const error=(e instanceof Error?e.message:String(e)).slice(0,300);
  try{atomicJson(file,{registered:false,error,at:Date.now()});}catch{/* không ghi được trạng thái */}
  return {registered:false,error};
 }
}
