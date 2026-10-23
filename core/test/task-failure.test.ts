import {describe,it,expect} from 'vitest';
import {AiTaskError,taskFailure,failedTasks} from '../src/desktop/task-failure';
import type {Chat,PlanStep} from '../src/desktop/types';
const failure={source:'ai' as const,reason:'Hết quota'};
const step:PlanStep={id:'s',goal:'Soạn bài',task:'',files:[],risk:'',status:'error',failure};
function chat():Chat{return {id:'c',title:'Bài học',summary:'',updatedAt:0,messages:[{id:'m',role:'assistant',text:'',at:1,plan:{id:'p',chatId:'c',title:'Plan',approved:true,steps:[{...step}]}}]};}
describe('Thông báo lỗi tác vụ AI',()=>{
 it('giữ riêng đích của nhiều hội thoại và chỉ bỏ công việc đã xử lý',()=>{
  const first=chat(),second=chat();second.id='c2';second.projectId='project2';
  second.messages=[{id:'network',role:'assistant',text:'Mất mạng',at:10,error:true,failure:{source:'ai',reason:'Mất mạng'}}];
  expect(failedTasks([first,second])).toMatchObject([
   {chatId:'c2',projectId:'project2',targetId:'message-network'},
   {chatId:'c',targetId:'plan-p-s'},
  ]);
  first.messages[0]!.plan!.steps[0]!.status='done';
  expect(failedTasks([first,second]).map(t=>t.chatId)).toEqual(['c2']);
  second.messages=[];expect(failedTasks([first,second])).toEqual([]);
 });
 it('chỉ nhận lỗi AI, không nhận lỗi tệp hoặc chủ động dừng',()=>{const ctl=new AbortController();expect(taskFailure(Error('file'),ctl.signal,'file')).toBeUndefined();expect(taskFailure(new AiTaskError('quota'),ctl.signal,'quota')?.source).toBe('ai');ctl.abort();expect(taskFailure(new AiTaskError('quota'),ctl.signal,'quota')).toBeUndefined();});
 it('liên kết đúng bước và hội thoại',()=>expect(failedTasks([chat()])[0]).toMatchObject({chatId:'c',targetId:'plan-p-s',title:'Soạn bài',reason:'Hết quota'}));
 it.each(['waiting','running','done','skipped','blocked','interrupted'] as const)('không báo trạng thái %s',status=>{const c=chat();c.messages[0]!.plan!.steps[0]!.status=status;expect(failedTasks([c])).toEqual([]);});
 it('không suy đoán lỗi từ trạng thái cũ',()=>{const c=chat();delete c.messages[0]!.plan!.steps[0]!.failure;expect(failedTasks([c])).toEqual([]);});
 it('ẩn đích đã mất hoặc liên kết sai',()=>{const c=chat();c.messages[0]!.plan!.chatId='deleted';expect(failedTasks([c])).toEqual([]);expect(failedTasks([])).toEqual([]);});
 it('chat lỗi trỏ tới tin nhắn; lượt mới thay thế lỗi cũ',()=>{const c=chat();c.messages=[{id:'err',role:'assistant',text:'quota',at:2,error:true,failure}];expect(failedTasks([c])[0]?.targetId).toBe('message-err');c.messages.push({id:'new',role:'user',text:'Thử lại',at:3});expect(failedTasks([c])).toEqual([]);});
});
