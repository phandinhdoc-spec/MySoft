import {t as uiText} from './i18n';
import {rpc} from './ipc';

/** Chuyển đổi base64 ⇄ byte theo từng khúc để không tràn ngăn xếp với tệp lớn. */
export function fromBase64(b64:string):Uint8Array{
 const bin=atob(b64);const out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}
export function toBase64(bytes:Uint8Array):string{
 let s='';const step=0x8000;
 for(let i=0;i<bytes.length;i+=step)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+step) as unknown as number[]);
 return btoa(s);
}

/** Đọc cả tệp PDF qua lõi PVTA (từng phần 3 MB). */
export async function readPdf(path:string,onProgress?:(done:number,total:number)=>void):Promise<Uint8Array>{
 const first=await rpc<{size:number;offset:number;data:string}>('pdfRead',{path,offset:0});
 const out=new Uint8Array(first.size);let off=0;
 let part=fromBase64(first.data);out.set(part,0);off+=part.length;onProgress?.(off,first.size);
 while(off<first.size){
  const r=await rpc<{size:number;offset:number;data:string}>('pdfRead',{path,offset:off});
  part=fromBase64(r.data);if(!part.length)throw Error(uiText("Đọc tệp PDF bị gián đoạn."));
  out.set(part,off);off+=part.length;onProgress?.(off,first.size);
 }
 return out;
}

/** Ghi tệp PDF qua lõi PVTA (từng phần 1 MB, ghi tệp tạm rồi mới thay). */
export async function writePdf(path:string,bytes:Uint8Array):Promise<string>{
 const token=await rpc<string>('pdfWriteBegin',{path});
 try{
  const step=1024*1024;
  for(let i=0;i<bytes.length;i+=step)await rpc('pdfWriteChunk',{token,data:toBase64(bytes.subarray(i,i+step))});
  const r=await rpc<{path:string}>('pdfWriteFinish',{token});
  return r.path;
 }catch(e){
  await rpc('pdfWriteAbort',{token}).catch(()=>{});
  throw e;
 }
}

let font:Promise<Uint8Array>|undefined;
/** Phông chữ có dấu tiếng Việt lấy từ máy (Arial, Segoe UI hoặc DejaVu Sans). */
export function vietnameseFont():Promise<Uint8Array>{
 font??=rpc<{data:string}>('pdfFont').then(r=>fromBase64(r.data));
 font.catch(()=>{font=undefined;});
 return font;
}
