// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,pickFiles:vi.fn(),subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/QuickFile',()=>({QuickFile:()=>null}));
import {NotebookPanel} from '../src/NotebookPanel';

let host:HTMLDivElement,root:Root;
const book=(choice?:unknown)=>({id:'b1',name:'KHTN',sources:[{id:'s',kind:'file',title:'a.pdf',origin:'/a.pdf',state:'san-sang',chars:10,on:true}],messages:[],...(choice?{choice}:{})});
const state={backends:[{id:'claude',installed:true}],catalog:{claude:[{id:'opus',label:'Opus'},{id:'haiku',label:'Haiku'}]},api:[]} as unknown as ViewState;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;(Element.prototype as any).scrollIntoView=()=>{};host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

it('chọn model riêng cho sổ, gửi nb.setModel và hiện lại lựa chọn đã lưu; Tự động là mặc định',async()=>{
 let current=book();
 mocks.rpc.mockReset().mockImplementation(async(method:string,p:any)=>{
  if(method==='nb.list')return [{id:'b1',name:'KHTN',sources:1,updatedAt:1}];
  if(method==='nb.get')return current;
  if(method==='nb.setModel'){current=book(p.choice==='auto'?undefined:p.choice);return current;}
  return true;
 });
 await act(async()=>root.render(React.createElement(NotebookPanel,{state,report:vi.fn(),notice:vi.fn(),openUrl:vi.fn()})));
 const select=()=>host.querySelector<HTMLSelectElement>('select[aria-label="Model cho sổ nguồn"]')!;
 expect(select().value).toBe('auto');
 const values=[...select().options].map(o=>o.value);
 expect(values[0]).toBe('auto');
 expect(values).toEqual(expect.arrayContaining(['claude|opus','claude|haiku']));
 await act(async()=>{select().value='claude|haiku';select().dispatchEvent(new Event('change',{bubbles:true}));});
 expect(mocks.rpc).toHaveBeenCalledWith('nb.setModel',{id:'b1',choice:{backend:'claude',model:'haiku'}});
 expect(select().value).toBe('claude|haiku');
 await act(async()=>{select().value='auto';select().dispatchEvent(new Event('change',{bubbles:true}));});
 expect(mocks.rpc).toHaveBeenLastCalledWith('nb.setModel',{id:'b1',choice:'auto'});
 expect(select().value).toBe('auto');
});

it('model đã lưu nhưng không còn cấu hình vẫn hiện, ghi rõ chưa cấu hình',async()=>{
 mocks.rpc.mockReset().mockImplementation(async(method:string)=>method==='nb.list'?[{id:'b1',name:'KHTN',sources:1,updatedAt:1}]:method==='nb.get'?book({backend:'codex',model:'gpt-x'}):true);
 await act(async()=>root.render(React.createElement(NotebookPanel,{state,report:vi.fn(),notice:vi.fn(),openUrl:vi.fn()})));
 const select=host.querySelector<HTMLSelectElement>('select[aria-label="Model cho sổ nguồn"]')!;
 expect(select.value).toBe('codex|gpt-x');expect(select.selectedOptions[0]!.textContent).toContain('chưa cấu hình');
});
