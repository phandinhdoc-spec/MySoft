import {t as uiText} from './i18n';
import React from 'react';
import {rpc,type ViewState} from './ipc';
import {useObjectMenu} from './ObjectMenu';
type Skill=ViewState['skills'][number];
export function SkillCard({skill,onView,onEdit,onGuide,report,selected,onSelect}:{skill:Skill;onGuide?:(s:Skill)=>void;onView:(s:Skill)=>void;onEdit:(s:Skill)=>void;report:(e:unknown)=>void;selected?:boolean;onSelect?:()=>void}){
 const protectedSkill=skill.tier===1||skill.tier===2||skill.name.startsWith('pvta-')||skill.name.startsWith('learned-');
 const menu=useObjectMenu<string>({contextKey:skill.name,onError:report,commands:name=>name===skill.name?[
  ...(onGuide?[{id:'guide',label:uiText("Xem hướng dẫn"),run:()=>onGuide(skill)}]:[]),
  {id:'view',label:uiText("Xem nội dung"),run:()=>onView(skill)},
  ...(!protectedSkill?[{id:'edit',label:uiText("Sửa"),run:()=>onEdit(skill)},
   {id:'delete',label:uiText("Xóa"),danger:true,run:()=>{if(confirm(uiText("Xóa skill {0}?",[name])))return rpc('deleteSkill',{name});}}]:[]),
 ]:[]});
 return <article className={`skill-card ${selected?'selected':''}`} onClick={onSelect} onDoubleClick={()=>protectedSkill?onView(skill):onEdit(skill)} {...menu.handlers(skill.name)}>
  <div><span className="skill-icon">◇</span><input aria-label={uiText("Bật {0}",[skill.name])} type="checkbox" checked={skill.load!=='off'} disabled={protectedSkill} onChange={e=>void rpc('toggleSkill',{name:skill.name,enabled:e.target.checked}).catch(report)}/></div>
  <h3>{skill.name}</h3><p>{skill.guide?.summary||(skill.tier===3?uiText("Hướng dẫn tiếng Việt chưa được tạo. Chọn “Xem hướng dẫn” để biên soạn từ nội dung skill."):skill.description||uiText("Quy trình cá nhân."))}</p><small>{skill.source??uiText("Lưu trên máy")}</small>
  <footer>{menu.trigger(skill.name,uiText("Thao tác skill {0}",[skill.name]))}</footer>{menu.menu}
 </article>;
}
