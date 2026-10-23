/** Semantic structure: hints are evidence for the model, never automatic writes. */
export type OutlineRole='title'|'subtitle'|'heading1'|'heading2'|'heading3'|'heading4'|'heading5'|'heading6'|'body'|'tableCaption'|'figureCaption';
export interface ParagraphInfo {index:number;text:string;style:string;inTable:boolean;isList:boolean;size?:number;bold?:boolean}
export const ROLE_STYLES:Record<OutlineRole,string>={title:'Title',subtitle:'Subtitle',heading1:'Heading1',heading2:'Heading2',heading3:'Heading3',heading4:'Heading4',heading5:'Heading5',heading6:'Heading6',body:'Normal',tableCaption:'PVTA Table Caption',figureCaption:'Caption'};
export function outlineHint(p:ParagraphInfo){
 const t=p.text.trim();
 if(!t||p.inTable)return {role:'body',confidence:'high',reason:p.inTable?'Nội dung trong ô bảng':'Đoạn trống'};
 if(/^TOC\d|^Toc\d|^TocHeading$/i.test(p.style))return {role:'existingIndex',confidence:'high',reason:'Đang là mục lục, không phân cấp lại'};
 if(/^Heading[1-6]$/.test(p.style))return {role:p.style.toLowerCase(),confidence:'high',reason:'Style đề mục đang có; đối chiếu nội dung trước khi giữ'};
 if(/^(?:Bảng|Table)\s+\d+(?:[.\-]\d+)*[.:\s]/iu.test(t)&&t.length<250)return {role:'tableCaption',confidence:'medium',reason:'Có nhãn và số bảng; cần đối chiếu bảng gần đó'};
 if(/^(?:Hình|Figure)\s+\d+(?:[.\-]\d+)*[.:\s]/iu.test(t)&&t.length<250)return {role:'figureCaption',confidence:'medium',reason:'Có nhãn và số hình'};
 if(p.isList||/^(?:Câu|Bài)\s+\d+|^[A-D][.)]\s/iu.test(t))return {role:'body',confidence:'medium',reason:'Câu hỏi hoặc danh sách, không tự coi là heading'};
 if(t.length<=180&&!/[.!?;]$/.test(t)){
  if(/^(?:CHƯƠNG|PHẦN)\s+(?:[IVXLCDM]+|\d+)\b/iu.test(t))return {role:'heading1',confidence:'medium',reason:'Tên chương/phần'};
  const numbered=t.match(/^(\d+(?:\.\d+){0,5})[.)]?\s+\S/u);
  if(numbered)return {role:`heading${numbered[1]!.split('.').length}`,confidence:'low',reason:'Đánh số có thể là đề mục hoặc danh sách; xét quan hệ với đoạn xung quanh'};
  if(p.index<8&&t===t.toLocaleUpperCase('vi')&&/[\p{L}]/u.test(t))return {role:'title',confidence:'low',reason:'Chữ hoa đầu tài liệu; có thể là tên cơ quan, cần xem ngữ nghĩa'};
  if(p.bold)return {role:'headingCandidate',confidence:'low',reason:'Đoạn ngắn in đậm chưa đủ xác định cấp'};
 }
 return {role:'body',confidence:'low',reason:'Dựa thêm vào ngữ nghĩa, không chỉ định dạng hiện có'};
}
export interface OutlineChange {index:number;expectedText:string;role:OutlineRole}
export function validateOutline(items:unknown,paras:ParagraphInfo[]):OutlineChange[]{
 if(!Array.isArray(items)||!items.length||items.length>200)throw Error('Cần 1–200 đoạn mỗi lần.');
 const seen=new Set<number>();
 const changes=items.map(v=>{
  if(!v||!Number.isInteger(v.index)||!Object.hasOwn(ROLE_STYLES,v.role)||typeof v.expectedText!=='string'||!v.expectedText.trim())throw Error('Đề xuất phân cấp không hợp lệ.');
  const p=paras[v.index];if(!p||p.text!==v.expectedText)throw Error('Văn bản đã thay đổi; đọc lại cấu trúc trước khi áp dụng.');
  if(seen.has(v.index))throw Error('Một đoạn không được gán hai vai trò.');seen.add(v.index);
  if(p.inTable&&v.role!=='body')throw Error('Không gán đề mục cho nội dung trong ô bảng.');
  return {index:v.index,expectedText:v.expectedText,role:v.role} as OutlineChange;
 });
 const assigned=new Map(changes.map(c=>[c.index,c.role]));let previous=0;
 for(const p of paras){const role=assigned.get(p.index)??p.style.toLowerCase();const m=role.match(/^heading([1-6])$/);if(!m)continue;const level=Number(m[1]);if(assigned.has(p.index)&&level>previous+1)throw Error('Cấp đề mục bị nhảy: cần Heading 1 trước Heading 2, Heading 2 trước Heading 3.');previous=level;}
 return changes;
}
export function abbreviationRows(raw:unknown,source:string):string[][]{
 if(!Array.isArray(raw)||!raw.length||raw.length>100)throw Error('Cần 1–100 từ viết tắt có dẫn chứng.');
 const seen=new Set<string>();return raw.map(x=>{
  if(!x||!['term','meaning','evidence'].every(k=>typeof x[k]==='string'&&x[k].trim()&&x[k].length<1000))throw Error('Từ viết tắt cần tên, nghĩa và trích đoạn nguồn.');
  if(!source.includes(x.evidence)||!x.evidence.includes(x.term)||!x.evidence.includes(x.meaning))throw Error('Nghĩa từ viết tắt không có đủ dẫn chứng trong tài liệu.');
  const key=x.term.trim().toLocaleLowerCase('vi');if(seen.has(key))throw Error('Từ viết tắt bị lặp.');seen.add(key);return [x.term,x.meaning];
 });
}
