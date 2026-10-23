import {t as uiText} from './i18n';
import React,{useState} from 'react';
import {rpc,type ViewState,type Preferences} from './ipc';
import {RuleManager} from './Composer';
import {choiceKey,parseKey,modelGroups} from './model-groups';
import {userInitial,type RuleScope,type RuleScopeKind} from './profile';

type Skill=ViewState['skills'][number];
/** Kỹ năng do thầy cô tự tạo: không phải kỹ năng đi kèm, tự học hay nhập từ GitHub. */
export const isOwnSkill=(s:Skill)=>s.tier===4&&!/^(pvta|office|learned)-/.test(s.name);

/**
 * Quy tắc theo phạm vi. Hội thoại hiện tại → dự án đang mở → cá nhân; phạm vi hẹp hơn thắng khi trùng #khóa.
 * `initial` chọn sẵn tab khi mở từ nơi cụ thể (ví dụ nút “Quy tắc dự án”).
 */
export function RuleCenter({state,report,notice,chatId,projectId,initial,onActions}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;chatId?:string;projectId?:string;initial?:RuleScopeKind;onActions?:(actions:React.ReactNode)=>void}){
 const project=projectId?state.data.projects.find(p=>p.id===projectId):undefined;
 const chat=chatId?state.data.chats.find(c=>c.id===chatId):undefined;
 const tabs:{kind:RuleScopeKind;label:string;scope:RuleScope}[]=[
  ...(chat?[{kind:'chat' as const,label:uiText("Hội thoại này"),scope:{kind:'chat',id:chat.id} as RuleScope}]:[]),
  ...(project?[{kind:'project' as const,label:uiText("Dự án")+` · ${project.name}`,scope:{kind:'project',id:project.id} as RuleScope}]:[]),
  {kind:'profile',label:uiText("Cá nhân"),scope:{kind:'profile'}}];
 const [tab,setTab]=useState<RuleScopeKind>(()=>tabs.some(t=>t.kind===initial)?initial!:tabs[0]!.kind);
 const current=tabs.find(t=>t.kind===tab)??tabs[tabs.length-1]!;
 return <div className="rule-center">
  <div className="settings-tabs" role="tablist" aria-label={uiText("Phạm vi quy tắc")}>{tabs.map(t=><button key={t.kind} role="tab" aria-selected={t.kind===current.kind} className={t.kind===current.kind?'selected':''} onClick={()=>setTab(t.kind)}>{t.label}</button>)}</div>
  <RuleManager key={current.kind+(current.scope.kind==='profile'?'':current.scope.id)} state={state} report={report} notice={notice} scope={current.scope} onActions={onActions}/>
 </div>;
}

