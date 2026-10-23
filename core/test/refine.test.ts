import {describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {builtinCatalog} from '@pvta/shared';
import {refineChain,chainFor,type ChainInput} from '../src/desktop/refine/models';
import {cpuUsage,parseMemAvailable,parseVmStat,judgeIdle,waitUntilIdle} from '../src/desktop/refine/idle';
import {isDue,buildPlan,ensureRefineSchedule,scheduledView} from '../src/desktop/refine/plan';
import {parseSkillDoc,renderSkill,extractJson} from '../src/desktop/refine/skillDoc';
import {parseRuleBatch} from '../src/desktop/refine/rulesDoc';
import {Refiner,type RefineDeps} from '../src/desktop/refine/refiner';
import {RefineJournal,readManifest,readLast,refinePaths,sha} from '../src/desktop/refine/files';
import {acquireRefineLock,releaseRefineLock,holdAppLock,appRunning} from '../src/desktop/refine/locks';
import {syncSchedule,launchdPlist,systemdUnits,schedulePlan,windowsLauncher,type Runner} from '../src/desktop/refine/schedule';
import {normalizeRefine,defaultRefineSettings} from '../src/desktop/refine/settings';
import {writeSkillAtomic} from '../src/desktop/refine/host';

const roots:string[]=[];
const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-refine-'));roots.push(d);return d;};
afterEach(()=>{for(const r of roots)fs.rmSync(r,{recursive:true,force:true});roots.length=0;});

const base=():ChainInput=>({backends:[{id:'agy',installed:false,auth:'unknown'},{id:'claude',installed:false,auth:'unknown'},{id:'codex',installed:false,auth:'unknown'}],catalog:builtinCatalog(),api:[]});

describe('model chain',()=>{
 it('prefers the Sonnet of agy, then CommandCode, then Claude, then an equivalent',()=>{
  const i=base();
  i.backends[0]!.installed=true;i.backends[1]!.installed=true;
  i.catalog.agy={live:true,models:[{id:'gemini-flash',label:'Gemini Flash'},{id:'claude-sonnet-4-6',label:'Claude Sonnet 4.6'},{id:'gemini-3-pro',label:'Gemini Pro'}]};
  i.api=[{id:'commandcode',configured:true,models:[{id:'anthropic/claude-sonnet-5',label:'Sonnet 5'}]}];
  const c=refineChain(i);
  expect(c.map(x=>x.tier)).toEqual([1,2,3,4]);
  expect(c[0]!.choice).toEqual({backend:'agy',model:'claude-sonnet-4-6'});
  expect(c[1]!.choice).toEqual({backend:'api',model:'commandcode/anthropic/claude-sonnet-5'});
  expect(c[2]!.choice).toEqual({backend:'claude',model:'sonnet'});
  expect(c[3]!.choice).toEqual({backend:'agy',model:'gemini-3-pro'});
 });
 it('falls to CommandCode when agy has no Sonnet, then Claude',()=>{
  const i=base();i.backends[0]!.installed=true;i.backends[1]!.installed=true;
  i.catalog.agy={live:true,models:[{id:'gemini-flash',label:'Gemini Flash'}]};
  i.api=[{id:'commandcode',configured:true,models:[{id:'deepseek/deepseek-v4-flash'},{id:'claude-sonnet-5'}]}];
  expect(refineChain(i)[0]!.choice.model).toBe('commandcode/claude-sonnet-5');
  i.api=[{id:'commandcode',configured:false,models:[{id:'claude-sonnet-5'}]}];
  expect(refineChain(i)[0]!.choice).toEqual({backend:'claude',model:'sonnet'});
 });
 it('skips a CLI whose login is missing and never picks weak models as equivalents',()=>{
  const i=base();i.backends[1]!.installed=true;i.backends[1]!.auth='missing';
  i.api=[{id:'openai',configured:true,model:'gpt-5.4-mini',models:[{id:'gpt-5.4-mini'},{id:'gpt-5.5'}]},{id:'gemini',configured:true,models:[{id:'gemini-flash-latest'}]},{id:'anthropic',configured:true,models:[{id:'claude-haiku-5-5'},{id:'claude-sonnet-5-5'}]}];
  const c=refineChain(i);
  expect(c.every(x=>x.choice.backend==='api')).toBe(true);
  expect(c.map(x=>x.choice.model)).toEqual(['anthropic/claude-sonnet-5-5','openai/gpt-5.5']);
 });
 it('uses only the chosen model when the teacher picks one',()=>{
  const s={...defaultRefineSettings(),model:{backend:'claude' as const,model:'opus'}};
  expect(chainFor(s,base()).map(c=>c.choice.model)).toEqual(['opus']);
 });
});

describe('idle detection',()=>{
 it('measures CPU use and parses memory sources',()=>{
  expect(cpuUsage([{idle:0,total:0}],[{idle:60,total:100}])).toBeCloseTo(0.4);
  expect(parseMemAvailable('MemTotal: 100 kB\nMemAvailable:   2048 kB\n')).toBe(2048*1024);
  const vm='Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                               100.\nPages active:                            5000.\nPages inactive:                          200.\nPages speculative:                        50.\nPages purgeable:                          10.\n';
  expect(parseVmStat(vm)).toBe(360*16384);
 });
 it('judges busy CPU or low memory as not idle',()=>{
  const gib=2**30;
  expect(judgeIdle(0.1,{free:8*gib,total:16*gib}).idle).toBe(true);
  expect(judgeIdle(0.9,{free:8*gib,total:16*gib}).idle).toBe(false);
  expect(judgeIdle(0.1,{free:1*gib,total:16*gib}).idle).toBe(false);
  expect(judgeIdle(0.1,{free:3*gib,total:32*gib}).reason).toContain('RAM');
 });
 it('waits until idle, gives up after the time limit, and stops on abort',async()=>{
  let n=0;let t=0;const ac=new AbortController();
  const ok=await waitUntilIdle({signal:ac.signal,check:async()=>({idle:++n>=3,cpu:0,freeRatio:1,freeBytes:0}),sleep:async ms=>{t+=ms;},now:()=>t,pollMs:1000,maxWaitMs:10_000});
  expect(ok).toBe(true);expect(n).toBe(3);
  t=0;expect(await waitUntilIdle({signal:ac.signal,check:async()=>({idle:false,cpu:1,freeRatio:0,freeBytes:0}),sleep:async ms=>{t+=ms;},now:()=>t,pollMs:1000,maxWaitMs:5000})).toBe(false);
  ac.abort();expect(await waitUntilIdle({signal:ac.signal,check:async()=>({idle:true,cpu:0,freeRatio:1,freeBytes:0})})).toBe(false);
 });
});

describe('schedule due check',()=>{
 const at=(d:string)=>new Date(d).getTime();
 it('is due only after the set time and after enough days',()=>{
  expect(isDue(at('2026-10-17T21:00:00'),'22:30',1)).toBe(false);
  expect(isDue(at('2026-10-17T22:31:00'),'22:30',1)).toBe(true);
  const last=at('2026-10-17T22:40:00');
  expect(isDue(at('2026-10-17T23:30:00'),'22:30',1,last)).toBe(false);
  expect(isDue(at('2026-10-18T22:31:00'),'22:30',1,last)).toBe(true);
  expect(isDue(at('2026-10-19T22:31:00'),'22:30',3,last)).toBe(false);
  expect(isDue(at('2026-10-20T22:31:00'),'22:30',3,last)).toBe(true);
 });
 it('validates settings coming from the UI',()=>{
  const d=defaultRefineSettings();
  expect(normalizeRefine({time:'03:15',everyDays:7},d)).toMatchObject({time:'03:15',everyDays:7,enabled:true});
  expect(()=>normalizeRefine({time:'25:00'},d)).toThrow('HH:MM');
  expect(()=>normalizeRefine({everyDays:2},d)).toThrow('Tần suất');
  expect(()=>normalizeRefine({model:{backend:'x',model:'y'}},d)).toThrow('Model');
  expect(normalizeRefine({model:{backend:'claude',model:'sonnet'}},d).model).toEqual({backend:'claude',model:'sonnet'});
 });
});

const goodSkill=JSON.stringify({name:'learned-de-kiem-tra',description:'Trình bày đề kiểm tra theo thói quen của thầy cô',triggers:['Làm đẹp đề kiểm tra'],steps:['Đặt tiêu đề in đậm','Căn đều hai bên'],rules:['Cỡ chữ 13'],avoid:['Tiêu đề quá cỡ 16']});
describe('skill document',()=>{
 it('accepts strict JSON, even fenced, and renders a fixed structure while keeping meta keys',()=>{
  const r=parseSkillDoc('```json\n'+goodSkill+'\n```','learned-de-kiem-tra');
  expect(r.ok).toBe(true);if(!r.ok)return;
  const md=renderSkill(r.doc,'---\nname: learned-de-kiem-tra\ndescription: cũ\nload: demand\nsource: file\n---\nnội dung cũ');
  expect(md).toContain('source: file');
  expect(md).toContain('## Khi nào dùng\n- Làm đẹp đề kiểm tra');
  expect(md).toContain('## Các bước\n1. Đặt tiêu đề in đậm\n2. Căn đều hai bên');
  expect(md).toContain('## Điều nên tránh');
  expect(renderSkill(r.doc,md)).toBe(md);
 });
 it('rejects renamed skills, unsafe content, empty bodies and bad JSON',()=>{
  expect(parseSkillDoc(goodSkill,'learned-khac')).toMatchObject({ok:false});
  expect(parseSkillDoc(goodSkill.replace('Cỡ chữ 13','xem https://x.vn'),'learned-de-kiem-tra')).toMatchObject({ok:false,reason:'chứa đường dẫn URL'});
  expect(parseSkillDoc(JSON.stringify({description:'Mô tả đủ dài để hợp lệ',triggers:['a'],steps:[],rules:[],avoid:[]}),'learned-a')).toMatchObject({ok:false});
  expect(parseSkillDoc('không phải json','learned-a')).toMatchObject({ok:false});
  expect(()=>extractJson('xx')).toThrow();
 });
 it('validates rule batches: unknown ids ignored, mass deletion refused, duplicate chains resolved',()=>{
  const batch=[{id:'a',rule:'Dùng cỡ chữ 13'},{id:'b',rule:'Cỡ chữ 13'},{id:'c',rule:'Căn đều'},{id:'d',rule:'Tiêu đề in đậm'}];
  const ok=parseRuleBatch(JSON.stringify({items:[{id:'a',rule:'Dùng cỡ chữ 13.',duplicateOf:null},{id:'b',rule:'Dùng cỡ chữ 13.',duplicateOf:'a'},{id:'zzz',rule:'lạ'}]}),batch);
  expect(ok.ok).toBe(true);if(ok.ok){expect([...ok.changes.keys()]).toEqual(['a','b']);expect(ok.changes.get('b')!.duplicateOf).toBe('a');}
  const mass=parseRuleBatch(JSON.stringify({items:batch.map((b,i)=>({id:b.id,rule:'x',duplicateOf:i?'a':null}))}),batch);
  expect(mass).toMatchObject({ok:false});
  const cycle=parseRuleBatch(JSON.stringify({items:[{id:'a',rule:'một',duplicateOf:'b'},{id:'b',rule:'hai',duplicateOf:'a'}]}),batch);
  expect(cycle.ok&&[...cycle.changes.values()].filter(c=>c.duplicateOf).length).toBe(1);
  expect(parseRuleBatch(JSON.stringify({items:[{id:'a',rule:'xem https://x.vn'}]}),batch)).toMatchObject({ok:false});
 });
});

function world(home:string,now:{t:number}){
 const skillsDir=path.join(home,'skills');
 const state={skills:new Map<string,string>(),learned:[] as {id:string;rule:string}[]};
 const calls:string[]=[];
 const addSkill=(name:string,body='Quy trình cũ dài dòng')=>state.skills.set(name,`---\nname: ${name}\ndescription: Mô tả cũ của ${name}\nload: demand\n---\n${body}\n`);
 const deps:RefineDeps={
  home,now:()=>now.t,settings:()=>({...defaultRefineSettings(),time:'00:00',autoCatchUp:true}),appRunning:()=>false,
  skills:()=>[...state.skills].map(([name,md])=>({name,md})),
  learned:()=>state.learned,
  writeSkill:(name,md,old)=>{writeSkillAtomic(skillsDir,name,md,old);state.skills.set(name,md);},
  applyRules:(u,drops)=>{state.learned=state.learned.filter(l=>!drops.includes(l.id)).map(l=>u.has(l.id)?{...l,rule:u.get(l.id)!}:l);},
  chain:()=>[{choice:{backend:'claude',model:'sonnet'},label:'Claude · Sonnet',tier:3}],
  call:async(_c,system,text)=>{calls.push(text);if(system.includes('MỘT kỹ năng')){const name=/TÊN: (\S+)/.exec(text)![1]!;return JSON.stringify({name,description:`Kỹ năng ${name} đã biên tập`,triggers:['khi cần'],steps:['Bước một'],rules:[],avoid:[]});}
   const ids=[...text.matchAll(/^(\S+)\t(.*)$/gm)].map(m=>({id:m[1]!,rule:m[2]!}));return JSON.stringify({items:ids.map(x=>({id:x.id,rule:x.rule.endsWith('.')?x.rule:x.rule+'.',duplicateOf:null}))});},
  waitIdle:async()=>true,pollMs:3_600_000,
 };
 return {deps,state,calls,addSkill,skillsDir};
}

describe('Refiner',()=>{
 it('refines only new or changed items, logs as it goes and deletes the journal when done',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T23:00:00').getTime()};const w=world(home,now);
  w.addSkill('learned-a');w.addSkill('learned-b');w.addSkill('pvta-word','không đụng');
  w.state.learned.push({id:'r1',rule:'Cỡ chữ 13'});
  const first=await new Refiner(w.deps).run();
  expect(first).toMatchObject({state:'done',updated:3,failed:0,model:'Claude · Sonnet',remaining:0});
  expect(w.state.skills.get('learned-a')).toContain('## Các bước\n1. Bước một');
  expect(w.state.skills.get('pvta-word')).toContain('không đụng');
  expect(w.state.learned[0]!.rule).toBe('Cỡ chữ 13.');
  expect(fs.existsSync(refinePaths(home).journal)).toBe(false);
  expect(readLast(home)).toMatchObject({state:'done',updated:3});
  const callsAfterFirst=w.calls.length;
  // Chạy lại cùng ngày: chưa tới hạn. Sang ngày sau không có gì mới: không gọi model.
  expect(await new Refiner(w.deps).run()).toMatchObject({state:'skipped',reason:'not-due'});
  now.t+=24*3600_000;
  expect(await new Refiner(w.deps).run()).toMatchObject({state:'done',updated:0});
  expect(w.calls.length).toBe(callsAfterFirst);
  // Thêm một kỹ năng mới và sửa một cái cũ: chỉ hai mục đó được xử lý (cuốn chiếu).
  w.addSkill('learned-c');w.state.skills.set('learned-a',w.state.skills.get('learned-a')!+'\n- thêm ý mới');
  now.t+=24*3600_000;
  const third=await new Refiner(w.deps).run();
  expect(third).toMatchObject({state:'done',updated:2});expect(w.calls.length).toBe(callsAfterFirst+2);
  expect(fs.readdirSync(path.join(w.skillsDir,'.backup')).length).toBeGreaterThan(0);
 });
 it('resumes after an interruption and skips what the journal already finished',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T23:00:00').getTime()};const w=world(home,now);
  for(const n of ['learned-a','learned-b','learned-c'])w.addSkill(n);
  let busyAfter=1;const ac=new AbortController();
  w.deps.waitIdle=async()=>{if(busyAfter-->0)return true;ac.abort();return false;};
  const first=await new Refiner(w.deps).run({signal:ac.signal});
  expect(first.state).toBe('partial');expect(first.updated).toBe(1);
  const journal=new RefineJournal(refinePaths(home).journal);
  expect(journal.exists()).toBe(true);expect(journal.doneRows()).toHaveLength(1);
  expect(readManifest(home).lastRunAt).toBeUndefined();
  w.deps.waitIdle=async()=>true;now.t+=3600_000;        // lần gọi kế tiếp của bộ lập lịch (mỗi giờ)
  const callsBefore=w.calls.length;
  const second=await new Refiner(w.deps).run();
  expect(second).toMatchObject({state:'done',updated:3,remaining:0});
  expect(w.calls.length-callsBefore).toBe(2);           // chỉ hai kỹ năng còn lại
  expect(journal.exists()).toBe(false);
 });
 it('yields to the app: does nothing when PVTA is open and aborts mid-run when it opens',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T23:00:00').getTime()};const w=world(home,now);w.addSkill('learned-a');
  expect(await new Refiner({...w.deps,appRunning:()=>true}).run()).toMatchObject({state:'skipped',reason:'app-running'});
  let opened=false;
  const res=await new Refiner({...w.deps,appRunning:()=>opened,call:async()=>{opened=true;await new Promise(r=>setTimeout(r,30));return '{}';},pollMs:5}).run();
  expect(res.state).toBe('partial');expect(w.state.skills.get('learned-a')).toContain('Quy trình cũ');
  expect(fs.existsSync(refinePaths(home).lock)).toBe(false);
 });
 it('falls to the next model, reports no-model, and marks invalid answers as failures that stop retrying',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T23:00:00').getTime()};const w=world(home,now);w.addSkill('learned-a');
  const chain=[{choice:{backend:'agy' as const,model:'x'},label:'agy',tier:1 as const},{choice:{backend:'claude' as const,model:'sonnet'},label:'Claude',tier:3 as const}];
  const real=w.deps.call;
  const out=await new Refiner({...w.deps,chain:()=>chain,call:async(c,s,t,sig)=>{if(c.label==='agy')throw Error('not logged in');return real(c,s,t,sig);}}).run();
  expect(out).toMatchObject({state:'done',updated:1,model:'Claude'});
  const home2=tmp();const w2=world(home2,now);w2.addSkill('learned-a');
  const none=await new Refiner({...w2.deps,call:async()=>{throw Error('không có CLI');}}).run();
  expect(none).toMatchObject({state:'no-model',message:'không có CLI'});
  expect(readManifest(home2).lastRunAt).toBe(now.t);expect(fs.existsSync(refinePaths(home2).journal)).toBe(false);
  const home3=tmp();const w3=world(home3,now);w3.addSkill('learned-a');
  const bad={...w3.deps,call:async()=>'xin lỗi, tôi không làm được'};
  expect(await new Refiner(bad).run()).toMatchObject({state:'error',failed:1});
  for(let day=1;day<=4;day++){now.t+=24*3600_000;await new Refiner(bad).run();}
  expect(readManifest(home3).items['skill:learned-a']).toMatchObject({fails:3});
  const calls=w3.calls.length;now.t+=24*3600_000;await new Refiner(bad).run();expect(w3.calls.length).toBe(calls);
 });
 it('drops duplicate learned rules after backing them up, and honors the item limit',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T23:00:00').getTime()};const w=world(home,now);
  w.state.learned.push({id:'r1',rule:'Dùng cỡ chữ 13.'},{id:'r2',rule:'Cỡ chữ 13'},{id:'r3',rule:'Căn đều'});
  const res=await new Refiner({...w.deps,call:async()=>JSON.stringify({items:[{id:'r1',rule:'Dùng cỡ chữ 13.',duplicateOf:null},{id:'r2',rule:'Dùng cỡ chữ 13.',duplicateOf:'r1'},{id:'r3',rule:'Căn đều hai bên.',duplicateOf:null}]})}).run();
  expect(res).toMatchObject({state:'done',updated:2});expect(w.state.learned.map(l=>l.id)).toEqual(['r1','r3']);
  expect(readManifest(home).items['rule:r2']).toBeUndefined();
  const home2=tmp();const w2=world(home2,now);for(const n of ['learned-a','learned-b','learned-c'])w2.addSkill(n);
  const part=await new Refiner({...w2.deps,limits:{skills:2,ruleBatch:20,ruleBatches:1}}).run();
  expect(part).toMatchObject({state:'partial',remaining:1,updated:2});expect(new RefineJournal(refinePaths(home2).journal).exists()).toBe(true);
 });
 it('does not run when disabled unless forced, and only one run at a time',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T23:00:00').getTime()};const w=world(home,now);w.addSkill('learned-a');
  const off={...w.deps,settings:()=>({...defaultRefineSettings(),enabled:false})};
  expect(await new Refiner(off).run()).toMatchObject({state:'skipped',reason:'disabled'});
  expect(acquireRefineLock(home,process.pid)).toBe(true);
  expect(await new Refiner(w.deps).run()).toMatchObject({state:'skipped',reason:'already-running'});
  releaseRefineLock(home);
  expect(await new Refiner(off).run({force:true})).toMatchObject({state:'done',updated:1});
 });
 it('builds a plan from hashes only',()=>{
  const md='---\nname: learned-a\n---\nx';
  const manifest={version:1 as const,items:{'skill:learned-a':{hash:sha(md)},'rule:r1':{hash:sha('cũ')}}};
  const plan=buildPlan({skills:[{name:'learned-a',md},{name:'office-word',md:'y'}],learned:[{id:'r1',rule:'mới'},{id:'r2',rule:'khác'}],manifest,journal:[]});
  expect(plan.skills).toEqual([]);expect(plan.rules.map(r=>r.ref)).toEqual(['r1','r2']);
 });
});

