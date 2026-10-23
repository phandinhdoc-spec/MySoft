import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export type InstallBackend='claude'|'codex'|'agy';
const sources = {
 claude:{name:'Claude Code',base:'https://claude.ai',docs:'https://code.claude.com/docs/en/setup',hosts:['claude.ai','www.claude.ai','downloads.claude.ai','claude.com','www.claude.com','downloads.claude.com']},
 codex:{name:'OpenAI Codex',base:'https://chatgpt.com/codex',docs:'https://github.com/openai/codex#quickstart',hosts:['chatgpt.com','www.chatgpt.com','releases.openai.com']},
 agy:{name:'Google Antigravity · agy',base:'https://antigravity.google/cli',docs:'https://www.antigravity.google/docs/cli/install/',hosts:['antigravity.google','www.antigravity.google']},
} as const;
export function installerInfo(id:string,platform:NodeJS.Platform=process.platform){
 if(!Object.hasOwn(sources,id))throw Error('Công cụ cài đặt không hợp lệ.');
 if(!['darwin','win32','linux'].includes(platform))throw Error('Chưa hỗ trợ cài công cụ trên hệ điều hành này.');
 const backend=id as InstallBackend;const spec=sources[backend];
 return {backend,name:spec.name,url:`${spec.base}/install.${platform==='win32'?'ps1':'sh'}`,docs:spec.docs};
}
export function installerCatalog(){return Object.keys(sources).map(id=>installerInfo(id));}
export function trustedInstallerUrl(id:InstallBackend,value:string){
 const u=new URL(value);
 return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(sources[id].hosts as readonly string[]).includes(u.hostname);
}
const LIMIT=2*1024*1024;
/** Download only the fixed official entry point, validating every redirect before following it. */
export async function downloadBackendInstaller(id:string,home:string,platform:NodeJS.Platform=process.platform,fetcher:typeof fetch=fetch){
 const info=installerInfo(id,platform);let url=info.url;const signal=AbortSignal.timeout(90_000);
 let response:Response|undefined;
 for(let hop=0;hop<6;hop++){
  if(!trustedInstallerUrl(info.backend,url))throw Error('Nguồn chuyển hướng không thuộc nhà cung cấp chính thức.');
  response=await fetcher(url,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)throw Error('Nguồn tải không cung cấp địa chỉ chuyển hướng.');
   url=new URL(location,url).href;response=undefined;continue;
  }
  break;
 }
 if(!response?.ok||!response.body)throw Error('Không tải được bộ cài chính thức. Kiểm tra mạng rồi thử lại.');
 if(/text\/html/i.test(response.headers.get('content-type')??'')||Number(response.headers.get('content-length'))>LIMIT){await response.body.cancel();throw Error('Nguồn tải trả về trang web hoặc tệp quá lớn, chưa mở cài đặt.');}
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT)throw Error('Bộ cài vượt giới hạn tải.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const data=Buffer.concat(chunks);const text=data.toString('utf8').trim();
 if(!text||/^\s*(?:<!doctype html|<html)/i.test(text)||data.includes(0))throw Error('Bộ cài tải về không hợp lệ.');
 const parent=path.join(home,'installers');await fs.mkdir(parent,{recursive:true,mode:0o700});
 const dir=await fs.mkdtemp(path.join(parent,info.backend+'-'));
 try{
  const file=path.join(dir,platform==='win32'?'install.ps1':'install.sh');await fs.writeFile(file,data,{flag:'wx',mode:0o600});
  const sha256=createHash('sha256').update(data).digest('hex');
  await fs.writeFile(path.join(dir,'source.json'),JSON.stringify({...info,finalUrl:url,sha256,downloadedAt:new Date().toISOString()},null,2),{mode:0o600});
  return {...info,file,sha256};
 }catch(e){await fs.rm(dir,{recursive:true,force:true});throw e;}
}
export function installerCommand(file:string,id:InstallBackend,platform:NodeJS.Platform=process.platform){
 if(platform==='win32')return `& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '${file.replace(/'/g,"''")}'`;
 const quote=(s:string)=>"'"+s.replace(/'/g,"'\\''")+"'";
 return `${id==='codex'?'sh':'bash'} ${quote(file)}`;
}
/** Lệnh chạy bộ cài ở nền (không qua Terminal). Giống installerCommand nhưng tách tên chương trình và đối số. */
export function installerSpawn(file:string,id:InstallBackend,platform:NodeJS.Platform=process.platform){
 if(platform==='win32')return {bin:'powershell.exe',args:['-NoProfile','-ExecutionPolicy','Bypass','-File',file]};
 return {bin:id==='codex'?'sh':'bash',args:[file]};
}
