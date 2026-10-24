import {t as uiText} from './i18n';
import {MAX_WORKFLOW_STEPS} from '../../core/src/desktop/workflow-limits';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BUILTIN_PROMPTS} from '@pvta/shared';
import {rpc,type ViewState} from './ipc';
import type {WorkflowTemplate,TemplateStep,TemplateParam} from '../../core/src/desktop/types';
import {choiceKey,parseKey,modelGroups} from './model-groups';
import {WorkflowListIcon} from './WorkflowListIcon';
import {StepComposer} from './StepComposer';
import './template.css';

/** Hộp thoại gốc: tự giữ tiêu điểm, Esc để đóng. */
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current!;const prev=document.activeElement as HTMLElement|null;if(d.showModal)d.showModal();else d.setAttribute('open','');return()=>{d.close?.();prev?.focus();};},[]);
 return <dialog ref={ref} className="tpl-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}><header><strong>{title}</strong><button aria-label={uiText("Đóng")} onClick={onClose}>✕</button></header><div className="tpl-body">{children}</div></dialog>;
}

function TemplateEditor({inline,title,onClose,children}:{inline?:boolean;title:string;onClose:()=>void;children:React.ReactNode}){
 if(!inline)return <Modal title={title} onClose={onClose}>{children}</Modal>;
 return <section className="tpl-inline tpl-inline-editor" aria-label={title}><header className="tpl-head"><strong>{title}</strong><button aria-label={uiText("Đóng")} onClick={onClose}>✕</button></header><div className="tpl-body">{children}</div></section>;
}


/** Hộp thoại đặt tên khi lưu quy trình thành mẫu (thay window.prompt, vốn không chạy trong webview Tauri/macOS). */
export function SaveTemplateDialog({workflowId,defaultName,onClose,onSaved,report}:{workflowId:string;defaultName:string;onClose:()=>void;onSaved:(id:string)=>void;report:(e:unknown)=>void}){
 const [name,setName]=useState(defaultName);
 const [busy,setBusy]=useState(false);
 async function submit(){
  if(busy||!name.trim())return;
  setBusy(true);
  try{const id=await rpc<string>('templateFromWorkflow',{workflowId,name:name.trim()});onSaved(id);onClose();}
  catch(e){report(e);}finally{setBusy(false);}
 }
 return <Modal title={uiText("Lưu thành quy trình mẫu")} onClose={onClose}>
  <label>{uiText("Tên quy trình mẫu")}<input autoFocus value={name} maxLength={100} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void submit();}}/></label>
  <p className="muted small">{uiText("Mẫu giữ lại prompt và cấu trúc các khâu, không giữ lịch sử chạy hay đường dẫn. Sau khi lưu, bạn có thể thêm tham số {{khóa}} vào prompt.")}</p>
  <div className="tpl-actions"><button onClick={onClose}>{uiText("Hủy")}</button><button className="primary" disabled={busy||!name.trim()} onClick={()=>void submit()}>{busy?uiText("Đang lưu…"):uiText("Lưu mẫu")}</button></div>
 </Modal>;
}

export type TemplateTarget={planId?:string;workflowId?:string;name?:string;projectId?:string};

