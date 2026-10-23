import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {execute,type Draft} from './files.js';

/** Quote-aware argv tokenizer, deliberately no shell expansion or evaluation. */
export function editorArgs(text:string):string[]{
  const args:string[]=[];let token='',quote='';
  for(const c of text){if(quote){if(c===quote)quote='';else token+=c;}else if(c==='"'||c==="'")quote=c;else if(/\s/.test(c)){if(token){args.push(token);token='';}}else token+=c;}
  if(quote)throw Error('EDITOR có dấu nháy chưa đóng.');if(token)args.push(token);if(!args.length)throw Error('EDITOR trống.');return args;
}
export async function editExternal(draft:Draft,suspend:()=>void,resume:()=>void){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-cli-edit-'));
  try{
    const file=path.join(dir,path.basename(draft.file));await fs.writeFile(file,draft.text,{mode:0o600});
    const [program,...args]=editorArgs(process.env.VISUAL||process.env.EDITOR||'vi');
    suspend();
    try{await new Promise<void>((resolve,reject)=>{const child=spawn(program!,[...args,file],{stdio:'inherit',shell:false});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Trình soạn thảo thoát với lỗi.')));});}finally{resume();}
    if((await fs.stat(file)).size>1_000_000)throw Error('Bản nháp quá lớn.');draft.text=await fs.readFile(file,'utf8');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}
export async function previewBrowser(text:string,assets:string):Promise<string>{
  const js=await fs.readFile(path.join(assets,'viewer.js'),'utf8');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-cli-preview-'));const file=path.join(dir,'preview.html');
  const source=Buffer.from(text).toString('base64');
  await fs.writeFile(file,`<!doctype html><html lang="vi"><meta charset="utf-8"><title>PVTA · Xem trước</title><style>body{background:#f4f1e9;color:#343c46;font:18px/1.65 system-ui;margin:40px auto;max-width:1000px;padding:0 24px}pre{overflow:auto;background:#e8e5de;padding:20px}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:8px}img{max-width:100%}</style><main></main><script type="text/plain" id="source">${source}</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script></html>`,{mode:0o600});
  await execute(process.platform==='darwin'?'open':process.platform==='win32'?'explorer.exe':'xdg-open',[file]);return dir;
}
