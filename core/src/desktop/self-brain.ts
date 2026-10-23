import fs from 'node:fs';
import path from 'node:path';
import type {BrainScope} from './brain.js';
import {CAPABILITIES,type Capability} from './self-knowledge.js';

/**
 * Phạm vi Brain luôn có, kể cả khi phiên không có thư mục hay tệp:
 * - "PVTA tự hiểu": danh mục năng lực của chính PVTA, sinh thành Markdown trong <home>/self/pvta/
 *   (Brain là não bộ của PVTA, nên phiên trống vẫn có tầng 1 + tầng 2 về chính phần mềm).
 * - Sổ nguồn: các nguồn đang bật được sao thành Markdown trong vùng làm việc của sổ
 *   (<home>/self/notebook-<mã>/brain), bị dọn cùng vùng khi xóa sổ.
 * Cả hai nằm trong home của PVTA, không ghi vào thư mục của thầy cô.
 */

/** Nội dung Markdown của danh mục: nhóm = đề mục cấp 2, năng lực = cấp 3 (để outline/find của Brain trỏ đúng mục). */
export function selfBrainMarkdown(list:Capability[]=CAPABILITIES):string{
 const groups=[...new Set(list.map(c=>c.group))];
 const out=['# PVTA — năng lực của phần mềm','','Danh mục năng lực có thật của PVTA Chat (dữ liệu vận hành). Dùng để trả lời "PVTA làm được gì, ở đâu, dùng thế nào"; không bịa nút hay menu ngoài danh mục này.',''];
 for(const g of groups){
  out.push(`## ${g}`,'');
  for(const c of list.filter(c=>c.group===g))out.push(`### ${c.name}`,'',`- Mã: ${c.id}`,`- Tóm tắt: ${c.summary}`,`- Cách dùng: ${c.how}`,`- Từ khóa: ${c.keywords.join(', ')}`,`- Mã nguồn: ${c.source.file}`,'');
 }
 return out.join('\n');
}

const writeIfChanged=(file:string,text:string)=>{let old:string|undefined;try{old=fs.readFileSync(file,'utf8');}catch{old=undefined;}if(old!==text)fs.writeFileSync(file,text,{mode:0o600});};

/** Phạm vi Brain "PVTA tự hiểu"; tạo/cập nhật tệp khi cần. Lỗi ghi = undefined (phiên vẫn chạy, chỉ báo Brain chưa có). */
export function selfBrainScope(home:string):BrainScope|undefined{
 try{
  const dir=path.join(home,'self','pvta');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  writeIfChanged(path.join(dir,'PVTA.md'),selfBrainMarkdown());
  return {root:dir,label:'PHẠM VI PVTA TỰ HIỂU: phiên này chưa có thư mục hay tệp văn bản/mã nên Brain dùng danh mục năng lực của chính PVTA (PVTA.md). Đây không phải mã hay tài liệu của thầy cô; không tuyên bố đã đọc dự án của thầy cô.'};
 }catch{return undefined;}
}

/** Thư mục sao nguồn của một sổ (trong vùng làm việc notebook-<mã> do PVTA quản lý). */
export function notebookBrainDir(home:string,notebookId:string):string{
 if(!/^[\w-]{1,80}$/.test(notebookId))throw Error('Mã sổ không hợp lệ.');
 return path.join(home,'self',`notebook-${notebookId}`,'brain');
}

/** Phạm vi Brain cho một sổ: các nguồn đang bật; sổ chưa có nguồn sẵn sàng thì dùng "PVTA tự hiểu". */
export function notebookBrainScope(home:string,notebookId:string,mirror:(dir:string)=>number,name=''):BrainScope|undefined{
 try{
  const dir=notebookBrainDir(home,notebookId);
  if(mirror(dir)>0)return {root:dir,label:`PHẠM VI SỔ NGUỒN${name?` "${name}"`:''}: mỗi nguồn đang bật là một tệp Markdown (tiêu đề cấp 1 = tên nguồn, cấp 2 = nhãn vị trí). Brain chỉ dùng để định hướng; trích dẫn vẫn chỉ lấy từ NGUỒN đánh số trong câu hỏi.`};
 }catch{/* rơi xuống Brain của PVTA */}
 return selfBrainScope(home);
}
