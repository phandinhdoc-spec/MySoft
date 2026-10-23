import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe,expect,it} from 'vitest';
import {CAPABILITIES,findCapabilities,catalogPrompt} from '../src/desktop/self-knowledge.js';
import {SelfSpace} from '../src/desktop/self-space.js';
import {SelfAdvisor,parseTips,advisorInput} from '../src/desktop/self-advisor.js';

const repo=path.resolve(__dirname,'../..');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pvta-self-'));

describe('Danh mục năng lực',()=>{
 it('mã không trùng và nguồn còn đúng trong mã thật',()=>{
  expect(new Set(CAPABILITIES.map(c=>c.id)).size).toBe(CAPABILITIES.length);
  for(const c of CAPABILITIES){
   const f=path.join(repo,c.source.file);
   expect(fs.existsSync(f),c.id+': thiếu '+c.source.file).toBe(true);
   expect(fs.readFileSync(f,'utf8').includes(c.source.symbol),c.id+': mất ký hiệu '+c.source.symbol).toBe(true);
   expect(c.summary.length).toBeGreaterThan(10);expect(c.how.length).toBeGreaterThan(5);
  }
 });
 it('tra bỏ dấu, không trả mục không liên quan',()=>{
  expect(findCapabilities('so nguon tham khao')[0]?.id).toBe('notebook');
  expect(findCapabilities('kế hoạch giáo án').map(c=>c.id)).toContain('plan');
  expect(findCapabilities('zzzzqqq')).toEqual([]);
  expect(catalogPrompt().split('\n').length).toBe(CAPABILITIES.length);
 });
});

describe('Vùng làm việc AI nền',()=>{
 it('dự án dùng .pvta/self trong thư mục chính, chat ngoài dự án dùng home',()=>{
  const home=tmp(),root=tmp(),sp=new SelfSpace(home);
  const a=sp.ensure('chat','c1',root),b=sp.ensure('chat','c2');
  expect(a).toBe(path.join(fs.realpathSync(root),'.pvta','self','chat-c1'));
  expect(b).toBe(path.join(home,'self','chat-c2'));
  expect(fs.readFileSync(path.join(root,'.pvta','.gitignore'),'utf8')).toBe('*\n');
 });
 it('từ chối mã nguy hiểm và chỉ xóa đúng vùng',()=>{
  const home=tmp(),root=tmp(),sp=new SelfSpace(home);
  expect(()=>sp.ensure('chat','../x',root)).toThrow();
  const keep=path.join(root,'tai-lieu.txt');fs.writeFileSync(keep,'x');
  const a=sp.ensure('chat','c1',root),other=sp.ensure('chat','c3',root);fs.writeFileSync(path.join(a,'state.json'),'{}');
  expect(sp.remove('chat','c1',[root])).toBe(1);
  expect(fs.existsSync(a)).toBe(false);expect(fs.existsSync(other)).toBe(true);expect(fs.existsSync(keep)).toBe(true);
 });
 it('không đi theo liên kết .pvta trỏ ra ngoài',()=>{
  const home=tmp(),root=tmp(),outside=tmp(),sp=new SelfSpace(home);
  fs.mkdirSync(path.join(outside,'self','chat-c1'),{recursive:true});fs.symlinkSync(outside,path.join(root,'.pvta'));
  expect(sp.remove('chat','c1',[root])).toBe(0);
  expect(fs.existsSync(path.join(outside,'self','chat-c1'))).toBe(true);
  // ensure cũng không ghi ra ngoài: rơi về home
  expect(sp.ensure('chat','c9',root)).toBe(path.join(home,'self','chat-c9'));
 });
 it('thư mục dự án không tồn tại thì dùng home',()=>{
  const home=tmp(),sp=new SelfSpace(home);
  expect(sp.ensure('project','p1','/khong/ton/tai/abc')).toBe(path.join(home,'self','project-p1'));
 });
});

describe('Bộ gợi ý',()=>{
 const sig={scope:'chat' as const,activity:{send:3},fileNames:['de.docx'],used:[]};
 it('chỉ nhận mã trong danh mục, loại mục chặn, liên kết và chỉ thị',()=>{
  const out=parseTips(JSON.stringify({tips:[
   {capabilityId:'notebook',text:'Thầy/cô có thể gom nguồn vào Sổ nguồn để hỏi đáp có trích đoạn.'},
   {capabilityId:'khong-co',text:'Tính năng bịa đặt không có trong danh mục.'},
   {capabilityId:'plan',text:'Xem https://evil.example để biết thêm về Plan nhiều bước.'},
   {capabilityId:'skills',text:'Dùng Skill để PVTA làm đúng một loại việc lặp lại.'},
   {capabilityId:'rules',text:'ngắn'},
  ]}),new Set(['skills']));
  expect(out).toEqual([{capabilityId:'notebook',text:'Thầy/cô có thể gom nguồn vào Sổ nguồn để hỏi đáp có trích đoạn.'}]);
  expect(parseTips('không phải json',new Set())).toEqual([]);
 });
 it('đầu vào không chứa đường dẫn hay nội dung',()=>{
  const t=advisorInput({...sig,fileNames:['de.docx']},new Set());
  expect(t).toContain('de.docx');expect(t).not.toContain('/Users');
 });
 it('lưu gợi ý, không gọi lại khi tình huống không đổi, quyết định được ghi nhớ',async()=>{
  const home=tmp(),adv=new SelfAdvisor(new SelfSpace(home));const scope={kind:'chat' as const,id:'c1'};
  let calls=0;const ask=async()=>{calls++;return JSON.stringify({tips:[{capabilityId:'notebook',text:'Thầy/cô có thể gom nguồn vào Sổ nguồn để hỏi đáp có trích đoạn.'}]});};
  expect(await adv.run({scope,signals:sig,modelLabel:'x',ask,force:true})).toBe(true);
  expect(adv.current()?.capabilityId).toBe('notebook');
  expect(await adv.run({scope,signals:sig,modelLabel:'x',ask,force:true})).toBe(false);// đang có gợi ý chờ
  const id=adv.current()!.id;adv.decide(id,'never');expect(adv.current()).toBeUndefined();
  const adv2=new SelfAdvisor(new SelfSpace(home));
  let seenExcluded='';await adv2.run({scope,signals:sig,modelLabel:'x',force:true,ask:async text=>{seenExcluded=text;return '{"tips":[]}';}});
  expect(seenExcluded).toContain('"excluded":[]'.replace('[]','["notebook"]'));
  expect(calls).toBe(1);
 });
 it('lỗi model không làm hỏng và không có gợi ý',async()=>{
  const adv=new SelfAdvisor(new SelfSpace(tmp()));
  expect(await adv.run({scope:{kind:'chat',id:'c1'},signals:sig,modelLabel:'x',force:true,ask:async()=>{throw Error('hết lượt');}})).toBe(false);
  expect(adv.current()).toBeUndefined();
 });
});
