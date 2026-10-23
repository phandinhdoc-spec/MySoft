import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {invokedSkills} from './workflow-resources.js';

/** Tệp lớn hơn ngưỡng chỉ ghi kích thước và thời gian sửa; tệp nhỏ được băm toàn bộ nội dung. */
export const HASH_LIMIT_BYTES=20*1024*1024;
const SKIP=new Set(['node_modules','dist','build','__pycache__']);

function contentHash(file:string):string{
 return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Dấu vân tay của một tệp hoặc thư mục theo nội dung, không chỉ theo mtime.
 * Thư mục chỉ đi sâu 3 cấp, bỏ tệp ẩn và thư mục sinh mã; tệp lỗi được ghi là "missing".
 */
export function fileStamp(file:string,depth=0):unknown {
 try{
  const st=fs.statSync(file);
  const link=fs.lstatSync(file).isSymbolicLink()?fs.realpathSync(file):null;
  if(st.isDirectory()){
   const children=depth<=3?fs.readdirSync(file).filter(n=>!n.startsWith('.')&&!SKIP.has(n)).sort().map(n=>fileStamp(path.join(file,n),depth+1)):null;
   return [file,'dir',link,children];
  }
  if(!st.isFile())return [file,'other',link];
  if(st.size<=HASH_LIMIT_BYTES)return [file,st.size,contentHash(file),link];
  return [file,st.size,st.mtimeMs,st.ctimeMs,link];
 }catch{return [file,'missing'];}
}

/** Tài nguyên mà lượt chạy của một nút đọc: tệp của nút, tệp đính kèm của quy trình, đầu vào, skill và quy tắc được gọi. */
export function resourceDigest(
 step:{prompt:string;files?:string[]},
 wf:{attachments?:string[];input?:{kind:string;value:string}},
 lookup?:{skill(name:string):string|undefined;rules(prompt:string):string},
 stamps=new Map<string,unknown>(),
):string {
 const stamp=(f:string)=>{if(!stamps.has(f))stamps.set(f,fileStamp(f));return stamps.get(f);};
 const input=wf.input&&['file','folder'].includes(wf.input.kind)&&wf.input.value.trim()?[wf.input.value.trim()]:[];
 return createHash('sha256').update(JSON.stringify([
  [...new Set(step.files??[])].map(stamp),
  [...new Set(wf.attachments??[])].map(stamp),
  input.map(stamp),
  invokedSkills(step.prompt).map(name=>[name,lookup?.skill(name)??null]),
  lookup?.rules(step.prompt)??'',
 ])).digest('hex');
}
