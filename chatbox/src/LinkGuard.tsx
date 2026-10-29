import {t as uiText} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {rpc} from './ipc';

let ask:(url:string)=>void=()=>{};
/** Hỏi người dùng rồi mới mở liên kết web bằng trình duyệt của máy. Dùng cho mọi chỗ cần mở liên kết. */
export function askOpenLink(url:string){if(/^https?:\/\//i.test(url))ask(url);}

/**
 * Chặn mọi nhấp vào liên kết http(s) trong ứng dụng (Markdown, bảng văn bản, thẻ kết quả…),
 * hỏi một lần "Mở liên kết trong trình duyệt?" và chỉ mở khi người dùng đồng ý.
 */
export function LinkGuard({report}:{report:(e:unknown)=>void}){
 const [url,setUrl]=useState('');const [busy,setBusy]=useState(false);const ref=useRef<HTMLElement>(null);
 useEffect(()=>{
  ask=setUrl;
  const onClick=(e:MouseEvent)=>{
   const a=(e.target as HTMLElement|null)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!a)return;
   if(a.classList.contains('pvta-file-ref')||a.dataset.pvtaFileRef)return;
   const rawHref=a.getAttribute('href')||'';if(!/^https?:\/\//i.test(rawHref))return;
   const href=a.href||rawHref;
   e.preventDefault();e.stopPropagation();setUrl(href);
  };
  document.addEventListener('click',onClick,true);document.addEventListener('auxclick',onClick,true);
  return()=>{document.removeEventListener('click',onClick,true);document.removeEventListener('auxclick',onClick,true);ask=()=>{};};
 },[]);
 useEffect(()=>{if(url)ref.current?.querySelector<HTMLElement>('button.primary')?.focus();},[url]);
 if(!url)return null;
 const close=()=>{if(!busy)setUrl('');};
 const open=async()=>{setBusy(true);try{await rpc('openLink',{url});setUrl('');}catch(e){setUrl('');report(e);}finally{setBusy(false);}};
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
  <section ref={ref} className="modal link-guard" role="alertdialog" aria-modal="true" aria-label={uiText("Mở liên kết")} onKeyDown={e=>{if(e.key==='Escape')close();}}>
   <header><h2>{uiText("Mở liên kết trong trình duyệt?")}</h2><button aria-label={uiText("Đóng")} onClick={close}>{uiText("×")}</button></header>
   <div className="modal-body"><p className="link-guard-url" title={url}>{url}</p><p className="muted small">{uiText("Trang web được mở bằng trình duyệt của máy, ngoài PVTA.")}</p>
    <div className="modal-actions"><button onClick={close} disabled={busy}>{uiText("Không mở")}</button><button className="primary" onClick={()=>void open()} disabled={busy}>{uiText("Mở trong trình duyệt")}</button></div></div>
  </section></div>;
}
