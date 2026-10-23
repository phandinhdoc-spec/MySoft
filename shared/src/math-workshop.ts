import {calc, Rat} from './calc';

export type AngleMode = 'deg' | 'rad';
export interface Calculation {expression:string; value:string; exact:boolean; fraction?:string; mode:AngleMode}
/** A bounded arithmetic grammar. Input is never evaluated as JavaScript. */
export function calculateMath(expression:string, mode:AngleMode='deg'):Calculation {
  const src=expression.toLowerCase().replace(/π/g,'pi').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
  if(!src.trim()||src.length>500)throw Error('Nhập biểu thức tối đa 500 ký tự.');
  const names=src.replace(/\d(?:\.\d*)?e[+-]?\d+/g,'0').match(/[a-z_]+/g)??[];
  if(names.some(n=>!['sqrt','abs','sin','cos','tan','ln','log','pi','e'].includes(n)))throw Error('Chỉ hỗ trợ sqrt, abs, sin, cos, tan, ln, log, pi và e.');
  // Rational arithmetic remains exact; radicals are conservatively labelled approximate.
  if(!/\b(sin|cos|tan|ln|log|pi|e)\b/i.test(src)){
    const r=calc(src);return {expression,value:r.value,exact:!src.includes('sqrt')&&(r.exact||!!r.fraction),fraction:src.includes('sqrt')?undefined:r.fraction,mode};
  }
  const tokens=src.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-z]+|[^\s]/gi)??[];
  let i=0,depth=0;
  const finite=(v:number)=>{if(!Number.isFinite(v))throw Error('Kết quả không xác định hoặc vượt giới hạn.');return v;};
  const atom=():number=>{
    if(++depth>40)throw Error('Biểu thức lồng quá sâu.');
    const t=tokens[i++];let v:number;
    if(t==='('){v=expr();if(tokens[i++]!==')')throw Error('Thiếu dấu đóng ngoặc.');}
    else if(t==='pi')v=Math.PI;
    else if(t==='e')v=Math.E;
    else if(t&&/^(?:\d|\.)/.test(t))v=Number(t);
    else if(t&&['sin','cos','tan','sqrt','abs','ln','log'].includes(t)){
      if(tokens[i++]!=='(')throw Error('Hàm cần dấu ngoặc.');const a=expr();if(tokens[i++]!==')')throw Error('Thiếu dấu đóng ngoặc.');
      const angle=mode==='deg'?a*Math.PI/180:a;
      if(t==='tan'&&Math.abs(Math.cos(angle))<1e-12)throw Error('tan không xác định tại góc này.');
      v=t==='sin'?Math.sin(angle):t==='cos'?Math.cos(angle):t==='tan'?Math.tan(angle):t==='sqrt'?Math.sqrt(a):t==='abs'?Math.abs(a):t==='ln'?Math.log(a):Math.log10(a);
    }else throw Error(`Không hỗ trợ ký hiệu ${t??'(thiếu)'}.`);
    depth--;while(tokens[i]==='%'){i++;v/=100;}return finite(v);
  };
  const power=():number=>{const a=atom();if(tokens[i]==='^'){i++;const b=unary();if(Math.abs(b)>200)throw Error('Số mũ quá lớn.');return finite(a**b);}return a;};
  const unary=():number=>{if(tokens[i]==='-'){i++;return -unary();}if(tokens[i]==='+'){i++;return unary();}return power();};
  const term=():number=>{let a=unary();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],b=unary();a=finite(op==='*'?a*b:a/b);}return a;};
  const expr=():number=>{let a=term();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],b=term();a=finite(op==='+'?a+b:a-b);}return a;};
  const value=expr();if(i!==tokens.length)throw Error('Thiếu toán tử hoặc có ký hiệu không hỗ trợ.');
  return {expression,value:Number(value.toPrecision(12)).toString(),exact:false,mode};
}

