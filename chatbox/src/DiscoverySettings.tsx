import {t as uiText} from './i18n';
import React,{useEffect,useState} from 'react';
import {rpc,type ViewState} from './ipc';
import type {DiscoveryProfile,DiscoverySource} from '../../core/src/groups/types';
const empty:DiscoveryProfile={province:'',locality:'',school:'',level:'',subjects:'',keywords:''};
export function DiscoverySettings({state,report,notice}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const [profile,setProfile]=useState<DiscoveryProfile>(state.groups?.profile??empty),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
 const [editing,setEditing]=useState<Partial<DiscoverySource>>({name:'',url:'',kind:'page',enabled:true,groups:[]});
 useEffect(()=>{if(!dirty)setProfile(state.groups?.profile??empty);},[state.groups?.profile,dirty]);
 const act=async(fn:()=>Promise<unknown>,message:string)=>{setSaving(true);try{await fn();notice(message);}catch(e){report(e);}finally{setSaving(false);}};
 const groups=state.groups?.kinds.filter(k=>k.kind!=='cong-cu').flatMap(k=>k.groups)??[];
 return <section className="discovery-settings">
 <details open={!profile.province}><summary>{uiText("Hồ sơ & nguồn văn bản")} {profile.province?`· ${profile.province}`:uiText("· Chưa chọn địa phương")}</summary>
 <p className="groups-note">{uiText("Chọn địa phương, cấp học và môn dạy để tìm đúng văn bản. Vai trò lấy từ các nhóm đang bật. Tên trường lưu trên máy; câu tìm gửi ra mạng chỉ dùng địa phương, cấp học, môn và từ khóa.")}</p>
 <form onSubmit={e=>{e.preventDefault();void act(async()=>{await rpc('groups.profile',{profile});setDirty(false);},uiText("Đã lưu hồ sơ theo dõi văn bản."));}}>
 <div className="discovery-fields">{([['province',uiText("Tỉnh / thành phố"),uiText("Ví dụ: Hồ Chí Minh")],['locality',uiText("Phường / xã"),''],['school',uiText("Trường / đơn vị"),''],['level',uiText("Cấp học"),uiText("Ví dụ: THCS")],['subjects',uiText("Môn giảng dạy"),uiText("Ví dụ: Khoa học tự nhiên")],['keywords',uiText("Từ khóa cần theo dõi"),uiText("Ví dụ: chế độ giáo viên, dạy thêm")]] as const).map(([key,label,placeholder])=><label key={key}>{label}<input value={profile[key]} placeholder={placeholder} maxLength={key==='keywords'?300:160} onChange={e=>{setDirty(true);setProfile(p=>({...p,[key]:e.target.value}));}}/></label>)}</div>
 <button className="primary" disabled={saving||!dirty}>{uiText("Lưu hồ sơ")}</button>
 </form>
 <h4>{uiText("Nguồn theo dõi")}</h4><p className="groups-note">{uiText("PVTA kết hợp tìm kiếm link công khai với đọc chuyên mục/RSS. Nguồn bị chặn hoặc chưa đọc được sẽ được báo dưới đây. “Mới” là mới phát hiện, không khẳng định ngày ban hành hay hiệu lực.")}</p>
 <div className="discovery-sources">{state.groups?.sources?.map(s=><article key={s.id}>
 <label className="discovery-toggle"><input type="checkbox" checked={s.enabled} disabled={saving} onChange={e=>void act(()=>rpc('groups.saveSource',{...s,enabled:e.target.checked}),uiText("Đã cập nhật nguồn."))}/><strong>{s.name}</strong></label>
 <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
 <small>{s.kind==='feed'?'RSS / Atom':uiText("Trang văn bản")} · {s.groups.length?s.groups.map(id=>groups.find(g=>g.id===id)?.name??id).join(', '):uiText("Các nhóm đang bật")}</small>
 <small>{s.lastChecked?uiText("Kiểm tra: {0} · {1}",[new Date(s.lastChecked).toLocaleString('vi-VN'),s.lastError??uiText("{0} liên kết đọc được",[s.found??0])]):uiText("Chưa kiểm tra nguồn")}</small>
 <button disabled={saving} onClick={()=>setEditing({...s})}>{uiText("Sửa nguồn")}</button>
 </article>)}</div>
 <form className="discovery-source-form" onSubmit={e=>{e.preventDefault();void act(async()=>{await rpc('groups.saveSource',editing);setEditing({name:'',url:'',kind:'page',enabled:true,groups:[]});},uiText("Đã lưu nguồn theo dõi."));}}>
 <h4>{editing.id?uiText("Sửa nguồn"):uiText("Thêm nguồn")}</h4>
 <div className="discovery-fields"><label>{uiText("Tên nguồn")}<input required maxLength={160} value={editing.name??''} onChange={e=>setEditing(s=>({...s,name:e.target.value}))}/></label><label>{uiText("Link chuyên mục hoặc RSS")}<input required type="url" placeholder={uiText("https://…gov.vn/… hoặc …edu.vn/…")} value={editing.url??''} onChange={e=>setEditing(s=>({...s,url:e.target.value}))}/></label>
 <label>{uiText("Loại nguồn")}<select value={editing.kind} onChange={e=>setEditing(s=>({...s,kind:e.target.value as 'page'|'feed'}))}><option value="page">{uiText("Trang văn bản")}</option><option value="feed">RSS / Atom</option></select></label>
 <label>{uiText("Nhóm nhận văn bản")}<select value={editing.groups?.[0]??''} onChange={e=>setEditing(s=>({...s,groups:e.target.value?[e.target.value]:[]}))}><option value="">{uiText("Các nhóm đang bật")}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div>
 <button disabled={saving}>{editing.id?uiText("Lưu nguồn"):uiText("Thêm nguồn")}</button>{editing.id&&<button type="button" onClick={()=>setEditing({name:'',url:'',kind:'page',enabled:true,groups:[]})}>{uiText("Hủy sửa")}</button>}
 </form></details>
 </section>;
}