/** Chọn quy trình mẫu, điền tham số và đầu ra rồi CHÈN cả khối bước vào Plan/quy trình (hoặc tạo quy trình mới). Không ghi đè bước cũ. */
export function TemplateInsertDialog({state,target,initialTemplateId,onClose,onDone,report,chatText,offerRun}:{chatText?:string;offerRun?:boolean;initialTemplateId?:string;state:ViewState;target:TemplateTarget;onClose:()=>void;onDone:(r:{kind:'plan'|'workflow';id:string},run?:boolean)=>void;report:(e:unknown)=>void}){
 const templates=state.data.workflowTemplates??[];
 const [templateId,setTemplateId]=useState(templates.find(t=>t.id===initialTemplateId)?.id??templates[0]?.id??'');
 const tpl=templates.find(t=>t.id===templateId);
 const [values,setValues]=useState<Record<string,string>>({});
 const [output,setOutput]=useState('');
 const [busy,setBusy]=useState(false);
 const [run,setRun]=useState(true);
 async function insert(){
  if(!tpl||busy)return;
  setBusy(true);
  try{const r=await rpc<{kind:'plan'|'workflow';id:string}>('templateInsert',{templateId:tpl.id,target,params:values,output});onDone(r,offerRun?run:undefined);onClose();}
  catch(e){report(e);}finally{setBusy(false);}
 }
 const fromChat=chatText?.trim();
 const into=!!(target.planId||target.workflowId);
 return <Modal title={uiText("Chèn quy trình mẫu")} onClose={onClose}>
  {!templates.length?<p className="muted">{uiText("Chưa có quy trình mẫu. Tạo mẫu trong mục Quy trình → Quy trình mẫu.")}</p>:<>
   <label>{uiText("Quy trình mẫu")}<select value={templateId} onChange={e=>{setTemplateId(e.target.value);setValues({});setOutput('');}}>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   {tpl?.description&&<p className="muted">{tpl.description}</p>}
   {into&&<p className="muted small">{uiText("Cả khối bước của mẫu được thêm vào cuối, các bước cũ giữ nguyên và chưa nối với khối mới. Bạn tự nối, hoặc chấp nhận liên kết nét đứt PVTA gợi ý. Khối chèn là bản sao: sửa thoải mái, không đổi mẫu gốc.")}</p>}
   {tpl&&<>
    {!!tpl.params.length&&<fieldset className="tpl-params"><legend>{uiText("Đầu vào lần này")}</legend>{tpl.params.map(p=><label key={p.key}>{p.label}{p.required&&<b aria-label={uiText("bắt buộc")}> *</b>}{fromChat&&<button type="button" className="tpl-from-chat" title={uiText("Điền ô này bằng nội dung đang gõ trong khung chat")} onClick={()=>setValues(v=>({...v,[p.key]:fromChat}))}>{uiText("↧ Lấy từ khung chat")}</button>}
     {p.long?<textarea rows={3} placeholder={p.default??p.hint} value={values[p.key]??''} onChange={e=>setValues(v=>({...v,[p.key]:e.target.value}))}/>:<input placeholder={p.default??p.hint} value={values[p.key]??''} onChange={e=>setValues(v=>({...v,[p.key]:e.target.value}))}/>}
     {p.hint&&<small>{p.hint}</small>}</label>)}</fieldset>}
    <fieldset className="tpl-params"><legend>{uiText("Đầu ra")}</legend>
     {tpl.output.mode==='fixed'?<p>{tpl.output.text}</p>:<label>{uiText("Bạn quy định đầu ra lần này")}<textarea rows={3} placeholder={tpl.output.text||uiText("Ví dụ: 1 tệp Word, 20 câu, kèm đáp án")} value={output} onChange={e=>setOutput(e.target.value)}/></label>}
    </fieldset>
   </>}
   <div className="tpl-actions"><button onClick={onClose}>{uiText("Hủy")}</button>{offerRun&&<label className="tpl-run"><input type="checkbox" checked={run} onChange={e=>setRun(e.target.checked)}/> {uiText("Chạy ngay")}</label>}<button className="primary" disabled={!tpl||busy} onClick={()=>void insert()}>{busy?uiText("Đang chèn…"):offerRun&&run?uiText("Chèn và chạy"):uiText("Chèn")}</button></div>
  </>}
 </Modal>;
}

const blankStep=():TemplateStep=>({id:crypto.randomUUID().slice(0,8),name:uiText("Khâu mới"),prompt:'',access:'read'});
const blankParam=():TemplateParam=>({key:'',label:'',required:true});
const blank=():WorkflowTemplate=>({id:'',name:'',params:[],steps:[blankStep()],output:{mode:'ask',text:''},createdAt:0,updatedAt:0});

