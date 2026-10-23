// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {builtinCatalog} from '@pvta/shared';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc}));
import {ModelStatusBar} from '../src/ModelStatusBar';
import type {ViewState} from '../src/ipc';
let host:HTMLDivElement,root:Root;
const patch=vi.fn(),onModel=vi.fn();
const state=():ViewState=>({data:{preferences:{choice:{backend:'claude',model:'opus'},effort:'medium'}},backends:[{id:'claude',installed:true,efforts:['low','medium','high']}],catalog:builtinCatalog(),api:[],modelUsage:{claude:{updatedAt:Date.now(),fiveHour:{usedPercent:25},week:{usedPercent:40}}}} as unknown as ViewState);
const render=(s=state(),busy=false)=>act(async()=>root.render(React.createElement(ModelStatusBar,{state:s,busy,onModel,onPatch:patch})));
const change=async(label:string,value:string)=>act(async()=>{const select=host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;patch.mockReset();onModel.mockReset();mocks.rpc.mockReset().mockResolvedValue(undefined);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('places reasoning, speed and provider quotas to the right of the model',async()=>{
 await render();expect(host.querySelector('.model-control')?.textContent).toContain('Opus');
 expect(host.querySelector('.model-control')?.nextElementSibling?.className).toBe('model-status-controls');
 expect([...host.querySelectorAll('meter')].map(m=>m.value)).toEqual([75,60]);expect(host.textContent).toContain('75%');expect(host.textContent).toContain('75%');
 await change('Mức suy nghĩ của model','high');expect(patch).toHaveBeenLastCalledWith({effort:'high'});
 await change('Mức suy nghĩ của model','');expect(patch).toHaveBeenLastCalledWith({effort:null});
 await change('Tốc độ của model','fast');expect(patch).toHaveBeenLastCalledWith({choice:{backend:'claude',model:'opus',speed:'fast'}});
 await act(async()=>host.querySelector<HTMLButtonElement>('.model-control')!.click());expect(onModel).toHaveBeenCalledOnce();
});
it('shows honest unknown limits and disables options not supported by the selected model',async()=>{
 const s=state();s.data.preferences.choice={backend:'claude',model:'haiku'};s.modelUsage={codex:{updatedAt:Date.now(),fiveHour:{usedPercent:1}}};await render(s);
 expect([...host.querySelectorAll('select')].every(select=>select.disabled)).toBe(true);expect(host.querySelectorAll('meter')).toHaveLength(0);expect([...host.querySelectorAll('.model-quota b')].map(e=>e.textContent)).toEqual(['Chưa có số liệu','Chưa có số liệu']);
});
it('does not treat an expired window as automatically refilled and locks settings during a run',async()=>{
 const s=state();s.modelUsage!.claude!.fiveHour={usedPercent:90,resetsAt:Date.now()-1};await render(s,true);
 expect(host.querySelector('.model-quota b')?.textContent).toBe('Chưa có số liệu');expect(host.querySelector('.model-quota')?.getAttribute('title')).toContain('chờ nguồn AI cập nhật');expect([...host.querySelectorAll('select')].every(select=>select.disabled)).toBe(true);
});

it('fetches both percentage windows on selection and allows a manual refresh without any model turn',async()=>{
 const s=state();delete s.modelUsage;mocks.rpc.mockResolvedValue({fiveHour:{usedPercent:4},week:{usedPercent:24},updatedAt:Date.now(),checkedAt:Date.now()});
 await render(s);expect(mocks.rpc).toHaveBeenCalledWith('providerUsage',{backend:'claude'});expect(host.textContent).toContain('96%');expect(host.textContent).toContain('76%');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Làm mới hạn mức AI"]')!.click());expect(mocks.rpc).toHaveBeenLastCalledWith('providerUsage',{backend:'claude',force:true});
});
it('handles automatic mode without reading a quota for an unknown provider',async()=>{
 const s=state();s.data.preferences.choice='auto';await render(s);expect(host.textContent).toContain('Tự động chọn AI');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('supports Command Code DeepSeek reasoning and fetches quotas for that API account',async()=>{
 const s=state();s.data.preferences.choice={backend:'api',model:'commandcode/deepseek/deepseek-v4-flash'};s.api=[{id:'commandcode',label:'Command Code',configured:true,baseUrl:'https://api.commandcode.ai/provider/v1',models:[]}];
 mocks.rpc.mockResolvedValue({fiveHour:{usedPercent:32},week:{usedPercent:41},updatedAt:Date.now()});await render(s);
 expect(host.querySelector<HTMLSelectElement>('[aria-label="Mức suy nghĩ của model"]')!.disabled).toBe(false);
 await change('Mức suy nghĩ của model','max');expect(patch).toHaveBeenLastCalledWith({effort:'max'});
 expect(mocks.rpc).toHaveBeenCalledWith('providerUsage',{backend:'api',provider:'commandcode'});expect(host.textContent).toContain('68%');expect(host.textContent).toContain('59%');
 await change('Tốc độ của model','fast');expect(patch).toHaveBeenLastCalledWith({effort:'low'});await change('Tốc độ của model','thorough');expect(patch).toHaveBeenLastCalledWith({effort:'max'});
});
it('shows the countdown to each quota reset next to the remaining percentage',async()=>{
 const s=state(),n=Date.now();
 s.modelUsage={claude:{updatedAt:n,fiveHour:{usedPercent:48,resetsAt:n+90*60_000},week:{usedPercent:28,resetsAt:n+(2*24+5)*3_600_000}}} as any;
 await render(s);
 expect([...host.querySelectorAll('.model-quota-reset')].map(e=>e.textContent)).toEqual(['1h30','2d 5h']);
 expect(host.querySelector('.model-quota')?.textContent).toContain('52%');
});
