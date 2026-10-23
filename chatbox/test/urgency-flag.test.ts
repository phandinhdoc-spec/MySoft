// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {ICON_STYLES} from '@pvta/shared';
import {UrgencyFlag} from '../src/ActivityRail';
import {setIconStyle} from '../src/icon-preference';

it.each(['light','dark'])('changes the visible flag color with its state across icon styles (%s)',async theme=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 document.documentElement.dataset.theme=theme;
 const css=document.createElement('style');
 const activityCss=readFileSync('chatbox/src/activity-bar.css','utf8');
 css.textContent=activityCss.match(/\.activity-bar \.activity-urgency\.(?:calm|urgent)\{[^}]+\}/g)!.join('\n')+'\n'+readFileSync('chatbox/src/icons.css','utf8');
 document.head.append(css);
 const host=document.createElement('nav');host.className='activity-bar';document.body.append(host);
 const root=createRoot(host);
 function Toggle(){const [urgent,setUrgent]=React.useState(false);return React.createElement(UrgencyFlag,{urgent,note:'',onToggle:()=>setUrgent(value=>!value)});}
 try{
  await act(async()=>root.render(React.createElement(Toggle)));
  for(const style of ICON_STYLES){
   await act(async()=>setIconStyle(style.id));
   const button=host.querySelector('button')!;
   for(const urgent of [false,true,false]){
    if(button.getAttribute('aria-pressed')!==String(urgent))await act(async()=>button.click());
    const expected=urgent?'rgb(220, 38, 38)':'rgb(22, 163, 74)';
    expect(button.getAttribute('aria-label')).toContain(urgent?'Cờ đỏ':'Cờ xanh');
    expect(getComputedStyle(button).color).toBe(expected);
    expect(getComputedStyle(button.querySelector('svg')!).color,style.id).toBe(expected);
   }
  }
 }finally{await act(async()=>root.unmount());setIconStyle('lucide');host.remove();css.remove();delete document.documentElement.dataset.theme;}
});
