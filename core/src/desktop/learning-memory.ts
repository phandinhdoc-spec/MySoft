import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateLearned,writeLearned} from '../learner.js';
import {setSkillLoad} from '../skillimport.js';
import type {SkillStore} from '../skills.js';
import type {LearnedDraft} from './types.js';

const hash=(file:string)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
/** Only replace a file still matching the version managed by this memory item. */
export function activateLearnedSkill(skills:SkillStore,item:LearnedDraft,previous?:LearnedDraft):void{
 const valid=validateLearned(item);if(!valid.ok)throw Error(valid.reason);
 const file=path.join(skills.dir,item.name,'SKILL.md');
 const exists=fs.existsSync(file);
 if(exists&&(!item.existingHash||hash(file)!==item.existingHash))throw Error('Tên skill đã tồn tại hoặc nội dung đã đổi. Đổi tên để giữ nguyên skill hiện có.');
 if(!exists||previous){
  const result=writeLearned(skills.dir,item,Date.now(),{preserveExisting:!exists});
  if(!result.written)throw Error(result.reason);
 }else setSkillLoad(skills,item.name,'demand',true);
 if(previous&&previous.name!==item.name&&previous.status==='active')setSkillLoad(skills,previous.name,'off',true);
 item.existingHash=hash(file);item.status='active';item.at=Date.now();item.reviewedAt=item.at;item.activationError=undefined;
}

/** Automatic learning can only stage a draft; publication requires explicit user review. */
export function stageLearnedSkill(_skills:SkillStore,item:LearnedDraft):void{
 item.status='proposed';delete item.reviewedAt;
}
