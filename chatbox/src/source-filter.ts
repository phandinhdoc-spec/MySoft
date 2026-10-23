import {t as uiText} from './i18n';
import {foldVi,matchesQuery} from '@pvta/shared';

/** Phần của tệp nguồn mà bộ lọc cần; khớp với ContextFile nhưng không phụ thuộc giao diện để dễ kiểm thử. */
export interface SourceFile{id:string;name:string;path:string;scope:'chat'|'project';purpose?:'learning';image?:boolean;at?:number;bytes?:number;segments:{ref:string;text:string}[];/** Có = tệp của một Sổ nguồn liên kết (không phải tệp đính kèm). */notebook?:{id:string;name:string;sid:string;on:boolean;state:string}}
export type ScopeFilter='all'|'project'|'chat'|'learning'|'notebook';
export type TypeFilter='all'|'documents'|'doc'|'sheet'|'slide'|'pdf'|'image'|'other';
export type SortKey='default'|'name'|'recent'|'type';
export interface SourceQuery{query:string;scope:ScopeFilter;type:TypeFilter;sort:SortKey;content:boolean;/** Mã sổ nguồn cần giữ lại; rỗng = mọi sổ. Chỉ có tác dụng với tệp của sổ nguồn. */book?:string}
export const EMPTY_QUERY:SourceQuery={query:'',scope:'all',type:'all',sort:'default',content:false};

export const DEFAULT_QUERY:SourceQuery={...EMPTY_QUERY,type:'documents'};

export const TYPE_LABEL:Record<TypeFilter,string>={all:uiText("Tất cả"),documents:uiText("Tài liệu"),doc:uiText("Văn bản"),sheet:uiText("Bảng tính"),slide:uiText("Trình chiếu"),pdf:'PDF',image:uiText("Hình ảnh"),other:uiText("Khác")};
export const SCOPE_LABEL:Record<ScopeFilter,string>={all:uiText("Tất cả"),project:uiText("Dự án"),chat:uiText("Hội thoại"),learning:uiText("Học hỏi"),notebook:uiText("Sổ nguồn")};
export const SORT_LABEL:Record<SortKey,string>={default:uiText("Thứ tự mặc định"),name:uiText("Tên A → Z"),recent:uiText("Mới cập nhật"),type:uiText("Theo loại")};
const DAY=24*3600*1000;

export function extOf(name:string):string{const m=/\.([A-Za-z0-9]+)$/.exec(name);return m?m[1]!.toLowerCase():'';}
export function typeOf(f:Pick<SourceFile,'name'|'image'|'notebook'>):Exclude<TypeFilter,'all'|'documents'>{
 const e=extOf(f.name);
 // Nguồn của sổ (trang web, YouTube, ghi âm) không có đuôi tệp nhưng vẫn là tài liệu văn bản.
 if(f.notebook&&!['png','jpg','jpeg','webp','gif','bmp','xlsx','xls','csv','ods','tsv','pptx','ppt','odp','pdf'].includes(e))return 'doc';
 if(f.image||['png','jpg','jpeg','webp','gif','bmp'].includes(e))return 'image';
 if(['docx','doc','txt','md','rtf','typ','odt','html','htm'].includes(e))return 'doc';
 if(['xlsx','xls','csv','ods','tsv'].includes(e))return 'sheet';
 if(['pptx','ppt','odp'].includes(e))return 'slide';
 if(e==='pdf')return 'pdf';
 return 'other';
}
export function scopeOf(f:Pick<SourceFile,'scope'|'purpose'|'notebook'>):Exclude<ScopeFilter,'all'>{if(f.notebook)return 'notebook';return f.purpose==='learning'?'learning':f.scope==='project'?'project':'chat';}
/** Tệp vừa được đọc hoặc đọc lại trong 24 giờ qua. */
export const isFresh=(f:Pick<SourceFile,'at'>,now=Date.now())=>typeof f.at==='number'&&now-f.at>=0&&now-f.at<DAY;

const CONTENT_CAP=200_000;
/** Các đoạn chứa mọi từ của truy vấn (không phân biệt dấu). Dùng cho tìm trong nội dung và cho bản xem trước. */
export function matchingSegments(f:Pick<SourceFile,'segments'>,query:string):{ref:string;text:string}[]{
 const words=foldVi(query).split(/\s+/).filter(Boolean);if(!words.length)return [];
 const out:{ref:string;text:string}[]=[];let seen=0;
 for(const s of f.segments){if(seen>CONTENT_CAP)break;seen+=s.text.length;const h=foldVi(s.text);if(words.every(w=>h.includes(w)))out.push(s);}
 return out;
}
function nameHit(f:SourceFile,q:string){return matchesQuery(`${f.name} ${f.path} ${f.notebook?.name??''}`,q);}

