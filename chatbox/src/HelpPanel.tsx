import {t as uiText} from './i18n';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {HELP_GROUPS,HELP_SECTIONS,type Block} from './helpData';
import {helpBrain,fold,titleOf,type Entry} from './help-brain';
import {Icon} from './Icon';
import {version} from '../package.json';
import './help.css';

/**
 * Hướng dẫn sử dụng có mục lục và tra cứu.
 * Cách làm nhẹ: thành phần này và dữ liệu `helpData` nằm trong một gói riêng, chỉ tải khi thầy cô mở hướng dẫn;
 * dùng chung chỉ mục Brain hướng dẫn với cửa sổ Hỏi PVTA.
 */

function Mark({s,tokens}:{s:string;tokens:string[]}){
 const f=fold(s),hit=new Uint8Array(s.length);
 for(const t of tokens){let i=f.indexOf(t);while(i>=0){hit.fill(1,i,i+t.length);i=f.indexOf(t,i+t.length);}}
 const out:React.ReactNode[]=[];
 for(let i=0;i<s.length;){let j=i;const h=hit[i];while(j<s.length&&hit[j]===h)j++;out.push(h?<mark key={i}>{s.slice(i,j)}</mark>:s.slice(i,j));i=j;}
 return <>{out}</>;
}
function snippet(e:Entry,pos:number){
 if(pos<0)return e.text.slice(0,120);
 const start=Math.max(0,pos-40);
 return (start>0?'…':'')+e.text.slice(start,start+130)+(start+130<e.text.length?'…':'');
}

function Inline({t,go}:{t:string;go:(id:string)=>void}){
 return <>{t.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\[[a-z0-9-]+\]\])/).map((p,i)=>{
  if(p.startsWith('**'))return <strong key={i}>{p.slice(2,-2)}</strong>;
  if(p.startsWith('`'))return <code key={i}>{p.slice(1,-1)}</code>;
  if(p.startsWith('[['))return <button key={i} type="button" className="help-link" onClick={()=>go(p.slice(2,-2))}>{titleOf(p.slice(2,-2))}</button>;
  return p;
 })}</>;
}
function Blocks({body,go}:{body:Block[];go:(id:string)=>void}){
 return <>{body.map((b,i)=>{
  switch(b[0]){
   case 'p':return <p key={i}><Inline t={b[1]} go={go}/></p>;
   case 'tip':return <p key={i} className="help-tip"><Inline t={b[1]} go={go}/></p>;
   case 'ul':return <ul key={i}>{b[1].map((x,n)=><li key={n}><Inline t={x} go={go}/></li>)}</ul>;
   case 'ol':return <ol key={i}>{b[1].map((x,n)=><li key={n}><Inline t={x} go={go}/></li>)}</ol>;
   case 'keys':return <dl key={i} className="help-keys">{b[1].map(([k,d])=><React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd><Inline t={d} go={go}/></dd></React.Fragment>)}</dl>;
  }
 })}</>;
}

export default function HelpPanel({topic,onClose}:{topic:string;onClose:() => void}){
 const [id,setId]=useState(HELP_SECTIONS.some(s=>s.id===topic)?topic:HELP_SECTIONS[0]!.id);
 const [q,setQ]=useState('');
 const index=useMemo(helpBrain,[]);
 const tokens=useMemo(()=>fold(q).split(/\s+/).filter(Boolean),[q]);
 const results=useMemo(()=>index.search(q,HELP_SECTIONS.length),[index,q]);
 const root=useRef<HTMLElement>(null),body=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const at=Math.max(0,HELP_SECTIONS.findIndex(s=>s.id===id));
 const cur=HELP_SECTIONS[at]!,prev=HELP_SECTIONS[at-1],next=HELP_SECTIONS[at+1];
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;input.current?.focus();return()=>before?.focus?.();},[]);
 useEffect(()=>{body.current?.scrollTo({top:0});},[id]);
 const link=(to:string)=>{setQ('');setId(to);};
 function keys(e:React.KeyboardEvent){
  if(e.key==='Escape'){e.stopPropagation();if(q)setQ('');else onClose();return;}
  if(e.key==='Tab'){
   const nodes=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input');
   if(!nodes?.length)return;
   const first=nodes[0]!,last=nodes[nodes.length-1]!;
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
 }
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section ref={root} className="help-dialog" role="dialog" aria-modal="true" aria-label={uiText("Hướng dẫn sử dụng PVTA")} onKeyDown={keys}>
   <header><div className="help-title"><span className="help-mark"><Icon name="help"/></span><h2>{uiText("Hướng dẫn sử dụng PVTA")}</h2></div><span className="help-version">PVTA v{version}</span><button type="button" aria-label={uiText("Đóng hướng dẫn")} onClick={onClose}>{uiText("×")}</button></header>
   <div className="help-layout">
    <nav className="help-side" aria-label={uiText("Mục lục hướng dẫn")}>
     <div className="help-search"><input ref={input} type="search" value={q} placeholder={uiText("Tra cứu: ví dụ “plan”, “khóa api”…")} aria-label={uiText("Tra cứu trong hướng dẫn")} autoComplete="off" spellCheck={false} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0])setId(results[0].e.s.id);}}/></div>
     <div className="help-toc">
      {q.trim()?<>
       <h3>{results.length?uiText("{0} mục phù hợp",[results.length]):uiText("Không có mục phù hợp")}</h3>
       {results.map(({e,pos})=><button key={e.s.id} type="button" className={e.s.id===id?'on':''} aria-current={e.s.id===id?'true':undefined} onClick={()=>setId(e.s.id)}><Mark s={e.s.title} tokens={tokens}/><small><Mark s={snippet(e,pos)} tokens={tokens}/></small></button>)}
       {!results.length&&<p className="help-empty">{uiText("Thử gõ ít từ hơn hoặc từ khác, ví dụ “word”, “dự án”, “sao lưu”. Gõ không dấu cũng được.")}</p>}
      </>:HELP_GROUPS.map(g=><div key={g}><h3>{g}</h3>{HELP_SECTIONS.filter(s=>s.group===g).map(s=><button key={s.id} type="button" className={s.id===id?'on':''} aria-current={s.id===id?'true':undefined} onClick={()=>setId(s.id)}>{s.title}</button>)}</div>)}
     </div>
    </nav>
    <article ref={body} className="help-body" aria-live="polite">
     <div className="help-running-head"><span>PVTA · {uiText('Sách hướng dẫn')}</span><span>{cur.group}</span></div>
     <span className="help-chapter">{uiText('Chương')} {String(at+1).padStart(2,'0')}</span>
     <h1>{cur.title}</h1>
     <Blocks body={cur.body} go={link}/>
     <footer className="help-pager">
      {prev?<button type="button" onClick={()=>setId(prev.id)}>← {prev.title}</button>:<span/>}
      <span className="help-page-number">{at+1} / {HELP_SECTIONS.length}</span>
      {next?<button type="button" onClick={()=>setId(next.id)}>{next.title} →</button>:<span/>}
     </footer>
    </article>
   </div>
  </section>
 </div>;
}
