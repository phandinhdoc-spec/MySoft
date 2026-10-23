import {it,expect,vi} from 'vitest';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SkillStore} from '../src/skills';import {SkillDiscovery} from '../src/desktop/skill-discovery';
it('persists relevance decisions, requires approval, and does not re-review identical candidates',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-scout-'));
 try{
  const store=new SkillStore(path.join(home,'skills'));const scout=new SkillDiscovery(home,store);
  const md='---\nname: lesson-guide\ndescription: Prepare lesson plans\n---\n# Lesson guide\nUse the supplied lesson objectives to prepare a lesson plan.\n';
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>new Response(String(input).includes('/search/')?JSON.stringify({items:[{html_url:'https://github.com/example/lesson-guide'}]}):md,{status:200}));
  const ask=vi.fn(async(_text:string,system:string)=>system.includes('repository search')?JSON.stringify({query:'agent skills education'}):JSON.stringify({relevant:true,reason:'Hỗ trợ soạn bài cho giáo viên.'}));
  await scout.scan({},['Giáo viên'],ask,true,fetcher);expect(store.list()).toHaveLength(0);expect(scout.view().suggestions).toHaveLength(1);
  await scout.scan({},['Giáo viên'],ask,true,fetcher);expect(ask).toHaveBeenCalledTimes(3);
  const restarted=new SkillDiscovery(home,store);restarted.decide(restarted.view().suggestions[0]!.id,true);expect(store.list()[0]?.load).toBe('manual');expect(restarted.view().suggestions).toHaveLength(0);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
