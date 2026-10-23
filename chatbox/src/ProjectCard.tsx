import {t as uiText} from './i18n';
import React from 'react';
import {ProjectActions} from './ProjectActions';

type Props={id:string;name:string;rules:string;chatCount:number;onOpen:()=>void;onLearning:()=>void;onEdit:()=>void;onDeleted:()=>void;report:(e:unknown)=>void};

export function ProjectCard({id,name,rules,chatCount,onOpen,onLearning,onEdit,onDeleted,report}:Props){
 return <ProjectActions project={{id,name}} report={report} onOpen={onOpen} onEdit={onEdit} onLearning={onLearning} onDeleted={onDeleted} className="project-card-actions"><article className="project-card" onClick={event=>{
  if(event.defaultPrevented||(event.target as HTMLElement).closest('button'))return;
  onOpen();
 }}>
  <span className="project-icon" aria-hidden="true">▱</span>
  <button type="button" className="plain card-title" onClick={onOpen}>{name}</button>
  <p>{rules||uiText("Chưa có chỉ dẫn riêng.")}</p>
  <div><small>{chatCount} {uiText("hội thoại")}</small></div>
 </article></ProjectActions>;
}
