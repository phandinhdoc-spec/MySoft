import {useEffect,useState} from 'react';
import {rpc,subscribe,type ViewState} from './ipc';

/** Tệp hiện trong «Tài liệu trong ngữ cảnh»: tệp đính kèm hoặc tệp của một Sổ nguồn liên kết (có trường `notebook`). */
export type ContextFile=ViewState['data']['attachments'][number]&{notebook?:{id:string;name:string;sid:string;on:boolean;state:string}};
export interface NbBookView{id:string;name:string;sources:{id:string;title:string;kind:string;origin:string;state:string;on:boolean;chars:number;addedAt:number}[]}

/** Đưa danh sách tệp của các sổ về cùng dạng với tệp đính kèm để dùng chung tìm kiếm, lọc và xem trước. Mã tệp có tiền tố sổ nên hai sổ trùng tên tệp vẫn là hai dòng khác nhau. */
export function notebookContextFiles(books:NbBookView[]):ContextFile[]{
 return books.flatMap(b=>b.sources.map(s=>({id:`nb:${b.id}:${s.id}`,name:s.title,path:s.origin,scope:'project' as const,scopeId:b.id,fingerprint:String(s.chars),at:s.addedAt,image:false,segments:[],notebook:{id:b.id,name:b.name,sid:s.id,on:s.on,state:s.state}})));
}

/** Tải (và tự làm mới khi sổ đổi) danh sách tệp của các sổ nguồn đã liên kết. Không có sổ nào thì không gọi gì. */
export function useNotebookFiles(ids:readonly string[],report?:(e:unknown)=>void):ContextFile[]{
 const key=[...new Set(ids)].join(',');const [books,setBooks]=useState<NbBookView[]>([]);
 useEffect(()=>{
  if(!key){setBooks([]);return;}
  let alive=true,off:(()=>void)|undefined;
  const load=()=>void rpc<NbBookView[]>('nb.sources',{ids:key.split(',')}).then(v=>{if(alive)setBooks(v);}).catch(e=>{if(alive)report?.(e);});
  load();
  void subscribe(e=>{if(e.event==='notebook')load();}).then(f=>{if(alive)off=f;else f();}).catch(()=>{});
  return()=>{alive=false;off?.();};
 },[key]);
 return notebookContextFiles(books);
}
