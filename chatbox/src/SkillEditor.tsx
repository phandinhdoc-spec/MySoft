import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {rpc} from './ipc';
import {Markdown} from './Markdown';
interface Detail{name:string;text:string;revision:string;bundled:boolean;backups:{id:string;at:number}[];backupId?:string}
export function SkillEditor({name,report,notice,requestEdit=false}:{requestEdit?:boolean;name:string;report:(e:unknown)=>void;notice:(message:string)=>void}){
 const learned=name.startsWith('learned-');
 const [detail,setDetail]=useState<Detail>();const [edit,setEdit]=useState(false);const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [backup,setBackup]=useState('');
 const generation=useRef(0),locked=useRef(false);
 const acceptEdit=(d:Detail)=>{
  if(!d.backupId||!d.backups.some(b=>b.id===d.backupId))throw Error(uiText("Chưa tạo được backup. Không thể mở chế độ sửa."));
  setDetail(d);setText(d.text);setBackup(d.backupId);setEdit(true);
 };
 useEffect(()=>{const token=++generation.current;setDetail(undefined);setEdit(false);setBackup('');setBusy(true);locked.current=true;
  void rpc<Detail>('skillDetail',{name}).then(async d=>{
   if(token!==generation.current)return;setDetail(d);setBackup(d.backups[0]?.id??'');
   if(requestEdit&&!learned){const next=await rpc<Detail>('beginSkillEdit',{name});if(token!==generation.current)return;
    acceptEdit(next);notice(uiText("Đã tạo backup trước khi sửa."));}
  }).catch(e=>{if(token===generation.current)report(e);}).finally(()=>{if(token===generation.current){locked.current=false;setBusy(false);}});
  return()=>{generation.current++;};
 },[name,requestEdit]);
 async function act(method:string,params:Record<string,unknown>,editing=false){
  if(locked.current)return;locked.current=true;const token=generation.current;
  setBusy(true);try{const d=await rpc<Detail>(method,{name,...params});if(token!==generation.current)return;
   if(editing)acceptEdit(d);else{setDetail(d);setText(d.text);setEdit(false);setBackup(d.backups[0]?.id??'');}notice(method==='beginSkillEdit'?uiText("Đã tạo backup trước khi sửa."):method==='restoreSkillBackup'?uiText("Đã khôi phục backup; bản trước khi khôi phục cũng được giữ lại."):uiText("Đã lưu skill."));
  }catch(e){if(token===generation.current)report(e);}finally{if(token===generation.current){locked.current=false;setBusy(false);}}
 }
 if(!detail)return <p role="status">{uiText("Đang đọc skill…")}</p>;
 return <section aria-label={uiText("Nội dung skill {0}",[name])}>
  <p className="muted">{learned?uiText("Skill tự học: chỉnh sửa qua Biên tập nền, rồi duyệt đề xuất trong Những điều đã học."):detail.bundled?uiText("Skill đóng gói cùng PVTA. Bản bạn sửa được giữ khi cập nhật phần mềm."):uiText("Skill lưu trên máy.")} {!learned&&uiText("Bấm Sửa để tạo backup và bắt đầu chỉnh nội dung.")}</p>
  {edit?<label>{uiText("Nội dung SKILL.md")}<textarea aria-label={uiText("Nội dung SKILL.md")} className="editor" value={text} disabled={busy} onChange={e=>setText(e.target.value)}/></label>:<Markdown text={detail.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/,'')}/>}
  <div className="row">{!learned&&(edit?<><button disabled={busy||text===detail.text} onClick={()=>void act('saveSkillEdit',{backupId:detail.backupId,text})}>{uiText("Lưu thay đổi")}</button><button disabled={busy} onClick={()=>{setEdit(false);setText(detail.text);}}>{uiText("Hủy sửa")}</button></>:<button disabled={busy} onClick={()=>void act('beginSkillEdit',{},true)}>{uiText("Sửa")}</button>)}</div>
  {!learned&&!!detail.backups.length&&<div className="row"><label>{uiText("Bản backup")}<select aria-label={uiText("Bản backup")} value={backup} disabled={busy||edit} onChange={e=>setBackup(e.target.value)}>{detail.backups.map(b=><option key={b.id} value={b.id}>{new Date(b.at).toLocaleString('vi-VN')} · {b.id.slice(-6)}</option>)}</select></label><button disabled={busy||edit||!backup} onClick={()=>void act('restoreSkillBackup',{backupId:backup,revision:detail.revision})}>{uiText("Khôi phục backup")}</button></div>}
 </section>;
}
