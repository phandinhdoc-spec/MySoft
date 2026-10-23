import {t as uiText} from './i18n';
import {useEffect,useState} from 'react';
import {canSelfUpdate,checkForUpdate,dismissUpdateError,installUpdate,useUpdate} from './updater';

/** Phần trăm đã tải; undefined khi chưa biết dung lượng. */
function percent(received:number,total:number):number|undefined{return total>0?Math.min(100,Math.round(received/total*100)):undefined;}

function Progress({received,total}:{received:number;total:number}){
 const p=percent(received,total);
 return <div className="update-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}><i style={{width:`${p??35}%`}} className={p===undefined?'indeterminate':''}/></div>;
}

/** Nội dung theo từng bước: có bản mới → đang tải → đang cập nhật → đã xong. */
export function UpdateStatus({busy=false,onLater}:{busy?:boolean;onLater?:()=>void}){
 const u=useUpdate();
 if(!canSelfUpdate)return <p className="muted small">{uiText("Cập nhật tự động chỉ có trong ứng dụng PVTA đã cài.")}</p>;
 const p=percent(u.received,u.total);
 switch(u.phase){
  case 'checking':return <p className="muted small">{uiText("Đang kiểm tra bản mới…")}</p>;
  case 'none':return <><p className="muted small">{uiText("PVTA đang là bản mới nhất.")}</p><button onClick={()=>void checkForUpdate()}>{uiText("Kiểm tra lại")}</button></>;
  case 'available':return <>
   <p className="small">{u.source?<>{uiText("Cài lại từ mã nguồn mới nhất trong Terminal. Lần đầu có thể cần cài công cụ biên dịch.")}</>:<>{uiText("Có bản mới")}<strong>{u.version}</strong>.</>} {uiText("Dữ liệu và cấu hình được giữ nguyên. PVTA sẽ mở lại sau khi cài thành công.")}</p>
   {u.notes&&<details><summary>{uiText("Có gì mới")}</summary><p className="small muted" style={{whiteSpace:'pre-wrap'}}>{u.notes}</p></details>}
   <div className="row"><button className="primary" disabled={busy} title={busy?uiText("Đang có việc chạy, đợi xong rồi cập nhật."):undefined} onClick={()=>void installUpdate()}>{uiText("Cập nhật ngay")}</button>{onLater&&<button onClick={onLater}>{uiText("Để sau")}</button>}</div>
   {busy&&<p className="small muted">{uiText("Đang có việc chạy. Đợi xong rồi bấm cập nhật để không bị gián đoạn.")}</p>}
  </>;
  case 'downloading':return <><p className="small">{uiText("Đang tải bản")} {u.version}…{p!==undefined&&` ${p}%`}</p><Progress received={u.received} total={u.total}/></>;
  case 'installing':return <><p className="small">{uiText("Đang cập nhật lên bản")} {u.version}…</p><Progress received={0} total={0}/></>;
  case 'external':return <p className="small">{uiText("Đã mở bộ cài trong Terminal. Theo dõi tiến trình tại đó; PVTA sẽ đóng khi dựng xong và mở lại sau khi cài. Nếu lỗi, xem thông báo trong Terminal rồi chạy lại lệnh cài.")}</p>;
  case 'done':return <><p className="small">{uiText("Đã cập nhật xong lên bản")} {u.version}{uiText(". Đang mở lại PVTA…")}</p></>;
  case 'error':return <><p className="small danger" role="alert">{u.error}</p><div className="row"><button onClick={()=>{dismissUpdateError();void checkForUpdate();}}>{uiText("Thử lại")}</button></div></>;
  default:return <button onClick={()=>void checkForUpdate()}>{uiText("Kiểm tra cập nhật")}</button>;
 }
}

/** Thanh thông báo nhỏ ở đầu cửa sổ. Tự kiểm tra bản mới khi mở app rồi mỗi 12 giờ; chỉ hiện khi có việc cần báo. */
export function UpdateBanner({busy}:{busy:boolean}){
 const u=useUpdate();
 const [later,setLater]=useState('');
 useEffect(()=>{
  if(!canSelfUpdate)return;
  const first=setTimeout(()=>void checkForUpdate(true),6000);
  const every=setInterval(()=>void checkForUpdate(true),12*3600_000);
  return()=>{clearTimeout(first);clearInterval(every);};
 },[]);
 const show=u.phase==='downloading'||u.phase==='installing'||u.phase==='done'||u.phase==='error'||(u.phase==='available'&&later!==u.version);
 if(!show)return null;
 return <div className="update-banner" role="status"><UpdateStatus busy={busy} onLater={()=>setLater(u.version)}/></div>;
}
