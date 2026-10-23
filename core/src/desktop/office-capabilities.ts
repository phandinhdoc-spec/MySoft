import path from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
export const desktopSkillsDir=()=>process.env.PVTA_DESKTOP_SKILLS??fileURLToPath(new URL('../../../desktop-skills/',import.meta.url));
export const officeAddinDir=()=>process.env.PVTA_OFFICE_ADDIN??fileURLToPath(new URL('../../../addin/dist/',import.meta.url));
export const OFFICE_AUTHORING=`CÔNG CỤ TẠO OFFICE (dữ liệu JSON, không phải mã):
Đề xuất khối pvta-action {kind:"create_office",path:"đường dẫn tuyệt đối .docx/.xlsx/.pptx",document:{...},reason:"..."}. Dùng thư mục xuất mặc định bên dưới nếu người dùng chưa chỉ định đường dẫn. Tệp chỉ được ghi sau khi duyệt; tên đã tồn tại sẽ bị từ chối.
Word document: {title,blocks:[{type:"heading",text,level:1},{type:"paragraph",text},{type:"list",items:["Nhãn in đậm: Nội dung..."],ordered:false},{type:"table",rows:[["Cột 1","Cột 2"],["...","..."]]},{type:"page_break"}]}. Nội dung là chữ thuần, không nhét Markdown (** hay ##) vào đoạn. Đoạn bắt đầu bằng "Lưu ý:", "Ghi chú:", "Kết luận:", "Mục tiêu:" sẽ tự động được đóng khung nền nổi bật. Bảng tự động định dạng tiêu đề nền xanh đậm chữ trắng, kẻ sọc zebra và tô đậm dòng Tổng/Cộng.
Excel document: {sheets:[{name,rows:[["STT","Họ và tên","Điểm"],["1","Nguyễn Minh An",8.5]],formulas:[{cell:"C4",formula:"=AVERAGE(C2:C3)"}],merges:[],charts:[{type:"bar" hoặc "line",title,minRow:1,maxRow:3,minCol:3,maxCol:3,categoryCol:2,anchor:"E2"}]}]}. rows chứa dữ liệu số nguyên/thập phân thực sự (không đóng khung chuỗi số có dấu chấm phân cách), công thức phải ở formulas. Bảng tự động đóng băng hàng tiêu đề (freeze_panes), kẻ khung, căn phải cột số và tô nổi dòng Tổng/Cộng/Trung bình. Sửa bản sao XLSX đã đính kèm: kind:"edit_excel",path:tệp nguồn,document:{sheets:[{name,cells:[{cell:"B2",value:9}],formulas:[],charts:[]}]}.
PowerPoint document: {slides:[{title:"HOẠT ĐỘNG 1: KHỞI ĐỘNG",badge:"HOẠT ĐỘNG 1",layout:"cover"|"cards"|"table",bullets:["Nhãn thẻ 1: Nội dung cô đọng","Nhãn thẻ 2: Nội dung cô đọng"],notes:"lời giảng chi tiết của GV"},{title:"I. Bảng tổng hợp số liệu",rows:[["Chỉ tiêu","Số tiền"],["Quỹ lương",1000],["Tổng cộng",1000]],bullets:["Chú thích nổi bật dưới bảng"],notes:"..."}]}.
Khi người dùng yêu cầu soạn/tạo/xuất PowerPoint, đầu ra phải là create_office .pptx, không dừng ở bảng nội dung slide. Sau khi dùng Python cũng phải hoàn tất khối pvta-action. Chỉ viết dàn ý nếu người dùng yêu cầu dàn ý hoặc đang Chỉ đọc/Plan.
PowerPoint hỗ trợ theme:"navy"|"sage"|"sand" ở document; slide layout:"cover"|"cards"|"table"|"visual". Slide visual có tối đa 3 bullets ngắn, image:{attachment:"tên ảnh PNG/JPG đã đính kèm",caption:"chú thích"}; chỉ dùng ảnh nguồn thực có trong hội thoại, không bịa đường dẫn. Khi chưa có ảnh, slide visual và bìa có minh họa sách/học tập dựng sẵn (không phải ảnh thực tế của chủ đề). Dùng xen kẽ bìa, visual, cards và bảng; nền nhạt, tối đa 2 màu nhấn, chữ ít và khoảng trắng rộng. Chi tiết đưa vào notes.
QUY TẮC THIẾT KẾ SLIDE ĐẸP:
- Tuyệt đối tránh liệt kê văn bản dài đơn điệu. Mỗi bullet viết theo mẫu "Nhãn ngắn (2-5 từ): Nội dung cốt lõi (10-22 từ)" để bộ dựng tự động chuyển thành hệ thống thẻ Bento Cards có dải màu nhấn và huy hiệu số (01, 02, 03, 04).
- Đa dạng hóa số lượng mục giữa các slide liên tiếp để tạo nhịp điệu thị giác:
  + 2 mục -> Bố cục 2 Cột đối xứng (So sánh / Thuận lợi & Thách thức / 2 câu hỏi).
  + 3 mục -> Bố cục 3 Cột chuyên gia (3 trụ cột / 3 bước / 3 đặc điểm).
  + 4 mục -> Bố cục Lưới Bento 2x2 (4 nhóm / 4 nhiệm vụ / 4 tiêu chí).
  + Câu hỏi ôn tập -> Viết "Câu 1: ..." và dòng kế tiếp "-> Đáp án: ..." để tự động tạo thẻ câu hỏi Indigo và hộp đáp án xanh ngọc lục bảo.
  + Dữ liệu số, ngân sách, phân công -> Bắt buộc dùng bảng rows thay vì viết chữ rời rạc; dòng cuối "Tổng" hoặc "Cộng" tự động tô nổi.
Chỉ báo đã tạo hoặc sửa khi công cụ xác nhận thành công.`;
export const defaultOutput=(documentsDir=path.join(homedir(),'Documents'))=>path.join(documentsDir,'PVTA-Office');
/** Thư mục tạm dùng chung: mọi người trên máy đều đọc và ghi được (macOS/Linux: /tmp, Windows: thư mục Temp). Mặc định cho mọi kết quả quy trình, Plan và chat khi chưa chọn nơi lưu. Hệ điều hành có thể tự dọn; người dùng phải bấm «Lưu như…» để giữ lâu dài. */
export const tempResultDir=()=>process.env.PVTA_RESULT_DIR??(process.platform==='win32'?path.join(tmpdir(),'PVTA-Ket-qua'):path.join('/tmp','PVTA-Ket-qua'));
/** Nơi tạm mặc định cho mọi kết quả khi chưa có nơi lưu hợp lệ. Tham số documentsDir giữ để tương thích, không còn dùng. */
export const resultDir=(_documentsDir?:string)=>tempResultDir();
export function validateOfficeDocument(raw:unknown,ext:string){
 const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const str=(v:unknown)=>typeof v==='string'&&v.length<=50000;
 const list=(v:unknown,n:number):v is any[]=>Array.isArray(v)&&v.length<=n;
 const rows=(v:unknown)=>list(v,5000)&&v.length>0&&list(v[0],100)&&v[0].length>0&&v.length*v[0].length<=50000&&v.every(r=>Array.isArray(r)&&r.length===v[0].length&&r.every((c:unknown)=>c===null||str(c)||typeof c==='boolean'||typeof c==='number'&&Number.isFinite(c)));
 if(!obj(raw))return false;
 if(ext==='.docx')return (raw.title===undefined||str(raw.title))&&list(raw.blocks,1000)&&raw.blocks.every(b=>obj(b)&&(
  ['paragraph','heading'].includes(b.type)?str(b.text):b.type==='list'?list(b.items,200)&&b.items.every(str):b.type==='table'?rows(b.rows):b.type==='page_break'));
 if(ext==='.pptx')return (raw.theme===undefined||['navy','sage','sand'].includes(raw.theme))&&list(raw.slides,100)&&raw.slides.length>0&&raw.slides.every(s=>obj(s)&&str(s.title)&&(s.badge===undefined||str(s.badge))&&(s.layout===undefined||['cover','cards','table','visual','content'].includes(s.layout))&&(s.image===undefined||obj(s.image)&&str(s.image.attachment)&&s.image.attachment.length>0&&(s.image.caption===undefined||str(s.image.caption)))&&(s.bullets===undefined||list(s.bullets,8)&&s.bullets.every(str))&&(s.rows===undefined||rows(s.rows))&&(s.notes===undefined||str(s.notes)));
 if(ext==='.xlsx')return list(raw.sheets,30)&&raw.sheets.length>0&&raw.sheets.every(s=>{
  if(!obj(s)||!str(s.name)||(s.rows!==undefined&&!rows(s.rows)))return false;
  for(const k of ['cells','formulas','charts']){
   if(s[k]===undefined)continue;
   if(!list(s[k],k==='charts'?8:5000))return false;
   for(const x of s[k]){
    if(!obj(x))return false;
    if(k==='formulas'&&(!str(x.cell)||!str(x.formula)))return false;
    if(k==='cells'&&(!str(x.cell)||!(x.value===null||str(x.value)||typeof x.value==='number'&&Number.isFinite(x.value)||typeof x.value==='boolean')))return false;
    if(k==='charts'&&x.title!==undefined&&!str(x.title))return false;
   }
  }
  return true;
 });
 return false;
}

/** Explicit creation intent; discussion of a presentation alone must not write files. */
export function wantsPowerPointFile(text:string){
 return /(?:powerpoint|pptx?|trình chiếu|slide)/i.test(text)&&/(?:soạn|tạo|xuất|làm|thiết kế|chuyển|create|export|make)/i.test(text)&&!/(?:chỉ|chưa|không)\s+(?:cần\s+)?(?:viết|soạn|tạo|xuất|làm)?\s*(?:dàn ý|nội dung|tệp|file|pptx)|(?:dàn ý|nội dung)\s+(?:thôi|trước)/i.test(text);
}