export type GraphKind='linear'|'quadratic'|'reciprocal';
export interface GraphModel {kind:GraphKind;a:number;b:number;c:number;extent:number}
export interface Point {x:number;y:number}
export interface GeometryModel {a:Point;b:Point;c:Point;construction:'altitude'|'median'|'parallel'|'circle';labels:boolean}
export interface Worksheet {schema:1;id:string;title:string;revision:number;kind:'graph'|'geometry'|'variants';graph:GraphModel;geometry:GeometryModel;family:'linear'|'fraction'|'graph';seed:number;count:number;question:string;answer:string}
export const defaultWorksheet=():Worksheet=>({schema:1,id:'',title:'Khám phá Toán',revision:1,kind:'graph',graph:{kind:'quadratic',a:1,b:0,c:0,extent:10},geometry:{a:{x:0,y:5},b:{x:-4,y:-2},c:{x:4,y:-2},construction:'altitude',labels:true},family:'linear',seed:1,count:6,question:'Dự đoán trước khi thay đổi. Điều gì thay đổi, điều gì được giữ nguyên? Giải thích.',answer:''});
export function validateWorksheet(v:unknown):Worksheet {
  const w=v as Worksheet;
  if(!w||w.schema!==1||!['graph','geometry','variants'].includes(w.kind)||typeof w.title!=='string'||w.title.length>200||typeof w.id!=='string'||!Number.isInteger(w.revision)||w.revision<1)throw Error('Học liệu không hợp lệ.');
  for(const t of [w.question,w.answer])if(typeof t!=='string'||t.length>20000)throw Error('Nội dung quá dài.');
  const g=w.graph;if(!g||!['linear','quadratic','reciprocal'].includes(g.kind)||![g.a,g.b,g.c,g.extent].every(Number.isFinite)||g.extent<1||g.extent>100||[g.a,g.b,g.c].some(x=>Math.abs(x)>100))throw Error('Thông số đồ thị không hợp lệ.');
  const h=w.geometry;if(!h||!['altitude','median','parallel','circle'].includes(h.construction)||typeof h.labels!=='boolean'||![h.a,h.b,h.c].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=10&&Math.abs(p.y)<=10))throw Error('Điểm nằm ngoài miền dựng hình.');
  if(!['linear','fraction','graph'].includes(w.family)||!Number.isInteger(w.seed)||w.seed<1||w.seed>1000000||!Number.isInteger(w.count)||w.count<1||w.count>30)throw Error('Cấu hình biến thể không hợp lệ.');
  return structuredClone(w);
}
export function graphValue(g:GraphModel,x:number):number|null {
  if(g.a===0)throw Error('Hệ số a phải khác 0 cho họ hàm đã chọn.');
  if(g.kind==='reciprocal'&&x===0)return null;
  return g.kind==='linear'?g.a*x+g.b:g.kind==='quadratic'?g.a*x*x+g.b*x+g.c:g.a/x;
}
export function graphSegments(g:GraphModel):Point[][] {
  const segments:Point[][]=[];let current:Point[]=[];
  for(let i=0;i<=600;i++){
    const x=-g.extent+2*g.extent*i/600,y=graphValue(g,x);
    if(y===null||!Number.isFinite(y)||Math.abs(y)>g.extent*2){if(current.length)segments.push(current);current=[];continue;}
    current.push({x,y});
  }
  if(current.length)segments.push(current);return segments;
}
export function geometryDerived(g:GeometryModel):{h:Point;m:Point} {
  const dx=g.c.x-g.b.x,dy=g.c.y-g.b.y,l=dx*dx+dy*dy;
  const cross=(g.a.x-g.b.x)*dy-(g.a.y-g.b.y)*dx;
  if(l<1e-10||Math.abs(cross)<1e-7)throw Error('Tam giác suy biến: cần ba điểm phân biệt, không thẳng hàng.');
  const t=((g.a.x-g.b.x)*dx+(g.a.y-g.b.y)*dy)/l;
  return {h:{x:g.b.x+t*dx,y:g.b.y+t*dy},m:{x:(g.b.x+g.c.x)/2,y:(g.b.y+g.c.y)/2}};
}
export interface Variant {question:string;answer:string;check:string}
export function generateVariants(family:Worksheet['family'],seed:number,count:number):Variant[] {
  if(!Number.isInteger(seed)||seed<1||seed>1000000||!Number.isInteger(count)||count<1||count>30)throw Error('Chọn mã bộ đề từ 1–1000000 và số bài từ 1–30.');
  let state=seed>>>0;const next=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state;};
  const out:Variant[]=[],seen=new Set<string>();
  for(let tries=0;out.length<count&&tries<3000;tries++){
    const a=next()%19+1,b=next()%31-15,x=next()%21-10;
    let v:Variant;
    if(family==='linear'){
      const rhs=a*x+b;
      const solved=new Rat(BigInt(rhs)).sub(new Rat(BigInt(b))).div(new Rat(BigInt(a)));
      if(solved.cmp(new Rat(BigInt(x)))!==0)throw Error('Kiểm tra nghiệm thất bại.');
      v={question:`Giải phương trình ${a}x + (${b}) = ${rhs}.`,answer:`x = ${x}`,check:'Đã thế nghiệm; hệ số khác 0 nên nghiệm duy nhất.'};
    }else if(family==='fraction'){
      const n=next()%19+1,m=next()%19+1,d=next()%12+2,r=new Rat(BigInt(n+m),BigInt(d));
      if(r.mul(new Rat(BigInt(d))).cmp(new Rat(BigInt(n+m)))!==0)throw Error('Kiểm tra phân số thất bại.');
      v={question:`Tính ${n}/${d} + ${m}/${d}.`,answer:r.d===1n?`${r.n}`:`${r.n}/${r.d}`,check:'Đã đối chiếu bằng phân số chính xác; mẫu khác 0.'};
    }else v={question:`Với y = ${a}x + (${b}), tìm y tại x = ${x}.`,answer:`y = ${a*x+b}`,check:'Đã thay hoành độ vào biểu thức bậc nhất.'};
    if(!seen.has(v.question)){seen.add(v.question);out.push(v);}
  }
  if(out.length<count)throw Error(`Chỉ tạo được ${out.length} bài khác nhau. Hãy đổi mã bộ đề.`);return out;
}
export function worksheetChecks(w:Worksheet):string[] {
  validateWorksheet(w);
  if(w.kind==='graph'){graphSegments(w.graph);return ['Đã kiểm tra hệ số và miền xác định; đồ thị là biểu diễn số.',...(w.graph.kind==='reciprocal'?['Miền xác định: x khác 0.']:[])];}
  if(w.kind==='geometry'){geometryDerived(w.geometry);return ['Đã kiểm tra hình không suy biến; quan hệ dựng bằng tọa độ, không thay thế chứng minh.'];}
  generateVariants(w.family,w.seed,w.count);return ['Đáp án mẫu được kiểm tra bằng bộ tính; lời giải tự nhập cần giáo viên duyệt.'];
}
