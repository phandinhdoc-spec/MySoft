/** Public execution activity, separate from model reasoning and response text. */
export interface AiProgressEntry {
 id:string;
 kind:'model'|'tool'|'phase';
 title:string;
 state:'running'|'done'|'error'|'interrupted';
 at:number;
 endedAt?:number;
 detail?:string;
 input?:string;
 output?:string;
}
export interface AiProgressEvent {chatId:string;entry:AiProgressEntry}

export function progressText(value:unknown,limit=2400):string|undefined{
 if(value===undefined||value===null)return;
 let text:string;
 try{text=typeof value==='string'?value:JSON.stringify(value);}catch{return;}
 if(typeof text!=='string')return;
 text=text.replace(/\b(Bearer\s+)[\w.+\/-]+/gi,'$1<REDACTED>')
  .replace(/((?:api[_-]?key|access[_-]?token|token|authorization|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,'$1<REDACTED>')
  .replace(/(--(?:api-key|token|password|secret)(?:=|\s+))[\S]+/gi,'$1<REDACTED>')
  .replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'<REDACTED>');
 return text.length>limit?text.slice(0,limit)+'\n… (đã rút gọn)':text;
}
export function toolTitle(name:string):string{
 const names:Record<string,string>={Read:'Đọc tệp',Edit:'Sửa tệp',Write:'Ghi tệp',Glob:'Tìm tệp',Grep:'Tìm trong nội dung',Bash:'Chạy lệnh',office_web_search:'Tìm nguồn trên web',notebook_source_read:'Đọc tệp trong sổ nguồn',office_web_read:'Đọc nguồn trên web',office_history_search:'Tra cứu lịch sử',office_rag_search:'Tra cứu tài liệu',office_file_search:'Tìm tài liệu',office_file_read:'Đọc tài liệu',office_skill_read:'Đọc hướng dẫn kỹ năng'};
 return names[name]??`Công cụ: ${name.slice(0,120)}`;
}
