import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './Icon';
import {Tip} from './Composer';
import type {ViewState} from './ipc';
import type {WorkflowTemplate} from '../../core/src/desktop/types';
import './chat-workflow.css';

/** Lời gọi quy trình đang chờ trong khung chat (chưa chạy). Không mở bảng quản lý. */
export type WorkflowCall={chatId:string;templateId:string;text:string};

/** Giá trị lần gọi gần nhất của một mẫu, để lần sau điền sẵn. */
type LastValues={params:Record<string,string>;output:string};
const lastKey=(templateId:string)=>`pvta.wfLast.${templateId}`;
export function readLastValues(templateId:string):LastValues{
 try{
  const v=JSON.parse(localStorage.getItem(lastKey(templateId))??'null');
  if(v&&typeof v==='object')return {params:v.params&&typeof v.params==='object'?v.params:{},output:typeof v.output==='string'?v.output:''};
 }catch{/* bỏ qua dữ liệu hỏng */}
 return {params:{},output:''};
}
function writeLastValues(templateId:string,v:LastValues){try{localStorage.setItem(lastKey(templateId),JSON.stringify(v));}catch{/* hết bộ nhớ hoặc bị chặn: không ảnh hưởng chạy */}}

/** Nút gọi quy trình trong thanh công cụ: chỉ chèn tên mẫu vào ô chat. Mở bảng quản lý chỉ khi thầy cô bấm mục riêng. */
export function ChatWorkflowButton({state,onInsert,onManage}:{state?:ViewState;onInsert:(name:string)=>void;onManage:()=>void}){
 const [open,setOpen]=useState(false);
 const [pos,setPos]=useState<{left:number;bottom:number}>({left:8,bottom:8});
 const box=useRef<HTMLSpanElement>(null);
 const templates=state?.data.workflowTemplates??[];
 useEffect(()=>{if(!open)return;const off=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('mousedown',off);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',off);document.removeEventListener('keydown',key);};},[open]);
 const name=uiText("Gọi quy trình");
 return <span className="chat-wf" ref={box}>
  <Tip name={name} guide={uiText("Chèn tên quy trình mẫu vào khung chat. Gõ nội dung làm thông số rồi gửi để gọi quy trình ngay trong hội thoại.")}><button type="button" className={`trigger-button ${open?'on':''}`} aria-label={name} aria-haspopup="menu" aria-expanded={open} onClick={e=>{const r=(e.currentTarget as HTMLElement).getBoundingClientRect();setPos({left:Math.max(8,Math.min(r.left,window.innerWidth-316)),bottom:Math.max(8,window.innerHeight-r.top+8)});setOpen(v=>!v);}}><Icon name="workflow"/></button></Tip>
  {open&&<div className="chat-wf-menu" role="menu" style={{left:pos.left,bottom:pos.bottom}}>
   {templates.length?templates.map(t=><button key={t.id} role="menuitem" onClick={()=>{onInsert(t.name);setOpen(false);}}><strong>{t.name}</strong><small>{t.params.length?uiText("{0} thông số đầu vào · {1} khâu",[t.params.length,t.steps.length]):uiText("Không cần thông số · {0} khâu",[t.steps.length])}</small></button>)
    :<p>{uiText("Chưa có quy trình mẫu. Tạo mẫu trong mục Quy trình → Quy trình mẫu.")}</p>}
   <button role="menuitem" onClick={()=>{setOpen(false);onManage();}}><small>{uiText("Quản lí tất cả quy trình →")}</small></button>
  </div>}
 </span>;
}

/** Thẻ gọi quy trình hiện ngay trong hội thoại: điền thông số, xác nhận nếu có khâu chỉnh sửa, rồi Chạy hoặc Hủy. */
export function ChatWorkflowCard({state,call,onRun,onCancel}:{state:ViewState;call:WorkflowCall;onRun:ChatWorkflowCardProps['onRun'];onCancel:()=>void}){
 const tpl=state.data.workflowTemplates?.find(t=>t.id===call.templateId);
 if(!tpl)return <section className="wf-card" aria-label={uiText("Gọi quy trình")}><header><strong>{uiText("Không tìm thấy quy trình mẫu")}</strong><button type="button" aria-label={uiText("Đóng")} onClick={onCancel}>✕</button></header><p className="muted small">{uiText("Quy trình mẫu này đã bị xóa hoặc đổi tên. Chọn lại từ nút Gọi quy trình.")}</p></section>;
 return <WorkflowCardBody key={`${tpl.id}:${call.text}`} tpl={tpl} call={call} onRun={onRun} onCancel={onCancel}/>;
}

function WorkflowCardBody({tpl,call,onRun,onCancel}:{tpl:WorkflowTemplate;call:WorkflowCall;onRun:ChatWorkflowCardProps['onRun'];onCancel:()=>void}){
 const typed=call.text.trim();
 const [values,setValues]=useState<Record<string,string>>(()=>{
  const last=readLastValues(tpl.id).params;const init:Record<string,string>={};
  for(const p of tpl.params)if(last[p.key]!==undefined)init[p.key]=String(last[p.key]);
  const first=tpl.params[0];
  if(typed&&first)init[first.key]=typed;
  return init;
 });
 const [output,setOutput]=useState(()=>{const last=readLastValues(tpl.id).output;return last||(!tpl.params.length&&typed?typed:'');});
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 /** Chỉnh cho LẦN CHẠY NÀY: chỉ áp lên bản sao, mẫu không đổi. */
 const [access,setAccess]=useState<Record<string,'read'|'full'>>(()=>Object.fromEntries(tpl.steps.map(s=>[s.id,s.access])));
 const [note,setNote]=useState('');
 const [editsOpen,setEditsOpen]=useState(false);
 const changedAccess=tpl.steps.filter(s=>access[s.id]!==undefined&&access[s.id]!==s.access);
 const edits=changedAccess.length||note.trim()?{access:Object.fromEntries(tpl.steps.map(s=>[s.id,access[s.id]??s.access])),note:note.trim()||undefined}:undefined;
 const hasEdit=tpl.steps.some(s=>(access[s.id]??s.access)==='full');
 /** Đầu ra do thầy cô quy định lần này là bắt buộc khi mẫu để mở (lõi từ chối nếu thiếu). */
 const outputNeeded=tpl.output.mode==='ask'&&!output.trim();
 const missing=[...tpl.params.filter(p=>p.required&&!(values[p.key]??'').trim()).map(p=>p.label),...(outputNeeded?[uiText("Đầu ra lần này")]:[])];
 const ready=!missing.length&&(!hasEdit||confirmed);
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onCancel();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[busy,onCancel]);
 useEffect(()=>{ref.current?.scrollIntoView?.({block:'nearest'});},[]);
 async function submit(){
  if(!ready||busy)return;
  setBusy(true);
  const params=Object.fromEntries(tpl.params.map(p=>[p.key,(values[p.key]??'').trim()]).filter(([,v])=>v!==''));
  writeLastValues(tpl.id,{params,output:tpl.output.mode==='fixed'?'':output.trim()});
  const ok=await onRun({templateId:tpl.id,params,output:tpl.output.mode==='fixed'?'':output.trim(),...(edits?{edits}:{})});
  if(!ok)setBusy(false);
 }
 return <section className="wf-card" ref={ref} aria-label={uiText("Gọi quy trình")}>
  <header><Icon name="workflow"/><strong>{tpl.name}</strong><span className="wf-card-count">{uiText("{0} khâu",[tpl.steps.length])}</span><button type="button" aria-label={uiText("Hủy")} disabled={busy} onClick={onCancel}>✕</button></header>
  {tpl.description&&<p className="muted small">{tpl.description}</p>}
  {tpl.params.map(p=><label key={p.key} className="wf-card-field">
   <span>{p.label}{p.required&&<b aria-label={uiText("bắt buộc")}> *</b>}</span>
   {p.long?<textarea rows={3} disabled={busy} placeholder={p.default??p.hint} value={values[p.key]??''} onChange={e=>setValues(v=>({...v,[p.key]:e.target.value}))}/>:<input disabled={busy} placeholder={p.default??p.hint} value={values[p.key]??''} onChange={e=>setValues(v=>({...v,[p.key]:e.target.value}))}/>}
   {p.hint&&<small className="muted">{p.hint}</small>}
  </label>)}
  {tpl.output.mode==='fixed'?<p className="wf-card-fixed"><strong>{uiText("Đầu ra")}:</strong> {tpl.output.text}</p>
   :<label className="wf-card-field"><span>{uiText("Đầu ra lần này")}<b aria-label={uiText("bắt buộc")}> *</b></span><textarea rows={2} disabled={busy} placeholder={tpl.output.text||uiText("Ví dụ: 1 tệp Word, 20 câu, kèm đáp án")} value={output} onChange={e=>setOutput(e.target.value)}/></label>}
  <details className="wf-card-edits" open={editsOpen} onToggle={e=>setEditsOpen((e.currentTarget as HTMLDetailsElement).open)}>
   <summary>{uiText("Chỉnh cho lần này")}{edits&&<b className="wf-card-edited"> · {uiText("đã chỉnh")}</b>}</summary>
   <p className="muted small">{uiText("Chỉ áp cho lần chạy này. Mẫu giữ nguyên; bản chạy được tạo thành quy trình riêng trong Quy trình.")}</p>
   {tpl.steps.map(s=><label key={s.id} className="wf-card-field wf-card-step">
    <span>{s.name}</span>
    <select disabled={busy} value={access[s.id]??s.access} onChange={e=>setAccess(a=>({...a,[s.id]:e.target.value as 'read'|'full'}))}>
     <option value="read">{uiText("Chỉ đọc")}</option>
     <option value="full">{uiText("Chỉnh sửa")}</option>
    </select>
   </label>)}
   <label className="wf-card-field"><span>{uiText("Ghi chú thêm cho mọi khâu")}</span><textarea rows={2} disabled={busy} placeholder={uiText("Ví dụ: chỉ dùng ví dụ về phân số")} value={note} onChange={e=>setNote(e.target.value)}/></label>
  </details>
  {hasEdit&&<label className="wf-card-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> <span>{uiText("Đồng ý: có khâu ở chế độ Chỉnh sửa, PVTA có thể ghi tệp trong thư mục làm việc của quy trình.")}</span></label>}
  {hasEdit&&<p className="muted small">{uiText("Không cần chọn thư mục: PVTA tự dùng nơi lưu của hội thoại/dự án (mặc định thư mục tạm dùng chung /tmp/PVTA-Ket-qua) và báo đường dẫn trong kết quả.")}</p>}
  <div className="wf-card-actions">
   <small className="muted">{busy?uiText("Đang chạy… kết quả sẽ hiện trong hội thoại."):missing.length?uiText("Còn thiếu: {0}",[missing.join(', ')]):uiText("Kết quả sẽ hiện ngay trong hội thoại.")}</small>
   <button type="button" disabled={busy} onClick={onCancel}>{uiText("Hủy")}</button>
   <button type="button" className="primary" disabled={!ready||busy} onClick={()=>void submit()}>{busy?uiText("Đang chạy…"):uiText("Chạy")}</button>
  </div>
 </section>;
}
type ChatWorkflowCardProps={onRun:(args:{templateId:string;params:Record<string,string>;output:string;edits?:{access?:Record<string,string>;note?:string}})=>Promise<boolean>};

/** Hai nút dưới tin nhắn kết quả: mở quy trình để xem, hoặc chạy tiếp từ khâu lỗi (không làm lại khâu đã xong). */
export function ChatWorkflowActions({status,onOpen,onRetry}:{status:string;onOpen:()=>void;onRetry:()=>void}){
 const failed=status==='error'||status==='cancelled';
 return <div className="wf-result-actions">
  <button type="button" onClick={onOpen}>{uiText("Mở trong Quy trình")}</button>
  {failed&&<button type="button" className="primary" onClick={onRetry}>{uiText("Chạy tiếp từ khâu lỗi")}</button>}
 </div>;
}
