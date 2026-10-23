import {randomUUID} from 'node:crypto';
import type {RefineSettings,RefineStatus,RefineProgress} from '../types.js';
import {MAX_FAILS,RefineJournal,readManifest,refinePaths,sha,writeLast,writeManifest,type JournalDone} from './files.js';
import {acquireRefineLock,releaseRefineLock} from './locks.js';
import {buildPlan,advanceSchedule,ensureRefineSchedule,completeSchedule,type PlanItem,type SkillInfo} from './plan.js';
import {SKILL_SYSTEM,parseSkillDoc,renderSkill,skillPrompt} from './skillDoc.js';
import {RULES_SYSTEM,parseRuleBatch,rulesPrompt} from './rulesDoc.js';
import type {Candidate} from './models.js';
import {normalizeSkill} from '../../standardize/skill.js';

export interface RefineDeps{
 home:string;
 progress?(p:RefineProgress):void;
 now?:()=>number;
 settings():RefineSettings;
 appRunning():boolean;
 skills():SkillInfo[];
 learned():{id:string;rule:string}[];
 /** Trả proposed khi chỉ lưu bản đề xuất, giữ nguyên tệp nguồn. */
 writeSkill(name:string,md:string,oldMd:string):void|'proposed';
 applyRules(updates:Map<string,string>,drops:string[]):void;
 chain():Candidate[];
 call(c:Candidate,system:string,text:string,signal:AbortSignal):Promise<string>;
 waitIdle(signal:AbortSignal):Promise<boolean>;
 pollMs?:number;
 limits?:{skills:number;ruleBatch:number;ruleBatches:number};
}
export interface RefineOutcome{state:'skipped'|RefineStatus['state'];reason?:string;updated:number;unchanged:number;failed:number;remaining:number;model?:string;message?:string}
const DEFAULT_LIMITS={skills:25,ruleBatch:20,ruleBatches:4};
const skipped=(reason:string):RefineOutcome=>({state:'skipped',reason,updated:0,unchanged:0,failed:0,remaining:0});
const describe=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,300);

/**
 * Biên tập nền cuốn chiếu: rà các kỹ năng và kiến thức PVTA đã học, viết lại theo cấu trúc chặt chẽ.
 * Chỉ chạy khi PVTA đóng và máy rảnh; ghi nhật ký từng bước để bị ngắt giữa chừng vẫn chạy tiếp được; xong thì xóa nhật ký.
 */
export class Refiner{
 private chain:Candidate[]=[];private ci=0;private model?:string;private lastError='';
 constructor(private d:RefineDeps){}
 private now(){return (this.d.now??Date.now)();}

 async run(opts:{force?:boolean;catchUp?:boolean;signal?:AbortSignal}={}):Promise<RefineOutcome>{
  const d=this.d;const settings=d.settings();
  if(!settings.enabled&&!opts.force)return skipped('disabled');
  if(d.appRunning())return skipped('app-running');
  if(!acquireRefineLock(d.home))return skipped('already-running');
  const ac=new AbortController();const onAbort=()=>ac.abort();
  if(opts.signal?.aborted)ac.abort();else opts.signal?.addEventListener('abort',onAbort);
  const watch=setInterval(()=>{if(d.appRunning())ac.abort();},d.pollMs??5000);watch.unref?.();
  try{
   const due=ensureRefineSchedule(d.home,settings,this.now());
   if(opts.catchUp&&!settings.enabled)return skipped('disabled');
   if(opts.catchUp&&due>this.now())return skipped('not-due');
   if(!opts.force&&!opts.catchUp){
    if(due>this.now())return skipped('not-due');
    const today=new Date(this.now());today.setHours(0,0,0,0);
    let latest=due;while(advanceSchedule(latest,settings.time,settings.everyDays)<=this.now())latest=advanceSchedule(latest,settings.time,settings.everyDays);
    if(latest<today.getTime()&&!settings.autoCatchUp)return skipped('catch-up-required');
   }
   this.chain=[];this.ci=0;this.model=undefined;this.lastError='';
   const result=await this.execute(settings,ac.signal);
   if((!opts.force||opts.catchUp)&&result.state==='done')completeSchedule(d.home,settings,this.now());
   return result;
  }
  catch(e){
   const message=describe(e);const m=readManifest(d.home);m.lastRunAt=this.now();writeManifest(d.home,m);
   writeLast(d.home,{at:this.now(),state:'error',updated:0,unchanged:0,failed:0,message});
   return {state:'error',updated:0,unchanged:0,failed:0,remaining:0,message};
  }finally{clearInterval(watch);opts.signal?.removeEventListener('abort',onAbort);releaseRefineLock(d.home);}
 }

