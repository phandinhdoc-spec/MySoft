// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {WorkspaceSidebar} from '../src/WorkspaceSidebar';
import type {ViewState} from '../src/ipc';
it('offers working Office shortcuts, searchable skills, and grouped tool navigation',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const props={panel:'office',state:{office:{selected:'doc',sessions:[{id:'doc',host:'word',name:'Giáo án.docx'}]},skills:[{name:'soan-bai',description:'Soạn bài giảng',load:'manual'},{name:'ra-de',description:'Tạo đề kiểm tra',load:'off'}]} as unknown as ViewState,onOffice:vi.fn(),onSkill:vi.fn(),onPrompt:vi.fn(),onTool:vi.fn(),onTools:vi.fn(),toolsSection:'docs' as const,pro:'assessment' as const,groupTab:'groups' as const};
 const render=async(panel:string)=>act(async()=>root.render(React.createElement(WorkspaceSidebar,{...props,panel})));
 const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(text));expect(button).toBeTruthy();await act(async()=>button!.click());};
 try{
 await render('office');expect(host.textContent).not.toContain('Mở office');await click('Word');expect(props.onOffice).toHaveBeenLastCalledWith({create:'word'});await click('Giáo án.docx');expect(props.onOffice).toHaveBeenLastCalledWith({session:'doc'});await click('Soạn giáo án');expect(props.onPrompt).toHaveBeenCalledWith('/office-giao-an Soạn giáo án ');
 await render('skills');await click('soan-bai');expect(props.onSkill).toHaveBeenLastCalledWith({name:'soan-bai'});await click('Tự viết');expect(props.onSkill).toHaveBeenLastCalledWith({create:true});
 const input=host.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'kiểm tra');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(host.textContent).not.toContain('soan-bai');expect(host.textContent).toContain('ra-de');
 await render('tools');expect(host.querySelectorAll('details')).toHaveLength(3);await click('Xưởng Toán');expect(props.onTools).toHaveBeenLastCalledWith('pro','math');await click('Làm việc với PDF');expect(props.onTool).toHaveBeenLastCalledWith('pdf');await click('Căn cứ');expect(props.onTools).toHaveBeenLastCalledWith('groups','basis');
 }finally{await act(async()=>root.unmount());host.remove();}
});
