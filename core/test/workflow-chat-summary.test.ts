import {describe,expect,it} from 'vitest';
import {workflowChatSummary} from '../src/desktop/workflows.js';
import type {Workflow,WorkflowRun} from '../src/desktop/types.js';

const wf={id:'w',name:'Ôn tập sinh học',steps:[{id:'a',name:'Soạn câu hỏi'},{id:'b',name:'Chấm'},{id:'c',name:'Tổng hợp'}],runs:[],updatedAt:0} as unknown as Workflow;

describe('workflowChatSummary',()=>{
 it('reports a finished run with per-step status and the last successful output',()=>{
  const run:WorkflowRun={id:'r',startedAt:0,status:'success',steps:[
   {stepId:'a',name:'Soạn câu hỏi',status:'success',output:'Câu 1: ...'},
   {stepId:'b',name:'Chấm',status:'success',output:'Đáp án đã chấm'},
   {stepId:'c',name:'Tổng hợp',status:'success',output:'Bảng tổng hợp cuối'},
  ]};
  const text=workflowChatSummary(wf,run);
  expect(text).toContain('“Ôn tập sinh học” đã chạy xong: 3/3 khâu thành công.');
  expect(text).toContain('1. Soạn câu hỏi — xong');
  expect(text).toContain('**Kết quả (Tổng hợp):**');
  expect(text).toContain('Bảng tổng hợp cuối');
  expect(text).not.toContain('Có thể chạy tiếp');
 });

 it('explains where a failed run stopped and offers a retry hint',()=>{
  const run:WorkflowRun={id:'r',startedAt:0,status:'error',steps:[
   {stepId:'a',name:'Soạn câu hỏi',status:'success',output:'Câu 1: ...'},
   {stepId:'b',name:'Chấm',status:'error',error:'Mô hình không phản hồi'},
   {stepId:'c',name:'Tổng hợp',status:'skipped'},
  ]};
  const text=workflowChatSummary(wf,run);
  expect(text).toContain('dừng ở khâu lỗi: 1/3 khâu thành công.');
  expect(text).toContain('2. Chấm — lỗi: Mô hình không phản hồi');
  expect(text).toContain('3. Tổng hợp — bỏ qua');
  expect(text).toContain('**Kết quả (Soạn câu hỏi):**');
  expect(text).toContain('Có thể chạy tiếp từ khâu lỗi');
 });

 it('truncates long output and lists confirmed output files only',()=>{
  const long='x'.repeat(5000);
  const run:WorkflowRun={id:'r',startedAt:0,status:'success',steps:[{stepId:'a',name:'Soạn câu hỏi',status:'success',output:long,outputFiles:['/tmp/de.docx']}]};
  const text=workflowChatSummary(wf,run);
  expect(text).toContain('…(đã rút gọn; xem đầy đủ trong Quy trình)');
  expect(text.length).toBeLessThan(3600);
  expect(text).toContain('**Tệp đầu ra:** `/tmp/de.docx`');
 });

 it('reports a run that could not start with the error text',()=>{
  expect(workflowChatSummary(wf,undefined,'Thiếu đầu vào')).toBe('Không chạy được quy trình “Ôn tập sinh học”: Thiếu đầu vào.');
 });
});
