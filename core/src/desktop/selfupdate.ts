import crypto from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Cập nhật PVTA Chatbox tại chỗ, không mở Terminal và không cần khóa ký:
 * hỏi GitHub Releases → tải gói đúng hệ điều hành (báo tiến trình) → đối chiếu SHA256SUMS → cài ẩn.
 * - Windows: chạy bộ cài NSIS ở chế độ passive (/P /UPDATE /R): chỉ hiện thanh tiến trình, tự đóng app cũ và mở lại.
 * - macOS: gắn tệp .dmg, chép PVTA.app mới vào cạnh bản đang chạy rồi đổi chỗ; app tự mở lại.
 * - Linux: chỉ bản AppImage (thay tệp AppImage); bản .deb thì báo tải gói mới.
 * Dữ liệu (hội thoại, cấu hình, kỹ năng) nằm ngoài thư mục cài đặt nên được giữ nguyên.
 */

export const RELEASE_REPO='phandinhdoc-spec/MySoft';
const RELEASE_API=`https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=30`;
const DOWNLOAD_PREFIX=`https://github.com/${RELEASE_REPO}/releases/download/`;
const MAX_PACKAGE=600*1024*1024;

export interface ReleaseInfo{version:string;notes:string;asset?:{name:string;url:string;size:number};sumsUrl?:string;reason?:string}
export interface UpdateProgress{phase:'downloading'|'installing';received:number;total:number}
export type Finish='relaunch'|'exit';

/** So sánh x.y.z: âm nếu a < b, 0 nếu bằng, dương nếu a > b. */
export function compareVersions(a:string,b:string):number{
 const pa=a.split('.').map(Number),pb=b.split('.').map(Number);
 for(let i=0;i<3;i++){const d=(pa[i]??0)-(pb[i]??0);if(d)return d;}
 return 0;
}

/** Phiên bản x.y.z ở cuối tên thẻ (desktop-v0.1.12, chatbox-v0.1.12, v0.1.12). */
export function versionFromTag(tag:unknown):string|undefined{
 return typeof tag==='string'?/(\d{1,4}\.\d{1,4}\.\d{1,4})$/.exec(tag)?.[1]:undefined;
}

/** Đuôi tên gói cài cho máy này; undefined nếu chưa cập nhật tại chỗ được. */
export function packageSuffix(platform:NodeJS.Platform,arch:string,env:NodeJS.ProcessEnv=process.env):string|undefined{
 const a=arch==='arm64'?'arm64':'x64';
 if(platform==='darwin')return `-${a}.dmg`;
 if(platform==='win32')return '-x64.exe'; // Windows cập nhật qua PVTA-Studio-Setup; trình cài đó tự chọn gói x64 hoặc ARM64.
 if(platform==='linux'&&env.APPIMAGE)return `-${a}.AppImage`;
 return undefined;
}

/** Đọc JSON bản phát hành của GitHub, chọn gói đúng máy. Chỉ nhận địa chỉ tải trong kho PVTA. */
export function parseRelease(j:any,platform:NodeJS.Platform,arch:string,env:NodeJS.ProcessEnv=process.env):ReleaseInfo|undefined{
 const version=versionFromTag(j?.tag_name);
 if(!version)return undefined;
 const notes=typeof j.body==='string'?j.body.slice(0,600):'';
 const assets:any[]=Array.isArray(j.assets)?j.assets:[];
 const ok=(a:any)=>typeof a?.name==='string'&&typeof a?.browser_download_url==='string'&&a.browser_download_url.startsWith(DOWNLOAD_PREFIX);
 const suffix=packageSuffix(platform,arch,env);
 if(!suffix){
  const reason=platform==='linux'?'Bản cài từ gói .deb chưa tự cập nhật được. Hãy tải gói mới ở trang GitHub của PVTA.':'Hệ điều hành này chưa có gói PVTA.';
  return {version,notes,reason};
 }
 const pkg=platform==='win32'
  ?assets.find(a=>ok(a)&&a.name===`PVTA-Studio-Setup-${version}.exe`)
  // macOS: gói Studio (.dmg có PVTA.app ở gốc) là bản phát hành chính; vẫn nhận gói PVTA-Chatbox cũ.
  :assets.find(a=>ok(a)&&a.name.startsWith('PVTA-Studio-')&&a.name.endsWith(suffix))??assets.find(a=>ok(a)&&a.name.startsWith('PVTA-Chatbox-')&&a.name.endsWith(suffix));
 const sums=assets.find(a=>ok(a)&&a.name==='SHA256SUMS');
 if(!pkg)return {version,notes,reason:'Bản mới chưa có gói cho máy này. Thử lại sau.'};
 if(!sums)return {version,notes,reason:'Bản mới thiếu tệp mã kiểm tra SHA256SUMS.'};
 return {version,notes,asset:{name:pkg.name,url:pkg.browser_download_url,size:Number(pkg.size)||0},sumsUrl:sums.browser_download_url};
}

