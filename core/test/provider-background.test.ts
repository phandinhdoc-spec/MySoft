import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import type {Chat} from '../src/desktop/types';
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;vi.useRealTimers();for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
async function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-background-'));roots.push(dir);
 const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
 const id=await r.dispatch({id:'new',method:'newChat',params:{}});
 const c=r.store.data.chats.find(x=>x.id===id)!;c.projectId='project';
 r.store.data.preferences.choice={backend:'api',model:'openai/mock'};
 const add=()=>{for(const role of ['user','assistant'] as const)c.messages.push({id:crypto.randomUUID(),role,text:'Nội dung '+c.messages.length,at:Date.now()});};
 const schedule=()=> (r as unknown as {scheduleSummary(c:Chat):void}).scheduleSummary(c);
 const spy=vi.spyOn(r.engine,'run').mockResolvedValue({text:'Tóm tắt',fullPrompt:true,attempts:1,timings:{totalMs:0}});
 return {r,c,add,schedule,spy};
}
describe('automatic provider work',()=>{
 it('coalesces summaries and waits for enough new content before summarizing again',async()=>{
  const {c,add,schedule,spy}=await setup();vi.useFakeTimers();add();schedule();
  await vi.advanceTimersByTimeAsync(5000);add();schedule();
  await vi.advanceTimersByTimeAsync(5000);expect(spy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);expect(spy).toHaveBeenCalledTimes(1);
  expect(c.summary).toBe('Tóm tắt');expect(spy.mock.calls[0]![0].priority).toBe('background');
  schedule();add();schedule();await vi.advanceTimersByTimeAsync(10_000);expect(spy).toHaveBeenCalledTimes(1);
  add();schedule();await vi.advanceTimersByTimeAsync(10_000);expect(spy).toHaveBeenCalledTimes(2);
 });
 it('drops superseded summary results and stops background work at disposal',async()=>{
  const {r,c,add,schedule,spy}=await setup();vi.useFakeTimers();
  let finish!:(value:any)=>void;spy.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  add();schedule();await vi.advanceTimersByTimeAsync(10_000);
  const old=spy.mock.calls[0]![0].signal!;add();schedule();expect(old.aborted).toBe(true);
  finish({text:'STALE',fullPrompt:true,attempts:1,timings:{totalMs:0}});
  await vi.advanceTimersByTimeAsync(0);expect(c.summary).toBe('');
  r.dispose();await vi.advanceTimersByTimeAsync(20_000);expect(spy).toHaveBeenCalledTimes(1);
 });
 it('batches at the actual Desktop model boundary and flushes before returning',async()=>{
  const {r,spy}=await setup();vi.useFakeTimers();
  const output=vi.fn();const text='Tiếng Việt nguyên vẹn 👋'.repeat(1000);
  spy.mockImplementationOnce(async q=>{for(const ch of text)q.onDelta?.(ch);return {text,fullPrompt:true,attempts:1,timings:{totalMs:0}};});
  const call=r as unknown as {model(text:string,system:string,signal:AbortSignal,onDelta:(s:string)=>void):Promise<string>};
  expect(await call.model('x','system',new AbortController().signal,output)).toBe(text);
  expect(output).toHaveBeenCalledTimes(1);expect(output).toHaveBeenCalledWith(text);
  await vi.advanceTimersByTimeAsync(100);expect(output).toHaveBeenCalledTimes(1);
 });
});
