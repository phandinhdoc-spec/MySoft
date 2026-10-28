import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {agyWorkspace,prepareAgyWorkspace} from '../src/desktop/agy-workspace';
import {DesktopRuntime} from '../src/desktop/runtime';

const roots:string[]=[];
const runtimes:DesktopRuntime[]=[];
afterEach(async()=>{for(const runtime of runtimes.splice(0))runtime.dispose();for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function setup(){const home=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-agy-'));roots.push(home);return home;}
async function manifest(cwd:string){const entries=await fs.readdir(cwd);const dir=entries.find(x=>x.startsWith('input-'))!;return JSON.parse(await fs.readFile(path.join(cwd,dir,'manifest.json'),'utf8')) as {original:string;copy:string}[];}

describe('AGY inputs prepared by PVTA',()=>{
 it('copies same-name files separately and uses the current draft without changing originals',async()=>{
  const home=await setup();const a=path.join(home,'a'),b=path.join(home,'b');await fs.mkdir(a);await fs.mkdir(b);
  const first=path.join(a,'Bài học.txt'),second=path.join(b,'Bài học.txt'),draft=path.join(home,'draft.txt');
  await fs.writeFile(first,'original');await fs.writeFile(second,'second');await fs.writeFile(draft,'current draft');
  const result=await prepareAgyWorkspace(home,'chat:1',[{original:first,source:draft},{original:second,source:second}],new AbortController().signal);
  const files=await manifest(result.cwd);
  expect(files.map(f=>f.original)).toEqual([first,second]);
  expect(files[0]!.copy).not.toBe(files[1]!.copy);
  expect(await fs.readFile(files[0]!.copy,'utf8')).toBe('current draft');
  expect(await fs.readFile(files[1]!.copy,'utf8')).toBe('second');
  expect(await fs.readFile(first,'utf8')).toBe('original');
  expect(result.prompt).not.toContain('current draft');
 });
 it('cleans partial snapshots when a source is missing and stops cancelled preparation',async()=>{
  const home=await setup();const source=path.join(home,'file.txt');await fs.writeFile(source,'ok');
  await expect(prepareAgyWorkspace(home,'chat:1',[{original:source,source},{original:'missing',source:path.join(home,'missing')}],new AbortController().signal)).rejects.toThrow();
  expect(await fs.readdir(agyWorkspace(home,'chat:1'))).toEqual([]);
  const ctl=new AbortController();ctl.abort();
  await expect(prepareAgyWorkspace(home,'chat:1',[],ctl.signal)).rejects.toThrow();
 });
 it('desktop stages attachments before invoking AGY and removes the workspace on chat cleanup',async()=>{
  const home=await setup();const runtime=new DesktopRuntime(()=>{},home);runtimes.push(runtime);
  const r=runtime as any;
  const original=path.join(home,'Nguồn.txt');await fs.writeFile(original,'Tài liệu rất dài '.repeat(5000));
  const chatId=await runtime.dispatch({id:'new',method:'newChat',params:{}}) as string;
  runtime.store.data.attachments.push({id:'f',scope:'chat',scopeId:chatId,name:'Nguồn.txt',path:original,segments:[],fingerprint:'x',at:Date.now(),bytes:1});
  const spy=vi.spyOn(runtime.engine,'run').mockImplementation(async req=>{
   expect(req.cwd).toBe(agyWorkspace(home,'chat:'+chatId));
   const copies=await manifest(req.cwd);
   expect(await fs.readFile(copies[0]!.copy,'utf8')).toBe(await fs.readFile(original,'utf8'));
   expect(req.buildPrompt(false,false)).toContain('manifest.json');
   expect(req.buildPrompt(false,false)).not.toContain('Bạn không có quyền tự ghi, mở');
   expect(req.workspaceDirs).toEqual([home]);
   return {text:'Đã đọc',attempts:1,fullPrompt:true,timings:{totalMs:0}};
  });
  const result=await r.taskContext.run({kind:'chat',chatId},()=>r.executeModel('Đọc file','Bạn không có quyền tự ghi, mở, di chuyển, xóa file hay chạy lệnh.',new AbortController().signal,undefined,{backend:'agy',model:'test'},undefined,false,{cwd:home,permission:'full'}));
  expect(result).toBe('Đã đọc');expect(spy).toHaveBeenCalledOnce();
  await runtime.dispatch({id:'delete',method:'deleteChat',params:{chatId}});
  await expect(fs.stat(agyWorkspace(home,'chat:'+chatId))).rejects.toThrow();
  expect(await fs.readFile(original,'utf8')).toContain('Tài liệu');
 });
});
