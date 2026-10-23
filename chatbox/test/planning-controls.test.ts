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
 }finally{await act(async()=>root.unmount());}
});
it.each(['plan','pro'] as const)('opens workflows directly from %s controls',async mode=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div'),root=createRoot(el),onWorkflow=vi.fn();
 try{await act(async()=>root.render(React.createElement(PlanningControls,{mode,time:'KGH',onMode:vi.fn(),onTime:vi.fn(),onWorkflow})));
 const button=el.querySelector<HTMLButtonElement>('[aria-label="Mở quy trình trực quan"]');expect(button).not.toBeNull();await act(async()=>button!.click());expect(onWorkflow).toHaveBeenCalledOnce();}finally{await act(async()=>root.unmount());}
});
