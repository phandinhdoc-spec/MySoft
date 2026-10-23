// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FONT_OPTIONS,ICON_STYLES} from '@pvta/shared';
import {AppearanceOptions} from '../src/AppearanceOptions';
import {Icon} from '../src/Icon';
import {setIconStyle} from '../src/icon-preference';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>{root.unmount();setIconStyle('lucide');});host.remove();});
it('previews all icon styles and fonts and sends the selected persisted values',async()=>{
 const onChange=vi.fn();await act(async()=>root.render(React.createElement(AppearanceOptions,{onChange,fontFamily:'inter',iconStyle:'tabler'})));
 expect(host.querySelectorAll('.icon-style-option')).toHaveLength(ICON_STYLES.length);expect(host.querySelectorAll('.font-style-option')).toHaveLength(FONT_OPTIONS.length);
 for(const option of ICON_STYLES){const button=host.querySelector<HTMLButtonElement>(`[aria-label="Chọn bộ icon ${option.name}"]`)!;expect(button.querySelectorAll('svg')).toHaveLength(6);await act(async()=>button.click());expect(onChange).toHaveBeenLastCalledWith({iconStyle:option.id});}
 for(const option of FONT_OPTIONS){await act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="Chọn font ${option.name}"]`)!.click());expect(onChange).toHaveBeenLastCalledWith({fontFamily:option.id});}
});
it('changes existing icons immediately while explicit previews keep their own style',async()=>{
 await act(async()=>root.render(React.createElement('div',null,React.createElement(Icon,{name:'chat'}),React.createElement(Icon,{name:'chat',style:'classic'}))));
 const first=()=>host.querySelector('.icon')!;const lucide=first().innerHTML;
 await act(async()=>setIconStyle('tabler'));expect(first().getAttribute('data-icon-style')).toBe('tabler');expect(first().innerHTML).not.toBe(lucide);
 await act(async()=>setIconStyle('phosphor-fill'));expect(first().getAttribute('data-icon-style')).toBe('phosphor-fill');expect(host.querySelectorAll('.icon')[1]!.getAttribute('data-icon-style')).toBe('classic');
 await act(async()=>setIconStyle('unknown'));expect(first().getAttribute('data-icon-style')).toBe('lucide');
});
it('offers ten genuinely multicolor styles, distinct treatments, and unique gradient references',async()=>{
 const {COLOR_ICON_STYLES}=await import('@pvta/shared');
 const {lucideIcons}=await import('../src/icon-sets');
 expect(COLOR_ICON_STYLES).toHaveLength(10);
 const treatments=new Set<string>();
 for(const option of COLOR_ICON_STYLES){
  await act(async()=>root.render(React.createElement('div',null,...Object.keys(lucideIcons).concat('github').map(name=>React.createElement(Icon,{key:name,name,style:option.id})))));
  const icons=[...host.querySelectorAll('.icon')];expect(icons).toHaveLength(Object.keys(lucideIcons).length+1);
  for(const icon of icons){const colors=new Set([...icon.querySelectorAll('[fill],[stroke],[stop-color]')].flatMap(e=>['fill','stroke','stop-color'].map(k=>e.getAttribute(k))).filter(c=>c?.startsWith('#')));expect(colors.size,`${option.id}: ${icon.outerHTML}`).toBeGreaterThanOrEqual(2);expect(icon.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');}
  const ids=[...host.querySelectorAll('linearGradient')].map(g=>g.id);expect(new Set(ids).size).toBe(ids.length);
  for(const e of host.querySelectorAll('[fill^="url"]')){const id=e.getAttribute('fill')!.slice(5,-1);expect(ids).toContain(id);}
  treatments.add(icons[0]!.innerHTML);
 }
 expect(treatments.size).toBe(10);
 await act(async()=>root.render(React.createElement(Icon,{name:'mouth'})));await act(async()=>setIconStyle('color-spectrum'));expect(host.querySelector('.icon')?.getAttribute('data-icon-style')).toBe('color-spectrum');expect(host.querySelector('path')?.getAttribute('d')).toContain('M2 12');
});
it('offers a toolbar size control with a frame preview and a reset action',async()=>{
 const onChange=vi.fn();await act(async()=>root.render(React.createElement(AppearanceOptions,{onChange,toolbarIconSize:20})));
 const slider=host.querySelector<HTMLInputElement>('#toolbar-icon-size')!;expect(slider.value).toBe('20');expect(host.querySelector('.toolbar-size-preview')?.getAttribute('style')).toContain('--composer-button-size: 34px');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(slider,'24');slider.dispatchEvent(new Event('input',{bubbles:true}));});expect(onChange).toHaveBeenLastCalledWith({toolbarIconSize:24});
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Đặt lại kích thước mặc định')!.click());expect(onChange).toHaveBeenLastCalledWith({toolbarIconSize:16});
});
it('gives monochrome icons different semantic colors without replacing their glyphs',async()=>{
 const {COLOR_ICON_STYLES}=await import('@pvta/shared');
 for(const option of ICON_STYLES.filter(s=>!COLOR_ICON_STYLES.some(c=>c.id===s.id))){
  await act(async()=>root.render(React.createElement('div',null,...['chat','project','notebook','workflow','spark','settings'].map(name=>React.createElement(Icon,{key:name,name,style:option.id})))));
  const icons=[...host.querySelectorAll('.icon')];
  expect(new Set(icons.map(icon=>icon.getAttribute('data-icon-tone'))).size).toBe(6);
  for(const icon of icons){expect(icon.querySelectorAll('svg')).toHaveLength(1);expect(icon.querySelector('svg')?.getAttribute('viewBox')).toBe(option.id.startsWith('phosphor')?'0 0 256 256':'0 0 24 24');}
 }
});