 private async ask(system:string,text:string,signal:AbortSignal):Promise<string|'aborted'|'no-model'>{
  if(!this.chain.length&&this.ci===0)this.chain=this.d.chain();
  while(this.ci<this.chain.length){
   const c=this.chain[this.ci]!;
   try{const out=await this.d.call(c,system,text,signal);if(signal.aborted)return 'aborted';this.model=c.label;return out;}
   catch(e){if(signal.aborted)return 'aborted';this.lastError=describe(e);this.ci++;}
  }
  return 'no-model';
 }

 private async execute(settings:RefineSettings,signal:AbortSignal):Promise<RefineOutcome>{
  const d=this.d;const f=refinePaths(d.home);const journal=new RefineJournal(f.journal);
  const manifest=readManifest(d.home);const resuming=journal.exists();
  const limits=d.limits??DEFAULT_LIMITS;
  const plan=buildPlan({skills:d.skills(),learned:d.learned(),manifest,journal:journal.doneRows()});
  if(!resuming)journal.start(randomUUID(),this.now());
  let stop:RefineOutcome['state']|undefined;let stopMessage='';
  let completed=0;const total=plan.skills.length+plan.rules.length;
  const progress=(message:string)=>d.progress?.({completed,total,message});
  progress('Đang chuẩn bị biên tập.');
  const record=(row:Omit<JournalDone,'t'|'at'>)=>{journal.done({at:this.now(),...row});completed++;progress(row.result==='failed'?'Lỗi: '+(row.note??row.key):'Đã xử lí '+row.key);};
  const halt=(state:'partial'|'no-model',message:string)=>{stop=state;stopMessage=message;};

  skills:for(const item of plan.skills.slice(0,limits.skills)){
   if(signal.aborted){halt('partial','PVTA đã mở hoặc có yêu cầu dừng; sẽ tiếp tục lần sau.');break;}
   if(!await d.waitIdle(signal)){halt('partial',signal.aborted?'PVTA đã mở; sẽ tiếp tục lần sau.':'Máy chưa rảnh; sẽ tiếp tục lần sau.');break;}
   const cur=d.skills().find(s=>s.name===item.ref);
   if(!cur||sha(cur.md)!==item.hash)continue;
   const description=/^description:\s*(.*)$/im.exec(cur.md)?.[1]??'';
   const body=cur.md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/,'');
   progress('Đang biên tập kỹ năng '+cur.name);
   const out=await this.ask(SKILL_SYSTEM,skillPrompt(cur.name,description,body),signal);
   if(out==='aborted'){halt('partial','PVTA đã mở; sẽ tiếp tục lần sau.');break skills;}
   if(out==='no-model'){halt('no-model',this.lastError||'Chưa có model nào dùng được.');break skills;}
   const parsed=parseSkillDoc(out,cur.name);
   if(!parsed.ok){record({key:item.key,before:item.hash,after:null,result:'failed',note:parsed.reason});continue;}
   const md=renderSkill(parsed.doc,cur.md);
   // Kiểm lại theo skill nhân pvta-viet-skill (mô tả ≤220, thân ≤6.000, an toàn). Chỉ để từ chối bản lỗi; nội dung vẫn do renderSkill dựng.
   const guide=normalizeSkill(md,{profile:'light',owner:'system'});
   if(!guide.ok){record({key:item.key,before:item.hash,after:null,result:'failed',note:guide.issues.find(i=>i.level==='error')?.message??'không đạt quy định viết skill'});continue;}
   if(md===cur.md){record({key:item.key,before:item.hash,after:item.hash,result:'unchanged'});continue;}
   if(d.appRunning()){halt('partial','PVTA đã mở; sẽ tiếp tục lần sau.');break skills;}
   if(d.skills().find(s=>s.name===cur.name)?.md!==cur.md)continue; // user edited while model was running
   const saved=d.writeSkill(cur.name,md,cur.md);
   record({key:item.key,before:item.hash,after:saved==='proposed'?item.hash:sha(md),result:'updated'});
  }

