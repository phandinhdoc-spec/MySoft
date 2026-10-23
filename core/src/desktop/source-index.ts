import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {SUPPORTED} from './documents.js';

/**
 * Chỉ mục nguồn của Brain cho tài liệu (không phải mã):
 * 1. Cây thư mục: khi thêm thư mục, gọi ngầm `tree` (hoặc `find`, `dir /s /b`, cuối cùng là duyệt bằng Node)
 *    để liệt kê MỌI tệp, kể cả tệp chưa được đọc nội dung. Chỉ lưu đường dẫn tương đối.
 * 2. Dàn ý tệp: khi thêm tệp, quét nhanh nội dung đã trích và ghi một tệp Markdown tóm tắt (không gọi AI,
 *    không hiện cho người dùng). Tệp nằm trong thư mục dữ liệu của PVTA, không ghi vào thư mục của thầy cô.
 */
export interface TreeIndex{root:string;at:number;method:'tree'|'find'|'dir'|'walk';entries:string[];truncated:boolean}

export const MAX_TREE_ENTRIES=50_000;
const MAX_DEPTH=8;
const IGNORED=['node_modules','target','dist','build','__pycache__','.git','.svn','.DS_Store'];

/** Bỏ dấu tiếng Việt, hạ chữ thường: dùng để so khớp tên tệp không phân biệt dấu. */
export function fold(s:string):string{return s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();}
const tokens=(q:string)=>[...new Set(fold(q).split(/[^a-z0-9]+/).filter(t=>t.length>=2))];
/** Điểm khớp từ khóa với đường dẫn (tên tệp quan trọng hơn thư mục). */
export function pathScore(rel:string,query:string):number{
 const ts=tokens(query);if(!ts.length)return 0;
 const full=fold(rel),base=fold(path.basename(rel));let s=0;
 for(const t of ts){if(base.includes(t))s+=3;else if(full.includes(t))s+=1;}
 return s;
}

