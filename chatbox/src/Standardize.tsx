import {t as uiText} from './i18n';
import React,{useEffect,useState} from 'react';
import {rpc} from './ipc';

export type StandardizeKind='skill'|'rule'|'prompt';
export interface StandardizeOutput{kind:StandardizeKind;text:string;title?:string;changed:boolean;fixes:string[];issues:{level:'error'|'warn'|'info';code:string;message:string}[];ok:boolean;slots?:string[];ai:{requested:boolean;used:boolean;note?:string}}
const MARK={error:'✕',warn:'⚠',info:'ℹ'} as const;
const LABEL:Record<StandardizeKind,string>={skill:'skill',rule:uiText("quy tắc"),prompt:uiText("lời nhắc mẫu")};

/**
 * Công cụ chuẩn hóa dùng chung cho skill, quy tắc và lời nhắc mẫu.
 * Bước máy chạy tức thì và không gửi gì ra ngoài; bước AI là tùy chọn và kết quả vẫn được máy kiểm lại.
 * Không tự ghi đè: chỉ thay vào ô nhập khi thầy cô bấm «Dùng bản này».
 */
export function StandardizeBox({kind,text,title,defaultSource,compact,onApply,report}:{kind:StandardizeKind;text:string;title?:string;defaultSource?:string;compact?:boolean;onApply:(r:StandardizeOutput)=>void;report:(e:unknown)=>void}){
 const [busy,setBusy]=useState<''|'machine'|'ai'>('');const [res,setRes]=useState<{input:string;out:StandardizeOutput}>();const [source,setSource]=useState(true);const [applied,setApplied]=useState(false);
 useEffect(()=>{if(res&&res.input!==text){setRes(undefined);}},[text]);
 async function run(ai:boolean){
  setBusy(ai?'ai':'machine');setApplied(false);
  try{const out=await rpc<StandardizeOutput>('standardize',{kind,text,title,ai,...(kind==='skill'&&defaultSource&&source?{defaultSource}:{})});setRes({input:text,out});}
  catch(e){report(e);}finally{setBusy('');}
 }
 const out=res?.input===text?res.out:undefined;
 return <div className={`std-box ${compact?'compact':''}`}>
  <div className="std-actions">
   <button type="button" disabled={!text.trim()||!!busy} onClick={()=>void run(false)} title={uiText("Sửa hình thức {0} theo quy định của PVTA. Chạy ngay trên máy, không dùng AI.",[LABEL[kind]])}>{busy==='machine'?uiText("Đang chuẩn hóa…"):uiText("✓ Chuẩn hóa")}</button>
   <button type="button" disabled={!text.trim()||!!busy} onClick={()=>void run(true)} title={uiText("Máy chuẩn hóa trước, rồi nhờ AI viết lại cho rõ; bản AI được máy kiểm tra lại và chỉ dùng khi thầy cô bấm chọn.")}>{busy==='ai'?uiText("Đang nhờ AI…"):uiText("✦ Chuẩn hóa bằng AI")}</button>
   {kind==='skill'&&defaultSource&&<label className="std-check"><input type="checkbox" checked={source} onChange={e=>setSource(e.target.checked)}/> {uiText("Gắn nguồn «")} {defaultSource}{uiText("» cho dòng Quy định chưa có nguồn")}</label>}
   {applied&&<span className="std-applied" role="status">{uiText("✓ Đã thay bằng bản chuẩn hóa. Kiểm tra lại rồi lưu.")}</span>}
  </div>
  {out&&<div className="std-result" role="region" aria-label={uiText("Kết quả chuẩn hóa")} aria-live="polite">
   {out.fixes.length>0&&<><h4>{uiText("Đã sửa (")}{out.fixes.length})</h4><ul className="std-fixes">{out.fixes.map((f,i)=><li key={i}>{f}</li>)}</ul></>}
   {out.issues.length>0&&<><h4>{uiText("Cần xem lại (")}{out.issues.length})</h4><ul className="std-issues">{out.issues.map((i,n)=><li key={n} className={i.level}><span aria-label={i.level==='error'?uiText("Lỗi"):i.level==='warn'?uiText("Cảnh báo"):uiText("Ghi chú")}>{MARK[i.level]}</span> {i.message}</li>)}</ul></>}
   {!out.fixes.length&&!out.issues.length&&<p className="std-ok">✓ {LABEL[kind][0]!.toUpperCase()+LABEL[kind].slice(1)} {uiText("đã đạt chuẩn, không cần sửa.")}</p>}
   {out.ai.requested&&<p className={`std-ai ${out.ai.used?'used':''}`}>{out.ai.used?uiText("✦ Đã dùng bản AI viết lại (máy đã kiểm tra lại). Đọc kỹ trước khi dùng."):`AI: ${out.ai.note??uiText("không có thay đổi.")}`}</p>}
   {!out.ok&&<p className="std-block">{uiText("Còn lỗi chặn (✕). Có thể dùng bản này rồi sửa tay phần báo lỗi trước khi lưu.")}</p>}
   {out.changed&&<label className="std-preview">{uiText("Bản đã chuẩn hóa")}<textarea readOnly className="editor compact" value={out.text} rows={compact?4:8}/></label>}
   <div className="std-buttons"><button type="button" onClick={()=>setRes(undefined)}>{uiText("Bỏ qua")}</button>{out.changed&&<button type="button" className="primary" onClick={()=>{onApply(out);setRes(undefined);setApplied(true);}}>{uiText("Dùng bản này")}</button>}</div>
  </div>}
 </div>;
}
