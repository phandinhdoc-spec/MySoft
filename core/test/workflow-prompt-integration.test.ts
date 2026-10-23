import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowPrompts,REWRITE_SYSTEM,rewriteYaml,type PromptReviewReply} from '../src/desktop/workflow-prompts';
import {normalizeWorkflow} from '../src/desktop/workflows';
import {DesktopRuntime} from '../src/desktop/runtime';
import type {WorkflowRun} from '../src/desktop/types';

/** Kiểm thử tích hợp chuỗi: tạo nháp → sửa → duyệt/chạy/lưu → tải lại, cho quy trình độc lập. Bản sao Plan nằm ở workflow-prompts.test.ts. */
const answer=JSON.stringify({muc_tieu:'Soạn theo yêu cầu gốc',dau_ra:'Kết quả đáp ứng yêu cầu',rang_buoc:'Không bịa dữ liệu',tieu_chi_hoan_thanh:'Đáp ứng yêu cầu gốc'});
const workflow=()=>normalizeWorkflow({name:'Bài học',steps:[{id:'a',name:'Soạn',prompt:'Dùng {{input}}'},{id:'b',name:'Rà',prompt:'Rà {{prev}}'}]});
const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));vi.restoreAllMocks();});
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-integ-'));roots.push(dir);return dir;}
const dispatch=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const approve=(r:DesktopRuntime,d:PromptReviewReply,extra:Record<string,unknown>={})=>dispatch(r,d.resume.method,{...d.resume.params,promptApproval:d.promptReview.token,...extra});
const saveDraft=(r:DesktopRuntime,d:PromptReviewReply)=>dispatch(r,'workflowPromptSave',{method:d.resume.method,params:d.resume.params,promptApproval:d.promptReview.token});
const rewrites=(spy:{mock:{calls:unknown[][]}})=>spy.mock.calls.filter(c=>(c[0] as {system?:string}).system===REWRITE_SYSTEM).length;
function runtime(){
 const dir=temp(),r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.store.data.preferences.choice={backend:'api',model:'mock/model'};
 const spy=vi.spyOn(r.engine,'run').mockImplementation(async o=>({text:o.system===REWRITE_SYSTEM?answer:'Kết quả đã làm',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never));
 return {r,spy,dir};
}

describe('khai báo đầu vào/đầu ra bỏ trống',()=>{
 it('nút đầu lấy đầu vào quy trình và không có bước trước',()=>{
  const w=workflow(),y=rewriteYaml(w,w.steps[0]!,answer);
  expect(y).toContain('  nguon: "Đầu vào quy trình, nếu có"');expect(y).toContain('  buoc_truoc: []');
  expect(y).toContain('  khai_bao: []');expect(y).toContain('dau_ra: "Kết quả đáp ứng yêu cầu"');
 });
 it('nút sau nhận kết quả bước trước làm đầu vào mặc định',()=>{
  const w=workflow(),y=rewriteYaml(w,w.steps[1]!,answer);
  expect(y).toContain('  nguon: "Kết quả các bước cần chờ"');expect(y).toContain('  buoc_truoc: ["a"]');
 });
 it('nút phụ thuộc trong quy trình song song theo dependsOn, không theo thứ tự',()=>{
  const w=workflow();w.mode='parallel';w.steps[1]!.dependsOn=['a'];
  expect(rewriteYaml(w,w.steps[1]!,answer)).toContain('  buoc_truoc: ["a"]');
  w.steps[1]!.dependsOn=[];expect(rewriteYaml(w,w.steps[1]!,answer)).toContain('  buoc_truoc: []');
 });
 it('đầu ra khai báo thay thế mặc định do model viết',()=>{
  const w=workflow();w.steps[0]!.outputs=['Dàn ý','Phiếu'];
  expect(rewriteYaml(w,w.steps[0]!,answer)).toContain('dau_ra: "Dàn ý; Phiếu"');
 });
});

describe('lỗi và hủy trong chuẩn bị nháp',()=>{
 it('lỗi model được gắn tên nút, không chạy và không để lại bản nháp',async()=>{
  const {r,spy}=runtime(),w=workflow();r.store.data.workflows=[w];
  spy.mockImplementation(async()=>{throw Error('Mô hình quá tải');});
  await expect(dispatch(r,'workflowRun',{id:w.id})).rejects.toThrow('Nút “Soạn”: mô hình không trả được bản viết lại (Mô hình quá tải)');
  expect(w.runs).toHaveLength(0);expect(w.steps[0]!.promptFormat).toBeUndefined();
 });
 it('JSON sai hoặc thiếu mục bị từ chối với tên nút và hướng dẫn thử lại',async()=>{
  const {r,spy}=runtime(),w=workflow();r.store.data.workflows=[w];
  spy.mockImplementation(async()=>({text:'không phải json',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never));
  await expect(dispatch(r,'workflowRun',{id:w.id})).rejects.toThrow('không phải JSON hợp lệ. Chưa chạy; bấm Chạy để thử lại.');
  spy.mockImplementation(async()=>({text:'{"muc_tieu":"x"}',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never));
  await expect(dispatch(r,'workflowRun',{id:w.id})).rejects.toThrow('thiếu dau_ra');
  expect(w.runs).toHaveLength(0);
 });
 it('tệp đính kèm bị mất trước khi viết lại: dừng ngay, nêu nút và tệp, không gọi model',async()=>{
  const {r,spy}=runtime(),w=workflow(),missing=path.join(temp(),'da-xoa.txt');w.steps[0]!.files=[missing];r.store.data.workflows=[w];
  await expect(dispatch(r,'workflowRun',{id:w.id})).rejects.toThrow(`Nút “Soạn”: tệp hoặc thư mục đính kèm không còn truy cập được: ${missing}`);
  expect(rewrites(spy)).toBe(0);expect(w.runs).toHaveLength(0);
 });
 it('tệp bị xóa sau khi đã duyệt nháp: duyệt bị từ chối vì tài nguyên không còn truy cập được',async()=>{
  const {r}=runtime(),w=workflow(),file=path.join(temp(),'nguon.txt');fs.writeFileSync(file,'Một');w.steps[0]!.files=[file];r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  fs.rmSync(file);
  await expect(approve(r,d)).rejects.toThrow('không còn truy cập được');expect(w.runs).toHaveLength(0);
 });
 it('tệp bị sửa nội dung sau khi duyệt nháp: bản nháp hết hiệu lực, không chạy',async()=>{
  const {r}=runtime(),w=workflow(),file=path.join(temp(),'nguon.txt');fs.writeFileSync(file,'Một');w.steps[0]!.files=[file];r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  fs.writeFileSync(file,'Hai, dài hơn');
  await expect(approve(r,d)).rejects.toThrow('hết hiệu lực');expect(w.runs).toHaveLength(0);
 });
 it('hủy qua RPC workflowPromptCancel xóa bản nháp; duyệt sau đó bị từ chối',async()=>{
  const {r}=runtime(),w=workflow();r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  expect(await dispatch(r,'workflowPromptCancel',{id:w.id})).toBe(true);
  await expect(approve(r,d)).rejects.toThrow('hết hiệu lực');expect(w.runs).toHaveLength(0);
 });
 it('hủy khi đang viết lại dừng chuẩn bị và không để lại bản nháp',async()=>{
  const s=new WorkflowPrompts(),w=workflow();
  const pending=s.prepare(w,{},'k',(_text,signal)=>new Promise<string>((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))));
  s.cancel(w.id);
  await expect(pending).rejects.toThrow('Đã dừng viết lại prompt.');
  s.dispose();
 });
});

describe('lưu, lỗi tham số và tái sử dụng kết quả',()=>{
 it('RPC lưu từ chối phương thức lạ và thiếu bản duyệt',async()=>{
  const {r}=runtime(),w=workflow();r.store.data.workflows=[w];
  await expect(dispatch(r,'workflowPromptSave',{method:'deleteAll',params:{},promptApproval:'x'})).rejects.toThrow('Lượt chạy không hợp lệ.');
  await expect(dispatch(r,'workflowPromptSave',{method:'workflowRun',params:{id:w.id}})).rejects.toThrow('Thiếu bản duyệt lời nhắc.');
  await expect(dispatch(r,'workflowPromptSave',{method:'workflowRun',params:{id:w.id},promptApproval:'khong-ton-tai'})).rejects.toThrow('hết hiệu lực');
 });
 it('bản nháp chỉ dùng được một lần: lưu xong không thể lưu hoặc chạy lại bằng cùng token',async()=>{
  const {r}=runtime(),w=workflow();w.steps.forEach(s=>s.templateCopy=true);r.store.data.workflows=[w];
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  await saveDraft(r,d);
  await expect(saveDraft(r,d)).rejects.toThrow('hết hiệu lực');
  await expect(approve(r,d)).rejects.toThrow('hết hiệu lực');
  expect(w.runs).toHaveLength(0);
 });
 it('quy trình có !bien bỏ qua viết lại: chạy thẳng, không tạo bản nháp',async()=>{
  const {r,spy}=runtime(),w=workflow();w.steps=[{...w.steps[0]!,prompt:'!bien so-lan = 0\n!in $so-lan'}];r.store.data.workflows=[w];
  const run=await dispatch(r,'workflowRun',{id:w.id}) as WorkflowRun&{promptReview?:unknown};
  expect(run.status).toBe('success');expect(run.promptReview).toBeUndefined();expect(rewrites(spy)).toBe(0);
 });
 it('chạy lại phần lỗi qua RPC tái sử dụng đúng prompt đã duyệt, không gọi viết lại lần nữa',async()=>{
  const {r,spy}=runtime(),w=workflow();w.steps.forEach(s=>s.templateCopy=true);r.store.data.workflows=[w];
  const base=spy.getMockImplementation()!;let failOnce=true;
  spy.mockImplementation((async(o:{system?:string;buildPrompt?:(a:boolean,b:boolean)=>string})=>{
   if(o.system!==REWRITE_SYSTEM&&failOnce&&o.buildPrompt?.(false,false).includes('Rà')){failOnce=false;throw Error('lỗi tạm');}
   return base(o as never);
  }) as never);
  const d=await dispatch(r,'workflowRun',{id:w.id}) as PromptReviewReply;
  const first=await approve(r,d) as WorkflowRun;
  expect(first.status).toBe('error');expect(first.approvedPrompts).toBeDefined();
  const before=rewrites(spy);
  const retry=await dispatch(r,'workflowRun',{id:w.id,retry:true}) as PromptReviewReply;
  expect(rewrites(spy)).toBe(before);
  expect(retry.promptReview.steps.map(s=>s.prompt)).toEqual(Object.values(first.approvedPrompts!.prompts));
  const second=await approve(r,retry) as WorkflowRun;
  expect(second.status).toBe('success');expect(w.runs[0]!.status).toBe('success');
 });
});