/** Đường dẫn tương đối hợp lệ nằm trong root, không chứa phần ẩn/bị bỏ qua; trả '' nếu cần loại. */
function clean(root:string,raw:string):string{
 let p=raw.replace(/\r$/,'');if(!p)return '';
 if(path.isAbsolute(p))p=path.relative(root,p);
 p=p.split(path.sep).join('/').replace(/^\.\//,'');
 if(!p||p==='.'||p.startsWith('../')||p.includes('/../')||path.isAbsolute(p))return '';
 const parts=p.split('/');
 if(parts.length>MAX_DEPTH+1)return '';
 if(parts.some(s=>!s||s.startsWith('.')||IGNORED.includes(s)))return '';
 return p;
}

function run(cmd:string,args:string[],cwd:string,signal?:AbortSignal):Promise<string>{
 return new Promise((resolve,reject)=>execFile(cmd,args,{cwd,signal,timeout:30_000,maxBuffer:64*1024*1024,windowsHide:true,encoding:'utf8'},(e,out)=>e?reject(e):resolve(String(out))));
}

async function walk(root:string):Promise<string[]>{
 const out:string[]=[];
 async function visit(dir:string,depth:number){
  if(out.length>=MAX_TREE_ENTRIES||depth>MAX_DEPTH)return;
  let list:fs.Dirent[];try{list=await fsp.readdir(dir,{withFileTypes:true});}catch{return;}
  for(const e of list){
   if(e.name.startsWith('.')||IGNORED.includes(e.name)||e.isSymbolicLink())continue;
   const full=path.join(dir,e.name);
   if(e.isDirectory())await visit(full,depth+1);else if(e.isFile()){out.push(path.relative(root,full));if(out.length>=MAX_TREE_ENTRIES)return;}
  }
 }
 await visit(root,0);return out;
}

/**
 * Liệt kê tệp của một thư mục bằng lệnh hệ thống (chạy ngầm, chỉ đọc, không qua shell).
 * `tree -a -f -i` in mỗi dòng một đường dẫn đầy đủ; các lệnh dự phòng cho máy không có `tree`.
 */
export async function listTree(root:string,signal?:AbortSignal):Promise<TreeIndex>{
 const real=await fsp.realpath(root);
 if(!(await fsp.stat(real)).isDirectory())throw Error('Cần chọn thư mục.');
 const attempts:{method:TreeIndex['method'];cmd:string;args:string[]}[]=process.platform==='win32'
  ?[{method:'dir',cmd:'cmd.exe',args:['/d','/c','dir','/s','/b','/a-d']}]
  :[{method:'tree',cmd:'tree',args:['-a','-f','-i','--noreport','-n','-N','-L',String(MAX_DEPTH),'-I',IGNORED.filter(x=>!x.startsWith('.')).join('|')]},
    {method:'find',cmd:'find',args:['.','-maxdepth',String(MAX_DEPTH),'-type','f']}];
 let lines:string[]|undefined,method:TreeIndex['method']='walk';
 for(const a of attempts){
  try{const text=await run(a.cmd,a.args,real,signal);lines=text.split('\n');method=a.method;break;}
  catch(e){if(signal?.aborted)throw signal.reason??e;}
 }
 if(!lines){lines=await walk(real);method='walk';}
 const set=new Set<string>();let truncated=false;
 for(const l of lines){
  const rel=clean(real,l);if(!rel)continue;
  // Lệnh `tree` in cả thư mục: chỉ giữ tệp. Thư mục là tiền tố của một mục khác nên sẽ bị lọc ở bước dưới.
  set.add(rel);if(set.size>=MAX_TREE_ENTRIES){truncated=true;break;}
 }
 const all=[...set].sort((a,b)=>a.localeCompare(b,'vi'));
 const dirs=new Set<string>();for(const p of all){const parts=p.split('/');for(let i=1;i<parts.length;i++)dirs.add(parts.slice(0,i).join('/'));}
 const entries=all.filter(p=>!dirs.has(p));
 return {root:real,at:Date.now(),method,entries,truncated};
}

const keyOf=(root:string)=>crypto.createHash('sha256').update(root).digest('hex').slice(0,24);
const treeFile=(home:string,root:string)=>path.join(home,'source-index',keyOf(root)+'.json');
export function readTree(home:string,root:string):TreeIndex|undefined{
 try{const d=JSON.parse(fs.readFileSync(treeFile(home,root),'utf8'));return d&&d.root===root&&Array.isArray(d.entries)?d:undefined;}catch{return undefined;}
}
export async function saveTree(home:string,t:TreeIndex):Promise<void>{
 const f=treeFile(home,t.root);await fsp.mkdir(path.dirname(f),{recursive:true,mode:0o700});
 const tmp=f+'.'+process.pid+'.tmp';await fsp.writeFile(tmp,JSON.stringify(t),{mode:0o600});await fsp.rename(tmp,f);
}

/** Tệp tài liệu PVTA đọc được (cùng danh sách với lúc thêm thư mục). */
export const readable=(rel:string)=>SUPPORTED.has(path.extname(rel).toLowerCase());

/** Văn bản dạng cây thụt lề từ danh sách đường dẫn, giới hạn số dòng. `under` chỉ lấy một thư mục con. */
export function treeText(entries:string[],o:{under?:string;depth?:number;maxLines?:number}={}):string{
 const under=(o.under??'').replace(/^\/+|\/+$/g,'');
 const depth=Math.max(1,Math.min(o.depth??3,MAX_DEPTH));const max=o.maxLines??200;
 const prefix=under?under+'/':'';
 const counts=new Map<string,number>();const files:string[]=[];
 for(const e of entries){
  if(prefix&&!e.startsWith(prefix))continue;
  const parts=e.slice(prefix.length).split('/');
  if(parts.length<=depth&&parts.length===1)files.push(parts[0]!);
  for(let i=1;i<parts.length&&i<=depth;i++){const k=parts.slice(0,i).join('/');counts.set(k,(counts.get(k)??0)+1);}
 }
 const lines:string[]=[];
 const dirs=[...counts.keys()].sort((a,b)=>a.localeCompare(b,'vi'));
 for(const d of dirs){
  const lvl=d.split('/').length;lines.push('  '.repeat(lvl-1)+path.basename(d)+'/ ('+counts.get(d)+')');
 }
 for(const f of files)lines.push(f);
 const head=`${prefix||'./'} — ${entries.filter(e=>!prefix||e.startsWith(prefix)).length} tệp`;
 return [head,...lines.slice(0,max),...(lines.length>max?[`… còn ${lines.length-max} dòng, dùng tham số "in" để xem thư mục con`]:[])].join('\n');
}

/** Tóm tắt rất gọn của cây (thư mục cấp 1 kèm số tệp, phân bố đuôi tệp) để nạp sẵn vào lời nhắc. */
export function treeDigest(t:TreeIndex,maxChars=1800):string{
 const top=new Map<string,number>();const ext=new Map<string,number>();
 for(const e of t.entries){const i=e.indexOf('/');const k=i<0?'(gốc)':e.slice(0,i)+'/';top.set(k,(top.get(k)??0)+1);const x=path.extname(e).toLowerCase()||'(không đuôi)';ext.set(x,(ext.get(x)??0)+1);}
 const dirs=[...top].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,n])=>`${k} ${n}`).join(' · ');
 const exts=[...ext].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>`${k} ${n}`).join(' · ');
 return `CÂY THƯ MỤC ${JSON.stringify(t.root)} (lệnh ${t.method}, ${t.entries.length} tệp${t.truncated?', đã cắt bớt':''}): ${dirs}. Đuôi tệp: ${exts}.`.slice(0,maxChars);
}

