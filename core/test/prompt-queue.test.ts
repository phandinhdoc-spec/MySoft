import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {changeQueuedPrompt} from '../src/desktop/prompt-queue';

const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const dir of roots)fs.rmSync(dir,{recursive:true,force:true});roots.length=0;});
const result=(text:string)=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}});
const request=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
async function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-queue-'));roots.push(dir);
 const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
 await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false,reflect:false}});
 const chatId=await request(r,'newChat');const chat=r.store.data.chats.find(c=>c.id===chatId)!;
 chat.title='Test';chat.titleAuto=false;
 const spy=vi.spyOn(r.engine,'run');
 let release!:(text:string)=>void;let started!:()=>void;
 const ready=new Promise<void>(resolve=>{started=resolve;});
 spy.mockImplementationOnce(()=>{started();return new Promise(resolve=>{release=text=>resolve(result(text));});});
 spy.mockResolvedValue(result('Đã tiếp tục.'));
 const running=request(r,'send',{chatId,text:'Soạn bài về nhiệt học'});await ready;
 return {r,chat,chatId,spy,running,release,dir};
}

describe('chat prompt queue',()=>{
 it('pauses remaining prompts when a queued model call fails',async()=>{
  const {r,chat,chatId,spy,running,release}=await setup();
  spy.mockRejectedValueOnce(Error('Mạng bị ngắt'));
  await request(r,'queuePrompt',{chatId,text:'Lượt sẽ lỗi',mode:'queue'});
  await request(r,'queuePrompt',{chatId,text:'Giữ lại lượt sau',mode:'queue'});
  release('Xong lượt đầu');await running;
  await vi.waitFor(()=>expect(chat.promptQueuePaused).toBe(true));
  expect(chat.pendingPrompts?.map(item=>item.text)).toEqual(['Giữ lại lượt sau']);
  expect(spy).toHaveBeenCalledTimes(2);
 });
 it('gives steering priority while keeping normal queued prompts in order',async()=>{
  const {r,chat,chatId,spy,running,release}=await setup();
  await request(r,'queuePrompt',{chatId,text:'Việc chờ',mode:'queue'});
  await request(r,'queuePrompt',{chatId,text:'Bổ sung thứ nhất',mode:'steer'});
  await request(r,'queuePrompt',{chatId,text:'Bổ sung thứ hai',mode:'steer'});
  release('Kết quả tạm');await running;
  await vi.waitFor(()=>expect(chat.messages.filter(m=>m.role==='assistant')).toHaveLength(2));
  const prompt=spy.mock.calls[1]![0].buildPrompt(false,true);
  expect(prompt).toContain('Bổ sung thứ nhất');expect(prompt).toContain('Bổ sung thứ hai');
  expect(prompt).not.toContain('Việc chờ');
  expect(chat.messages.filter(m=>m.role==='user').map(m=>m.text)).toEqual(['Soạn bài về nhiệt học','Bổ sung thứ nhất','Bổ sung thứ hai','Việc chờ']);
 });
 it('runs multiple prompts in edited order, using the preceding answer as context',async()=>{
  const {r,chat,chatId,spy,running,release}=await setup();
  await request(r,'queuePrompt',{chatId,text:'Bổ sung câu hỏi',mode:'queue'});
  const second=await request(r,'queuePrompt',{chatId,text:'Dành cho lớp tám',mode:'queue'}) as {id:string};
  await request(r,'changeQueuedPrompt',{chatId,id:second.id,action:'up'});
  expect(spy).toHaveBeenCalledTimes(1);
  release('Bản bài học đầu tiên');await running;
  await vi.waitFor(()=>expect(chat.messages.filter(m=>m.role==='assistant')).toHaveLength(3));
  expect(chat.messages.filter(m=>m.role==='user').map(m=>m.text)).toEqual(['Soạn bài về nhiệt học','Dành cho lớp tám','Bổ sung câu hỏi']);
  expect(spy.mock.calls[1]![0].buildPrompt(false,true)).toContain('Bản bài học đầu tiên');
  expect(spy.mock.calls[1]![0].buildPrompt(false,true)).toContain('THÔNG TIN BỔ SUNG');
  expect(chat.pendingPrompts).toEqual([]);
 });
 it('incorporates steering before applying stale proposed writes, without aborting the active call',async()=>{
  const {r,chat,chatId,spy,running,release,dir}=await setup();
  await request(r,'queuePrompt',{chatId,text:'Chỉ trao đổi, không tạo tệp',mode:'steer'});
  expect(spy).toHaveBeenCalledTimes(1);
  release('```pvta-action\n'+JSON.stringify({kind:'write_text',path:path.join(dir,'stale.md'),content:'old',reason:'test'})+'\n```');
  await running;
  expect(spy.mock.calls[1]![0].buildPrompt(false,true)).toContain('Chỉ trao đổi, không tạo tệp');
  expect(chat.messages.flatMap(m=>m.actions??[])).toEqual([]);
  expect(chat.messages.filter(m=>m.role==='user').map(m=>m.text)).toContain('Chỉ trao đổi, không tạo tệp');
  expect(chat.pendingPrompts).toEqual([]);
 });
 it('keeps later prompts paused after cancellation, then resumes explicitly',async()=>{
  const {r,chat,chatId,spy,running,release}=await setup();
  const ended=running.catch(()=>undefined);
  await request(r,'queuePrompt',{chatId,text:'Câu tiếp theo',mode:'queue'});
  await request(r,'cancel',{chatId});release('Câu trả lời đã hủy');await ended;
  expect(chat.promptQueuePaused).toBe(true);expect(chat.pendingPrompts).toHaveLength(1);
  expect(spy).toHaveBeenCalledTimes(1);
  await request(r,'changeQueuedPrompt',{chatId,action:'resume'});
  await vi.waitFor(()=>expect(chat.pendingPrompts).toEqual([]));
  await vi.waitFor(()=>expect(chat.messages.at(-1)?.text).toBe('Đã tiếp tục.'));
 });
 it('does not send prompts from another chat, and removes by stable ID',async()=>{
  const {r,chat,chatId,spy,running,release}=await setup();
  const item=await request(r,'queuePrompt',{chatId,text:'Bỏ mục này',mode:'queue'}) as {id:string};
  const otherId=await request(r,'newChat');
  await expect(request(r,'changeQueuedPrompt',{chatId:otherId,id:item.id,action:'remove'})).rejects.toThrow('không còn');
  changeQueuedPrompt(chat,item.id,'remove');
  release('Xong');await running;expect(spy).toHaveBeenCalledTimes(1);
 });
 it('persists pending prompts across restart without automatically executing them',async()=>{
  const {r,chatId,running,release,dir}=await setup();
  await request(r,'queuePrompt',{chatId,text:'Giữ lại sau khi mở ứng dụng',mode:'queue'});
  await request(r,'cancel',{chatId});await running.catch(()=>undefined);release('Dừng');
  r.store.save();const reopened=new DesktopRuntime(()=>{},dir);runtimes.push(reopened);
  expect(reopened.store.data.chats.find(c=>c.id===chatId)?.pendingPrompts?.[0]?.text).toBe('Giữ lại sau khi mở ứng dụng');
  expect(reopened.view().activeChatIds).toEqual([]);
 });
});