/** Mã sha256 của một tệp trong nội dung SHA256SUMS. */
export function expectedHash(sums:string,name:string):string|undefined{
 for(const line of sums.split(/\r?\n/)){
  const m=/^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
  if(m&&m[2]===name)return m[1]!.toLowerCase();
 }
 return undefined;
}

type Fetch=typeof fetch;
const HEADERS={'User-Agent':'PVTA-Chatbox','Cache-Control':'no-cache'};

export async function fetchRelease(fetchFn:Fetch=fetch,platform=process.platform,arch=process.arch):Promise<ReleaseInfo>{
 let r:Response;
 try{r=await fetchFn(RELEASE_API,{headers:{...HEADERS,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});}
 catch{throw Error('Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.');}
 if(r.status===404)throw Error('Chưa có bản PVTA nào được phát hành trên GitHub.');
 if(r.status===403||r.status===429)throw Error('GitHub tạm giới hạn lượt kiểm tra. Thử lại sau ít phút.');
 if(!r.ok)throw Error(`Chưa lấy được thông tin bản mới (mã ${r.status}).`);
 const payload=await r.json();
 const candidates=(Array.isArray(payload)?payload:[payload]).filter(j=>!j.draft&&!j.prerelease&&/^(desktop|chatbox)-v/.test(j.tag_name??'')).map(j=>parseRelease(j,platform,arch)).filter((r):r is ReleaseInfo=>!!r).sort((a,b)=>compareVersions(b.version,a.version));
 const info=candidates.find(r=>r.asset)??candidates[0];
 if(!info)throw Error('Thông tin bản mới trên GitHub không hợp lệ.');
 return info;
}

/** Tải gói vào thư mục tạm, báo tiến trình, đối chiếu SHA256SUMS. Trả về đường dẫn tệp. */
export async function downloadPackage(info:ReleaseInfo,onProgress:(p:UpdateProgress)=>void,o:{fetchFn?:Fetch;signal?:AbortSignal;dir?:string}={}):Promise<string>{
 const {asset,sumsUrl}=info;
 if(!asset||!sumsUrl)throw Error(info.reason??'Bản mới chưa có gói cho máy này.');
 const fetchFn=o.fetchFn??fetch;
 let sums:string;
 try{const r=await fetchFn(sumsUrl,{headers:HEADERS,signal:o.signal});if(!r.ok)throw Error();sums=await r.text();}
 catch{throw Error('Không tải được tệp mã kiểm tra. Kiểm tra mạng rồi thử lại.');}
 const want=expectedHash(sums,asset.name);
 if(!want)throw Error('Tệp mã kiểm tra không có gói này.');
 let r:Response;
 try{r=await fetchFn(asset.url,{headers:HEADERS,signal:o.signal});}
 catch{throw Error('Không tải được bản mới. Kiểm tra mạng rồi thử lại.');}
 if(!r.ok||!r.body)throw Error(`Không tải được bản mới (mã ${r.status}).`);
 const total=Number(r.headers.get('content-length'))||asset.size||0;
 if(total>MAX_PACKAGE)throw Error('Gói bản mới có kích thước bất thường.');
 const dir=o.dir??await fsp.mkdtemp(path.join(os.tmpdir(),'pvta-update-'));
 const file=path.join(dir,path.basename(asset.name));
 const out=fs.createWriteStream(file);
 const hash=crypto.createHash('sha256');
 let received=0,last=0;
 try{
  const reader=r.body.getReader();
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   received+=value.length;
   if(received>MAX_PACKAGE)throw Error('Gói bản mới có kích thước bất thường.');
   hash.update(value);
   if(!out.write(value))await new Promise<void>(res=>out.once('drain',()=>res()));
   const now=Date.now();
   if(now-last>200){last=now;onProgress({phase:'downloading',received,total});}
  }
  await new Promise<void>((res,rej)=>out.end((e?:Error|null)=>e?rej(e):res()));
 }catch(e){
  out.destroy();await fsp.rm(dir,{recursive:true,force:true});
  if(o.signal?.aborted)throw Error('Đã hủy cập nhật.');
  throw e instanceof Error&&e.message.startsWith('Gói')?e:Error('Tải bản mới bị gián đoạn. Kiểm tra mạng rồi thử lại.');
 }
 onProgress({phase:'downloading',received,total:total||received});
 if(hash.digest('hex')!==want){
  await fsp.rm(dir,{recursive:true,force:true});
  throw Error('Gói tải về không khớp mã kiểm tra (GitHub có thể còn lưu bản cũ). Thử lại sau vài phút.');
 }
 return file;
}

