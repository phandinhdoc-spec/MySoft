import {t as uiText} from './i18n';
import React,{useState} from 'react';
import {rpc} from './ipc';
import type {WorkflowStepRun} from '../../core/src/desktop/types';
import {Badge,ToolButton,WfGlyph} from './WorkflowToolkit';

const LEVEL:Record<string,{tone:'err'|'warn'|'muted';label:string}>={high:{tone:'err',label:'Cao'},medium:{tone:'warn',label:'Vừa'},low:{tone:'muted',label:'Thấp'}};

/**
 * Thẻ duyệt mã: hiện mã AI sinh, cảnh báo của AI phản biện và quét tĩnh, rồi giáo viên quyết định.
 * AI phản biện chỉ cảnh báo, không tự duyệt. Cảnh báo mức Cao mặc định chặn; phải chủ động bấm “Vẫn chạy”.
 */
export function CodeApproval({workflowId,runId,step,workdir,report}:{workflowId:string;runId:string;step:WorkflowStepRun;workdir?:string;report:(e:unknown)=>void}){
 const code=step.code!;
 const [busy,setBusy]=useState(false);
 const high=code.findings.some(f=>f.level==='high');
 const waiting=code.decision==='waiting';
 async function decide(approved:boolean,force=false){
  if(busy)return;setBusy(true);
  try{await rpc('workflowCodeDecide',{workflowId,runId,stepId:step.stepId,approved,force});}catch(e){report(e);}finally{setBusy(false);}
 }
 const outcome={approved:uiText("Đã duyệt và chạy"),forced:uiText("Đã duyệt (vẫn chạy dù cảnh báo cao)"),rejected:uiText("Không được duyệt"),'not-run':uiText("Đã sinh mã, chưa chạy (nút ở chế độ Chỉ đọc)"),waiting:uiText("Đang chờ bạn duyệt")}[code.decision];
 return <section className={`wf-code wf-code-${code.decision}`} aria-label={uiText("Duyệt mã của nút: {0}",[step.name])}>
  <header><WfGlyph name={waiting?'shield':'check'} size={15}/><strong>{step.name}</strong><Badge tone="info">{code.lang}</Badge><Badge tone={waiting?'warn':code.decision==='rejected'?'err':'ok'}>{outcome}</Badge></header>
  {waiting&&<p className="muted small">{code.lang==='pvta-expression'?'Kiểm tra mô tả và biểu thức thuần. Hàm chỉ đọc tham số, không truy cập tệp, mạng hoặc biến ngoài. Triển khai đã duyệt được lưu; sửa khai báo phải duyệt lại.':uiText("Xem kỹ mã trước khi duyệt. Mã chạy với quyền của tài khoản trên máy này trong thư mục con của lượt chạy; thư mục con chỉ là nơi làm việc, không phải hộp cách ly. Mỗi lần chạy cần duyệt riêng, kể cả khi mã không đổi.")}</p>}
  {workdir&&<p className="small wf-path"><WfGlyph name="folder" size={12}/> <code>{workdir}</code></p>}
  {code.findings.length?<ul className="wf-findings">{code.findings.map((f,i)=><li key={i}><Badge tone={LEVEL[f.level]!.tone} icon={f.level==='high'?'warn':undefined}>{uiText(LEVEL[f.level]!.label)}</Badge> {f.text} <small className="muted">({f.source==='ai'?uiText("AI phản biện"):uiText("quét tự động")})</small></li>)}</ul>:<p className="small wf-ok-note"><WfGlyph name="check" size={12}/> {uiText("Không phát hiện cảnh báo. Không có cảnh báo không có nghĩa là an toàn tuyệt đối.")}</p>}
  <pre className="wf-code-pre" tabIndex={0}>{code.code}</pre>
  {waiting&&<div className="wf-actions">
   <ToolButton icon="check" tone="primary" disabled={busy||high} title={high?uiText("Mã có cảnh báo mức Cao nên bị chặn; chọn “Vẫn chạy” nếu chắc chắn."):''} onClick={()=>void decide(true)}>{code.canRun?uiText("Duyệt và chạy"):uiText("Duyệt (chỉ lưu mã)")}</ToolButton>
   {high&&<ToolButton icon="warn" tone="danger" disabled={busy} onClick={()=>{if(confirm(uiText("Mã có cảnh báo mức Cao. Vẫn chạy trên máy này?")))void decide(true,true);}}>{uiText("Vẫn chạy")}</ToolButton>}
   <ToolButton icon="x" disabled={busy} onClick={()=>void decide(false)}>{uiText("Không duyệt")}</ToolButton>
  </div>}
 </section>;
}
