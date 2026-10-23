import {describe,it,expect,vi,afterEach} from 'vitest';
import {UrgencyGovernor,isRateLimit,normalLimit,parseMacPressure,pressureFromFree,urgentLimit,URGENT_MAX,type MemoryPressure} from '../src/desktop/urgency';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows';

const GB=1024**3;
afterEach(()=>{vi.useRealTimers();});

describe('áp lực RAM',()=>{
 it('đọc đúng mức của macOS',()=>{
  expect(parseMacPressure('1\n')).toBe('normal');
  expect(parseMacPressure('2')).toBe('warn');
  expect(parseMacPressure('4')).toBe('critical');
  expect(parseMacPressure('')).toBe('unknown');
 });
 it('ước lượng theo RAM trống ở hệ khác',()=>{
  expect(pressureFromFree(4*GB,16*GB)).toBe('normal');
  expect(pressureFromFree(2*GB,16*GB)).toBe('warn');
  expect(pressureFromFree(GB,16*GB)).toBe('critical');
 });
});

describe('số bước song song',()=>{
 const mac={cpus:10,total:16*GB,free:0.5*GB,platform:'darwin'};
 it('cờ đỏ tính theo CPU/RAM, có trần',()=>{
  expect(urgentLimit({...mac,pressure:'normal'})).toBe(8);
  expect(urgentLimit({...mac,cpus:64,total:256*GB,pressure:'normal'})).toBe(URGENT_MAX);
  expect(urgentLimit({...mac,cpus:4,pressure:'normal'})).toBe(3);
  expect(urgentLimit({cpus:8,total:8*GB,free:2.7*GB,platform:'linux',pressure:'normal'})).toBe(2);
 });
 it('áp lực vàng hoặc đỏ thì không ép thêm',()=>{
  expect(urgentLimit({...mac,pressure:'warn'})).toBe(1);
  expect(urgentLimit({...mac,pressure:'critical'})).toBe(1);
  expect(normalLimit(3,'warn')).toBe(1);
  expect(normalLimit(3,'normal')).toBe(3);
 });
 it('lỗi 429 giảm một nửa',()=>{
  expect(urgentLimit({...mac,pressure:'normal',backoff:1})).toBe(4);
  expect(urgentLimit({...mac,pressure:'normal',backoff:3})).toBe(1);
  expect(isRateLimit('HTTP 429 Too Many Requests')).toBe(true);
  expect(isRateLimit('Rate limit exceeded')).toBe(true);
  expect(isRateLimit('Không đọc được tệp')).toBe(false);
 });
});

describe('UrgencyGovernor',()=>{
 const make=(pressure:{v:MemoryPressure})=>{let t=1_000_000;const g=new UrgencyGovernor({changed:()=>{},now:()=>t,sample:async()=>pressure.v,cpus:()=>10,total:()=>16*GB,free:()=>GB,platform:'darwin'});return {g,tick:(ms:number)=>{t+=ms;}};};
 it('cờ xanh giữ cấu hình quy trình; cờ đỏ dùng máy',async()=>{
  const {g}=make({v:'normal'});
  expect(await g.limit(2)).toBe(2);
  g.set(true);expect(await g.limit(2)).toBe(8);
  expect(g.view().note).toContain('Cờ đỏ');
  g.dispose();
 });
 it('phanh khi áp lực RAM lên vàng giữa chừng',async()=>{
  const p={v:'normal' as MemoryPressure};const {g,tick}=make(p);g.set(true);
  expect(await g.limit(2)).toBe(8);
  p.v='warn';tick(5000);
  expect(await g.limit(2)).toBe(1);
  expect(g.view().note).toContain('mức vàng');
  g.dispose();
 });
 it('tự về xanh sau 30 phút hoặc khi đã dùng xong',async()=>{
  const {g,tick}=make({v:'normal'});
  g.set(true);g.idle();expect(g.isUrgent()).toBe(true); // chưa chạy gì thì giữ cờ
  await g.limit(2);g.idle();expect(g.isUrgent()).toBe(false);
  g.set(true);tick(30*60_000);expect(g.isUrgent()).toBe(false);
  g.dispose();
 });
 it('429 giảm số bước rồi hồi phục sau 5 phút',async()=>{
  const {g,tick}=make({v:'normal'});g.set(true);
  g.rateLimited();expect(await g.limit(2)).toBe(4);
  tick(5*60_000+1);expect(await g.limit(2)).toBe(8);
  g.dispose();
 });
});

describe('Quy trình theo cờ',()=>{
 it('không mở thêm bước song song khi RAM căng',async()=>{
  let running=0,peak=0;const limits:number[]=[];
  const wf=normalizeWorkflow({name:'Gấp',mode:'parallel',maxConcurrency:4,steps:[{prompt:'A',dependsOn:[]},{prompt:'B',dependsOn:[]},{prompt:'C',dependsOn:[]},{prompt:'D',dependsOn:[]}]});
  let idle=0;
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},idle:()=>{idle++;},concurrency:async n=>{limits.push(n);return 1;},model:async text=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,5));running--;return text;}});
  const run=await runner.run(wf.id);
  expect(run.status).toBe('success');expect(peak).toBe(1);expect(limits.every(n=>n===4)).toBe(true);expect(idle).toBe(1);
 });
 it('cờ đỏ cho chạy vượt số bước đã đặt; báo 429',async()=>{
  let running=0,peak=0,limited=0;
  const wf=normalizeWorkflow({name:'Gấp',mode:'parallel',maxConcurrency:1,steps:[{prompt:'A',dependsOn:[]},{prompt:'B',dependsOn:[]},{prompt:'LOI429',dependsOn:[],continueOnError:true}]});
  const runner=new WorkflowRunner({list:()=>[wf],changed:()=>{},rateLimited:()=>{limited++;},concurrency:async()=>3,model:async text=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,5));running--;if(text.includes('LOI429'))throw Error('HTTP 429 Too Many Requests');return text;}});
  await runner.run(wf.id);
  expect(peak).toBe(3);expect(limited).toBe(1);
 });
});
