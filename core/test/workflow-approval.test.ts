import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowPrompts} from '../src/desktop/workflow-prompts';
import {normalizeWorkflow,WorkflowRunner} from '../src/desktop/workflows';
import {resourceDigest} from '../src/desktop/workflow-fingerprint';

const answer=JSON.stringify({muc_tieu:'Soạn theo yêu cầu gốc',dau_ra:'Kết quả đáp ứng yêu cầu',rang_buoc:'Không bịa dữ liệu',tieu_chi_hoan_thanh:'Đáp ứng yêu cầu gốc'});
const roots:string[]=[];
afterEach(()=>{roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));vi.useRealTimers();vi.restoreAllMocks();});
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-approval-'));roots.push(dir);return dir;}
/** Ghi nội dung cùng kích thước và khôi phục mtime cũ: chỉ băm nội dung mới phát hiện được. */
function rewriteSameSize(file:string,text:string,mtime:Date){fs.writeFileSync(file,text);fs.utimesSync(file,mtime,mtime);}

describe('approval snapshot',()=>{
 it('rejects a draft when a resource changes but its size and mtime stay the same',async()=>{
  const dir=temp(),file=path.join(dir,'nguon.txt'),mtime=new Date('2026-01-01T00:00:00Z');
  fs.writeFileSync(file,'AAAA');fs.utimesSync(file,mtime,mtime);
  const w=normalizeWorkflow({name:'Bài',steps:[{id:'a',name:'Soạn',prompt:'Dùng nguồn',files:[file]}]});
  const s=new WorkflowPrompts(),d=await s.prepare(w,{},'run',async()=>answer);
  rewriteSameSize(file,'BBBB',mtime);
  expect(()=>s.consume(d!.token,w,{},'run')).toThrow('hết hiệu lực');
 });
 it('rejects a draft after 30 minutes and keeps it valid before that',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  const w=normalizeWorkflow({name:'Bài',steps:[{id:'a',name:'Soạn',prompt:'Soạn bài'}]});
  const s=new WorkflowPrompts(),d=await s.prepare(w,{},'run',async()=>answer);
  vi.setSystemTime(Date.now()+29*60_000);
  const ok=s.consume(d!.token,w,{},'run');expect(ok.approved.prompts.a).toBeTruthy();
  const late=await s.prepare(w,{},'run',async()=>answer);
  vi.setSystemTime(Date.now()+30*60_000+1);
  expect(()=>s.consume(late!.token,w,{},'run')).toThrow('hết hiệu lực');
 });
 it('rewrites a node again when another node output it depends on changes',async()=>{
  const w=normalizeWorkflow({name:'Bài',steps:[{id:'a',name:'Soạn',prompt:'Soạn {{input}}'},{id:'b',name:'Rà',prompt:'Rà {{prev}}'}]});
  const s=new WorkflowPrompts(),model=vi.fn(async()=>answer);
  const d=await s.prepare(w,{},'run',model),{approved}=s.consume(d!.token,w,{},'run');
  w.steps[1]!.outputs=['Bảng điểm mới'];model.mockClear();
  await s.prepare(w,{},'retry',model,approved);
  expect(model).toHaveBeenCalledTimes(2);
 });
});

describe('step fingerprint',()=>{
 const t0=new Date('2026-01-01T00:00:00Z');
 it('changes when resource content changes even with unchanged size and mtime',()=>{
  const dir=temp(),file=path.join(dir,'a.txt');fs.writeFileSync(file,'AAAA');fs.utimesSync(file,t0,t0);
  const step={prompt:'Đọc',files:[file]},wf={};
  const before=resourceDigest(step,wf),again=resourceDigest(step,wf);
  expect(again).toBe(before);
  rewriteSameSize(file,'BBBB',t0);
  expect(resourceDigest(step,wf)).not.toBe(before);
 });
 it('changes when a called skill body or a rule changes',()=>{
  const step={prompt:'Viết /ky-nang #quy-tac'},wf={};
  const base=resourceDigest(step,wf,{skill:()=>'Nội dung A',rules:()=>'Quy tắc A'});
  expect(resourceDigest(step,wf,{skill:()=>'Nội dung B',rules:()=>'Quy tắc A'})).not.toBe(base);
  expect(resourceDigest(step,wf,{skill:()=>'Nội dung A',rules:()=>'Quy tắc B'})).not.toBe(base);
  expect(resourceDigest(step,wf,{skill:()=>'Nội dung A',rules:()=>'Quy tắc A'})).toBe(base);
 });
 it('changes when a workflow attachment or folder input changes content',()=>{
  const dir=temp(),att=path.join(dir,'ghi-chu.md');fs.writeFileSync(att,'x1');fs.utimesSync(att,t0,t0);
  const step={prompt:'Đọc'};
  const base=resourceDigest(step,{attachments:[att]});
  rewriteSameSize(att,'x2',t0);
  expect(resourceDigest(step,{attachments:[att]})).not.toBe(base);
  fs.writeFileSync(path.join(dir,'b.txt'),'1');const folderBase=resourceDigest(step,{input:{kind:'folder',value:dir}});
  fs.writeFileSync(path.join(dir,'b.txt'),'2');fs.utimesSync(path.join(dir,'b.txt'),t0,t0);
  expect(resourceDigest(step,{input:{kind:'folder',value:dir}})).not.toBe(folderBase);
 });
 it('reruns only the node whose file content changed on retry, and reuses it when nothing changed',async()=>{
  const dir=temp(),file=path.join(dir,'nguon.txt');fs.writeFileSync(file,'AAAA');fs.utimesSync(file,t0,t0);
  const w=normalizeWorkflow({name:'Bài',steps:[{id:'a',name:'Đọc',prompt:'Đọc tệp',files:[file]},{id:'b',name:'Rà',prompt:'Rà {{prev}}'}]});
  let failB=true;const calls:string[]=[];
  const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async text=>{calls.push(text);if(text.includes('Rà')&&failB)throw Error('fail');return 'OUT';}});
  // 1) Lượt đầu: nút a thành công, nút b lỗi.
  expect((await runner.run(w.id)).status).toBe('error');
  // 2) Chạy lại, nội dung không đổi: nút a được tái dùng, chỉ nút b chạy.
  failB=false;calls.length=0;
  expect((await runner.run(w.id,true)).status).toBe('success');
  expect(calls).toHaveLength(1);expect(calls[0]).toContain('Rà');
  // 3) Lượt mới lỗi lại ở nút b; sau đó đổi nội dung tệp của nút a, giữ nguyên kích thước và mtime.
  failB=true;expect((await runner.run(w.id)).status).toBe('error');
  rewriteSameSize(file,'BBBB',t0);failB=false;calls.length=0;
  // 4) Chạy lại phải chạy lại cả nút a (nội dung mới) và nút b, không dùng kết quả cũ.
  expect((await runner.run(w.id,true)).status).toBe('success');
  expect(calls.some(t=>t.includes('BBBB'))).toBe(true);
  expect(calls).toHaveLength(2);
 });
});
