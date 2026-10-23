import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';
export type CloudProvider='google'|'microsoft';
export interface CloudFolder {provider:CloudProvider;url:string;name:string;folderId:string;driveId?:string}
const GRAPH='https://graph.microsoft.com/v1.0';
export function cloudLink(raw:string):{provider:CloudProvider;url:string;folderId?:string}{
 let u:URL;try{u=new URL(raw.trim());}catch{throw Error('Dán liên kết thư mục Google Drive, OneDrive hoặc SharePoint.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Cần liên kết HTTPS của dịch vụ lưu trữ.');
 if(u.hostname==='drive.google.com'){
  const id=u.pathname.match(/\/folders\/([\w-]+)/)?.[1];if(!id)throw Error('Chọn liên kết thư mục Google Drive, không phải liên kết một tài liệu.');
  return {provider:'google',url:u.href,folderId:id};
 }
 if(u.hostname==='1drv.ms'||u.hostname==='onedrive.live.com'||u.hostname.endsWith('.sharepoint.com'))return {provider:'microsoft',url:u.href};
 throw Error('Liên kết phải thuộc Google Drive, OneDrive hoặc SharePoint.');
}
const enc=encodeURIComponent;
export class ProjectCloud {
 private pending?:Promise<string>;private connecting=false;
 constructor(private home:string,private http:typeof fetch=fetch){}
 private config(){return path.join(this.home,'cloud','rclone.conf');}
 private run(bin:string,args:string[],timeout=120000,includeError=false){return new Promise<string>((resolve,reject)=>execFile(bin,args,{timeout,maxBuffer:8*1024*1024,windowsHide:true,env:{...process.env,RCLONE_CONFIG:this.config()}},(e,out,err)=>e?reject(Error('Kết nối lưu trữ chưa sẵn sàng. Kiểm tra mạng hoặc đăng nhập lại.')):resolve(includeError?out+'\n'+err:out)));}
 private async binary():Promise<string>{
  if(this.pending)return this.pending;
  this.pending=(async()=>{
   try{await this.run('rclone',['version'],10000);return 'rclone';}catch{}
   const dir=path.join(this.home,'tools');const bin=path.join(dir,process.platform==='win32'?'rclone.exe':'rclone');try{await fs.access(bin);return bin;}catch{}
   const os=process.platform==='darwin'?'osx':process.platform==='win32'?'windows':process.platform==='linux'?'linux':'';const arch=process.arch==='arm64'?'arm64':process.arch==='x64'?'amd64':'';
   if(!os||!arch)throw Error('Chưa có bộ kết nối đám mây cho máy này.');
   const name=`rclone-v1.75.1-${os}-${arch}.zip`;const base='https://downloads.rclone.org/v1.75.1/';
   const [zip,sum]=await Promise.all([this.http(base+name,{signal:AbortSignal.timeout(180000)}),this.http(base+'SHA256SUMS',{signal:AbortSignal.timeout(30000)})]);
   if(!zip.ok||!sum.ok)throw Error('Chưa tải được bộ kết nối đám mây.');const data=Buffer.from(await zip.arrayBuffer());
   const expected=(await sum.text()).split('\n').find(l=>l.trim().endsWith(name))?.trim().split(/\s+/)[0];if(createHash('sha256').update(data).digest('hex')!==expected)throw Error('Bộ kết nối không khớp mã kiểm tra.');
   const files=unzipSync(data);const key=Object.keys(files).find(k=>k.endsWith('/'+path.basename(bin)));if(!key)throw Error('Gói kết nối thiếu chương trình.');
   await fs.mkdir(dir,{recursive:true,mode:0o700});const temp=bin+'.'+randomUUID();await fs.writeFile(temp,files[key]!,{mode:0o700});await fs.rename(temp,bin);return bin;
  })();try{return await this.pending;}finally{this.pending=undefined;}
 }
 private async readToken(provider:CloudProvider){
  const bin=await this.binary();const remote=provider==='google'?'pvta-google':'pvta-microsoft';
  // Rclone renews OAuth tokens and persists them in its private configuration.
  await this.run(bin,['about',remote+':','--json','--retries','1','--low-level-retries','1']);
  const dump=await this.run(bin,['config','dump']);let token:any;try{const config=JSON.parse(dump);token=JSON.parse(config[remote].token);}catch{throw Error('Cần đăng nhập tài khoản lưu trữ.');}
  if(!token.access_token)throw Error('Cần đăng nhập tài khoản lưu trữ.');return String(token.access_token);
 }
 private async json(url:string,token:string,init:RequestInit={}){
  const r=await this.http(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw Error(r.status===401?'Phiên đăng nhập đã hết hạn. Hãy kết nối lại.':r.status===403?'Tài khoản chưa được phép ghi vào thư mục này.':r.status===404?'Không tìm thấy thư mục hoặc tệp. Kiểm tra liên kết và tài khoản.':`Dịch vụ lưu trữ trả lỗi ${r.status}. Hãy thử lại.`);
  return r.json() as Promise<any>;
 }
 private async resolveWithToken(url:string,token:string):Promise<CloudFolder>{
  const link=cloudLink(url);
  if(link.provider==='google'){
   const item=await this.json(`https://www.googleapis.com/drive/v3/files/${enc(link.folderId!)}?supportsAllDrives=true&fields=id,name,mimeType,capabilities(canAddChildren),webViewLink`,token);
   if(item.mimeType!=='application/vnd.google-apps.folder'||!item.capabilities?.canAddChildren)throw Error('Chọn một thư mục Google Drive mà tài khoản có quyền thêm tệp.');
   return {provider:'google',url:link.url,name:item.name,folderId:item.id};
  }
  const share='u!'+Buffer.from(link.url).toString('base64url');
  const item=await this.json(`${GRAPH}/shares/${share}/driveItem`,token);
  if(!item.folder||!item.parentReference?.driveId)throw Error('Liên kết phải trỏ tới thư mục. Trong OneDrive/SharePoint, chọn Chia sẻ → Sao chép liên kết của thư mục.');
  return {provider:'microsoft',url:link.url,name:item.name,folderId:item.id,driveId:item.parentReference.driveId};
 }
 async connect(url:string):Promise<CloudFolder>{
  if(this.connecting)throw Error('Đang chờ đăng nhập trong trình duyệt.');this.connecting=true;
  try{
   const {provider}=cloudLink(url);const type=provider==='google'?'drive':'onedrive';const bin=await this.binary();
   await fs.mkdir(path.dirname(this.config()),{recursive:true,mode:0o700});
   const output=await this.run(bin,['authorize',type],600000,true);let token:any;
   for(const match of output.matchAll(/\{[^\r\n]*"access_token"[^\r\n]*\}/g)){try{token=JSON.parse(match[0]);}catch{}}
   if(!token?.access_token||!token.refresh_token)throw Error('Đăng nhập chưa hoàn tất. Hãy thử lại.');
   const folder=await this.resolveWithToken(url,token.access_token);
   const driveType=provider==='microsoft'?(await this.json(`${GRAPH}/drives/${enc(folder.driveId!)}?$select=driveType`,token.access_token)).driveType:undefined;
   let config='';try{config=await fs.readFile(this.config(),'utf8');}catch{}
   const remote=provider==='google'?'pvta-google':'pvta-microsoft';config=config.replace(new RegExp('\\['+remote+'\\][\\s\\S]*?(?=\\n\\[|$)','g'),'').trim();
   const block=`[${remote}]\ntype = ${type}\ntoken = ${JSON.stringify(token)}\n`+(provider==='google'?'scope = drive\n':`drive_id = ${folder.driveId}\ndrive_type = ${driveType==='personal'?'personal':driveType==='documentLibrary'?'documentLibrary':'business'}\n`);
   await fs.writeFile(this.config(),config+'\n\n'+block,{mode:0o600});await fs.chmod(this.config(),0o600);return folder;
  }finally{this.connecting=false;}
 }
 async resolve(url:string){return this.resolveWithToken(url,await this.readToken(cloudLink(url).provider));}
 async upload(folder:CloudFolder,file:string,actionId:string):Promise<{url:string;id:string}>{
  const token=await this.readToken(folder.provider);const verified=await this.resolveWithToken(folder.url,token);
  if(verified.folderId!==folder.folderId||verified.driveId!==folder.driveId)throw Error('Thư mục đích đã thay đổi. Kiểm tra lại dự án trước khi gửi.');
  const bytes=await fs.readFile(file);const original=path.basename(file);const ext=path.extname(original);const name=path.basename(original,ext)+'-'+actionId.slice(0,8)+ext;
  if(folder.provider==='google'){
   const q=`'${folder.folderId}' in parents and trashed = false and appProperties has { key='pvtaAction' and value='${actionId}' }`;
   const found=await this.json(`https://www.googleapis.com/drive/v3/files?q=${enc(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,webViewLink,md5Checksum)`,token);
   if(found.files?.length){const f=found.files[0];if(f.md5Checksum!==createHash('md5').update(bytes).digest('hex'))throw Error('Tệp trên Drive đã thay đổi; không ghi đè.');return {id:f.id,url:f.webViewLink??`https://drive.google.com/file/d/${f.id}/view`};}
   const boundary='pvta-'+randomUUID();const meta={name,parents:[folder.folderId],appProperties:{pvtaAction:actionId}};
   const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
   const f=await this.json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',token,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
   return {id:f.id,url:f.webViewLink??`https://drive.google.com/file/d/${f.id}/view`};
  }
  const target=`${GRAPH}/drives/${enc(folder.driveId!)}/items/${enc(folder.folderId)}:/${enc(name)}`;
  const existing=await this.http(target,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
  if(existing.ok){const f:any=await existing.json();const expected=createHash('sha1').update(bytes).digest('hex').toLowerCase();if(f.file?.hashes?.sha1Hash?.toLowerCase()!==expected)throw Error('Đã có tệp cùng tên trên đám mây. PVTA không ghi đè.');return {id:f.id,url:f.webUrl};}
  if(existing.status!==404)throw Error(`Không kiểm tra được tệp đích (${existing.status}).`);
  const session=await this.json(target+':/createUploadSession',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',name}})});
  const u=new URL(session.uploadUrl);if(u.protocol!=='https:')throw Error('Dịch vụ trả về địa chỉ tải lên không hợp lệ.');
  const chunk=10*320*1024;let item:any;
  for(let start=0;start<bytes.length;start+=chunk){const end=Math.min(start+chunk,bytes.length);const r=await this.http(u.href,{method:'PUT',headers:{'Content-Length':String(end-start),'Content-Range':`bytes ${start}-${end-1}/${bytes.length}`},body:bytes.subarray(start,end),signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(`Tải lên chưa hoàn tất (${r.status}). Bản trên máy được giữ lại.`);item=await r.json();}
  if(!item?.id||!item.webUrl)throw Error('Dịch vụ chưa xác nhận tệp đã tải lên.');return {id:item.id,url:item.webUrl};
 }
}
