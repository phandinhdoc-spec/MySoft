// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
import type {Workflow} from '../../core/src/desktop/types';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,pickFiles:vi.fn(),subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/QuickFile',()=>({QuickFile:()=>null}));
vi.mock('../src/PlanCard',()=>({PlanCard:()=>null}));
vi.mock('../src/LinkedNotebooks',()=>({LinkedNotebooks:()=>null}));
import {WorkflowPanel} from '../src/WorkflowPanel';
let host:HTMLDivElement,root:Root;
const report=vi.fn();
const wf=():Workflow=>({id:'w',name:'Bài học',updatedAt:1,runs:[],steps:['A','B'].map(id=>({id,name:id,prompt:id,choice:'auto',access:'read'}))});
const render=async(w:Workflow)=>{const state={data:{workflows:[w],chats:[]},prompts:{own:[]},backends:[],api:[],catalog:{}} as unknown as ViewState;await act(async()=>root.render(React.createElement(WorkflowPanel,{state,report,notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:w.id})));};
const stage=(id:string)=>host.querySelector<HTMLButtonElement>(`[aria-label="Duyệt và chạy nấc: ${id}"]`)!;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;mocks.rpc.mockReset().mockResolvedValue(true);report.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('duyệt riêng từng nấc, khóa bước sau và chặn nhấp lặp',async()=>{
 const w=wf();await render(w);expect(stage('A').disabled).toBe(false);expect(stage('B').disabled).toBe(true);
 let finish!:(v:boolean)=>void;mocks.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{stage('A').click();stage('A').click();});expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('workflowRun',{id:'w',retry:false,stepId:'A'});
 await act(async()=>finish(true));
 await render({...w,runs:[{id:'r',status:'paused',startedAt:1,steps:[{stepId:'A',name:'A',status:'success',output:'Kết quả A'},{stepId:'B',name:'B',status:'waiting'}]}]});
 expect(stage('A')).toBeNull();expect(host.querySelector('.wf-completed')?.textContent).toContain('Đã hoàn tất');expect(stage('B').disabled).toBe(false);expect(host.querySelector('button button')).toBeNull();
 mocks.rpc.mockResolvedValue(true);await act(async()=>stage('B').click());expect(mocks.rpc).toHaveBeenLastCalledWith('workflowRun',{id:'w',retry:false,stepId:'B'});
});
it('khóa duyệt nấc khi có bản sửa chưa lưu',async()=>{
 await render(wf());const pin=[...host.querySelectorAll('button')].find(b=>b.textContent==='Ghim quy trình')!;await act(async()=>pin.click());
 expect(stage('A').disabled).toBe(true);expect(host.textContent).toContain('Lưu thay đổi trước khi duyệt');expect(mocks.rpc).not.toHaveBeenCalled();
});

it('mở bảng quản lí mặc định và trở lại danh sách khi bấm menu lần nữa',async()=>{
 const state={data:{workflows:[wf()],chats:[]},prompts:{own:[]},backends:[],api:[],catalog:{}} as unknown as ViewState;
 const show=async(navigationRequest?:{id:string})=>act(async()=>root.render(React.createElement(WorkflowPanel,{state,report,notice:vi.fn(),onAutoCreate:vi.fn(),navigationRequest})));
 await show();
 expect(stage('A')).toBeNull();
 await show({id:'w'});
 expect(stage('A')).not.toBeNull();
 await show({id:''});
 expect(stage('A')).toBeNull();
 expect(host.textContent).toContain('Bài học');
});

it('keeps the library visible while opening a linked Plan in the right workspace',async()=>{
 const w={...wf(),planId:'plan'};const state={data:{workflows:[w],chats:[{messages:[{at:1,plan:{id:'plan',steps:[]}}]}]},prompts:{own:[]},backends:[],api:[],catalog:{}} as unknown as ViewState;
 await act(async()=>root.render(React.createElement(WorkflowPanel,{state,report,notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:'w'})));
 expect(host.querySelector('[aria-label="Danh sách quy trình"]')).not.toBeNull();
 expect(host.querySelector('[aria-label="Khu vực làm việc quy trình"]')).not.toBeNull();
});

