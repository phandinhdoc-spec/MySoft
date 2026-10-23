/**
 * Biến và hàm khai báo ở viền khung (module thuần).
 *   {{a = 2}}                      → biến mã `a` giá trị `2`
 *   !{{tinhTong: cộng hai số}}     → hàm `tinhTong`, mô tả tùy chọn; AI tự đặt tham số và thân hàm
 * Giữ nguyên {{prev}}, {{input}} và {{khóa}} của quy trình mẫu: chúng không có dấu `=` và không có tiền tố `!`.
 */
export interface VarDecl {name:string;value:string}
export interface FuncDecl {name:string;description:string}
export interface Declarations {vars:VarDecl[];funcs:FuncDecl[]}

const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const RESERVED=new Set(['input','prev']);
const DECL=/(!?)\{\{([^{}]+?)\}\}/g;
export const MAX_DECLARATIONS=30;

/** Phân tích văn bản khai báo của một khung. Báo lỗi rõ khi tên sai, trùng hoặc dùng tên dành riêng. */
export function parseDeclarations(text:string):Declarations{
 const vars:VarDecl[]=[],funcs:FuncDecl[]=[],seen=new Set<string>();
 const claim=(name:string)=>{
  if(!IDENT.test(name))throw Error(`Tên “${name}” không hợp lệ: chỉ gồm chữ không dấu, số, gạch dưới và không bắt đầu bằng số (tối đa 40 ký tự).`);
  if(RESERVED.has(name))throw Error(`Tên “${name}” đã dành cho hệ thống.`);
  if(seen.has(name))throw Error(`Tên “${name}” bị khai báo hai lần trong cùng một khung.`);
  seen.add(name);
 };
 for(const m of text.matchAll(DECL)){
  const body=m[2]!.trim();
  if(m[1]==='!'){
   const colon=body.indexOf(':');
   const name=(colon<0?body:body.slice(0,colon)).trim(),description=colon<0?'':body.slice(colon+1).trim();
   claim(name);funcs.push({name,description:description.slice(0,500)});
  }else{
   const eq=body.indexOf('=');
   if(eq<0)continue; // {{prev}}, {{khóa}}: không phải khai báo
   const name=body.slice(0,eq).trim(),value=body.slice(eq+1).trim();
   if(!value)throw Error(`Biến “${name}” chưa có giá trị.`);
   claim(name);vars.push({name,value:value.slice(0,500)});
  }
 }
 if(vars.length+funcs.length>MAX_DECLARATIONS)throw Error(`Một khung khai báo tối đa ${MAX_DECLARATIONS} biến và hàm.`);
 return {vars,funcs};
}

/** Khối ràng buộc thêm vào lời nhắc của nút nằm trong khung có biến hoặc hàm: bắt buộc sinh mã. */
export function codeInstructions(decl:Declarations,opts:{language?:string;priorCode?:string}={}):string{
 const lines=[
  'BẮT BUỘC SINH MÃ: kết quả của bước này là mã chạy được, đặt trong MỘT khối ```ngôn-ngữ … ```.',
  opts.language?`Dùng đúng ngôn ngữ ${opts.language} (đã chốt cho cả khung, các hàm phải gọi được nhau).`:'Tự chọn MỘT ngôn ngữ phù hợp nhất (python, javascript hoặc bash) và dùng cho cả khung. Ghi tên ngôn ngữ ngay sau ba dấu huyền mở khối.',
  'Mã chỉ làm việc trong thư mục hiện tại, dùng đường dẫn tương đối; không xóa tệp, không gọi mạng nếu đề bài không yêu cầu.',
 ];
 if(decl.vars.length)lines.push('Khai báo đúng các biến sau ở đầu mã (đúng tên và giá trị):',...decl.vars.map(v=>`- ${v.name} = ${v.value}`));
 if(decl.funcs.length)lines.push('Định nghĩa các hàm (chương trình con) sau; bạn tự đặt tham số, kiểu trả về và thân hàm theo mô tả, rồi gọi chúng khi cần:',...decl.funcs.map(f=>`- ${f.name}${f.description?`: ${f.description}`:''}`));
 if(opts.priorCode?.trim())lines.push('Mã các bước trước trong khung (tham khảo chữ ký hàm; mã của bước này phải tự chạy được):','```',opts.priorCode.slice(0,6000),'```');
 return lines.join('\n');
}

/** Tên biến/hàm khai báo ở nhiều khung lồng nhau không được trùng (không che khuất ngầm). */
export function assertNoShadow(chain:{name:string;decl:Declarations}[]):void{
 const owner=new Map<string,string>();
 for(const f of chain)for(const n of [...f.decl.vars.map(v=>v.name),...f.decl.funcs.map(x=>x.name)]){
  const prev=owner.get(n);
  if(prev!==undefined)throw Error(`Tên “${n}” khai báo ở cả khung “${prev}” và khung “${f.name}”. Khung trong không được che khuất tên của khung ngoài.`);
  owner.set(n,f.name);
 }
}

/** Gộp khai báo của chuỗi khung (ngoài → trong). */
export function mergeDeclarations(chain:Declarations[]):Declarations{
 return {vars:chain.flatMap(d=>d.vars),funcs:chain.flatMap(d=>d.funcs)};
}
