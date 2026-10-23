import {t as uiText} from './i18n';
import React,{useEffect,useState} from 'react';
import {rpc,subscribe} from './ipc';

type Item={id:string;name:string;sources:number};
/** Chọn các Sổ nguồn liên kết với một dự án, hội thoại hoặc quy trình. Lưu ngay khi tích chọn. */
export function LinkedNotebooks({scope,id,ids,report,compact}:{scope:'project'|'chat'|'workflow';id?:string;ids?:string[];report:(e:unknown)=>void;compact?:boolean}){
 const [items,setItems]=useState<Item[]>([]);const [busy,setBusy]=useState(false);const [local,setLocal]=useState<string[]>();
 useEffect(()=>{let alive=true,off:(()=>void)|undefined;const load=()=>void rpc<Item[]>('nb.list').then(v=>{if(alive)setItems(v);}).catch(report);load();
  void subscribe(e=>{if(e.event==='notebook')load();}).then(f=>{if(alive)off=f;else f();}).catch(()=>{});return()=>{alive=false;off?.();};},[report]);
 useEffect(()=>setLocal(undefined),[id,ids?.join(',')]);
 const current=local??ids??[];
 async function toggle(nb:string){if(!id||busy)return;const next=current.includes(nb)?current.filter(x=>x!==nb):[...current,nb];setBusy(true);setLocal(next);
  try{await rpc('setNotebookLinks',{scope,id,notebookIds:next});}catch(e){setLocal(undefined);report(e);}finally{setBusy(false);}}
 if(!id)return <p className="muted">{uiText("Lưu dự án trước rồi mới liên kết Sổ nguồn.")}</p>;
 return <fieldset className={'linked-notebooks'+(compact?' compact':'')} disabled={busy}><legend>{uiText("Sổ nguồn liên kết")}</legend>
  {items.length?items.map(nb=><label key={nb.id}><input type="checkbox" checked={current.includes(nb.id)} onChange={()=>void toggle(nb.id)}/> {nb.name} <small>({uiText("{0} nguồn",[nb.sources])})</small></label>):<small>{uiText("Chưa có Sổ nguồn. Tạo ở mục Sổ nguồn rồi quay lại liên kết.")}</small>}
  {!!items.length&&<small>{uiText("PVTA chỉ lấy các đoạn liên quan đến câu hỏi từ sổ đã tích, không gửi toàn bộ nguồn.")}</small>}</fieldset>;
}
