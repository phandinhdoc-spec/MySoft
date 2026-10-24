import React,{useState} from 'react';
import {pickFiles} from './ipc';
import {t as uiText} from './i18n';

const images=['png','jpg','jpeg','webp'];
const documents=['docx','xlsx','pptx','pdf','txt','md','typ','csv'];
export function StepInputFiles({files,onChange,disabled,report,notice}:{files:string[];onChange:(f:string[])=>void;disabled?:boolean;report:(e:unknown)=>void;notice:(s:string)=>void}){
 const [kind,setKind]=useState('all'),[busy,setBusy]=useState(false);
 async function add(){
  if(disabled||busy)return;
  setBusy(true);
  try{
   const chosen=await pickFiles(false,{name:uiText("Tệp đầu vào của nút"),extensions:kind==='image'?images:kind==='pdf'?['pdf']:kind==='document'?documents:[...documents,...images]});
   const next=[...new Set([...files,...chosen])];
   if(next.length>30){notice(uiText("Mỗi nút đính kèm tối đa 30 tệp hoặc thư mục."));return;}
   if(chosen.length)onChange(next);
  }catch(e){report(e);}finally{setBusy(false);}
 }
 return <fieldset className="wf-form-set" disabled={disabled||busy}><legend>{uiText("Tệp đầu vào của nút")}</legend>
  <div className="wf-form-row"><select aria-label={uiText("Loại tệp đầu vào")} value={kind} onChange={e=>setKind(e.target.value)}>
   <option value="all">{uiText("Tài liệu, ảnh và PDF")}</option><option value="image">{uiText("Hình ảnh (PNG, JPG, WebP)")}</option><option value="pdf">PDF</option><option value="document">{uiText("Tài liệu Office và văn bản")}</option>
  </select><button type="button" onClick={()=>void add()}>{uiText("Chèn tệp đầu vào")}</button></div>
  {files.map(f=><div key={f} className="wf-form-row"><span title={f}>{f.split(/[\\/]/).pop()}</span><button type="button" aria-label={uiText("Bỏ tệp đầu vào {0}",[f])} onClick={()=>onChange(files.filter(p=>p!==f))}>×</button></div>)}
  <p className="muted small">{uiText("Tệp chỉ được đính kèm cho nút này và được đọc khi chạy nút. Ảnh được gửi kèm cho AI.")}</p>
 </fieldset>;
}
