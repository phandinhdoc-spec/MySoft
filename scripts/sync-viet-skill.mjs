// Đồng bộ skill nhân `pvta-viet-skill` từ SKILL.md ở gốc dự án vào mã nguồn lõi.
// Skill này là của quản trị viên: không cài vào thư mục skill của người dùng và không hiện trong danh sách Kỹ năng.
// Mã lõi nhúng nguyên văn để ứng dụng đóng gói không cần đọc tệp ngoài.
//   node scripts/sync-viet-skill.mjs          ghi core/src/standardize/guide.ts
//   node scripts/sync-viet-skill.mjs --check  chỉ kiểm tra, lệch thì thoát mã 1
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'SKILL.md');
const target=path.join(root,'core/src/standardize/guide.ts');
const md=fs.readFileSync(source,'utf8').replace(/\r\n/g,'\n').replace(/^﻿/,'');
const name=/^name:\s*(\S+)\s*$/m.exec(md)?.[1];
if(name!=='pvta-viet-skill')throw Error('SKILL.md gốc phải có name: pvta-viet-skill');
const out=`// TỆP SINH TỰ ĐỘNG từ SKILL.md ở gốc dự án bằng \`npm run sync:viet-skill\`. Không sửa tay.
// Skill nhân của quản trị viên: không cài cho người dùng, không liệt kê trong Kỹ năng.
export const VIET_SKILL_NAME = ${JSON.stringify(name)};
export const VIET_SKILL_MD = ${JSON.stringify(md)};
`;
const current=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
if(process.argv.includes('--check')){
 if(current!==out){console.error('core/src/standardize/guide.ts lệch SKILL.md. Chạy: npm run sync:viet-skill');process.exit(1);}
 console.log('pvta-viet-skill: đã đồng bộ.');
}else{
 if(current!==out)fs.writeFileSync(target,out);
 console.log(current===out?'pvta-viet-skill: không có thay đổi.':'pvta-viet-skill: đã ghi core/src/standardize/guide.ts');
}
