import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PDFDocument,degrees} from 'pdf-lib';
import {buildPdf,type Edit} from '../../chatbox/src/pdfedit';
import {PdfWriter,readPdfChunk,checkPdfPath,systemFontCandidates} from '../src/desktop/pdffile';

async function sample(n:number,size:[number,number]=[595,842]){
 const d=await PDFDocument.create();
 for(let i=0;i<n;i++){const p=d.addPage(size);p.drawText(`Trang ${i+1}`,{x:50,y:700,size:20});}
 return d.save();
}
const font=()=>{for(const f of systemFontCandidates('linux'))if(fs.existsSync(f))return f;return undefined;};

describe('khung sửa PDF: xuất tệp',()=>{
 it('xóa, đổi thứ tự và xoay trang',async()=>{
  const out=await buildPdf([await sample(3)],[{doc:0,index:2,rot:90},{doc:0,index:0,rot:0}],[]);
  const d=await PDFDocument.load(out);
  expect(d.getPageCount()).toBe(2);
  expect(d.getPage(0).getRotation().angle).toBe(90);
  expect(d.getPage(1).getRotation().angle).toBe(0);
 });
 it('ghép trang từ tệp khác',async()=>{
  const out=await buildPdf([await sample(2),await sample(1,[300,300])],[{doc:0,index:0,rot:0},{doc:1,index:0,rot:0},{doc:0,index:1,rot:0}],[]);
  const d=await PDFDocument.load(out);
  expect(d.getPageCount()).toBe(3);
  expect(d.getPage(1).getSize()).toEqual({width:300,height:300});
 });
 it('vẽ tô sáng, che trắng, nét vẽ và cộng dồn góc xoay sẵn có',async()=>{
  const src=await PDFDocument.create();const p=src.addPage([400,400]);p.setRotation(degrees(90));
  const edits:Edit[]=[
   {id:'a',doc:0,page:0,kind:'highlight',rect:[10,10,100,40]},
   {id:'b',doc:0,page:0,kind:'whiteout',rect:[120,10,200,40]},
   {id:'c',doc:0,page:0,kind:'ink',points:[[10,100],[50,120],[90,100]],width:2,color:'red'},
  ];
  const out=await buildPdf([await src.save()],[{doc:0,index:0,rot:90}],edits);
  const d=await PDFDocument.load(out);
  expect(d.getPage(0).getRotation().angle).toBe(180);
  expect(out.length).toBeGreaterThan(500);
 });
 const ttf=font();
 it.skipIf(!ttf)('chèn chữ tiếng Việt có dấu bằng phông của máy',async()=>{
  const edits:Edit[]=[{id:'t',doc:0,page:0,kind:'text',at:[50,600],text:'Điểm: 9,5\nNhận xét: Làm bài tốt, trình bày đẹp.',size:14,angle:0,color:'red'}];
  const out=await buildPdf([await sample(1)],[{doc:0,index:0,rot:0}],edits,async()=>fs.readFileSync(ttf!));
  const d=await PDFDocument.load(out);
  expect(d.getPageCount()).toBe(1);
  // Đọc lại bằng pdf.js: chữ có dấu phải trích xuất đúng (phông được nhúng và ánh xạ Unicode đúng).
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await pdfjs.getDocument({data:out,isEvalSupported:false,useSystemFonts:false}).promise;
  const text=(await (await doc.getPage(1)).getTextContent()).items.map((i:any)=>i.str).join(' ');
  expect(text).toContain('Điểm: 9,5');
  expect(text).toContain('Nhận xét: Làm bài tốt, trình bày đẹp.');
 });
 it('báo lỗi khi xóa hết trang',async()=>{
  await expect(buildPdf([await sample(1)],[],[])).rejects.toThrow(/không còn trang/);
 });
});

describe('khung sửa PDF: đọc ghi tệp',()=>{
 it('chỉ nhận đường dẫn tuyệt đối tới tệp .pdf',()=>{
  expect(()=>checkPdfPath('a.pdf')).toThrow();
  expect(()=>checkPdfPath('/tmp/a.docx')).toThrow();
  expect(checkPdfPath('/tmp/a.PDF')).toBe('/tmp/a.PDF');
 });
 it('ghi theo từng phần rồi đọc lại đúng nội dung',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-pdf-'));const dest=path.join(dir,'kq.pdf');
  const bytes=Buffer.concat([Buffer.from('%PDF-1.7\n'),Buffer.alloc(4*1024*1024,65)]);
  const w=new PdfWriter();const t=await w.begin(dest);
  for(let i=0;i<bytes.length;i+=1024*1024)await w.chunk(t,bytes.subarray(i,i+1024*1024).toString('base64'));
  expect((await w.finish(t)).size).toBe(bytes.length);
  const parts:Buffer[]=[];let off=0;
  for(;;){const r=await readPdfChunk(dest,off);const b=Buffer.from(r.data,'base64');parts.push(b);off+=b.length;if(off>=r.size)break;}
  expect(Buffer.concat(parts).equals(bytes)).toBe(true);
  expect(fs.readdirSync(dir)).toEqual(['kq.pdf']);
  fs.rmSync(dir,{recursive:true,force:true});
 });
 it('dữ liệu không phải PDF thì không ghi đè tệp cũ',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-pdf-'));const dest=path.join(dir,'cu.pdf');fs.writeFileSync(dest,'%PDF-cu');
  const w=new PdfWriter();const t=await w.begin(dest);await w.chunk(t,Buffer.from('rac').toString('base64'));
  await expect(w.finish(t)).rejects.toThrow(/không phải tệp PDF/);
  expect(fs.readFileSync(dest,'utf8')).toBe('%PDF-cu');
  expect(fs.readdirSync(dir)).toEqual(['cu.pdf']);
  fs.rmSync(dir,{recursive:true,force:true});
 });
});
