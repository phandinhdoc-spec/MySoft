import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-chatmodel-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.store.data.documentsDir=path.join(dir,'Documents');return {r,spy:vi.spyOn(r.engine,'run')};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const reply=(text='ok')=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}} as never);
describe('model riêng của từng hội thoại',()=>{
 it('mỗi hội thoại giữ model đã chọn, hội thoại mới theo mặc định',async()=>{
  const {r,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/default'}}});
  const used:string[]=[];
  spy.mockImplementation(async(q:any)=>{if(!/Đặt một tên|Tóm tắt/.test(q.system??''))used.push(q.model);return reply();});
  const a=await req(r,'newChat') as string,b=await req(r,'newChat') as string;
  await req(r,'chatModel',{chatId:a,choice:{backend:'api',model:'openai/gemini-x'}});
  await req(r,'chatModel',{chatId:b,choice:{backend:'api',model:'openai/sonnet-x'}});
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/default2'}}});
  await req(r,'send',{chatId:a,text:'một'});await req(r,'send',{chatId:b,text:'hai'});await req(r,'send',{chatId:a,text:'ba'});
  expect(used.slice(0,3)).toEqual(['openai/gemini-x','openai/sonnet-x','openai/gemini-x']);
  const c=await req(r,'newChat') as string;await req(r,'send',{chatId:c,text:'bốn'});
  expect(used[3]).toBe('openai/default2');
 });
 it('hội thoại chưa chọn riêng được ghim theo mặc định lúc gửi đầu tiên',async()=>{
  const {r,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/m1'}}});
  const used:string[]=[];spy.mockImplementation(async(q:any)=>{if(!/Đặt một tên|Tóm tắt/.test(q.system??''))used.push(q.model);return reply();});
  const a=await req(r,'newChat') as string;await req(r,'send',{chatId:a,text:'một'});
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/m2'}}});
  await req(r,'send',{chatId:a,text:'hai'});
  expect(used).toEqual(['openai/m1','openai/m1']);
 });
 it('từ chối model không hợp lệ và có thể xóa lựa chọn riêng',async()=>{
  const {r}=setup();const a=await req(r,'newChat') as string;
  await expect(req(r,'chatModel',{chatId:a,choice:{backend:'x',model:'m'}})).rejects.toThrow();
  await req(r,'chatModel',{chatId:a,choice:{backend:'api',model:'openai/z'}});
  await req(r,'chatModel',{chatId:a,choice:null});
  expect(r.view().data.chats.find(c=>c.id===a)!.choice).toBeUndefined();
 });
});
