// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
import {ChatWorkflowActions,ChatWorkflowCard} from '../src/ChatWorkflow';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();});
afterEach(()=>{act(()=>root.unmount());host.remove();});

const tpl=(extra:Record<string,unknown>={})=>({id:'t1',name:'Ôn tập',params:[{key:'chu-de',label:'Chủ đề',required:true},{key:'so-cau',label:'Số câu',required:false}],steps:[{id:'s1',name:'Soạn',prompt:'x',access:'read'}],output:{mode:'ask',text:''},createdAt:1,updatedAt:1,...extra});
const stateWith=(t:Record<string,unknown>)=>({data:{workflowTemplates:[t]}}) as unknown as ViewState;
const set=(el:HTMLInputElement|HTMLTextAreaElement,v:string)=>{const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label) as HTMLButtonElement|undefined;
const inputs=()=>[...host.querySelectorAll('input')] as HTMLInputElement[];

it('prefills the first parameter from the typed text and sends the chosen values',async()=>{
 const onRun=vi.fn().mockResolvedValue(true);
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(tpl()),call:{chatId:'c',templateId:'t1',text:'Quang hợp'},onRun,onCancel:()=>{}})));
 expect(inputs()[0]!.value).toBe('Quang hợp');
 await act(async()=>{set(inputs()[1]!,'10');set(host.querySelector('textarea')!,'Trắc nghiệm, 10 câu');});
 await act(async()=>{button('Chạy')!.click();});
 expect(onRun).toHaveBeenCalledWith({templateId:'t1',params:{'chu-de':'Quang hợp','so-cau':'10'},output:'Trắc nghiệm, 10 câu'});
 expect(JSON.parse(localStorage.getItem('pvta.wfLast.t1')!)).toEqual({params:{'chu-de':'Quang hợp','so-cau':'10'},output:'Trắc nghiệm, 10 câu'});
});

it('keeps Chạy disabled until every required parameter is filled',async()=>{
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(tpl()),call:{chatId:'c',templateId:'t1',text:''},onRun:vi.fn(),onCancel:()=>{}})));
 expect(button('Chạy')!.disabled).toBe(true);
 await act(async()=>{set(inputs()[0]!,'Phân số');});
 expect(button('Chạy')!.disabled).toBe(true);
 await act(async()=>{set(host.querySelector('textarea')!,'1 tệp Word');});
 expect(button('Chạy')!.disabled).toBe(false);
});

it('requires the output to be stated when the template asks for it',async()=>{
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(tpl()),call:{chatId:'c',templateId:'t1',text:'Phân số'},onRun:vi.fn(),onCancel:()=>{}})));
 expect(host.textContent).toContain('Đầu ra lần này');
 expect(button('Chạy')!.disabled).toBe(true);
});

it('restores the values of the last call for this template',()=>{
 localStorage.setItem('pvta.wfLast.t1',JSON.stringify({params:{'chu-de':'Cũ','so-cau':'5'},output:'Word 2 trang'}));
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(tpl()),call:{chatId:'c',templateId:'t1',text:''},onRun:vi.fn(),onCancel:()=>{}})));
 expect(inputs().map(i=>i.value)).toEqual(['Cũ','5']);
 expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Word 2 trang');
});

it('asks for confirmation before running a template with an editing step',async()=>{
 const onRun=vi.fn().mockResolvedValue(true);
 const t=tpl({params:[],steps:[{id:'s1',name:'Ghi',prompt:'x',access:'full'}]});
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(t),call:{chatId:'c',templateId:'t1',text:'Viết lại đề'},onRun,onCancel:()=>{}})));
 expect(button('Chạy')!.disabled).toBe(true);
 await act(async()=>{(host.querySelector('.wf-card-confirm input') as HTMLInputElement).click();});
 expect(button('Chạy')!.disabled).toBe(false);
 await act(async()=>{button('Chạy')!.click();});
 expect(onRun).toHaveBeenCalledWith({templateId:'t1',params:{},output:'Viết lại đề'});
});

it('re-enables the card when the run is rejected so the teacher can retry',async()=>{
 const onRun=vi.fn().mockResolvedValue(false);
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(tpl()),call:{chatId:'c',templateId:'t1',text:'Đề 1'},onRun,onCancel:()=>{}})));
 await act(async()=>{set(host.querySelector('textarea')!,'1 tệp Word');});
 await act(async()=>{button('Chạy')!.click();});
 expect(button('Chạy')).toBeDefined();
 expect(button('Chạy')!.disabled).toBe(false);
});

it('shows a notice instead of a form when the template no longer exists',()=>{
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(tpl()),call:{chatId:'c',templateId:'gone',text:''},onRun:vi.fn(),onCancel:()=>{}})));
 expect(host.textContent).toContain('Không tìm thấy quy trình mẫu');
 expect(host.querySelector('input')).toBeNull();
});

it('offers retry only for a failed result and keeps Mở trong Quy trình',()=>{
 const onOpen=vi.fn();const onRetry=vi.fn();
 act(()=>root.render(React.createElement(ChatWorkflowActions,{status:'error',onOpen,onRetry})));
 expect(button('Chạy tiếp từ khâu lỗi')).toBeDefined();
 act(()=>button('Mở trong Quy trình')!.click());expect(onOpen).toHaveBeenCalledOnce();
 act(()=>button('Chạy tiếp từ khâu lỗi')!.click());expect(onRetry).toHaveBeenCalledOnce();
 act(()=>root.render(React.createElement(ChatWorkflowActions,{status:'success',onOpen,onRetry})));
 expect(button('Chạy tiếp từ khâu lỗi')).toBeUndefined();
});

it('sends per-run step access and note only when changed; the template is untouched',async()=>{
 const onRun=vi.fn().mockResolvedValue(true);
 const t=tpl({params:[],steps:[{id:'s1',name:'Soạn',prompt:'x',access:'read'},{id:'s2',name:'Kiểm',prompt:'y',access:'read'}]});
 act(()=>root.render(React.createElement(ChatWorkflowCard,{state:stateWith(t),call:{chatId:'c',templateId:'t1',text:'Phân số'},onRun,onCancel:()=>{}})));
 expect(host.textContent).toContain('Chỉnh cho lần này');
 const selects=[...host.querySelectorAll('select')] as HTMLSelectElement[];
 await act(async()=>{selects[1]!.value='full';selects[1]!.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>{set(host.querySelectorAll('textarea')[1]!,'Dùng ví dụ thực tế');});
 await act(async()=>{(host.querySelector('.wf-card-confirm input') as HTMLInputElement).click();});
 await act(async()=>{button('Chạy')!.click();});
 expect(onRun).toHaveBeenCalledWith(expect.objectContaining({templateId:'t1',edits:{access:{s1:'read',s2:'full'},note:'Dùng ví dụ thực tế'}}));
});
