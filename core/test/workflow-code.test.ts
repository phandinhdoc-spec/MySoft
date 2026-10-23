import {describe,expect,it} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows.js';
import {extractCodeBlocks,scanCode,parseReview,copyAttachments,hasHigh} from '../src/desktop/workflow-code.js';
import type {Workflow} from '../src/desktop/types.js';

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pvta-code-'));
const GOOD='Đây là mã:\n```python\na = 2\ndef tinhTong(x, y):\n    return x + y\nprint(tinhTong(a, 3))\nopen("ket-qua.txt","w").write("5")\n```';

function setup(opts:{code?:string;review?:string;access?:'read'|'full'}={}){
 const out=tmp(),att=tmp();fs.writeFileSync(path.join(att,'de.txt'),'dữ liệu');fs.mkdirSync(path.join(att,'con'));fs.writeFileSync(path.join(att,'con','x.csv'),'1,2');
 const list:Workflow[]=[];const calls:string[]=[];
 const runner=new WorkflowRunner({list:()=>list,changed:()=>{},model:async(text)=>{
  calls.push(text);
  if(text.startsWith('Bạn là AI PHẢN BIỆN'))return opts.review??'[]';
  return opts.code??GOOD;
 }});
 const wf=normalizeWorkflow({name:'Tính',outputDir:out,attachments:[att],mode:'parallel',steps:[{id:'s1',name:'Cộng',prompt:'Cộng hai số',access:opts.access??'full',dependsOn:[]},{id:'s2',name:'Ngoài khung',prompt:'Tóm tắt',dependsOn:['s1']}],frames:[{id:'f',name:'Khung',stepIds:['s1'],decl:'{{a = 2}} !{{tinhTong: cộng hai số}}'}]});
 list.push(wf);return {runner,wf,calls,out,att};
}
const waitForCode=async(wf:Workflow)=>{for(let i=0;i<200;i++){const sr=wf.runs[0]?.steps[0];if(sr?.code?.decision==='waiting')return sr;await new Promise(r=>setTimeout(r,10));}throw Error('không thấy mã chờ duyệt');};

