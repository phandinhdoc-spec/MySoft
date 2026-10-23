import {t as uiText} from './i18n';
import type {PlanningRun} from '../../core/src/desktop/planning';
export type PlanningMode='chat'|'plan'|'pro';
export function planningMinutes(value:string):number{
 if(value.trim().toUpperCase()==='KGH'||!value.trim())return 0;
 if(!/^\d+$/.test(value.trim())||Number(value)<1||Number(value)>35791)throw Error(uiText("Nhập KGH hoặc số phút từ 1 đến 35791."));
 return Number(value)*60_000;
}
export function PlanningControls({mode,time,onMode,onTime,onWorkflow}:{mode:PlanningMode;time:string;onMode:(mode:PlanningMode)=>void;onTime:(value:string)=>void;onWorkflow?:()=>void}){
 return <div className="planning-controls">
  <select className={`plan-toggle ${mode!=='chat'?'on':''}`} aria-label={uiText("Chế độ Chat, Plan hoặc Plan Pro")} value={mode} onChange={e=>onMode(e.target.value as PlanningMode)} title="Chat · Plan · Plan Pro (Ctrl/Cmd + Shift + P)">
   <option value="chat">Chat</option><option value="plan">◇ Plan</option><option value="pro">◇ Plan Pro</option>
  </select>
  {mode!=='chat'&&onWorkflow&&<button type="button" aria-label={uiText("Mở quy trình trực quan")} onClick={onWorkflow}>{uiText("Quy trình ↗")}</button>}
  {mode!=='chat'&&<label className="planning-time" title={uiText("Thời gian cho toàn bộ lượt lập kế hoạch. KGH: không giới hạn; hoặc nhập số phút.")}>
   <input aria-label={uiText("Thời gian lập kế hoạch (phút hoặc KGH)")} value={time} placeholder="KGH" maxLength={5} onChange={e=>onTime(e.target.value.toUpperCase())} onBlur={()=>{if(!time.trim())onTime('KGH');}}/>
   <span>{!time.trim()||time==='KGH'?'':uiText("phút")}</span>
  </label>}
 </div>;
}
const phaseLabels:Record<PlanningRun['phase'],string>={survey:uiText("Đang khảo sát và lập nháp"),review:uiText("Đang phản biện và kiểm tra"),revise:uiText("Đang sửa bản nháp"),ready:uiText("Đã lập xong · Chờ duyệt"),questions:uiText("Cần làm rõ"),error:uiText("Chưa đạt kiểm tra"),interrupted:uiText("Đã dừng")};
export function PlanningProgress({run}:{run:PlanningRun}){
 return <aside className="planning-progress">
  <div role="status"><strong>{run.mode==='pro'?'Plan Pro':'Plan'}</strong> · {phaseLabels[run.phase]}{run.round>0&&uiText(" · Vòng {0}/3",[run.round])} · {run.timeoutMs?uiText("{0} phút",[run.timeoutMs/60000]):'KGH'}</div>
  {!!run.issues.length&&<ul>{run.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}
  {run.draft&&<details><summary>{uiText("Bản nháp gần nhất")}</summary><pre>{run.draft}</pre></details>}
 </aside>;
}