function MarkdownImport({onClose,onDraft}:{onClose:()=>void;onDraft:(draft:WorkflowTemplate)=>void}){
 const [text,setText]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function read(file?:File){
  if(!file)return;
  setError('');setText('');setName(file.name);setBusy(true);
  try{
   if(!/\.(md|markdown)$/i.test(file.name))throw Error('Chọn tệp .md hoặc .markdown.');
   if(file.size>400_000)throw Error('Tệp quá lớn. Markdown tối đa 100.000 ký tự.');
   const content=await file.text();
   if(content.length>100_000)throw Error('Markdown tối đa 100.000 ký tự.');
   if(alive.current)setText(content);
  }catch(e){if(alive.current)setError(String(e instanceof Error?e.message:e));}
  finally{if(alive.current)setBusy(false);}
 }
 async function analyze(){
  setBusy(true);setError('');
  try{const draft=await rpc<WorkflowTemplate>('workflowMarkdownDraft',{text});if(alive.current)onDraft({...draft,id:''});}
  catch(e){if(alive.current)setError(String(e instanceof Error?e.message:e));}
  finally{if(alive.current)setBusy(false);}
 }
 return <Modal title="Dựng từ Markdown" onClose={onClose}>
  <p>Chọn Markdown mô tả tự do hoặc dán nội dung. AI phân tích thành bản nháp để thầy cô xem và sửa trước khi lưu; chưa chạy quy trình.</p>
  <label>Tệp Markdown<input type="file" accept=".md,.markdown,text/markdown" disabled={busy} onChange={e=>void read(e.target.files?.[0])}/></label>
  {name&&<small>{name}</small>}
  <label>Nội dung Markdown<textarea rows={10} maxLength={100_000} value={text} disabled={busy} onChange={e=>setText(e.target.value)}/></label>
  {error&&<p role="alert">{error}</p>}
  {busy&&<p role="status">Đang đọc hoặc phân tích Markdown…</p>}
  <div className="tpl-actions"><button onClick={onClose}>Đóng</button><button className="primary" disabled={busy||!text.trim()} onClick={()=>void analyze()}>Phân tích bằng AI</button></div>
 </Modal>;
}

