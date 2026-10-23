// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../src/ipc',async()=>({...(await vi.importActual<any>('../src/ipc')),rpc:vi.fn(async()=>undefined)}));
import {rpc} from '../src/ipc';
import {ProjectCard} from '../src/ProjectCard';

let host:HTMLDivElement,root:Root;
const onOpen=vi.fn(),onLearning=vi.fn(),onEdit=vi.fn(),onDeleted=vi.fn(),report=vi.fn();
beforeEach(async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(React.createElement(ProjectCard,{id:'p1',name:'STEM',rules:'Hướng dẫn học sinh',chatCount:3,onOpen,onLearning,onEdit,onDeleted,report})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it.each(['.project-card','.project-icon','.card-title','.project-card p','.project-card small','.project-card>div'])('bấm %s mở dự án đúng một lần',async selector=>{
 await act(async()=>host.querySelector<HTMLElement>(selector)!.click());
 expect(onOpen).toHaveBeenCalledTimes(1);expect(onLearning).not.toHaveBeenCalled();expect(onEdit).not.toHaveBeenCalled();
});
it.each(['Học hỏi','Chỉnh sửa thông tin'])('%s chỉ thực hiện thao tác riêng',async label=>{
 await act(async()=>host.querySelector('.project-card')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent===label)!.click());
 expect(label==='Học hỏi'?onLearning:onEdit).toHaveBeenCalledTimes(1);
 expect(label==='Học hỏi'?onEdit:onLearning).not.toHaveBeenCalled();expect(onOpen).not.toHaveBeenCalled();
});
it('giữ nút tên dự án để truy cập bằng bàn phím',async()=>{
 const title=host.querySelector<HTMLButtonElement>('.card-title')!;
 title.focus();expect(document.activeElement).toBe(title);expect(title.type).toBe('button');
 await act(async()=>title.click());expect(onOpen).toHaveBeenCalledTimes(1);
});
it('menu on a different project uses that card without opening either project',async()=>{
 const otherOpen=vi.fn(),otherLearning=vi.fn(),otherEdit=vi.fn();
 await act(async()=>root.render(React.createElement(React.Fragment,null,
  React.createElement(ProjectCard,{id:'p1',name:'STEM',rules:'',chatCount:1,onOpen,onLearning,onEdit,onDeleted,report}),
  React.createElement(ProjectCard,{id:'p2',name:'Khác',rules:'',chatCount:0,onOpen:otherOpen,onLearning:otherLearning,onEdit:otherEdit,onDeleted,report}))));
 await act(async()=>host.querySelectorAll('.project-card')[1]!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Chỉnh sửa thông tin')!.click());
 expect(otherEdit).toHaveBeenCalledOnce();expect(onEdit).not.toHaveBeenCalled();expect(onOpen).not.toHaveBeenCalled();expect(otherOpen).not.toHaveBeenCalled();
});
it('chuột phải và dấu ⋯ đều có Xóa; xóa cần xác nhận rồi gọi deleteProject',async()=>{
 await act(async()=>host.querySelector('.project-card')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Xóa')!.click());
 expect(rpc).not.toHaveBeenCalled();
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('.chat-object-form button')].find(b=>b.textContent==='Xóa hẳn')!.click());
 expect(rpc).toHaveBeenCalledWith('deleteProject',{id:'p1'});expect(onDeleted).toHaveBeenCalledOnce();expect(onOpen).not.toHaveBeenCalled();
});
it('"Chỉ xóa dự án" gọi deleteProject với keepFolders để không đụng thư mục trên máy',async()=>{
 await act(async()=>host.querySelector('.project-card')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Chỉ xóa dự án (giữ thư mục trên máy)')!.click());
 expect(rpc).not.toHaveBeenCalled();
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('.chat-object-form button')].find(b=>b.textContent==='Chỉ xóa dự án')!.click());
 expect(rpc).toHaveBeenCalledWith('deleteProject',{id:'p1',keepFolders:true});expect(onDeleted).toHaveBeenCalledOnce();
});
