import {t as uiText} from './i18n';
import React,{useRef,useState} from 'react';
import {type FeatureKey} from '../../shared/src/teacherSuite';
import {Icon} from './Icon';
import {TeacherSuiteWorkspace} from './TeacherSuiteModal';
import {MathWorkshop} from './MathWorkshop';
import {GroupsPanel} from './GroupsPanel';
import type {ViewState} from './ipc';
import './tools-hub.css';

import {SECTIONS,DOC_TOOLS,DOC_TOOL_ICONS,PRO_TABS,type ToolsSection,type ProTab} from './tool-navigation';
export type {ToolsSection,ProTab} from './tool-navigation';
type GroupTab='groups'|'docs'|'basis'|'learn';

type Props={
 state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;
 section:ToolsSection;onSection:(s:ToolsSection)=>void;
 pro:ProTab;onPro:(t:ProTab)=>void;
 groupTarget:{tab:GroupTab;group?:string};
 onTool:(key:string)=>void;onPrompt:(prompt:string)=>void;onWork:(target:string)=>void;
};

/** Trang «Tiện ích»: ba mục — tài liệu & cá nhân hóa, bộ công cụ chuyên môn (gồm Xưởng Toán), nhóm & công việc. */
export function ToolsHub({state,report,notice,section,onSection,pro,onPro,groupTarget,onTool,onPrompt,onWork}:Props){
 const newDocs=state.groups?.kinds.flatMap(k=>k.groups).reduce((n,g)=>n+g.newDocs,0)??0;
 // Giữ trạng thái của bộ công cụ/Xưởng Toán khi chuyển qua lại: chỉ dựng lần đầu khi được mở.
 const seen=useRef<Set<string>>(new Set());
 const [feature,setFeature]=useState<FeatureKey>('assessment');
 if(section==='pro'){seen.current.add(pro==='math'?'math':'suite');}
 const suiteTab:FeatureKey=pro==='math'?feature:pro;
 const pick=(t:ProTab)=>{if(t!=='math')setFeature(t);onPro(t);};
 return <div className="workspace-panel tools-hub">
  <div className="page-heading"><div><span className="eyebrow">{uiText("TIỆN ÍCH")}</span><h1>{uiText("Tiện ích của thầy cô")}</h1><p>{uiText("Mọi công cụ làm việc cùng tài liệu, chuyên môn và nhóm công việc gom về một chỗ.")}</p></div></div>
  <nav className="hub-tabs" role="tablist" aria-label={uiText("Nhóm tiện ích")}>{SECTIONS.map(x=><button key={x.key} role="tab" aria-selected={section===x.key} className={`hub-tab ${section===x.key?'active':''}`} onClick={()=>onSection(x.key)}><span className="hub-tab-icon"><Icon name={x.icon} size={19}/></span><span className="hub-tab-text"><strong>{x.title}</strong><small>{x.hint}</small></span>{x.key==='groups'&&newDocs>0&&<span className="hub-dot" title={uiText("{0} văn bản mới",[newDocs])}>{newDocs>99?'99+':newDocs}</span>}</button>)}</nav>

  {section==='docs'&&<section className="hub-section"><h2 className="tools-subhead">{uiText("Tiện ích tài liệu & Cá nhân hóa")}</h2><div className="tool-grid">{DOC_TOOLS.map(([icon,name,desc,key])=><button className="tool-card" key={key} onClick={()=>onTool(key)}><span><Icon name={DOC_TOOL_ICONS[key]??'tools'}/></span><h3>{name}</h3><p>{desc}</p><small>{uiText("Bắt đầu ↗")}</small></button>)}</div></section>}

  {(section==='pro'||seen.current.has('suite')||seen.current.has('math'))&&<section className="hub-section" hidden={section!=='pro'}>
   <div className="pro-head"><div><span className="pro-eyebrow">{uiText("BỘ CÔNG CỤ CHUYÊN MÔN")}</span><h2>{uiText("Trợ lý chuyên môn & Xưởng Toán")}</h2></div></div>
   <nav className="pro-tabs" role="tablist" aria-label={uiText("Công cụ chuyên môn")}>{PRO_TABS.map(t=><button key={t.key} role="tab" aria-selected={pro===t.key} className={`pro-tab tone-${t.tone} ${pro===t.key?'active':''}`} onClick={()=>pick(t.key)}><span className="pro-tab-icon"><Icon name={t.icon} size={20}/></span><span className="pro-tab-text"><strong>{t.title}</strong><small>{t.badge}</small></span></button>)}</nav>
   <div className="pro-body" hidden={pro==='math'}><TeacherSuiteWorkspace hideTabs tab={suiteTab} notice={notice} onSendPrompt={onPrompt}/></div>
   {seen.current.has('math')&&<div className="pro-body" hidden={pro!=='math'}><MathWorkshop embedded notice={notice} report={report} onPrompt={onPrompt}/></div>}
  </section>}

  {section==='groups'&&<section className="hub-section"><GroupsPanel embedded state={state} report={report} notice={notice} initialTab={groupTarget.tab} initialGroup={groupTarget.group} onWork={onWork}/></section>}
 </div>;
}
