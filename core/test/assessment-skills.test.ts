import {it,expect} from 'vitest';import fs from 'node:fs';import path from 'node:path';
import {SkillStore,parseSkill,findUnsafe} from '../src/skills';import {assessmentSkillNames} from '../src/desktop/assessment-skills';
const dir=path.resolve('desktop-skills');const names=['office-doc-dac-ta','office-doc-ma-tran','office-sinh-de','office-dap-an','office-ho-so-kiem-tra'];
it('ships all stages, resolvable dependencies and complete prompt bodies in the desktop bundle',()=>{
 const store=new SkillStore(dir);for(const name of names){const raw=fs.readFileSync(path.join(dir,name,'SKILL.md'),'utf8');const skill=parseSkill(raw);expect(skill.name).toBe(name);expect(skill.load).toBe('demand');expect(skill.description).toBeTruthy();expect(skill.body.length).toBeLessThan(20000);expect(findUnsafe(raw)).toBeNull();for(const match of raw.matchAll(/`(office-(?:doc-dac-ta|doc-ma-tran|sinh-de|dap-an|ho-so-kiem-tra))`/g))expect(store.read(match[1]!)).toBeTruthy();}
 const config=JSON.parse(fs.readFileSync('chatbox/src-tauri/tauri.conf.json','utf8'));expect(config.bundle.resources['../../desktop-skills/']).toBe('desktop-skills/');
});
it('routes individual requests and compound assessment tasks without activating on unrelated work',()=>{
 expect(assessmentSkillNames('Đọc bản đặc tả')).toEqual(['office-doc-dac-ta']);expect(assessmentSkillNames('Đọc ma trận')).toEqual(['office-doc-ma-tran']);expect(assessmentSkillNames('Soạn đề kiểm tra')).toEqual(['office-sinh-de']);expect(assessmentSkillNames('Chỉ lập đáp án')).toEqual(['office-dap-an']);expect(assessmentSkillNames('Soạn giáo án')).toEqual([]);expect(assessmentSkillNames('Sinh đề từ ma trận và đặc tả, kèm đáp án')).toEqual(expect.arrayContaining(names));
});
