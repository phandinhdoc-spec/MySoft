// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
import type {Workflow,WorkflowTemplate} from '../../core/src/desktop/types';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,pickFiles:vi.fn(),subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/QuickFile',()=>({QuickFile:()=>null}));
vi.mock('../src/PlanCard',()=>({PlanCard:()=>null}));
vi.mock('../src/LinkedNotebooks',()=>({LinkedNotebooks:()=>null}));
import {WorkflowPanel} from '../src/WorkflowPanel';

// Kiểm thử giao diện: chuyển quy trình, lỗi và khóa theo ID. Mọi lượt RPC `workflowRun` được giữ chờ để mô phỏng "A chưa trả RPC".
let host:HTMLDivElement,root:Root;
const report=vi.fn();
const confirmMock=vi.fn(()=>true);
const pending=new Map<string,(v:unknown)=>void>();
const wf=(id:string):Workflow=>({id,name:`Quy trình ${id}`,updatedAt:1,runs:[],steps:[{id:'s1',name:'Bước 1',prompt:'p',choice:'auto',access:'read'}]} as unknown as Workflow);
const state=(ws:Workflow[],templates:WorkflowTemplate[]=[])=>({data:{workflows:ws,workflowTemplates:templates,chats:[],projects:[]},skills:[],prompts:{own:[]},backends:[],api:[],catalog:{}} as unknown as ViewState);
const show=(ws:Workflow[],selectedId?:string,templates:WorkflowTemplate[]=[])=>act(async()=>root.render(React.createElement(WorkflowPanel,{state:state(ws,templates),report,notice:vi.fn(),onAutoCreate:vi.fn(),selectedId})));
const pick=(id:string)=>host.querySelector<HTMLButtonElement>(`button[title="Quy trình ${id}"]`)!;
const actionButton=(label:string)=>[...host.querySelectorAll<HTMLButtonElement>('.wf-actions button')].find(b=>b.textContent?.trim()===label);
const runBtn=()=>actionButton('Chạy');
const stopBtn=()=>actionButton('Dừng');
const nameInput=()=>host.querySelector<HTMLInputElement>('.wf-name')!;
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
const setName=(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(nameInput(),value);nameInput().dispatchEvent(new Event('input',{bubbles:true}));});
const menuItem=async(id:string,text:string)=>{await act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="Thao tác quy trình: Quy trình ${id}"]`)!.click());return [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes(text));};
const disabled=(b?:HTMLElement|null)=>!!b&&(('disabled' in b&&(b as HTMLButtonElement).disabled)||b.getAttribute('aria-disabled')==='true');
const runCalls=(id:string)=>mocks.rpc.mock.calls.filter(c=>c[0]==='workflowRun'&&c[1]?.id===id);

beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView??=function(){};
 localStorage.clear();pending.clear();confirmMock.mockReset().mockReturnValue(true);vi.stubGlobal('confirm',confirmMock);report.mockReset();
 mocks.rpc.mockReset().mockImplementation((method:string,params:any)=>method==='workflowRun'?new Promise(resolve=>pending.set(params.id,resolve)):Promise.resolve(true));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 HTMLDialogElement.prototype.showModal??=function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close??=function(){this.removeAttribute('open');};
});

const template=():WorkflowTemplate=>({id:'t1',name:'Mẫu ôn tập',params:[],steps:[{id:'t-step',name:'Soạn câu hỏi',prompt:'Soạn bài',access:'read'}],output:{mode:'fixed',text:'Word'},createdAt:1,updatedAt:1});
const tabPanel=(name:string)=>host.querySelector<HTMLElement>(`[role=tabpanel][aria-label="${name}"]`)!;
const clickText=async(scope:ParentNode,text:string)=>act(async()=>{[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!.click();});
const switchTab=async(index:number)=>act(async()=>host.querySelectorAll<HTMLButtonElement>('[role=tab]')[index]!.click());
const setInput=async(el:HTMLInputElement,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});

it('hai bảng riêng giữ bản sửa quy trình, mẫu mới và bộ lọc khi chuyển tab',async()=>{
 await show([wf('A')],'A',[template()]);
 const workflows=tabPanel('Quy trình'),templates=tabPanel('Quy trình mẫu');
 expect(workflows.hidden).toBe(false);expect(templates.hidden).toBe(true);
 expect(workflows.textContent).not.toContain('Mẫu ôn tập');expect(templates.textContent).not.toContain('Quy trình A');
 await setName('Quy trình sửa dở');
 await setInput(workflows.querySelector<HTMLInputElement>('.wf-search')!,'Quy trình A');
 await switchTab(1);
 expect(workflows.hidden).toBe(true);expect(templates.hidden).toBe(false);
 await clickText(templates,'＋ Mẫu mới');
 await setInput(templates.querySelector<HTMLInputElement>('.tpl-inline-editor input')!,'Mẫu chưa lưu');
 expect(host.querySelector('dialog')).toBeNull();
 await switchTab(0);
 expect(nameInput().value).toBe('Quy trình sửa dở');
 expect(workflows.querySelector<HTMLInputElement>('.wf-search')!.value).toBe('Quy trình A');
 await switchTab(1);
 expect(templates.querySelector<HTMLInputElement>('.tpl-inline-editor input')!.value).toBe('Mẫu chưa lưu');
 expect(templates.querySelector('.tpl-unsaved')).not.toBeNull();
 expect(confirmMock).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});

it('tạo mới chỉ ghi vào bảng quy trình; lưu thành mẫu mở đúng mẫu ở bảng mẫu',async()=>{
 const original=wf('A'),tpl=template();
 await show([original],'A');
 await clickText(tabPanel('Quy trình'),'＋ Quy trình mới');
 const created=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow;
 expect(mocks.rpc.mock.calls.some(c=>c[0]==='templateSave')).toBe(false);
 const newWorkflow={...created,updatedAt:1,runs:[]} as Workflow;
 await show([original,newWorkflow]);
 expect(nameInput().value).toBe('Quy trình mới');
 mocks.rpc.mockResolvedValueOnce(tpl.id);
 await clickText(tabPanel('Quy trình'),'Lưu thành mẫu');
 await clickText(host.querySelector('dialog')!,'Lưu mẫu');
 expect(mocks.rpc).toHaveBeenCalledWith('templateFromWorkflow',{workflowId:created.id,name:'Mẫu: Quy trình mới'});
 await show([original,newWorkflow],undefined,[tpl]);
 expect(tabPanel('Quy trình mẫu').hidden).toBe(false);
 expect(tabPanel('Quy trình mẫu').querySelector<HTMLInputElement>('input')!.value).toBe(tpl.name);
 expect(tabPanel('Quy trình').querySelectorAll('.wf-entry')).toHaveLength(2);
 await switchTab(0);expect(nameInput().value).toBe('Quy trình mới');
});

it('dùng mẫu tạo và mở quy trình mới, mẫu nguồn vẫn ở bảng mẫu',async()=>{
 const tpl=template(),created=wf('B');
 await show([wf('A')],'A',[tpl]);
 await switchTab(1);await clickText(tabPanel('Quy trình mẫu'),'Dùng');
 mocks.rpc.mockResolvedValueOnce({kind:'workflow',id:created.id});
 await clickText(host.querySelector('dialog')!,'Chèn');
 expect(mocks.rpc).toHaveBeenCalledWith('templateInsert',{templateId:tpl.id,target:{},params:{},output:''});
 await show([wf('A'),created],undefined,[tpl]);
 expect(tabPanel('Quy trình').hidden).toBe(false);expect(nameInput().value).toBe('Quy trình B');
 expect(tabPanel('Quy trình').textContent).not.toContain(tpl.name);
 await switchTab(1);
 expect(tabPanel('Quy trình mẫu').querySelectorAll('.tpl-card')).toHaveLength(1);
 expect(tabPanel('Quy trình mẫu').textContent).toContain(tpl.name);
 expect(tabPanel('Quy trình mẫu').textContent).not.toContain('Quy trình B');
});

it('dùng mẫu khi quy trình cũ đang sửa vẫn giữ bản sửa và chọn cũ',async()=>{
 await show([wf('A')],'A',[template()]);await setName('Sửa A dở');
 await switchTab(1);await clickText(tabPanel('Quy trình mẫu'),'Dùng');
 mocks.rpc.mockResolvedValueOnce({kind:'workflow',id:'B'});
 await clickText(host.querySelector('dialog')!,'Chèn');
 await show([wf('A'),wf('B')],undefined,[template()]);
 expect(tabPanel('Quy trình mẫu').hidden).toBe(false);
 await switchTab(0);expect(nameInput().value).toBe('Sửa A dở');
 expect(host.querySelector('[title="Quy trình A"]')?.getAttribute('aria-pressed')).toBe('true');
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});

it('A đang chờ RPC: chuyển sang B vẫn chạy được B, và A vẫn hiện Dừng khi quay lại',async()=>{
 await show([wf('A'),wf('B')],'A');
 await act(async()=>runBtn()!.click());
 expect(runCalls('A')).toHaveLength(1);expect(stopBtn()).toBeDefined();

 await act(async()=>pick('B').click());
 expect(nameInput().value).toBe('Quy trình B');
 expect(stopBtn()).toBeUndefined();expect(disabled(runBtn())).toBe(false);

 await act(async()=>runBtn()!.click());
 expect(runCalls('B')).toHaveLength(1);expect(runCalls('A')).toHaveLength(1);

 await act(async()=>pick('A').click());
 expect(nameInput().value).toBe('Quy trình A');expect(stopBtn()).toBeDefined();
 expect(confirmMock).not.toHaveBeenCalled();
});

it('lỗi của A không khóa B: báo lỗi, A trở về Chạy, B vẫn chạy được',async()=>{
 mocks.rpc.mockReset().mockImplementation((method:string,params:any)=>{
  if(method==='workflowRun'&&params.id==='A')return Promise.reject(new Error('Lỗi A'));
  if(method==='workflowRun')return new Promise(resolve=>pending.set(params.id,resolve));
  return Promise.resolve(true);
 });
 await show([wf('A'),wf('B')],'A');
 await act(async()=>runBtn()!.click());await flush();
 expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'Lỗi A'}));
 expect(runBtn()).toBeDefined();expect(stopBtn()).toBeUndefined();

 await act(async()=>pick('B').click());
 expect(disabled(runBtn())).toBe(false);
 await act(async()=>runBtn()!.click());
 expect(runCalls('B')).toHaveLength(1);
});

it('Dừng A chỉ hủy A; B vẫn đang chạy và không bị đổi trạng thái',async()=>{
 await show([wf('A'),wf('B')],'A');
 await act(async()=>runBtn()!.click());
 await act(async()=>pick('B').click());await act(async()=>runBtn()!.click());

 await act(async()=>pick('A').click());
 await act(async()=>stopBtn()!.click());
 expect(mocks.rpc).toHaveBeenCalledWith('workflowCancel',{id:'A'});
 expect(mocks.rpc.mock.calls.some(c=>c[0]==='workflowCancel'&&c[1]?.id==='B')).toBe(false);

 await act(async()=>pick('B').click());
 expect(stopBtn()).toBeDefined();
 // A trả RPC muộn sau khi bị dừng: chỉ A được giải phóng.
 await act(async()=>pending.get('A')!(true));
 await act(async()=>pick('A').click());expect(runBtn()).toBeDefined();
 await act(async()=>pick('B').click());expect(stopBtn()).toBeDefined();
});

it('thư viện thao tác C được khi A và B đang chạy; xóa A đang chạy bị chặn; xóa C được',async()=>{
 await show([wf('A'),wf('B'),wf('C')],'A');
 await act(async()=>runBtn()!.click());
 await act(async()=>pick('B').click());await act(async()=>runBtn()!.click());
 await act(async()=>pick('A').click());

 const pin=await menuItem('C','Ghim');
 expect(disabled(pin)).toBe(false);
 await act(async()=>pin!.click());
 expect(mocks.rpc).toHaveBeenCalledWith('workflowPin',{id:'C',pinned:true});

 const delA=await menuItem('A','Xóa quy trình');
 expect(disabled(delA)).toBe(true);

 await act(async()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 const delC=await menuItem('C','Xóa quy trình');
 expect(disabled(delC)).toBe(false);
 await act(async()=>delC!.click());
 expect(mocks.rpc).toHaveBeenCalledWith('workflowDelete',{id:'C'});
 expect(mocks.rpc.mock.calls.some(c=>c[0]==='workflowCancel')).toBe(false);
 expect(stopBtn()).toBeDefined();
});

it('không mất thay đổi chưa lưu khi chuyển từ B sang A đang chạy; xác nhận hủy thì ở lại B',async()=>{
 await show([wf('A'),wf('B')],'A');
 await act(async()=>runBtn()!.click());
 await act(async()=>pick('B').click());
 await setName('Sửa B dở');
 expect(nameInput().value).toBe('Sửa B dở');

 confirmMock.mockReturnValueOnce(false);
 await act(async()=>pick('A').click());
 expect(confirmMock).toHaveBeenCalledTimes(1);
 expect(nameInput().value).toBe('Sửa B dở');

 await act(async()=>pending.get('A')!(true));
 expect(nameInput().value).toBe('Sửa B dở');

 confirmMock.mockReturnValueOnce(true);
 await act(async()=>pick('A').click());
 expect(nameInput().value).toBe('Quy trình A');
 expect(runCalls('A')).toHaveLength(1);
 expect(mocks.rpc.mock.calls.some(c=>c[1]?.id==='B'&&c[0]==='workflowSave')).toBe(false);
});
