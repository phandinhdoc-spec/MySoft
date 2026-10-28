import {t as uiText} from './i18n';
import {useEffect,useRef,useState} from 'react';
import {Channel,invoke} from '@tauri-apps/api/core';
import {createOutputDecoder} from './terminal-output';
import './terminal.css';

type Output={kind:'data';bytes:number[];stream:'stdout'|'stderr'}|{kind:'exit';code:number|null};
let lifecycle:Promise<unknown>=Promise.resolve();

export function TerminalPanel({visible,cwd,onHide,onClose}:{visible:boolean;cwd?:string;onHide:()=>void;onClose:()=>void}){
 const input=useRef<HTMLTextAreaElement>(null),log=useRef<HTMLPreElement>(null);
 const session=useRef(''),ready=useRef(false),sending=useRef(false),composing=useRef(false),compositionEnded=useRef(0);
 const startDir=useRef(cwd),alive=useRef(true),followOutput=useRef(true);
 const [draft,setDraft]=useState(''),[transcript,setTranscript]=useState(''),[error,setError]=useState('');
 const [status,setStatus]=useState<'starting'|'ready'|'ended'>('starting');
 const [generation,setGeneration]=useState(0),[large,setLarge]=useState(false),[height,setHeight]=useState(320),[pending,setPending]=useState(false);
 const append=(text:string)=>setTranscript(value=>(value+text).slice(-200_000));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  let disposed=false,exited=false;
  const id=crypto.randomUUID();session.current=id;ready.current=false;
  const decoders={stdout:createOutputDecoder(),stderr:createOutputDecoder()};
  setError('');setStatus('starting');
  const output=new Channel<Output>();
  output.onmessage=event=>{
   if(disposed)return;
   if(event.kind==='data')append(decoders[event.stream].write(new Uint8Array(event.bytes)));
   else{
    append(decoders.stdout.finish()+decoders.stderr.finish()+`\n[${uiText('Phiên đã kết thúc')}${event.code===null?'':`: ${event.code}`}]\n`);
    exited=true;ready.current=false;setStatus('ended');
   }
  };
  lifecycle=lifecycle.catch(()=>{}).then(async()=>{
   if(disposed)return;
   try{
    await invoke('terminal_open',{id,cwd:startDir.current??null,output});
    if(!disposed&&!exited){ready.current=true;setStatus('ready');}
   }catch(e){if(!disposed){setError(String(e));setStatus('ended');}}
  });
  return()=>{
   disposed=true;ready.current=false;
   lifecycle=lifecycle.catch(()=>{}).then(()=>invoke('terminal_close',{id})).catch(()=>{});
  };
 },[generation]);
 useEffect(()=>{if(visible&&status==='ready')input.current?.focus();},[visible,status]);
 useEffect(()=>{if(visible&&followOutput.current&&log.current)log.current.scrollTop=log.current.scrollHeight;},[transcript,visible]);

 async function send(){
  if(!ready.current||sending.current||composing.current)return;
  const text=input.current?.value??draft,id=session.current;
  if(!text.length)return;
  sending.current=true;setPending(true);setError('');
  try{
   // Preserve spaces, quotes, Unicode and newlines; only add the submit newline.
   await invoke('terminal_write',{id,data:text.endsWith('\n')?text:text+'\n'});
   if(alive.current&&session.current===id){append(`\n❯ ${text}\n`);setDraft(value=>value===text?'':value);}
  }catch(e){if(alive.current&&session.current===id)setError(String(e));}
  finally{sending.current=false;if(alive.current){setPending(false);input.current?.focus();}}
 }
 async function stop(){
  const id=session.current;ready.current=false;
  try{await invoke('terminal_close',{id});if(alive.current&&session.current===id){setStatus('ended');append(`\n[${uiText('Đã dừng phiên')}]\n`);}}
  catch(e){if(alive.current){setError(String(e));setStatus('ended');}}
 }
 return <section className={`embedded-terminal ${large?'terminal-large':''}`} hidden={!visible} style={{height}} aria-label={uiText('Terminal — soạn lệnh')} onKeyDown={e=>e.stopPropagation()}>
  <div className="terminal-resizer" role="separator" aria-label={uiText('Thay đổi chiều cao terminal')} aria-orientation="horizontal" tabIndex={0} aria-valuemin={200} aria-valuemax={600} aria-valuenow={height}
   onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(h=>Math.max(200,Math.min(600,h+(e.key==='ArrowUp'?20:-20))));}}}
   onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)}
   onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){setLarge(false);setHeight(Math.max(200,Math.min(600,e.currentTarget.parentElement!.getBoundingClientRect().bottom-e.clientY)));}}}
   onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>
  <header><strong>Terminal</strong><span title={startDir.current}>{startDir.current??uiText('Thư mục cá nhân')}</span>
   <button onClick={()=>setTranscript('')}>{uiText('Xóa kết quả')}</button>
   {status==='ended'?<button onClick={()=>{startDir.current=cwd;setGeneration(g=>g+1);}}>{uiText('Phiên mới')}</button>:<button disabled={status!=='ready'} onClick={()=>void stop()}>{uiText('Dừng phiên')}</button>}
   <button title={large?uiText('Thu nhỏ'):uiText('Phóng lớn')} onClick={()=>setLarge(v=>!v)}>{large?'↙':'↗'}</button>
   <button title={uiText('Ẩn cửa sổ, giữ phiên đang chạy')} onClick={onHide}>−</button>
   <button title={uiText('Đóng và dừng phiên')} onClick={onClose}>×</button>
  </header>
  {error&&<div role="alert" className="terminal-error">{error}</div>}
  <pre ref={log} className="terminal-output" aria-label={uiText('Kết quả lệnh')} tabIndex={0} onScroll={e=>{const el=e.currentTarget;followOutput.current=el.scrollHeight-el.scrollTop-el.clientHeight<40;}}>{transcript||uiText('Kết quả lệnh sẽ xuất hiện tại đây.')}</pre>
  <div className="terminal-composer">
   <textarea ref={input} value={draft} onChange={e=>setDraft(e.target.value)} aria-label={uiText('Soạn lệnh terminal')} placeholder={uiText('Nhập lệnh hoặc nội dung cần gửi…')} spellCheck={false} autoCorrect="off" autoCapitalize="off"
    onCompositionStart={()=>{composing.current=true;}}
    onCompositionEnd={()=>{composing.current=false;compositionEnded.current=Date.now();}}
    onKeyDown={e=>{
     if(e.key==='Enter'&&!e.shiftKey){
      if(composing.current||e.nativeEvent.isComposing||e.keyCode===229||Date.now()-compositionEnded.current<50)return;
      e.preventDefault();void send();
     }
    }}/>
   <button disabled={status!=='ready'||pending||!draft.length} onClick={()=>void send()}>{pending?uiText('Đang gửi…'):uiText('Gửi')}</button>
  </div>
  <footer>{status==='starting'?uiText('Đang mở phiên…'):status==='ended'?uiText('Phiên đã kết thúc. Có thể mở phiên mới.'):uiText('Enter để gửi · Shift+Enter xuống dòng')}</footer>
 </section>;
}
