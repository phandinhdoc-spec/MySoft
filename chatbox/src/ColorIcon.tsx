import React,{useId} from 'react';
import type {ColorIconStyleId} from '@pvta/shared';

type Style={colors:readonly string[];ink:string;width:number;corner:number;gradient?:boolean;tile?:string;sticker?:boolean;fold?:boolean};
const STYLES:Record<ColorIconStyleId,Style>={
 'color-spectrum':{colors:['#53b5fb','#a991ff','#55d1a1','#ffca55','#ff7a91','#4bd5df'],ink:'#253c59',width:1.5,corner:3},
 'color-pastel':{colors:['#acd7ff','#d3c0ff','#aae8cd','#ffe2a0','#ffc0d0','#a6e9ef'],ink:'#655b7d',width:1.25,corner:5},
 'color-ocean':{colors:['#47b6e8','#63dad9','#77c9fb','#ffd178','#ff9b83','#99dcd2'],ink:'#164963',width:1.5,corner:1},
 'color-botanical':{colors:['#8abf99','#c8b5f0','#9bdac1','#f1ce72','#eea29a','#8ed5ce'],ink:'#345a48',width:1.4,corner:4},
 'color-sunset':{colors:['#ffae66','#ee8bbd','#ef787d','#ffd578','#c4a1ff','#ffaeb7'],ink:'#733954',width:1.3,corner:3,gradient:true},
 'color-aurora':{colors:['#62d4eb','#bc9dff','#78e2ba','#8cb9ff','#ea9be2','#6ae6d7'],ink:'#344b78',width:1.3,corner:4,gradient:true},
 'color-glass':{colors:['#93ceff','#bdb1ff','#9de5c8','#ffe1a1','#ffb1c8','#9ae7ef'],ink:'#355477',width:1.1,corner:4,tile:'#e9f4ff'},
 'color-sticker':{colors:['#52b9fb','#b28bff','#5cd3a0','#ffd05e','#ff899f','#57dbe0'],ink:'#313e63',width:1.8,corner:4,sticker:true},
 'color-neon':{colors:['#50dbff','#d0a0ff','#77f3b7','#ffe379','#ff98c6','#65f3e5'],ink:'#e8f6ff',width:1.15,corner:3,tile:'#202b46'},
 'color-origami':{colors:['#78b9ed','#ae99e4','#7dc8a8','#e9c46b','#e99ca9','#79cdd0'],ink:'#3f4e65',width:1.2,corner:0,fold:true},
};
// Stable semantic colors across the interface: documents blue, skills violet,
// projects amber, chat teal; auxiliary symbols receive their own pair as well.
const ROLES:Record<string,number>={chat:5,project:3,'folder-add':3,office:0,file:0,notebook:2,skills:1,workflow:1,github:1,history:3,eye:0,mouth:4,pen:3,stop:4,close:4,'git-status':2,'git-fetch':0,'git-pull':2,'git-push':3,exam:1,grade:2,slides:4,math:5,help:0};
export function ColorIcon({name,size,style}:{name:string;size:number;style:ColorIconStyleId}){
 const config=STYLES[style],id=`color-icon-${useId().replace(/:/g,'')}`;
 const index=ROLES[name]??Array.from(name).reduce((n,c)=>n+c.charCodeAt(0),0)%6;
 const primary=config.colors[index]!,secondary=config.colors[(index+2)%6]!;
 const p=config.gradient?`url(#${id})`:primary,s=secondary;
 const line=(d:string,connector=false)=><path d={d} fill="none" stroke={connector?'currentColor':undefined}/>;
 const rect=(x:number,y:number,w:number,h:number,fill=p,r=config.corner)=><rect x={x} y={y} width={w} height={h} rx={r} fill={fill}/>;
 const circle=(x:number,y:number,r:number,fill=p)=><circle cx={x} cy={y} r={r} fill={fill}/>;
 const arrow=name==='git-push'?<>{line('M12 17V5m-4 4 4-4 4 4')}</>:<>{line('M12 5v12m-4-4 4 4 4-4')}</>;
 let drawing:React.ReactNode;
 switch(name){
 case 'calculator':drawing=<>{rect(4,2,16,20)}{rect(7,5,10,4,s,1)}{circle(8,13,1,s)}{circle(16,13,1,s)}{circle(8,18,1,s)}{circle(16,18,1,s)}</>;break;
 case 'brain':drawing=<><path d="M12 4c-4-5-9 0-7 4-5 2-3 8 0 8-1 5 5 7 7 3 2 4 8 2 7-3 3 0 5-6 0-8 2-4-3-9-7-4Z" fill={p}/>{line('M12 4v15M5 8l3 2m11-2-3 2M5 16l3-2m11 2-3-2')}</>;break;
 case 'flag':drawing=<>{line('M5 21V4')}<path d="M5 4h12l-2.5 4.5L17 13H5Z" fill="currentColor"/>{rect(2.5,19.5,5,2.5,s,1)}</>;break;
 case 'scale':drawing=<>{line('M12 3v18M5 21h14M4 7h16')}<path d="m5 7-4 8h8L5 7Z" fill={p}/><path d="m19 7-4 8h8l-4-8Z" fill={s}/></>;break;
 case 'chat':drawing=<><path d="M3 4h18v12H10l-5 4v-4H3Z" fill={p}/>{circle(8,10,1,s)}{circle(12,10,1,s)}{circle(16,10,1,s)}</>;break;
 case 'project':case 'folder-add':drawing=<><path d="M3 5h7l2 3h9v12H3Z" fill={s}/><path d="M3 10h18l-2 10H3Z" fill={p}/>{name==='folder-add'&&line('M12 12v6m-3-3h6')}</>;break;
 case 'office':case 'file':drawing=<><path d="M5 2h9l5 5v15H5Z" fill={p}/><path d="M14 2v6h5" fill={s}/>{line('M8 12h8m-8 4h6')}</>;break;
 case 'notebook':drawing=<>{rect(5,3,15,18)}{rect(5,3,4,18,s,0)}{line('M3 7h4m-4 5h4m-4 5h4m5-9h5m-5 4h5')}</>;break;
 case 'skills':drawing=<><path d="m12 2 9 10-9 10L3 12Z" fill={p}/><path d="m12 2 3 10-3 10-3-10Z" fill={s}/>{line('M3 12h18')}</>;break;
 case 'workflow':drawing=<>{line('M8 6h8v7M8 6v12h8',true)}{rect(2,2,8,8)}{rect(14,14,8,8,s)}</>;break;
 case 'tools':drawing=<>{rect(2,2,8,8)}{rect(14,2,8,8,s)}{rect(2,14,8,8,s)}{rect(14,14,8,8)}</>;break;
 case 'gear':case 'settings':drawing=<>{line('M3 6h18M3 12h18M3 18h18',true)}{circle(8,6,3)}{circle(16,12,3,s)}{circle(9,18,3)}</>;break;
 case 'github':drawing=<>{circle(12,12,10)}<path d="m7 10-1-5 5 2h2l5-2-1 5c3 6-1 7-3 7v4h-4v-4c-5 0-6-3-3-7Z" fill={s}/>{line('M10 18c-4 2-5-2-6-2')}</>;break;
 case 'history':drawing=<>{circle(13,12,9)}<path d="M3 4v6h6" fill={s}/>{line('M13 6v6l4 3')}</>;break;
 case 'eye':drawing=<><path d="M1 12C7 2 17 2 23 12c-6 10-16 10-22 0Z" fill={p}/>{circle(12,12,4,s)}{circle(13,11,1.3,'#fff')}</>;break;
 case 'mouth':drawing=<><path d="M2 12c4-5 7-5 10-2 3-3 6-3 10 2-6 10-14 10-20 0Z" fill={p}/><path d="M2 12h20l-5 3H7Z" fill={s}/></>;break;
 case 'pen':drawing=<><path d="m4 16 12-12 4 4L8 20l-6 2Z" fill={p}/><path d="m4 16 4 4-6 2Z" fill={s}/>{line('m14 6 4 4')}</>;break;
 case 'groups':drawing=<>{circle(8,7,4)}{circle(17,8,3,s)}<path d="M1 21v-3a7 7 0 0 1 14 0v3Z" fill={p}/><path d="M15 14c5-1 8 2 8 7h-8" fill={s}/></>;break;
 case 'terminal':drawing=<>{rect(2,3,20,18)}{rect(2,3,20,4,s,1)}{line('m6 10 4 3-4 3m7 1h5')}</>;break;
 case 'activity':drawing=<>{circle(12,12,10,s)}<path d="M2 12h5l3-6 4 12 3-6h5" fill="none" stroke={primary} strokeWidth="2.5"/></>;break;
 case 'pin':drawing=<><path d="m9 2 10 5-4 3v6l-9-4 4-4Z" fill={p}/><path d="m9 14-5 8 7-7" fill={s}/></>;break;
 case 'git-status':drawing=<>{circle(12,12,10)}<path d="m7 12 3 3 7-7" fill="none" stroke={s} strokeWidth="3"/></>;break;
 case 'git-fetch':case 'git-push':case 'git-pull':drawing=<>{rect(2,17,20,5,s,1)}{circle(12,10,8)}{arrow}{name==='git-pull'&&line('M18 5v9m-2-2 2 2 2-2')}</>;break;
 case 'git-branch':drawing=<>{line('M6 5v14m0-7c12 0 12-3 12-7',true)}{circle(6,5,3)}{circle(6,19,3,s)}{circle(18,5,3,s)}</>;break;
 case 'git-commit':drawing=<>{line('M1 12h22',true)}{circle(12,12,6)}{circle(12,12,2,s)}</>;break;
 case 'plus':drawing=<><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z" fill={p}/>{rect(9,9,6,6,s,0)}</>;break;
 case 'attach':drawing=<><path d="m8 15 7-7a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7L14 3" fill="none" stroke={primary} strokeWidth="5"/><path d="m8 15 7-7" fill="none" stroke={s} strokeWidth="2"/></>;break;
 case 'send':case 'arrow':drawing=<><path d="m12 2 10 12h-7v8H9v-8H2Z" fill={p}/><path d="M12 2v20h3v-8h7Z" fill={s}/></>;break;
 case 'stop':case 'close':drawing=<>{rect(2,2,20,20,p,5)}{name==='stop'?rect(7,7,10,10,s,1):<path d="m7 7 10 10M17 7 7 17" stroke={s} strokeWidth="3"/>}</>;break;
 case 'spark':drawing=<><path d="m10 2 3 7 7 3-7 3-3 7-3-7-6-3 6-3Z" fill={p}/><path d="m20 1 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill={s}/></>;break;
 case 'search':drawing=<>{circle(10,10,7)}{circle(10,10,4,s)}<path d="m15 15 7 7" stroke={s} strokeWidth="4"/></>;break;
 case 'exam':drawing=<>{rect(4,4,16,18)}{rect(8,2,8,4,s,1)}<path d="m8 13 3 3 6-6" fill="none" stroke={s} strokeWidth="2.5"/></>;break;
 case 'shuffle':drawing=<><path d="M2 5h4c6 0 6 14 12 14h4M2 19h4c6 0 6-14 12-14h4" fill="none" stroke={primary} strokeWidth="3"/><path d="m17 1 5 4-5 4m0 6 5 4-5 4" fill={s}/></>;break;
 case 'diff':drawing=<>{rect(2,3,8,18)}{rect(14,3,8,18,s)}{line('M4 9h4m8 0h4m-2-2v4M4 15h4m8 0h4')}</>;break;
 case 'grade':drawing=<>{rect(3,12,5,9,p,1)}{rect(10,7,5,14,s,1)}{rect(17,2,5,19,p,1)}{line('M2 22h21')}</>;break;
 case 'slides':drawing=<>{line('M12 17v5m-5 0 5-3 5 3')}{rect(2,3,20,14)}<path d="m9 7 7 3-7 3Z" fill={s}/></>;break;
 case 'palette':drawing=<><path d="M22 10c0-12-21-12-21 2 0 11 12 12 13 7 0-3-3-5 2-5 3 0 6-1 6-4Z" fill={p}/>{circle(7,7,2,s)}{circle(14,6,2,'#ffd36a')}{circle(6,14,2,'#ff8ba7')}</>;break;
 case 'at':case 'hash':case 'slash':drawing=<>{rect(2,2,20,20,s,5)}<g stroke={primary} strokeWidth="2.3">{name==='at'?<>{circle(11,12,4,'none')}{line('M15 8v7c7 3 8-13-3-12C0 3 0 23 14 21')}</>:name==='hash'?line('M9 5 7 19m10-14-2 14M5 9h15M4 15h15'):line('M16 5 8 19')}</g></>;break;
 case 'math':drawing=<><path d="m12 2 10 19H2Z" fill={p}/><path d="m12 8 6 11H6Z" fill={s}/>{line('m7 18 2-1m1-4 2 1')}</>;break;
 case 'help':drawing=<>{circle(12,12,10)}<path d="M8 9c0-5 9-5 8 0-1 3-4 1-4 6" fill="none" stroke={s} strokeWidth="2.8"/>{circle(12,18,1.2,s)}</>;break;
 default:drawing=<>{rect(3,3,18,18)}{rect(7,7,10,10,s)}</>;
 }
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={config.ink} strokeWidth={config.width} strokeLinecap={config.fold?'square':'round'} strokeLinejoin={config.fold?'miter':'round'} focusable="false">
 {config.gradient&&<defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={primary}/><stop offset="1" stopColor={secondary}/></linearGradient></defs>}
 {config.tile&&<><rect x=".5" y=".5" width="23" height="23" rx="6" fill={config.tile} stroke={primary} strokeWidth=".7"/>{style==='color-glass'&&<path d="M2 9V5a3 3 0 0 1 3-3h9" stroke="#fff" strokeWidth="1.5"/>}</>}
 <g transform={config.tile?'translate(3 3) scale(.75)':config.sticker?'translate(2 2) scale(.83)':undefined}>
 {config.sticker&&<g fill="none" stroke="#fff" strokeWidth="4" style={{paintOrder:'stroke'}}>{drawing}</g>}
 {drawing}
 {config.fold&&<path d="m14 3 7 7h-7Z" fill={secondary} stroke={config.ink} strokeWidth=".7" opacity=".85"/>}
 </g>
 </svg>;
}
