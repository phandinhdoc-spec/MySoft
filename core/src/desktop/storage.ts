import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DesktopData } from './types.js';
import { defaultRefineSettings } from './refine/settings.js';
export const uid = () => crypto.randomUUID();
export function atomicJson(file:string,value:unknown):void {
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const temp=`${file}.${uid()}.tmp`;
 try { fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600,flush:true});fs.renameSync(temp,file);fs.chmodSync(file,0o600);if(process.platform!=='win32'){const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}} }
 finally { if(fs.existsSync(temp))fs.unlinkSync(temp); }
}
export class DesktopStore {
 readonly file:string;
 data:DesktopData;
 constructor(readonly home:string){
  this.file=path.join(home,'chatbox','state.json');
  this.data={version:1,chats:[],projects:[],attachments:[],learned:[],preferences:{theme:'system',palette:'paper',fontSize:16,learning:true,hints:true,rag:true,rules:'',choice:'auto',mode:'standard',bridge:false,refine:defaultRefineSettings()}};
  if(fs.existsSync(this.file)){
   let d:DesktopData;
   try {d=JSON.parse(fs.readFileSync(this.file,'utf8'));if(d.version!==1||!Array.isArray(d.chats)||!Array.isArray(d.projects)||!Array.isArray(d.attachments)||!Array.isArray(d.learned))throw Error('Sai định dạng');}
   catch {throw Error(`Không đọc được dữ liệu ${this.file}. Hãy khôi phục bản sao lưu; PVTA giữ nguyên tệp.`);}
   this.data={...this.data,...d,preferences:{...this.data.preferences,...d.preferences}};
  }
 }
 save(){atomicJson(this.file,this.data);}
}
