// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {PromptQueue} from '../src/PromptQueue';
import type {Chat} from '../src/ipc';

it('shows ordered prompts and exposes move, remove and resume controls',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const el=document.createElement('div'),root=createRoot(el),onChange=vi.fn();
 const chat:Chat={id:'chat',title:'Test',messages:[],summary:'',updatedAt:0,promptQueuePaused:true,pendingPrompts:[
  {id:'a',text:'Câu trước',mode:'queue',at:1,options:{}},
  {id:'b',text:'Bổ sung',mode:'steer',at:2,options:{}},
 ]};
 try{
  await act(async()=>root.render(React.createElement(PromptQueue,{chat,busy:false,onChange})));
  expect([...el.querySelectorAll('li p')].map(p=>p.textContent)).toEqual(['Câu trước','Bổ sung']);
  expect(el.textContent).toContain('Đã tạm dừng');
  const up=el.querySelectorAll<HTMLButtonElement>('[aria-label="Đưa prompt lên"]');
  const down=el.querySelectorAll<HTMLButtonElement>('[aria-label="Đưa prompt xuống"]');
  expect(up[0]!.disabled).toBe(true);expect(down[1]!.disabled).toBe(true);
  await act(async()=>up[1]!.click());expect(onChange).toHaveBeenLastCalledWith('b','up');
  await act(async()=>down[0]!.click());expect(onChange).toHaveBeenLastCalledWith('a','down');
  await act(async()=>el.querySelector<HTMLButtonElement>('[aria-label="Xóa prompt chờ"]')!.click());expect(onChange).toHaveBeenLastCalledWith('a','remove');
  await act(async()=>el.querySelector<HTMLButtonElement>('header button')!.click());expect(onChange).toHaveBeenLastCalledWith('','resume');
  await act(async()=>root.render(React.createElement(PromptQueue,{chat,busy:true,onChange})));
  expect(el.querySelector('header button')).toBeNull();
 }finally{await act(async()=>root.unmount());}
});
