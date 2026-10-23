// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Plan} from '../src/ipc';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc}));
vi.mock('../src/Markdown',()=>({Markdown:({text}:{text:string})=>React.createElement('p',null,text)}));
import {PlanCard} from '../src/PlanCard';
let host:HTMLDivElement,root:Root;
const plan:Plan={id:'p1',chatId:'c1',title:'Soạn bài',revision:2,approved:false,steps:[{id:'s1',goal:'Soạn',task:'Viết bài',files:[],risk:'',status:'waiting'}]};
const onRun=vi.fn(),report=vi.fn();
const render=async(p=plan,graphView=false)=>{await act(async()=>root.render(React.createElement(PlanCard,{plan:p,graphView,busy:false,onRun,report,notice:vi.fn()})));};
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 localStorage.clear();vi.stubGlobal('confirm',()=>true);mocks.rpc.mockReset().mockResolvedValue(true);onRun.mockReset();report.mockReset();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it.each([false,true])('duyệt từ thanh đầu trong danh sách hoặc sơ đồ (%s), chặn nhấp lặp',async graph=>{
 let finish!:()=>void;onRun.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await render(plan,graph);
 const toolbar=host.querySelector('[aria-label="Duyệt và chạy Plan"]')!;
 expect(toolbar.compareDocumentPosition(host.querySelector('.plan-pipeline')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 const run=button('✓ Duyệt toàn bộ & chạy');expect(toolbar.contains(run)).toBe(true);
 await act(async()=>{run.click();run.click();});expect(onRun).toHaveBeenCalledTimes(1);
 await act(async()=>button('Dừng').click());expect(mocks.rpc).toHaveBeenCalledWith('cancel',{chatId:'c1'});
 await act(async()=>finish());
 await act(async()=>button(graph?'Xem danh sách Plan':'Xem sơ đồ phụ thuộc').click());
 expect(button('✓ Duyệt toàn bộ & chạy').disabled).toBe(false);expect(onRun).toHaveBeenCalledTimes(1);
});
it('chặn duyệt khi sửa và chỉ mở lại sau khi lưu thành công',async()=>{
 await render();await act(async()=>button('Chỉnh sửa trực tiếp').click());
 expect(button('✓ Duyệt toàn bộ & chạy').disabled).toBe(true);
 mocks.rpc.mockRejectedValueOnce(Error('Phiên bản đã đổi'));
 await act(async()=>button('Lưu Plan và Quy trình').click());expect(button('✓ Duyệt toàn bộ & chạy').disabled).toBe(true);
 expect(report).toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce(true);await act(async()=>button('Lưu Plan và Quy trình').click());
 expect(button('✓ Duyệt toàn bộ & chạy').disabled).toBe(false);expect(onRun).not.toHaveBeenCalled();
});
it('tiếp tục Plan đã duyệt, giữ kết quả xong và khóa khi hoàn tất',async()=>{
 await render({...plan,approved:true});await act(async()=>button('▶ Chạy tiếp toàn bộ kế hoạch').click());expect(onRun).toHaveBeenCalledWith(undefined);
 await render({...plan,approved:true,steps:plan.steps.map(s=>({...s,status:'done',output:'Đã lưu'}))});
 expect(button('▶ Chạy tiếp toàn bộ kế hoạch').disabled).toBe(true);
});


it.each([false,true])('nút duyệt từng giai đoạn chỉ gửi ID được chọn và khóa bước sau (%s)',async graph=>{
 const p:Plan={...plan,steps:[{...plan.steps[0]!,dependsOn:[]},{...plan.steps[0]!,id:'s2',goal:'Kiểm tra',dependsOn:['s1']}]};
 await render(p,graph);
 const buttons=(goal:string)=>[...host.querySelectorAll<HTMLButtonElement>(`button[aria-label="Duyệt và chạy giai đoạn: ${goal}"]`)];
 expect(buttons('Soạn')).toHaveLength(1);expect(buttons('Kiểm tra')).toHaveLength(1);expect(buttons('Kiểm tra').every(b=>b.disabled)).toBe(true);
 let finish!:()=>void;onRun.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 await act(async()=>{buttons('Soạn')[0]!.click();buttons('Soạn')[0]!.click();});expect(onRun).toHaveBeenCalledExactlyOnceWith('s1');
 await act(async()=>finish());
 await render({...p,steps:[{...p.steps[0]!,status:'done',output:'Đã lưu'},p.steps[1]!]},graph);
 expect(buttons('Soạn')).toHaveLength(0);expect(host.querySelector('.wf-completed')?.textContent).toContain('Đã hoàn tất');expect(buttons('Kiểm tra').every(b=>!b.disabled)).toBe(true);
 onRun.mockResolvedValue(undefined);await act(async()=>buttons('Kiểm tra')[0]!.click());expect(onRun).toHaveBeenLastCalledWith('s2');
 expect(host.querySelector('button button')).toBeNull();
});

it('opens recovery for the interrupted second stage without rerunning the completed first stage',async()=>{
 const p:Plan={...plan,approved:true,steps:[{...plan.steps[0]!,status:'done',output:'Đã xác minh',dependsOn:[]},{...plan.steps[0]!,id:'s2',goal:'Xây dựng',status:'interrupted',dependsOn:['s1'],error:'Ứng dụng đã đóng khi chạy.'}]};
 mocks.rpc.mockResolvedValue({planId:p.id,stepId:'s2',revision:2,token:'t',current:[],before:[],after:[],actions:[],output:'',warning:'Kiểm tra trước khi chạy lại.'});
 await render(p,true);
 const second=host.querySelector<HTMLButtonElement>('[aria-label="Duyệt và chạy giai đoạn: Xây dựng"]')!;
 expect(second.disabled).toBe(false);expect(second.textContent).toBe('Đối chiếu và thử lại');
 await act(async()=>second.click());
 expect(mocks.rpc).toHaveBeenCalledWith('inspectPlanRecovery',{id:'p1',stepId:'s2'});expect(onRun).not.toHaveBeenCalled();
 expect(host.querySelector('[aria-label="Đối chiếu khôi phục"]')).not.toBeNull();
});

it('opens the clicked graph node in an editor dialog and saves its changed connections',async()=>{
 const p:Plan={...plan,steps:[{...plan.steps[0]!,dependsOn:[]},{...plan.steps[0]!,id:'s2',goal:'Kiểm tra',dependsOn:['s1']}]};
 await render(p,true);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: Kiểm tra"]')!.click());
 const dialog=host.querySelector('[role="dialog"]')!;expect(dialog).not.toBeNull();
 const dependency=dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
 expect(dependency.checked).toBe(true);await act(async()=>dependency.click());
 await act(async()=>button('Xong').click());await act(async()=>button('Lưu Plan và Quy trình').click());
 expect(mocks.rpc).toHaveBeenCalledWith('editPlan',expect.objectContaining({steps:expect.arrayContaining([expect.objectContaining({id:'s2',dependsOn:[]})])}));
 expect(onRun).not.toHaveBeenCalled();
});
it('deletes a node with its connections and keeps remaining root nodes independent when saved',async()=>{
 const p:Plan={...plan,steps:[{...plan.steps[0]!,dependsOn:[]},{...plan.steps[0]!,id:'s2',goal:'Kiểm tra',dependsOn:['s1']}]};
 await render(p,true);await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: Soạn"]')!.click());
 await act(async()=>button('Xóa bước').click());expect(host.querySelector('[role="dialog"]')).toBeNull();
 await act(async()=>button('Lưu Plan và Quy trình').click());expect(mocks.rpc).toHaveBeenCalledWith('editPlan',expect.objectContaining({steps:[expect.objectContaining({id:'s2',dependsOn:[]})]}));
});
it('adds a node from the graph and opens its editable information',async()=>{
 await render(plan,true);await act(async()=>button('＋ Thêm bước trên sơ đồ').click());
 expect(host.querySelector('[role="dialog"] [aria-label="Mục tiêu"]')).not.toBeNull();
 expect(button('✓ Duyệt toàn bộ & chạy').disabled).toBe(true);expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each(['Thêm bước sau','Tạo nhánh song song'])('uses the Plan node menu for %s and keeps implicit dependencies explicit',async label=>{
 const p:Plan={...plan,steps:[plan.steps[0]!,{...plan.steps[0]!,id:'s2',goal:'Kiểm tra'}]};await render(p,true);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác bước: Soạn"]')!.click());expect(host.querySelector('[role=dialog]')).toBeNull();
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes(label))!.click());expect(host.querySelector('[role=dialog]')).not.toBeNull();
 await act(async()=>button('Xong').click());await act(async()=>button('Lưu Plan và Quy trình').click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='editPlan')![1].steps;
 expect(saved).toHaveLength(3);const branch=saved[1];expect(saved[0].dependsOn).toEqual([]);
 expect(branch.dependsOn).toEqual(label==='Thêm bước sau'?['s1']:[]);expect(saved[2].dependsOn).toEqual(label==='Thêm bước sau'?[branch.id]:['s1',branch.id]);
 expect(onRun).not.toHaveBeenCalled();
});
it('blocks graph commands on a running Plan and displays disabled reasons',async()=>{
 await render({...plan,steps:[{...plan.steps[0]!,status:'running'}]},true);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác bước: Soạn"]')!.click());
 const commands=[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];expect(commands.every(b=>b.getAttribute('aria-disabled')==='true')).toBe(true);
 await act(async()=>commands.find(b=>b.textContent?.includes('Xóa bước'))!.click());expect(host.querySelectorAll('.wf-node')).toHaveLength(1);expect(mocks.rpc).not.toHaveBeenCalled();
});
