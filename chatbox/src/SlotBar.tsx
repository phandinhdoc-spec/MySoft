import {t as uiText} from './i18n';
import React,{useMemo} from 'react';
import {trackTemplate,shortValue,type SlotState} from '@pvta/shared';

const STATUS_TEXT={pending:uiText("chưa điền"),filled:uiText("đã điền"),empty:uiText("đang để trống"),unknown:uiText("cần kiểm tra lại")} as const;

/**
 * Danh sách chỗ trống [ ] của lời nhắc mẫu, đặt phía trên khung chat để không bị che khi lời nhắc dài mà khung soạn thấp.
 * Chỗ chưa điền màu vàng; điền rồi đổi sang xanh và hiện nội dung mới; bấm vào chip để nhảy tới đúng chỗ trong khung soạn.
 */
export function SlotBar({template,text,onPick,onClose}:{template:string;text:string;onPick:(slot:SlotState)=>void;onClose:()=>void}){
 const slots=useMemo(()=>trackTemplate(template,text),[template,text]);
 if(!slots.length)return null;
 const done=slots.filter(s=>s.status==='filled').length;
 const next=slots.find(s=>s.status!=='filled');const nextPick=slots.find(s=>s.status!=='filled'&&s.start>=0);
 return <section className={`slot-bar ${next?'':'complete'}`} aria-label={uiText("Chỗ cần điền trong lời nhắc mẫu")}>
  <header>
   <strong>{uiText("Chỗ cần điền")}</strong>
   <span className="slot-count" role="status" aria-live="polite">{next?uiText("{0}/{1} đã điền",[done,slots.length]):uiText("Đã điền đủ {0}/{1}. Đọc lại rồi gửi.",[slots.length,slots.length])}</span>
   <span className="slot-progress" role="progressbar" aria-label={uiText("Tiến độ điền")} aria-valuemin={0} aria-valuemax={slots.length} aria-valuenow={done}><i style={{width:`${Math.round(done/slots.length*100)}%`}}/></span>
   {nextPick&&<button type="button" className="slot-next" title={uiText("Nhảy tới chỗ chưa điền kế tiếp (cũng dùng được phím Tab trong khung soạn)")} onClick={()=>onPick(nextPick)}>{uiText("Chỗ kế tiếp ›")}</button>}
   <button type="button" className="slot-close" aria-label={uiText("Ẩn danh sách chỗ trống")} title={uiText("Ẩn danh sách (lời nhắc vẫn giữ nguyên)")} onClick={onClose}>{uiText("×")}</button>
  </header>
  <ol>{slots.map(s=><li key={s.index}>
   <button type="button" className={`slot-chip ${s.status}`} disabled={s.start<0} onClick={()=>onPick(s)} title={s.status==='filled'?`${s.label}: ${s.value??''}`:`${s.label} (${STATUS_TEXT[s.status]})`} aria-label={uiText("Chỗ {0}, {1}, {2}{3}",[s.index+1,s.label,STATUS_TEXT[s.status],s.status==='filled'?`: ${s.value??''}`:''])}>
    <span className="slot-no" aria-hidden="true">{s.status==='filled'?'✓':s.index+1}</span>
    <span className="slot-label">{s.label}</span>
    {s.status==='filled'&&<span className="slot-value">{shortValue(s.value??'')}</span>}
   </button>
  </li>)}</ol>
 </section>;
}
