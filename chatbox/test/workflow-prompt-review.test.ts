// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WorkflowPromptDock} from '../src/WorkflowPromptDock';
import {reviewSnapshot,withPromptReview} from '../src/workflow-prompt-review';
const yaml='muc_tieu: "Soạn bài"\ndau_ra: "Bài soạn"\nrang_buoc: "Giữ yêu cầu"\ntieu_chi_hoan_thanh: "Đủ nội dung"';
const reply={promptReview:{token:'token',workflowId:'w',name:'Bài học',steps:[{id:'s',name:'Soạn',original:'Soạn bài',prompt:yaml,canSave:true}]},resume:{method:'workflowRun',params:{id:'w'}}};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(React.createElement(WorkflowPromptDock,{children:React.createElement('div',null,'Sơ đồ quy trình')})));});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;

it('only shows approval actions after generation; approval sends the single-use token',async()=>{
 let finish!:(v:unknown)=>void;
 const send=vi.fn().mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValue(true);
 let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send);});
 expect(host.textContent).toContain('Đang viết lại');expect(button('Duyệt và chạy ngay')).toBeUndefined();
 await act(async()=>{finish(reply);});
 expect(button('Duyệt và chạy ngay')).toBeTruthy();expect(button('Sửa lại')).toBeTruthy();expect(send).toHaveBeenCalledTimes(1);
 expect(host.querySelector('.prompt-review-work')!.textContent).toContain('Sơ đồ');
 await act(async()=>{button('Duyệt và chạy ngay').click();await pending;});
 expect(send).toHaveBeenLastCalledWith('workflowRun',{id:'w',promptApproval:'token',promptEdits:{}});
 expect(host.querySelector('aside')).toBeNull();
});
it('keeps edits through preview switches and runs without writing the saved copy',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockResolvedValue(true);let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('chatWorkflow',{chatId:'c'},send);});
 await act(async()=>{button('Sửa lại').click();});
 const textarea=host.querySelector('textarea')!;
 await act(async()=>{setValue(textarea,'Bản tốt');});
 await act(async()=>{button('Xem lại').click();});
 expect(host.querySelector('.prompt-review-body')!.textContent).toContain('Bản tốt');
 expect(host.querySelector('input[type=checkbox]')).toBeNull();
 await act(async()=>{button('Duyệt và chạy ngay').click();await pending;});
 expect(send).toHaveBeenLastCalledWith('workflowRun',{id:'w',promptApproval:'token',promptEdits:{s:yaml.replace('Soạn bài','Bản tốt')}});
 expect(send.mock.calls.some(c=>c[0]==='workflowPromptSave')).toBe(false);
});
it('saves the reviewed copy only through the explicit save action and never starts the run',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockResolvedValue({promptSaved:true,steps:['Soạn']});let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send);});
 await act(async()=>{button('Lưu vào bản sao').click();await pending;});
 expect(send).toHaveBeenLastCalledWith('workflowPromptSave',{method:'workflowRun',params:{id:'w'},promptApproval:'token',promptEdits:{}});
 expect(send.mock.calls.some(c=>c[0]==='workflowRun'&&c[1].promptApproval)).toBe(false);
 expect(host.textContent).toContain('Đã ghi bản tốt vào 1 nút bản sao');
 expect(host.textContent).toContain('Quy trình chưa chạy');
 await act(async()=>{button('Đóng').click();});expect(reviewSnapshot()).toBeNull();
});
it('blocks saving while an edited field breaks the rule, so nothing is written',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockResolvedValue({promptSaved:true,steps:['Soạn']});let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);});
 await act(async()=>{button('Sửa lại').click();});
 await act(async()=>{setValue(host.querySelector('textarea')!,'');});
 expect((button('Lưu vào bản sao') as HTMLButtonElement).disabled).toBe(true);
 expect(send.mock.calls.some(c=>c[0]==='workflowPromptSave')).toBe(false);
 await act(async()=>{(host.querySelector('[aria-label="Đóng xem trước"]') as HTMLButtonElement).click();await pending;});
});
it('keeps a stale draft visible for comparison when saving is refused, and writes nothing',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockRejectedValueOnce(Error('Bản nháp hết hiệu lực: quy trình, tài nguyên hoặc lượt chạy đã đổi. Bấm Chạy để xem và duyệt lại.'));let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);});
 await act(async()=>{button('Lưu vào bản sao').click();});
 await pending;
 expect(send.mock.calls.filter(c=>c[0]==='workflowPromptSave')).toHaveLength(1);
 expect(send.mock.calls.some(c=>c[0]==='workflowRun'&&c[1].promptApproval)).toBe(false);
 expect(host.querySelector('.prompt-review-stale')).toBeTruthy();expect(host.textContent).toContain('Bản nháp được giữ để đối chiếu');
 expect(host.querySelector('.prompt-review-failed')!.textContent).toContain('Soạn bài');
 expect(button('Lưu vào bản sao')).toBeUndefined();expect(button('Duyệt và chạy ngay')).toBeUndefined();
});
it('closing the review cancels the draft without executing',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockResolvedValue(true);let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('runPlan',{id:'p'},send).catch(e=>e);});
 await act(async()=>{(host.querySelector('[aria-label="Đóng xem trước"]') as HTMLButtonElement).click();await pending;});
 expect(send).toHaveBeenLastCalledWith('workflowPromptCancel',{id:'w'});expect(send).toHaveBeenCalledTimes(2);expect(reviewSnapshot()).toBeNull();
});
it('does not block another review while an approved workflow is executing',async()=>{
 let finish!:(v:unknown)=>void;
 const send=vi.fn().mockResolvedValueOnce(reply).mockImplementationOnce(()=>new Promise(r=>finish=r));let first!:Promise<unknown>;
 await act(async()=>{first=withPromptReview('workflowRun',{id:'w'},send);});
 await act(async()=>{button('Duyệt và chạy ngay').click();});
 const other=vi.fn().mockResolvedValueOnce(reply).mockResolvedValue(true);let second!:Promise<unknown>;
 await act(async()=>{second=withPromptReview('workflowRun',{id:'another'},other).catch(e=>e);});
 await act(async()=>{finish(true);await first;});
 expect(reviewSnapshot()?.phase).toBe('review');
 await act(async()=>{(host.querySelector('[aria-label="Đóng xem trước"]') as HTMLButtonElement).click();await second;});
});
it('bypass preparation closes the panel before the original Plan begins execution',async()=>{
 let finish!:(value:unknown)=>void;
 const send=vi.fn().mockResolvedValueOnce({promptReady:true,resume:{method:'runPlan',params:{id:'p'}}}).mockImplementationOnce(()=>new Promise(r=>finish=r));
 let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('runPlan',{id:'p'},send);});
 expect(reviewSnapshot()).toBeNull();expect(send).toHaveBeenLastCalledWith('runPlan',{id:'p'});
 await act(async()=>{finish(true);await pending;});
});
const setValue=(el:HTMLTextAreaElement,value:string)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};

