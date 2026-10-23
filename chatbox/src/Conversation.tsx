import {t as uiText} from './i18n';
import React,{useLayoutEffect,useRef,useState} from 'react';
import './conversation-navigation.css';
const positions=new Map<string,{top:number;following:boolean}>();
export function Conversation({scope,updateKey,focusTarget,children,...props}:React.HTMLAttributes<HTMLDivElement>&{scope:string;updateKey:string;focusTarget?:boolean}){
 const scroller=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),following=useRef(true),[away,setAway]=useState(false);
 const measure=()=>{const el=scroller.current;if(!el)return;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;setAway(!following.current);positions.set(scope,{top:el.scrollTop,following:following.current});};
 const latest=()=>{const el=scroller.current;if(!el)return;following.current=true;el.scrollTo({top:el.scrollHeight,behavior:'smooth'});setAway(false);};
 useLayoutEffect(()=>{
  const el=scroller.current;if(!el)return;const old=positions.get(scope);following.current=old?.following??true;
  if(!focusTarget)el.scrollTop=following.current?el.scrollHeight:old?.top??0;
  setAway(!following.current);
  return()=>{positions.set(scope,{top:el.scrollTop,following:following.current});if(positions.size>100)positions.delete(positions.keys().next().value!);};
 },[scope]);
 useLayoutEffect(()=>{const el=scroller.current;if(el&&following.current&&!focusTarget)el.scrollTop=el.scrollHeight;},[updateKey,focusTarget]);
 useLayoutEffect(()=>{
  if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(()=>{const el=scroller.current;if(el&&following.current&&!focusTarget)el.scrollTop=el.scrollHeight;});
  if(content.current)observer.observe(content.current);return()=>observer.disconnect();
 },[scope,focusTarget]);
 return <div className="conversation-shell"><div {...props} className="conversation" ref={scroller} onScroll={measure}><div ref={content}>{children}</div></div>{away&&<button type="button" className="jump-latest" onClick={latest} title={uiText("Về tin nhắn mới nhất")} aria-label={uiText("Về tin nhắn mới nhất")}>{uiText("↓ Tin nhắn mới nhất")}</button>}</div>;
}