type ProfileTab='info'|'rules'|'skills';
/** Hồ sơ cá nhân: tên hiển thị, quy tắc và kỹ năng riêng. Quy tắc/kỹ năng ở đây dùng cho mọi hội thoại, dự án và sổ nguồn. */
export function ProfilePanel({state,patch,report,notice,onSkill}:{state:ViewState;patch:(p:Partial<Preferences>)=>Promise<void>;report:(e:unknown)=>void;notice:(s:string)=>void;onSkill:(request:{name?:string;create?:boolean})=>void}){
 const [tab,setTab]=useState<ProfileTab>('info');
 const saved=state.data.preferences.userName??'';
 const [draft,setDraft]=useState(saved);
 const own=state.skills.filter(isOwnSkill);
 const tabs:[ProfileTab,string][]=[['info',uiText("Thông tin")],['rules',uiText("Quy tắc")],['skills',uiText("Kỹ năng")]];
 return <div className="profile-panel">
  <div className="settings-tabs" role="tablist" aria-label={uiText("Hồ sơ cá nhân")}>{tabs.map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?'selected':''} onClick={()=>setTab(key)}>{label}</button>)}</div>
  {tab==='info'&&<form className="settings-section" onSubmit={e=>{e.preventDefault();void patch({userName:draft}).then(()=>notice(uiText("Đã lưu tên."))).catch(report);}}>
   <div className="profile-head"><span className="avatar profile-avatar" aria-hidden="true">{userInitial(draft)}</span><div><strong>{draft.trim()||uiText("Không gian cá nhân")}</strong><small>{uiText("Chữ cái đầu của tên hiện ở biểu tượng hồ sơ, góc dưới bên trái.")}</small></div></div>
   <label>{uiText("Tên của thầy cô")}<input maxLength={60} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={uiText("Ví dụ: Phan Đình Đốc")}/></label>
   <div className="modal-actions"><button className="primary" type="submit" disabled={draft.trim()===saved}>{uiText("Lưu tên")}</button></div>
   <label>{uiText("Model mặc định")}
    <select value={choiceKey(state.data.preferences.choice)} onChange={e=>void patch({choice:parseKey(e.target.value)}).then(()=>notice(uiText("Đã lưu model mặc định. Áp dụng cho hội thoại mới."))).catch(report)}>
     <option value="auto">{uiText("Tự động chọn AI")}</option>
     {modelGroups(state).map(g=><optgroup key={g.label} label={g.label}>{g.items.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
    </select>
    <small>{uiText("Hội thoại mới dùng model này. Đổi model ở thanh dưới ô chat chỉ áp dụng cho hội thoại đang mở; việc nền và hội thoại chưa chọn riêng dùng model mặc định.")}</small>
   </label>
   <div className="profile-guide">
    <p><strong>{uiText("Quy tắc và kỹ năng đặt ở đây")}</strong> {uiText("dùng cho mọi hội thoại, dự án và sổ nguồn.")}</p>
    <p><strong>{uiText("Quy tắc lập trong một hội thoại")}</strong> {uiText("chỉ áp dụng trong hội thoại đó.")}</p>
    <p><strong>{uiText("Quy tắc lập trong một dự án")}</strong> {uiText("chỉ áp dụng trong dự án đó: “toàn cục” luôn chạy, “cục bộ” chỉ chạy khi gọi bằng #tên.")}</p>
   </div>
  </form>}
  {tab==='rules'&&<RuleManager state={state} report={report} notice={notice} scope={{kind:'profile'}}/>}
  {tab==='skills'&&<div className="manager">
   <div className="row"><p className="muted small grow">{uiText("Kỹ năng do thầy cô tự tạo, dùng được ở mọi hội thoại và dự án. Gọi bằng /tên trong ô chat.")}</p><button className="primary" onClick={()=>onSkill({create:true})}>{uiText("＋ Tự viết skill")}</button></div>
   <div className="manager-list">{own.map(s=><article key={s.name}><div><strong>/{s.name}{s.load==='off'?' · '+uiText("đang tắt"):''}</strong><small>{s.description||uiText("Quy trình cá nhân.")}</small></div>
    <div className="manager-actions"><input type="checkbox" aria-label={uiText("Bật {0}",[s.name])} checked={s.load!=='off'} onChange={e=>void rpc('toggleSkill',{name:s.name,enabled:e.target.checked}).catch(report)}/><button onClick={()=>onSkill({name:s.name})}>{uiText("Mở")}</button><button className="danger" onClick={()=>{if(confirm(uiText("Xóa skill {0}?",[s.name])))void rpc('deleteSkill',{name:s.name}).catch(report);}}>{uiText("Xóa")}</button></div></article>)}
    {!own.length&&<div className="empty-card"><h3>{uiText("Chưa có kỹ năng riêng")}</h3><p>{uiText("Bấm “Tự viết skill” để tạo quy trình của riêng thầy cô. Kỹ năng đi kèm PVTA và kỹ năng nhập từ GitHub nằm ở mục Kỹ năng.")}</p></div>}</div>
  </div>}
 </div>;
}
