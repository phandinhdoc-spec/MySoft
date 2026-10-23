import {beforeEach,describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {resultDir} from '../src/desktop/office-capabilities';

// Mỗi test có thư mục tạm dùng chung riêng (PVTA_RESULT_DIR), không ghi vào /tmp thật.
beforeEach(()=>{process.env.PVTA_RESULT_DIR=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-result-test-')),'PVTA-Ket-qua');});

const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});

describe('kết quả quy trình',()=>{
 it('đặt đầu ra mặc định ở thư mục tạm dùng chung, không ở Documents',()=>{
  expect(resultDir('/home/x/Documents')).toBe(process.env.PVTA_RESULT_DIR);
  expect(resultDir('/home/x/Documents')).not.toContain('Documents');
 });

 it('gắn tệp mới trong thư mục quy trình thành thẻ kết quả (Xem, Sửa, Lưu)',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-result-cards-'));roots.push(dir);
  const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
  const folder=path.join(dir,'out');fs.mkdirSync(folder);
  const since=Date.now()-1000;
  fs.writeFileSync(path.join(folder,'de.docx'),'x');
  fs.writeFileSync(path.join(folder,'.an.docx'),'x');
  const actions=await (r as never as {workflowResultActions(f:string,s:number,p:undefined,l:string):Promise<Array<{path:string;state:string;output?:string}>>}).workflowResultActions(folder,since,undefined,'Đề');
  expect(actions.map(a=>a.path)).toEqual([path.join(folder,'de.docx')]);
  expect(actions[0]!.state).toBe('done');
  expect(actions[0]!.output).toBe(path.join(folder,'de.docx'));
 });
});
