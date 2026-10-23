// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
import {AccessToggle} from '../src/AccessToggle';
it('keeps eye, mouth and pen visible and selects permissions directly or by keyboard',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onChange=vi.fn();
 try{await act(async()=>root.render(React.createElement(AccessToggle,{value:'full',onChange})));const buttons=[...host.querySelectorAll<HTMLButtonElement>('[role=radio]')];expect(buttons).toHaveLength(3);expect(buttons.every(b=>b.textContent==='')).toBe(true);expect(buttons.every(b=>!!b.title&&!!b.getAttribute('aria-label'))).toBe(true);expect(buttons.map(b=>b.getAttribute('aria-checked'))).toEqual(['false','false','true']);expect(host.querySelectorAll('svg')).toHaveLength(3);for(const [index,id] of ['read','ask','full'].entries()){await act(async()=>buttons[index]!.click());expect(onChange).toHaveBeenLastCalledWith(id);}buttons[0]!.focus();await act(async()=>buttons[0]!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(onChange).toHaveBeenLastCalledWith('ask');expect(document.activeElement).toBe(buttons[1]);}finally{await act(async()=>root.unmount());host.remove();}
});
