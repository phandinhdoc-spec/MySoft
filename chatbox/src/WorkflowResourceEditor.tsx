import React,{useState} from 'react';
import type {WorkflowResource} from '../../core/src/desktop/types';
import {t as uiText} from './i18n';

export type ResourceScope='library'|'step'|'workflow';
export function InheritedResources({items}:{items:{owner:string;resource:WorkflowResource}[]}){
 if(!items.length)return null;
 return <div className="wf-resource-list">{items.map(({owner,resource:r},i)=><details key={`${i}:${r.id}`}><summary>{r.kind}: {r.name} · {uiText("Cả quy trình")}</summary><p className="muted small">{uiText("Sửa hoặc bỏ áp dụng tại nút")} {owner}</p><pre style={{whiteSpace:'pre-wrap'}}>{r.body}</pre></details>)}</div>;
}
export function ResourceScopeSelect({value,onChange,disabled,allowLibrary=true}:{value:ResourceScope;onChange:(s:ResourceScope)=>void;disabled?:boolean;allowLibrary?:boolean}){
 return <label>{uiText("Phạm vi quy tắc, skill, prompt mẫu")}<select aria-label={uiText("Phạm vi áp dụng tài nguyên")} value={value} disabled={disabled} onChange={e=>onChange(e.target.value as ResourceScope)}>
  {allowLibrary&&<option value="library">{uiText("1 - Lưu vào thư viện chung của PVTA")}</option>}
  <option value="step">{uiText("2 - Chỉ áp dụng ở nút này")}</option>
  <option value="workflow">{uiText("3 - Áp dụng cho cả quy trình")}</option>
 </select></label>;
}
export function LocalResourceForm({kind,scope,onSave,onCancel}:{kind:WorkflowResource['kind'];scope:'step'|'workflow';onSave:(r:WorkflowResource)=>void;onCancel:()=>void}){
 const [name,setName]=useState(''),[body,setBody]=useState('');
 return <form className="settings-section" onSubmit={e=>{e.preventDefault();if(name.trim()&&body.trim())onSave({id:crypto.randomUUID(),kind,scope,name:name.trim(),body:body.trim()});}}>
  <label>{uiText("Tên")}<input autoFocus required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
  <label>{uiText("Nội dung")}<textarea className="editor" required maxLength={20000} value={body} onChange={e=>setBody(e.target.value)}/></label>
  <p className="muted small">{uiText("Nội dung được lưu cùng quy trình, không thêm vào thư viện chung.")}</p>
  <div className="modal-actions"><button type="button" onClick={onCancel}>{uiText("Hủy")}</button><button className="primary" disabled={!name.trim()||!body.trim()}>{uiText("Áp dụng")}</button></div>
 </form>;
}
export function WorkflowResourceEditor({resources,onChange,disabled}:{resources:WorkflowResource[];onChange:(r:WorkflowResource[])=>void;disabled?:boolean}){
 return <div className="wf-resource-list">{resources.map((r,i)=><details key={r.id}>
  <summary>{r.kind}: {r.name} · {r.scope==='step'?uiText("Nút này"):uiText("Cả quy trình")}</summary>
  <label>{uiText("Tên")}<input value={r.name} maxLength={100} disabled={disabled} onChange={e=>onChange(resources.map((x,n)=>n===i?{...x,name:e.target.value}:x))}/></label>
  <ResourceScopeSelect allowLibrary={false} value={r.scope} disabled={disabled} onChange={scope=>{if(scope!=='library')onChange(resources.map((x,n)=>n===i?{...x,scope}:x));}}/>
  <label>{uiText("Nội dung")}<textarea value={r.body} maxLength={20000} disabled={disabled} onChange={e=>onChange(resources.map((x,n)=>n===i?{...x,body:e.target.value}:x))}/></label>
  <button type="button" disabled={disabled} onClick={()=>onChange(resources.filter((_,n)=>n!==i))}>{uiText("Bỏ áp dụng")}</button>
 </details>)}</div>;
}
