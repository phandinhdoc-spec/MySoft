import fs from 'node:fs';
import path from 'node:path';
import {INTERNAL_SKILLS,type SkillStore} from './skills.js';
import {readRegistry} from './skillimport.js';
export type SkillTier=1|2|3|4;
/** Provenance comes from the installation record, never from frontmatter supplied by a download. */
export function skillTier(store:SkillStore,name:string):SkillTier{
 if(INTERNAL_SKILLS.has(name))return 1;
 let bundled:Record<string,string>={};try{bundled=JSON.parse(fs.readFileSync(path.join(store.dir,'.bundled.json'),'utf8'));}catch{}
 if(Object.hasOwn(bundled,name))return 1;
 const imported=readRegistry(store)[name];
 if(imported)return /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//.test(imported.source)?3:4;
 return name.startsWith('learned-')?2:4;
}
export function requireSkillAccess(store:SkillStore,name:string,action:'view'|'edit'|'manage'){
 const tier=skillTier(store,name);
 if(tier===1)throw Error('Skill hệ thống chỉ được xem trong mã nguồn quản trị và chỉ sửa bằng cập nhật mã nguồn.');
 if(tier===2&&action!=='view')throw Error('Skill tự học được biên tập qua Biên tập nền và duyệt trong Những điều đã học.');
 return tier;
}
