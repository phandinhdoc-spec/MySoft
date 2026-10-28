import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ChildProcess} from 'node:child_process';
import {expect,it,vi} from 'vitest';
import {readProviderUsage} from '../src/desktop/usage-reader';
function fake(respond:(value:any)=>unknown){
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>true)});
 const sent:any[]=[];child.stdin.on('data',chunk=>{const value=JSON.parse(String(chunk));sent.push(value);const response=respond(value);if(response)queueMicrotask(()=>child.stdout.write(JSON.stringify(response)+'\n'));});return {child:child as unknown as ChildProcess,sent,kill:child.kill};
}
it('reads Claude quota through control requests only, with no user prompt or inference',async()=>{
 const process=fake(value=>({type:'control_response',response:{request_id:value.request_id,subtype:'success',response:value.request.subtype==='initialize'?{}:{rate_limits_available:true,rate_limits:{five_hour:{utilization:4},seven_day:{utilization:24}}}}}));
 const usage=await readProviderUsage('claude',{spawn:()=>process.child});expect(usage).toMatchObject({fiveHour:{usedPercent:4},week:{usedPercent:24}});expect(process.sent.map(value=>value.request.subtype)).toEqual(['initialize','get_usage']);expect(process.sent.every(value=>value.type==='control_request')).toBe(true);expect(process.kill).toHaveBeenCalledOnce();
});
it('reports unavailable percentages and closes the process instead of manufacturing quota',async()=>{
 const process=fake(value=>({type:'control_response',response:{request_id:value.request_id,subtype:'success',response:{rate_limits_available:true,rate_limits:null}}}));
 await expect(readProviderUsage('claude',{spawn:()=>process.child})).rejects.toThrow('chưa trả số phần trăm');expect(process.kill).toHaveBeenCalledOnce();
});
it('reads Codex account limits without starting a thread or turn',async()=>{
 const process=fake(value=>value.id===1?{id:1,result:{}}:value.id===2?{id:2,result:{rateLimits:{primary:{usedPercent:12,windowDurationMins:300},secondary:{usedPercent:30,windowDurationMins:10080}}}}:undefined);
 expect(await readProviderUsage('codex',{spawn:()=>process.child})).toMatchObject({fiveHour:{usedPercent:12},week:{usedPercent:30}});expect(process.sent.map(value=>value.method)).toEqual(['initialize','initialized','account/rateLimits/read']);
});
it('reads Antigravity (agy) quota through /usage JSON output without sending a user prompt',async()=>{
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>true)});
 queueMicrotask(()=>child.stdout.write(JSON.stringify({status:'SUCCESS',command:{name:'usage',data:{groups:[{name:'Gemini Models',buckets:[{id:'gemini-5h',window:'5h',remaining_fraction:0.8},{id:'gemini-weekly',window:'weekly',remaining_fraction:0.75}]}]}}})+'\n'));
 const usage=await readProviderUsage('agy',{model:'gemini-3.8-flash',spawn:()=>child as unknown as ChildProcess});
 expect(usage.fiveHour?.usedPercent).toBeCloseTo(20,5);
 expect(usage.week?.usedPercent).toBeCloseTo(25,5);
 expect(child.kill).toHaveBeenCalledOnce();
});
it('cancels quota reads and terminates the child on abort',async()=>{
 const process=fake(()=>undefined),controller=new AbortController();const task=readProviderUsage('claude',{spawn:()=>process.child,signal:controller.signal});controller.abort();await expect(task).rejects.toThrow('Đã dừng');expect(process.kill).toHaveBeenCalledOnce();
});
