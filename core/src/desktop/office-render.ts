import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {fileHash} from './edit-sessions.js';
import type {CraftTools,CraftName} from './craft-tools.js';

/** Optional layout renderer. One short-lived process; no macOS Quick Look or resident Office. */
export class OfficeRenderer {
 private jobs=new Map<string,Promise<string>>();
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private root:string,private craft?:CraftTools){}
 private async binary(){
  const names=process.platform==='win32'?['soffice.exe']:['soffice','libreoffice'];
  const candidates=[process.env.PVTA_LIBREOFFICE,'/Applications/LibreOffice.app/Contents/MacOS/soffice',...['ProgramFiles','ProgramFiles(x86)'].map(k=>process.env[k]?path.join(process.env[k]!,'LibreOffice','program','soffice.exe'):''),...(process.env.PATH??'').split(path.delimiter).flatMap(p=>names.map(n=>path.join(p,n)))];
  for(const file of candidates)if(file)try{await fs.access(file);return file;}catch{}
  throw Error('Chưa có bộ dựng bố cục LibreOffice trên máy. Có thể sửa bằng chế độ Nội dung; bản xem đó không mô phỏng trang Office.');
 }
 async render(input:string,sessionId:string){
  if(!/^[a-f0-9]{64}$/.test(sessionId))throw Error('Phiên không hợp lệ.');
  const hash=sessionId+'/'+await fileHash(input);const existing=this.jobs.get(hash);if(existing)return existing;
  const job=this.tail.catch(()=>{}).then(()=>this.convert(input,hash));this.tail=job;this.jobs.set(hash,job);
  try{return await job;}finally{this.jobs.delete(hash);}
 }
 async clear(sessionId:string){
  if(!/^[a-f0-9]{64}$/.test(sessionId))throw Error('Phiên không hợp lệ.');
  const clean=this.tail.catch(()=>{}).then(()=>fs.rm(path.join(this.root,sessionId),{recursive:true,force:true}));this.tail=clean;await clean;
 }
 private async convert(input:string,hash:string){
  const dir=path.join(this.root,hash);const output=path.join(dir,'source.pdf');
  try{if((await fs.stat(output)).size>0)return output;}catch{}
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const source=path.join(dir,'source'+path.extname(input));await fs.copyFile(input,source);
  try{
   if(await this.lightConvert(source,output))return output;
   return await this.libreConvert(source,dir,output);
  }finally{await fs.rm(source,{force:true});}
 }
 /** Optional ARTCRAFT CLI: Word, PowerPoint and Excel (WordCraft / DeckCraft / GridCraft). Any failure falls back to LibreOffice. */
 private async lightConvert(source:string,output:string){
  const name:CraftName|undefined=({'.docx':'wordcraft','.pptx':'deckcraft','.xlsx':'gridcraft'} as Record<string,CraftName>)[path.extname(source).toLowerCase()];
  const binary=name&&await this.craft?.find(name);if(!binary)return false;
  try{
   await new Promise<void>((resolve,reject)=>execFile(binary,['convert',source,output],{timeout:60_000,maxBuffer:1024*1024,windowsHide:true},e=>e?reject(e):resolve()));
   const head=Buffer.alloc(5);const handle=await fs.open(output,'r');try{await handle.read(head,0,5,0);}finally{await handle.close();}
   if(head.toString('latin1')==='%PDF-'&&(await fs.stat(output)).size>0)return true;
  }catch{}
  await fs.rm(output,{force:true});return false;
 }
 private async libreConvert(source:string,dir:string,output:string){
  const profile=path.join(dir,'profile');
  try{
   const binary=await this.binary().catch(async e=>{throw Error(this.craft?.supported&&!(await this.craft.find('wordcraft'))?'Chưa có bộ dựng bố cục. Có thể tải bộ xem trước nhẹ (Word, PowerPoint) hoặc cài LibreOffice; hoặc dùng chế độ Nội dung.':e.message);});
   await new Promise<void>((resolve,reject)=>execFile(binary,[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--nologo','--nodefault','--nofirststartwizard','--convert-to','pdf','--outdir',dir,source],{timeout:90_000,maxBuffer:1024*1024,windowsHide:true},error=>error?reject(Error('Không dựng được bố cục Office. Hãy dùng chế độ Nội dung hoặc thử lại.')):resolve()));
   if(!(await fs.stat(output)).size)throw Error('Bộ dựng chưa tạo được trang xem trước.');
   return output;
  }catch(e){await fs.rm(output,{force:true});throw e;}finally{await fs.rm(profile,{recursive:true,force:true});}
 }
}
