// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),subscribe:vi.fn()}));
vi.mock('../src/ipc',()=>mocks);
import {SidebarNav} from '../src/SidebarNav';
let host:HTMLDivElement,root:Root;
const state={data:{projects:Array.from({length:8},(_,i)=>({id:`p${i}`,name:`Dự án ${i}`})),chats:Array.from({length:15},(_,i)=>({id:`c${i}`,title:`Chat ${i}`,projectId:i===14?'p0':undefined,updatedAt:i,messages:i===14?[{at:1,plan:{id:'plan',approved:true,steps:[{status:'done'}]}}]:[]})),workflows:Array.from({length:15},(_,i)=>({id:`w${i}`,name:`Quy trình ${i}`,createdAt:i,updatedAt:20-i,planId:i===14?'plan':undefined,steps:[],runs:[]}))}} as unknown as ViewState;
const props={state,nav:'chat',active:'',project:'',githubVisible:false,newDocs:0,onNavigate:vi.fn(),onChat:vi.fn(),onProject:vi.fn(),onProjectEdit:vi.fn(),onProjectLearning:vi.fn(),onProjectDeleted:vi.fn(),report:vi.fn(),onWorkflow:vi.fn(),onGithub:vi.fn(),onSource:vi.fn()};
const click=async(label:string)=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label)!;expect(b).toBeTruthy();await act(async()=>b.click());};
beforeEach(async()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue([{id:'s',bookId:'b',bookName:'Sổ 1',title:'Nguồn 1',addedAt:1}]);mocks.subscribe.mockResolvedValue(()=>{});(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(SidebarNav,props)));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens ten recent chats with project markers, slash focuses search without stealing typed slash',async()=>{
 await click('Trò chuyện');expect(host.querySelectorAll('.side-items-chat button')).toHaveLength(10);expect(host.querySelector('.side-items-chat button')?.textContent).toBe('Chat 14Dự án 0');
 const first=host.querySelector<HTMLButtonElement>('.side-items-chat button')!;await act(async()=>first.click());expect(props.onChat).toHaveBeenCalledWith('c14','p0');
 first.focus();await act(async()=>first.dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true})));const search=host.querySelector('input')!;expect(document.activeElement).toBe(search);
 const key=new KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true});search.dispatchEvent(key);expect(key.defaultPrevented).toBe(false);
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'Chat 0');search.dispatchEvent(new Event('input',{bubbles:true}));});expect(host.querySelectorAll('.side-items-chat button')).toHaveLength(1);expect(host.querySelector('.side-items-chat button')?.textContent).toContain('Trò chuyện rời');
});
it('keeps all projects in a scrollable menu and history as direct navigation',async()=>{
 await click('Mở rộng Dự án');expect(host.querySelectorAll('.side-items-projects .project-object>button:first-child')).toHaveLength(8);expect(host.querySelectorAll('.side-items-projects .object-menu-trigger')).toHaveLength(0);await act(async()=>host.querySelector('.side-items-projects .project-object')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect([...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent)).toEqual(expect.arrayContaining(['Chỉnh sửa thông tin','Xóa']));await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});await click('Lịch sử');expect(props.onNavigate).toHaveBeenLastCalledWith('history');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Lịch sử')?.hasAttribute('aria-expanded')).toBe(false);expect(host.textContent).not.toContain('Nhật ký');
});
it('sorts workflows by creation and displays plan status and membership',async()=>{
 await click('Quy trình');expect(host.querySelectorAll('.side-items-workflows button')).toHaveLength(10);expect(host.querySelector('.side-items-workflows button')?.textContent).toBe('Quy trình 14Đã xong · Dự án 0');await act(async()=>host.querySelector<HTMLButtonElement>('.side-items-workflows button')!.click());expect(props.onWorkflow).toHaveBeenCalledWith('w14');expect(host.textContent).toContain('Chưa duyệt · Cá nhân');
});
it('routes GitHub shortcuts to forms and source shortcuts to their notebook',async()=>{
 await click('GitHub');for(const [label,id] of [['Tải về máy','downloadFiles'],['Tải lên GitHub','uploadFiles'],['Đồng bộ hai chiều','sync'],['Duyệt file','browseFiles'],['Thẻ action','actions']]){await click(label!);expect(props.onGithub).toHaveBeenLastCalledWith(id);}
 await click('Sổ nguồn');expect(mocks.rpc).toHaveBeenCalledWith('nb.recentSources');await act(async()=>host.querySelector<HTMLButtonElement>('.side-items-notebook button')!.click());expect(props.onSource.mock.calls[0]?.[0]).toMatchObject({id:'s',bookId:'b'});
});
it('opens on hover without navigating, preserves search inside, and closes even focused search on leaving',async()=>{
 const heading=[...host.querySelectorAll<HTMLButtonElement>('.side-menu-link')].find(b=>b.textContent==='Trò chuyện')!;
 await act(async()=>heading.dispatchEvent(new MouseEvent('pointerover',{bubbles:true,relatedTarget:document.body})));
 expect(host.querySelector('#side-chat')).not.toBeNull();expect(props.onNavigate).not.toHaveBeenCalled();
 const search=host.querySelector<HTMLInputElement>('#side-chat input')!;
 await act(async()=>{search.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'Chat 0');search.dispatchEvent(new Event('input',{bubbles:true}));heading.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:search}));search.dispatchEvent(new MouseEvent('pointerover',{bubbles:true,relatedTarget:heading}));});
 expect(search.value).toBe('Chat 0');expect(host.querySelectorAll('.side-items-chat button')).toHaveLength(1);
 await act(async()=>search.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body})));
 expect(host.querySelector('#side-chat')).toBeNull();expect(heading.getAttribute('aria-expanded')).toBe('false');
 await act(async()=>heading.dispatchEvent(new MouseEvent('pointerover',{bubbles:true,relatedTarget:document.body})));
 expect(host.querySelector<HTMLInputElement>('#side-chat input')!.value).toBe('');
 const history=[...host.querySelectorAll('button')].find(b=>b.textContent==='Lịch sử')!;
 await act(async()=>{heading.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:history}));history.dispatchEvent(new MouseEvent('pointerover',{bubbles:true,relatedTarget:heading}));});
 expect(host.querySelector('.side-submenu')).toBeNull();expect(props.onNavigate).not.toHaveBeenCalled();
});
it('keeps the selected panel open on mouse leave and shows only its own content',async()=>{
 await act(async()=>root.render(React.createElement(SidebarNav,{...props,panelKey:'projects'})));
 expect(host.querySelectorAll('.side-menu')).toHaveLength(1);expect(host.querySelector('.side-items-projects')).not.toBeNull();
 await act(async()=>host.querySelector('nav')!.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body})));
 expect(host.querySelector('.side-items-projects')).not.toBeNull();
 await act(async()=>root.render(React.createElement(SidebarNav,{...props,panelKey:'chat'})));expect(host.querySelector('.side-items-chat')).not.toBeNull();expect(host.querySelector('.side-items-projects')).toBeNull();
});
it('pinned chats are listed first in the sidebar',async()=>{
 const pinned={...state,data:{...state.data,chats:state.data.chats.map(c=>c.id==='c0'?{...c,pinned:true}:c)}} as unknown as ViewState;
 await act(async()=>root.render(React.createElement(SidebarNav,{...props,state:pinned} as any)));
 await click('Trò chuyện');expect(host.querySelector('.side-items-chat button')?.textContent).toContain('Chat 0');
});
