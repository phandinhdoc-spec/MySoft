import React,{useState} from 'react';
import {t as uiText} from './i18n';
import type {LanguageWorkflow} from '../../core/src/desktop/workflow-language';
import type {WorkflowStep} from '../../core/src/desktop/types';
import {applyDirectiveEdit,assignableVars,loopTargets,readDirectives,MAX_LOOPS,type DirectiveModel} from './workflow-directives';

type Wf=LanguageWorkflow;
interface FormProps {workflow:Wf;step:Pick<WorkflowStep,'id'|'prompt'>;onPrompt:(prompt:string)=>void;disabled?:boolean}

/** Mỗi lần sửa được kiểm tra ngay; sai thì giữ lỗi theo từng mục và KHÔNG ghi vào prompt. */
function useDirectiveEdit({workflow,step,onPrompt}:FormProps){
 const [errors,setErrors]=useState<Record<string,string>>({});
 const model=readDirectives(step.prompt);
 function apply(section:string,mutate:(m:DirectiveModel)=>void){
  const result=applyDirectiveEdit(workflow,step.id,mutate);
  setErrors(e=>{const next={...e};if(result.ok)delete next[section];else next[section]=result.error;return next;});
  if(result.ok){if(result.prompt!==step.prompt)onPrompt(result.prompt);return true;}
  return false;
 }
 return {model,errors,apply};
}
const Err=({text}:{text?:string})=>text?<p role="alert" className="wf-form-error">{text}</p>:null;
const onEnter=(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}};

/** Một dòng tên + giá trị; ghi khi rời ô hoặc nhấn Enter. Key đổi theo nội dung nên nháp tự đặt lại sau khi ghi. */
function PairRow({name,value,namePlaceholder,valuePlaceholder,nameLabel,valueLabel,removeLabel,disabled,onCommit,onRemove}:{name:string;value:string;namePlaceholder:string;valuePlaceholder:string;nameLabel:string;valueLabel:string;removeLabel:string;disabled?:boolean;onCommit:(name:string,value:string)=>void;onRemove:()=>void}){
 const [n,setN]=useState(name),[v,setV]=useState(value);
 const commit=()=>{if(n!==name||v!==value)onCommit(n,v);};
 return <div className="wf-form-row">
  <input aria-label={nameLabel} placeholder={namePlaceholder} value={n} disabled={disabled} onChange={e=>setN(e.target.value)} onBlur={commit} onKeyDown={onEnter}/>
  <input aria-label={valueLabel} placeholder={valuePlaceholder} value={v} disabled={disabled} onChange={e=>setV(e.target.value)} onBlur={commit} onKeyDown={onEnter}/>
  <button type="button" disabled={disabled} aria-label={removeLabel} onClick={onRemove}>×</button>
 </div>;
}

/** Biểu mẫu vùng ĐẦU VÀO: !bien $ten = giá-trị và !dau-vao $ten = @truoc. */
export function StepInputsForm(props:FormProps){
 const {workflow,step,disabled}=props;
 const {model,errors,apply}=useDirectiveEdit(props);
 const [newName,setNewName]=useState(''),[newValue,setNewValue]=useState('');
 const [receiveName,setReceiveName]=useState('');
 const receiving=model.receive!==undefined;
 void workflow;void step;
 return <div className="wf-form">
  <fieldset className="wf-form-set" disabled={disabled}>
   <legend>{uiText("Biến của nút")}</legend>
   {model.vars.map((v,i)=><PairRow key={`${i}:${v.name}:${v.value}`} name={v.name} value={v.value} namePlaceholder={uiText("tên-biến")} valuePlaceholder={uiText("giá trị đầu")} nameLabel={uiText("Tên biến")} valueLabel={uiText("Giá trị đầu của biến")} removeLabel={uiText("Xóa biến {0}",[v.name])} disabled={disabled}
    onCommit={(name,value)=>apply('vars',m=>{m.vars[i]={name,value};})} onRemove={()=>apply('vars',m=>{m.vars.splice(i,1);})}/>)}
   <div className="wf-form-row">
    <input aria-label={uiText("Tên biến mới")} placeholder={uiText("tên-biến")} value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={onEnter}/>
    <input aria-label={uiText("Giá trị đầu của biến mới")} placeholder={uiText("giá trị đầu, ví dụ 0 hoặc \"văn bản\"")} value={newValue} onChange={e=>setNewValue(e.target.value)} onKeyDown={onEnter}/>
    <button type="button" disabled={!newName.trim()||!newValue.trim()} onClick={()=>{if(apply('vars',m=>{m.vars.push({name:newName,value:newValue});})){setNewName('');setNewValue('');}}}>{uiText("Thêm biến")}</button>
   </div>
   <p className="muted small">{uiText("Giá trị đầu phải là hằng: số, chuỗi trong dấu nháy kép, true/false/null, mảng hoặc đối tượng.")}</p>
   <Err text={errors.vars}/>
  </fieldset>
  <fieldset className="wf-form-set" disabled={disabled}>
   <legend>{uiText("Nhận kết quả nút trước")}</legend>
   <label className="wf-check"><input type="checkbox" checked={receiving} onChange={e=>{if(e.target.checked){const name=receiveName.trim()||'ket-qua-truoc';setReceiveName(name);apply('receive',m=>{m.receive=name;});}else apply('receive',m=>{delete m.receive;});}}/> {uiText("Nhận kết quả nút trước vào biến")}</label>
   {receiving&&<input key={model.receive} aria-label={uiText("Tên biến nhận kết quả")} defaultValue={model.receive} onBlur={e=>{const name=e.currentTarget.value;if(name!==model.receive)apply('receive',m=>{m.receive=name;});}} onKeyDown={onEnter}/>}
   <Err text={errors.receive}/>
  </fieldset>
 </div>;
}

