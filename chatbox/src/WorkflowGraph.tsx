import {t as uiText} from './i18n';
import React,{useState,useRef,useEffect,useLayoutEffect,useId} from 'react';
import {clampZoom,stepZoom,wheelFactor,scrollAfterZoom,fitZoom,zoomLabel,readZoom,ejectOutside,WORKFLOW_MARGIN} from './workflow-zoom';
import {useObjectMenu,type ObjectCommand} from './ObjectMenu';
import {layoutWorkflow} from './workflow-graph';
import {linkTone,routeLink,linkPath,arrangeLink,borderPoint,type Point} from './workflow-links';
import type {SuggestedLink,WorkflowFrame} from '../../core/src/desktop/types';
import {stepIdsFromNumbers,validateFrames} from '../../core/src/desktop/workflow-frames';
import {parseDeclarations} from '../../core/src/desktop/workflow-vars';
import {WfGlyph,ToolButton,Badge} from './WorkflowToolkit';
import {reviewSnapshot,subscribeReview} from './workflow-prompt-review';
type Side='left'|'right'|'top'|'bottom';
type Port={id:string;node:string;side:Side;offset?:number};
type Ports={ports:Port[];links:Record<string,{from:string;to:string;via?:Point}>};
type Node={id:string;name:string;dependsOn?:string[];status?:string;/** Vừa chèn từ mẫu, chưa lưu: đổi màu khung. */ fresh?:boolean};
const NODE_W=230;
export function WorkflowGraph({nodes,disabled,onSelect,onDependencies,renderAction,onAdd,storageKey,maxSteps=20,nodeCommands,frames,onFrames,suggested,onResolveLink}:{maxSteps?:number;frames?:WorkflowFrame[];onFrames?:(frames:WorkflowFrame[])=>void;suggested?:SuggestedLink[];onResolveLink?:(id:string,accept:boolean)=>void;nodeCommands?:(id:string)=>ObjectCommand[];storageKey?:string;nodes:Node[];disabled:boolean;onSelect:(id:string)=>void;onDependencies:(id:string,dependencies:string[],also?:Record<string,string[]>)=>void;renderAction:(id:string)=>React.ReactNode;onAdd:()=>void}){
 const arrowId=useId();
 const graph=layoutWorkflow(nodes.map(n=>({...n,prompt:'',choice:'auto',access:'read'})));
 const [source,setSource]=useState(''),[sourcePort,setSourcePort]=useState('');
 const [points,setPoints]=useState<Ports>(()=>{try{const p=JSON.parse(localStorage.getItem((storageKey??'')+':ports')??'null');if(p&&Array.isArray(p.ports)&&p.ports.every((v:any)=>typeof v.id==='string'&&typeof v.node==='string'&&['left','right','top','bottom'].includes(v.side)&&(v.offset===undefined||(Number.isFinite(v.offset)&&v.offset>=0&&v.offset<=1)))&&p.links&&typeof p.links==='object'&&Object.values(p.links).every((l:any)=>l&&typeof l.from==='string'&&typeof l.to==='string'&&(!l.via||(Number.isFinite(l.via.x)&&Number.isFinite(l.via.y)))))return p;}catch{}return {ports:[],links:{}};});
 const [selectedEdge,setSelectedEdge]=useState('');
 const [sizes,setSizes]=useState<Record<string,number>>({});
 const cards=useRef(new Map<string,HTMLDivElement>());
 useEffect(()=>{if(storageKey)try{localStorage.setItem(storageKey+':ports',JSON.stringify(points));}catch{}},[points,storageKey]);
 useEffect(()=>{const measure=()=>setSizes(old=>{const next=Object.fromEntries([...cards.current].map(([id,el])=>[id,el.offsetHeight||240]));return JSON.stringify(next)===JSON.stringify(old)?old:next;});measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);cards.current.forEach(el=>observer.observe(el));return()=>observer.disconnect();},[nodes]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSource('');setSourcePort('');setError('');}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
 const edgeKey=(from:string,to:string)=>JSON.stringify([from,to]);
 const allPorts=[...points.ports.filter(p=>nodes.some(n=>n.id===p.node))];
 const links=graph.edges.map(({from,to})=>{const saved=points.links[edgeKey(from.id,to.id)];let a=allPorts.find(p=>p.id===saved?.from&&p.node===from.id),b=allPorts.find(p=>p.id===saved?.to&&p.node===to.id);if(!a){a=allPorts.find(p=>p.id==='out:'+edgeKey(from.id,to.id))??{id:'out:'+edgeKey(from.id,to.id),node:from.id,side:'right'};if(!allPorts.some(p=>p.id===a!.id))allPorts.push(a);}if(!b){b=allPorts.find(p=>p.id==='in:'+edgeKey(from.id,to.id))??{id:'in:'+edgeKey(from.id,to.id),node:to.id,side:'left'};if(!allPorts.some(p=>p.id===b!.id))allPorts.push(b);}return {from,to,a,b};});
 const fraction=(p:Port)=>{if(p.offset!==undefined)return p.offset;const peers=allPorts.filter(v=>v.node===p.node&&v.side===p.side);return (peers.findIndex(v=>v.id===p.id)+1)/(peers.length+1);};

 const [positions,setPositions]=useState<Record<string,{x:number;y:number}>>(()=>{try{const value=JSON.parse(localStorage.getItem(storageKey??'')??'{}');if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every((p:any)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-WORKFLOW_MARGIN&&p.y>=-WORKFLOW_MARGIN))return value;}catch{}return {};});
 useEffect(()=>{if(storageKey)try{localStorage.setItem(storageKey,JSON.stringify(positions));}catch{}},[positions,storageKey]);
 const drag=useRef<{id:string;clientX:number;clientY:number;x:number;y:number}>();
 const [error,setError]=useState('');
 const position=(id:string)=>positions[id]??graph.nodes.find(n=>n.id===id)!;

 // ---- Thu phóng, kéo nền, ẩn/hiện, phóng to toàn khung ----
 const zoomKey=storageKey?storageKey+':zoom':'';
 const flag=(key:string,fallback:boolean)=>{try{const v=localStorage.getItem(key);return v==null?fallback:v==='1';}catch{return fallback;}};
 const [zoom,setZoomState]=useState(()=>{try{return readZoom(zoomKey?localStorage.getItem(zoomKey):null);}catch{return 1;}});
 const [wheelMode,setWheelMode]=useState(()=>flag('pvta.workflowWheelZoom',false));
 const [showHelp,setShowHelp]=useState(()=>flag('pvta.workflowGraphHelp',true));
 const [showFrameTools,setShowFrameTools]=useState(()=>flag('pvta.workflowFrameTools',true));
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>subscribeReview(()=>{if(reviewSnapshot())setExpanded(false);}),[]);
 const [autoEject,setAutoEject]=useState(()=>flag('pvta.workflowAutoEject',true));
 const [settle,setSettle]=useState(0);
 const [ejectMsg,setEjectMsg]=useState('');
 const canvasRef=useRef<HTMLDivElement>(null);
 const zoomRef=useRef(zoom);zoomRef.current=zoom;
 const wheelModeRef=useRef(wheelMode);wheelModeRef.current=wheelMode;
 const pendingScroll=useRef<{left:number;top:number}|null>(null);
 const pan=useRef<{x:number;y:number;left:number;top:number;id:number}>();
 const [panning,setPanning]=useState(false);
 const remember=(key:string,value:boolean)=>{try{localStorage.setItem(key,value?'1':'0');}catch{}};
 function applyZoom(next:number,at?:{x:number;y:number}){
  const el=canvasRef.current,from=zoomRef.current,to=clampZoom(next);
  if(to===from)return;
  if(el){const r=el.getBoundingClientRect(),cs=getComputedStyle(el);const ox=(at?at.x-r.left:r.width/2)-el.clientLeft,oy=(at?at.y-r.top:r.height/2)-el.clientTop;pendingScroll.current={left:scrollAfterZoom(el.scrollLeft,ox,parseFloat(cs.paddingLeft)||0,from,to),top:scrollAfterZoom(el.scrollTop,oy,parseFloat(cs.paddingTop)||0,from,to)};}
  zoomRef.current=to;setZoomState(to);
 }
 function fitToView(){
  const el=canvasRef.current;if(!el)return;
  const cs=getComputedStyle(el),padX=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0),padY=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);
  const z=fitZoom(fullW,fullH,el.clientWidth-padX,el.clientHeight-padY);
  if(z===zoomRef.current){el.scrollLeft=0;el.scrollTop=0;return;}
  applyZoom(z);pendingScroll.current={left:0,top:0};
 }
 useLayoutEffect(()=>{const p=pendingScroll.current,el=canvasRef.current;pendingScroll.current=null;if(p&&el){el.scrollLeft=p.left;el.scrollTop=p.top;}},[zoom]);
 useLayoutEffect(()=>{const el=canvasRef.current;if(el){el.scrollLeft=(OX-24)*zoomRef.current;el.scrollTop=(OX-24)*zoomRef.current;}},[]);
 useEffect(()=>{if(zoomKey)try{localStorage.setItem(zoomKey,String(Math.round(zoom*100)/100));}catch{}},[zoom,zoomKey]);
 // Con lăn/touchpad: ⌘ hoặc Ctrl + cuộn (chụm hai ngón trên touchpad cũng gửi sự kiện này) và cử chỉ chụm của WebKit.
 useEffect(()=>{
  const el=canvasRef.current;if(!el)return;
  let base=1;
  const wheel=(e:WheelEvent)=>{if(!(e.ctrlKey||e.metaKey||wheelModeRef.current))return;e.preventDefault();applyZoom(zoomRef.current*wheelFactor(e.deltaY,e.deltaMode),{x:e.clientX,y:e.clientY});};
  const gestureStart=(e:Event)=>{e.preventDefault();base=zoomRef.current;};
  const gestureChange=(e:Event)=>{e.preventDefault();const g=e as Event&{scale?:number;clientX?:number;clientY?:number};if(typeof g.scale==='number')applyZoom(base*g.scale,g.clientX==null||g.clientY==null?undefined:{x:g.clientX,y:g.clientY});};
  const gestureEnd=(e:Event)=>e.preventDefault();
  el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('gesturestart',gestureStart);el.addEventListener('gesturechange',gestureChange);el.addEventListener('gestureend',gestureEnd);
  return()=>{el.removeEventListener('wheel',wheel);el.removeEventListener('gesturestart',gestureStart);el.removeEventListener('gesturechange',gestureChange);el.removeEventListener('gestureend',gestureEnd);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 // Phím tắt hệ điều hành: ⌘/Ctrl + (+, −, 0). Bỏ qua khi đang gõ chữ hoặc trong hộp thoại.
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{
   if(!(e.metaKey||e.ctrlKey)||e.altKey)return;
   const t=e.target instanceof Element?e.target:null;
   if(t&&(t.closest('input,textarea,select,[contenteditable="true"],dialog,[role="dialog"],.wf-step-dialog')))return;
   if(e.key==='+'||e.key==='='){e.preventDefault();applyZoom(stepZoom(zoomRef.current,1));}
   else if(e.key==='-'||e.key==='_'){e.preventDefault();applyZoom(stepZoom(zoomRef.current,-1));}
   else if(e.key==='0'){e.preventDefault();applyZoom(1);}
  };
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{if(!expanded)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[role=menu]'))setExpanded(false);};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[expanded]);
 const panHandlers={
  onPointerDown:(e:React.PointerEvent<HTMLDivElement>)=>{
   const onBackground=e.target===e.currentTarget||(e.target as HTMLElement).dataset?.wfBg==='1';
   if(tool==='frame'||!(e.button===1||(e.button===0&&onBackground)))return;
   const el=e.currentTarget;if(e.button===1)e.preventDefault();
   pan.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop,id:e.pointerId};el.setPointerCapture(e.pointerId);setPanning(true);
  },
  onPointerMove:(e:React.PointerEvent<HTMLDivElement>)=>{const p=pan.current;if(!p||p.id!==e.pointerId)return;e.currentTarget.scrollLeft=p.left-(e.clientX-p.x);e.currentTarget.scrollTop=p.top-(e.clientY-p.y);},
  onPointerUp:(e:React.PointerEvent<HTMLDivElement>)=>{if(!pan.current)return;pan.current=undefined;setPanning(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);},
  onPointerCancel:()=>{pan.current=undefined;setPanning(false);},
 };

 // ---- Khung bọc nút, số thứ tự, gợi ý liên kết ----
 const frameList=frames??[];
 const [tool,setTool]=useState<'none'|'frame'>('none');
 const [rect,setRect]=useState<{x0:number;y0:number;x1:number;y1:number}|null>(null);
 const [numbers,setNumbers]=useState('');
 const [frameMsg,setFrameMsg]=useState('');
 const [editFrame,setEditFrame]=useState('');
 const [fName,setFName]=useState(''),[fDecl,setFDecl]=useState('');
 const box=(id:string)=>{const p=position(id);return {x:p.x,y:p.y,w:NODE_W,h:sizes[id]??240};};
 const inside=(f:WorkflowFrame,g:WorkflowFrame)=>f.id!==g.id&&f.stepIds.length<g.stepIds.length&&f.stepIds.every(x=>g.stepIds.includes(x));
 const levelsBelow=(f:WorkflowFrame):number=>{const kids=frameList.filter(k=>inside(k,f));return kids.length?1+Math.max(...kids.map(levelsBelow)):0;};
 const frameBox=(f:WorkflowFrame)=>{const ids=f.stepIds.filter(id=>nodes.some(n=>n.id===id));if(!ids.length)return null;const bs=ids.map(box),pad=12+14*levelsBelow(f);const x0=Math.min(...bs.map(b=>b.x))-pad,y0=Math.min(...bs.map(b=>b.y))-pad-26,x1=Math.max(...bs.map(b=>b.x+b.w))+pad,y1=Math.max(...bs.map(b=>b.y+b.h))+pad;return {x:x0,y:y0,w:x1-x0,h:y1-y0};};
 function addFrame(ids:string[]){
  if(!onFrames||disabled)return;
  if(!ids.length){setFrameMsg(uiText("Không có nút nào nằm trọn trong vùng. Kéo vùng bao trọn cả nút, hoặc nhập số thứ tự."));return;}
  const frame:WorkflowFrame={id:crypto.randomUUID(),name:uiText("Khung {0}",[frameList.length+1]),stepIds:ids,decl:''};
  try{validateFrames([...frameList,frame]);}catch(e){setFrameMsg(e instanceof Error?e.message:String(e));return;}
  onFrames([...frameList,frame]);setFrameMsg('');openFrame(frame);
 }
 function byNumbers(){try{addFrame(stepIdsFromNumbers(nodes,numbers));setNumbers('');}catch(e){setFrameMsg(e instanceof Error?e.message:String(e));}}
 function openFrame(f:WorkflowFrame){setEditFrame(f.id);setFName(f.name);setFDecl(f.decl);}
 function commitFrame(){
  const f=frameList.find(x=>x.id===editFrame);if(!f||!onFrames)return;
  const next=frameList.map(x=>x.id===f.id?{...x,name:fName.trim()||x.name,decl:fDecl}:x);
  try{validateFrames(next);}catch(e){setFrameMsg(e instanceof Error?e.message:String(e));return;}
  onFrames(next);setEditFrame('');setFrameMsg('');
 }
 const declWarn=(()=>{try{parseDeclarations(fDecl);return '';}catch(e){return e instanceof Error?e.message:String(e);}})();
 const drawHandlers={
  onPointerDown:(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();const x=(e.clientX-r.left)/zoom-OX,y=(e.clientY-r.top)/zoom-OX;setRect({x0:x,y0:y,x1:x,y1:y});e.currentTarget.setPointerCapture(e.pointerId);},
  onPointerMove:(e:React.PointerEvent<HTMLDivElement>)=>{if(!rect||!e.currentTarget.hasPointerCapture(e.pointerId))return;const r=e.currentTarget.getBoundingClientRect();setRect({...rect,x1:(e.clientX-r.left)/zoom-OX,y1:(e.clientY-r.top)/zoom-OX});},
  onPointerUp:(e:React.PointerEvent<HTMLDivElement>)=>{
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   const r=rect;setRect(null);setTool('none');if(!r)return;
   const x0=Math.min(r.x0,r.x1),x1=Math.max(r.x0,r.x1),y0=Math.min(r.y0,r.y1),y1=Math.max(r.y0,r.y1);
   addFrame(nodes.filter(n=>{const b=box(n.id);return b.x>=x0&&b.y>=y0&&b.x+b.w<=x1&&b.y+b.h<=y1;}).map(n=>n.id));
  },
  onPointerCancel:()=>{setRect(null);setTool('none');},
 };
 useEffect(()=>{
  if(!autoEject||drag.current||!frameList.length)return;
  const rects=frameList.map(frameBox).filter((b):b is {x:number;y:number;w:number;h:number}=>!!b);if(!rects.length)return;
  const members=new Set(frameList.flatMap(f=>f.stepIds));
  const {moved}=ejectOutside(Object.fromEntries(nodes.map(n=>[n.id,box(n.id)])),members,rects);
  const ids=Object.keys(moved);if(!ids.length)return;
  setPositions(v=>({...v,...moved}));
  setEjectMsg(uiText('Đã đưa nút {0} ra ngoài khung',[ids.map(id=>nodes.findIndex(n=>n.id===id)+1).join(', ')]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[autoEject,settle,frameList,nodes,sizes,positions]);
 useEffect(()=>{if(tool!=='frame')return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setTool('none');setRect(null);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[tool]);
 function connect(target:string,targetPort?:Port){
  const node=nodes.find(n=>n.id===target),from=nodes.find(n=>n.id===source);if(!node||!from||disabled)return;
  if(source===target){setError(uiText("Chọn một bước khác để nối."));return;}
  if(node.dependsOn?.includes(source)){setError(uiText("Hai bước này đã có liên kết. Chọn bước khác."));return;}
  const dependencies=[...new Set([...(node.dependsOn??[]),source])];
  const candidate=layoutWorkflow(nodes.map(n=>({...n,prompt:'',choice:'auto',access:'read',dependsOn:n.id===target?dependencies:n.dependsOn})));
  if(candidate.cyclic){setError(uiText("Kết nối này tạo vòng lặp. Hãy chọn bước khác."));return;}
  const to=targetPort??{id:crypto.randomUUID(),node:target,side:'left' as Side};
  const fromPoint=allPorts.find(p=>p.id===sourcePort);
  if(fromPoint)setPoints(v=>({ports:[...v.ports,...[fromPoint,to].filter(p=>!v.ports.some(x=>x.id===p.id))],links:{...v.links,[edgeKey(source,target)]:{from:fromPoint.id,to:to.id}}}));
  onDependencies(target,dependencies);setSource('');setSourcePort('');setError('');
 }
 const anchor=(port:Port)=>{const p=position(port.node),h=sizes[port.node]??240,t=fraction(port);return {x:p.x+(port.side==='left'?0:port.side==='right'?230:230*t),y:p.y+(port.side==='top'?0:port.side==='bottom'?h:h*t)};};
 const linkBoxes=nodes.map(n=>box(n.id));
 const routed=new Map<string,Point[]>();
 for(const link of links){
  const key=edgeKey(link.from.id,link.to.id),saved=points.links[key];
  const fixed=(p:Port)=>p.offset===undefined?undefined:{side:p.side,offset:p.offset};
  const result=arrangeLink(box(link.from.id),box(link.to.id),linkBoxes,fixed(link.a),fixed(link.b),saved?.via);
  // Automatic attachment coordinates are derived, never persisted as manual constraints.
  link.a={...link.a,...result.a};link.b={...link.b,...result.b};
  for(const port of [link.a,link.b]){const i=allPorts.findIndex(p=>p.id===port.id);allPorts[i]=port;}
  routed.set(key,result.points);
 }
 const edgePath=(a:Port,b:Port)=>linkPath(routed.get(edgeKey(a.node,b.node))??[]);
 const originRef=useRef<HTMLDivElement>(null);
 type Gesture={kind:'route'|'endpoint'|'new';from:string;to?:string;end?:'from'|'to';port?:Port;start:Point;at:Point;before:Ports;moved:boolean;pointerId:number};
 const gesture=useRef<Gesture>();
 const [preview,setPreview]=useState<Point|null>(null);
 const suppressClick=useRef(false);
 const atPointer=(e:{clientX:number;clientY:number}):Point=>{const r=originRef.current!.getBoundingClientRect();return {x:(e.clientX-r.left)/zoomRef.current,y:(e.clientY-r.top)/zoomRef.current};};
 function beginLink(e:React.PointerEvent,kind:Gesture['kind'],from:string,to?:string,end?:Gesture['end'],port?:Port){
  if(disabled||e.button!==0)return;
  e.stopPropagation();suppressClick.current=false;
  const at=atPointer(e);gesture.current={kind,from,to,end,port,start:at,at,before:points,moved:false,pointerId:e.pointerId};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function cancelLink(){
  const g=gesture.current;if(g?.moved){setPoints(g.before);suppressClick.current=true;}
  gesture.current=undefined;setPreview(null);
 }
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancelLink();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
 function moveLink(e:React.PointerEvent){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
  const at=atPointer(e);g.at=at;
  if(!g.moved&&Math.hypot(at.x-g.start.x,at.y-g.start.y)*zoomRef.current<5)return;
  g.moved=true;suppressClick.current=true;
  if(g.kind==='route'){
   if(linkBoxes.some(b=>at.x>b.x-14&&at.x<b.x+b.w+14&&at.y>b.y-14&&at.y<b.y+b.h+14))return;
   const key=edgeKey(g.from,g.to!),link=links.find(l=>l.from.id===g.from&&l.to.id===g.to)!;
   setPoints(v=>({ports:v.ports.filter(p=>p.id!==link.a.id&&p.id!==link.b.id),links:{...v.links,[key]:{from:link.a.id,to:link.b.id,via:at}}}));
  }else setPreview(at);
 }
 function finishLink(e:React.PointerEvent){
  const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
  gesture.current=undefined;setPreview(null);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(!g.moved||disabled){if(disabled)setPoints(g.before);return;}
  if(g.kind==='route')return;
  const at=atPointer(e),target=nodes.find(n=>{const b=box(n.id);return at.x>=b.x-10&&at.x<=b.x+b.w+10&&at.y>=b.y-10&&at.y<=b.y+b.h+10;});
  if(!target)return; // A missed drop leaves the original edge intact.
  const from=g.kind==='endpoint'&&g.end==='from'?target.id:g.from;
  const to=g.kind==='endpoint'&&g.end==='from'?g.to!:target.id;
  const oldKey=g.to?edgeKey(g.from,g.to):'',key=edgeKey(from,to);
  if(from===to){setError(uiText('Chọn một bước khác để nối.'));return;}
  if(key!==oldKey&&nodes.find(n=>n.id===to)?.dependsOn?.includes(from)){setError(uiText('Hai bước này đã có liên kết. Chọn bước khác.'));return;}
  const deps=Object.fromEntries(nodes.map(n=>[n.id,(n.dependsOn??[]).filter(id=>!(g.kind==='endpoint'&&n.id===g.to&&id===g.from))]));
  deps[to]=[...deps[to]!,from];
  if(layoutWorkflow(nodes.map(n=>({...n,prompt:'',choice:'auto',access:'read',dependsOn:deps[n.id]}))).cyclic){setError(uiText('Kết nối này tạo vòng lặp. Hãy chọn bước khác.'));return;}
  const previous=links.find(l=>l.from.id===g.from&&l.to.id===g.to);
  const a:Port=g.kind==='endpoint'&&g.end==='to'?previous!.a:{id:crypto.randomUUID(),node:from,...borderPoint(box(from),g.kind==='new'?g.start:at)};
  const b:Port=g.kind==='endpoint'&&g.end==='from'?previous!.b:{id:crypto.randomUUID(),node:to,...borderPoint(box(to),at)};
  setPoints(v=>{const next={...v.links};if(oldKey)delete next[oldKey];next[key]={from:a.id,to:b.id};const used=new Set(Object.values(next).flatMap(l=>[l.from,l.to]));return {ports:[...v.ports.filter(p=>used.has(p.id)&&p.id!==a.id&&p.id!==b.id),a,b],links:next};});
  if(key!==oldKey)onDependencies(to,deps[to]!,g.kind==='endpoint'&&g.to!==to?{[g.to!]:deps[g.to!]!}:undefined);
  setSelectedEdge('edge:'+key);setSource('');setSourcePort('');setError('');
 }
 const linkDragHandlers={onPointerMove:moveLink,onPointerUp:finishLink,onPointerCancel:cancelLink,onLostPointerCapture:()=>{if(gesture.current)cancelLink();}};
 const consumeClick=()=>{if(!suppressClick.current)return false;suppressClick.current=false;return true;};

 const OX=WORKFLOW_MARGIN,width=Math.max(graph.width,...nodes.map(n=>position(n.id).x+280)),height=Math.max(graph.height,...nodes.map(n=>position(n.id).y+(sizes[n.id]??240)+40)),fullW=width+2*OX,fullH=height+2*OX;
 const menu=useObjectMenu<string>({contextKey:JSON.stringify([storageKey,disabled,nodes]),commands:target=>{
  const reason=disabled?uiText("Chờ công việc đang chạy kết thúc."):undefined;
  if(target==='background')return [
   {id:'add',label:uiText("Thêm bước"),icon:'＋',disabledReason:reason??(nodes.length>=maxSteps?`Đã đạt giới hạn ${maxSteps} bước.`:undefined),run:onAdd},
   {id:'arrange',label:uiText("Sắp xếp lại sơ đồ"),icon:'▦',group:'layout',run:()=>{setPositions({});setPoints({ports:[],links:{}});}},
   {id:'reset',label:uiText("Đặt lại vị trí sơ đồ"),icon:'↺',group:'layout',run:()=>setPositions({})},
  ];
  if(target.startsWith('edge:')){const [from,to]=JSON.parse(target.slice(5)) as string[];const node=nodes.find(n=>n.id===to);if(!node?.dependsOn?.includes(from!))return [];return [{id:'unlink',label:uiText("Xóa liên kết"),icon:uiText("×"),danger:true,disabledReason:reason,run:()=>{onDependencies(to!,node.dependsOn!.filter(id=>id!==from));setSelectedEdge('');}}];}
  const id=target.slice(5);if(!nodes.some(n=>n.id===id))return [];
  return [
   {id:'edit',label:uiText("Xem/sửa bước"),icon:'✎',disabledReason:reason,run:()=>onSelect(id)},
   {id:'connect',label:uiText("Tạo liên kết mới"),icon:'↗',disabledReason:reason,run:()=>{const port={id:crypto.randomUUID(),node:id,side:menuSide.current};setPoints(v=>({...v,ports:[...v.ports,port]}));setSource(id);setSourcePort(port.id);setError('');}},
   ...(nodeCommands?.(id)??[]).map(c=>({...c,disabledReason:reason??c.disabledReason})),
  ];
 }});
 const menuSide=useRef<Side>('right');
 const nodeHandlers=(id:string)=>{const handlers=menu.handlers('node:'+id);return {...handlers,onContextMenu:(e:React.MouseEvent)=>{const r=e.currentTarget.getBoundingClientRect();menuSide.current=([['left',Math.abs(e.clientX-r.left)],['right',Math.abs(e.clientX-r.right)],['top',Math.abs(e.clientY-r.top)],['bottom',Math.abs(e.clientY-r.bottom)]] as [Side,number][]).sort((a,b)=>a[1]-b[1])[0]![0];handlers.onContextMenu(e);}};};
 return <div className={`wf-visual-editor${expanded?' wf-expanded':''}`}><div className="wf-actions"><button disabled={disabled||nodes.length>=maxSteps} onClick={onAdd}>{uiText("＋ Thêm bước trên sơ đồ")}</button>{menu.trigger('background',uiText("Thao tác sơ đồ"))}{source&&<><span>{uiText("Chọn nút nhận kết nối từ “")} {nodes.find(n=>n.id===source)?.name}”</span><button onClick={()=>{setSource('');setSourcePort('');setError('');}}>{uiText("Hủy nối")}</button></>}</div><div className="wf-actions wf-view-tools" role="group" aria-label={uiText("Thu phóng và hiển thị sơ đồ")}>
 <ToolButton icon="zoomOut" disabled={zoom<=0.25} title={uiText("Thu nhỏ (⌘ hoặc Ctrl và −)")} aria-label={uiText("Thu nhỏ sơ đồ")} onClick={()=>applyZoom(stepZoom(zoom,-1))}>{''}</ToolButton>
 <button type="button" className="wf-zoom-value" title={uiText("Về 100% (⌘ hoặc Ctrl và 0)")} aria-label={uiText("Mức thu phóng {0}. Bấm để về 100%",[zoomLabel(zoom)])} onClick={()=>applyZoom(1)}>{zoomLabel(zoom)}</button>
 <ToolButton icon="zoomIn" disabled={zoom>=2} title={uiText("Phóng to (⌘ hoặc Ctrl và +)")} aria-label={uiText("Phóng to sơ đồ")} onClick={()=>applyZoom(stepZoom(zoom,1))}>{''}</ToolButton>
 <input type="range" className="wf-zoom-range" min={25} max={200} step={5} value={Math.round(zoom*100)} aria-label={uiText("Thanh thu phóng sơ đồ")} onChange={e=>applyZoom(Number(e.target.value)/100)}/>
 <ToolButton icon="fit" title={uiText("Thu phóng vừa khít toàn bộ sơ đồ trong khung")} onClick={fitToView}>{uiText("Vừa khung")}</ToolButton>
 <ToolButton icon="mouse" aria-pressed={wheelMode} className={wheelMode?'on':''} title={uiText("Bật: lăn chuột để thu phóng (dành cho chuột rời). Tắt: lăn để cuộn, ⌘ hoặc Ctrl và lăn để thu phóng; touchpad chụm hai ngón để thu phóng.")} onClick={()=>{const v=!wheelMode;setWheelMode(v);remember('pvta.workflowWheelZoom',v);}}>{wheelMode?uiText("Con lăn: thu phóng"):uiText("Con lăn: cuộn")}</ToolButton>
 <span className="wf-sep" role="separator" aria-orientation="vertical"/>
 {onFrames&&<ToolButton icon={showFrameTools?'eyeOff':'eye'} aria-pressed={showFrameTools} title={uiText("Ẩn hoặc hiện hàng công cụ Khung bọc nút")} onClick={()=>{const v=!showFrameTools;setShowFrameTools(v);remember('pvta.workflowFrameTools',v);}}>{showFrameTools?uiText("Ẩn công cụ khung"):uiText("Hiện công cụ khung")}</ToolButton>}
 <ToolButton icon={showHelp?'eyeOff':'eye'} aria-pressed={showHelp} title={uiText("Ẩn hoặc hiện dòng hướng dẫn thao tác")} onClick={()=>{const v=!showHelp;setShowHelp(v);remember('pvta.workflowGraphHelp',v);}}>{showHelp?uiText("Ẩn hướng dẫn"):uiText("Hiện hướng dẫn")}</ToolButton>
 <ToolButton icon={expanded?'shrink':'expand'} aria-pressed={expanded} title={uiText("Mở sơ đồ phủ kín cửa sổ (Esc để thoát)")} onClick={()=>setExpanded(v=>!v)}>{expanded?uiText("Thu về"):uiText("Toàn khung")}</ToolButton>
</div>{onFrames&&showFrameTools&&<div className="wf-actions wf-frame-tools" role="group" aria-label={uiText("Khung bọc nút")}>
 <ToolButton icon="frame" aria-pressed={tool==='frame'} className={tool==='frame'?'on':''} disabled={disabled} title={uiText("Kéo một vùng trên sơ đồ: mọi nút nằm trọn trong vùng được bọc vào khung")} onClick={()=>{setTool(tool==='frame'?'none':'frame');setFrameMsg('');}}>{uiText("Vẽ khung")}</ToolButton>
 <span className="wf-sep" role="separator" aria-orientation="vertical"/>
 <label className="wf-inline"><WfGlyph name="hash"/><input aria-label={uiText("Bọc các nút theo số thứ tự, ví dụ 1,3,5-9")} placeholder="1,3,5-9" value={numbers} disabled={disabled} onChange={e=>setNumbers(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();byNumbers();}}}/></label>
 <ToolButton icon="check" disabled={disabled||!numbers.trim()} title={uiText("Bọc các nút có số thứ tự đã nhập vào một khung")} onClick={byNumbers}>{uiText("Bọc theo số")}</ToolButton>
 <ToolButton icon="check" aria-pressed={autoEject} className={autoEject?'on':''} title={uiText("Tự đưa các nút không thuộc khung nào ra khỏi vùng khung")} onClick={()=>{const v=!autoEject;setAutoEject(v);remember('pvta.workflowAutoEject',v);}}>{autoEject?uiText("Tự đưa nút ra ngoài: bật"):uiText("Tự đưa nút ra ngoài: tắt")}</ToolButton>
 {tool==='frame'&&<Badge tone="info" icon="frame">{uiText("Kéo chuột trên sơ đồ để vẽ · Esc để thoát")}</Badge>}
</div>}
{frameMsg&&<p role="alert" className="wf-warn">{frameMsg}</p>}{ejectMsg&&<p role="status" className="muted small">{ejectMsg} <button type="button" onClick={()=>setEjectMsg('')}>{uiText("Đóng")}</button></p>}
{(()=>{const f=frameList.find(x=>x.id===editFrame);return f?<section className="wf-frame-edit" aria-label={uiText("Sửa khung")}>
 <header><WfGlyph name="frame"/><strong>{uiText("Khung")} · {f.stepIds.length} {uiText("nút")}</strong></header>
 <label>{uiText("Tên khung")}<input value={fName} maxLength={100} onChange={e=>setFName(e.target.value)}/></label>
 <p className="muted small">Khai báo mới viết trực tiếp trong prompt bằng !bien và !ham. Khung giới hạn phạm vi cho các nút bên trong.</p>
 {fDecl&&<details><summary>Khai báo cũ (giữ nguyên để tương thích)</summary><textarea aria-label="Khai báo cũ của khung" rows={3} value={fDecl} onChange={e=>setFDecl(e.target.value)}/><p>Biến có giá trị hằng dùng được với chỉ thị mới. Hàm mô tả cũ cần chuyển thủ công sang !ham và duyệt triển khai.</p></details>}
 {declWarn&&<p role="alert" className="wf-warn">{declWarn}</p>}
 <div className="wf-actions"><ToolButton icon="check" tone="primary" disabled={!!declWarn||disabled} onClick={commitFrame}>{uiText("Xong")}</ToolButton><ToolButton icon="x" onClick={()=>{setEditFrame('');setFrameMsg('');}}>{uiText("Đóng")}</ToolButton><span className="wf-spacer"/><ToolButton icon="trash" tone="danger" disabled={disabled} onClick={()=>{onFrames?.(frameList.filter(x=>x.id!==f.id));setEditFrame('');}}>{uiText("Xóa khung")}</ToolButton></div>
</section>:null;})()}
{showHelp&&<p className="muted small">{uiText("Bấm nút để sửa; kéo thân nút sang nút khác để nối mới. Kéo thanh tiêu đề để di chuyển nút. Kéo đường nối để chỉnh đường; kéo chấm đầu nối sang viền hoặc nút khác để đổi đầu nối. Nhấp đúp đường nối để tự làm đẹp lại. Esc hủy kéo. Touchpad dùng thao tác kéo đã bật trong macOS (nhấn giữ, chạm hai lần rồi kéo hoặc kéo ba ngón). Chuột phải để mở menu; ⌘/Ctrl + cuộn để thu phóng.")}</p>}{error&&<p role="alert">{error}</p>}
 {selectedEdge&&links.some(({from,to})=>'edge:'+edgeKey(from.id,to.id)===selectedEdge)&&<div className="wf-selected-edge"><span>{uiText("Liên kết đang chọn")}</span>{menu.trigger(selectedEdge,uiText("Thao tác liên kết đã chọn"))}</div>}
 <div ref={canvasRef} className={`wf-canvas${panning?' wf-panning':''}`} tabIndex={0} aria-label={uiText("Nền sơ đồ")} {...menu.handlers('background')} {...panHandlers}><div className="wf-zoom-sizer" style={{position:'relative',width:fullW*zoom,height:fullH*zoom,flexShrink:0}}><div data-wf-bg="1" data-zoom={zoom} style={{position:'relative',width:fullW,height:fullH,flexShrink:0,transform:zoom===1?undefined:`scale(${zoom})`,transformOrigin:'0 0'}}><div ref={originRef} className="wf-origin" data-wf-bg="1" style={{position:'absolute',left:OX,top:OX,width:0,height:0,overflow:'visible'}}>
 {frameList.map(f=>{const b=frameBox(f);if(!b)return null;let chips:{k:string;t:string}[]=[];try{const d=parseDeclarations(f.decl);chips=[...d.vars.map(v=>({k:'v'+v.name,t:`${v.name} = ${v.value}`})),...d.funcs.map(x=>({k:'f'+x.name,t:`ƒ ${x.name}`}))];}catch{chips=[{k:'bad',t:uiText("khai báo lỗi")}];}return <div key={f.id} className={`wf-frame${editFrame===f.id?' on':''}`} style={{left:b.x,top:b.y,width:b.w,height:b.h}}><button type="button" className="wf-frame-head" title={uiText("Sửa tên và khai báo biến, hàm của khung")} onClick={()=>openFrame(f)}><WfGlyph name="frame" size={12}/><strong>{f.name}</strong>{chips.slice(0,6).map(c=><code key={c.k}>{c.t}</code>)}{chips.length>6&&<code>+{chips.length-6}</code>}</button></div>;})}
 <svg className="wf-edges wf-editable-edges" style={{overflow:'visible'}} width={width} height={height} aria-label={uiText("Quan hệ phụ thuộc")}><defs>{(['normal','outside','between'] as const).map(tone=><marker key={tone} id={`${arrowId}-${tone}`} className={`wf-edge-${tone}`} viewBox="0 0 10 10" refX="13" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>)}</defs>{links.map(({from,to,a:fromPort,b:toPort})=>{const tone=linkTone(from.id,to.id,frameList);const label=uiText("Chọn liên kết: {0} → {1}",[nodes.find(n=>n.id===from.id)?.name,nodes.find(n=>n.id===to.id)?.name]);const target='edge:'+edgeKey(from.id,to.id);const select=()=>setSelectedEdge(target);return <g key={`${from.id}-${to.id}`} className={`wf-edge-${tone}`}><path role="button" tabIndex={0} aria-pressed={selectedEdge===target} aria-label={label} {...menu.handlers(target)} onPointerDown={e=>beginLink(e,'route',from.id,to.id)} {...linkDragHandlers} onDoubleClick={()=>{if(disabled)return;setPoints(v=>{const next={...v.links};delete next[edgeKey(from.id,to.id)];return {ports:v.ports.filter(p=>p.id!==fromPort.id&&p.id!==toPort.id),links:next};});}} onClick={e=>{e.stopPropagation();consumeClick();select();}} onKeyDown={e=>{menu.handlers(target).onKeyDown(e);if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}}} d={edgePath(fromPort,toPort)} markerEnd={`url(#${arrowId}-${tone})`} fill="none" stroke="currentColor" strokeWidth="4"><title>{label}</title></path><path className="wf-edge-hit" d={edgePath(fromPort,toPort)} fill="none" stroke="transparent" strokeWidth="18" {...menu.handlers(target)} onPointerDown={e=>beginLink(e,'route',from.id,to.id)} {...linkDragHandlers} onClick={e=>{e.stopPropagation();consumeClick();select();}} onDoubleClick={()=>{if(disabled)return;setPoints(v=>{const next={...v.links};delete next[edgeKey(from.id,to.id)];return {ports:v.ports.filter(p=>p.id!==fromPort.id&&p.id!==toPort.id),links:next};});}}><title>{label}</title></path></g>;})}</svg>
 {!!suggested?.length&&<svg className="wf-edges wf-suggest-edges" style={{overflow:'visible'}} width={width} height={height} aria-hidden="true">{suggested.filter(l=>nodes.some(n=>n.id===l.from)&&nodes.some(n=>n.id===l.to)).map(l=>{const a=box(l.from),b=box(l.to),tone=linkTone(l.from,l.to,frameList);return <path key={l.id} className={`wf-edge-${tone}`} d={linkPath(routeLink({x:a.x+a.w,y:a.y+a.h/2},'right',{x:b.x,y:b.y+b.h/2},'left',linkBoxes))} markerEnd={`url(#${arrowId}-${tone})`}/>;})}</svg>}
 {(suggested??[]).filter(l=>nodes.some(n=>n.id===l.from)&&nodes.some(n=>n.id===l.to)).map(l=>{const a=box(l.from),b=box(l.to);return <div key={l.id} className="wf-suggest" style={{left:(a.x+a.w+b.x)/2,top:(a.y+a.h/2+b.y+b.h/2)/2}}><Badge tone="info" icon="link" title={nodes.find(n=>n.id===l.from)?.name+' → '+nodes.find(n=>n.id===l.to)?.name}>{uiText("Gợi ý nối")}</Badge><button type="button" className="wf-ok" aria-label={uiText("Chấp nhận liên kết gợi ý")} title={uiText("Chấp nhận: thành phụ thuộc thật")} disabled={disabled} onClick={()=>onResolveLink?.(l.id,true)}><WfGlyph name="check" size={12}/></button><button type="button" className="wf-no" aria-label={uiText("Bỏ liên kết gợi ý")} title={uiText("Bỏ gợi ý")} disabled={disabled} onClick={()=>onResolveLink?.(l.id,false)}><WfGlyph name="x" size={12}/></button></div>;})}
 {nodes.map(n=>{const p=position(n.id);return <div key={n.id} tabIndex={-1} ref={el=>{if(el)cards.current.set(n.id,el);else cards.current.delete(n.id);}} {...nodeHandlers(n.id)} className={`wf-node wf-node-${n.status??'waiting'}${n.fresh?' wf-node-fresh':''}`} style={{position:'absolute',left:p.x,top:p.y,width:NODE_W}}><span className="wf-num" title={uiText("Số thứ tự nút (dùng để chọn khung theo số)")} aria-label={uiText("Nút số {0}",[nodes.findIndex(x=>x.id===n.id)+1])}>{nodes.findIndex(x=>x.id===n.id)+1}</span><button className="wf-drag-handle" aria-label={uiText("Di chuyển bước: {0}",[n.name])} title={uiText("Kéo để di chuyển; dùng phím mũi tên để chỉnh vị trí")} onPointerDown={e=>{drag.current={id:n.id,clientX:e.clientX,clientY:e.clientY,x:p.x,y:p.y};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const start=drag.current;if(!start||start.id!==n.id||!e.currentTarget.hasPointerCapture(e.pointerId))return;setPositions(v=>({...v,[n.id]:{x:Math.max(-OX,start.x+(e.clientX-start.clientX)/zoom),y:Math.max(-OX,start.y+(e.clientY-start.clientY)/zoom)}}));}} onPointerCancel={()=>{drag.current=undefined;}} onPointerUp={e=>{drag.current=undefined;setSettle(v=>v+1);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onKeyDown={e=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(delta){e.preventDefault();setPositions(v=>({...v,[n.id]:{x:Math.max(-OX,p.x+delta[0]!),y:Math.max(-OX,p.y+delta[1]!)}}));setSettle(v=>v+1);}}}>{uiText("⠿ Di chuyển")}</button>{menu.trigger('node:'+n.id,uiText("Thao tác bước: {0}",[n.name]),'wf-node-menu')}<button className="wf-node-body" onPointerDown={e=>beginLink(e,'new',n.id)} {...linkDragHandlers} aria-label={source?uiText("Nối tới: {0}",[n.name]):uiText("Sửa bước: {0}",[n.name])} onClick={()=>{if(!consumeClick())source?connect(n.id):onSelect(n.id);}}><strong>{n.name}</strong><small>{source?uiText("Nhận kết nối tại đây"):uiText("Bấm để xem / sửa bước")}</small></button>{allPorts.filter(port=>port.node===n.id).map((port,i)=><button key={port.id} type="button" className={`wf-port${sourcePort===port.id?' active':''}`} disabled={disabled} aria-label={uiText("Điểm nối {0}: {1}",[i+1,n.name])} title={source?uiText("Nối vào bước này"):uiText("Bắt đầu liên kết từ điểm này")} style={{left:port.side==='left'?0:port.side==='right'?'100%':`${fraction(port)*100}%`,top:port.side==='top'?0:port.side==='bottom'?'100%':`${fraction(port)*100}%`}} onPointerDown={e=>{const link=links.find(l=>l.a.id===port.id||l.b.id===port.id);if(link)beginLink(e,'endpoint',link.from.id,link.to.id,link.a.id===port.id?'from':'to',port);else beginLink(e,'new',n.id,undefined,undefined,port);}} {...linkDragHandlers} onClick={e=>{e.stopPropagation();if(consumeClick())return;if(source)connect(n.id,port);else{setSource(n.id);setSourcePort(port.id);setError('');}}}/>)}{renderAction(n.id)}</div>;})}
 {preview&&gesture.current&&<svg className="wf-edges wf-link-preview" width={width} height={height} style={{overflow:'visible'}}><path d={linkPath([gesture.current.start,preview])} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 4"/></svg>}
 {tool==='frame'&&<div className="wf-draw-layer" style={{left:-OX,top:-OX,right:'auto',bottom:'auto',width:fullW,height:fullH}} aria-label={uiText("Vùng vẽ khung")} {...drawHandlers}>{rect&&<div className="wf-draw-rect" style={{left:Math.min(rect.x0,rect.x1),top:Math.min(rect.y0,rect.y1),width:Math.abs(rect.x1-rect.x0),height:Math.abs(rect.y1-rect.y0)}}/>}</div>}
 </div></div></div></div>{menu.menu}</div>;
}
