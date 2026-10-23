// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AppearancePicker} from '../src/AppearancePicker';
import {useAppearance} from '../src/useAppearance';
import type {PaletteId} from '@pvta/shared';
let host:HTMLDivElement,root:Root,media:EventTarget&{matches:boolean};
function Applied({palette}:{palette:PaletteId}){useAppearance({palette,fontSize:16});return null;}
it('applies and restores interface scale together with composer dimensions',async()=>{
 function Sized({size}:{size:number}){useAppearance({fontSize:16,toolbarIconSize:size});return null;}
 await act(async()=>root.render(React.createElement(Sized,{size:24})));
 expect(document.documentElement.style.getPropertyValue('--ui-icon-scale')).toBe('1.5');
 expect(document.documentElement.style.getPropertyValue('--composer-icon-size')).toBe('24px');
 await act(async()=>root.render(React.createElement(Sized,{size:16})));
 expect(document.documentElement.style.getPropertyValue('--ui-icon-scale')).toBe('1');
});
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 media=Object.assign(new EventTarget(),{matches:false});vi.stubGlobal('matchMedia',()=>media);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();document.documentElement.removeAttribute('style');delete document.documentElement.dataset.theme;delete document.documentElement.dataset.palette;vi.unstubAllGlobals();});
it.each(['light','dark'] as const)('keeps contrast %s fixed through system appearance changes',async mode=>{
 await act(async()=>root.render(React.createElement(Applied,{palette:`contrast-${mode}`})));
 for(const matches of [true,false]){
  await act(async()=>{media.matches=matches;media.dispatchEvent(new Event('change'));});
  expect(document.documentElement.dataset.theme).toBe(mode);
  expect(document.documentElement.style.colorScheme).toBe(mode);
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe(mode==='dark'?'#000000':'#ffffff');
 }
});
it('keeps regular themes following the system after leaving a fixed theme',async()=>{
 await act(async()=>root.render(React.createElement(Applied,{palette:'contrast-dark'})));
 await act(async()=>root.render(React.createElement(Applied,{palette:'paper'})));
 expect(document.documentElement.dataset.theme).toBe('light');
 await act(async()=>{media.matches=true;media.dispatchEvent(new Event('change'));});expect(document.documentElement.dataset.theme).toBe('dark');
});
it('offers both contrast choices and sends their persisted palette IDs',async()=>{
 const onChange=vi.fn();await act(async()=>root.render(React.createElement(AppearancePicker,{value:'contrast-light',onChange})));
 for(const [name,id] of [['Sáng tương phản cao','contrast-light'],['Tối tương phản cao','contrast-dark']]){
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(name!))!;
  expect(button.getAttribute('aria-pressed')).toBe(String(id==='contrast-light'));
  await act(async()=>button.click());expect(onChange).toHaveBeenLastCalledWith(id);
 }
});
it.each(['contrast-dark','contrast-light','ocean'] as const)('system button follows OS from %s and stays synchronized',async initial=>{
 function Settings(){const [palette,setPalette]=React.useState<PaletteId>(initial);useAppearance({palette,fontSize:16});return React.createElement(AppearancePicker,{value:palette,onChange:setPalette});}
 await act(async()=>root.render(React.createElement(Settings)));
 const button=host.querySelector<HTMLButtonElement>('button[aria-label="Theo hệ thống"]');
 expect(button).not.toBeNull();
 expect(button!.getAttribute('aria-pressed')).toBe(String(initial==='ocean'));
 await act(async()=>button!.click());
 expect(button!.getAttribute('aria-pressed')).toBe('true');
 expect(document.documentElement.dataset.palette).toBe(initial==='ocean'?'ocean':'vscode-contrast');
 for(const matches of [true,false,true]){await act(async()=>{media.matches=matches;media.dispatchEvent(new Event('change'));});expect(document.documentElement.dataset.theme).toBe(matches?'dark':'light');}
});