const run=(file:string,args:string[])=>new Promise<string>((res,rej)=>execFile(file,args,{timeout:180_000,windowsHide:true},(e,stdout)=>e?rej(e):res(String(stdout))));

/** Thư mục PVTA.app chứa tiến trình đang chạy (lõi nằm ở PVTA.app/Contents/MacOS/). */
export function macBundle(execPath:string=process.execPath):string|undefined{
 const i=execPath.indexOf('.app/Contents/MacOS/');
 return i>0?execPath.slice(0,i+4):undefined;
}

async function installMac(dmg:string):Promise<Finish>{
 const bundle=macBundle();
 if(!bundle)throw Error('Không xác định được vị trí PVTA.app. Hãy tải gói .dmg ở trang GitHub của PVTA.');
 const parent=path.dirname(bundle);
 try{await fsp.access(parent,fs.constants.W_OK);}
 catch{throw Error(`Không có quyền ghi vào ${parent}. Hãy tải gói .dmg ở trang GitHub của PVTA.`);}
 const mount=await fsp.mkdtemp(path.join(os.tmpdir(),'pvta-mount-'));
 const stage=await fsp.mkdtemp(path.join(parent,'.pvta-update-'));
 let attached=false;
 try{
  try{await run('hdiutil',['attach',dmg,'-mountpoint',mount,'-nobrowse','-readonly','-quiet']);attached=true;}
  catch{throw Error('Không mở được gói cài đặt .dmg.');}
  const src=path.join(mount,'PVTA.app');
  if(!fs.existsSync(src))throw Error('Gói cài đặt không có PVTA.app.');
  const fresh=path.join(stage,'PVTA.app');
  try{await run('ditto',[src,fresh]);}catch{throw Error('Không chép được bản mới. Kiểm tra dung lượng ổ đĩa.');}
  const old=path.join(stage,'previous.app');
  await fsp.rename(bundle,old);
  try{await fsp.rename(fresh,bundle);}
  catch{await fsp.rename(old,bundle);throw Error('Không thay được PVTA.app. Đã giữ nguyên bản cũ.');}
 }finally{
  if(attached)await run('hdiutil',['detach',mount,'-quiet','-force']).catch(()=>{});
  await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});
  await fsp.rm(mount,{recursive:true,force:true}).catch(()=>{});
 }
 return 'relaunch';
}

async function installAppImage(file:string,env:NodeJS.ProcessEnv=process.env):Promise<Finish>{
 const target=env.APPIMAGE;
 if(!target)throw Error('Bản cài này chưa tự cập nhật được.');
 const next=`${target}.new`;
 try{await fsp.copyFile(file,next);await fsp.chmod(next,0o755);await fsp.rename(next,target);}
 catch{await fsp.rm(next,{force:true});throw Error(`Không thay được ${target}. Kiểm tra quyền ghi.`);}
 return 'relaunch';
}

