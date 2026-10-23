import React from 'react';
import {t as uiText} from './i18n';
import {languageSuggestions,parsePrompt,type LanguageWorkflow} from '../../core/src/desktop/workflow-language';
import type {WorkflowStep} from '../../core/src/desktop/types';

/** Chỉ đọc: liệt kê biến/hàm nhìn thấy được ở một nút, không đổi dữ liệu quy trình. */
export interface StepVariable {label:string;detail:string}
export interface StepDirective {kind:string;line:number;value:string;target?:string}
export interface StepDiagnostic {message:string;repair:string;line?:number}

type Workflow=LanguageWorkflow&{id:string};

/** Biến ($tên) và hàm nhìn thấy được từ nút; bỏ chỉ thị (!) và mã nút. */
export function stepVariables(workflow:Workflow,stepId:string):StepVariable[]{
 return languageSuggestions(workflow,stepId).items
  .filter(x=>!x.label.startsWith('!')&&!x.label.startsWith('"'))
  .map(x=>({label:x.label,detail:x.detail}));
}

/** Chỉ thị đầu ra, lặp lại và dừng của riêng nút. Dùng parsePrompt, không chạy quy trình. */
export function stepDirectives(prompt:string,stepId:string):StepDirective[]{
 try{
  return parsePrompt(prompt,stepId).commands
   .filter(c=>c.kind==='dau-ra'||c.kind==='lap-lai'||c.kind==='dung')
   .map(c=>({kind:c.kind,line:c.line,value:c.value,target:c.target}));
 }catch{return [];}
}

/** Viết lại chỉ thị đúng cú pháp của ngôn ngữ: !dau-ra = …, !lap-lai "nút" neu …, !dung neu …. */
export function directiveText(d:StepDirective){
 if(d.kind==='dau-ra')return `!dau-ra = ${d.value}`;
 if(d.kind==='lap-lai')return `!lap-lai "${d.target??''}" neu ${d.value}`;
 return `!${d.kind} neu ${d.value}`;
}

/** Lỗi biên dịch chỉ của nút này; lỗi của nút khác không hiện ở đây. */
export function stepDiagnostic(workflow:Workflow,stepId:string):StepDiagnostic|undefined{
 const diagnostic=languageSuggestions(workflow,stepId).diagnostic;
 if(!diagnostic||diagnostic.stepId!==stepId)return undefined;
 return {message:diagnostic.message,repair:diagnostic.repair,line:diagnostic.line};
}

/** Vùng ĐẦU VÀO: các bước cần chờ (children), biến nhìn thấy được và nhắc {{input}}, {{prev}}. Mặc định thu gọn khi không có gì để xem. */
export function StepInputsZone({variables,hasDependencies,children}:{variables:StepVariable[];hasDependencies:boolean;children?:React.ReactNode}){
 const simple=!hasDependencies&&variables.length===0;
 return <section className="wf-zone wf-zone-in" aria-label={uiText("Đầu vào của nút")}>
  <details open={!simple}>
   <summary>{uiText("ĐẦU VÀO")} <small>{uiText("{0} biến · {1} bước cần chờ",[variables.length,hasDependencies?uiText("có"):uiText("không")])}</small></summary>
   <div className="wf-zone-body">
    {children}
    {variables.length>0?<div><strong className="wf-zone-title">{uiText("Biến nhìn thấy được ở nút này")}</strong><ul className="wf-zone-list">{variables.map(v=><li key={v.label}><code>{v.label}</code> <small className="muted">{v.detail}</small></li>)}</ul></div>:<p className="muted small">{uiText("Chưa có biến nhìn thấy được ở nút này.")}</p>}
    <p className="muted small">{uiText("Chèn")} <code>{'{{input}}'}</code> {uiText("cho đầu vào quy trình,")} <code>{'{{prev}}'}</code> {uiText("cho kết quả nút trước.")}</p>
   </div>
  </details>
 </section>;
}

/** Vùng ĐẦU RA: các trường đầu ra (children), lỗi biên dịch, chỉ thị chỉ để xem. Thu gọn khi nút đơn giản. */
export function StepOutputsZone({step,directives,diagnostic,children}:{step:WorkflowStep;directives:StepDirective[];diagnostic?:StepDiagnostic;children?:React.ReactNode}){
 const declared=[['outputs',step.outputs?.join(', ')],['completion',step.completion],['onError',step.onError]] as const;
 const hasDeclared=declared.some(([,v])=>!!v);
 const simple=!directives.length&&!diagnostic&&!hasDeclared&&!step.continueOnError;
 const labels:Record<string,string>={outputs:uiText("Đầu ra khai báo"),completion:uiText("Tiêu chí hoàn thành"),onError:uiText("Khi lỗi")};
 return <section className="wf-zone wf-zone-out" aria-label={uiText("Đầu ra của nút")}>
  <details open={!simple}>
   <summary>{uiText("ĐẦU RA")} <small>{uiText("{0} chỉ thị · {1}",[directives.length,diagnostic?uiText("có lỗi biên dịch"):uiText("không có lỗi biên dịch")])}</small></summary>
   <div className="wf-zone-body">
    {children}
    {hasDeclared&&<dl className="wf-zone-list">{declared.filter(([,v])=>!!v).map(([k,v])=><div key={k}><dt><strong>{labels[k]}</strong></dt><dd>{v}</dd></div>)}</dl>}
    {diagnostic?<div className="wf-zone-diag"><strong>{uiText("Lỗi biên dịch ở nút này")}{diagnostic.line?` (${uiText("dòng {0}",[diagnostic.line])})`:''}</strong><p>{diagnostic.message}</p><p><em>{diagnostic.repair}</em></p></div>:<p className="muted small">{uiText("Không có lỗi biên dịch ở nút này.")}</p>}
    <strong className="wf-zone-title">{uiText("Chỉ thị đầu ra (chỉ để xem; sửa trong ô Prompt)")}</strong>
    {directives.length?<ul className="wf-zone-list">{directives.map((d,i)=><li key={i}><code>{directiveText(d)}</code> <small className="muted">{uiText("dòng {0}",[d.line])}</small></li>)}</ul>:<p className="muted small">{uiText("Chưa có chỉ thị !dau-ra, !lap-lai hoặc !dung.")}</p>}
   </div>
  </details>
 </section>;
}
