import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {NotebookStore,normalizeNbChoice,type NotebookDeps} from '../src/notebook/index.js';
import {notebookBrainDir,notebookBrainScope,selfBrainMarkdown,selfBrainScope} from '../src/desktop/self-brain.js';
import {CAPABILITIES} from '../src/desktop/self-knowledge.js';
import {brainAvailable,brainContext,brainRead} from '../src/desktop/brain.js';

let home:string;
beforeEach(()=>{home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-selfbrain-')));});
afterEach(()=>fs.rmSync(home,{recursive:true,force:true}));

const TEXT='Quang hợp là quá trình cây xanh dùng năng lượng ánh sáng để tổng hợp chất hữu cơ và giải phóng khí oxygen.';
const deps:NotebookDeps={extract:async()=>({segments:[{ref:'Trang 1',text:TEXT},{ref:'Trang 2',text:'Hô hấp tế bào giải phóng năng lượng.'}]})};
async function book(){
 const s=new NotebookStore(home,deps,()=>{});const nb=s.create('KHTN');
 const f=path.join(home,'quang-hop.pdf');fs.writeFileSync(f,'x');const src=await s.addFile(nb.id,f);
 return {s,nb,src};
}

describe('model riêng cho sổ nguồn',()=>{
 it('làm sạch lựa chọn: backend lạ, model rỗng hay "auto" đều về model chung',()=>{
  expect(normalizeNbChoice({backend:'claude',model:' opus '})).toEqual({backend:'claude',model:'opus'});
  expect(normalizeNbChoice({backend:'api',model:'commandcode/x'})).toEqual({backend:'api',model:'commandcode/x'});
  for(const bad of ['auto',null,undefined,{backend:'shell',model:'x'},{backend:'claude',model:''},{backend:'claude',model:'x'.repeat(151)}])expect(normalizeNbChoice(bad)).toBeUndefined();
 });
 it('lưu theo sổ, mở lại vẫn còn; chọn Tự động thì bỏ; dữ liệu sai thì từ chối',async()=>{
  const {s,nb}=await book();
  s.setChoice(nb.id,{backend:'codex',model:'gpt-5'});
  expect(new NotebookStore(home,deps,()=>{}).get(nb.id).choice).toEqual({backend:'codex',model:'gpt-5'});
  expect(()=>s.setChoice(nb.id,{backend:'rm',model:'x'})).toThrow('Model không hợp lệ');
  expect(s.get(nb.id).choice).toEqual({backend:'codex',model:'gpt-5'});
  expect(s.setChoice(nb.id,'auto').choice).toBeUndefined();
 });
 it('lượt hỏi gửi kèm mã sổ và model đã chọn cho hàm gọi AI',async()=>{
  const {s,nb}=await book();
  s.setChoice(nb.id,{backend:'claude',model:'haiku'});
  let meta:unknown;
  await s.ask(nb.id,'Quang hợp giải phóng khí gì?',async(_sys,_user,_sig,m)=>{meta=m;return 'Khí oxygen [1].';});
  expect(meta).toEqual({notebookId:nb.id,choice:{backend:'claude',model:'haiku'}});
 });
});

describe('Brain luôn có phạm vi',()=>{
 it('PVTA tự hiểu: mọi năng lực thành đề mục, nằm trong home, ghi lại chỉ khi đổi',()=>{
  const md=selfBrainMarkdown();
  for(const c of CAPABILITIES)expect(md).toContain(`### ${c.name}`);
  const sc=selfBrainScope(home)!;
  expect(sc.root).toBe(path.join(home,'self','pvta'));expect(sc.label).toContain('PHẠM VI PVTA TỰ HIỂU');
  const f=path.join(sc.root,'PVTA.md');const t=fs.statSync(f).mtimeMs;
  selfBrainScope(home);expect(fs.statSync(f).mtimeMs).toBe(t);
 });
 it('sổ nguồn: sao nguồn đang bật thành Markdown; tắt nguồn thì gỡ; sổ rỗng dùng PVTA tự hiểu',async()=>{
  const {s,nb,src}=await book();
  const sc=notebookBrainScope(home,nb.id,dir=>s.mirror(nb.id,dir),nb.name)!;
  expect(sc.root).toBe(notebookBrainDir(home,nb.id));expect(sc.label).toContain('PHẠM VI SỔ NGUỒN "KHTN"');
  const md=fs.readFileSync(path.join(sc.root,`${src.id}.md`),'utf8');
  expect(md).toMatch(/^# quang-hop\.pdf/);expect(md).toContain('## Trang 2');expect(md).toContain(TEXT);
  s.toggleSource(nb.id,src.id,false);
  const back=notebookBrainScope(home,nb.id,dir=>s.mirror(nb.id,dir))!;
  expect(fs.readdirSync(notebookBrainDir(home,nb.id))).toEqual([]);
  expect(back.root).toBe(path.join(home,'self','pvta'));
  expect(()=>notebookBrainDir(home,'../x')).toThrow();
 });
});

const real=[process.env.PVTA_BRAIN,path.resolve('../brain/target/release/pvta-brain'),process.env.CARGO_TARGET_DIR&&path.join(process.env.CARGO_TARGET_DIR,'release/pvta-brain')]
 .filter((p):p is string=>!!p&&fs.existsSync(p)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
describe.skipIf(!real)('Brain thật trên phạm vi dự phòng',()=>{
 it('PVTA tự hiểu và sổ nguồn đều lập được tầng 1, tìm được',async()=>{
  const prev=process.env.PVTA_BRAIN;process.env.PVTA_BRAIN=real;
  try{
   const self=selfBrainScope(home)!;
   const ctx=await brainContext(self);
   expect(brainAvailable(ctx)).toBe(true);expect(ctx).toContain('PHẠM VI PVTA TỰ HIỂU');expect(ctx).toContain('brain_find');
   const hit=await brainRead(self,'brain_find',{query:'quy trinh da nhanh'}) as any;
   expect(JSON.stringify(hit)).toContain('Quy trình đa nhánh');
   const {s,nb}=await book();
   const sc=notebookBrainScope(home,nb.id,dir=>s.mirror(nb.id,dir),nb.name)!;
   const nbCtx=await brainContext(sc,undefined,'',{tools:false});
   expect(brainAvailable(nbCtx)).toBe(true);expect(nbCtx).toContain('không có công cụ gọi Brain');expect(nbCtx).not.toContain('brain_find args');
  }finally{if(prev===undefined)delete process.env.PVTA_BRAIN;else process.env.PVTA_BRAIN=prev;}
 });
});
