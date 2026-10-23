import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {listTree,treeText,treeDigest,pathScore,buildOutline,ensureOutline,outlineBrief,readTree,saveTree,fold} from '../src/desktop/source-index.js';

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pvta-src-'));
describe('chỉ mục nguồn cho Brain',()=>{
 it('liệt kê cây thư mục bằng lệnh hệ thống, bỏ tệp ẩn và thư mục rác, giữ tên tiếng Việt',async()=>{
  const root=temp();
  for(const f of ['Cơ học/bài 1.docx','Cơ học/Bài tập/de 2.pdf','a.txt','.env','.git/config','node_modules/x/index.js'])
   {fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),'x');}
  const t=await listTree(root);
  expect(t.entries).toEqual(expect.arrayContaining(['Cơ học/bài 1.docx','Cơ học/Bài tập/de 2.pdf','a.txt']));
  expect(t.entries.some(e=>/\.env|\.git|node_modules/.test(e))).toBe(false);
  expect(t.entries.every(e=>!e.endsWith('/')&&!path.isAbsolute(e))).toBe(true);
  expect(['tree','find','dir','walk']).toContain(t.method);
 });
 it('lưu/đọc lại và dựng văn bản cây có đếm số tệp',async()=>{
  const home=temp(),root=temp();fs.mkdirSync(path.join(root,'A'));fs.writeFileSync(path.join(root,'A','x.md'),'#');
  const t=await listTree(root);await saveTree(home,t);expect(readTree(home,t.root)?.entries).toEqual(['A/x.md']);
  expect(treeText(t.entries,{depth:2})).toContain('A/ (1)');
  expect(treeText(['A/b/c.md','A/d.md'],{under:'A',depth:1})).toContain('b/ (1)');
  expect(treeDigest(t)).toContain('A/ 1');
 });
 it('điểm đường dẫn không phân biệt dấu',()=>{
  expect(fold('Đề cương Cơ học')).toBe('de cuong co hoc');
  expect(pathScore('Cơ học/de-cuong.docx','co hoc')).toBeGreaterThan(pathScore('Hoa/bai.docx','co hoc'));
 });
 it('dàn ý Markdown lấy đề mục, tự dựng lại khi tệp đổi và không gọi AI',()=>{
  const home=temp();
  const a={id:'a1',name:'ga.md',path:'/x/ga.md',fingerprint:'f1',bytes:2048,segments:[{ref:'Đoạn 1',text:'# Bài 1\nNội dung A\n## Mục tiêu\nB'},{ref:'Đoạn 2',text:'Hết',section:'Kết luận'}]};
  const md=buildOutline(a);
  expect(md).toContain('- Bài 1');expect(md).toContain('- Mục tiêu');expect(md).toContain('- Kết luận');expect(md).toContain('2 KB');
  expect(ensureOutline(home,a)).toContain('fingerprint:f1');
  expect(ensureOutline(home,{...a,fingerprint:'f2',name:'moi.md'})).toContain('# moi.md');
  expect(outlineBrief(md)).toContain('Bài 1 › Mục tiêu › Kết luận');
 });
});
