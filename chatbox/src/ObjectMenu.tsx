import {t as uiText} from './i18n';
import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './object-menu.css';
import {askHelp,helpAvailable,helpContext,helpMenuEvents,type HelpContext} from './help-context';

export type ObjectCommand={id:string;label:string;icon?:React.ReactNode;shortcut?:string;group?:string;disabledReason?:string;danger?:boolean;submenu?:React.ReactNode;run:(anchor:DOMRect)=>void|Promise<unknown>};
function Submenu({anchor,children,focus}:{anchor:HTMLElement;children:React.ReactNode;focus?:boolean}){
 const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:0,top:0});
 useEffect(()=>{if(focus)ref.current?.querySelector<HTMLElement>('[role=menuitemradio]')?.focus();},[focus]);
 useLayoutEffect(()=>{
  const place=()=>{const r=ref.current?.getBoundingClientRect(),a=anchor.getBoundingClientRect();if(!r)return;
   const left=a.right+6+r.width<=window.innerWidth-4?a.right+6:a.left-r.width-6;
   setPosition({left:Math.max(4,Math.min(left,window.innerWidth-r.width-4)),top:Math.max(4,Math.min(a.top,window.innerHeight-r.height-4))});};
  place();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(place);if(ref.current)observer?.observe(ref.current);
  return()=>observer?.disconnect();
 },[anchor]);
 return <div ref={ref} className="object-menu chat-project-picker" style={position} onKeyDown={e=>{
  const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();anchor.focus();}
 }}>{children}</div>;
}
const editable=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');

