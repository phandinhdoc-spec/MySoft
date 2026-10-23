import {useState} from 'react';
import {t as uiText} from './i18n';
import {rpc,type ViewState} from './ipc';
import {selfTipTarget,type SelfTipTarget} from './self-tip';
import './self-tip.css';
/** Gợi ý của AI nền, nằm ở khoảng trống giữa đường dẫn và nút thanh trên. Có đích thì bấm như liên kết; không thì mở cách dùng. */
export function SelfTip({tip,go,report}:{tip:NonNullable<ViewState['selfTip']>;go:(t:SelfTipTarget)=>void;report:(e:unknown)=>void}){
 const [more,setMore]=useState(false);const target=selfTipTarget(tip.capabilityId);
 const decide=async(decision:'open'|'later'|'never')=>{try{await rpc('selfTipDecide',{id:tip.id,decision});}catch(e){report(e);}};
 const activate=()=>{if(target){void decide('open');go(target);}else setMore(v=>!v);};
 return <div className="self-tip" role="status" aria-live="polite">
  <button className="self-tip-text" title={tip.how} onClick={activate}><span aria-hidden="true">✦</span> {tip.text}</button>
  <button className="self-tip-x" aria-label={uiText("Để sau")} title={uiText("Để sau")} onClick={()=>void decide('later')}>×</button>
  {more&&<div className="self-tip-more"><p><strong>{tip.name}:</strong> {tip.how}</p><div><button onClick={()=>void decide('open')}>{uiText("Đã hiểu")}</button><button onClick={()=>void decide('never')}>{uiText("Không hiện lại mục này")}</button></div></div>}
 </div>;
}
