import {t as uiText} from './i18n';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {rpc,pickFiles,savePath,type ViewState} from './ipc';
import {STATUS_LABEL,DOC_STATUS} from '../../core/src/groups/types';
import './groups.css';
import {DiscoverySettings} from './DiscoverySettings';
import {useObjectMenu} from './ObjectMenu';

type Props={state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;initialTab?:'groups'|'docs'|'basis'|'learn';initialGroup?:string;onWork?:(target:string)=>void;embedded?:boolean};
type Doc={id:string;no?:string;title:string;agency:string;url?:string;file?:string;status:keyof typeof STATUS_LABEL;state:string;isNew?:boolean;note?:string;issuedAt?:string};
const STATE_LABEL:Record<string,string>={'chua-tai':uiText("Chưa tải"),'dang-tai':uiText("Đang tải"),'da-tai':uiText("Đã tải"),'da-lap-chi-muc':uiText("Đã lập chỉ mục"),'chua-doc-duoc':uiText("Chưa đọc được"),'nguon-khong-con':uiText("Nguồn không còn")};

const GROUP_ICON:Record<string,string>={toan:uiText("π"),ly:'⚡',hoa:'⚗️',sinh:'🧬',khtn:'🔬',gdcd:'⚖️','tin-hoc':'💻','giao-vien':'🍎','to-truong':'📋','hieu-pho':'🗂️','hieu-truong':'🏫','van-thu':'✉️','ke-toan':'🧾','thu-vien':'📚','thiet-bi':'🧰','dang-vien':'★','bi-thu':'🚩','pho-bi-thu':'🏳️','cong-doan':'🤝','doan-doi':'🎗️',python:'🐍',arduino:'🔌','am-thanh':'🎧',typst:'✒️',pdf:'📄',word:'W',excel:'X',powerpoint:'P'};
const TOOL_KIND='cong-cu';
const TOOL_ABOUT:Record<string,string>={pdf:uiText("đọc, tóm tắt, trích dẫn trang, xử lí PDF scan"),word:uiText("soạn và trình bày Word"),excel:uiText("bảng tính, công thức, biểu đồ"),powerpoint:uiText("bài giảng, bố cục slide"),python:uiText("tính toán, xử lí dữ liệu"),arduino:uiText("cảm biến, vi điều khiển"),typst:uiText("xuất PDF đẹp từ mã Typst"),'am-thanh':uiText("ghi âm, lọc nhiễu")};
const KIND_ICON:Record<string,string>={'chuyen-mon':'📘','vai-tro':'👤','dang-doan-the':'🚩','cong-cu':'🛠️'};
const TIER_LABEL:Record<string,string>={'chinh-thuc':uiText("Chính thức"),'dong-nghiep':uiText("Đồng nghiệp")};

