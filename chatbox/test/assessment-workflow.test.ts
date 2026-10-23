// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../src/Icon',()=>({Icon:()=>null}));
vi.mock('../src/ipc',()=>({rpc:vi.fn(),pickFiles:vi.fn()}));
import {TeacherSuiteWorkspace} from '../src/TeacherSuiteModal';
import {rpc,pickFiles} from '../src/ipc';
import {readFileSync} from 'node:fs';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('manual selection creates a Plan Pro request containing exact selected rows',async()=>{
 const send=vi.fn();await act(async()=>root.render(React.createElement(TeacherSuiteWorkspace,{onSendPrompt:send,notice:vi.fn()})));
 const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Sinh trọn bộ'))!;
 await act(async()=>button.click());expect(send.mock.calls[0]![0]).toContain('[PVTA:EXAM:PLAN-PRO]');expect(send.mock.calls[0]![0]).toContain('"items":');
});
it('matrix mode blocks output until reconciliation and disables template balancing',async()=>{
 await act(async()=>root.render(React.createElement(TeacherSuiteWorkspace,{onSendPrompt:vi.fn(),notice:vi.fn()})));
 const select=Array.from(host.querySelectorAll('select')).find(s=>s.textContent?.includes('Đính kèm ma trận'))!;
 await act(async()=>{select.value='matrix';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Sinh trọn bộ'))!.disabled).toBe(true);
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Tự động cân đối'))!.disabled).toBe(true);
});
it('mixer export carries full questions through Plan Pro instead of downloading immediately',async()=>{
 const send=vi.fn();await act(async()=>root.render(React.createElement(TeacherSuiteWorkspace,{tab:'mixer',onSendPrompt:send,notice:vi.fn()})));
 const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Xuất CSV'))!;
 await act(async()=>button.click());expect(send.mock.calls[0]![0]).toContain('[PVTA:EXAM:PLAN-PRO]');expect(send.mock.calls[0]![0]).toContain('"variants":');expect(send.mock.calls[0]![0]).toContain('"source":');
});
async function openMatrix(){
 await act(async()=>root.render(React.createElement(TeacherSuiteWorkspace,{onSendPrompt:vi.fn(),notice:vi.fn()})));
 const select=Array.from(host.querySelectorAll('select')).find(s=>s.textContent?.includes('Đính kèm ma trận'))!;
 await act(async()=>{select.value='matrix';select.dispatchEvent(new Event('change',{bubbles:true}));});
}
it('shows parsed cells and permits reading-report export without substituting sample YCCĐ',async()=>{
 await openMatrix();
 vi.mocked(pickFiles).mockResolvedValue(['/matrix.docx']);
 vi.mocked(rpc).mockResolvedValue({name:'matrix.docx',text:readFileSync('core/test/fixtures/assessment/matrix.txt','utf8')});
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Đính kèm ma trận')!.click());
 expect(rpc).toHaveBeenCalledWith('extractText',{path:'/matrix.docx',preserveRefs:true});
 expect(host.querySelector('[aria-label="Kết quả đọc ma trận"]')?.textContent).toContain('R9C9');
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Xuất báo cáo đọc (.md)')?.disabled).toBe(false);
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='AI chọn YCCĐ và phân bổ theo ma trận')?.disabled).toBe(true);
});
it('reports extraction failure instead of silently reopening the file picker',async()=>{
 await openMatrix();vi.mocked(pickFiles).mockResolvedValue(['/broken.docx']);vi.mocked(rpc).mockRejectedValue(new Error('Tệp hỏng'));
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Đính kèm ma trận')!.click());
 expect(host.querySelector('[role=alert]')?.textContent).toContain('Tệp hỏng');
 expect(pickFiles).toHaveBeenCalledTimes(1);
});
it('preserves source coordinates when dropping a specification',async()=>{
 await openMatrix();vi.mocked(rpc).mockResolvedValue({name:'spec.docx',text:'Không đọc được YCCĐ'});
 const drop=new Event('drop',{bubbles:true,cancelable:true});
 Object.defineProperty(drop,'dataTransfer',{value:{files:[{name:'spec.docx',path:'/spec.docx'}]}});
 await act(async()=>host.querySelector('.hero-file-dropzone')!.dispatchEvent(drop));
 expect(rpc).toHaveBeenCalledWith('extractText',{path:'/spec.docx',preserveRefs:true});
});
