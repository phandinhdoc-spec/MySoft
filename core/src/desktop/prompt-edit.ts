/**
 * Kiểm tra bản sửa tay của thầy cô đối với bản viết lại YAML.
 * Module thuần (không import Node), để giao diện chatbox dùng cùng luật trước khi duyệt.
 */

/** Edits may change the four descriptive scalars; wiring, resources and original instructions stay exact. */
export function editReviewedPrompt(before:string,after:unknown):string {
 if(typeof after!=='string'||after.length>20_000)throw Error('Bản sửa YAML không hợp lệ.');
 const editable=/^(muc_tieu|dau_ra|rang_buoc|tieu_chi_hoan_thanh): (.*)$/;
 const a=before.split('\n'),b=after.split('\n');
 if(a.length!==b.length)throw Error('Chỉ sửa bốn mục mô tả; giữ nguyên đầu vào, tệp và yêu cầu gốc.');
 a.forEach((line,i)=>{
  const m=editable.exec(line);if(!m){if(line!==b[i])throw Error('Không đổi liên kết, tệp hoặc yêu cầu gốc trong bản duyệt.');return;}
  const n=editable.exec(b[i]!);if(!n||n[1]!==m[1])throw Error('Giữ đúng tên mục YAML.');
  let value:unknown;try{value=JSON.parse(n[2]!);}catch{throw Error('Giá trị YAML cần là chuỗi trong dấu ngoặc kép.');}
  if(typeof value!=='string'||!value.trim()||value.length>4000)throw Error('Mục mô tả cần từ 1 đến 4.000 ký tự.');
 });
 return after;
}
