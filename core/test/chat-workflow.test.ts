import {beforeEach,describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import type {Message} from '../src/desktop/types';
import {REWRITE_SYSTEM,type PromptReviewReply} from '../src/desktop/workflow-prompts';

// Mỗi test có thư mục tạm dùng chung riêng (PVTA_RESULT_DIR), không ghi vào /tmp thật.
beforeEach(()=>{process.env.PVTA_RESULT_DIR=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-result-test-')),'PVTA-Ket-qua');});

const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-chatwf-'));roots.push(dir);
 const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
 r.store.data.documentsDir=path.join(dir,'Documents');
 r.store.data.preferences.choice={backend:'api',model:'mock/mini'};
 r.store.data.workflowTemplates=[{id:'t1',name:'Ôn tập',params:[{key:'chu-de',label:'Chủ đề',required:true}],steps:[{id:'s1',name:'Soạn',prompt:'Soạn câu hỏi về {{chu-de}}',access:'read'}],output:{mode:'ask',text:''},createdAt:1,updatedAt:1}] as never;
 return {r,spy:vi.spyOn(r.engine,'run')};
}
const req=async(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>{
 if(method!=='chatWorkflow')return r.dispatch({id:crypto.randomUUID(),method,params});
 // These result tests approve the new preview explicitly; rewrite validation has its own suite.
 const original=(r as any).model.bind(r);
 const rewrite=vi.spyOn(r as any,'model').mockImplementation((...args:any[])=>args[1]===REWRITE_SYSTEM?Promise.resolve(JSON.stringify({muc_tieu:'Theo yêu cầu',dau_ra:'Kết quả',rang_buoc:'Giữ yêu cầu',tieu_chi_hoan_thanh:'Đáp ứng yêu cầu'})):original(...args));
 let draft:PromptReviewReply;
 try{draft=await r.dispatch({id:crypto.randomUUID(),method,params}) as PromptReviewReply;}finally{rewrite.mockRestore();}
 return r.dispatch({id:crypto.randomUUID(),method:draft.resume.method,params:{...draft.resume.params,promptApproval:draft.promptReview.token}});
};
const reply=(text='Đề 1: Phân số là gì?')=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}} as never);

describe('mở hội thoại từ quy trình',()=>{
 it('tạo chat khi được yêu cầu, giữ liên kết qua lưu và tạo lại khi chat bị xóa',async()=>{
  const {r}=setup();
  await req(r,'workflowSave',{workflow:{id:'w',name:'Ôn tập',steps:[]}});
  expect(r.store.data.chats).toHaveLength(0);
  const [a,b]=await Promise.all([req(r,'workflowOpenChat',{id:'w'}),req(r,'workflowOpenChat',{id:'w'})]);
  expect(a).toBe(b);expect(r.store.data.chats).toHaveLength(1);
  expect(r.store.data.chats[0]!.title).toBe('Ôn tập');
  expect(r.store.data.workflows![0]!.planId).toBeUndefined();
  await req(r,'workflowSave',{workflow:{id:'w',name:'Đổi tên',steps:[]}});
  expect(await req(r,'workflowOpenChat',{id:'w'})).toBe(a);
  const reloaded=new DesktopRuntime(()=>{},r.store.home);runtimes.push(reloaded);
  expect(await req(reloaded,'workflowOpenChat',{id:'w'})).toBe(a);
  expect(reloaded.store.data.chats).toHaveLength(1);
  await req(r,'deleteChat',{chatId:a});
  expect(r.store.data.workflows).toHaveLength(1);
  expect(await req(r,'workflowOpenChat',{id:'w'})).not.toBe(a);
 });
 it('ưu tiên đúng chat chứa Plan và mở lại chat thiết kế hiện có',async()=>{
  const {r}=setup();
  const first=await req(r,'newChat') as string,second=await req(r,'newChat') as string;
  r.store.data.chats[1]!.messages.push({id:'m',role:'assistant',text:'',at:1,plan:{id:'plan',chatId:second,title:'Kế hoạch',steps:[],approved:false}});
  r.store.data.workflows=[{id:'w',planId:'plan',chatId:first,name:'Quy trình',steps:[],runs:[],updatedAt:1}];
  expect(await req(r,'workflowOpenChat',{id:'w'})).toBe(second);
  delete r.store.data.workflows[0]!.planId;delete r.store.data.workflows[0]!.chatId;
  r.store.data.chats[0]!.workflowDesign={workflowId:'w'};
  expect(await req(r,'workflowOpenChat',{id:'w'})).toBe(first);
  expect(r.store.data.chats).toHaveLength(2);
 });
 it('không tạo chat khi quy trình không còn tồn tại',async()=>{
  const {r}=setup();
  await expect(req(r,'workflowOpenChat',{id:'missing'})).rejects.toThrow('Quy trình không còn tồn tại.');
  expect(r.store.data.chats).toHaveLength(0);
 });
});

