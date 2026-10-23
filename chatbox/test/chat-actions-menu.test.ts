// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChatActions} from '../src/ChatActions';
import {rpc,type Chat} from '../src/ipc';
vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
let host:HTMLDivElement,root:Root;
const report=vi.fn(),done=vi.fn(),open=vi.fn();
const chat={id:'other',title:'Chưa mở',projectId:'p',messages:[]} as unknown as Chat;
const render=()=>act(async()=>root.render(React.createElement(ChatActions,{chat,projects:[{id:'p',name:'Dự án'},{id:'q',name:'Khác'}],variant:'inline',report,onDone:done},React.createElement('button',{onClick:open},chat.title))));
const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
const command=(s:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent===s)!;
const menu=()=>host.querySelector<HTMLElement>('.chat-object')!;
const openMenu=(el:Element=menu())=>act(async()=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.mocked(rpc).mockResolvedValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('row right click, ellipsis and keyboard open identical commands without opening the chat',async()=>{
 await render();await openMenu();const labels=[...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent);
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await act(async()=>host.querySelector('.chat-object')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 expect([...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent)).toEqual(labels);
 expect(rpc).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
 await click(command('Xóa'));expect(rpc).not.toHaveBeenCalled();await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Giữ lại')!);
 await click(host.querySelector('button')!);expect(open).toHaveBeenCalledOnce();
});
it('rename and move target the unopened chat, preserves native input menu',async()=>{
 await render();await openMenu();await click(command('Đổi tên'));
 const input=document.querySelector('.chat-object-form input')!;
 const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});await act(async()=>input.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Tên mới');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>document.querySelector('.chat-object-form form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(rpc).toHaveBeenCalledWith('renameChat',{chatId:'other',title:'Tên mới'});
 await openMenu();await click(command('Chuyển vào dự án'));
 await click(document.querySelectorAll('[role=menuitemradio]')[2]!);
 expect(rpc).toHaveBeenLastCalledWith('moveChat',{chatId:'other',projectId:'q'});expect(done).toHaveBeenLastCalledWith({project:'q'});expect(open).not.toHaveBeenCalled();
});
it.each([false,true])('opens the project list beside the move command, including the right edge (%s)',async(atEdge)=>{
 await render();await openMenu();
 const move=command('Chuyển vào dự án'),left=atEdge?window.innerWidth-240:100;
 vi.spyOn(move,'getBoundingClientRect').mockReturnValue({left,right:left+230,top:120,bottom:158,width:230,height:38} as DOMRect);
 const original=HTMLElement.prototype.getBoundingClientRect;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.classList.contains('chat-project-picker')?{width:240,height:140} as DOMRect:original.call(this);});
 await click(move);
 const picker=document.querySelector<HTMLElement>('.chat-project-picker')!;
 expect(picker.style.left).toBe(`${atEdge?left-246:left+236}px`);expect(picker.style.top).toBe('120px');
 expect(document.querySelector('.chat-object-form')).toBeNull();expect(rpc).not.toHaveBeenCalled();
 expect(document.querySelector('[aria-checked=true]')?.textContent).toContain('Dự án');
 await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
 expect(document.activeElement?.textContent).toBe('Khác');
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 expect(document.querySelector('.chat-project-picker')).toBeNull();expect(rpc).not.toHaveBeenCalled();
});
it('delete requires confirmation, rejects double submit and reports RPC errors',async()=>{
 await render();await openMenu();await click(command('Xóa'));expect(rpc).not.toHaveBeenCalled();
 vi.mocked(rpc).mockRejectedValueOnce(Error('Không có quyền'));
 await act(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Xóa hẳn')!;b.click();b.click();});
 expect(rpc).toHaveBeenCalledExactlyOnceWith('deleteChat',{chatId:'other'});expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'Không có quyền'}));expect(done).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('Giữ lại');
});
it('hover opens projects without moving or stealing focus and keeps both menus usable',async()=>{
 await render();await openMenu();const focused=document.activeElement,move=command('Chuyển vào dự án');
 await act(async()=>move.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));
 expect(document.querySelector('.chat-project-picker')).not.toBeNull();expect(document.activeElement).toBe(focused);
 expect(move.getAttribute('aria-expanded')).toBe('true');expect(rpc).not.toHaveBeenCalled();
 const target=document.querySelectorAll('[role=menuitemradio]')[2]!;
 await act(async()=>{move.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:target}));target.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:move}));target.dispatchEvent(new Event('pointerdown',{bubbles:true}));(target as HTMLElement).focus();});
 expect(command('Chuyển vào dự án')).toBe(move);
 await click(target);expect(rpc).toHaveBeenCalledExactlyOnceWith('moveChat',{chatId:'other',projectId:'q'});
 expect(document.querySelector('.chat-project-picker')).toBeNull();
});
it('hovering another command closes projects without moving the chat',async()=>{
 await render();await openMenu();
 await act(async()=>command('Chuyển vào dự án').dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));
 await act(async()=>command('Đổi tên').dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));
 expect(document.querySelector('.chat-project-picker')).toBeNull();expect(rpc).not.toHaveBeenCalled();
});
