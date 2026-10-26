import {skillTier} from '../../skill-policy.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {API_PROVIDER_IDS,API_PROVIDERS,builtinCatalog,modelsOf,type ModelCatalog} from '@pvta/shared';
import {ApiClient} from '../../api.js';
import {ConfigStore} from '../../config.js';
import {Engine} from '../../engine.js';
import {loadCatalog} from '../../modelscan.js';
import {augmentPath,paths,pvtaHome} from '../../paths.js';
import {ProbeStore} from '../../probe.js';
import {SkillStore} from '../../skills.js';
import {stageLearnedSkill} from '../learning-memory.js';
import {DesktopStore,uid} from '../storage.js';
import type {LearnedDraft,RefineSettings} from '../types.js';
import {defaultRefineSettings} from './settings.js';
import {refinePaths} from './files.js';
import {chainFor,type Candidate,type ChainInput} from './models.js';
import {checkIdle,waitUntilIdle} from './idle.js';
import {appRunning,stopRefiner} from './locks.js';
import {Refiner,type RefineDeps,type RefineOutcome} from './refiner.js';
import {atomicJson} from '../storage.js';

/** Biên tập tự động chỉ tạo đề xuất, không thay nội dung skill đang dùng. */
export function skillRefinementDraft(name:string,md:string):LearnedDraft {
 return {id:uid(),name,description:/^description:\s*(.*)$/m.exec(md)?.[1]??name,body:md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/,''),source:'Biên tập nền · '+name,at:Date.now(),status:'proposed'};
}
/** Ghi tệp kỹ năng không bao giờ dở dang: tệp tạm rồi đổi tên; giữ tối đa 3 bản sao lưu mỗi kỹ năng. */
export function writeSkillAtomic(skillsDir:string,name:string,md:string,oldMd:string,now=Date.now()){
 const dir=path.join(skillsDir,name);const file=path.join(dir,'SKILL.md');
 const backups=path.join(skillsDir,'.backup');fs.mkdirSync(backups,{recursive:true});
 fs.mkdirSync(path.join(backups,`${name}-${now}`),{recursive:true});fs.writeFileSync(path.join(backups,`${name}-${now}`,'SKILL.md'),oldMd);
 const mine=fs.readdirSync(backups).filter(n=>n.startsWith(`${name}-`)).sort();
 for(const old of mine.slice(0,Math.max(0,mine.length-3)))fs.rmSync(path.join(backups,old),{recursive:true,force:true});
 fs.mkdirSync(dir,{recursive:true});
 const tmp=`${file}.${uid()}.tmp`;
 try{fs.writeFileSync(tmp,md,{mode:0o600});fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}
}

/** Dựng các phụ thuộc thật: cùng cấu hình, khóa API và danh mục model mà ứng dụng đã lưu. */
export function createRefiner(home=pvtaHome(),overrides:Partial<RefineDeps>={}){
 augmentPath();
 const config=new ConfigStore(paths.config(home));const probe=new ProbeStore(paths.probe(home));
 const api=new ApiClient({settings:()=>config.get().api});const engine=new Engine({probe,api,allowApiKeys:()=>false});
 const skills=new SkillStore(paths.skills(home));
 const catalog:ModelCatalog=loadCatalog(path.join(home,'models.json'))??builtinCatalog();
 const settings=():RefineSettings=>{try{return new DesktopStore(home).data.preferences.refine??defaultRefineSettings();}catch{return defaultRefineSettings();}};
 const chainInput=():ChainInput=>({
  backends:(['agy','claude','codex','opencode'] as const).map(id=>({id,installed:probe.get(id)?.installed===true,auth:'unknown' as const})),
  catalog,
  api:API_PROVIDER_IDS.map(id=>({id,configured:api.configured(id),model:config.get().api?.[id]?.model,models:config.get().api?.[id]?.models??API_PROVIDERS[id].models})),
 });
 const call=async(c:Candidate,system:string,text:string,signal:AbortSignal)=>{
  const cwd=refinePaths(home).cwd;fs.mkdirSync(cwd,{recursive:true,mode:0o700});
  let model=c.choice.model;
  if(c.choice.backend!=='api'){
   const info=modelsOf(catalog,c.choice.backend).find(m=>m.id===model);
   if(info?.variants){const levels=Object.keys(info.variants) as (keyof typeof info.variants)[];const level=levels.includes('medium' as never)?'medium' as never:(info.defaultEffort??levels[0]!);model=info.variants[level]??model;}
  }
  const r=await engine.run({...c.choice,model,cwd,permission:'read',system,buildPrompt:(_resume,sent)=>sent?text:`${system}\n\n${text}`,signal,timeoutMs:180_000});
  return r.text;
 };
 const deps:RefineDeps={
  home,settings,
  appRunning:()=>appRunning(home),
  skills:()=>skills.list().filter(s=>skillTier(skills,s.name)===2&&s.load!=='off').flatMap(s=>{try{return [{name:s.name,md:fs.readFileSync(path.join(s.dir,'SKILL.md'),'utf8')}];}catch{return [];}}),
  learned:()=>{try{return new DesktopStore(home).data.learned.filter(l=>l.status!=='rejected'&&!l.edited).map(l=>({id:l.id,rule:l.rule}));}catch{return [];}},
  writeSkill:(name,md)=>{const store=new DesktopStore(home);const draft=skillRefinementDraft(name,md);stageLearnedSkill(skills,draft);(store.data.learnedDrafts??=[]).push(draft);store.save();return 'proposed';},
  applyRules:(updates,drops)=>{
   const store=new DesktopStore(home);const gone=store.data.learned.filter(l=>drops.includes(l.id));
   if(gone.length){const dir=refinePaths(home).backup;fs.mkdirSync(dir,{recursive:true,mode:0o700});atomicJson(path.join(dir,`learned-${Date.now()}.json`),gone);}
   store.data.learned=store.data.learned.filter(l=>l.status==='rejected'||l.edited||!drops.includes(l.id)).map(l=>l.status!=='rejected'&&!l.edited&&updates.has(l.id)?{...l,rule:updates.get(l.id)!,at:Date.now()}:l);store.save();
  },
  chain:()=>chainFor(settings(),chainInput()),
  call,
  waitIdle:signal=>waitUntilIdle({signal,check:()=>checkIdle()}),
  ...overrides,
 };
 return new Refiner(deps);
}

/** Điểm vào dòng lệnh: `pvta-core --refine [--force]`. Không in nội dung kỹ năng, chỉ in kết quả tóm tắt. */
export async function runRefineCli(argv=process.argv,home=pvtaHome()):Promise<number>{
 try{os.setPriority(10);}catch{/* không hạ được độ ưu tiên: vẫn chạy */}
 const ac=new AbortController();for(const sig of ['SIGTERM','SIGINT'] as const)process.on(sig,()=>ac.abort());
 let outcome:RefineOutcome;
 try{outcome=await createRefiner(home).run({force:argv.includes('--force'),signal:ac.signal});}
 catch(e){process.stdout.write(JSON.stringify({state:'error',message:e instanceof Error?e.message.slice(0,300):String(e)})+'\n');return 1;}
 process.stdout.write(JSON.stringify(outcome)+'\n');return 0;
}
export {stopRefiner};