/** Số tệp theo từng phạm vi, tính trên các tệp đã qua bộ lọc loại và tìm kiếm (để chip hiện đúng số sẽ thấy khi bấm). */
export function scopeCounts(files:SourceFile[],q:SourceQuery):Record<ScopeFilter,number>{
 const base=filterSources(files,{...q,scope:'all',sort:'default'});
 const out:Record<ScopeFilter,number>={all:base.length,project:0,chat:0,learning:0,notebook:0};
 for(const f of base)out[scopeOf(f)]++;
 return out;
}

export function filterSources<T extends SourceFile>(files:T[],q:SourceQuery):T[]{
 const text=q.query.trim();
 let out=files.filter(f=>(q.scope==='all'||scopeOf(f)===q.scope)&&(!q.book||!f.notebook||f.notebook.id===q.book)&&(q.type==='all'||(q.type==='documents'?['doc','sheet','slide','pdf'].includes(typeOf(f)):typeOf(f)===q.type)));
 if(text)out=out.filter(f=>nameHit(f,text)||(q.content&&text.length>=2&&!f.image&&matchingSegments(f,text).length>0));
 const byName=(a:T,b:T)=>a.name.localeCompare(b.name,'vi',{numeric:true,sensitivity:'base'});
 if(q.sort==='name')out=[...out].sort(byName);
 else if(q.sort==='recent')out=[...out].sort((a,b)=>(b.at??0)-(a.at??0)||byName(a,b));
 else if(q.sort==='type')out=[...out].sort((a,b)=>typeOf(a).localeCompare(typeOf(b))||extOf(a.name).localeCompare(extOf(b.name))||byName(a,b));
 return out;
}
export const isFiltered=(q:SourceQuery)=>!!q.query.trim()||q.scope!=='all'||q.type!=='all'||!!q.book;

/** Số tệp theo từng sổ nguồn (đã qua bộ lọc loại và tìm kiếm, chưa lọc theo sổ), giữ thứ tự sổ xuất hiện. */
export function bookCounts(files:SourceFile[],q:SourceQuery):{id:string;name:string;count:number}[]{
 const base=filterSources(files,{...q,scope:'notebook',book:'',sort:'default'});
 const out=new Map<string,{id:string;name:string;count:number}>();
 for(const f of files)if(f.notebook&&!out.has(f.notebook.id))out.set(f.notebook.id,{id:f.notebook.id,name:f.notebook.name,count:0});
 for(const f of base)out.get(f.notebook!.id)!.count++;
 return [...out.values()];
}

/** Nhãn nơi lưu cho một dòng: tệp sổ nguồn ghi tên sổ để phân biệt tệp trùng tên giữa các sổ. */
export const originLabel=(f:Pick<SourceFile,'scope'|'purpose'|'notebook'>,labels:Record<Exclude<ScopeFilter,'all'>,string>)=>f.notebook?`${labels.notebook}: ${f.notebook.name}`:labels[scopeOf(f)];

export function sizeText(bytes?:number):string{
 if(typeof bytes!=='number')return '';
 if(bytes<1024)return `${bytes} B`;
 if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`;
 return `${(bytes/1024/1024).toFixed(1).replace('.',',')} MB`;
}
export function ageText(at?:number,now=Date.now()):string{
 if(typeof at!=='number')return '';
 const m=Math.floor((now-at)/60000);
 if(m<1)return uiText("vừa xong");if(m<60)return uiText("{0} phút trước",[m]);
 const h=Math.floor(m/60);if(h<24)return uiText("{0} giờ trước",[h]);
 const d=Math.floor(h/24);return d<30?uiText("{0} ngày trước",[d]):new Date(at).toLocaleDateString('vi-VN');
}

/** Câu báo kết quả sau khi cập nhật nguồn. */
export function refreshMessage(r:{added:number;updated:number;removed:number;missing:string[];errors:string[];total:number;folders:number}):string{
 const parts:string[]=[];
 if(r.added)parts.push(uiText("thêm {0} tệp mới",[r.added]));
 if(r.updated)parts.push(uiText("đọc lại {0} tệp đã đổi",[r.updated]));
 if(r.removed)parts.push(uiText("gỡ {0} tệp không còn trong thư mục",[r.removed]));
 let msg=parts.length?uiText("Đã cập nhật nguồn: {0}.",[parts.join(', ')]):r.total?uiText("Không có tệp mới hoặc thay đổi ({0} tài liệu{1}).",[r.total,r.folders?uiText(", quét {0} thư mục",[r.folders]):'']):uiText("Chưa có tài liệu hay thư mục nào để cập nhật. Thêm tệp bằng 📎 hoặc thư mục bằng 📁.");
 if(r.missing.length)msg+=uiText(" {0} tệp đính kèm không còn trên máy: {1}{2}.",[r.missing.length,r.missing.slice(0,3).join(', '),r.missing.length>3?'…':'']);
 if(r.errors.length)msg+=uiText(" Lỗi: {0}.",[r.errors.slice(0,2).join('; ')]);
 return msg;
}
