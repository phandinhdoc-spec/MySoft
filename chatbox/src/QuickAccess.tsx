import {t as uiText} from './i18n';
import React,{useState} from 'react';
import {Icon} from './Icon';
import {rpc} from './ipc';
export interface QuickItem{id:string;label:string;icon:string;run:()=>void}
export function QuickAccess({items,value,onError}:{items:QuickItem[];value?:string[];onError:(e:unknown)=>void}){
 const [editing,setEditing]=useState(false);const [error,setError]=useState('');const ids=value??[];
 const save=(next:string[])=>{setError('');void rpc('preferences',{patch:{quickAccess:next}}).catch(e=>{setError(e instanceof Error?e.message:String(e));onError(e);});};
 return <section className="quick-access" aria-label={uiText("Truy cập nhanh")}><div className="row"><strong>{uiText("Truy cập nhanh")}</strong><button title={uiText("Tùy chỉnh truy cập nhanh")} onClick={()=>setEditing(!editing)}><Icon name="edit" size={14}/></button></div>
 {ids.map((id,index)=>{const item=items.find(i=>i.id===id);return item&&<div className="row" key={id}><button className="workspace-side-row" onClick={item.run}><Icon name={item.icon} size={16}/><span>{item.label}</span></button>{editing&&<><button title={uiText("Đưa lên")} disabled={!index} onClick={()=>{const next=[...ids];[next[index-1],next[index]]=[next[index]!,next[index-1]!];save(next);}}>↑</button><button title={uiText("Bỏ ghim")} onClick={()=>save(ids.filter(x=>x!==id))}>{uiText("×")}</button></>}</div>})}
 {!ids.length&&!editing&&<small>{uiText("Ghim các công cụ thường dùng bằng nút sửa.")}</small>}
 {editing&&<label>{uiText("Thêm công cụ")}<select value="" onChange={e=>e.target.value&&save([...ids,e.target.value])}><option value="">{uiText("Chọn công cụ…")}</option>{items.filter(i=>!ids.includes(i.id)).map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</select></label>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
