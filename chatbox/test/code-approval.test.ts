// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc}));
import {CodeApproval} from '../src/CodeApproval';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);mocks.rpc.mockReset().mockResolvedValue(true);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const step=(findings:any[],decision='waiting')=>({stepId:'s1',name:'Cộng',status:'running',code:{lang:'python',code:'print(1)',findings,canRun:true,decision}}) as any;
const btn=(t:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(t));

it('duyệt mã không có cảnh báo cao gửi quyết định lên lõi',async()=>{
 await act(async()=>root.render(React.createElement(CodeApproval,{workflowId:'w',runId:'r',step:step([{level:'low',text:'Ghi tệp',source:'scan'}]),report:vi.fn()})));
 expect(host.textContent).toContain('print(1)');expect(host.textContent).toContain('Ghi tệp');
 await act(async()=>{btn('Duyệt và chạy')!.click();});
 expect(mocks.rpc).toHaveBeenCalledWith('workflowCodeDecide',{workflowId:'w',runId:'r',stepId:'s1',approved:true,force:false});
});
it('cảnh báo mức cao chặn nút duyệt thường và chỉ cho “Vẫn chạy” sau khi xác nhận',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);
 await act(async()=>root.render(React.createElement(CodeApproval,{workflowId:'w',runId:'r',step:step([{level:'high',text:'Xóa thư mục',source:'ai'}]),report:vi.fn()})));
 expect((btn('Duyệt và chạy') as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{btn('Vẫn chạy')!.click();});
 expect(mocks.rpc).toHaveBeenCalledWith('workflowCodeDecide',{workflowId:'w',runId:'r',stepId:'s1',approved:true,force:true});
});
it('không duyệt gửi approved=false; mã đã quyết định không hiện nút',async()=>{
 await act(async()=>root.render(React.createElement(CodeApproval,{workflowId:'w',runId:'r',step:step([]),report:vi.fn()})));
 await act(async()=>{btn('Không duyệt')!.click();});
 expect(mocks.rpc).toHaveBeenCalledWith('workflowCodeDecide',expect.objectContaining({approved:false}));
 await act(async()=>root.render(React.createElement(CodeApproval,{workflowId:'w',runId:'r',step:step([],'approved'),report:vi.fn()})));
 expect(btn('Không duyệt')).toBeUndefined();
});
