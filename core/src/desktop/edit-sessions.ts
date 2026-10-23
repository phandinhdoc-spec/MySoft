import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export interface EditSession {id:string;source:string;sourceHash:string;versions:string[];cursor:number;revision:number}
export async function fileHash(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
/** Immutable versions live on disk. The manifest is the commit point for each operation. */
export class EditSessions {
 private locks=new Set<string>();
 constructor(private root:string){}
 private dir(id:string){if(!/^[a-f0-9]{64}$/.test(id))throw Error('Phiên chỉnh sửa không hợp lệ.');return path.join(this.root,id);}
 private async persist(s:EditSession){const dir=this.dir(s.id);const temp=path.join(dir,randomUUID()+'.json');try{await fs.writeFile(temp,JSON.stringify(s),{mode:0o600});await fs.rename(temp,path.join(dir,'session.json'));}finally{await fs.rm(temp,{force:true});}}
 async get(id:string):Promise<EditSession>{return JSON.parse(await fs.readFile(path.join(this.dir(id),'session.json'),'utf8'));}
 current(s:EditSession){return path.join(this.dir(s.id),s.versions[s.cursor]!);}
 private async locked<T>(id:string,work:()=>Promise<T>){if(this.locks.has(id))throw Error('Tệp đang cập nhật; hãy thử lại sau.');this.locks.add(id);try{return await work();}finally{this.locks.delete(id);}}
 async find(source:string){const canonical=await fs.realpath(source).catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});if(!canonical)return undefined;const id=createHash('sha256').update(canonical).digest('hex');try{return await this.get(id);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
 async open(source:string){const canonical=await fs.realpath(source);const id=createHash('sha256').update(canonical).digest('hex');return this.locked(id,async()=>{
  const existing=await this.find(canonical);if(existing){
   if(existing.versions.length>1||existing.sourceHash===await fileHash(canonical))return existing;
   // A clean session follows external saves when explicitly reopened.
   await fs.rm(this.dir(id),{recursive:true,force:true});
  }
  await fs.mkdir(this.dir(id),{recursive:true,mode:0o700});const version=randomUUID()+path.extname(canonical);const file=path.join(this.dir(id),version);await fs.copyFile(canonical,file);const sourceHash=await fileHash(file);
  if(sourceHash!==await fileHash(canonical)){await fs.unlink(file);throw Error('Tệp đang được ứng dụng khác lưu. Hãy mở lại.');}
  const s:EditSession={id,source:canonical,sourceHash,versions:[version],cursor:0,revision:0};await this.persist(s);return s;
 });}
 async change(id:string,revision:number,writer:(input:string,output:string)=>Promise<unknown>){return this.locked(id,async()=>{
  const s=await this.get(id);this.check(s,revision);const version=randomUUID()+path.extname(s.source);const output=path.join(this.dir(id),version);
  try{await writer(this.current(s),output);await fs.stat(output);}catch(e){await fs.rm(output,{force:true});throw e;}
  const abandoned=s.versions.slice(s.cursor+1);s.versions=[...s.versions.slice(0,s.cursor+1),version];s.cursor++;s.revision++;
  try{await this.persist(s);}catch(e){await fs.rm(output,{force:true});throw e;}await Promise.all(abandoned.map(v=>fs.rm(path.join(this.dir(id),v),{force:true}).catch(()=>{})));return s;
 });}
 async move(id:string,revision:number,direction:-1|1){return this.locked(id,async()=>{const s=await this.get(id);this.check(s,revision);const next=s.cursor+direction;if(next<0||next>=s.versions.length)throw Error('Không còn bước hoàn tác/làm lại.');s.cursor=next;s.revision++;await this.persist(s);return s;});}
 private check(s:EditSession,revision:number){if(s.revision!==revision)throw Error('Bản nháp đã đổi. Tải lại trước khi chỉnh sửa.');}
 async save(id:string,revision:number,destination?:string){return this.locked(id,async()=>{
  const s=await this.get(id);this.check(s,revision);const target=destination??s.source;
  if(!path.isAbsolute(target)||path.extname(target).toLowerCase()!==path.extname(s.source).toLowerCase())throw Error('Chọn đường dẫn tuyệt đối cùng định dạng.');
  const same=!destination||path.resolve(target)===s.source;
  if(!same&&await this.find(target).catch(e=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}))throw Error('Tệp đích đang có phiên chỉnh sửa.');
  const temp=path.join(path.dirname(target),'.pvta-'+randomUUID()+path.extname(target));
  await fs.copyFile(this.current(s),temp);
  try{
   if(same){if(await fileHash(s.source)!==s.sourceHash)throw Error('Tệp gốc đã đổi bên ngoài PVTA. Chọn Lưu thành… để giữ cả hai bản.');const stat=await fs.stat(s.source);await fs.chmod(temp,stat.mode);await fs.rename(temp,s.source);}
   else {await fs.link(temp,target);await fs.unlink(temp);} // Exclusive publication: never overwrite Save As destinations.
  }catch(e){await fs.rm(temp,{force:true});throw e;}
  // Keep history if publication or manifest update fails. Clean only after the new baseline is durable.
  const kept=s.versions[s.cursor]!;const old=s.versions.filter(v=>v!==kept);s.versions=[kept];s.cursor=0;s.revision++;s.sourceHash=await fileHash(this.current(s));
  if(!same){const next=await this.open(target);await fs.rm(this.dir(id),{recursive:true,force:true});return next;}
  await this.persist(s);await Promise.all(old.map(v=>fs.rm(path.join(this.dir(id),v),{force:true}).catch(()=>{})));return s;
 });}
 async discard(id:string,revision:number){return this.locked(id,async()=>{const s=await this.get(id);this.check(s,revision);await fs.rm(this.dir(id),{recursive:true,force:true});});}
}