/** Biểu mẫu vùng ĐẦU RA: !gan, !dau-ra, !lap-lai, !dung. */
export function StepOutputsForm(props:FormProps){
 const {workflow,step,disabled}=props;
 const {model,errors,apply}=useDirectiveEdit(props);
 const vars=assignableVars(workflow,step.id),targets=loopTargets(workflow,step.id);
 const [aName,setAName]=useState(''),[aExpr,setAExpr]=useState('');
 const [lTarget,setLTarget]=useState(''),[lCond,setLCond]=useState(''),[lMax,setLMax]=useState('');
 const loopKey=`${model.loop?.target}|${model.loop?.cond}|${model.loop?.max}`;
 const target=model.loop?.target??lTarget,cond=model.loop?.cond??lCond;
 const [prevLoopKey,setPrevLoopKey]=useState(loopKey);
 if(prevLoopKey!==loopKey){setPrevLoopKey(loopKey);setLTarget(model.loop?.target??'');setLCond(model.loop?.cond??'');setLMax(model.loop?.max===undefined?'':String(model.loop.max));}
 const known=new Set(vars);
 const commitLoop=(t:string,c:string,maxText:string)=>{
  if(!t){if(model.loop)apply('loop',m=>{delete m.loop;});return;}
  if(!c.trim())return;
  const trimmed=maxText.trim();
  apply('loop',m=>{m.loop={target:t,cond:c,...(trimmed?{max:/^\d+$/.test(trimmed)?Number(trimmed):NaN}:{})};});
 };
 return <div className="wf-form">
  <fieldset className="wf-form-set" disabled={disabled}>
   <legend>{uiText("Cập nhật biến sau nút này")}</legend>
   {model.assigns.map((a,i)=><div className="wf-form-row" key={`${i}:${a.name}:${a.value}`}>
    <select aria-label={uiText("Biến cần cập nhật")} value={a.name} onChange={e=>apply('assigns',m=>{m.assigns[i]={name:e.target.value,value:a.value};})}>{!known.has(a.name)&&<option value={a.name}>${a.name}</option>}{vars.map(n=><option key={n} value={n}>${n}</option>)}</select>
    <PairValue value={a.value} label={uiText("Biểu thức mới của biến")} placeholder={uiText("ví dụ $so-lan + 1")} disabled={disabled} onCommit={value=>apply('assigns',m=>{m.assigns[i]={name:a.name,value};})}/>
    <button type="button" aria-label={uiText("Xóa cập nhật biến {0}",[a.name])} onClick={()=>apply('assigns',m=>{m.assigns.splice(i,1);})}>×</button>
   </div>)}
   {vars.length?<div className="wf-form-row">
    <select aria-label={uiText("Biến cần cập nhật mới")} value={aName} onChange={e=>setAName(e.target.value)}><option value="">{uiText("Chọn biến")}</option>{vars.map(n=><option key={n} value={n}>${n}</option>)}</select>
    <input aria-label={uiText("Biểu thức cập nhật mới")} placeholder={uiText("ví dụ $so-lan + 1")} value={aExpr} onChange={e=>setAExpr(e.target.value)} onKeyDown={onEnter}/>
    <button type="button" disabled={!aName||!aExpr.trim()} onClick={()=>{if(apply('assigns',m=>{m.assigns.push({name:aName,value:aExpr});})){setAName('');setAExpr('');}}}>{uiText("Thêm cập nhật")}</button>
   </div>:<p className="muted small">{uiText("Chưa có biến nào để cập nhật; khai báo biến ở vùng ĐẦU VÀO của nút này hoặc nút trước.")}</p>}
   <Err text={errors.assigns}/>
  </fieldset>
  <fieldset className="wf-form-set" disabled={disabled}>
   <legend>{uiText("Giá trị đầu ra của nút")}</legend>
   <ValueField key={model.output??''} label={uiText("Biểu thức đầu ra")} placeholder={uiText("ví dụ $so-lan hoặc \"xong\"; để trống nếu không dùng")} value={model.output??''} disabled={disabled} onCommit={value=>apply('output',m=>{if(value.trim())m.output=value;else delete m.output;})}/>
   <Err text={errors.output}/>
  </fieldset>
  <fieldset className="wf-form-set" disabled={disabled}>
   <legend>{uiText("Lặp lại")}</legend>
   {targets.length?<div className="wf-form-row">
    <select aria-label={uiText("Nút đầu vòng lặp")} value={target} onChange={e=>{setLTarget(e.target.value);commitLoop(e.target.value,cond,lMax);}}>
     <option value="">{uiText("Không lặp lại")}</option>
     {model.loop&&!targets.some(x=>x.id===model.loop!.target)&&<option value={model.loop.target}>{model.loop.target}</option>}
     {targets.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
    <input aria-label={uiText("Điều kiện lặp lại")} placeholder={uiText("lặp lại khi, ví dụ $so-lan < 3")} value={cond} disabled={!target} onChange={e=>setLCond(e.target.value)} onBlur={()=>commitLoop(target,cond,lMax)} onKeyDown={onEnter}/>
    <input type="text" inputMode="numeric" aria-label={uiText("Số vòng tối đa")} placeholder={uiText("tối đa … vòng (1–{0})",[MAX_LOOPS])} value={lMax} disabled={!target} onChange={e=>setLMax(e.target.value)} onBlur={()=>commitLoop(target,cond,lMax)} onKeyDown={onEnter}/>
   </div>:<p className="muted small">{uiText("Chỉ lặp lại về được nút tổ tiên đã nối tới nút này; nút này chưa có.")}</p>}
   <p className="muted small">{uiText("Điền số vòng tối đa (1–{0}) để tự thêm biến đếm vào nút này; để trống thì chỉ có giới hạn cứng 100 vòng của hệ thống.",[MAX_LOOPS])}</p>
   <Err text={errors.loop}/>
  </fieldset>
  <fieldset className="wf-form-set" disabled={disabled}>
   <legend>{uiText("Dừng khi")}</legend>
   <ValueField key={model.stop??''} label={uiText("Điều kiện dừng")} placeholder={uiText("ví dụ $so-lan >= 3; để trống nếu không dùng")} value={model.stop??''} disabled={disabled} onCommit={value=>apply('stop',m=>{if(value.trim())m.stop=value;else delete m.stop;})}/>
   <Err text={errors.stop}/>
  </fieldset>
 </div>;
}

function ValueField({label,placeholder,value,disabled,onCommit}:{label:string;placeholder:string;value:string;disabled?:boolean;onCommit:(v:string)=>void}){
 const [v,setV]=useState(value);
 return <input aria-label={label} placeholder={placeholder} value={v} disabled={disabled} onChange={e=>setV(e.target.value)} onBlur={()=>{if(v!==value)onCommit(v);}} onKeyDown={onEnter}/>;
}
const PairValue=({value,label,placeholder,disabled,onCommit}:{value:string;label:string;placeholder:string;disabled?:boolean;onCommit:(v:string)=>void})=><ValueField key={value} label={label} placeholder={placeholder} value={value} disabled={disabled} onCommit={onCommit}/>;
