import {t as uiText} from './i18n';
import {PDFDocument,rgb,degrees,BlendMode,LineCapStyle,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/**
 * Mô hình chỉnh sửa PDF và bước xuất tệp. Tọa độ lưu theo hệ tọa độ của chính trang PDF (điểm, gốc dưới-trái),
 * nên không phụ thuộc mức phóng to hay việc xoay trang trên màn hình.
 * Mọi chỉnh sửa chỉ được ghi vào tệp khi thầy cô bấm Lưu; tệp gốc không bị đổi trừ khi chọn ghi đè.
 */
export type Pt=[number,number];
export type Color='red'|'blue'|'black'|'green';
export const COLORS:Record<Color,[number,number,number]>={red:[0.84,0.12,0.12],blue:[0.1,0.32,0.78],black:[0.1,0.1,0.1],green:[0.08,0.52,0.26]};
export const cssColor=(c:Color)=>`rgb(${COLORS[c].map(v=>Math.round(v*255)).join(',')})`;

interface Base{id:string;doc:number;page:number}
type Rect=[number,number,number,number];
export interface HighlightEdit extends Base{kind:'highlight';rect:Rect}
export interface WhiteoutEdit extends Base{kind:'whiteout';rect:Rect}
export interface TextEdit extends Base{kind:'text';at:Pt;text:string;size:number;angle:number;color:Color}
export interface InkEdit extends Base{kind:'ink';points:Pt[];width:number;color:Color}
export type Edit=HighlightEdit|WhiteoutEdit|TextEdit|InkEdit;
/** Chỉnh sửa vừa vẽ trên trang, chưa gắn mã và vị trí trang. */
export type NewEdit=Omit<HighlightEdit,keyof Base>|Omit<WhiteoutEdit,keyof Base>|Omit<TextEdit,keyof Base>|Omit<InkEdit,keyof Base>;

/** Một trang trong tệp kết quả: lấy từ tài liệu nào (0 = tệp đang mở, 1.. = tệp ghép thêm), trang số mấy, xoay thêm bao nhiêu độ. */
export interface PageRef{doc:number;index:number;rot:number}

export const pageKey=(doc:number,index:number)=>`${doc}:${index}`;

function drawEdit(page:PDFPage,e:Edit,font:()=>PDFFont){
 if(e.kind==='highlight'||e.kind==='whiteout'){
  const [x1,y1,x2,y2]=e.rect;
  page.drawRectangle({x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1),
   color:e.kind==='highlight'?rgb(1,0.89,0.2):rgb(1,1,1),opacity:e.kind==='highlight'?0.45:1,
   blendMode:e.kind==='highlight'?BlendMode.Multiply:BlendMode.Normal,borderWidth:0});
 }else if(e.kind==='ink'){
  const [r,g,b]=COLORS[e.color];
  for(let i=1;i<e.points.length;i++){
   const [ax,ay]=e.points[i-1]!,[bx,by]=e.points[i]!;
   page.drawLine({start:{x:ax,y:ay},end:{x:bx,y:by},thickness:e.width,color:rgb(r,g,b),lineCap:LineCapStyle.Round});
  }
 }else{
  const [r,g,b]=COLORS[e.color];const f=font();const rad=e.angle*Math.PI/180;const lh=e.size*1.25;
  e.text.split(/\r?\n/).forEach((line,i)=>{
   if(!line)return;
   page.drawText(line,{x:e.at[0]+Math.sin(rad)*i*lh,y:e.at[1]-Math.cos(rad)*i*lh,size:e.size,font:f,color:rgb(r,g,b),rotate:degrees(e.angle)});
  });
 }
}

/**
 * Tạo tệp PDF mới từ các tài liệu gốc, thứ tự trang và các chỉnh sửa.
 * Giữ nguyên tài liệu chính (dấu trang, thông tin tệp) và chép trang từ tệp ghép thêm vào.
 */
export async function buildPdf(sources:Uint8Array[],pages:PageRef[],edits:Edit[],loadFont?:()=>Promise<Uint8Array>):Promise<Uint8Array>{
 if(!pages.length)throw Error(uiText("Tài liệu không còn trang nào để lưu."));
 const docs=await Promise.all(sources.map(async(bytes,i)=>{
  let d:PDFDocument;
  try{d=await PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false});}
  catch{throw Error(i?uiText("Không đọc được tệp PDF ghép thêm."):uiText("Không đọc được tệp PDF này."));}
  if(d.isEncrypted)throw Error(uiText("Tệp PDF có mật khẩu bảo vệ nên chưa sửa được."));
  return d;
 }));
 const fonts=new Map<number,PDFFont>();
 const needText=edits.some(e=>e.kind==='text'&&e.text.trim());
 const fontBytes=needText?await (loadFont?.()??Promise.reject(Error(uiText("Chưa có phông chữ để chèn chữ.")))):undefined;
 for(const doc of new Set(edits.filter(e=>e.kind==='text').map(e=>e.doc))){
  const d=docs[doc];if(!d||!fontBytes)continue;
  d.registerFontkit(fontkit);
  fonts.set(doc,await d.embedFont(fontBytes,{subset:false}));
 }
 for(const e of edits){
  const d=docs[e.doc];if(!d||e.page<0||e.page>=d.getPageCount())continue;
  drawEdit(d.getPage(e.page),e,()=>fonts.get(e.doc)!);
 }
 const main=docs[0]!;
 const result:PDFPage[]=[];
 for(const ref of pages){
  const src=docs[ref.doc];if(!src||ref.index<0||ref.index>=src.getPageCount())continue;
  const page=ref.doc===0?main.getPage(ref.index):(await main.copyPages(src,[ref.index]))[0]!;
  if(ref.rot%360)page.setRotation(degrees(((page.getRotation().angle+ref.rot)%360+360)%360));
  result.push(page);
 }
 if(!result.length)throw Error(uiText("Tài liệu không còn trang nào để lưu."));
 const unchanged=result.length===main.getPageCount()&&result.every((p,i)=>p===main.getPage(i));
 if(!unchanged){
  while(main.getPageCount())main.removePage(main.getPageCount()-1);
  for(const p of result)main.addPage(p);
 }
 return main.save();
}
