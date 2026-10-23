import {t as uiText} from './i18n';
import {QuickAccess} from './QuickAccess';
import React,{useState} from 'react';
import {Icon} from './Icon';
import type {ViewState} from './ipc';
import type {OfficeNavigation} from './OfficePanel';
import {DOC_TOOLS,DOC_TOOL_ICONS,GROUP_TOOL_ICONS,PRO_TABS,type ToolsSection,type ProTab} from './tool-navigation';
export type SkillNavigation={name?:string;create?:boolean;import?:boolean};
type Props={panel:string;state?:ViewState;toolsSection:ToolsSection;pro:ProTab;groupTab:string;onOffice:(request:OfficeNavigation)=>void;onSkill:(request:SkillNavigation)=>void;onPrompt:(prompt:string)=>void;onTool:(key:string)=>void;onTools:(section:ToolsSection,target?:string)=>void};
const prompts=[[uiText("Tạo đáp án"),uiText("/office-dap-an Tạo file đáp án từ đề đã đính kèm.")],[uiText("Soạn giáo án"),'/office-giao-an Soạn giáo án '],[uiText("Rà soát tài liệu"),uiText("/office-ra-soat Rà soát các tài liệu đã đính kèm.")],[uiText("Tạo báo cáo"),uiText("/office-bao-cao Tạo báo cáo từ dữ liệu đã đính kèm.")]];
export function WorkspaceSidebar(p:Props){
 const [query,setQuery]=useState('');
 const row=(label:string,icon:string,onClick:()=>void,selected=false,detail?:string)=><button type="button" key={label} className={`workspace-side-row ${selected?'selected':''}`} aria-current={selected?'page':undefined} title={detail?`${label} · ${detail}`:label} onClick={onClick}><Icon name={icon} size={16}/><span><strong>{label}</strong>{detail&&<small>{detail}</small>}</span></button>;
 return <nav className="workspace-sidebar" aria-label={p.panel==='office'?uiText("Tài liệu Office"):p.panel==='skills'?uiText("Danh sách kỹ năng"):uiText("Danh sách tiện ích")}>
 <QuickAccess value={p.state?.data?.preferences.quickAccess} onError={e=>console.error(e)} items={[
 ...DOC_TOOLS.map(([,label,,key])=>({id:'tool:'+key,label,icon:DOC_TOOL_ICONS[key]??'tools',run:()=>p.onTool(key)})),
 ...PRO_TABS.map(t=>({id:'pro:'+t.key,label:t.title,icon:t.icon,run:()=>p.onTools('pro',t.key)})),
 {id:'skills:create',label:uiText("Tự viết kỹ năng"),icon:'plus',run:()=>p.onSkill({create:true})},
 {id:'skills:import',label:uiText("Nhập từ GitHub"),icon:'github',run:()=>p.onSkill({import:true})},
 ...['word','excel','powerpoint'].map(host=>({id:'office:'+host,label:uiText('Tạo')+' '+host,icon:'office',run:()=>p.onOffice({create:host})})),
 ...[['groups',uiText("Nhóm công việc")],['docs',uiText("Văn bản")],['basis',uiText("Căn cứ")],['learn',uiText("Đề xuất học")]].map(([key,label])=>({id:'groups:'+key,label:label!,icon:GROUP_TOOL_ICONS[key!]??'groups',run:()=>p.onTools('groups',key)})),
 ]}/>
 {p.panel==='office'&&<>
 <details open><summary>{uiText("Tạo tệp mới")}</summary>{[['Word','word'],['Excel','excel'],['PowerPoint','powerpoint']].map(([label,host])=>row(label!,'office',()=>p.onOffice({create:host})))}</details>
 <details open><summary>{uiText("Tài liệu kết nối")}<small>{p.state?.office?.sessions.length??0}</small></summary>{p.state?.office?.sessions.length?p.state.office.sessions.map(s=>row(s.name,'file',()=>p.onOffice({session:s.id}),p.state?.office?.selected===s.id,s.host)):<p className="workspace-side-empty">{uiText("Chưa có tài liệu kết nối. Tạo tệp mới hoặc kết nối từ trang Office.")}</p>}</details>
 <details open><summary>{uiText("Soạn cùng PVTA")}</summary>{prompts.map(([label,prompt])=>row(label!,'chat',()=>p.onPrompt(prompt!)))}</details>
 </>}
 {p.panel==='skills'&&<>
 <div className="workspace-side-actions">{row(uiText("Tự viết kỹ năng"),'plus',()=>p.onSkill({create:true}))}{row(uiText("Nhập từ GitHub"),'github',()=>p.onSkill({import:true}))}</div>
 <label className="workspace-side-search"><Icon name="search" size={14}/><input type="search" aria-label={uiText("Tìm kỹ năng")} placeholder={uiText("Tìm kỹ năng…")} value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {([[2,uiText("PVTA tự học")],[3,uiText("Từ GitHub")],[4,uiText("Tự tạo")]] as const).map(([tier,label])=><details open key={tier}><summary>{label} <small>{p.state?.skills.filter(s=>(s.tier??4)===tier).length??0}</small></summary>{p.state?.skills.filter(s=>(s.tier??4)===tier&&`${s.name} ${s.description}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))).map(s=>row(s.name,tier===2?'brain':tier===3?'github':'edit',()=>p.onSkill({name:s.name}),false,s.load==='off'?uiText("Đang tắt"):s.load==='manual'?uiText("Gọi bằng /tên"):uiText("Đang bật")))}</details>)}
 </>}
 {p.panel==='tools'&&<>
 <details open><summary>{uiText("Tài liệu & cá nhân hóa")}</summary>{DOC_TOOLS.map(([,name,,key])=>row(name,DOC_TOOL_ICONS[key]??'tools',()=>p.onTool(key)))}</details>
 <details open><summary>{uiText("Chuyên môn")}</summary>{PRO_TABS.map(t=>row(t.title,t.icon,()=>p.onTools('pro',t.key),p.toolsSection==='pro'&&p.pro===t.key))}</details>
 <details open><summary>{uiText("Nhóm & công việc")}</summary>{[['groups',uiText("Nhóm công việc")],['docs',uiText("Văn bản")],['basis',uiText("Căn cứ")],['learn',uiText("Đề xuất học")]].map(([key,label])=>row(label!,GROUP_TOOL_ICONS[key!]??'groups',()=>p.onTools('groups',key),p.toolsSection==='groups'&&p.groupTab===key))}</details>
 </>}
 </nav>;
}
