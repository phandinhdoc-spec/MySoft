import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateWorksheet,worksheetChecks,generateVariants,graphValue,type Worksheet} from '../../../shared/src/math-workshop.js';
import {pythonJob} from './documents.js';

export async function mathWorkshopRpc(home:string,method:string,p:Record<string,unknown>){
 const dir=path.join(home,'math-workshop');
 if(method==='math.list'){
  let names:string[];try{names=await fs.readdir(dir);}catch(e:any){if(e.code==='ENOENT')return [];throw e;}
  const items:Worksheet[]=[];
  for(const name of names.filter(n=>/^[a-f0-9-]+\.json$/.test(n))){items.push(validateWorksheet(JSON.parse(await fs.readFile(path.join(dir,name),'utf8'))));}
  return items;
 }
 const w=validateWorksheet(p.worksheet);worksheetChecks(w);
 if(method==='math.save'){
  if(w.id&&!/^[a-f0-9-]{36}$/.test(w.id))throw Error('Mã học liệu không hợp lệ.');
  w.id ||= randomUUID();await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,w.id+'.json');
  try{const prior=validateWorksheet(JSON.parse(await fs.readFile(file,'utf8')));w.revision=Math.max(w.revision,prior.revision+1);}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(w),{flag:'wx'});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}return w;
 }
 if(method!=='math.export')throw Error('Thao tác Xưởng Toán không hợp lệ.');
 const output=typeof p.path==='string'?p.path:'';const ext=path.extname(output).toLowerCase();
 if(!path.isAbsolute(output)||!['.docx','.pptx','.xlsx','.svg'].includes(ext))throw Error('Chọn đường dẫn xuất Word, PowerPoint, Excel hoặc SVG.');
 const teacher=p.audience==='teacher';
 if(p.audience!=='teacher'&&p.audience!=='student')throw Error('Chọn bản học sinh hoặc giáo viên.');
 if(ext==='.svg'){
  const svg=typeof p.svg==='string'?p.svg:'';
  if(w.kind==='variants'||svg.length>500000||!svg.startsWith('<svg')||/<(?:script|foreignObject|image|use|a)\b|\bon\w+\s*=|href\s*=|url\(\s*(?!#)/i.test(svg))throw Error('Hình SVG không hợp lệ.');
  await fs.writeFile(output,svg,{flag:'wx'});return {path:output};
 }
 const variants=w.kind==='variants'?generateVariants(w.family,w.seed,w.count):[];
 const rows:wRow[]=[];
 if(w.kind==='graph')for(let i=0;i<=20;i++){const x=-w.graph.extent+2*w.graph.extent*i/20;rows.push([x,graphValue(w.graph,x)??'Không xác định']);}
 const spec={title:w.title,revision:w.revision,question:w.question,answer:teacher?w.answer:'',teacher,checks:worksheetChecks(w),variants:variants.map(v=>({question:v.question,...(teacher?{answer:v.answer,check:v.check}:{})})),rows,
  description:w.kind==='graph'?`Hàm ${w.graph.kind==='linear'?'y = ax + b':w.graph.kind==='quadratic'?'y = ax² + bx + c':'y = a/x'}: a=${w.graph.a}${w.graph.kind!=='reciprocal'?`, b=${w.graph.b}`:''}${w.graph.kind==='quadratic'?`, c=${w.graph.c}`:''}. Khoảng nhìn: ±${w.graph.extent}.`:w.kind==='geometry'?`Phép dựng: ${{altitude:'đường cao AH',median:'trung tuyến AM',parallel:'qua A song song với BC',circle:'đường tròn tâm A qua B'}[w.geometry.construction]}. Hình tĩnh; mô hình chỉnh sửa được lưu trong PVTA.`:`Mã bộ đề: ${w.seed}.`,
  png:w.kind!=='variants'&&ext!=='.xlsx'?p.png:undefined};
 if(w.kind==='geometry'&&ext==='.xlsx')throw Error('Hình học chưa có bảng Excel.');
 if(w.kind!=='variants'&&ext!=='.xlsx'&&(typeof spec.png!=='string'||spec.png.length>8_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(spec.png)))throw Error('Thiếu ảnh mô hình hợp lệ.');
 // Reserve destination exclusively; never overwrite an existing user file.
 const handle=await fs.open(output,'wx');await handle.close();
 try{await pythonJob({op:'math_export',output,document:spec});return {path:output};}catch(e){await fs.rm(output,{force:true});throw e;}
}
type wRow=(string|number)[];
