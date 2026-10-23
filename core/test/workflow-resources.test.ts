import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cleanStepFiles,collectStepResources,invokedSkills} from '../src/desktop/workflow-resources.js';
import {extract} from '../src/desktop/documents.js';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows.js';
import type {Workflow} from '../src/desktop/types.js';

const deps={skill:(n:string)=>n==='soan-de'?'THÂN SKILL SOẠN ĐỀ':undefined,rules:(p:string)=>p.includes('#giong-van')?'QUY TẮC ĐƯỢC GỌI TRONG NÚT:\n- [#giong-van] Giọng văn: ngắn gọn':'',extract};

describe('tài nguyên riêng của nút quy trình',()=>{
 it('làm sạch danh sách tệp: chỉ đường dẫn tuyệt đối, không trùng',()=>{
  expect(cleanStepFiles(['/a.md','/a.md','tuong-doi.md',3,'C:\\x\\b.docx'])).toEqual(['/a.md','C:\\x\\b.docx']);
  expect(cleanStepFiles([])).toBeUndefined();
  expect(cleanStepFiles('x')).toBeUndefined();
  expect(normalizeWorkflow({name:'T',steps:[{name:'a',prompt:'p',files:['/x.md','x.md']}]}).steps[0]!.files).toEqual(['/x.md']);
  expect(normalizeWorkflow({name:'T',steps:[{name:'a',prompt:'p'}]}).steps[0]!.files).toBeUndefined();
 });
 it('nhận /skill trong prompt, bỏ qua đường dẫn và skill không có',async()=>{
  expect(invokedSkills('Dùng /soan-de và /khong-co, đọc /Users/x')).toEqual(['soan-de','khong-co']);
  const r=await collectStepResources({prompt:'Làm theo /soan-de /khong-co #giong-van'},deps);
  expect(r.text).toContain('[Skill soan-de]\nTHÂN SKILL SOẠN ĐỀ');
  expect(r.text).not.toContain('khong-co');
  expect(r.text).toContain('[#giong-van]');
  expect(r.images).toEqual([]);
 });
 it('đọc tệp, thư mục và tách ảnh để gửi kèm',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-step-'));
  try{
   const file=path.join(dir,'de.md');fs.writeFileSync(file,'Câu 1: lực ma sát');
   const sub=path.join(dir,'kho');fs.mkdirSync(sub);fs.writeFileSync(path.join(sub,'b.txt'),'Ngữ liệu B');fs.writeFileSync(path.join(sub,'hinh.png'),'x');fs.writeFileSync(path.join(sub,'.an.txt'),'ẩn');fs.writeFileSync(path.join(sub,'bo-qua.exe'),'x');
   const r=await collectStepResources({prompt:'p',files:[file,sub,path.join(dir,'mat.md')]},deps);
   expect(r.text).toContain('Câu 1: lực ma sát');
   expect(r.text).toContain('Ngữ liệu B');
   expect(r.text).not.toContain('ẩn');
   expect(r.text).toContain('[Không đọc được] '+path.join(dir,'mat.md'));
   expect(r.images).toEqual([path.join(sub,'hinh.png')]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('bộ chạy gửi nội dung tệp, ảnh, skill của nút cho model và báo lỗi khi tệp mất',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-step-run-'));
  try{
   const file=path.join(dir,'nguon.md');fs.writeFileSync(file,'Nội dung nguồn riêng');
   const img=path.join(dir,'anh.jpg');fs.writeFileSync(img,'x');
   const list:Workflow[]=[];const calls:{text:string;images?:string[]}[]=[];
   const runner=new WorkflowRunner({list:()=>list,changed:()=>{},resources:()=>({skill:deps.skill,rules:deps.rules}),model:async(text,_s,_sig,_c,_r,images)=>{calls.push({text,images});return 'ok';}});
   const wf=normalizeWorkflow({name:'T',steps:[{name:'a',prompt:'Dùng /soan-de',files:[file,img]},{name:'b',prompt:'không tài nguyên'}]});list.push(wf);
   expect((await runner.run(wf.id)).status).toBe('success');
   expect(calls[0]!.text).toContain('Nội dung nguồn riêng');
   expect(calls[0]!.text).toContain('THÂN SKILL SOẠN ĐỀ');
   expect(calls[0]!.images).toEqual([img]);
   expect(calls[1]!.text).not.toContain('Nội dung nguồn riêng');
   expect(calls[1]!.images).toBeUndefined();
   fs.rmSync(file);
   await expect(runner.run(wf.id)).rejects.toThrow(/Nút “a”: tệp hoặc thư mục đính kèm không còn truy cập được/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
});
