// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {PlanningControls,PlanningProgress,planningMinutes} from '../src/PlanningControls';
it('selects three modes and shows the editable KGH budget beside either planning mode',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div'),root=createRoot(el),onMode=vi.fn(),onTime=vi.fn();
 try{
 for(const mode of ['chat','plan','pro'] as const){await act(async()=>root.render(React.createElement(PlanningControls,{mode,time:'KGH',onMode,onTime})));expect([...el.querySelectorAll('option')].map(e=>e.textContent)).toEqual(['Chat','◇ Plan','◇ Plan Pro']);expect(el.querySelector('input')?.value).toBe(mode==='chat'?undefined:'KGH');}
 await act(async()=>{const select=el.querySelector('select')!;select.value='plan';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(onMode).toHaveBeenCalledWith('plan');
 expect(planningMinutes('KGH')).toBe(0);expect(planningMinutes('')).toBe(0);expect(planningMinutes('25')).toBe(1500000);for(const bad of ['0','-1','NaN','1.5','40000'])expect(()=>planningMinutes(bad)).toThrow();
 await act(async()=>root.render(React.createElement(PlanningProgress,{run:{mode:'pro',timeoutMs:0,startedAt:1,updatedAt:1,phase:'interrupted',round:1,issues:['Đã dừng'],draft:'bản nháp còn lại'}})));expect(el.textContent).toContain('Đã dừng');expect(el.querySelector('pre')?.textContent).toBe('bản nháp còn lại');
 await act(async()=>root.render(React.createElement(PlanningProgress,{run:{mode:'pro',timeoutMs:0,startedAt:1,updatedAt:2,phase:'published',round:1,issues:[]}})));expect(el.textContent).toContain('Đã chốt · Quy trình đã lưu');expect(el.textContent).not.toContain('Chuyển sang Chat');
 }finally{await act(async()=>root.unmount());}
});
it.each(['plan','pro'] as const)('opens workflows directly from %s controls',async mode=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div'),root=createRoot(el),onWorkflow=vi.fn();
 try{await act(async()=>root.render(React.createElement(PlanningControls,{mode,time:'KGH',onMode:vi.fn(),onTime:vi.fn(),onWorkflow})));
 const button=el.querySelector<HTMLButtonElement>('[aria-label="Mở quy trình trực quan"]');expect(button).not.toBeNull();await act(async()=>button!.click());expect(onWorkflow).toHaveBeenCalledOnce();}finally{await act(async()=>root.unmount());}
});
it('shows Approve right after the mode selector: grey and disabled in Chat, red and clickable in Plan/Plan Pro',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div'),root=createRoot(el),onApprove=vi.fn();
 try{
  const render=(mode:'chat'|'plan'|'pro',approving=false)=>act(async()=>root.render(React.createElement(PlanningControls,{mode,time:'KGH',onMode:vi.fn(),onTime:vi.fn(),onWorkflow:vi.fn(),onApprove,approving})));
  await render('chat');let b=el.querySelector<HTMLButtonElement>('.plan-approve')!;
  expect(b.textContent).toBe('Duyệt');expect(b.disabled).toBe(true);expect(b.classList.contains('on')).toBe(false);
  expect(el.querySelector('select')!.nextElementSibling).toBe(b);
  await act(async()=>b.click());expect(onApprove).not.toHaveBeenCalled();
  for(const mode of ['plan','pro'] as const){await render(mode);b=el.querySelector<HTMLButtonElement>('.plan-approve')!;expect(b.disabled).toBe(false);expect(b.classList.contains('on')).toBe(true);expect(el.querySelector('select')!.nextElementSibling).toBe(b);await act(async()=>b.click());}
  expect(onApprove).toHaveBeenCalledTimes(2);
  await render('plan',true);b=el.querySelector<HTMLButtonElement>('.plan-approve')!;expect(b.disabled).toBe(true);expect(b.textContent).toBe('Đang duyệt…');
 }finally{await act(async()=>root.unmount());}
});