describe('locks',()=>{
 it('reports the app as running only while its lock is alive and fresh',()=>{
  const home=tmp();expect(appRunning(home)).toBe(false);
  const release=holdAppLock(home);expect(appRunning(home)).toBe(true);
  expect(appRunning(home,Date.now()+10*60_000)).toBe(false);   // nhịp tim quá cũ
  release();expect(appRunning(home)).toBe(false);
  fs.mkdirSync(path.dirname(refinePaths(home).appLock),{recursive:true});fs.writeFileSync(refinePaths(home).appLock,JSON.stringify({pid:2_000_000_000}));
  expect(appRunning(home)).toBe(false);                          // tiến trình đã chết
 });
});

describe('OS scheduler registration',()=>{
 const recorder=():{run:Runner;calls:string[]}=>{const calls:string[]=[];return {calls,run:async(cmd,args,input)=>{calls.push([cmd,...args].join(' ')+(input?` <<${input.trim()}`:''));return {code:0,out:''};}};};
 it('registers a launchd agent on macOS and removes it again',async()=>{
  const home=tmp();const homeDir=tmp();const {run,calls}=recorder();
  const plan={exec:'/Applications/PVTA.app/Contents/MacOS/pvta-core',args:['--refine']};
  expect(await syncSchedule(true,{home,platform:'darwin',homeDir,uid:501,run},plan)).toEqual({registered:true});
  const plist=fs.readFileSync(path.join(homeDir,'Library/LaunchAgents/vn.pvta.refine.plist'),'utf8');
  expect(plist).toContain('<integer>3600</integer>');expect(plist).toContain('pvta-core');expect(plist).toContain('<string>--refine</string>');
  expect(calls.some(c=>c.startsWith('launchctl bootstrap gui/501'))).toBe(true);
  const n=calls.length;await syncSchedule(true,{home,platform:'darwin',homeDir,uid:501,run},plan);expect(calls.length).toBe(n);   // đã đăng ký: không làm lại
  expect(await syncSchedule(false,{home,platform:'darwin',homeDir,uid:501,run},plan)).toEqual({registered:false});
  expect(fs.existsSync(path.join(homeDir,'Library/LaunchAgents/vn.pvta.refine.plist'))).toBe(false);
 });
 it('uses a systemd user timer on Linux and falls back to crontab',async()=>{
  const home=tmp();const homeDir=tmp();const {run,calls}=recorder();
  const plan={exec:'/opt/pvta/pvta-core',args:['--refine']};
  await syncSchedule(true,{home,platform:'linux',homeDir,run},plan);
  expect(fs.readFileSync(path.join(homeDir,'.config/systemd/user/pvta-refine.timer'),'utf8')).toContain('OnUnitActiveSec=1h');
  expect(calls).toContain('systemctl --user enable --now pvta-refine.timer');
  const home2=tmp();const dir2=tmp();const cron:string[]=[];
  const noSystemd:Runner=async(cmd,args,input)=>{if(cmd==='systemctl')return {code:1,out:'no'};if(cmd==='crontab'&&args[0]==='-l')return {code:0,out:'0 1 * * * backup\n'};if(cmd==='crontab'){cron.push(input!);}return {code:0,out:''};};
  expect(await syncSchedule(true,{home:home2,platform:'linux',homeDir:dir2,run:noSystemd},plan)).toEqual({registered:true});
  expect(cron[0]).toContain('0 1 * * * backup');expect(cron[0]).toContain('# pvta-refine');expect(cron[0]).toContain('@reboot');
 });
 it('creates hidden Windows tasks and reports failures without throwing',async()=>{
  const home=tmp();const {run,calls}=recorder();
  await syncSchedule(true,{home,platform:'win32',run},{exec:'C:\\Program Files\\PVTA\\pvta-core.exe',args:['--refine']});
  expect(calls[0]).toContain('schtasks /Create /F /TN PVTA\\Refine /SC HOURLY');
  expect(fs.readFileSync(path.join(home,'refine/run-refine.vbs'),'utf8')).toContain('WScript.Shell');
  const failing:Runner=async()=>({code:1,out:'Access denied'});
  const home2=tmp();const res=await syncSchedule(true,{home:home2,platform:'win32',run:failing},{exec:'x',args:[]});
  expect(res.registered).toBe(false);expect(res.error).toContain('Access denied');
 });
 it('re-invokes itself: packaged binary or node script',()=>{
  expect(schedulePlan(['node','x'],'/bin/pvta-core',true)).toEqual({exec:'/bin/pvta-core',args:['--refine']});
  expect(schedulePlan(['node','/x/core/dist/pvta-core.cjs'],'/usr/bin/node',false)).toEqual({exec:'/usr/bin/node',args:['/x/core/dist/pvta-core.cjs','--refine']});
  expect(schedulePlan(['node','/x/vite/bin/vite.js'],'/usr/bin/node',false)).toBeUndefined();
  expect(launchdPlist({exec:'a&b',args:[]})).toContain('a&amp;b');
  expect(systemdUnits({exec:'/p q/x',args:['--refine']}).service).toContain('ExecStart="/p q/x" "--refine"');
  expect(windowsLauncher({exec:'C:\\a b\\x.exe',args:['--refine']})).toContain('0, False');
 });
});

