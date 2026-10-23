import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];const prev=process.env.PVTA_BRAIN;
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));if(prev===undefined)delete process.env.PVTA_BRAIN;else process.env.PVTA_BRAIN=prev;});
/** Binary giả: ghi lại mỗi lần được gọi (thư mục làm việc + đối số + phạm vi tệp). */
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-brain-auto-'));roots.push(dir);
 const log=path.join(dir,'calls.log');const fake=path.join(dir,'fake-brain');
 fs.writeFileSync(fake,`#!/bin/sh\necho "$PWD|$*|$PVTA_BRAIN_ONLY" >> "${log}"\necho "TẦNG 1 · TOÀN DỰ ÁN"\n`,{mode:0o755});
 process.env.PVTA_BRAIN=fake;
 const r=new DesktopRuntime(()=>{},path.join(dir,'home'));runtimes.push(r);
 const call=(method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
 const calls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean):[];
 const waitFor=async(f:()=>boolean)=>{for(let i=0;i<100&&!f();i++)await new Promise(x=>setTimeout(x,30));};
 return {dir,call,calls,waitFor,r};
}
describe('Brain tự lập chỉ mục khi có nguồn mới',()=>{
 it('lập chỉ mục ngay khi đưa thư mục vào hội thoại hoặc dự án, không cần gửi tin',async()=>{
  const {dir,call,calls,waitFor,r}=setup();
  r.store.data.projects.push({id:'project',name:'Dự án',rules:''});
  const chatId=await call('newChat',{projectId:'project'});
  const folder=path.join(dir,'data');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'a.md'),'Nội dung');
  const real=fs.realpathSync(folder);
  await call('attach',{chatId,paths:[folder],folder:true});
  await waitFor(()=>calls().some(l=>l.startsWith(real+'|overview')));
  expect(calls().some(l=>l.startsWith(real+'|overview'))).toBe(true);
 });
 it('lập chỉ mục theo đúng tệp lẻ khi chỉ đính kèm tệp',async()=>{
  const {dir,call,calls,waitFor}=setup();
  const chatId=await call('newChat',{});
  const file=path.join(dir,'note.md');fs.writeFileSync(file,'Ghi chú');
  await call('attach',{chatId,paths:[file]});
  await waitFor(()=>calls().some(l=>l.includes('note.md')));
  expect(calls().some(l=>l.includes('|overview')&&l.endsWith('note.md'))).toBe(true);
 });
 it('thêm thư mục vào dự án cũng tự lập chỉ mục',async()=>{
  const {dir,call,calls,waitFor,r}=setup();
  r.store.data.projects.push({id:'p2',name:'P2',rules:''});
  const folder=path.join(dir,'more');fs.mkdirSync(folder);const real=fs.realpathSync(folder);
  await call('projectAddFolders',{projectId:'p2',folders:[folder]});
  await waitFor(()=>calls().some(l=>l.startsWith(real+'|overview')));
  expect(calls().some(l=>l.startsWith(real+'|overview'))).toBe(true);
 });
});
