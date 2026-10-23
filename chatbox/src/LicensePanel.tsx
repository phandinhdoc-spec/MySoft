import {t as uiText} from './i18n';
import React,{useState} from 'react';
import {rpc,type ViewState} from './ipc';
import './license.css';

type Props={state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;onState?:(s:ViewState)=>void};

/** Màn hình bắt buộc khi bản này đòi giấy phép: email + mã do người phát hành cấp (không phải mật khẩu). */
export function ActivationScreen({state,report,onState}:{state:ViewState;report:(e:unknown)=>void;onState:(s:ViewState)=>void}){
 const [email,setEmail]=useState(state.license?.email??'');const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const go=async()=>{setBusy(true);setErr('');try{onState(await rpc<ViewState>('license.activate',{email,code}));}catch(e){setErr(e instanceof Error?e.message:String(e));report(e);}finally{setBusy(false);}};
 return <div className="loading license-screen"><span className="brand-mark">✦</span><h2>{uiText("Kích hoạt PVTA")}</h2>
  <p>{uiText("Nhập email và mã kích hoạt mà người phát hành đã gửi riêng cho thầy cô. Mỗi email dùng được trên tối đa")} {state.license?.max??3} {uiText("thiết bị. Sau khi kích hoạt, PVTA dùng được cả khi không có mạng.")}</p>
  {state.license?.revoked&&<p role="alert" className="license-err">{uiText("Quyền dùng của email này đã bị thu hồi.")}</p>}
  <form onSubmit={e=>{e.preventDefault();void go();}} className="license-form">
   <label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
   <label>{uiText("Mã kích hoạt")}<input autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required/></label>
   {err&&<p role="alert" className="license-err">{err}</p>}
   <button className="primary" disabled={busy||!email.trim()||code.trim().length<6}>{busy?uiText("Đang kiểm tra…"):uiText("Kích hoạt")}</button>
  </form></div>;
}

/** Tab «Giấy phép & phản hồi» trong Cài đặt. */
export function LicenseSettings({state,report,notice,onState}:Props){
 const lic=state.license;const [kind,setKind]=useState<'loi'|'y-kien'|'khen'>('y-kien');const [text,setText]=useState('');const [shown,setShown]=useState<string>();const [busy,setBusy]=useState(false);
 const run=async(f:()=>Promise<void>)=>{setBusy(true);try{await f();}catch(e){report(e);}finally{setBusy(false);}};
 return <div className="settings-section">
  <h3>{uiText("Giấy phép")}</h3>
  {!lic?.required?<p>{uiText("Bản này không đòi kích hoạt.")}</p>:<>
   <p>Email: <strong>{lic.email??'—'}</strong> · {lic.activated?uiText("Đã kích hoạt trên máy này"):uiText("Chưa kích hoạt")} {uiText("· tối đa")} {lic.max} {uiText("thiết bị.")}</p>
   <div className="license-row">
    <button disabled={busy} onClick={()=>void run(async()=>{const s=await rpc<ViewState>('license.refresh');onState?.(s);notice(uiText("Đã kiểm tra giấy phép."));})}>{uiText("Kiểm tra lại")}</button>
    <button disabled={busy||!lic.activated} onClick={()=>{if(window.confirm(uiText("Gỡ máy này khỏi email để dùng chỗ cho máy khác? PVTA sẽ yêu cầu kích hoạt lại.")))void run(async()=>{onState?.(await rpc<ViewState>('license.deactivate'));});}}>{uiText("Gỡ máy này")}</button>
   </div></>}
  <h3>{uiText("Gửi phản hồi cho người phát hành")}</h3>
  {!lic?.feedback?<p>{uiText("Chưa cấu hình nơi nhận phản hồi.")}</p>:<>
   <p className="license-note">{uiText("PVTA che số điện thoại, email… trong nội dung và cho thầy cô xem lại trước khi gửi. Không gửi kèm hội thoại hay tệp.")}</p>
   <div className="license-row"><select value={kind} onChange={e=>{setKind(e.target.value as never);setShown(undefined);}}><option value="y-kien">{uiText("Ý kiến")}</option><option value="loi">{uiText("Báo lỗi")}</option><option value="khen">{uiText("Điều tốt")}</option></select></div>
   <textarea className="license-text" maxLength={2000} placeholder={uiText("Thầy cô muốn góp ý điều gì?")} value={text} onChange={e=>{setText(e.target.value);setShown(undefined);}}/>
   {shown===undefined?<button disabled={busy||text.trim().length<5} onClick={()=>void run(async()=>{const r=await rpc<{text:string}>('license.feedbackPreview',{text});setShown(r.text);})}>{uiText("Xem lại nội dung sẽ gửi")}</button>:<>
    <pre className="license-preview">{shown}</pre>
    <div className="license-row"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{await rpc('license.feedbackSend',{kind,text,expected:shown});setText('');setShown(undefined);notice(uiText("Đã gửi phản hồi. Cảm ơn thầy cô."));})}>{uiText("Gửi")}</button><button onClick={()=>setShown(undefined)}>{uiText("Sửa lại")}</button></div></>}
  </>}
 </div>;
}
