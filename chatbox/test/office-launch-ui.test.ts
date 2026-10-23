// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,vi,expect} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('../src/ipc',()=>({rpc}));
import {OfficePanel} from '../src/OfficePanel';import type {ViewState} from '../src/ipc';
it('opens Office instead of inserting a prompt; connection success requires a matching session',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div');document.body.append(el);const root=createRoot(el),report=vi.fn(),notice=vi.fn(),onUse=vi.fn();
 const state={office:{running:true,selected:'',sessions:[]}} as unknown as ViewState;
 const render=(state:ViewState)=>act(async()=>root.render(React.createElement(OfficePanel,{state,report,notice,onUse})));
 try{await render(state);for(const host of ['word','excel','powerpoint']){rpc.mockResolvedValue({launchId:host,path:`/new.${host}`,host});await act(async()=>el.querySelectorAll<HTMLButtonElement>('.office-launch-card')[['word','excel','powerpoint'].indexOf(host)]!.click());expect(rpc).toHaveBeenLastCalledWith('officeCreate',{host});expect(onUse).not.toHaveBeenCalled();expect(el.querySelector('[role=status]')?.textContent).toContain('Đang chờ add-in');}
 await render({...state,office:{...state.office!,sessions:[{id:'s',host:'powerpoint',name:'New',launchId:'powerpoint'}]}});expect(el.querySelector('[role=status]')?.textContent).toContain('Đã kết nối với PVTA Chat');
 await act(async()=>el.querySelector<HTMLButtonElement>('[role=status] button')!.click());expect(rpc).toHaveBeenLastCalledWith('officeSelect',{id:'s'});expect(onUse).toHaveBeenCalledWith('/office-live ');
 rpc.mockRejectedValueOnce(Error('Office chưa cài'));await act(async()=>el.querySelector<HTMLButtonElement>('.office-launch-card')!.click());expect(report).toHaveBeenCalled();expect(el.querySelector<HTMLButtonElement>('.office-launch-card')!.disabled).toBe(false);
 }finally{await act(async()=>root.unmount());el.remove();}
});
it('consumes a sidebar launch once so returning to Office does not create another file',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;rpc.mockClear();rpc.mockResolvedValue({launchId:'new',path:'/new.docx',host:'word'});
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);const state={office:{running:true,selected:'',sessions:[]}} as unknown as ViewState;
 function Harness({visible}:{visible:boolean}){const [request,setRequest]=React.useState<{create:string}|undefined>({create:'word'});return visible?React.createElement(OfficePanel,{state,report:vi.fn(),notice:vi.fn(),onUse:vi.fn(),navigationRequest:request,onNavigated:()=>setRequest(undefined)}):null;}
 try{await act(async()=>root.render(React.createElement(Harness,{visible:true})));expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenLastCalledWith('officeCreate',{host:'word'});await act(async()=>root.render(React.createElement(Harness,{visible:false})));await act(async()=>root.render(React.createElement(Harness,{visible:true})));expect(rpc).toHaveBeenCalledTimes(1);}finally{await act(async()=>root.unmount());el.remove();}
});
