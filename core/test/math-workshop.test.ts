import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
vi.mock('../src/desktop/documents',()=>({pythonJob:vi.fn(async()=>({}))}));
import {pythonJob} from '../src/desktop/documents';
import {mathWorkshopRpc} from '../src/desktop/math-workshop';
import {defaultWorksheet} from '../../shared/src/math-workshop';
it('lưu, đọc, cập nhật và bảo vệ tệp xuất có sẵn',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-math-'));
 try{
  const w=await mathWorkshopRpc(dir,'math.save',{worksheet:defaultWorksheet()}) as ReturnType<typeof defaultWorksheet>;
  expect(await mathWorkshopRpc(dir,'math.list',{})).toEqual([w]);
  const next=await mathWorkshopRpc(dir,'math.save',{worksheet:{...w,title:'Bản mới'}}) as typeof w;
  expect(next.revision).toBeGreaterThan(w.revision);
  const file=path.join(dir,'test.xlsx');await fs.writeFile(file,'keep');
  await expect(mathWorkshopRpc(dir,'math.export',{worksheet:w,path:file,audience:'student'})).rejects.toThrow();
  expect(await fs.readFile(file,'utf8')).toBe('keep');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
it('bản học sinh không truyền đáp án sang bộ xuất và không nhận SVG thực thi',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-math-'));const w={...defaultWorksheet(),kind:'variants' as const,answer:'SECRET'};
 try{
  await mathWorkshopRpc(dir,'math.export',{worksheet:w,path:path.join(dir,'student.docx'),audience:'student'});
  const payload=vi.mocked(pythonJob).mock.calls.at(-1)![0] as any;
  expect(payload.document.answer).toBe('');expect(payload.document.variants[0].answer).toBeUndefined();
  await expect(mathWorkshopRpc(dir,'math.export',{worksheet:defaultWorksheet(),path:path.join(dir,'bad.svg'),audience:'teacher',svg:'<svg><script>alert(1)</script></svg>'})).rejects.toThrow();
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