describe('mã trong khung',()=>{
 it('sinh mã, phản biện, chờ duyệt rồi chạy trong thư mục con có bản sao đính kèm',async()=>{
  const {runner,wf,calls,out}=setup();
  const p=runner.run(wf.id);
  const sr=await waitForCode(wf);
  expect(calls[0]).toContain('BẮT BUỘC SINH MÃ');expect(calls[0]).toContain('- a = 2');expect(calls[0]).toContain('tinhTong: cộng hai số');
  expect(sr.code!.lang).toBe('python');expect(sr.code!.canRun).toBe(true);
  expect(calls[1]).toContain('PHẢN BIỆN');
  expect(fs.readdirSync(path.join(wf.runs[0]!.workdir!)).includes('de.txt')).toBe(false); // đính kèm nằm trong thư mục có tên gốc
  expect(runner.decideCode(wf.runs[0]!.id,'s1',{approved:true})).toBe(true);
  const run=await p;
  expect(run.status).toBe('success');
  const dir=run.workdir!;expect(path.dirname(dir)).toBe(out);
  expect(fs.readdirSync(dir)).toEqual(expect.arrayContaining(['ket-qua.txt']));
  expect(fs.readFileSync(path.join(dir,'ket-qua.txt'),'utf8')).toBe('5');
  const copied=fs.readdirSync(dir).find(n=>fs.existsSync(path.join(dir,n,'de.txt')))!;expect(fs.existsSync(path.join(dir,copied,'con','x.csv'))).toBe(true);
  expect(run.copied).toBe(2);
  expect(run.steps[0]!.code!.decision).toBe('approved');expect(run.steps[0]!.code!.exitCode).toBe(0);
  expect(calls.at(-1)).not.toContain('BẮT BUỘC SINH MÃ'); // nút ngoài khung không bị ép sinh mã
  expect(run.steps[1]!.status).toBe('success');
 });
 it('từ chối mã thì không chạy và các bước sau bị bỏ qua',async()=>{
  const {runner,wf}=setup();
  const p=runner.run(wf.id);await waitForCode(wf);
  runner.decideCode(wf.runs[0]!.id,'s1',{approved:false});
  const run=await p;
  expect(run.status).toBe('error');expect(run.steps[0]!.error).toContain('không duyệt');expect(run.steps[1]!.status).toBe('skipped');
  expect(fs.existsSync(path.join(run.workdir!,'ket-qua.txt'))).toBe(false);
 });
 it('mã cảnh báo mức cao bị chặn trừ khi giáo viên chủ động chọn vẫn chạy',async()=>{
  const bad='```bash\nrm -rf ./tam\necho xong\n```';
  const a=setup({code:bad,review:'[{"level":"high","text":"Xóa thư mục"}]'});
  let p=a.runner.run(a.wf.id);let sr=await waitForCode(a.wf);
  expect(hasHigh(sr.code!.findings)).toBe(true);
  a.runner.decideCode(a.wf.runs[0]!.id,'s1',{approved:true});
  let run=await p;expect(run.status).toBe('error');expect(run.steps[0]!.error).toContain('cảnh báo mức cao');
  const b=setup({code:bad,review:'[]'});
  p=b.runner.run(b.wf.id);sr=await waitForCode(b.wf);
  b.runner.decideCode(b.wf.runs[0]!.id,'s1',{approved:true,force:true});
  run=await p;expect(run.status).toBe('success');expect(run.steps[0]!.code!.decision).toBe('forced');
 });
 it('nút Chỉ đọc chỉ sinh mã và phản biện, không chạy',async()=>{
  const {runner,wf}=setup({access:'read'});
  const p=runner.run(wf.id);await waitForCode(wf);runner.decideCode(wf.runs[0]!.id,'s1',{approved:true});
  const run=await p;expect(run.status).toBe('success');expect(run.steps[0]!.code!.decision).toBe('not-run');
  expect(fs.existsSync(path.join(run.workdir!,'ket-qua.txt'))).toBe(false);
 });
 it('bắt buộc có thư mục đầu ra và dừng được khi đang chờ duyệt',async()=>{
  const {runner,wf}=setup();delete wf.outputDir;
  await expect(runner.run(wf.id)).rejects.toThrow('thư mục đầu ra');
  wf.outputDir=tmp();
  const p=runner.run(wf.id);await waitForCode(wf);runner.cancel(wf.id);
  expect((await p).status).toBe('cancelled');
 });
 it('lỗi khi AI không trả mã hoặc đổi ngôn ngữ của khung',async()=>{
  const {runner,wf}=setup({code:'Không có mã'});
  const run=await runner.run(wf.id);expect(run.steps[0]!.error).toContain('khối mã');
 });
});
describe('hàm thuần',()=>{
 it('tách khối mã, quét rủi ro và đọc phản biện',()=>{
  expect(extractCodeBlocks('x\n```py\nprint(1)\n```\ny\n```js\nlet a\n```').map(b=>b.lang)).toEqual(['python','javascript']);
  const f=scanCode('import os\nos.remove("/etc/hosts")\nrequests.get("https://a.b")');
  expect(f.map(x=>x.level)).toEqual(expect.arrayContaining(['high','medium']));
  expect(scanCode('print("xin chào")')).toEqual([]);
  expect(parseReview('Kết quả: [{"level":"high","text":"Xóa tệp"},{"level":"zzz","text":"Lạ"}]').map(x=>x.level)).toEqual(['high','medium']);
  expect(parseReview('không phải json')[0]!.level).toBe('medium');
 });
 it('chép đính kèm không đè nhau và hủy được',async()=>{
  const a=tmp(),b=tmp(),dest=tmp();fs.writeFileSync(path.join(a,'t.txt'),'1');fs.writeFileSync(path.join(b,'t.txt'),'2');
  expect(await copyAttachments([path.join(a,'t.txt'),path.join(b,'t.txt')],dest,new AbortController().signal)).toBe(2);
  expect(fs.readdirSync(dest).sort()).toEqual(['t.txt','t.txt-2']);
  const ctl=new AbortController();ctl.abort(new Error('hủy'));
  await expect(copyAttachments([a],tmp(),ctl.signal)).rejects.toThrow('hủy');
 });
});
