import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));});
async function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-project-files-'));roots.push(dir);
 const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
 const call=(method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
 r.store.data.projects.push({id:'project',name:'Dự án',rules:''});
 const chatId=await call('newChat',{projectId:'project'});
 const source=path.join(dir,'source.md');fs.writeFileSync(source,'Nội dung gốc');
 const dest=path.join(dir,'destination');fs.mkdirSync(dest);
 await call('attach',{chatId,paths:[source]});
 const attachmentId=r.store.data.attachments[0]!.id;
 return {r,call,chatId,attachmentId,source,dest};
}
describe('project attachment copies',()=>{
 it('copies a conversation file into the selected folder and indexes it for the project',async()=>{
  const {r,call,chatId,attachmentId,source,dest}=await setup();
  const result=await call('copyAttachmentToProject',{chatId,attachmentId,dir:dest});
  expect(result.errors).toEqual([]);expect(fs.readFileSync(result.path,'utf8')).toBe('Nội dung gốc');
  expect(fs.readFileSync(source,'utf8')).toBe('Nội dung gốc');
  expect(r.store.data.attachments).toEqual(expect.arrayContaining([expect.objectContaining({id:attachmentId,scope:'chat'}),expect.objectContaining({path:result.path,scope:'project',scopeId:'project'})]));
 });
 it('never overwrites an existing destination',async()=>{
  const {call,chatId,attachmentId,dest}=await setup();const target=path.join(dest,'source.md');fs.writeFileSync(target,'Giữ nguyên');
  await expect(call('copyAttachmentToProject',{chatId,attachmentId,dir:dest})).rejects.toThrow('cùng tên');
  expect(fs.readFileSync(target,'utf8')).toBe('Giữ nguyên');
 });
 it('rejects copying an attachment from another conversation',async()=>{
  const {call,attachmentId,dest}=await setup();const chatId=await call('newChat',{projectId:'project'});
  await expect(call('copyAttachmentToProject',{chatId,attachmentId,dir:dest})).rejects.toThrow('hội thoại');expect(fs.readdirSync(dest)).toEqual([]);
 });
 it('only previews images belonging to the current context',async()=>{
  const {r,call,chatId,attachmentId}=await setup();const a=r.store.data.attachments.find(a=>a.id===attachmentId)!;
  a.path=a.path.replace('.md','.png');a.image=true;fs.writeFileSync(a.path,Buffer.from('image bytes'));
  expect(await call('attachmentImage',{chatId,attachmentId})).toBe('data:image/png;base64,aW1hZ2UgYnl0ZXM=');
  const other=await call('newChat');await expect(call('attachmentImage',{chatId:other,attachmentId})).rejects.toThrow('hội thoại');
 });
});
