import type {Workflow,WorkflowStep} from './types.js';

/** Bốn mục mô tả do model viết lại. Đầu vào, tệp, liên kết và yêu cầu gốc do hệ thống điền. */
export const DRAFT_FIELDS=['muc_tieu','dau_ra','rang_buoc','tieu_chi_hoan_thanh'] as const;
export type DraftAnswer=Record<typeof DRAFT_FIELDS[number],string>;
export const MAX_DRAFT_FIELD=4000;
export const MAX_DRAFT_YAML=20_000;
/** Các mục cấp cao nhất bắt buộc phải có đúng một lần trong bản nháp. */
const REQUIRED_KEYS=['buoc','ten','muc_tieu','dau_vao','dau_ra','rang_buoc','tieu_chi_hoan_thanh'] as const;
const RETRY='Chưa chạy; bấm Chạy để thử lại.';

/**
 * Lỗi của bước chuẩn bị bản nháp. Luôn xảy ra trước khi có lượt chạy nghiệp vụ nào,
 * nên người dùng chỉ cần thử lại hoặc sửa nút; không có trạng thái chạy dở.
 */
export class DraftError extends Error {
 constructor(message:string){super(message);this.name='DraftError';}
}

/** Đọc JSON model trả về và kiểm tra từng mục mô tả. Không tự sửa dữ liệu lỗi. */
export function parseDraftAnswer(answer:string,nodeName:string):DraftAnswer {
 const text=answer.trim().replace(/^```(?:json)?\s*\n/,'').replace(/\n```$/,'');
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{throw new DraftError(`Nút “${nodeName}”: bản viết lại không phải JSON hợp lệ. ${RETRY}`);}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new DraftError(`Nút “${nodeName}”: bản viết lại không phải đối tượng JSON. ${RETRY}`);
 const out={} as DraftAnswer;
 for(const k of DRAFT_FIELDS){
  const v=(raw as Record<string,unknown>)[k];
  if(typeof v!=='string'||!v.trim())throw new DraftError(`Nút “${nodeName}”: bản viết lại thiếu ${k} hợp lệ. ${RETRY}`);
  if(v.length>MAX_DRAFT_FIELD)throw new DraftError(`Nút “${nodeName}”: ${k} vượt ${MAX_DRAFT_FIELD} ký tự. ${RETRY}`);
  out[k]=v;
 }
 return out;
}

/**
 * Dựng YAML xác định. Khai báo trống được điền bằng mặc định: nguồn là kết quả bước trước
 * (hoặc đầu vào quy trình với nút đầu) và đầu ra lấy từ bản viết lại.
 */
export function renderDraftYaml(w:Workflow,s:WorkflowStep,d:DraftAnswer):string {
 const i=w.steps.findIndex(x=>x.id===s.id);
 const deps=w.mode==='parallel'?(s.dependsOn??[]):(i>0?[w.steps[i-1]!.id]:[]);
 const q=(v:unknown)=>JSON.stringify(v);
 return [`buoc: ${q(s.id)}`,`ten: ${q(s.name)}`,`muc_tieu: ${q(d.muc_tieu)}`,
  'dau_vao:',`  nguon: ${q(deps.length?'Kết quả các bước cần chờ':'Đầu vào quy trình, nếu có')}`,`  buoc_truoc: ${q(deps)}`,`  khai_bao: ${q(s.inputs??[])}`,`  tep: ${q(s.files??[])}`,
  `dau_ra: ${q(s.outputs?.length?s.outputs.join('; '):d.dau_ra)}`,`rang_buoc: ${q(d.rang_buoc)}`,`tieu_chi_hoan_thanh: ${q(s.completion||d.tieu_chi_hoan_thanh)}`,
  'yeu_cau_goc: |-',...s.prompt.split('\n').map(line=>'  '+line)].join('\n');
}

/**
 * Kiểm tra cấu trúc bản nháp trước khi đưa ra duyệt: đủ khóa, yêu cầu gốc còn nguyên từng dòng
 * (placeholder, #lệnh, /skill và bảng đi theo), mọi tệp đính kèm vẫn được tham chiếu.
 */
export function verifyDraftYaml(text:string,s:WorkflowStep):string {
 const fail=(why:string)=>new DraftError(`Nút “${s.name}”: bản nháp YAML ${why}. ${RETRY}`);
 if(text.length>MAX_DRAFT_YAML)throw fail(`vượt ${MAX_DRAFT_YAML} ký tự, cần rút ngắn prompt gốc`);
 const lines=text.split('\n');
 const header=lines.indexOf('yeu_cau_goc: |-');
 if(header<0)throw fail('thiếu khối yêu cầu gốc');
 const top=lines.slice(0,header);
 for(const key of REQUIRED_KEYS){
  const n=top.filter(l=>l.startsWith(key+':')).length;
  if(n!==1)throw fail(n===0?`thiếu mục ${key}`:`lặp mục ${key}`);
 }
 const body=lines.slice(header+1),original=s.prompt.split('\n').map(l=>'  '+l);
 if(body.length!==original.length||body.some((l,k)=>l!==original[k]))throw fail('làm thay đổi yêu cầu gốc');
 // `tep` sits inside the indented dau_vao block, so match with leading spaces allowed.
 const tep=top.find(l=>/^\s*tep: /.test(l))??'';
 for(const f of s.files??[])if(!tep.includes(JSON.stringify(f)))throw fail(`mất tham chiếu tệp ${f}`);
 return text;
}

/** Chuỗi đầy đủ: đọc trả lời, dựng YAML, kiểm tra cấu trúc. Lỗi nào cũng gắn tên nút. */
export function buildDraft(w:Workflow,s:WorkflowStep,answer:string):string {
 return verifyDraftYaml(renderDraftYaml(w,s,parseDraftAnswer(answer,s.name)),s);
}
