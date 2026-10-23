import {describe,expect,it} from 'vitest';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows.js';

/** Mô hình giả: mỗi lời gọi chờ đến khi kiểm thử gọi finish(prompt) hoặc bị hủy qua signal. */
function controllable(){
 const finishers=new Map<string,(v:string)=>void>();
 const model=async(text:string,_s:unknown,signal:AbortSignal)=>new Promise<string>((ok,no)=>{
  finishers.set(text,ok);
  signal.addEventListener('abort',()=>no(signal.reason),{once:true});
 });
 const waitFor=async(text:string)=>{for(let i=0;i<200&&!finishers.has(text);i++)await new Promise(r=>setTimeout(r,5));expect(finishers.has(text)).toBe(true);};
 return {model,finishers,waitFor};
}

describe('nhiều quy trình chạy độc lập theo ID',()=>{
 it('dừng A không dừng B; C không chạy vẫn chạy được khi A và B đang chạy; chạy trùng A bị chặn',async()=>{
  const a=normalizeWorkflow({name:'A',steps:[{prompt:'A1'}]});
  const b=normalizeWorkflow({name:'B',steps:[{prompt:'B1'}]});
  const c=normalizeWorkflow({name:'C',steps:[{prompt:'C1'}]});
  const ctl=controllable();
  const runner=new WorkflowRunner({list:()=>[a,b,c],changed:()=>{},model:ctl.model});

  const ta=runner.run(a.id);const tb=runner.run(b.id);
  await ctl.waitFor('A1');await ctl.waitFor('B1');
  expect(runner.isRunning(a.id)).toBe(true);
  expect(runner.isRunning(b.id)).toBe(true);
  expect(runner.isRunning(c.id)).toBe(false);
  // Chạy trùng cùng ID vẫn bị chặn ngay cả khi quy trình khác đang chạy.
  await expect(runner.run(a.id)).rejects.toThrow('đang chạy');

  // Dừng A chỉ tác động A.
  expect(runner.cancel(a.id)).toBe(true);
  expect((await ta).status).toBe('cancelled');
  expect(runner.isRunning(a.id)).toBe(false);
  expect(runner.isRunning(b.id)).toBe(true);

  // C độc lập với A và B đang chạy: chạy và hoàn tất bình thường.
  const tc=runner.run(c.id);await ctl.waitFor('C1');
  expect(runner.isRunning(c.id)).toBe(true);
  ctl.finishers.get('C1')!('xong C');
  expect((await tc).status).toBe('success');

  // B vẫn đang chạy sau khi A dừng và C xong; hủy đúng B mới dừng B.
  expect(runner.isRunning(b.id)).toBe(true);
  ctl.finishers.get('B1')!('xong B');
  expect((await tb).status).toBe('success');
  expect(runner.isRunning(b.id)).toBe(false);
 });

 it('hủy quy trình chưa chạy không ảnh hưởng quy trình đang chạy',async()=>{
  const a=normalizeWorkflow({name:'A',steps:[{prompt:'A1'}]});
  const c=normalizeWorkflow({name:'C',steps:[{prompt:'C1'}]});
  const ctl=controllable();
  const runner=new WorkflowRunner({list:()=>[a,c],changed:()=>{},model:ctl.model});
  const ta=runner.run(a.id);await ctl.waitFor('A1');
  expect(runner.cancel(c.id)).toBe(true);
  expect(runner.isRunning(a.id)).toBe(true);
  ctl.finishers.get('A1')!('xong');
  expect((await ta).status).toBe('success');
 });
});