it('real refiner host proposes a skill revision without overwriting the user file',async()=>{
 const {createRefiner}=await import('../src/desktop/refine/host');
 const {DesktopStore}=await import('../src/desktop/storage');
 const home=tmp();const dir=path.join(home,'skills','learned-a');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'SKILL.md');const original='---\nname: learned-a\ndescription: Quy trình do người dùng chỉnh sửa\nload: demand\n---\nNội dung riêng cần giữ nguyên.\n';fs.writeFileSync(file,original);
 const refiner=createRefiner(home,{appRunning:()=>false,waitIdle:async()=>true,chain:()=>[{choice:{backend:'claude',model:'sonnet'},label:'Sonnet',tier:3}],call:async()=>JSON.stringify({name:'learned-a',description:'Quy trình đã biên tập lại',triggers:['khi soạn bài'],steps:['Kiểm tra mục tiêu','Soạn nội dung'],rules:[],avoid:[]})});
 await refiner.run({force:true});expect(fs.readFileSync(file,'utf8')).toBe(original);
 const store=new DesktopStore(home);expect(store.data.learnedDrafts).toHaveLength(1);expect(store.data.learnedDrafts![0]).toMatchObject({status:'proposed',name:'learned-a'});
 await refiner.run({force:true});expect(new DesktopStore(home).data.learnedDrafts).toHaveLength(1);
});


