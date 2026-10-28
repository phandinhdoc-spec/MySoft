import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Engine, type RunRequest} from '../src/engine';
import {ProbeStore} from '../src/probe';
import {streamBatch} from '../src/stream-batch';

const roots:string[]=[];
afterEach(()=>{vi.useRealTimers();for(const root of roots)fs.rmSync(root,{recursive:true,force:true});roots.length=0;});
const result={text:'ok',attempts:1,fullPrompt:true,timings:{totalMs:0}};
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-resources-'));roots.push(dir);
 const started:string[]=[];const releases:Array<()=>void>=[];
 const api={run:vi.fn(async(q:RunRequest)=>{started.push(q.model);await new Promise<void>(resolve=>releases.push(resolve));return result;})};
 const engine=new Engine({probe:new ProbeStore(path.join(dir,'probe.json')),api});
 const request=(model:string,extra:Partial<RunRequest>={})=>engine.run({backend:'api',model,cwd:dir,permission:'read',buildPrompt:()=>'',...extra});
 return {engine,request,started,releases};
}
describe('provider resource budget',()=>{
 it('does not spawn idle CLI processes by default',async()=>{
  const {engine}=setup();
  expect(await engine.prewarm({backend:'claude',model:'default',cwd:os.tmpdir(),permission:'read'})).toBe(false);
 });
 it('runs one provider at a time and serves foreground before queued background work',async()=>{
  const {request,started,releases}=setup();
  const a=request('active');await vi.waitFor(()=>expect(started).toEqual(['active']));
  const b=request('background',{priority:'background'});const c=request('foreground');
  await new Promise(resolve=>setTimeout(resolve,10));expect(started).toEqual(['active']);
  releases.shift()!();await a;await vi.waitFor(()=>expect(started).toEqual(['active','foreground']));
  releases.shift()!();await c;await vi.waitFor(()=>expect(started).toEqual(['active','foreground','background']));
  releases.shift()!();await b;
 });
 it('removes cancelled queued work without calling its provider',async()=>{
  const {request,started,releases}=setup();const a=request('active');
  await vi.waitFor(()=>expect(started).toEqual(['active']));
  const ctl=new AbortController();const b=request('cancelled',{signal:ctl.signal});
  const rejected=expect(b).rejects.toThrow();ctl.abort();await rejected;
  releases.shift()!();await a;expect(started).toEqual(['active']);
 });
 it('releases the queue after a provider failure',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-queue-error-'));roots.push(dir);
  const api={run:vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(result)};
  const engine=new Engine({probe:new ProbeStore(path.join(dir,'probe.json')),api});
  const q:RunRequest={backend:'api',model:'mock',cwd:dir,permission:'read',buildPrompt:()=>''};
  const a=expect(engine.run(q)).rejects.toThrow('failed'),b=engine.run(q);
  await a;expect(await b).toEqual(result);
 });
 it('batches 1000 Unicode deltas without dropping the final partial batch',()=>{
  vi.useFakeTimers();const emit=vi.fn();const ctl=new AbortController();const batch=streamBatch(emit,ctl.signal);
  const text='Tiếng Việt 👩🏽‍💻\n'.repeat(1000);for(const char of text)batch.push(char);
  expect(emit).not.toHaveBeenCalled();vi.advanceTimersByTime(75);
  expect(emit).toHaveBeenCalledTimes(1);expect(emit).toHaveBeenLastCalledWith(text);
  batch.push('cuối');batch.flush();expect(emit.mock.calls.map(([s])=>s).join('')).toBe(text+'cuối');
  batch.push('đã hủy');ctl.abort();batch.flush();vi.runOnlyPendingTimers();expect(emit).toHaveBeenCalledTimes(2);
 });
});
