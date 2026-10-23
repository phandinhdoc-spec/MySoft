// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),pickFiles:vi.fn()}));
vi.mock('../src/ipc',()=>mock);
import {GithubProjectContext} from '../src/GithubProjectContext';
it('shows the active project context and saves a replacement folder to that project',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 mock.rpc.mockResolvedValue({ok:true,value:{folderError:'Chọn lại thư mục',repository:{origin:'git@github.com:school/exams.git',branch:'main'}}});mock.pickFiles.mockResolvedValue(['/new']);
 const host=document.createElement('div'),root=createRoot(host);
 try{
 await act(async()=>root.render(React.createElement(GithubProjectContext,{project:{id:'p',name:'Exam',rules:'',folders:['/old'],outputDir:'/work'}})));
 expect(host.textContent).toContain('https://github.com/school/exams');expect(host.textContent).toContain('/work');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Chọn lại thư mục…')!.click());
 expect(mock.rpc).toHaveBeenCalledWith('setProjectGithubFolder',{projectId:'p',folder:'/new'});
 await act(async()=>root.render(React.createElement(GithubProjectContext,{project:{id:'q',name:'Other',rules:'',url:'https://github.com/school/other',folders:['/other']}})));
 expect(host.textContent).toContain('https://github.com/school/other');expect(host.textContent).not.toContain('/work');
 }finally{await act(async()=>root.unmount());}
});
it('normal folder exposes identical path and ellipsis menus, and cancel keeps the project intact',async()=>{
 mock.rpc.mockReset();mock.pickFiles.mockReset();mock.rpc.mockResolvedValue({ok:true,value:{repository:{branch:'main'}}});mock.pickFiles.mockResolvedValue([]);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(React.createElement(GithubProjectContext,{project:{id:'p',name:'Exam',rules:'',folders:['/work']}})));
 expect([...host.querySelectorAll('button')].some(b=>b.textContent==='Chọn lại thư mục…')).toBe(false);
 const trigger=host.querySelector<HTMLButtonElement>('[aria-label="Thao tác thư mục GitHub"]')!;await act(async()=>trigger.click());const labels=[...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent);
 await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await act(async()=>trigger.parentElement!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent)).toEqual(labels);
 await act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());expect(mock.pickFiles).toHaveBeenCalledWith(true);expect(mock.rpc.mock.calls.some(c=>c[0]==='setProjectGithubFolder')).toBe(false);expect(host.textContent).toContain('/work');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('project change while choosing a folder discards the old picker result',async()=>{
 mock.rpc.mockReset();mock.pickFiles.mockReset();mock.rpc.mockResolvedValue({ok:true,value:{folderError:'Thư mục không tồn tại'}});
 let resolve!:(paths:string[])=>void;mock.pickFiles.mockImplementation(()=>new Promise(r=>{resolve=r;}));const host=document.createElement('div');const root=createRoot(host);
 try{
 await act(async()=>root.render(React.createElement(GithubProjectContext,{project:{id:'p',name:'Exam',rules:'',folders:['/work']}})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Chọn lại thư mục…')!.click());
 await act(async()=>root.render(React.createElement(GithubProjectContext,{project:{id:'q',name:'Other',rules:'',folders:['/other']}})));
 await act(async()=>resolve(['/stale']));expect(mock.rpc.mock.calls.some(c=>c[0]==='setProjectGithubFolder')).toBe(false);expect(host.textContent).toContain('/other');expect(host.textContent).not.toContain('/work');
 }finally{await act(async()=>root.unmount());}
});
it('active GitHub run blocks the folder replacement command',async()=>{
 mock.rpc.mockReset();mock.pickFiles.mockReset();mock.rpc.mockResolvedValue({ok:true,value:{activeRunId:'running',folderError:'Thư mục không tồn tại'}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(React.createElement(GithubProjectContext,{project:{id:'p',name:'Exam',rules:'',folders:['/work']}})));
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Chọn lại thư mục…')!.disabled).toBe(true);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác thư mục GitHub"]')!.click());const command=document.querySelector<HTMLButtonElement>('[role=menuitem]')!;expect(command.getAttribute('aria-disabled')).toBe('true');await act(async()=>command.click());expect(mock.pickFiles).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});
