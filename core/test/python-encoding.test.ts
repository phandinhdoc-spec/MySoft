import {describe,expect,it,vi} from 'vitest';

const mock=vi.hoisted(()=>({options:{} as {env?:NodeJS.ProcessEnv}}));
vi.mock('node:child_process',()=>({
 execFile:(_bin:string,_args:string[],options:{env?:NodeJS.ProcessEnv},callback:(error:Error|null,out:string)=>void)=>{
  mock.options=options;queueMicrotask(()=>callback(null,'{"ok":true}'));return {stdin:{on(){},end(){}}};
 },
}));
vi.mock('../src/desktop/python.js',()=>({ensurePython:async()=>'python3',supportForJob:()=>false}));

import {pythonEnvironment,utf8Env} from '../src/desktop/bundled-runtime';
import {pythonJob} from '../src/desktop/documents';

describe('Python trên Windows',()=>{
 it('luôn ép UTF-8 để chữ Việt trong JSON không lỗi charmap',()=>{
  const env=pythonEnvironment();
  expect(env.PYTHONUTF8).toBe('1');
  expect(env.PYTHONIOENCODING).toBe('utf-8');
 });

 it('không sửa biến môi trường của tiến trình chính',()=>{
  const before=process.env.PYTHONIOENCODING;
  const env=utf8Env();
  expect(env.PYTHONIOENCODING).toBe('utf-8');
  expect(process.env.PYTHONIOENCODING).toBe(before);
 });

 it('truyền UTF-8 cho mọi tác vụ tài liệu, kể cả khi đính kèm tệp Word',async()=>{
  await expect(pythonJob({op:'extract',path:'Đề kiểm tra.docx'})).resolves.toEqual({ok:true});
  expect(mock.options.env?.PYTHONIOENCODING).toBe('utf-8');
  expect(mock.options.env?.PYTHONUTF8).toBe('1');
 });
});