describe('manual runs and missed schedules',()=>{
 it('keeps the three-day calendar anchor after a manual run and advances catch-up by calendar slots',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T08:00:00').getTime()};const w=world(home,now);
  const settings={...defaultRefineSettings(),time:'22:30',everyDays:3 as const};w.deps.settings=()=>settings;
  const original=ensureRefineSchedule(home,settings,now.t);w.addSkill('learned-a');
  expect(await new Refiner(w.deps).run({force:true})).toMatchObject({state:'done',updated:1});
  expect(readManifest(home).schedule?.nextAt).toBe(original);
  now.t=new Date('2026-10-18T08:00:00').getTime();
  expect(scheduledView(original,settings,now.t)).toEqual({missedAt:original,nextAt:new Date('2026-10-20T22:30:00').getTime()});
  expect(await new Refiner(w.deps).run()).toMatchObject({state:'skipped',reason:'catch-up-required'});
  expect(await new Refiner(w.deps).run({force:true,catchUp:true})).toMatchObject({state:'done'});
  expect(readManifest(home).schedule?.nextAt).toBe(new Date('2026-10-20T22:30:00').getTime());
  expect(await new Refiner(w.deps).run({force:true,catchUp:true})).toMatchObject({state:'skipped',reason:'not-due'});
 });
 it('only catches up automatically with opt-in, and preserves the missed slot on failure',async()=>{
  const home=tmp();const now={t:new Date('2026-10-17T08:00:00').getTime()};const w=world(home,now);
  let settings={...defaultRefineSettings()};w.deps.settings=()=>settings;
  const due=ensureRefineSchedule(home,settings,now.t);now.t=new Date('2026-10-18T08:00:00').getTime();
  w.addSkill('learned-a');settings={...settings,autoCatchUp:true};
  expect(await new Refiner({...w.deps,call:async()=>{throw Error('Mất mạng');}}).run()).toMatchObject({state:'no-model'});
  expect(readManifest(home).schedule?.nextAt).toBe(due);
  expect(await new Refiner(w.deps).run()).toMatchObject({state:'done',updated:1});
  settings={...settings,enabled:false};now.t=new Date('2026-10-21T08:00:00').getTime();
  expect(await new Refiner(w.deps).run({force:true,catchUp:true})).toMatchObject({state:'skipped',reason:'disabled'});
 });
 it('reports progress and prevents overlapping manual and scheduled calls',async()=>{
  const home=tmp();const now={t:Date.now()};const w=world(home,now);w.addSkill('learned-a');
  let release!:()=>void;const gate=new Promise<void>(r=>release=r);const progress:any[]=[];
  const call=w.deps.call;w.deps.call=async(...args)=>{await gate;return call(...args);};w.deps.progress=p=>progress.push(p);
  const first=new Refiner(w.deps).run({force:true});
  expect(await new Refiner(w.deps).run()).toMatchObject({state:'skipped',reason:'already-running'});
  expect(await new Refiner(w.deps).run({force:true})).toMatchObject({state:'skipped',reason:'already-running'});
  release();await first;
  expect(progress[0]).toMatchObject({completed:0,total:1});expect(progress.at(-1)).toMatchObject({completed:1,total:1});
 });
 it('does not steal a lock from a live process even after three hours',()=>{
  const home=tmp();expect(acquireRefineLock(home,process.pid,1)).toBe(true);
  expect(acquireRefineLock(home,process.pid,Date.now())).toBe(false);releaseRefineLock(home);
 });
 it('validates the catch-up setting without changing the selected model',()=>{
  const initial={...defaultRefineSettings(),model:{backend:'claude' as const,model:'sonnet'}};
  expect(normalizeRefine({autoCatchUp:true},initial)).toEqual({...initial,autoCatchUp:true});
  expect(()=>normalizeRefine({autoCatchUp:'true'},initial)).toThrow();
 });
});

it('keeps regular daily execution available without automatically catching up in the morning',async()=>{
 const home=tmp();const now={t:new Date('2026-10-17T08:00:00').getTime()};const w=world(home,now);const settings=defaultRefineSettings();w.deps.settings=()=>settings;
 ensureRefineSchedule(home,settings,now.t);now.t=new Date('2026-10-18T08:00:00').getTime();
 expect(await new Refiner(w.deps).run()).toMatchObject({state:'skipped',reason:'catch-up-required'});
 now.t=new Date('2026-10-18T22:31:00').getTime();expect(await new Refiner(w.deps).run()).toMatchObject({state:'done'});
 expect(readManifest(home).schedule?.nextAt).toBe(new Date('2026-10-19T22:30:00').getTime());
});
