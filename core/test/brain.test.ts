import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {brainContext,brainRead,runBrain,brainProjectRoot,brainScope,brainAvailable,isBrainTool} from '../src/desktop/brain.js';

afterEach(()=>vi.restoreAllMocks());
describe('Brain host',()=>{
 it('does not run without an authorized working directory',async()=>{
  const exists=vi.spyOn(fs,'existsSync');expect(await brainContext(undefined)).toBe('');expect(exists).not.toHaveBeenCalled();
 });
 it('reports a missing binary instead of promising an index',async()=>{
  vi.spyOn(fs,'existsSync').mockReturnValue(false);
  expect(await brainContext('/tmp')).toContain('chưa được cài');
  await expect(brainRead('/tmp','brain_read',{file:'x.c',start:1,end:1})).rejects.toThrow('chưa được cài');
 });
 it('does not report an outdated CLI (help text only) as an available index',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'brain-old-'));const prev=process.env.PVTA_BRAIN;
  const fake=path.join(root,'old-brain.sh');fs.writeFileSync(fake,'#!/bin/sh\necho "Brain: index | find <literal>"\n',{mode:0o755});
  process.env.PVTA_BRAIN=fake;
  try{const ctx=await brainContext(root);expect(brainAvailable(ctx)).toBe(false);expect(ctx).toContain('đã cũ');}
  finally{if(prev===undefined)delete process.env.PVTA_BRAIN;else process.env.PVTA_BRAIN=prev;fs.rmSync(root,{recursive:true,force:true});}
 });
 it('exposes both tiers as tools',()=>{
  for(const t of ['brain_overview','brain_outline','brain_find','brain_refs','brain_read'])expect(isBrainTool(t)).toBe(true);
  expect(isBrainTool('office_web_search')).toBe(false);
 });
});

it('scope comes only from PVTA: inherited env is dropped, file scope is passed explicitly',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'brain-test-'));
 const script=`console.log(JSON.stringify({only:process.env.PVTA_BRAIN_ONLY??null,index:process.env.PVTA_BRAIN_INDEX??null}))`;
 process.env.PVTA_BRAIN_ONLY='../../etc/passwd';process.env.PVTA_BRAIN_INDEX='/tmp/x';
 try {
  expect(JSON.parse(await runBrain(process.execPath,root,['-e',script]))).toEqual({only:null,index:null});
  expect(JSON.parse(await runBrain(process.execPath,{root,files:['a.md','b/c.ts']},['-e',script]))).toEqual({only:'a.md\nb/c.ts',index:null});
  expect(fs.readdirSync(root)).toEqual([]);
 }finally{delete process.env.PVTA_BRAIN_ONLY;delete process.env.PVTA_BRAIN_INDEX;fs.rmSync(root,{recursive:true,force:true});}
});

it('selects a project for read tools without granting access to learning folders',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'brain-root-'));
 try {
  const learning=path.join(root,'learning');fs.mkdirSync(learning);
  expect(brainProjectRoot([root],[])).toBe(fs.realpathSync(root));
  expect(brainProjectRoot([root],[learning])).toBeUndefined();
  expect(brainProjectRoot([learning],[root])).toBeUndefined();
  expect(brainProjectRoot([],[])).toBeUndefined();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

it('falls back to a file-only scope for attached text files, never to their folder',()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'brain-files-')));
 try {
  fs.mkdirSync(path.join(root,'a'));fs.mkdirSync(path.join(root,'b'));fs.mkdirSync(path.join(root,'learn'));
  for(const f of ['a/x.ts','b/y.md','a/pic.png','a/doc.docx','learn/z.md','a/secret.ts'])fs.writeFileSync(path.join(root,f),'x');
  const s=brainScope([],[path.join(root,'learn')],[path.join(root,'a/x.ts'),path.join(root,'b/y.md'),path.join(root,'a/pic.png'),path.join(root,'a/doc.docx'),path.join(root,'learn/z.md'),'relative.ts',path.join(root,'missing.ts')]);
  expect(s).toEqual({root,files:['a/x.ts','b/y.md']});
  // Thư mục được cấp quyền luôn thắng tệp lẻ.
  expect(brainScope([root],[],[path.join(root,'a/x.ts')])).toEqual({root});
  expect(brainScope([],[],[path.join(root,'a/pic.png')])).toBeUndefined();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

// Chạy với binary thật khi đã biên dịch (PVTA_BRAIN hoặc brain/target/release); bỏ qua nếu chưa có.
// Chọn bản mới nhất: thư mục target mặc định có thể còn bản dựng cũ.
const real=[process.env.PVTA_BRAIN,path.resolve('../brain/target/release/pvta-brain'),process.env.CARGO_TARGET_DIR&&path.join(process.env.CARGO_TARGET_DIR,'release/pvta-brain')]
 .filter((p):p is string=>!!p&&fs.existsSync(p)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
describe.skipIf(!real)('Brain CLI thật',()=>{
 it('tầng 1, tầng 2, tìm, đọc theo ký hiệu; phạm vi tệp không đọc tệp lân cận',async()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'brain-real-')));
  const prev=process.env.PVTA_BRAIN;process.env.PVTA_BRAIN=real;
  try {
   fs.mkdirSync(path.join(root,'src'));
   fs.writeFileSync(path.join(root,'src/rules.ts'),"import {x} from './util.js';\nexport class CoreRules {\n  render(kind: string) {\n    return x(kind);\n  }\n}\nexport function verifyProStep(step: string) {\n  return step.length > 0;\n}\n");
   fs.writeFileSync(path.join(root,'src/util.ts'),"export const x = (s: string) => s.toUpperCase();\n");
   fs.writeFileSync(path.join(root,'README.md'),'# Dự án\n## Quy tắc lõi\nKiểm chứng từng bước.\n');
   const ctx=await brainContext(root);
   expect(brainAvailable(ctx)).toBe(true);expect(ctx).toContain('TẦNG 1');expect(ctx).toContain('PHẠM VI DỰ ÁN');
   expect(await brainRead(root,'brain_outline',{file:'src/rules.ts'})).toMatch(/class CoreRules \[2-6\][\s\S]*method render \[3-5\]/);
   const found=await brainRead(root,'brain_find',{query:'verify pro step'}) as any;
   expect(found.symbols[0]).toMatchObject({name:'verifyProStep',path:'src/rules.ts',line:7});
   const vi=await brainRead(root,'brain_find',{query:'quy tac loi'}) as any;
   expect(vi.symbols[0]).toMatchObject({name:'Quy tắc lõi',path:'README.md'});
   const body=await brainRead(root,'brain_read',{file:'src/rules.ts',symbol:'CoreRules'}) as any;
   expect(body).toMatchObject({start:2,end:6});expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
   // Phạm vi tệp lẻ: chỉ README.md.
   const only={root,files:['README.md']};
   expect(await brainContext(only)).toContain('PHẠM VI TỆP');
   await expect(brainRead(only,'brain_read',{file:'src/util.ts',start:1,end:1})).rejects.toThrow(/outside the Brain scope/);
   expect(JSON.stringify(await brainRead(only,'brain_find',{query:'CoreRules'}))).not.toContain('rules.ts');
   // Không ghi gì vào dự án.
   expect(fs.readdirSync(root).sort()).toEqual(['README.md','src']);
  }finally{if(prev===undefined)delete process.env.PVTA_BRAIN;else process.env.PVTA_BRAIN=prev;fs.rmSync(root,{recursive:true,force:true});}
 });
});
