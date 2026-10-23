import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './hovertip.css';
/** Keep aria-disabled buttons focusable so their explanation is available by keyboard. */
export function Tip({text,children}:{text:string;children:React.ReactElement}){
 const id=useId(),anchor=useRef<HTMLSpanElement>(null),timer=useRef<ReturnType<typeof setTimeout>>();
 const [position,setPosition]=useState<{left:number;top:number;above:boolean}>();
 function hide(){clearTimeout(timer.current);setPosition(undefined);}
 function show(){if(window.matchMedia?.('(hover: none)').matches)return;clearTimeout(timer.current);timer.current=setTimeout(()=>{const r=anchor.current?.getBoundingClientRect();if(r)setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-328)),top:r.bottom+8,above:r.bottom>window.innerHeight-170});},2000);}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')hide();};window.addEventListener('keydown',key);window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('pointerdown',hide);return()=>{clearTimeout(timer.current);window.removeEventListener('keydown',key);window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);window.removeEventListener('pointerdown',hide);};},[]);
 return <span ref={anchor} className="github-tip-anchor" onPointerEnter={e=>{if(e.pointerType!=='touch'&&!window.matchMedia?.('(hover: none)').matches)show();}} onPointerLeave={hide} onFocus={show} onBlur={hide} onClick={hide}>
  {React.cloneElement(children,{'aria-describedby':position?id:undefined})}
  {position&&createPortal(<span id={id} role="tooltip" className="github-tooltip" style={{left:position.left,top:position.above?undefined:position.top,bottom:position.above?Math.max(8,window.innerHeight-(anchor.current?.getBoundingClientRect().top??0)+8):undefined}}>{text}</span>,document.body)}
 </span>;
}
