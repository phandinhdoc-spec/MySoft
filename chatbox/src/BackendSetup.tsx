import {t as uiText} from './i18n';
import React,{useEffect,useState} from 'react';
import {rpc,type ViewState} from './ipc';
import {clearSetup,isBusy,useSetup} from './setupStore';
type Installer={backend:string;name:string;url:string;docs:string};

/** Gói cần có của từng công cụ, theo tài liệu chính thức của nhà cung cấp (kiểm tra lần cuối 10/2026). */
const PLAN:Record<string,string>={
 claude:uiText("Cần gói Claude Pro, Max, Team hoặc Enterprise. Tài khoản Claude miễn phí không dùng được Claude Code."),
 codex:uiText("Đăng nhập bằng tài khoản ChatGPT. Gói Free dùng được nhưng hạn mức thấp; gói trả phí có hạn mức cao hơn."),
 agy:uiText("Đăng nhập bằng tài khoản Google. Hạn mức miễn phí theo tuần khá thấp và quyền dùng còn tùy tài khoản; gói Google AI Pro dùng thoải mái hơn."),
};

export function BackendSetup({state,report,notice,open}:{state:ViewState;report:(e:unknown)=>void;notice:(s:string)=>void;open:(s:string)=>void}){
 const [catalog,setCatalog]=useState<Installer[]>([]);const [checking,setChecking]=useState(false);
 const [code,setCode]=useState<Record<string,string>>({});const [device,setDevice]=useState(false);
 const setup=useSetup();
 async function load(){try{setCatalog(await rpc<Installer[]>('backendInstallers'));}catch(e){report(e);}}
 useEffect(()=>{void load();},[]);
 async function refresh(){if(checking)return;setChecking(true);try{await rpc('refresh');notice(uiText("Đã kiểm tra lại công cụ AI."));}catch(e){report(e);}finally{setChecking(false);}}
 /** Một nút: thiếu công cụ thì tự tải và cài, rồi đăng nhập. Tiến trình về qua sự kiện 'setup'. */
 async function start(id:string,terminal=false){
  clearSetup(id);
  try{await rpc('setupBackend',{backend:id,action:'setup',deviceCode:id==='codex'&&device,terminal});}catch(e){report(e);}
 }
 async function terminalFallback(id:string,installed:boolean){
  if(installed)return start(id,true);
  try{await rpc('setupBackend',{backend:id,action:'install'});notice(uiText("Đã mở bộ cài trong Terminal. Cài xong, bấm Kiểm tra lại."));}catch(e){report(e);}
 }
 async function sendCode(id:string){
  const c=(code[id]??'').trim();if(!c)return;
  try{await rpc('setupBackend',{backend:id,action:'loginCode',code:c});setCode(s=>({...s,[id]:''}));}catch(e){report(e);}
 }
 const cancel=(id:string)=>void rpc('setupBackend',{backend:id,action:'cancel'}).catch(report);
 return <div className="settings-section">
  <h3>{uiText("Cài và đăng nhập công cụ AI")}</h3>
  <p>{uiText("Bấm một nút: PVTA kiểm tra máy đã có công cụ chưa, chưa có thì tự tải bộ cài chính thức và cài, rồi mở trang đăng nhập. Không cần mở Terminal hay gõ lệnh.")}</p>
  <p className="muted">{uiText("Đây là các công cụ dùng cho PVTA: Claude Code, Codex (OpenAI) và Antigravity (Google). Thông tin đăng nhập do chính công cụ lưu trên máy bạn; PVTA không giữ mật khẩu.")}</p>
  {!catalog.length&&<button onClick={()=>void load()}>{uiText("Tải lại danh sách công cụ")}</button>}
  {catalog.map(item=>{
   const id=item.backend;const b=state.backends.find(b=>b.id===id);const ev=setup[id];const busy=isBusy(ev);
   const label=!b?.installed?uiText("Cài và đăng nhập"):b.auth==='ready'?uiText("Đăng nhập lại"):uiText("Đăng nhập");
   return <article className="backend-card" key={id}>
    <div><strong>{item.name}</strong><span className={b?.auth==='ready'?'badge success':'badge'}>{!b?.installed?uiText("Chưa cài"):b.auth==='ready'?uiText("Đã đăng nhập"):b.auth==='missing'?uiText("Cần đăng nhập"):uiText("Đã cài, chưa xác nhận đăng nhập")}</span></div>
    <small>{b?.installed&&b.version?`${b.version} · `:''}{PLAN[id]}</small>
    {id==='agy'&&<small>{uiText("Antigravity chỉ đăng nhập được trong giao diện dòng lệnh của nó, nên PVTA mở một cửa sổ Terminal cho bước này và tự nhận khi bạn đăng nhập xong.")}</small>}
    {id==='codex'&&!busy&&<label className="checkbox-row"><input type="checkbox" checked={device} onChange={e=>setDevice(e.target.checked)}/><span>{uiText("Trình duyệt không mở được? Đăng nhập bằng mã (nhập mã trên thiết bị khác)")}</span></label>}
    <div className="row">
     <button className="primary" disabled={busy} onClick={()=>void start(id)}>{busy?uiText("Đang xử lý…"):label}</button>
     <button disabled={busy} onClick={()=>void rpc('openLink',{url:item.docs}).catch(report)}>{uiText("Hướng dẫn chính thức ↗")}</button>
    </div>
    {ev&&<div className="setup-progress" role="status" aria-live="polite">
     {ev.message&&<p className={ev.phase==='failed'?'danger':''}><strong>{ev.message}</strong></p>}
     {ev.lines.length>0&&<pre className="setup-log">{ev.lines.join('\n')}</pre>}
     {ev.phase==='code'&&<div>
      <small>{uiText("Sau khi bạn đồng ý trên trang đăng nhập, trình duyệt hiện một mã. Dán mã đó vào đây.")}</small>
      <div className="row"><input aria-label={uiText("Mã đăng nhập {0}",[item.name])} placeholder={uiText("Dán mã từ trang đăng nhập")} autoComplete="off" spellCheck={false} value={code[id]??''} onChange={e=>setCode(s=>({...s,[id]:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')void sendCode(id);}}/><button className="primary" disabled={!(code[id]??'').trim()} onClick={()=>void sendCode(id)}>{uiText("Gửi mã")}</button></div>
     </div>}
     <div className="row">
      {ev.url&&busy&&<button onClick={()=>void rpc('openLink',{url:ev.url}).catch(report)}>{uiText("Mở trang đăng nhập ↗")}</button>}
      {busy&&<button onClick={()=>cancel(id)}>{uiText("Hủy")}</button>}
      {ev.phase==='failed'&&<button onClick={()=>void start(id)}>{uiText("Thử lại")}</button>}
      {ev.phase==='failed'&&<button onClick={()=>void terminalFallback(id,!!b?.installed)}>{uiText("Mở bằng Terminal")}</button>}
      {!busy&&<button onClick={()=>clearSetup(id)}>{uiText("Đóng")}</button>}
     </div>
    </div>}
   </article>;
  })}
  <div className="row"><button disabled={checking} onClick={()=>void refresh()}>{checking?uiText("Đang kiểm tra…"):uiText("Kiểm tra lại công cụ AI")}</button></div>
  <p className="muted">{uiText("Nếu máy chưa nhận công cụ vừa cài, hãy đóng và mở lại PVTA.")}</p>
  {(()=>{const oc=state.backends.find(b=>b.id==='opencode');return <article className="backend-card"><div><strong>OpenCode</strong><span className={oc?.installed?'badge success':'badge'}>{oc?.installed?uiText("Đã cài"):uiText("Chưa cài")}</span></div><small>{oc?.installed&&oc.version?`${oc.version} · `:''}{uiText("PVTA không tự cài OpenCode. Cài bằng brew install sst/tap/opencode (hoặc npm install -g opencode-ai), dùng opencode auth login để thêm nhà cung cấp, rồi bấm Kiểm tra lại. Model miễn phí của OpenCode dùng được ngay.")}</small><div className="row"><button onClick={()=>open('opencode')}>{uiText("Mở quản lí OpenCode")}</button><button onClick={()=>void rpc('openLink',{url:'https://opencode.ai/docs'}).catch(report)}>{uiText("Hướng dẫn chính thức ↗")}</button></div></article>;})()}
  <article className="backend-card"><div><strong>CommandCode / API</strong><span className="badge">{state.api.find(a=>a.id==='commandcode')?.configured?uiText("Đã lưu khóa"):uiText("Chưa cấu hình")}</span></div><small>{uiText("Kết nối bằng khóa API, không cần tải ứng dụng.")}</small><button onClick={()=>open('commandcode')}>{uiText("Mở điều khiển CommandCode")}</button></article>
 </div>;
}