it('resizes and collapses the library without losing the selected workflow',async()=>{
 await render(wf());const divider=host.querySelector<HTMLElement>('[role="separator"]')!;
 await act(async()=>divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
 expect(divider.getAttribute('aria-valuenow')).toBe('38');expect(localStorage.getItem('pvta.workflowLibraryWidth')).toBe('38');
 const toggle=()=>[...host.querySelectorAll('button')].find(b=>/^(Thu gọn|Hiện) thư viện$/.test(b.textContent??''))!;
 await act(async()=>toggle().click());expect(host.querySelector('.wf-library-pane')?.hasAttribute('hidden')).toBe(true);expect(stage('A')).not.toBeNull();
 await act(async()=>toggle().click());expect(host.querySelector('.wf-library-pane')?.hasAttribute('hidden')).toBe(false);
});
it('opens a workflow node editor in a modal and saves edited dependencies',async()=>{
 await render({...wf(),mode:'parallel',steps:wf().steps.map((s,i)=>({...s,dependsOn:i?['A']:[]}))});
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: B"]')!.click());
 const dialog=host.querySelector('[role="dialog"]')!;expect(dialog).not.toBeNull();
 await act(async()=>dialog.querySelector<HTMLInputElement>('fieldset input[type="checkbox"]')!.click());
 await act(async()=>[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Xong')!.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 expect(mocks.rpc).toHaveBeenCalledWith('workflowSave',{workflow:expect.objectContaining({steps:expect.arrayContaining([expect.objectContaining({id:'B',dependsOn:[]})])})});
});

const menuItem=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes(label))!;
const nodeMenu=async(name:string)=>act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="Thao tác bước: ${name}"]`)!.click());
it('opens a node menu without editing, creates a parallel sibling with preserved consumers, and undo restores the original',async()=>{
 await render(wf());await nodeMenu('A');expect(host.querySelector('[role=dialog]')).toBeNull();
 await act(async()=>menuItem('Tạo nhánh song song').click());expect(host.querySelector('[role=dialog]')).not.toBeNull();
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Xong')!.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow;
 expect(saved.mode).toBe('parallel');expect(saved.steps).toHaveLength(3);const branch=saved.steps[1];expect(branch.dependsOn).toEqual([]);expect(saved.steps[2].dependsOn).toEqual(['A',branch.id]);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Hoàn tác')!.click());
 expect(host.querySelectorAll('.wf-node')).toHaveLength(2);
});
it('inserts after the chosen parallel node, saves and reloads structure, removes via menu and restores with undo',async()=>{
 await render({...wf(),mode:'parallel',steps:wf().steps.map((s,i)=>({...s,dependsOn:i?['A']:[]}))});
 await nodeMenu('A');await act(async()=>menuItem('Thêm bước sau').click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Xong')!.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow;
 expect(saved.steps[1].dependsOn).toEqual(['A']);expect(saved.steps[2].dependsOn).toEqual([saved.steps[1].id]);
 await render({...wf(),...saved,updatedAt:2});expect(host.querySelectorAll('.wf-node')).toHaveLength(3);
 await nodeMenu('B');await act(async()=>menuItem('Xóa bước').click());expect(host.querySelectorAll('.wf-node')).toHaveLength(2);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Hoàn tác')!.click());expect(host.querySelectorAll('.wf-node')).toHaveLength(3);
});
it('uses the unselected library target for pin, duplicate and export without overwriting the current workflow',async()=>{
 const other={...wf(),id:'other',name:'Quy trình khác',steps:[{...wf().steps[0]!,id:'other-step',name:'Khác'}]};
 const state={data:{workflows:[wf(),other],chats:[]},prompts:{own:[]},backends:[],api:[],catalog:{}} as unknown as ViewState;
 await act(async()=>root.render(React.createElement(WorkflowPanel,{state,report,notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:'w'})));
 const open=()=>act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác quy trình: Quy trình khác"]')!.click());
 await open();await act(async()=>menuItem('Ghim').click());expect(mocks.rpc).toHaveBeenCalledWith('workflowPin',{id:'other',pinned:true});expect(host.querySelector<HTMLInputElement>('[aria-label="Tên quy trình"]')!.value).toBe('Bài học');
 await open();await act(async()=>menuItem('Xuất mẫu').click());expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Nội dung mẫu JSON"]')!.value).toContain('Quy trình khác');
 await open();await act(async()=>menuItem('Nhân bản').click());const copy=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow;expect(copy.name).toBe('Quy trình khác (bản sao)');expect(copy.steps[0].name).toBe('Khác');expect(copy.id).not.toBe('other');expect(copy).not.toHaveProperty('planId');
});
