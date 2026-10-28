import {expect,it} from 'vitest';
import {parseProviderUsage} from '../src/provider-usage';
it('reads Claude plan windows and converts fractional usage and Unix reset times',()=>{
 const parse=(info:unknown)=>parseProviderUsage('claude',JSON.stringify({type:'rate_limit_event',rate_limit_info:info}),123);
 expect(parse({rateLimitType:'five_hour',utilization:.25,resetsAt:1800000000,status:'allowed'})).toEqual({updatedAt:123,fiveHour:{updatedAt:123,usedPercent:25,resetsAt:1800000000000,status:'allowed'}});
 expect(parse({rate_limit_type:'seven_day',utilization:.8,status:'allowed_warning'})).toMatchObject({week:{usedPercent:80,status:'warning'}});
 expect(parse({rateLimitType:'seven_day_opus',utilization:.4})).toBeUndefined();
 expect(parse({rateLimitType:'five_hour',utilization:25})).toBeUndefined();
});
it('uses explicit Codex window lengths rather than assuming primary means 5h',()=>{
 const usage=parseProviderUsage('codex',JSON.stringify({type:'event_msg',payload:{type:'token_count',rate_limits:{primary:{used_percent:19,window_minutes:10080,resets_at:1800000000},secondary:{used_percent:40,window_minutes:300}}}}),1);
 expect(usage).toMatchObject({week:{usedPercent:19,resetsAt:1800000000000},fiveHour:{usedPercent:40}});
 expect(parseProviderUsage('codex',JSON.stringify({rate_limits:{primary:{used_percent:8,window_minutes:60}}}))).toBeUndefined();
 expect(parseProviderUsage('api',JSON.stringify({rate_limits:{primary:{used_percent:8,window_minutes:300}}}))).toBeUndefined();
});
it('reads the full Claude usage snapshot before any model turn, where utilization is already a percent',async()=>{
 const {parseUsageSnapshot}=await import('../src/provider-usage');
 expect(parseUsageSnapshot('claude',{rate_limits_available:true,rate_limits:{five_hour:{utilization:32,resets_at:'2027-01-15T08:00:00Z'},seven_day:{utilization:64,resets_at:'2027-01-19T08:00:00Z'}}},123)).toMatchObject({fiveHour:{usedPercent:32},week:{usedPercent:64}});
});
it('reads Antigravity (agy) quota groups and matches the selected model family',async()=>{
 const {parseUsageSnapshot}=await import('../src/provider-usage');
 const payload={status:'SUCCESS',command:{name:'usage',data:{groups:[
  {name:'Gemini Models',buckets:[{id:'gemini-weekly',window:'weekly',remaining_fraction:0.95,reset_time:'2027-01-19T08:00:00Z'},{id:'gemini-5h',window:'5h',remaining_fraction:0.9,reset_time:'2027-01-15T08:00:00Z'}]},
  {name:'Claude and GPT models',buckets:[{id:'3p-weekly',window:'weekly',remaining_fraction:0.5,reset_time:'2027-01-19T08:00:00Z'},{id:'3p-5h',window:'5h',remaining_fraction:1,reset_time:'2027-01-15T08:00:00Z'}]}
 ]}}};
 const gemini=parseUsageSnapshot('agy',payload,123,'gemini-3.8-flash');
 expect(gemini?.fiveHour?.usedPercent).toBeCloseTo(10,5);
 expect(gemini?.week?.usedPercent).toBeCloseTo(5,5);
 const thirdParty=parseUsageSnapshot('agy',payload,123,'claude-sonnet-5-5');
 expect(thirdParty?.fiveHour?.usedPercent).toBeCloseTo(0,5);
 expect(thirdParty?.week?.usedPercent).toBeCloseTo(50,5);
});