describe('gọi quy trình ngay trong hội thoại',()=>{
 it('runs the template and posts the result as a PVTA message in the same chat',async()=>{
  const {r,spy}=setup();
  const chatId=await req(r,'newChat') as string;
  spy.mockResolvedValueOnce(reply());
  const msg=await req(r,'chatWorkflow',{chatId,templateId:'t1',params:{'chu-de':'Phân số'},output:'1 tệp'}) as Message;
  expect(msg.role).toBe('assistant');
  expect(msg.workflow?.status).toBe('success');
  expect(msg.text).toContain('“Ôn tập” đã chạy xong: 1/1 khâu thành công.');
  expect(msg.text).toContain('Đề 1: Phân số là gì?');
  const messages=r.store.data.chats.find(c=>c.id===chatId)!.messages;
  expect(messages.map(m=>m.role)).toEqual(['user','assistant']);
  expect(messages[0]!.text).toBe('Gọi quy trình “Ôn tập”.');
  const wfSaved=r.store.data.workflows?.find(w=>w.id===msg.workflow!.id);
  expect(wfSaved?.steps[0]?.prompt).toContain('Phân số');
  expect(r.store.data.workflows?.find(w=>w.id===msg.workflow!.id)?.runs[0]?.status).toBe('success');
 });

 it('after a failed step, retry from that step posts a new result without rerunning finished steps',async()=>{
  const {r,spy}=setup();
  const chatId=await req(r,'newChat') as string;
  spy.mockRejectedValueOnce(new Error('Mô hình không phản hồi'));
  const failed=await req(r,'chatWorkflow',{chatId,templateId:'t1',params:{'chu-de':'Số thập phân'},output:'5 câu'}) as Message;
  expect(failed.workflow?.status).toBe('error');
  expect(failed.text).toContain('Có thể chạy tiếp từ khâu lỗi');
  const workflowId=failed.workflow!.id;
  const callsBefore=spy.mock.calls.length;
  spy.mockResolvedValueOnce(reply('Đề 2: Số thập phân'));
  const retried=await req(r,'chatWorkflow',{chatId,workflowId,retry:true}) as Message;
  expect(retried.workflow).toEqual({id:workflowId,status:'success'});
  expect(spy.mock.calls.length).toBe(callsBefore+1);
  expect(r.store.data.chats.find(c=>c.id===chatId)!.messages.at(-2)!.text).toBe('Chạy tiếp quy trình “Ôn tập” từ khâu lỗi.');
 });

 it('step in Edit mode without a folder uses the stable save location and reports it',async()=>{
  const {r,spy}=setup();
  r.store.data.workflowTemplates![0]!.steps[0]!.access='full' as never;
  const chatId=await req(r,'newChat') as string;
  spy.mockResolvedValueOnce(reply());
  const msg=await req(r,'chatWorkflow',{chatId,templateId:'t1',params:{'chu-de':'Phân số'},output:'1 tệp'}) as Message;
  const expected=process.env.PVTA_RESULT_DIR!;
  expect(msg.workflow?.status).toBe('success');
  expect(msg.text).toContain(expected);
  expect(r.store.data.workflows?.find(w=>w.id===msg.workflow!.id)?.folder).toBe(expected);
 });

 it('ignores an OS temp folder remembered as the chat output folder',async()=>{
  const {r}=setup();
  const chatId=await req(r,'newChat') as string;
  r.store.data.chats.find(c=>c.id===chatId)!.outputDir='/var/folders/xx/T/TemporaryItems/NSIRD_screencaptureui_abc';
  expect((r as never as {projectOutput(c:unknown):string}).projectOutput(r.store.data.chats.find(c=>c.id===chatId))).toBe(process.env.PVTA_RESULT_DIR!);
 });
});

describe('chỉnh quy trình cho lần chạy trong chat (mẫu không đổi)',()=>{
 it('đổi quyền khâu và thêm ghi chú chỉ trên bản chạy; mẫu giữ nguyên',async()=>{
  const {r,spy}=setup();
  const chatId=await req(r,'newChat') as string;
  spy.mockResolvedValueOnce(reply());
  const msg=await req(r,'chatWorkflow',{chatId,templateId:'t1',params:{'chu-de':'Phân số'},output:'1 tệp',edits:{access:{s1:'full'},note:'Dùng ví dụ thực tế'}}) as Message;
  const run=r.store.data.workflows!.find(w=>w.id===msg.workflow!.id)!;
  expect(run.steps[0]!.access).toBe('full');
  expect(run.steps[0]!.prompt).toContain('Dùng ví dụ thực tế');
  const tpl=r.store.data.workflowTemplates!.find(t=>t.id==='t1')!;
  expect(tpl.steps[0]!.access).toBe('read');
  expect(tpl.steps[0]!.prompt).not.toContain('Dùng ví dụ thực tế');
 });

 it('khâu không tồn tại thì báo lỗi và không để lại bản sao rác',async()=>{
  const {r,spy}=setup();
  const chatId=await req(r,'newChat') as string;
  const before=(r.store.data.workflows??[]).length;
  await expect(req(r,'chatWorkflow',{chatId,templateId:'t1',params:{'chu-de':'x'},output:'1',edits:{access:{khong_co:'full'}}})).rejects.toThrow('không còn trong quy trình mẫu');
  expect((r.store.data.workflows??[]).length).toBe(before);
  expect(spy).not.toHaveBeenCalled();
 });
});