  if(!stop){
   const batches:typeof plan.rules[]=[];
   for(let i=0;i<plan.rules.length&&batches.length<limits.ruleBatches;i+=limits.ruleBatch)batches.push(plan.rules.slice(i,i+limits.ruleBatch));
   rules:for(const batchItems of batches){
    if(signal.aborted){halt('partial','PVTA đã mở hoặc có yêu cầu dừng; sẽ tiếp tục lần sau.');break;}
    if(!await d.waitIdle(signal)){halt('partial',signal.aborted?'PVTA đã mở; sẽ tiếp tục lần sau.':'Máy chưa rảnh; sẽ tiếp tục lần sau.');break;}
    const current=new Map(d.learned().map(l=>[l.id,l.rule]));
    const batch:{item:PlanItem;id:string;rule:string}[]=[];
    for(const item of batchItems){const rule=current.get(item.ref);if(typeof rule==='string'&&sha(rule)===item.hash)batch.push({item,id:item.ref,rule});}
    if(!batch.length)continue;
    progress('Đang biên tập nhóm kiến thức.');
    const out=await this.ask(RULES_SYSTEM,rulesPrompt(batch.map(b=>({id:b.id,rule:b.rule}))),signal);
    if(out==='aborted'){halt('partial','PVTA đã mở; sẽ tiếp tục lần sau.');break rules;}
    if(out==='no-model'){halt('no-model',this.lastError||'Chưa có model nào dùng được.');break rules;}
    const parsed=parseRuleBatch(out,batch.map(b=>({id:b.id,rule:b.rule})));
    if(!parsed.ok){for(const b of batch)record({key:b.item.key,before:b.item.hash,after:null,result:'failed',note:parsed.reason});continue;}
    if(d.appRunning()){halt('partial','PVTA đã mở; sẽ tiếp tục lần sau.');break rules;}
    const fresh=new Map(d.learned().map(l=>[l.id,l.rule]));
    const unchanged=batch.filter(b=>fresh.get(b.id)===b.rule);
    const updates=new Map<string,string>();const drops:string[]=[];
    for(const b of unchanged){const c=parsed.changes.get(b.id);if(!c)continue;if(c.duplicateOf)drops.push(b.id);else if(c.rule!==b.rule)updates.set(b.id,c.rule);}
    if(updates.size||drops.length)d.applyRules(updates,drops);
    for(const b of unchanged){
     const c=parsed.changes.get(b.id);
     if(c?.duplicateOf)record({key:b.item.key,before:b.item.hash,after:null,result:'dropped'});
     else if(c&&c.rule!==b.rule)record({key:b.item.key,before:b.item.hash,after:sha(c.rule),result:'updated'});
     else record({key:b.item.key,before:b.item.hash,after:b.item.hash,result:'unchanged'});
    }
   }
  }
  return this.finish(journal,stop,stopMessage,settings);
 }

 private finish(journal:RefineJournal,stop:RefineOutcome['state']|undefined,message:string,_settings:RefineSettings):RefineOutcome{
  const d=this.d;const rows=new Map<string,JournalDone>();for(const r of journal.doneRows())rows.set(r.key,r);
  const counts={updated:0,unchanged:0,failed:0};
  for(const r of rows.values()){if(r.result==='updated'||r.result==='dropped')counts.updated++;else if(r.result==='unchanged')counts.unchanged++;else counts.failed++;}
  // Còn việc sau khi kết thúc vòng này? (vượt hạn mức mỗi lần chạy hoặc bị ngắt)
  const manifest=readManifest(d.home);
  const after=buildPlan({skills:d.skills(),learned:d.learned(),manifest,journal:[...rows.values()]});
  const remaining=after.skills.length+after.rules.length;
  const partial=stop==='partial'||(!stop&&remaining>0);
  const state:RefineStatus['state']=stop==='no-model'?'no-model':partial?'partial':counts.failed&&!counts.updated&&!counts.unchanged?'error':'done';
  const note=message||(counts.failed?[...rows.values()].find(r=>r.result==='failed')?.note:undefined)||(partial?`Còn ${remaining} mục; sẽ tiếp tục lần sau.`:state==='done'&&!rows.size?'Không có mục mới cần biên tập.':'');
  const status:RefineStatus={at:this.now(),state,...counts,...(this.model?{model:this.model}:{}),...(note?{message:note}:{})};
  writeLast(d.home,status);
  if(partial)return {...status,remaining};   // giữ nhật ký để chạy tiếp
  // Hoàn tất: ghi dấu vân tay các mục đã xử lý, dọn mục không còn, xóa nhật ký.
  const live=new Set([...d.skills().filter(s=>/^learned-/.test(s.name)).map(s=>`skill:${s.name}`),...d.learned().map(l=>`rule:${l.id}`)]);
  for(const key of Object.keys(manifest.items))if(!live.has(key))delete manifest.items[key];
  for(const r of rows.values()){
   if(r.result==='dropped'){delete manifest.items[r.key];continue;}
   if(r.result==='failed'){const prev=manifest.items[r.key];const fails=(prev?.hash===r.before?(prev.fails??0):0)+1;manifest.items[r.key]={hash:r.before,fails:Math.min(fails,MAX_FAILS)};continue;}
   manifest.items[r.key]={hash:r.after??r.before};
  }
  manifest.lastRunAt=this.now();writeManifest(d.home,manifest);journal.clear();
  return {...status,remaining};
 }
}
