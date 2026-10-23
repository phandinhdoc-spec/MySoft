import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Đọc và ghi tệp PDF cho khung sửa PDF trong giao diện. Kênh nội bộ giữa giao diện và lõi giới hạn
 * khoảng 2 MB mỗi yêu cầu, nên dữ liệu đi theo từng phần (base64). Chỉ làm việc với tệp .pdf có đường dẫn tuyệt đối.
 * Ghi luôn ra tệp tạm cạnh đích rồi mới đổi tên, nên lỗi giữa chừng không làm hỏng tệp cũ.
 */

export const MAX_PDF=200*1024*1024;
export const READ_CHUNK=3*1024*1024;
const MAX_WRITE_CHUNK=1_500_000;

export function checkPdfPath(raw:unknown):string{
 const file=typeof raw==='string'?raw.slice(0,4000):'';
 if(!file||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.pdf')throw Error('Chỉ làm việc được với tệp PDF.');
 return path.normalize(file);
}

export async function readPdfChunk(raw:unknown,offsetRaw:unknown):Promise<{size:number;offset:number;data:string}>{
 const file=checkPdfPath(raw);
 const st=await fsp.stat(file).catch(()=>null);
 if(!st?.isFile())throw Error('Không tìm thấy tệp PDF. Có thể tệp đã bị chuyển hoặc xóa.');
 if(st.size>MAX_PDF)throw Error('Tệp PDF quá lớn (trên 200 MB).');
 const offset=Math.max(0,Math.min(st.size,Math.floor(Number(offsetRaw)||0)));
 const length=Math.min(READ_CHUNK,st.size-offset);
 const fh=await fsp.open(file,'r');
 try{
  const buf=Buffer.alloc(length);
  let done=0;
  while(done<length){const {bytesRead}=await fh.read(buf,done,length-done,offset+done);if(!bytesRead)break;done+=bytesRead;}
  return {size:st.size,offset,data:buf.subarray(0,done).toString('base64')};
 }finally{await fh.close();}
}

interface PendingWrite{dest:string;tmp:string;size:number;at:number}

export class PdfWriter{
 private pending=new Map<string,PendingWrite>();

 async begin(raw:unknown):Promise<string>{
  const dest=checkPdfPath(raw);
  const dir=path.dirname(dest);
  const st=await fsp.stat(dir).catch(()=>null);
  if(!st?.isDirectory())throw Error('Thư mục lưu không tồn tại.');
  this.sweep();
  const token=crypto.randomBytes(16).toString('hex');
  const tmp=path.join(dir,`.${path.basename(dest)}.pvta-${token.slice(0,8)}.tmp`);
  try{await fsp.writeFile(tmp,new Uint8Array(),{flag:'wx'});}
  catch{throw Error(`Không ghi được vào ${dir}. Kiểm tra quyền ghi hoặc chọn thư mục khác.`);}
  this.pending.set(token,{dest,tmp,size:0,at:Date.now()});
  return token;
 }

 async chunk(tokenRaw:unknown,dataRaw:unknown):Promise<number>{
  const w=this.get(tokenRaw);
  const data=typeof dataRaw==='string'?dataRaw:'';
  if(data.length>MAX_WRITE_CHUNK*2)throw Error('Phần dữ liệu quá lớn.');
  const buf=Buffer.from(data,'base64');
  if(w.size+buf.length>MAX_PDF){await this.abort(tokenRaw);throw Error('Tệp PDF quá lớn (trên 200 MB).');}
  await fsp.appendFile(w.tmp,buf);
  w.size+=buf.length;w.at=Date.now();
  return w.size;
 }

 async finish(tokenRaw:unknown):Promise<{path:string;size:number}>{
  const w=this.get(tokenRaw);
  this.pending.delete(String(tokenRaw));
  try{
   const head=Buffer.alloc(5);
   const fh=await fsp.open(w.tmp,'r');try{await fh.read(head,0,5,0);}finally{await fh.close();}
   if(head.toString('latin1')!=='%PDF-')throw Error('Dữ liệu ghi ra không phải tệp PDF.');
   await fsp.rename(w.tmp,w.dest);
  }catch(e){
   await fsp.rm(w.tmp,{force:true});
   throw e instanceof Error&&e.message.startsWith('Dữ liệu')?e:Error('Không lưu được tệp PDF. Tệp có thể đang mở ở chương trình khác.');
  }
  return {path:w.dest,size:w.size};
 }

 async abort(tokenRaw:unknown){
  const w=this.pending.get(String(tokenRaw));
  if(!w)return;
  this.pending.delete(String(tokenRaw));
  await fsp.rm(w.tmp,{force:true});
 }

 private get(tokenRaw:unknown):PendingWrite{
  const w=this.pending.get(String(tokenRaw));
  if(!w)throw Error('Phiên lưu đã hết hạn. Bấm lưu lại.');
  return w;
 }

 /** Bỏ các phiên lưu bị bỏ dở hơn 10 phút. */
 private sweep(){
  const old=Date.now()-600_000;
  for(const [t,w] of this.pending)if(w.at<old){this.pending.delete(t);fs.rm(w.tmp,{force:true},()=>{});}
 }
}

/** Phông chữ có đủ dấu tiếng Việt trên máy, để chèn chữ vào PDF. */
export function systemFontCandidates(platform:NodeJS.Platform=process.platform,env:NodeJS.ProcessEnv=process.env):string[]{
 if(platform==='darwin')return ['/System/Library/Fonts/Supplemental/Arial.ttf','/Library/Fonts/Arial.ttf','/System/Library/Fonts/Supplemental/Times New Roman.ttf'];
 if(platform==='win32'){const f=path.join(env.WINDIR??env.SystemRoot??'C:\\Windows','Fonts');return ['arial.ttf','segoeui.ttf','tahoma.ttf','times.ttf'].map(n=>path.join(f,n));}
 return ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/TTF/DejaVuSans.ttf','/usr/share/fonts/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf','/usr/share/fonts/noto/NotoSans-Regular.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'];
}

export async function systemFont(candidates=systemFontCandidates()):Promise<{name:string;data:string}>{
 for(const file of candidates){
  try{
   const st=await fsp.stat(file);
   if(!st.isFile()||st.size>8*1024*1024)continue;
   return {name:path.basename(file),data:(await fsp.readFile(file)).toString('base64')};
  }catch{/* thử phông tiếp theo */}
 }
 throw Error('Không tìm thấy phông chữ tiếng Việt trên máy để chèn chữ vào PDF.');
}
