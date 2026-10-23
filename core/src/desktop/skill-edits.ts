import {requireSkillAccess} from '../skill-policy.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SkillStore,parseSkill,SKILL_NAME_RE,INTERNAL_SKILLS,findUnsafe} from '../skills.js';

const digest=(text:string)=>crypto.createHash('sha256').update(text).digest('hex');
const BACKUP=/^\d{13}-[a-f0-9-]{36}$/;
/** Explicit edit sessions: immutable pre-edit snapshots and optimistic concurrency on save/restore. */
export class SkillEdits {
 constructor(private store:SkillStore){}
 private location(name:string){
  requireSkillAccess(this.store,name,'view');
  if(!SKILL_NAME_RE.test(name)||INTERNAL_SKILLS.has(name))throw Error('Tên skill không hợp lệ.');
  const skill=this.store.list().find(s=>s.name===name);
  if(!skill)throw Error('Không tìm thấy skill.');
  return path.join(skill.dir,'SKILL.md');
 }
 private backupDir(name:string){return path.join(this.store.dir,'.edit-backups',name);}
 private snapshot(name:string,text:string){
  const dir=this.backupDir(name);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const id=Date.now()+'-'+crypto.randomUUID();fs.writeFileSync(path.join(dir,id+'.md'),text,{flag:'wx',mode:0o600});return id;
 }
 private readBackup(name:string,id:string){
  if(!BACKUP.test(id))throw Error('Bản backup không hợp lệ.');
  return fs.readFileSync(path.join(this.backupDir(name),id+'.md'),'utf8');
 }
 private write(file:string,text:string){
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,text,{flag:'wx',mode:0o600});fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
 }
 detail(name:string){
  const text=fs.readFileSync(this.location(name),'utf8');
  let backups:{id:string;at:number}[]=[];
  try{backups=fs.readdirSync(this.backupDir(name)).filter(f=>f.endsWith('.md')&&BACKUP.test(f.slice(0,-3))).map(f=>({id:f.slice(0,-3),at:Number(f.slice(0,13))})).sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id));}catch{}
  let bundled=false;try{bundled=Object.hasOwn(JSON.parse(fs.readFileSync(path.join(this.store.dir,'.bundled.json'),'utf8')),name);}catch{}
  return {name,text,revision:digest(text),backups,bundled};
 }
 begin(name:string){requireSkillAccess(this.store,name,'edit');const detail=this.detail(name);const backupId=this.snapshot(name,detail.text);return {...this.detail(name),backupId};}
 save(name:string,backupId:string,text:unknown){
  requireSkillAccess(this.store,name,'edit');
  const file=this.location(name),current=fs.readFileSync(file,'utf8');
  const before=this.readBackup(name,backupId);
  if(digest(current)!==digest(before))throw Error('Skill đã thay đổi. Mở lại rồi bấm Sửa để tạo backup mới.');
  if(typeof text!=='string'||Buffer.byteLength(text)>60000)throw Error('Skill vượt giới hạn 60 KB.');
  const parsed=parseSkill(text);
  if(parsed.name!==name||!parsed.description?.trim()||!parsed.body.trim()||!parsed.load)throw Error('Giữ đúng name, bổ sung description, load hợp lệ và nội dung skill.');
  const unsafe=findUnsafe(text);if(unsafe)throw Error('Nội dung skill '+unsafe+'.');
  this.write(file,text);return this.detail(name);
 }
 restore(name:string,backupId:string,revision:string){
  requireSkillAccess(this.store,name,'edit');
  const detail=this.detail(name);
  if(detail.revision!==revision)throw Error('Skill đã thay đổi. Tải lại trước khi khôi phục.');
  const text=this.readBackup(name,backupId);
  // Preserve the edited version as well, so a mistaken restoration is reversible.
  this.snapshot(name,detail.text);this.write(this.location(name),text);return this.detail(name);
 }
}
