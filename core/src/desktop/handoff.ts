/**
 * Bàn giao giữa các nút cho việc lớn (quy trình/Plan từ 8 nút trở lên).
 * Mỗi nút chạy trong một lượt gọi model riêng, không mang ngữ cảnh của nút trước (kể cả khi trùng model);
 * nút làm xong phải viết “phiếu bàn giao”, nút sau chỉ nhận phiếu này thay vì toàn bộ kết quả dài.
 */
export const HANDOFF_MIN_STEPS=8;
export const HANDOFF_MAX=6000;
export const HANDOFF_HEADING='## BÀN GIAO';
const HEADING=/^#{1,3}\s*B[ÀA]N\s+GIAO\b.*$/im;

export const needsHandoff=(stepCount:number)=>stepCount>=HANDOFF_MIN_STEPS;

/** Quy tắc đưa vào lời nhắc của từng nút. */
export function handoffRules(index:number,total:number):string{
 return `QUY TẮC BÀN GIAO (quy trình dài ${total} nút, bạn là nút ${index+1}):\n`
  +'- Phiên này độc lập: bạn không nhớ gì về các nút trước, chỉ dựa vào “phiếu bàn giao” được đưa kèm (nếu có).\n'
  +`- Làm xong, kết thúc câu trả lời bằng đúng một mục có tiêu đề "${HANDOFF_HEADING}" gồm các dòng: Đã làm; Kết quả và đường dẫn tệp đã tạo/sửa; Quyết định và giả định; Việc nút sau cần biết; Việc còn dở hoặc lỗi.\n`
  +'- Phiếu bàn giao ngắn gọn (dưới khoảng 800 từ), đủ để người khác tiếp tục mà không cần đọc lại toàn bộ.';
}

/** Lấy phiếu bàn giao từ câu trả lời; undefined nếu nút không viết. */
export function extractHandoff(output:string):string|undefined{
 const m=HEADING.exec(output);
 if(!m)return undefined;
 const text=output.slice(m.index+m[0].length).trim();
 return text?text.slice(0,HANDOFF_MAX):undefined;
}

/** Phiếu dự phòng khi nút quên viết: phần cuối câu trả lời, ghi rõ là trích tự động. */
export function fallbackHandoff(output:string):string{
 const tail=output.trim().slice(-3000);
 return `(Nút không viết phiếu bàn giao; PVTA trích phần cuối kết quả.)\n${tail}`;
}

/** Phần bàn giao của các nút trước, đưa vào lời nhắc nút sau. */
export function handoffInput(parents:{name:string;handoff?:string;ok:boolean;error?:string}[]):string{
 return parents.map(p=>`[${p.name}]\n${p.ok?(p.handoff??'(không có phiếu bàn giao)'):`Lỗi: ${p.error??'Không có kết quả'}`}`).join('\n\n');
}
