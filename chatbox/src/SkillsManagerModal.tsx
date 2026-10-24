import React,{useEffect,useState} from 'react';
import {t as uiText} from './i18n';
import {rpc,type ViewState} from './ipc';
import {Modal} from './Modal';
import {StandardizeBox} from './Standardize';
import {SkillEditor} from './SkillEditor';
import type {SkillInfo} from '@pvta/shared';

export function SkillsManagerModal({state,report,notice,onActions}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;onActions?:(actions:React.ReactNode)=>void}){
 const [tier,setTier]=useState<2|3|4>(4);
 const [selectedName,setSelectedName]=useState<string>('');
 const [own,setOwn]=useState(false);
 const [name,setName]=useState('');
 const [body,setBody]=useState('');
 const [view,setView]=useState<(ViewState['skills'][number]&{requestEdit?:boolean})|undefined>();

 const skillsInTier=state.skills.filter(s=>(s.tier??4)===tier);
 const selectedSkill=skillsInTier.find(s=>s.name===selectedName)||skillsInTier[0];
 const protectedSkill=!selectedSkill||selectedSkill.tier===1||selectedSkill.tier===2||selectedSkill.name.startsWith('pvta-')||selectedSkill.name.startsWith('learned-');

 const handleAdd=()=>{
  setOwn(true);
 };
 const handleEdit=()=>{
  if(selectedSkill){
   if(protectedSkill){
    notice(uiText("Kỹ năng hệ thống hoặc tự học không thể sửa trực tiếp."));
   }else{
    setView({...selectedSkill,requestEdit:true});
   }
  }else{
   notice(uiText("Chưa chọn kỹ năng để sửa."));
  }
 };
 const handleDelete=()=>{
  if(selectedSkill){
   if(protectedSkill){
    notice(uiText("Kỹ năng hệ thống hoặc tự học không thể xóa."));
   }else if(confirm(uiText("Xóa skill {0}?",[selectedSkill.name]))){
    void rpc('deleteSkill',{name:selectedSkill.name}).then(()=>{
     notice(uiText("Đã xóa skill {0}.",[selectedSkill.name]));
     if(selectedName===selectedSkill.name)setSelectedName('');
    }).catch(report);
   }
  }else{
   notice(uiText("Chưa chọn kỹ năng để xóa."));
  }
 };

 useEffect(()=>{
  onActions?.(<div className="manager-header-toolbar">
   <button type="button" className="primary btn-compact" title={uiText("Tạo kỹ năng mới")} onClick={handleAdd}>{uiText("＋ Thêm")}</button>
   <button type="button" className="btn-compact" disabled={!selectedSkill||protectedSkill} title={uiText("Sửa kỹ năng đang chọn")} onClick={handleEdit}>{uiText("✎ Sửa")}</button>
   <button type="button" className="danger btn-compact" disabled={!selectedSkill||protectedSkill} title={uiText("Xóa kỹ năng đang chọn")} onClick={handleDelete}>{uiText("🗑 Xóa")}</button>
  </div>);
 },[selectedSkill,protectedSkill]);

 return <div className="manager">
  <div className="manager-toolbar-strip">
   <div className="manager-selected-label">
    {selectedSkill?<>{uiText("Đang chọn:")} <strong>/{selectedSkill.name}</strong></>:uiText("Chưa chọn kỹ năng")}
   </div>
   <div className="manager-toolbar-actions">
    <button type="button" className="primary btn-compact" onClick={handleAdd}>{uiText("＋ Thêm")}</button>
    <button type="button" className="btn-compact" disabled={!selectedSkill||protectedSkill} onClick={handleEdit}>{uiText("✎ Sửa")}</button>
    <button type="button" className="danger btn-compact" disabled={!selectedSkill||protectedSkill} onClick={handleDelete}>{uiText("🗑 Xóa")}</button>
   </div>
  </div>
  <div className="settings-tabs">{([[4,uiText("Tự tạo")],[3,uiText("Từ GitHub")],[2,uiText("PVTA tự học")]] as const).map(([id,label])=><button key={id} className={tier===id?'selected':''} onClick={()=>setTier(id)}>{label} · {state.skills.filter(s=>(s.tier??4)===id).length}</button>)}</div>
  <div className="manager-list">{skillsInTier.map(s=><article key={s.name} className={`manager-item ${selectedSkill?.name===s.name?'selected':''}`} onClick={()=>setSelectedName(s.name)} onDoubleClick={handleEdit}>
   <div><strong>/{s.name}{s.load==='off'?' · '+uiText("đang tắt"):''}</strong><small>{s.description||uiText("Quy trình cá nhân.")}</small></div>
   <div className="manager-actions"><input type="checkbox" aria-label={uiText("Bật {0}",[s.name])} checked={s.load!=='off'} disabled={s.tier===1||s.tier===2} onChange={e=>void rpc('toggleSkill',{name:s.name,enabled:e.target.checked}).catch(report)}/><button onClick={()=>setView(s)}>{uiText("Mở")}</button></div>
  </article>)}
  {!skillsInTier.length&&<div className="empty-card"><h3>{uiText("Chưa có kỹ năng nào")}</h3></div>}</div>
  {own&&<Modal title={uiText("Viết skill mới")} onClose={()=>setOwn(false)}><label>{uiText("Tên")}<input value={name} onChange={e=>setName(e.target.value)}/></label><label>{uiText("Nội dung SKILL.md")}<textarea className="editor" value={body} onChange={e=>setBody(e.target.value)}/></label><StandardizeBox kind="skill" text={body} title={name} defaultSource={uiText("Thầy cô viết")} onApply={r=>{setBody(r.text);if(r.title)setName(r.title);}} report={report}/><div className="modal-actions"><button type="button" onClick={()=>setOwn(false)}>{uiText("Hủy")}</button><button className="primary" onClick={()=>void rpc('createSkill',{name,text:body}).then(()=>{setOwn(false);notice(uiText("Đã lưu skill."));}).catch(report)}>{uiText("Lưu skill")}</button></div></Modal>}
  {view&&<Modal title={view.name} onClose={()=>setView(undefined)}><SkillEditor name={view.name} requestEdit={!!view.requestEdit} report={report} notice={notice}/></Modal>}
 </div>;
}