it('shows a failed rewrite as an error with no approval actions, and still rethrows it to the caller',async()=>{
 const send=vi.fn().mockRejectedValueOnce(Error('Mô hình lỗi tạm thời'));let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);});
 expect(host.textContent).toContain('Có lỗi khi duyệt lời nhắc');expect(host.textContent).toContain('Mô hình lỗi tạm thời');
 expect(button('Duyệt và chạy ngay')).toBeUndefined();expect(button('Sửa lại')).toBeUndefined();
 expect((await pending as Error).message).toBe('Mô hình lỗi tạm thời');
 await act(async()=>{button('Đóng').click();});
 expect(reviewSnapshot()).toBeNull();expect(send).toHaveBeenCalledTimes(1);
});
it('marks a draft that became stale after approval as needing review and never retries the run',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockRejectedValueOnce(Error('Bản nháp hết hiệu lực: quy trình, tài nguyên hoặc lượt chạy đã đổi. Bấm Chạy để xem và duyệt lại.'));let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);});
 await act(async()=>{button('Duyệt và chạy ngay').click();});
 await pending;
 expect(host.textContent).toContain('Cần duyệt lại');expect(host.querySelector('.prompt-review-stale')).toBeTruthy();
 expect(button('Duyệt và chạy ngay')).toBeUndefined();
 expect(send).toHaveBeenCalledTimes(2);
});
it('blocks approval while an edited field breaks the rule, and keeps the typed draft until it is fixed',async()=>{
 const send=vi.fn().mockResolvedValueOnce(reply).mockResolvedValue(true);let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);});
 await act(async()=>{button('Sửa lại').click();});
 const goal=host.querySelector('textarea')!;
 await act(async()=>{setValue(goal,'');});
 expect(host.querySelector('[role=alert]')?.textContent).toContain('Mục mô tả cần từ 1 đến 4.000 ký tự');
 expect((button('Duyệt và chạy ngay') as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{button('Xem lại').click();});
 await act(async()=>{button('Sửa lại').click();});
 expect(host.querySelector('textarea')!.value).toBe('');
 await act(async()=>{setValue(host.querySelector('textarea')!,'Bản đã sửa');});
 expect(host.querySelector('[role=alert]')).toBeNull();
 await act(async()=>{button('Duyệt và chạy ngay').click();await pending;});
 expect(send).toHaveBeenLastCalledWith('workflowRun',expect.objectContaining({promptEdits:{s:yaml.replace('Soạn bài','Bản đã sửa')}}));
});
it('does not start a run when the review is closed, and keeps approval hidden while preparing',async()=>{
 let finish!:(v:unknown)=>void;
 const send=vi.fn().mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValue(true);let pending!:Promise<unknown>;
 await act(async()=>{pending=withPromptReview('workflowRun',{id:'w'},send).catch(e=>e);});
 expect(host.querySelector('[aria-busy=true]')).toBeTruthy();expect(button('Duyệt và chạy ngay')).toBeUndefined();
 await act(async()=>{(host.querySelector('[aria-label="Đóng xem trước"]') as HTMLButtonElement).click();finish(reply);await pending;});
 expect(send.mock.calls.some(c=>c[0]==='workflowRun'&&c[1].promptApproval)).toBe(false);
 expect(send.mock.calls.some(c=>c[0]==='workflowRun')).toBe(true);
 expect(reviewSnapshot()).toBeNull();
});