/** Both triggers resolve commands again at execution, against the current target and context. */
export function useObjectMenu<T>({contextKey,commands,onError,preserveSelection=false}:{contextKey:string;commands:(target:T)=>ObjectCommand[];onError?:(error:unknown)=>void;preserveSelection?:boolean}){
 const id=useId(),panel=useRef<HTMLDivElement>(null),locked=useRef(false);
 const current=useRef({contextKey,commands,onError});current.current={contextKey,commands,onError};
 const [opened,setOpened]=useState<{target:T;key:string;x:number;y:number;origin:Element;container:Element;help:HelpContext}|null>(null);
 const [position,setPosition]=useState({x:0,y:0});
 const [submenu,setSubmenu]=useState<{id:string;anchor:HTMLElement;focus?:boolean}|null>(null);
 const active=useRef(opened);active.current=opened;
 const close=(restore=false)=>{const origin=active.current?.origin;active.current=null;setOpened(null);setSubmenu(null);if(restore&&origin?.isConnected&&'focus' in origin)(origin as HTMLElement).focus();};
 const open=(target:T,origin:Element,x:number,y:number,source:Element=origin)=>{
  locked.current=false;setSubmenu(null);setPosition({x,y});setOpened({target,key:contextKey,x,y,origin,container:origin.closest('dialog[open]')??document.body,help:helpContext(source,x,y)});
 };
 useEffect(()=>{if(opened&&opened.key!==contextKey)close();},[contextKey,opened]);
 useLayoutEffect(()=>{
  if(!opened)return;
  const place=()=>{const r=panel.current?.getBoundingClientRect();if(r)setPosition({x:Math.max(4,Math.min(opened.x,window.innerWidth-r.width-4)),y:Math.max(4,Math.min(opened.y,window.innerHeight-r.height-4))});};
  place();panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(place);if(panel.current)observer?.observe(panel.current);
  return()=>observer?.disconnect();
 },[opened]);
 useEffect(()=>{
  if(!opened)return;
  const inside=(target:EventTarget|null)=>target instanceof Node&&!!panel.current?.contains(target);
  const outside=(e:Event)=>{if(!inside(e.target))close();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}};
  const blur=(e:FocusEvent)=>{if(!inside(e.target))close();};
  const scroll=(e:Event)=>{if(!inside(e.target))close();};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);document.addEventListener('focusin',blur);window.addEventListener('resize',outside);window.addEventListener('scroll',scroll,true);window.addEventListener('blur',outside);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);document.removeEventListener('focusin',blur);window.removeEventListener('resize',outside);window.removeEventListener('scroll',scroll,true);window.removeEventListener('blur',outside);};
 },[opened]);
 const execute=(commandId:string,anchor:DOMRect)=>{
  const value=active.current;if(!value||locked.current)return;
  const latest=current.current;if(value.key!==latest.contextKey){close();return;}
  if(commandId==='pvta-help'&&helpAvailable()){locked.current=true;close(true);askHelp(value.help);return;}
  const command=latest.commands(value.target).find(c=>c.id===commandId);if(!command||command.disabledReason)return;
  locked.current=true;close(true);
  try{void Promise.resolve(command.run(anchor)).catch(error=>latest.onError?.(error));}catch(error){latest.onError?.(error);}
 };
 const nativeSelection=(target:EventTarget|null,container:Element)=>{
  if(!preserveSelection||target instanceof Element&&target.closest('.object-menu-trigger'))return false;
  const selection=window.getSelection();return !!(selection&&!selection.isCollapsed&&selection.toString()&&selection.anchorNode&&container.contains(selection.anchorNode));
 };
 const handlers=(target:T)=>({
  onContextMenu:(e:React.MouseEvent)=>{if(editable(e.target)||nativeSelection(e.target,e.currentTarget))return;helpMenuEvents.add(e.nativeEvent);e.preventDefault();e.stopPropagation();const focus=e.target instanceof Element?e.target.closest('button,[tabindex]'):null;open(target,focus??e.currentTarget,e.clientX,e.clientY,e.target instanceof Element?e.target:e.currentTarget);},
  onKeyDown:(e:React.KeyboardEvent)=>{if(editable(e.target)||nativeSelection(e.target,e.currentTarget))return;if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();open(target,e.target as Element,r.left,r.bottom);}},
 });
 const trigger=(target:T,label:string,className='',content:React.ReactNode='⋯')=><button type="button" className={`object-menu-trigger ${className}`} aria-label={label} aria-haspopup="menu" aria-controls={opened?id:undefined} aria-expanded={!!opened&&opened.target===target} onClick={e=>{e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();open(target,e.currentTarget,r.left,r.bottom);}} {...handlers(target)}>{content}</button>;
 const items=opened&&opened.key===contextKey?[...commands(opened.target),...(helpAvailable()?[{id:'pvta-help',label:uiText('Hỏi PVTA về chỗ này'),group:'help',run:()=>askHelp(opened.help)}]:[])]:[];
 const menu=opened&&items.length?createPortal(<div ref={panel} id={id} className="object-menu" role="menu" aria-label={uiText("Thao tác đối tượng")} style={{left:position.x,top:position.y}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}} onKeyDown={e=>{
  const buttons=Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')??[]),index=buttons.indexOf(document.activeElement as HTMLElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  else if(e.key==='Tab'){close();}
 }}>{items.map((c,i)=><React.Fragment key={c.id}>{i>0&&items[i-1]?.group!==c.group&&<div role="separator"/>}<button type="button" role="menuitem" tabIndex={-1} aria-disabled={!!c.disabledReason} aria-haspopup={c.submenu?'menu':undefined} aria-expanded={c.submenu?submenu?.id===c.id:undefined} title={c.disabledReason} className={c.danger?'danger':''}
 onMouseEnter={e=>setSubmenu(c.submenu&&!c.disabledReason?{id:c.id,anchor:e.currentTarget}:null)}
 onFocus={e=>{if(submenu?.anchor!==e.currentTarget)setSubmenu(null);}}
 onKeyDown={e=>{if(c.submenu&&e.key==='ArrowRight'&&!c.disabledReason){e.preventDefault();e.stopPropagation();setSubmenu({id:c.id,anchor:e.currentTarget,focus:true});}}}
 onClick={e=>{if(c.submenu){if(!c.disabledReason)setSubmenu({id:c.id,anchor:e.currentTarget,focus:true});}else execute(c.id,e.currentTarget.getBoundingClientRect());}}><span aria-hidden="true">{c.icon}</span><span>{c.label}{c.disabledReason&&<small>{c.disabledReason}</small>}</span>{c.shortcut&&<kbd>{c.shortcut}</kbd>}{c.submenu&&<span className="object-submenu-arrow" aria-hidden="true"/>}</button></React.Fragment>)}
 {submenu&&items.find(c=>c.id===submenu.id)?.submenu&&<Submenu anchor={submenu.anchor} focus={submenu.focus}>{items.find(c=>c.id===submenu.id)!.submenu}</Submenu>}
 </div>,opened.container):null;
 return {handlers,trigger,menu,close,open};
}