/** Cửa sổ «Nhóm & văn bản»: chọn nhóm, bảng văn bản, kiểm tra căn cứ, tự học. */
export function GroupsPanel({state,report,notice,initialTab='groups',initialGroup,onWork,embedded=false}:Props){
 const [tab,setTab]=useState<'groups'|'docs'|'basis'|'learn'|'work'>(initialTab);
 const [group,setGroup]=useState(initialGroup??'');
 useEffect(()=>{setTab(initialTab);setGroup(initialGroup??'');},[initialTab,initialGroup]);
 const g=state.groups;const enabled=g?.kinds.filter(k=>k.kind!==TOOL_KIND).flatMap(k=>k.groups).filter(x=>x.enabled)??[];
 return <div className={embedded?'groups-panel embedded':'workspace-panel groups-panel'}>{!embedded&&<div className="page-heading"><div><span className="eyebrow">{uiText("NHÓM & CÔNG VIỆC")}</span><h1>{uiText("Công việc của thầy cô")}</h1><p>{uiText("Bật công cụ để PVTA nạp kỹ năng tương ứng; chọn nhóm chuyên môn, vai trò để theo dõi văn bản. Mọi tra cứu chạy trên máy này.")}</p></div></div>}
  <div className="settings-tabs">{([['groups',uiText("Nhóm")],['work',uiText("Việc làm")],['docs',uiText("Văn bản")],['basis',uiText("Kiểm tra căn cứ")],['learn',uiText("Tự học")]] as const).map(([k,l])=><button key={k} className={tab===k?'selected':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab==='groups'&&<GroupTable state={state} report={report} notice={notice} onDocs={id=>{setGroup(id);setTab('docs');}}/>}
  {tab==='docs'&&<DocTable enabled={enabled} initialGroup={group} report={report} notice={notice}/>}
  {tab==='work'&&<div className="tool-grid">{[[uiText("Xưởng Toán"),uiText("Hình vẽ, đồ thị, biến thể và máy tính."),'math'],[uiText("Soạn học liệu"),uiText("Soạn câu hỏi, phiếu học tập và hướng dẫn."),uiText("Giúp tôi soạn học liệu. Hãy hỏi chủ đề và mục tiêu cần đạt.")],[uiText("Rà soát văn bản"),uiText("Đối chiếu căn cứ với tài liệu đã chọn."),uiText("Rà soát căn cứ văn bản đính kèm, trích dẫn vị trí và báo phần chưa xác minh.")],[uiText("Quy trình công việc"),uiText("Tạo và theo dõi các bước thực hiện."),'workflows']].map(([title,desc,target])=><button className="tool-card" key={target} disabled={!onWork} onClick={()=>onWork?.(target!)}><h3>{title}</h3><p>{desc}</p><small>{uiText("Mở công cụ ↗")}</small></button>)}</div>}
  {tab==='basis'&&<BasisCheck report={report} notice={notice}/>}
  {tab==='learn'&&<Learn report={report} notice={notice}/>}
 </div>;
}

function GroupTable({state,report,notice,onDocs}:Props&{onDocs:(id:string)=>void}){
 const g=state.groups;const [busy,setBusy]=useState(false);const [net,setNet]=useState('');const [peek,setPeek]=useState('');
 if(!g)return null;
 const run=(p:Promise<unknown>,ok?:string)=>{setBusy(true);p.then(()=>ok&&notice(ok)).catch(report).finally(()=>setBusy(false));};
 return <div className="groups-body">
  <DiscoverySettings state={state} report={report} notice={notice}/>
  {!g.configured&&<div className="groups-first"><strong>{uiText("Lần đầu: chọn nhóm của thầy cô")}</strong><p>{uiText("Bấm một gói có sẵn hoặc tự tick bên dưới. Chưa chọn thì PVTA vẫn nạp mọi kỹ năng như trước.")}</p></div>}
  <div className="groups-packs">{g.packs.map(p=><button key={p.id} className={g.pack===p.id?'selected':''} disabled={busy} onClick={()=>run(rpc('groups.applyPack',{id:p.id}))}>{p.name}</button>)}</div>
  {g.kinds.map(k=>k.groups.length>0&&(k.kind===TOOL_KIND?<ToolChips key={k.kind} group={k} busy={busy} activity={state.toolActivity??{}} setPeek={setPeek} run={run} notice={notice}/>:<section key={k.kind} className={`gchip-section kind-${k.kind}`}><h3>{k.label}<small>{k.groups.filter(x=>x.enabled).length}/{k.groups.length} {uiText("đang bật · văn bản theo dõi riêng từng nhóm")}</small></h3>
   <div className="gchip-grid">{k.groups.map(x=>{const info=uiText("{0} · {1} · {2} văn bản{3} · v{4} · {5}",[x.name,TIER_LABEL[x.tier]??uiText("Cá nhân"),x.docs,x.newDocs?uiText(" ({0} mới)",[x.newDocs]):'',x.version,x.author]);return <div key={x.id} className={`gchip-wrap ${x.enabled?'on':''}`}>
    <button type="button" className="gchip" aria-pressed={x.enabled} title={info} disabled={busy} onMouseEnter={()=>setPeek(info)} onFocus={()=>setPeek(info)} onClick={()=>run(rpc('groups.toggle',{id:x.id,on:!x.enabled}))}><span className="gchip-icon" aria-hidden="true">{GROUP_ICON[x.id]??KIND_ICON[k.kind]}</span><span className="gchip-name">{x.name}</span></button>
    {x.newDocs>0&&<button type="button" className="gchip-badge" title={x.enabled?uiText("{0} văn bản mới · bấm để xem",[x.newDocs]):uiText("{0} văn bản mới · bấm để bật nhóm",[x.newDocs])} aria-label={uiText("{0} văn bản mới của nhóm {1}",[x.newDocs,x.name])} onClick={()=>{if(x.enabled)onDocs(x.id);else run(rpc('groups.toggle',{id:x.id,on:true}));}}>{x.newDocs>99?'99+':x.newDocs}</button>}
   </div>;})}</div></section>))}
  <p className="gchip-peek" aria-live="polite">{peek||uiText("Bấm vào chip để bật hoặc tắt. Chip đang bật có màu. Công cụ: chấm tròn góc dưới là số tệp đang xử lí hoặc chưa xem. Nhóm chuyên môn, vai trò: chấm tròn là số văn bản mới.")}</p>
  <div className="groups-row">
   <label><input type="checkbox" checked={g.offline} onChange={e=>run(rpc('groups.offline',{on:e.target.checked}))}/> {uiText("Không dùng mạng để tìm văn bản mới")}</label>
   <label><input type="checkbox" checked={g.briefing} onChange={e=>run(rpc('groups.briefingEnable',{on:e.target.checked}))}/> {uiText("Hiện bản tin khi mở ứng dụng")}</label>
  </div>
  <div className="groups-row">
   <button disabled={busy||g.offline} onClick={()=>run(rpc<any[]>('groups.discover').then(rows=>{const added=rows.reduce((n,x)=>n+x.added.length,0),failed=rows.filter(x=>x.errors?.length||x.skipped).length;notice(uiText("Đã tìm {0} văn bản chưa có trong kho.{1}",[added,failed?' Có nhóm chưa kiểm tra đầy đủ; xem báo cáo bên dưới.':'']));}))}>{busy?uiText("Đang kiểm tra nguồn…"):uiText("Tìm văn bản mới")}</button>
   <button disabled={busy} onClick={()=>run(rpc<any>('groups.probe').then(r=>setNet(r.text)))}>{uiText("Kiểm tra mạng trường")}</button>
   <button disabled={busy} onClick={()=>void pickFiles().then(async f=>{if(!f[0])return;const p=await rpc<any>('groups.previewPack',{path:f[0]});if(!p.ok){report(new Error(p.problems.join(' ')));return;}if(window.confirm(uiText("Nhập nhóm «{0}» (tác giả {1}, v{2}), {3} skill, {4} nguồn? Nhóm nhập sẽ ở mức Đồng nghiệp và chưa được bật.{5}",[p.manifest?.name,p.manifest?.author,p.manifest?.version,p.skills.length,p.sourceCount,p.warnings.length?'\n\n'+p.warnings.join('\n'):'']))){await rpc('groups.installPack',{path:f[0]});notice(uiText("Đã nhập gói nhóm. Thầy cô tick bật khi muốn dùng."));}}).catch(report)}>{uiText("Nhập gói nhóm…")}</button>
  </div>
  {net&&<p className="groups-note">{net}</p>}
  {!!g.discoveryReports?.length&&<details className="discovery-report" open><summary>{uiText("Kết quả tìm văn bản gần nhất")}</summary>{g.discoveryReports.map(r=><p key={r.group}><strong>{g.kinds.flatMap(k=>k.groups).find(x=>x.id===r.group)?.name??r.group}</strong> · {new Date(r.at).toLocaleString('vi-VN')} · {r.added} {uiText("mới phát hiện ·")} {r.checked} {uiText("nguồn/lượt tìm thành công")} {r.skipped&&<span> · {r.skipped==='budget'?uiText("Chờ lượt tìm tiếp theo"):r.skipped}</span>}{r.errors.map((e,i)=><small className="groups-warn" key={i}>{e}</small>)}</p>)}</details>}
  <p className="groups-note">{uiText("Đã bật")} {g.kinds.filter(k=>k.kind===TOOL_KIND).flatMap(k=>k.groups).filter(x=>x.enabled).length} {uiText("công cụ ·")} {g.kinds.filter(k=>k.kind!==TOOL_KIND).flatMap(k=>k.groups).filter(x=>x.enabled).length} {uiText("nhóm văn bản ·")} {g.totals.docs} {uiText("văn bản ·")} {g.totals.sources} {uiText("có link nguồn.")}</p>
 </div>;
}

type ToolAct=Record<string,{working:number;unseen:number}>;
/** Nhóm «Công cụ»: chỉ là công tắc bật/tắt kỹ năng. Không đếm văn bản tìm được; chấm tròn chỉ số tệp đang xử lí hoặc chưa xem. */
function ToolChips({group,busy,activity,setPeek,run,notice}:{group:{kind:string;label:string;groups:{id:string;name:string;enabled:boolean}[]};busy:boolean;activity:ToolAct;setPeek:(s:string)=>void;run:(p:Promise<unknown>,ok?:string)=>void;notice:(s:string)=>void}){
 return <section className="gchip-section kind-cong-cu"><h3>{uiText("Công cụ làm việc")}<small>{group.groups.filter(x=>x.enabled).length}/{group.groups.length} {uiText("đang bật · chỉ bật/tắt kỹ năng, không có kho văn bản")}</small></h3>
  <div className="gchip-grid">{group.groups.map(x=>{const a=activity[x.id]??{working:0,unseen:0};const total=a.working+a.unseen;
   const detail=[a.working?uiText("{0} tệp đang xử lí",[a.working]):'',a.unseen?uiText("{0} tệp chưa xem",[a.unseen]):''].filter(Boolean).join(' · ');
   const info=`${x.name} · ${x.enabled?uiText("đang bật"):uiText("đang tắt")}${TOOL_ABOUT[x.id]?` · ${TOOL_ABOUT[x.id]}`:''}${detail?` · ${detail}`:''}`;
   return <div key={x.id} className={`gchip-wrap ${x.enabled?'on':''}`}>
    <button type="button" className="gchip" aria-pressed={x.enabled} title={info} disabled={busy} onMouseEnter={()=>setPeek(info)} onFocus={()=>setPeek(info)} onClick={()=>run(rpc('groups.toggle',{id:x.id,on:!x.enabled}))}><span className="gchip-icon" aria-hidden="true">{GROUP_ICON[x.id]??KIND_ICON[TOOL_KIND]}</span><span className="gchip-name">{x.name}</span></button>
    {total>0&&<button type="button" className={`gchip-badge ${a.unseen?'':'working'}`} title={`${detail}${a.unseen?' · bấm để đánh dấu đã xem':''}`} aria-label={`${x.name}: ${detail}`} onClick={()=>{if(a.unseen)void rpc('toolsMarkSeen',{tool:x.id}).then(()=>notice(uiText("Đã đánh dấu đã xem các tệp {0}.",[x.name]))).catch(()=>{});}}>{total>99?'99+':total}</button>}
   </div>;})}</div></section>;
}

function DocTable({enabled,initialGroup,report,notice}:{enabled:{id:string;name:string}[];initialGroup?:string;report:Props['report'];notice:Props['notice']}){
 const [gid,setGid]=useState(initialGroup||enabled[0]?.id||'');const [docs,setDocs]=useState<Doc[]>([]);const [url,setUrl]=useState('');const [sum,setSum]=useState<{id:string;text:string}>();
 useEffect(()=>{if(initialGroup&&enabled.some(g=>g.id===initialGroup))setGid(initialGroup);},[initialGroup]);
 useEffect(()=>{if(!enabled.some(g=>g.id===gid))setGid(enabled[0]?.id??'');},[enabled,gid]);
 const currentGroup=useRef(gid);currentGroup.current=gid;
 const [reload,setReload]=useState(0);const load=useCallback(()=>setReload(n=>n+1),[]);
 useEffect(()=>{let live=true;setDocs([]);setSum(undefined);if(gid)void rpc<Doc[]>('groups.docs',{group:gid}).then(v=>{if(live)setDocs(v);}).catch(report);return()=>{live=false;};},[gid,reload,report]);
 const act=(p:Promise<unknown>,ok?:string)=>p.then(()=>{if(ok)notice(ok);load();}).catch(report);
 const download=async(d:Doc)=>{try{await rpc('groups.download',{group:gid,id:d.id});}catch(e:any){if(e?.needConfirm||/xác nhận/i.test(String(e?.message))){if(window.confirm(uiText("Tải «{0}» về máy từ {1}?",[d.title,d.url])))await rpc('groups.download',{group:gid,id:d.id,confirmed:true});}else throw e;}};
 const menu=useObjectMenu<string>({contextKey:gid,onError:report,commands:id=>{
  const d=docs.find(d=>d.id===id);if(!d)return [];
  return [...(d.file?[{id:'open',label:uiText("Mở tệp"),run:()=>rpc('groups.openFile',{group:gid,id})}]:[]),
   ...(d.url?[{id:'source',label:uiText("Mở nguồn"),run:()=>{window.open(d.url,'_blank','noopener,noreferrer');}}]:[]),
   ...(d.url&&d.state==='chua-tai'?[{id:'download',label:uiText("Tải về"),run:()=>act(download(d))}]:[]),
   ...(d.state==='da-lap-chi-muc'?[{id:'summary',label:uiText("Tóm tắt"),run:async()=>{const r=await rpc<any>('groups.summary',{group:gid,id,run:true,confirmLong:true,confirmedSource:true});if(currentGroup.current===gid)setSum({id,text:r.text});}}]:[]),
   {id:'delete',label:uiText("Xóa"),danger:true,run:()=>{if(window.confirm(uiText("Xóa khỏi bảng (và kho)?")))return act(rpc('groups.remove',{group:gid,id}));}}];
 }});
 if(!enabled.length)return <p className="groups-note">{uiText("Hãy bật ít nhất một nhóm chuyên môn hoặc vai trò ở tab «Nhóm». Word, Excel, PowerPoint, PDF là công cụ nên không có kho văn bản.")}</p>;
 return <div className="groups-body">
  <div className="groups-row"><label>{uiText("Nhóm")}<select value={gid} onChange={e=>setGid(e.target.value)}>{enabled.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <input className="groups-url" placeholder={uiText("Dán link văn bản (vbpl.vn, chinhphu.vn, moet.gov.vn…)")} value={url} onChange={e=>setUrl(e.target.value)}/>
   <button disabled={!url.trim()} onClick={()=>void act(rpc('groups.addLink',{group:gid,url:url.trim()}).then(()=>setUrl('')),uiText("Đã thêm vào bảng."))}>{uiText("Thêm link")}</button>
   <button onClick={()=>void pickFiles().then(async f=>{for(const p of f)await rpc('groups.addFile',{group:gid,path:p});load();notice(uiText("Đã đưa vào kho và lập chỉ mục."));}).catch(report)}>{uiText("Thêm tệp…")}</button>
   <button onClick={()=>void act(rpc('groups.markSeen',{group:gid}))}>{uiText("Đã xem hết «Mới»")}</button>
   <button onClick={()=>void savePath(`${gid}.pvtagroup`).then(async p=>{if(p){await rpc('groups.exportPack',{group:gid,path:p});notice(uiText("Đã xuất gói nhóm (không kèm tệp văn bản)."));}}).catch(report)}>{uiText("Xuất gói nhóm…")}</button>
  </div>
  <table className="groups-table"><thead><tr><th>{uiText("Số hiệu")}</th><th>{uiText("Tên văn bản")}</th><th>{uiText("Cơ quan")}</th><th>{uiText("Tình trạng")}</th><th>Kho</th><th/></tr></thead><tbody>{docs.map(d=><tr key={d.id} {...menu.handlers(d.id)}>
   <td>{d.no??'—'}</td><td>{d.isNew&&<b className="groups-new">{uiText("Mới")}</b>}{d.url?<a href={d.url} target="_blank" rel="noreferrer">{d.title}</a>:d.title}{d.note&&<small className="groups-note"> · {d.note}</small>}</td><td>{d.agency||'—'}</td>
   <td><select value={d.status} onChange={e=>void act(rpc('groups.setStatus',{group:gid,id:d.id,status:e.target.value}))}>{DOC_STATUS.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></td>
   <td>{STATE_LABEL[d.state]??d.state}</td>
   <td className="groups-actions">{!d.file&&!d.url&&<small>{uiText("Chưa có tệp hoặc liên kết nguồn")}</small>}{menu.trigger(d.id,uiText("Thao tác văn bản {0}",[d.title]))}</td></tr>)}</tbody></table>
  {menu.menu}{docs.length===0&&<p className="groups-note">{uiText("Chưa có văn bản nào. Dán link hoặc thêm tệp.")}</p>}
  {sum&&<aside className="groups-summary"><button onClick={()=>setSum(undefined)}>{uiText("Đóng")}</button><pre>{sum.text}</pre></aside>}
 </div>;
}

function BasisCheck({report,notice}:{report:Props['report'];notice:Props['notice']}){
 const [text,setText]=useState('');const [res,setRes]=useState<any>();
 return <div className="groups-body"><p className="groups-note">{uiText("Dán nội dung văn bản đang soạn. PVTA tìm các số hiệu trong phần căn cứ rồi đối chiếu kho; không dùng AI, không gửi đi đâu.")}</p>
  <textarea className="groups-text" value={text} onChange={e=>setText(e.target.value)} placeholder={uiText("Dán nội dung văn bản…")}/>
  <div className="groups-row"><button disabled={!text.trim()} onClick={()=>void rpc('groups.checkBasis',{text}).then(setRes).catch(report)}>{uiText("Kiểm tra căn cứ")}</button></div>
  {res&&<div className="groups-result"><p><strong>{res.report.message}</strong></p>
   {res.report.changed.map((f:any)=><p key={f.no} className="groups-warn">⚠ {f.no}{f.replacedBy?uiText(" đã được thay bằng {0}",[f.replacedBy.no??f.replacedBy.title]):' có thay đổi'} <button onClick={()=>void rpc('groups.muteFinding',{finding:f}).then(()=>notice(uiText("Đã tắt nhắc căn cứ này.")))}>{uiText("Không nhắc nữa")}</button></p>)}
   {res.report.unknown.length>0&&<p className="groups-note">{uiText("Chưa xác định (chưa có trong kho):")} {res.report.unknown.map((f:any)=>f.no).join(', ')}</p>}
   {res.related.length>0&&<><h4>{uiText("Có thể tham khảo")}</h4><ul>{res.related.map((r:any)=><li key={r.id}>{r.no?`${r.no} · `:''}{r.url?<a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>:r.title} <small>({r.statusLabel}; {r.why})</small></li>)}</ul></>}
   <p className="groups-note">{res.report.disclaimer}</p>
   {res.fixPrompt&&<button onClick={()=>{void navigator.clipboard?.writeText(res.fixPrompt);notice(uiText("Đã chép lời nhắc sửa căn cứ; dán vào ô trò chuyện để PVTA đề xuất, thầy cô duyệt rồi mới sửa."));}}>{uiText("Chép lời nhắc sửa căn cứ")}</button>}
  </div>}</div>;
}

function Learn({report,notice}:{report:Props['report'];notice:Props['notice']}){
 const [items,setItems]=useState<any[]>([]);const [goal,setGoal]=useState('');const [name,setName]=useState('');const [busy,setBusy]=useState('');
 const load=useCallback(()=>void rpc<any[]>('groups.learnList').then(setItems).catch(report),[report]);useEffect(load,[load]);
 const act=(label:string,p:Promise<unknown>,ok?:string)=>{setBusy(label);p.then(()=>{if(ok)notice(ok);load();}).catch(report).finally(()=>setBusy(''));};
 return <div className="groups-body"><p className="groups-note">{uiText("PVTA học quy trình từ văn bản trong kho và mẫu của thầy cô: dự thảo → thử có/không có skill → thầy cô duyệt. Chưa duyệt thì chưa được dùng.")}</p>
  <div className="groups-row"><input placeholder={uiText("tên-skill (không dấu, gạch ngang)")} value={name} onChange={e=>setName(e.target.value)}/><input className="groups-url" placeholder={uiText("Mục tiêu: ví dụ soạn quyết định thành lập hội đồng")} value={goal} onChange={e=>setGoal(e.target.value)}/>
   <button disabled={!goal.trim()||!/^[a-z0-9][a-z0-9-]{1,40}$/.test(name)||!!busy} onClick={()=>act('draft',rpc('groups.learnDraft',{goal,name}).then(()=>{setGoal('');setName('');}),uiText("Đã tạo bản nháp."))}>{uiText("Tạo bản nháp")}</button></div>
  <table className="groups-table"><thead><tr><th>{uiText("Tên")}</th><th>{uiText("Loại")}</th><th>{uiText("Trạng thái")}</th><th/></tr></thead><tbody>{items.map(p=><tr key={p.id}><td>{p.name}<small className="groups-note"> v{p.current}</small>{p.problems?.length>0&&<small className="groups-warn"> · {p.problems[0]}</small>}</td><td>{p.kind==='rule'?uiText("Quy tắc"):'Skill'}</td><td>{({nhap:uiText("Nháp"),'dang-thu':uiText("Đang thử"),'cho-duyet':uiText("Chờ duyệt"),'chinh-thuc':uiText("Đang dùng"),'bi-loai':uiText("Bị loại")} as any)[p.status]??p.status}</td>
   <td className="groups-actions">{p.status==='nhap'&&p.kind==='skill'&&<button disabled={!!busy} onClick={()=>act(p.id,rpc('groups.learnTrial',{id:p.id}),uiText("Đã thử xong."))}>{uiText("Thử")}</button>}
    {p.status==='cho-duyet'&&<button onClick={()=>{if(window.confirm(uiText("Duyệt «{0}»? Từ nay PVTA sẽ dùng khi cần.",[p.name])))act(p.id,rpc('groups.learnApprove',{id:p.id,confirmed:true}),uiText("Đã duyệt."));}}>{uiText("Duyệt")}</button>}
    {p.status==='chinh-thuc'&&p.versions.length>1&&<button onClick={()=>act(p.id,rpc('groups.learnRollback',{id:p.id,version:p.versions[p.versions.length-2].v}),uiText("Đã quay lại phiên bản trước."))}>{uiText("Quay lại bản trước")}</button>}
    {p.status!=='bi-loai'&&<button onClick={()=>act(p.id,rpc('groups.learnReject',{id:p.id}))}>{uiText("Loại")}</button>}</td></tr>)}</tbody></table>
  {items.length===0&&<p className="groups-note">{uiText("Chưa có đề xuất nào.")}</p>}
 </div>;
}

/** Bản tin khởi động: chỉ dữ liệu trên máy, hiện một lần mỗi ngày. */
export function BriefingStrip({state,go}:{state:ViewState;go:(target:string,group?:string)=>void}){
 const [b,setB]=useState<{show:boolean;greeting:string;items:{id:string;text:string;action:string;target:string;group?:string}[]}>();
 const [hidden,setHidden]=useState(false);
 useEffect(()=>{if(state.groups?.configured)void rpc<any>('groups.briefing').then(setB).catch(()=>{});},[]);
 if(!state.groups?.configured)return hidden?null:<div className="briefing-strip"><span>{uiText("Thầy cô chưa chọn nhóm công việc.")}</span><button onClick={()=>go('groups')}>{uiText("Chọn nhóm")}</button><button className="briefing-close" aria-label={uiText("Ẩn thông báo")} title={uiText("Ẩn thông báo")} onClick={()=>setHidden(true)}>{uiText("×")}</button></div>;
 if(!b?.show||hidden)return null;
 return <div className="briefing-strip" role="status"><strong>{b.greeting}</strong>{b.items.map(i=><span key={i.id}>{i.text} <button onClick={()=>go(i.target,i.group)}>{i.action}</button></span>)}<button className="briefing-close" onClick={()=>{setHidden(true);void rpc('groups.briefingDismiss').catch(()=>{});}}>{uiText("Không hiện lại hôm nay")}</button></div>;
}