// ───────── Dàn ý Markdown của từng tệp ─────────
export interface OutlineInput{id:string;name:string;path:string;fingerprint:string;bytes?:number;image?:boolean;segments:{ref:string;text:string;section?:string}[]}
const outDir=(home:string)=>path.join(home,'source-outlines');
const outFile=(home:string,id:string)=>path.join(outDir(home),id.replace(/[^A-Za-z0-9_-]/g,'_')+'.md');
const oneLine=(s:string,n:number)=>s.replace(/\s+/g,' ').trim().slice(0,n);

/** Dựng nội dung Markdown dàn ý từ phần văn bản đã trích: đề mục, tên slide/sheet/trang và vài dòng đầu. Không gọi AI. */
export function buildOutline(a:OutlineInput):string{
 const heads:string[]=[];const seen=new Set<string>();
 const add=(h:string)=>{const v=oneLine(h,120);if(v&&!seen.has(v)&&heads.length<40){seen.add(v);heads.push(v);}};
 for(const s of a.segments){
  if(s.section)add(s.section);
  for(const line of s.text.split('\n').slice(0,30)){const m=/^\s{0,3}#{1,4}\s+(.+)$/.exec(line);if(m)add(m[1]!);}
 }
 if(heads.length<3)for(const s of a.segments){if(heads.length>=40)break;if(/^(Slide|Sheet|Trang|Page)/i.test(s.ref))add(`${s.ref}: ${oneLine(s.text,80)}`);}
 const head=oneLine(a.segments.map(s=>s.text).join(' '),500);
 const size=a.bytes?` · ${a.bytes<1024?a.bytes+' B':a.bytes<1048576?Math.round(a.bytes/1024)+' KB':(a.bytes/1048576).toFixed(1)+' MB'}`:'';
 return [
  `<!-- fingerprint:${a.fingerprint} -->`,
  `# ${oneLine(a.name,160)}`,
  `- Đường dẫn: ${a.path}`,
  `- Loại: ${path.extname(a.name).slice(1)||'không đuôi'}${size} · ${a.segments.length} đoạn`,
  '',
  '## Dàn ý',
  ...(a.image?['- (ảnh, không có văn bản)']:heads.length?heads.map(h=>'- '+h):['- (không có đề mục rõ ràng)']),
  '',
  '## Đoạn đầu',
  head||'(trống)',
  ''
 ].join('\n');
}
/** Ghi dàn ý ngầm; lỗi ghi không được làm hỏng việc thêm tệp. */
export function writeOutline(home:string,a:OutlineInput):void{
 try{fs.mkdirSync(outDir(home),{recursive:true,mode:0o700});fs.writeFileSync(outFile(home,a.id),buildOutline(a),{mode:0o600});}catch{/* dàn ý chỉ là chỉ mục phụ */}
}
/** Đọc dàn ý còn khớp dấu vân tay; cũ hoặc chưa có thì dựng lại từ phần đã trích. */
export function ensureOutline(home:string,a:OutlineInput):string{
 try{const t=fs.readFileSync(outFile(home,a.id),'utf8');if(t.startsWith(`<!-- fingerprint:${a.fingerprint} -->`))return t;}catch{/* dựng lại */}
 writeOutline(home,a);
 try{return fs.readFileSync(outFile(home,a.id),'utf8');}catch{return buildOutline(a);}
}
export function removeOutline(home:string,id:string):void{try{fs.rmSync(outFile(home,id),{force:true});}catch{/* bỏ qua */}}
/** Một dòng rút gọn từ dàn ý, đưa cho AI chọn tài liệu. */
export function outlineBrief(md:string,n=240):string{
 const m=/## Dàn ý\n([\s\S]*?)\n\n## Đoạn đầu\n([\s\S]*)$/.exec(md);
 if(!m)return oneLine(md,n);
 const heads=m[1]!.split('\n').map(x=>x.replace(/^- /,'')).filter(x=>x&&!x.startsWith('('));
 return oneLine(heads.length?heads.slice(0,8).join(' › '):m[2]!,n);
}
