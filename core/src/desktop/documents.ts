import {pythonEnvironment} from './bundled-runtime.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import {ensurePython,supportForJob} from './python.js';
export function pythonScript():string {
 if(process.env.PVTA_PYTHON_SCRIPT)return process.env.PVTA_PYTHON_SCRIPT;
 return fileURLToPath(new URL('../../python/documents.py',import.meta.url));
}
export async function pythonJob(input:unknown,signal?:AbortSignal,timeoutMs=120_000):Promise<any>{
 const job=input as {op?:string;path?:string;output?:string};
 if(signal?.aborted)throw Error('Đã hủy.');
 const bin=await ensurePython(supportForJob(job));
 if(signal?.aborted)throw Error('Đã hủy.');
 return await new Promise((resolve,reject)=>{
  const child=execFile(bin,[pythonScript()],{env:pythonEnvironment(),timeout:timeoutMs,maxBuffer:Number.MAX_SAFE_INTEGER,signal,windowsHide:true},(err,out)=>{
   if(err){reject(err);return;}
   try{const parsed=JSON.parse(out);if(parsed.error)reject(Error(parsed.error));else resolve(parsed);}catch(e){reject(e);}
  });child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify(input));
 });
}
export const SUPPORTED=new Set(['.docx','.xlsx','.pptx','.pdf','.txt','.md','.typ','.csv','.png','.jpg','.jpeg','.webp']);
export async function extract(file:string,signal?:AbortSignal){
 const stat=await fs.stat(file);if(!stat.isFile())throw Error('Chỉ nhận tệp.');
 const ext=path.extname(file).toLowerCase();if(!SUPPORTED.has(ext))throw Error(`Chưa hỗ trợ ${ext}.`);
 if(['.png','.jpg','.jpeg','.webp'].includes(ext))return {segments:[],image:true};
 if(['.txt','.md','.typ','.csv'].includes(ext)){
  const text=await fs.readFile(file,'utf8');return {segments:text.split(/\r?\n/).map((text,i)=>({ref:`Dòng ${i+1}`,text})),image:false};
 }
 // Không giới hạn dung lượng: thời gian chờ tăng theo cỡ tệp (tối thiểu 2 phút, thêm 1 phút mỗi 25 MB).
 return {...await pythonJob({op:'extract',path:file},signal,120_000+Math.ceil(stat.size/(25*1024*1024))*60_000),image:false};
}