/** Danh sách, tạo, sửa, xóa quy trình mẫu. */
export function TemplateManager({state,onClose,onUse,report,notice,inline,openId,markdownRequest=0}:{markdownRequest?:number;openId?:string;inline?:boolean;state:ViewState;onClose:()=>void;onUse:(templateId:string)=>void;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const templates=state.data.workflowTemplates??[];
 const [draft,setDraft]=useState<WorkflowTemplate|null>(null);
 const [busy,setBusy]=useState(false);
 const [query,setQuery]=useState('');
 const [openStep,setOpenStep]=useState(0);
 const [importing,setImporting]=useState(false);
 useEffect(()=>{if(markdownRequest)setImporting(true);},[markdownRequest]);
 const original=templates.find(t=>t.id===draft?.id);
 const unsaved=!!draft&&(!original||JSON.stringify(draft)!==JSON.stringify(original));
 const skills=state.skills.map(s=>s.name);
 const groups=useMemo(()=>modelGroups(state),[state]);
 const ruleKeys=useMemo(()=>{const all=[...(state.data.ruleBook??[]),...state.data.projects.flatMap(p=>p.ruleBook??[])];return [...new Map(all.map(r=>[r.key,r])).values()];},[state]);
 const prompts=useMemo(()=>[...BUILTIN_PROMPTS,...state.prompts.own],[state]);
 useEffect(()=>{if(!openId)return;const t=templates.find(x=>x.id===openId);if(t)setDraft(d=>d?.id===openId?d:structuredClone(t));},[openId,templates.length]);
 const langContext=useMemo(()=>draft?{id:draft.id||'template-draft',mode:draft.steps.some(x=>x.dependsOn!==undefined)?'parallel' as const:'sequential' as const,steps:draft.steps.map(x=>({id:x.id,name:x.name,prompt:x.prompt,dependsOn:x.dependsOn}))}:null,[draft]);
 const patch=(p:Partial<WorkflowTemplate>)=>setDraft(d=>d&&{...d,...p});
 const patchStep=(i:number,p:Partial<TemplateStep>)=>setDraft(d=>d&&{...d,steps:d.steps.map((s,n)=>n===i?{...s,...p}:s)});
 const patchParam=(i:number,p:Partial<TemplateParam>)=>setDraft(d=>d&&{...d,params:d.params.map((x,n)=>n===i?{...x,...p}:x)});
 const toggle=(list:string[]|undefined,v:string,on:boolean)=>on?[...(list??[]),v]:(list??[]).filter(x=>x!==v);
 const branched=!!draft&&draft.steps.some(s=>s.dependsOn!==undefined);
 const setBranched=(on:boolean)=>setDraft(d=>d&&{...d,steps:d.steps.map((s,i)=>on?{...s,dependsOn:i?[d.steps[i-1]!.id]:[]}:(({dependsOn:_x,...rest})=>rest)(s))});
 const toggleDep=(i:number,id:string,on:boolean)=>patchStep(i,{dependsOn:on?[...(draft!.steps[i]!.dependsOn??[]),id]:(draft!.steps[i]!.dependsOn??[]).filter(x=>x!==id)});
 /** Giữ quan hệ chờ hợp lệ: chỉ chờ các khâu đứng trước, bỏ khâu đã xóa. */
 const tidy=(steps:TemplateStep[]):TemplateStep[]=>steps.map((s,i)=>s.dependsOn===undefined?s:{...s,dependsOn:s.dependsOn.filter(id=>steps.findIndex(x=>x.id===id)>=0&&steps.findIndex(x=>x.id===id)<i)});
 async function save(use=false){if(!draft||busy)return;setBusy(true);try{const id=await rpc<string>('templateSave',{template:draft});setDraft(null);notice(uiText("Đã lưu quy trình mẫu."));if(use)onUse(id);}catch(e){report(e);}finally{setBusy(false);}}
 async function remove(t:WorkflowTemplate){if(!confirm(uiText("Xóa quy trình mẫu “{0}”? Các quy trình và Plan đã tạo từ mẫu này không bị ảnh hưởng.",[t.name])))return;try{await rpc('templateDelete',{id:t.id});}catch(e){report(e);}}
 if(importing)return <MarkdownImport onClose={()=>setImporting(false)} onDraft={value=>{if(unsaved&&!confirm(uiText("Bỏ các thay đổi chưa lưu?")))return;setDraft(value);setOpenStep(0);setImporting(false);}}/>;
 if(draft)return <TemplateEditor inline={inline} title={draft.id?uiText("Sửa quy trình mẫu"):uiText("Quy trình mẫu mới")} onClose={()=>{if(!busy&&(!unsaved||confirm(uiText("Bỏ các thay đổi chưa lưu?"))))setDraft(null);}}>
  <div className={`tpl-save-status ${unsaved?'tpl-unsaved':'tpl-saved'}`} role="status"><WorkflowListIcon template/>{unsaved?uiText("Chưa lưu"):uiText("Đã lưu")}</div>
  <fieldset className="tpl-edit-fields" disabled={busy}>
  <label>{uiText("Tên")}<input value={draft.name} onChange={e=>patch({name:e.target.value})}/></label>
  <label>{uiText("Mô tả")}<input value={draft.description??''} onChange={e=>patch({description:e.target.value})}/></label>
  <fieldset className="tpl-section"><legend>{uiText("Đầu vào chưa xác định (tham số)")}</legend>
   <small>{uiText("Mỗi tham số là một chỗ thay đổi theo từng lần dùng. Viết {{khóa}} trong prompt để chèn giá trị.")}</small>
   {draft.params.map((p,i)=><div className="tpl-row" key={i}>
    <input aria-label={uiText("Khóa")} placeholder="so-cau" value={p.key} onChange={e=>patchParam(i,{key:e.target.value})}/>
    <input aria-label={uiText("Nhãn")} placeholder={uiText("Số câu hỏi")} value={p.label} onChange={e=>patchParam(i,{label:e.target.value})}/>
    <input aria-label={uiText("Giá trị mặc định")} placeholder={uiText("Mặc định")} value={p.default??''} onChange={e=>patchParam(i,{default:e.target.value,required:p.required&&!e.target.value.trim()})}/>
    <label><input type="checkbox" checked={p.long===true} onChange={e=>patchParam(i,{long:e.target.checked})}/> {uiText("Dài")}</label>
    <button aria-label={uiText("Xóa tham số")} onClick={()=>setDraft(d=>d&&{...d,params:d.params.filter((_,n)=>n!==i)})}>✕</button>
   </div>)}
   <button onClick={()=>setDraft(d=>d&&{...d,params:[...d.params,blankParam()]})}>{uiText("＋ Thêm tham số")}</button>
  </fieldset>
  <fieldset className="tpl-section"><legend>{uiText("Các khâu")}</legend>
   <label><input type="checkbox" checked={branched} onChange={e=>setBranched(e.target.checked)}/> {uiText("Đa nhánh: khâu không chọn khâu chờ sẽ chạy độc lập, khâu chọn nhiều khâu chờ sẽ hợp nhất kết quả")}</label>
   <ol className="tpl-flow tpl-flow-edit" aria-label={uiText("Sơ đồ các khâu")}>{draft.steps.map((x,i)=><li key={x.id} className={i===openStep?'on':''}><button type="button" title={x.name} onClick={()=>setOpenStep(i)}>{i+1}. {x.name||uiText("Khâu mới")}{branched&&i>0?(x.dependsOn?.length?` ← ${x.dependsOn.map(id=>draft.steps.findIndex(y=>y.id===id)+1).filter(n=>n>0).join(',')}`:` ${uiText("⑂ song song")}`):''}</button></li>)}</ol>
   {draft.steps.map((s,i)=><div className={`tpl-step${i===openStep?' open':''}`} key={s.id}>
    <div className="tpl-row"><span className="step-number">{i+1}</span><button type="button" aria-expanded={i===openStep} onClick={()=>setOpenStep(i===openStep?-1:i)}>{i===openStep?uiText("Thu gọn"):uiText("Mở")}</button><input aria-label={uiText("Tên khâu")} value={s.name} onChange={e=>patchStep(i,{name:e.target.value})}/>
     <select aria-label={uiText("Model của khâu")} title={uiText("Model chạy khâu này khi áp dụng vào quy trình. Plan chạy theo model của hội thoại.")} value={choiceKey(s.choice)} onChange={e=>patchStep(i,{choice:parseKey(e.target.value)})}>
      <option value="auto">{uiText("Tự động chọn AI")}</option>
      {groups.map(g=><optgroup key={g.label} label={g.label}>{g.items.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>)}
      {s.choice&&s.choice!=='auto'&&!groups.some(g=>g.items.some(m=>m.key===choiceKey(s.choice)))&&<option value={choiceKey(s.choice)}>{s.choice.model} {uiText("(chưa cấu hình)")}</option>}
     </select>
     <select aria-label={uiText("Quyền")} value={s.access} onChange={e=>patchStep(i,{access:e.target.value as 'read'|'full'})}><option value="read">{uiText("Chỉ đọc")}</option><option value="full">{uiText("Chỉnh sửa")}</option></select>
     <button disabled={!i} aria-label={uiText("Dời lên")} onClick={()=>setDraft(d=>{if(!d)return d;const n=[...d.steps];[n[i-1],n[i]]=[n[i]!,n[i-1]!];return {...d,steps:tidy(n)};})}>↑</button>
     <button disabled={i===draft.steps.length-1} aria-label={uiText("Dời xuống")} onClick={()=>setDraft(d=>{if(!d)return d;const n=[...d.steps];[n[i+1],n[i]]=[n[i]!,n[i+1]!];return {...d,steps:tidy(n)};})}>↓</button>
     <button disabled={draft.steps.length<2} aria-label={uiText("Xóa khâu")} onClick={()=>setDraft(d=>d&&{...d,steps:tidy(d.steps.filter((_,n)=>n!==i))})}>✕</button></div>
    {i!==openStep&&<p className="muted small tpl-summary">{s.prompt.trim().slice(0,120)||uiText("Chưa có prompt")}</p>}
    {i===openStep&&<>
    {branched&&<div className="tpl-picks"><strong>{uiText("Chờ các khâu")}</strong>{i===0?<small>{uiText("Khâu đầu luôn độc lập.")}</small>:draft.steps.slice(0,i).map((d,n)=><label key={d.id}><input type="checkbox" checked={!!s.dependsOn?.includes(d.id)} onChange={e=>toggleDep(i,d.id,e.target.checked)}/> {n+1}. {d.name}</label>)}{i>0&&!s.dependsOn?.length&&<small>{uiText("Không chọn: nhánh độc lập, chạy song song.")}</small>}</div>}
    <StepComposer inheritedResources={draft.steps.filter(x=>x.id!==s.id).flatMap(x=>(x.resources??[]).filter(r=>r.scope==='workflow').map(resource=>({owner:x.name,resource})))} resources={s.resources} onResources={(resources,prompt)=>patchStep(i,{resources,...(prompt!==undefined?{prompt}:{})})} assistant workflow={langContext!} stepId={s.id} state={state} value={s.prompt} onChange={prompt=>patchStep(i,{prompt})} files={[]} onFiles={()=>{}} filesDisabledReason={uiText("Quy trình mẫu không lưu đường dẫn tệp. Hãy đính kèm tệp khi dùng mẫu hoặc khai báo !dau-vao với tham số {{khóa}}.")} report={report} notice={notice}/>
    <details><summary>{uiText("Kỹ năng, quy tắc, lời nhắc mẫu (tùy chọn)")}{(s.skills?.length||s.rules?.length||s.prompts?.length)?` · ${(s.skills?.length??0)+(s.rules?.length??0)+(s.prompts?.length??0)}`:''}</summary>
     <div className="tpl-picks"><strong>{uiText("Kỹ năng")}</strong>{skills.map(n=><label key={n}><input type="checkbox" checked={!!s.skills?.includes(n)} onChange={e=>patchStep(i,{skills:toggle(s.skills,n,e.target.checked)})}/> {n}</label>)}</div>
     <div className="tpl-picks"><strong>{uiText("Quy tắc")}</strong>{ruleKeys.length?ruleKeys.map(r=><label key={r.key}><input type="checkbox" checked={!!s.rules?.includes(r.key)} onChange={e=>patchStep(i,{rules:toggle(s.rules,r.key,e.target.checked)})}/> #{r.key} · {r.title}</label>):<small>{uiText("Chưa có quy tắc.")}</small>}</div>
     <div className="tpl-picks"><strong>{uiText("Lời nhắc mẫu")}</strong>{prompts.map(p=><label key={p.id}><input type="checkbox" checked={!!s.prompts?.includes(p.id)} onChange={e=>patchStep(i,{prompts:toggle(s.prompts,p.id,e.target.checked)})}/> {p.title}</label>)}</div>
    </details>
    </>}
   </div>)}
   <button disabled={draft.steps.length>=MAX_WORKFLOW_STEPS} onClick={()=>{setOpenStep(draft.steps.length);setDraft(d=>d&&{...d,steps:[...d.steps,branched?{...blankStep(),dependsOn:[]}:blankStep()]});}}>{uiText("＋ Thêm khâu")}</button>
  </fieldset>
  <fieldset className="tpl-section"><legend>{uiText("Đầu ra")}</legend>
   <label><input type="radio" checked={draft.output.mode==='ask'} onChange={()=>patch({output:{...draft.output,mode:'ask'}})}/> {uiText("Quy định mỗi lần dùng (đầu ra khác nhau theo từng bộ)")}</label>
   <label><input type="radio" checked={draft.output.mode==='fixed'} onChange={()=>patch({output:{...draft.output,mode:'fixed'}})}/> {uiText("Cố định, quy định sẵn trong mẫu")}</label>
   <textarea rows={3} aria-label={uiText("Mô tả đầu ra")} placeholder={draft.output.mode==='ask'?uiText("Gợi ý cách quy định đầu ra (không bắt buộc)"):uiText("Mô tả đầu ra bắt buộc")} value={draft.output.text} onChange={e=>patch({output:{...draft.output,text:e.target.value}})}/>
  </fieldset>
  <div className="tpl-actions"><button onClick={()=>{if(confirm(uiText("Bỏ các thay đổi chưa lưu?")))setDraft(null);}}>{uiText("Hủy")}</button><button disabled={busy} onClick={()=>void save(true)}>Lưu mẫu và tạo quy trình…</button><button className="primary" disabled={busy} onClick={()=>void save()}>{uiText("Lưu mẫu")}</button></div>
  </fieldset>
 </TemplateEditor>;
 const Frame=inline?({children}:{children:React.ReactNode})=><section className="tpl-inline" aria-label={uiText("Quy trình mẫu")}>{children}</section>:({children}:{children:React.ReactNode})=><Modal title={uiText("Quy trình mẫu")} onClose={onClose}>{children}</Modal>;
 const shown=templates.filter(t=>!query.trim()||(t.name+' '+(t.description??'')).toLowerCase().includes(query.trim().toLowerCase()));
 const copy=(t:WorkflowTemplate)=>{const c=structuredClone(t);setDraft({...c,id:'',name:uiText("{0} (bản sao)",[t.name]).slice(0,100)});};
 return <Frame>
  <button onClick={()=>setImporting(true)}>Dựng từ Markdown</button>
  <header className="tpl-head"><div><strong>{uiText("Thư viện quy trình mẫu")}</strong><p className="muted">{uiText("Đầu vào thay đổi mỗi lần dùng, đầu ra do bạn quy định. Dùng lại cho Plan, quy trình mới hoặc một khâu bất kỳ.")}</p></div><button className="primary" onClick={()=>{setOpenStep(0);setDraft(blank());}}>{uiText("＋ Mẫu mới")}</button></header>
  {templates.length>3&&<input className="tpl-search" type="search" aria-label={uiText("Tìm quy trình mẫu")} placeholder={uiText("Tìm theo tên hoặc mô tả…")} value={query} onChange={e=>setQuery(e.target.value)}/>}
  {!templates.length&&<div className="tpl-empty"><span aria-hidden>🧩</span><strong>{uiText("Chưa có quy trình mẫu")}</strong><p className="muted">{uiText("Mở một quy trình ở tab Quy trình, bấm “Lưu thành quy trình mẫu”; hoặc bấm “＋ Mẫu mới” để tự soạn.")}</p></div>}
  {!!templates.length&&!shown.length&&<p className="muted">{uiText("Không có mẫu khớp từ khóa.")}</p>}
  <ul className="tpl-grid">{shown.map(t=>{const multi=t.steps.some(x=>x.dependsOn&&x.dependsOn.length!==1);return <li className="tpl-card" key={t.id}>
   <div className="tpl-save-status tpl-saved"><WorkflowListIcon template/>{uiText("Đã lưu")}</div>
   <div className="tpl-card-top"><strong title={t.name}>{t.name}</strong><div className="tpl-chips"><span>{uiText("{0} khâu",[t.steps.length])}</span><span>{uiText("{0} tham số",[t.params.length])}</span>{multi&&<span className="tpl-chip-accent">{uiText("đa nhánh")}</span>}</div></div>
   {t.description&&<p className="tpl-desc muted">{t.description}</p>}
   <ol className="tpl-flow">{t.steps.slice(0,4).map(x=><li key={x.id} title={x.name}>{x.name}</li>)}{t.steps.length>4&&<li className="tpl-more">+{t.steps.length-4}</li>}</ol>
   <div className="tpl-card-actions"><button className="primary" onClick={()=>onUse(t.id)}>{uiText("Dùng")}</button><button onClick={()=>{setOpenStep(0);setDraft(structuredClone(t));}}>{uiText("Sửa")}</button><button onClick={()=>copy(t)}>{uiText("Nhân bản")}</button><button className="tpl-del" onClick={()=>void remove(t)}>{uiText("Xóa")}</button></div>
  </li>;})}</ul>
 </Frame>;
}
