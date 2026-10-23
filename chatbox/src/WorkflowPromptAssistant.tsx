import React,{useMemo,useState,useEffect,useRef} from 'react';
import {rpc,pickFiles} from './ipc';
import {languageSuggestions,type LanguageWorkflow} from '../../core/src/desktop/workflow-language';

/** No global state/catalog is accepted: suggestions only see this workflow draft. */
export function WorkflowPromptAssistant({workflow,stepId,value,caret,onChange,onInsert,disabled,report,checkRequest=0,noFiles}:{noFiles?:boolean;workflow:LanguageWorkflow&{id:string};stepId:string;value:string;caret:number;onChange:(value:string)=>void;onInsert:(text:string)=>void;disabled?:boolean;report:(error:unknown)=>void;checkRequest?:number}){
 const context=useMemo(()=>({...workflow,steps:workflow.steps.map(s=>s.id===stepId?{...s,prompt:value}:s)}),[workflow,stepId,value]);
 const hints=useMemo(()=>languageSuggestions(context,stepId),[context,stepId]);
 const latest=useRef({context,stepId,value});latest.current={context,stepId,value};
 const [open,setOpen]=useState(false),[preview,setPreview]=useState(''),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false);
 const token=/(?:^|\s)([!\$][\w-]*)$/.exec(value.slice(0,caret))?.[1];
 const items=token?hints.items.filter(x=>x.label.startsWith(token)):[];
 const localError=hints.diagnostic?.stepId===stepId;
 const previewHints=useMemo(()=>languageSuggestions({...context,steps:context.steps.map(s=>s.id===stepId?{...s,prompt:preview}:s)},stepId),[context,stepId,preview]);
 const [base,setBase]=useState(value);
 const show=()=>{setBase(value);setPreview(value);setOpen(true);};
 useEffect(()=>{if(checkRequest&&localError&&/cần tên và giá trị/.test(hints.error)){setBase(value);setPreview(value);setOpen(true);}},[checkRequest]);
 async function ask(repair=false){const snapshot=latest.current;setBase(value);setBusy(true);try{
  const result=await rpc('workflowSuggest',{workflow:context,stepId,question:repair?`Sửa lỗi: ${hints.error}\n${hints.diagnostic?.repair??''}. Giữ yêu cầu gốc và chỉ sửa prompt nút đang chọn.`:question});
  if(latest.current.context!==snapshot.context||latest.current.stepId!==snapshot.stepId){report('Prompt hoặc quy trình đã đổi. Hãy yêu cầu gợi ý lại.');return;}
  setPreview(String(result));
 }catch(e){report(e);}finally{setBusy(false);}}
 async function attach(){try{const paths=await pickFiles(false);if(paths[0])setPreview(p=>p+(p.endsWith('\n')?'':'\n')+'!dau-vao tai-lieu = '+JSON.stringify(paths[0]));}catch(e){report(e);}}
 return <section className="wf-language" aria-label="Gợi ý khai báo">
  {items.length>0&&!disabled&&<div role="listbox" aria-label="Gợi ý trong quy trình">{items.slice(0,12).map(x=><button type="button" role="option" aria-selected={false} key={x.label} title={x.detail} onMouseDown={e=>e.preventDefault()} onClick={()=>onInsert(x.label)}><code>{x.label}</code> <small>{x.detail}</small></button>)}</div>}
  <p className="wf-language-hint"><em>{items[0]?.detail??'Nêu việc cần làm, đầu vào, đầu ra và tiêu chí hoàn thành. Gõ ! để xem cú pháp, $ để tham chiếu tên trong quy trình.'}</em></p>
  {hints.error&&<div className="wf-language-error" role="alert"><p>{hints.error}</p><p><em>{hints.diagnostic?.repair}</em></p>
   {localError?<><button type="button" disabled={disabled} onClick={show}>Tự sửa</button><button type="button" disabled={busy||disabled} onClick={()=>{show();void ask(true);}}>Nhờ AI sửa</button></>:<p>Mở nút được báo lỗi để sửa; không thay prompt của nút hiện tại.</p>}
  </div>}
  <button type="button" disabled={disabled} onClick={show}>Gợi ý khai báo / trao đổi</button>
  <details><summary>Tên, hàm và mã nút trong quy trình</summary>{hints.items.filter(x=>!x.label.startsWith('!')).map(x=><button type="button" key={x.label} disabled={disabled} title={x.detail} onMouseDown={e=>e.preventDefault()} onClick={()=>onInsert(x.label)}><code>{x.label}</code> <small>{x.detail}</small></button>)}</details>
  {open&&<div role="dialog" aria-label="Trao đổi khai báo" className="wf-language-dialog">
   <p>Đề xuất chỉ dùng dữ liệu của quy trình này. Kiểm tra bản xem trước rồi chọn Áp dụng; đóng cửa sổ không sửa prompt.</p>
   <label>Yêu cầu bổ sung tên, giá trị hoặc cú pháp<input aria-label="Yêu cầu gợi ý" value={question} onChange={e=>setQuestion(e.target.value)}/></label>
   <button type="button" disabled={busy||disabled} onClick={()=>void ask()}>{busy?'Đang gợi ý…':'Nhờ AI đề xuất'}</button>
   {!noFiles&&<button type="button" disabled={busy||disabled} onClick={()=>void attach()}>Chọn tệp đầu vào</button>}
   <label>Bản xem trước prompt<textarea aria-label="Bản xem trước prompt" rows={8} value={preview} onChange={e=>setPreview(e.target.value)}/></label>
   {previewHints.error&&<p role="alert">{previewHints.error} {previewHints.diagnostic?.repair}</p>}
   {base!==value&&<p role="alert">Prompt gốc đã đổi. Đóng và mở lại để tránh ghi đè nội dung mới.</p>}
   <button type="button" disabled={busy||disabled||base!==value||previewHints.diagnostic?.stepId===stepId} onClick={()=>{onChange(preview);setOpen(false);}}>Áp dụng</button>
   <button type="button" disabled={busy} onClick={()=>setOpen(false)}>Hủy</button>
  </div>}
 </section>;
}
