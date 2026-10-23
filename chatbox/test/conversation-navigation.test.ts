// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Conversation} from '../src/Conversation';
const mocks=vi.hoisted(()=>({rpc:vi.fn(()=>Promise.resolve(true)),subscribe:vi.fn()}));
vi.mock('../src/ipc',()=>mocks);
import {RunningTasks} from '../src/RunningTasks';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('manages running work from the dots: list, open, stop, and hide by x, Esc or outside click',async()=>{
 const go=vi.fn(),stopped=vi.fn();const state={data:{chats:[{id:'other',title:'Plan đang chạy'}],workflows:[{id:'w1',name:'Quy trình A',runs:[{status:'running'}]}]}} as any;
 const render=(busy:string[])=>act(async()=>root.render(React.createElement(RunningTasks,{state,busy:new Set(busy),onChat:go,onWorkflow:go,report:stopped})));
 await render(['other']);expect(host.querySelector('.running-popover')).toBeNull();expect(host.textContent).not.toContain('đang chạy');
 const trigger=()=>host.querySelector<HTMLButtonElement>('.running-trigger')!;
 await act(async()=>trigger().click());expect(document.querySelector('.running-popover')?.parentElement).toBe(document.body);expect(document.querySelector('.running-popover')?.textContent).toContain('2 đang chạy');
 const openButton=document.querySelector<HTMLButtonElement>('.running-open')!;
 await act(async()=>openButton.dispatchEvent(new Event('pointerdown',{bubbles:true})));
 expect(document.querySelector('.running-popover')).not.toBeNull();
 await act(async()=>openButton.click());expect(go).toHaveBeenCalledWith('other');expect(document.querySelector('.running-popover')).toBeNull();
 await act(async()=>trigger().click());await act(async()=>document.querySelector<HTMLButtonElement>('.running-stop')!.click());expect(mocks.rpc).toHaveBeenCalledWith('cancel',{chatId:'other'});
 await act(async()=>document.querySelector<HTMLButtonElement>('.running-popover header button')!.click());expect(document.querySelector('.running-popover')).toBeNull();
 await act(async()=>trigger().click());const esc=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});const spy=vi.fn();window.addEventListener('keydown',spy);await act(async()=>{document.body.dispatchEvent(esc);});window.removeEventListener('keydown',spy);
 expect(document.querySelector('.running-popover')).toBeNull();expect(spy).not.toHaveBeenCalled();
 await act(async()=>trigger().click());await act(async()=>{document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));});expect(document.querySelector('.running-popover')).toBeNull();
 await render([]);await act(async()=>{});
});
it('renders nothing when no work is running',async()=>{
 const state={data:{chats:[{id:'a',title:'A'}],workflows:[]}} as any;
 await act(async()=>root.render(React.createElement(RunningTasks,{state,busy:new Set<string>(),onChat:()=>{},onWorkflow:()=>{}})));expect(host.innerHTML).toBe('');
});
it('shows a latest-message button while reading older messages and does not pull the reader down on updates',async()=>{
 const render=(key:string)=>act(async()=>root.render(React.createElement(Conversation,{scope:'scroll-test',updateKey:key},React.createElement('p',{},'Messages '+key))));
 await render('one');const el=host.querySelector<HTMLDivElement>('.conversation')!;
 Object.defineProperties(el,{scrollHeight:{value:2000,configurable:true},clientHeight:{value:500,configurable:true}});
 el.scrollTop=300;await act(async()=>el.dispatchEvent(new Event('scroll',{bubbles:true})));
 expect(host.querySelector('.jump-latest')).not.toBeNull();await render('two');expect(el.scrollTop).toBe(300);
 el.scrollTo=vi.fn(({top}:any)=>{el.scrollTop=top;});await act(async()=>host.querySelector<HTMLButtonElement>('.jump-latest')!.click());expect(el.scrollTo).toHaveBeenCalledWith({top:2000,behavior:'smooth'});expect(host.querySelector('.jump-latest')).toBeNull();
});
