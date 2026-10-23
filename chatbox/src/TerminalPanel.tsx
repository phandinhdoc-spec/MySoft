import {t as uiText} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Channel,invoke} from '@tauri-apps/api/core';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

type Output={kind:'data';bytes:number[]}|{kind:'exit'};
// Serialize creation/disposal, including React StrictMode's effect replay.
let lifecycle:Promise<unknown>=Promise.resolve();
export function TerminalPanel({visible,cwd,onHide,onClose}:{visible:boolean;cwd?:string;onHide:()=>void;onClose:()=>void}){
 const host=useRef<HTMLDivElement>(null);
 const fitRef=useRef<()=>void>();
 const [error,setError]=useState('');
 const [ended,setEnded]=useState(false);
 const [generation,setGeneration]=useState(0);
 const [large,setLarge]=useState(false);
 const [height,setHeight]=useState(280);
 // A running shell retains its directory even when switching projects.
 const startDir=useRef(cwd);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  let disposed=false,ready=false,exited=false;
  const id=crypto.randomUUID();
  const term=new Terminal({cursorBlink:true,fontSize:13,fontFamily:'Menlo, Consolas, monospace',scrollback:5000,theme:{background:'#111827',foreground:'#e5e7eb'}});
  const fit=new FitAddon();term.loadAddon(fit);term.open(element);
  const fail=(e:unknown)=>{if(!disposed)setError(String(e));};
  const resize=()=>{if(disposed||!element.clientWidth||!element.clientHeight)return;fit.fit();if(ready)void invoke('terminal_resize',{id,cols:term.cols,rows:term.rows}).catch(fail);};
  fitRef.current=()=>{resize();term.focus();};
  const observer=new ResizeObserver(resize);observer.observe(element);
  let writes=Promise.resolve();
  const input=term.onData(data=>{if(ready)writes=writes.then(()=>invoke<void>('terminal_write',{id,data})).catch(fail);});
  const output=new Channel<Output>();
  output.onmessage=event=>{if(disposed)return;if(event.kind==='data')term.write(new Uint8Array(event.bytes));else{exited=true;ready=false;setEnded(true);term.write('\r\n[Phiên terminal đã kết thúc]\r\n');}};
  setError('');setEnded(false);
  lifecycle=lifecycle.catch(()=>{}).then(async()=>{
   if(disposed)return;
   resize();
   try{await invoke('terminal_open',{id,cwd:startDir.current??null,cols:term.cols,rows:term.rows,output});ready=!exited;if(!disposed){resize();term.focus();}}
   catch(e){fail(e);}
  });
  return()=>{
   disposed=true;ready=false;observer.disconnect();input.dispose();term.dispose();fitRef.current=undefined;
   lifecycle=lifecycle.catch(()=>{}).then(()=>invoke('terminal_close',{id})).catch(()=>{});
  };
 },[generation]);
 useEffect(()=>{if(visible){const frame=requestAnimationFrame(()=>fitRef.current?.());return()=>cancelAnimationFrame(frame);}},[visible,large]);
 return <section className={`embedded-terminal ${large?'terminal-large':''}`} hidden={!visible} style={{height}} aria-label={uiText("Terminal tích hợp")} onKeyDown={e=>e.stopPropagation()}>
  <div className="terminal-resizer" role="separator" aria-label={uiText("Thay đổi chiều cao terminal")} aria-orientation="horizontal" tabIndex={0} aria-valuemin={160} aria-valuemax={600} aria-valuenow={height}
   onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(h=>Math.max(160,Math.min(600,h+(e.key==='ArrowUp'?20:-20))));}}}
   onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){setLarge(false);setHeight(Math.max(160,Math.min(600,e.currentTarget.parentElement!.getBoundingClientRect().bottom-e.clientY)));}}}
   onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>
  <header><strong>Terminal</strong><span title={startDir.current}>{startDir.current??uiText("Thư mục cá nhân")}</span>
   {ended&&<button onClick={()=>{startDir.current=cwd;setGeneration(g=>g+1);}}>{uiText("Phiên mới")}</button>}
   <button title={large?uiText("Thu nhỏ"):uiText("Phóng lớn")} onClick={()=>setLarge(v=>!v)}>{large?'↙':'↗'}</button>
   <button title={uiText("Ẩn terminal, giữ phiên đang chạy")} onClick={onHide}>−</button>
   <button title={uiText("Kết thúc phiên terminal")} onClick={onClose}>{uiText("×")}</button></header>
  {error&&<div role="alert" className="terminal-error">{error}<button onClick={()=>setGeneration(g=>g+1)}>{uiText("Thử lại")}</button></div>}
  <div ref={host} className="terminal-host"/>
 </section>;
}
