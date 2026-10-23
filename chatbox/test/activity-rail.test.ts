// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {ActivityRail,ACTIVITY_MENUS,nextSidebarSelection} from '../src/ActivityRail';
it('keeps the icon rail available when the active panel is collapsed and toggles the same icon',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let selected='chat',collapsed=false;
 const show=()=>root.render(React.createElement(ActivityRail,{selected,collapsed,onSettings:vi.fn(),onHome:vi.fn(),onSelect:key=>{const next=nextSidebarSelection(selected,collapsed,key);selected=next.selected;collapsed=next.collapsed;show();}}));
 try{await act(async()=>show());const click=async(label:string)=>act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
 expect(host.querySelectorAll('.activity-items button')).toHaveLength(ACTIVITY_MENUS.length);
 await click('Trò chuyện');expect(collapsed).toBe(true);expect(host.querySelector('[aria-label="Trò chuyện"]')?.getAttribute('aria-expanded')).toBe('false');expect(host.querySelectorAll('.activity-items button')).toHaveLength(ACTIVITY_MENUS.length);
 await click('Trò chuyện');expect(collapsed).toBe(false);await click('Dự án');expect(selected).toBe('projects');expect(collapsed).toBe(false);
 const button=host.querySelector<HTMLButtonElement>('[aria-label="Dự án"]')!;button.focus();await act(async()=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));expect(document.activeElement?.getAttribute('aria-label')).toBe('Lịch sử');
 }finally{await act(async()=>root.unmount());host.remove();}
});
