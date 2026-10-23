import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {CORE_POLICY,coreRulesPrompt,parseProVerdict,verifyProStep,type CoreKind} from '../src/desktop/core-rules.js';
import {brainAvailable} from '../src/desktop/brain.js';

const KINDS:CoreKind[]=['chat','plan','pro','plan-step','pro-step','workflow','notebook'];

describe('quy tắc lõi PVTA Chat',()=>{
 it('ba chức năng luôn bật và không sửa được lúc chạy',()=>{
  expect(CORE_POLICY).toEqual({brain:true,documentHints:true,featureTips:true,proHarness:true});
  expect(Object.isFrozen(CORE_POLICY)).toBe(true);
 });
 it('mọi loại phiên đều nhận Brain và gợi ý văn bản; harness chỉ cho Plan Pro',()=>{
  for(const kind of KINDS){
   const text=coreRulesPrompt(kind,{hasBrain:true});
   expect(text).toContain('QUY TẮC LÕI PVTA');
   expect(text).toContain('BRAIN (lõi');
   expect(text).toContain('GỢI Ý KHI LÀM VIỆC VỚI VĂN BẢN');
   expect(text.includes('HARNESS PLAN PRO')).toBe(kind==='pro'||kind==='pro-step');
  }
 });
 it('Brain lỗi thì cấm tuyên bố đã tra Brain',()=>{
  for(const kind of KINDS)expect(coreRulesPrompt(kind,{hasBrain:false})).toContain('chưa lập chỉ mục được');
 });
 it('Brain luôn có phạm vi: sổ nguồn, bước không công cụ và PVTA tự hiểu',()=>{
  const nb=coreRulesPrompt('notebook',{hasBrain:true});
  expect(nb).toContain('sinh riêng cho sổ này');
  expect(nb).toContain('không có công cụ Brain');
  expect(nb).not.toContain('brain_find args');
  expect(coreRulesPrompt('workflow',{hasBrain:true})).toContain('không có pvta-read');
  expect(coreRulesPrompt('workflow',{hasBrain:true,brainTools:false})).toContain('không có thư mục để gọi CLI');
  for(const kind of KINDS)expect(coreRulesPrompt(kind,{hasBrain:true})).toContain('PHẠM VI PVTA TỰ HIỂU');
 });
 it('bước Plan Pro dùng đúng dấu chưa hoàn tất mà runtime nhận ra',()=>{
  expect(coreRulesPrompt('pro-step',{hasBrain:true})).toContain('[PVTA_STEP:INCOMPLETE]');
 });
 it('quy tắc lõi không nằm trong dữ liệu, ViewState hay giao diện',()=>{
  const root=path.resolve(__dirname,'..','..');
  const view=fs.readFileSync(path.join(root,'core/src/desktop/types.ts'),'utf8');
  expect(view).not.toMatch(/coreRules|CORE_POLICY/);
  for(const dir of ['chatbox/src','addin/src','shared/src','bridge/src'])
   for(const f of fs.readdirSync(path.join(root,dir)).filter(f=>/\.(ts|tsx)$/.test(f)))
    expect(fs.readFileSync(path.join(root,dir,f),'utf8'),`${dir}/${f}`).not.toMatch(/core-rules|QUY TẮC LÕI/);
 });
 it('đọc kết quả kiểm định chặt chẽ',()=>{
  expect(parseProVerdict('{"passed":true,"issues":[]}')).toEqual({passed:true,issues:[]});
  expect(parseProVerdict('```json\n{"passed":true,"issues":["thiếu kiểm thử"]}\n```')).toEqual({passed:false,issues:['thiếu kiểm thử']});
  expect(parseProVerdict('{"passed":false,"issues":[]}')?.passed).toBe(false);
  expect(parseProVerdict('không phải JSON')).toBeUndefined();
 });
 it('kiểm định sai định dạng hai lần thì không cho qua',async()=>{
  let calls=0;
  const v=await verifyProStep({task:'t',outputs:[],completion:'c',output:'o'},async()=>{calls++;return 'xin chào';});
  expect(calls).toBe(2);expect(v.passed).toBe(false);
 });
 it('nhận diện khối Brain đã lập chỉ mục',()=>{
  expect(brainAvailable('\nBRAIN cung cấp công cụ tra cứu')).toBe(true);
  expect(brainAvailable('\nBRAIN chưa lập được chỉ mục: x')).toBe(false);
  expect(brainAvailable('')).toBe(false);
 });
});
