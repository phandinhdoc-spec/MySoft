import {t as uiText} from './i18n';
import React from 'react';
/** Hai nút dưới đề nghị của PVTA: đồng ý để làm ngay, hoặc nói chuyện tiếp. */
export function ProposalBar({summary,disabled,onAgree,onTalk}:{summary:string;disabled?:boolean;onAgree:()=>void;onTalk:()=>void}){
 return <div className="proposal-bar" role="group" aria-label={uiText("Đề nghị của PVTA")}>
  <p>{summary}</p>
  <div className="proposal-actions">
   <button type="button" className="proposal-agree" disabled={disabled} onClick={onAgree}>{uiText("Đồng ý")}</button>
   <button type="button" className="proposal-talk" disabled={disabled} onClick={onTalk}>{uiText("Nói chuyện tiếp")}</button>
  </div>
 </div>;
}
