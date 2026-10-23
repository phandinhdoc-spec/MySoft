import {useEffect,useState} from 'react';
import type {OfficeHost} from '@pvta/shared';
import {readSelection} from './office/selection';
import {currentDocName} from './util';
export function DocumentContext({host,files,ready,onRefresh}:{host:OfficeHost;files:string[];ready:boolean;onRefresh:()=>void}){
 const [selection,setSelection]=useState('');const [name,setName]=useState(currentDocName());
 useEffect(()=>{let alive=true;let reading=false;const refresh=async()=>{if(reading||document.hidden)return;reading=true;try{const s=await readSelection(host);if(alive){setName(currentDocName());setSelection(s.cells?`${s.cells.rows} hàng × ${s.cells.cols} cột đang chọn`:s.text.trim()?`Đang chọn ${s.text.length.toLocaleString()} ký tự`:'Chưa chọn đoạn nội dung');}}catch{if(alive)setSelection('Chọn nội dung trong tài liệu để PVTA hỗ trợ');}finally{reading=false;}};void refresh();const timer=setInterval(()=>void refresh(),8000);window.addEventListener('focus',refresh);return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};},[host]);
 return <details className="document-context"><summary><span className="document-symbol">{host==='word'?'W':host==='excel'?'X':'P'}</span><span><strong>{name??'Tài liệu chưa lưu'}</strong><small>{selection||'Đang nhận diện tài liệu…'}</small></span><span className="context-chevron">⌄</span></summary><div className="document-sources"><p>{ready?'Đã có chỉ mục để tra cứu tài liệu.':'Chưa có chỉ mục tra cứu toàn bộ tài liệu.'}</p>{files.length>0&&<><strong>{files.length} tệp tham khảo</strong><ul>{files.map((f,i)=><li key={i}>{f}</li>)}</ul></>}<button onClick={onRefresh}>Cập nhật nguồn</button></div></details>;
}