async function installWindows(exe:string):Promise<Finish>{
 // /P: chỉ hiện thanh tiến trình, không hỏi gì; tự đóng PVTA đang chạy. /UPDATE: giữ lối tắt sẵn có. /R: cài xong mở lại PVTA.
 const child=spawn(exe,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],{detached:true,stdio:'ignore',windowsHide:false});
 await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',()=>reject(Error('Không mở được bộ cài Windows. PVTA vẫn đang chạy.')));});
 child.unref();
 return 'exit';
}

/** Cài gói đã tải. Trả về việc giao diện cần làm tiếp: mở lại app, hay thoát để bộ cài Windows làm tiếp. */
export async function installPackage(file:string,platform:NodeJS.Platform=process.platform):Promise<Finish>{
 try{
  if(platform==='win32')return installWindows(file);
  if(platform==='darwin')return await installMac(file);
  if(platform==='linux')return await installAppImage(file);
  throw Error('Hệ điều hành này chưa tự cập nhật được.');
 }finally{
  if(platform!=='win32')await fsp.rm(path.dirname(file),{recursive:true,force:true}).catch(()=>{});
 }
}

/** Hai địa chỉ đều do GitHub phục vụ: nếu mạng chặn raw.githubusercontent.com thì thử github.com. Lỗi nói rõ nguyên nhân để biết đường xử lý. */
export const SOURCE_INSTALLER_URLS=['https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/installers/source-macos.sh','https://github.com/phandinhdoc-spec/MySoft/raw/main/installers/source-macos.sh'];
async function fetchSourceInstaller(fetchFn:typeof fetch):Promise<string>{
 const why:string[]=[];
 for(const url of SOURCE_INSTALLER_URLS){
  const host=new URL(url).host;
  try{
   const r=await fetchFn(url,{headers:HEADERS,signal:AbortSignal.timeout(30000),redirect:'follow'});
   if(r.ok)return await r.text();
   why.push(`${host}: HTTP ${r.status}`);
  }catch(e){
   const cause=(e as {cause?:{code?:string}}).cause?.code;
   why.push(`${host}: ${e instanceof Error&&e.name==='TimeoutError'?'quá thời gian chờ':cause==='ENOTFOUND'?'không phân giải được tên miền (mạng/DNS chặn?)':'không kết nối được'}`);
  }
 }
 throw Error(`Không tải được script cài nguồn (${why.join('; ')}). Kiểm tra mạng rồi thử lại.`);
}

/** Mở bộ cài mã nguồn trong Terminal; ứng dụng tiếp tục chạy tới khi dựng xong. */
export async function startMacSourceInstall(o:{bundle?:string;fetchFn?:typeof fetch;openFn?:(file:string)=>Promise<void>}={}):Promise<void>{
 const bundle=o.bundle??macBundle();
 if(!bundle)throw Error('Hãy chạy lệnh cài trong README khi đang dùng bản phát triển.');
 const body=await fetchSourceInstaller(o.fetchFn??fetch);
 if(!body.startsWith('#!/usr/bin/env bash')||body.length>200000)throw Error('Script cài đặt không hợp lệ.');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'pvta-source-'));
 const file=path.join(dir,'Cai-PVTA.command');
 const quote=(v:string)=>"'"+v.replaceAll("'", "'\\''")+"'";
 await fsp.writeFile(path.join(dir,'install.sh'),body,{mode:0o700});
 await fsp.writeFile(file,`#!/bin/bash
export PVTA_INSTALL_TARGET=${quote(bundle)}
bash ${quote(path.join(dir,'install.sh'))}
result=$?
echo "Ma ket thuc: $result. Nhan Enter de dong."
read -r _
rm -rf ${quote(dir)}
exit "$result"
`,{mode:0o700});
 try{await (o.openFn??(file=>run('open',['-a','Terminal',file]).then(()=>{})))(file);}
 catch(e){await fsp.rm(dir,{recursive:true,force:true});throw e;}
}
