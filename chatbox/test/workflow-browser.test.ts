// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WorkflowBrowser} from '../src/WorkflowBrowser';
import type {ViewState} from '../src/ipc';
import {rpc} from '../src/ipc';
import {openChatWindow} from '../src/chat-window';
vi.mock('../src/ipc',()=>({rpc:vi.fn().mockResolvedValue('linked-chat')}));
vi.mock('../src/chat-window',()=>({openChatWindow:vi.fn().mockResolvedValue(undefined)}));
let host:HTMLDivElement,root:Root;
const onSelect=vi.fn(),onDelete=vi.fn();
const state={data:{projects:[{id:'p',name:'KHTN'}],chats:[{id:'c',projectId:'p',messages:[{at:1,plan:{id:'plan',steps:[]}}]}],workflows:Array.from({length:65},(_,i)=>({id:String(i),name:`Quy trình ${i}`,createdAt:new Date(2026,9,i+1).getTime(),updatedAt:1,planId:i===64?'plan':undefined,steps:[],runs:[]}))}} as unknown as ViewState;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();onSelect.mockClear();onDelete.mockClear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(React.createElement(WorkflowBrowser,{state,selectedId:"",onSelect,onDelete})));
const button=(label:string)=>host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
it('paginates newest first, switches three views and opens or deletes the chosen workflow',async()=>{
 await render();expect(host.querySelectorAll('.wf-entry')).toHaveLength(30);expect(host.querySelector('.wf-entry strong')?.textContent).toBe('Quy trình 64');
 await act(async()=>host.querySelector<HTMLButtonElement>('.wf-entry-open')!.click());expect(onSelect).toHaveBeenCalledWith('64');
 await act(async()=>button('Thao tác quy trình: Quy trình 64').click());await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes('Xóa quy trình'))!.click());expect(onDelete.mock.calls[0]![0].id).toBe('64');expect(onSelect).toHaveBeenCalledTimes(1);
 for(const label of ['Biểu tượng','Chi tiết','Danh sách']){await act(async()=>button(label).click());expect(button(label).getAttribute('aria-pressed')).toBe('true');}
 await act(async()=>button('Trang sau').click());expect(host.querySelector('.wf-entry strong')?.textContent).toBe('Quy trình 34');
 await act(async()=>button('Trang sau').click());expect(host.querySelectorAll('.wf-entry')).toHaveLength(5);expect(button('Trang sau').disabled).toBe(true);
});
it('filters by project and creation date',async()=>{
 await render();const project=host.querySelector<HTMLSelectElement>('select')!;
 await act(async()=>{project.value='p';project.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelectorAll('.wf-entry')).toHaveLength(1);expect(host.textContent).toContain('Quy trình 64');
 await act(async()=>{project.value='all';project.dispatchEvent(new Event('change',{bubbles:true}));});
 const until=host.querySelector<HTMLInputElement>('[aria-label="Đến ngày"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(until,'2026-10-02');until.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(host.querySelectorAll('.wf-entry')).toHaveLength(2);
});
it('mở chat từ menu chuột phải cho đúng quy trình, kể cả đang chạy',async()=>{
 await act(async()=>root.render(React.createElement(WorkflowBrowser,{state,selectedId:'',onSelect,onDelete,runningIds:['64']})));
 await act(async()=>host.querySelector('.wf-entry')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:20,clientY:20})));
 const item=[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes('Mở đoạn chat'))!;
 expect(item.getAttribute('aria-disabled')).not.toBe('true');
 await act(async()=>item.click());
 expect(rpc).toHaveBeenCalledWith('workflowOpenChat',{id:'64'});
 expect(openChatWindow).toHaveBeenCalledWith('linked-chat');
 expect(onSelect).not.toHaveBeenCalled();
});
it('khóa đúng quy trình đang chạy hoặc đang thao tác, không khóa quy trình khác',async()=>{
 await act(async()=>root.render(React.createElement(WorkflowBrowser,{state,selectedId:"",onSelect,onDelete,runningIds:['64'],busyIds:['63']})));
 const deleteItem=async(label:string)=>{await act(async()=>button(label).click());return [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes('Xóa quy trình'))!;};
 const free=await deleteItem('Thao tác quy trình: Quy trình 62');
 expect(free.disabled||free.getAttribute('aria-disabled')==='true').toBe(false);
 const running=await deleteItem('Thao tác quy trình: Quy trình 64');
 expect(running.disabled||running.getAttribute('aria-disabled')==='true').toBe(true);
 const pending=await deleteItem('Thao tác quy trình: Quy trình 63');
 expect(pending.disabled||pending.getAttribute('aria-disabled')==='true').toBe(true);
});
it('hiển thị icon theo trạng thái và xét lại duyệt Plan trước lịch sử chạy cũ',async()=>{
 const data={...state.data,workflows:[
  {id:'new',name:'Mới',steps:[],runs:[],updatedAt:1},
  {id:'error',name:'Lỗi',steps:[],runs:[{status:'error'}],updatedAt:1},
  {id:'success',name:'Xong',steps:[],runs:[{status:'success'}],updatedAt:1},
  {id:'plan',planId:'plan',name:'Cần duyệt lại',steps:[],runs:[{status:'success'}],updatedAt:1},
 ]};
 await act(async()=>root.render(React.createElement(WorkflowBrowser,{state:{...state,data} as ViewState,selectedId:'',onSelect,onDelete})));
 for(const [name,status,label] of [['Mới','new','Chưa duyệt'],['Lỗi','error','Cần kiểm tra'],['Xong','success','Hoàn tất'],['Cần duyệt lại','unapproved','Chưa duyệt']]){
  const row=[...host.querySelectorAll('.wf-entry')].find(e=>e.querySelector('strong')?.textContent===name)!;
  expect(row.querySelector(`.wf-file-${status} svg`)).not.toBeNull();
  expect(row.textContent).toContain(label);
  expect(row.querySelector('rect')?.getAttribute('fill')).toBe('none');
 }
});
