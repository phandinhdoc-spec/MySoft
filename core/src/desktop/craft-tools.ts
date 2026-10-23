import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';

/**
 * ARTCRAFT command-line tools (MIT/Apache-2.0): optional light renderers used only for layout preview.
 * Upstream publishes a standalone CLI archive for macOS only; other systems use the LibreOffice fallback.
 * Nothing is bundled: the user chooses to download, and every archive is checked against a pinned SHA-256.
 */
export type CraftName='wordcraft'|'deckcraft'|'gridcraft';
export const CRAFT_NAMES:CraftName[]=['wordcraft','deckcraft','gridcraft'];
const VERSION='0.8.0';
export const CRAFT_LOCK:Record<CraftName,{url:string;sha256:string}>={
 wordcraft:{url:`https://github.com/storytold/wordcraft/releases/download/v${VERSION}/wordcraft-cli-${VERSION}-macos-universal.zip`,sha256:'931f2277a357e7d77266ddceea565450b102ca7bf9e0634821162f7bab616dbe'},
 deckcraft:{url:`https://github.com/storytold/deckcraft/releases/download/v${VERSION}/deckcraft-cli-${VERSION}-macos-universal.zip`,sha256:'1093646863b659c0a40d919cb898d9d7c7a4710e488b4207540d17887e187ed0'},
 gridcraft:{url:`https://github.com/storytold/gridcraft/releases/download/v${VERSION}/gridcraft-cli-${VERSION}-macos-universal.zip`,sha256:'564f7d087b880b7f16aa60ae50a1cbe9d37b4ed449eb29b2646ea584479bab07'},
};
const ENV:Record<CraftName,string>={wordcraft:'PVTA_WORDCRAFT',deckcraft:'PVTA_DECKCRAFT',gridcraft:'PVTA_GRIDCRAFT'};
export interface CraftStatus{supported:boolean;installed:Record<CraftName,boolean>;installing:boolean}

export class CraftTools{
 private job?:Promise<void>;
 constructor(private root:string,private platform:NodeJS.Platform=process.platform,private fetchImpl:typeof fetch=fetch){}
 get supported(){return this.platform==='darwin';}
 private dir(name:CraftName){return path.join(this.root,name);}
 /** Path of an executable CLI, from an explicit override or our own verified install; undefined if absent. */
 async find(name:CraftName){
  const override=process.env[ENV[name]];
  const candidates=[override,path.join(this.dir(name),`${name}-cli`)];
  for(const file of candidates)if(file)try{const s=await fs.stat(file);if(s.isFile()){await fs.access(file,fs.constants.X_OK);return file;}}catch{}
  return undefined;
 }
 async status():Promise<CraftStatus>{
  const installed={} as Record<CraftName,boolean>;
  for(const n of CRAFT_NAMES)installed[n]=!!(await this.find(n));
  return {supported:this.supported,installed,installing:!!this.job};
 }
 /** Download the missing tools, one process at a time. Resolves when all are ready. */
 install(){
  if(!this.supported)return Promise.reject(Error('Bộ xem trước nhẹ hiện chỉ có bản cho macOS.'));
  if(!this.job)this.job=this.installAll().finally(()=>{this.job=undefined;});
  return this.job;
 }
 private async installAll(){
  await fs.mkdir(this.root,{recursive:true,mode:0o700});
  for(const name of CRAFT_NAMES)if(!(await this.find(name)))await this.installOne(name);
 }
 private async installOne(name:CraftName){
  const lock=CRAFT_LOCK[name];
  if(!/^https:\/\/github\.com\/storytold\//.test(lock.url))throw Error('Địa chỉ tải không hợp lệ.');
  const work=await fs.mkdtemp(path.join(os.tmpdir(),`pvta-${name}-`));
  try{
   const response=await this.fetchImpl(lock.url,{signal:AbortSignal.timeout(600_000)});
   if(!response.ok)throw Error(`Không tải được ${name} (${response.status}).`);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(createHash('sha256').update(bytes).digest('hex')!==lock.sha256)throw Error(`Gói ${name} không khớp SHA-256; đã bỏ.`);
   const zip=path.join(work,'cli.zip');await fs.writeFile(zip,bytes);
   const out=path.join(work,'x');await fs.mkdir(out);
   await new Promise<void>((resolve,reject)=>execFile('/usr/bin/unzip',['-q',zip,'-d',out],{timeout:120_000},e=>e?reject(Error(`Không giải nén được ${name}.`)):resolve()));
   const inner=(await fs.readdir(out,{withFileTypes:true})).find(e=>e.isDirectory());
   const bin=inner?path.join(out,inner.name,`${name}-cli`):'';
   if(!bin||!(await fs.stat(bin).then(s=>s.isFile(),()=>false)))throw Error(`Gói ${name} thiếu chương trình.`);
   await fs.chmod(bin,0o755);
   const final=this.dir(name);await fs.rm(final,{recursive:true,force:true});
   await fs.rename(path.join(out,inner!.name),final);
  }finally{await fs.rm(work,{recursive:true,force:true});}
 }
}
