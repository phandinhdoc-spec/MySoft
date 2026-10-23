import {describe,expect,it} from 'vitest';
import {ApiClient} from '../src/api';

describe('API transport diagnostics',()=>{
  it.each([
    ['ETIMEDOUT','Chưa kiểm tra được khóa API'],
    ['UND_ERR_CONNECT_TIMEOUT','Chưa kiểm tra được khóa API'],
    ['ENOTFOUND','DNS'],
    ['CERT_HAS_EXPIRED','TLS'],
    ['ECONNREFUSED','từ chối kết nối mạng'],
  ])('explains %s without leaking nested error messages',async(code,expected)=>{
    const cause=Object.assign(new Error('secret-from-transport'),{code});
    const failure=new TypeError('fetch failed',{cause:new AggregateError([cause])});
    const api=new ApiClient({settings:()=>({commandcode:{key:'private-test-key'}}),fetch:async()=>{throw failure;}});
    const error=await api.listModels('commandcode').catch(e=>e);
    expect(error.message).toContain(expected);
    expect(error.message).not.toContain('secret-from-transport');
    expect(error.message).not.toContain('private-test-key');
    await expect(api.run({backend:'api',model:'commandcode/vendor/model',cwd:'/tmp',permission:'read',buildPrompt:()=> 'Hello'})).rejects.toThrow(expected);
  });
  it('still identifies authentication errors only after an HTTP response',async()=>{
    const api=new ApiClient({settings:()=>({commandcode:{key:'private-test-key'}}),fetch:async()=>new Response('{}',{status:401})});
    await expect(api.listModels('commandcode')).rejects.toThrow('Khóa API không hợp lệ');
  });
});

it('unlimited API requests have no local timeout but still observe cancellation',async()=>{
 const ctl=new AbortController();let started!:()=>void;const entered=new Promise<void>(r=>started=r);
 const api=new ApiClient({settings:()=>({commandcode:{key:'test'}}),fetch:async(_url,options)=>{
  const signal=options?.signal;expect(signal?.aborted).toBe(false);started();return new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 }});
 const pending=api.run({backend:'api',model:'commandcode/vendor/model',cwd:'/tmp',permission:'read',timeoutMs:0,signal:ctl.signal,buildPrompt:()=> 'Hello'});const rejected=expect(pending).rejects.toThrow('Đã hủy');await entered;await new Promise(resolve=>setTimeout(resolve,20));ctl.abort();await rejected;
});
it('sends Command Code DeepSeek reasoning effort to the actual API request',async()=>{
 let body:any;const api=new ApiClient({settings:()=>({commandcode:{key:'test'}}),fetch:async(_url,options)=>{body=JSON.parse(String(options?.body));return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n');}});
 await api.run({backend:'api',model:'commandcode/deepseek/deepseek-v4-flash',effort:'max',cwd:'/tmp',permission:'read',buildPrompt:()=> 'Hello'});
 expect(body.reasoning_effort).toBe('max');expect(body.thinking).toEqual({type:'enabled'});
});
it('reads account-scoped Command Code quota percentages without running a model',async()=>{
 const urls:string[]=[];let calls=0;
 const api=new ApiClient({settings:()=>({commandcode:{key:'quota-test'}}),fetch:async(url,options)=>{
  urls.push(String(url));calls++;expect(options?.method).toBeUndefined();expect(options?.redirect).toBe('error');expect((options?.headers as any).authorization).toBe('Bearer quota-test');
  return Response.json(String(url).includes('whoami')?{org:{id:'school/1'}}:{windowLimits:{limited:true,fiveHour:{used:4,cap:10,resetAt:Date.now()+300000},weekly:{used:6,cap:20,resetAt:Date.now()+600000}}});
 }});
 const usage=await api.readUsage('commandcode');expect(usage.fiveHour?.usedPercent).toBe(40);expect(usage.week?.usedPercent).toBe(30);expect(urls[1]).toBe('https://api.commandcode.ai/alpha/billing/credits?orgId=school%2F1');
 await api.readUsage('commandcode');expect(calls).toBe(2);await api.readUsage('commandcode',true);expect(calls).toBe(4);
});
it('refuses quota credential forwarding and distinguishes unlimited plans from missing data',async()=>{
 let calls=0;const custom=new ApiClient({settings:()=>({commandcode:{key:'private-test',baseUrl:'https://other.example/v1'}}),fetch:async()=>{calls++;return Response.json({});}});
 await expect(custom.readUsage('commandcode')).rejects.toThrow('chính thức');expect(calls).toBe(0);
 let unlimited=true;const api=new ApiClient({settings:()=>({commandcode:{key:'private-test'}}),fetch:async(url)=>Response.json(String(url).includes('whoami')?{}:{windowLimits:unlimited?{limited:false}:{limited:true,fiveHour:{used:1,cap:0}}})});
 expect(await api.readUsage('commandcode')).toMatchObject({unlimited:true});unlimited=false;await expect(api.readUsage('commandcode',true)).rejects.toThrow('chưa cung cấp');
});
