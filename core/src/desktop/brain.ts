import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

/**
 * Cầu nối tới CLI native `pvta-brain` (một lần chạy rồi thoát; không daemon, không watcher).
 *
 * Hai phạm vi:
 * - Dự án: một thư mục được cấp quyền rõ ràng → Brain duyệt cả thư mục (tôn trọng .gitignore).
 * - Tệp lẻ: chỉ các tệp được đính kèm → Brain chỉ đọc đúng các tệp đó (`PVTA_BRAIN_ONLY`),
 *   không duyệt và không đọc tệp lân cận. Không bao giờ suy ra quyền đọc thư mục từ một tệp.
 *
 * Hai tầng hiểu:
 * - Tầng 1 `overview`: toàn dự án (vùng mã, ký hiệu chính, điểm vào, tệp trung tâm theo số lần import).
 * - Tầng 2 `outline`: toàn một tệp (cây ký hiệu có dòng đầu–cuối, import, tệp import tới nó).
 *
 * Chỉ mục bền, tăng dần, nằm trong thư mục cache của hệ điều hành (không ghi vào dự án);
 * lần gọi sau chỉ phân tích lại tệp đã đổi.
 */
export interface BrainScope{root:string;files?:string[];label?:string;indexPath?:string;sources?:BrainSource[]}
export interface BrainSource extends Omit<BrainScope,'sources'>{id:string}

const MAX_SCOPE_FILES=200;
/** Định dạng nhị phân/Office: Brain không phân tích, không đưa vào phạm vi tệp. */
const BINARY=/\.(png|jpe?g|gif|webp|bmp|heic|tiff?|ico|icns|svgz|pdf|docx?|xlsx?|pptx?|odt|ods|odp|zip|gz|tgz|7z|rar|dmg|exe|dll|so|dylib|wasm|mp3|mp4|m4a|wav|mov|avi|mkv|ttf|otf|woff2?|sqlite|db)$/i;

export function brainBinary():string|undefined {
 const name=process.platform==='win32'?'pvta-brain.exe':'pvta-brain';
 const installed=[process.env.PVTA_BRAIN,path.join(path.dirname(process.execPath),name)].find((p):p is string=>!!p&&fs.existsSync(p));
 if(installed)return installed;
 // build:sidecar builds with --target, while cargo build uses target/release.
 // Both are valid dev candidates: prefer the most recently built native executable.
 const arch=process.arch==='arm64'?'aarch64':process.arch==='x64'?'x86_64':undefined;
 const os=process.platform==='darwin'?'apple-darwin':process.platform==='win32'?'pc-windows-msvc':process.platform==='linux'?'unknown-linux-gnu':undefined;
 const triple=arch&&os?`${arch}-${os}`:undefined;
 const roots=[process.cwd(),path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..')];
 const candidates=roots.flatMap(root=>{
  const target=process.env.CARGO_TARGET_DIR?path.resolve(process.env.CARGO_TARGET_DIR):path.join(root,'brain/target');
  return [path.join(target,'release',name),...(triple?[path.join(target,triple,'release',name),path.join(root,'chatbox/src-tauri/binaries',`pvta-brain-${triple}${process.platform==='win32'?'.exe':''}`)]:[])];
 });
 return [...new Set(candidates)].filter(p=>fs.existsSync(p)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
}

/** One invocation owns this descriptor; no global CLI config or scope is changed. */
export async function prepareBrainMcp(home:string,scope:BrainScope,signal:AbortSignal){
 const binary=brainBinary();if(!binary)throw Error('Brain CLI chưa được cài.');
 const capabilities=await runBrain(binary,{root:scope.root},['capabilities'],signal);
 let supported=false;try{const caps=JSON.parse(capabilities);supported=caps.mcp===true&&(!scope.sources||caps.projectScopes===true);}catch{/* old CLI prints help */}
 if(!supported)throw Error('CLI Brain chưa hỗ trợ công cụ MCP. Hãy dựng/cập nhật PVTA để dùng Brain trong Codex.');
 signal.throwIfAborted();
 const parent=path.join(home,'workspace','brain-mcp');
 await fs.promises.mkdir(parent,{recursive:true,mode:0o700});
 const dir=await fs.promises.mkdtemp(path.join(parent,'session-'));
 const dispose=()=>fs.promises.rm(dir,{recursive:true,force:true});
 try{
  const file=path.join(dir,'scope.json');
  await fs.promises.writeFile(file,JSON.stringify(scope),{mode:0o600});
  signal.throwIfAborted();
  return {config:{command:binary,args:['mcp',file]},dispose};
 }catch(error){await dispose();throw error;}
}

const asScope=(s:BrainScope|string):BrainScope=>typeof s==='string'?{root:s}:s;

export async function runBrain(binary:string,scope:BrainScope|string,args:string[],signal?:AbortSignal,maxBuffer=4*1024*1024):Promise<string>{
 const s=asScope(scope);
 if(s.sources){
  if(args[0]!=='overview')throw Error('Brain nhiều nguồn: chọn scope bằng brain_read/brain_find.');
  const overviews=await Promise.all(s.sources.map(async source=>`[${source.id}] ${source.label??source.root}\n${await runBrain(binary,source,args,signal,maxBuffer)}`));
  return 'TẦNG 1 · BRAIN RIÊNG CỦA DỰ ÁN\n'+overviews.join('\n');
 }
 const env:NodeJS.ProcessEnv={...process.env};
 // Không kế thừa phạm vi/chỉ mục từ môi trường cha: phạm vi chỉ do PVTA quyết định.
 delete env.PVTA_BRAIN_ONLY;delete env.PVTA_BRAIN_INDEX;
 if(s.indexPath)env.PVTA_BRAIN_INDEX=s.indexPath;
 if(s.files?.length)env.PVTA_BRAIN_ONLY=s.files.join('\n');
 return new Promise<string>((resolve,reject)=>execFile(binary,args,{cwd:s.root,signal,env,timeout:60_000,maxBuffer,windowsHide:true},(error,stdout,stderr)=>error?reject(new Error(String(stderr).trim()||error.message)):resolve(String(stdout).trim())));
}

const canonical=(p:string)=>{try{return fs.realpathSync(p);}catch{return path.resolve(p);}};
const contains=(a:string,b:string)=>{const rel=path.relative(a,b);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};

/** Only explicitly selected folders; never infer permission to siblings from one attached file. */
export function brainProjectRoot(folders:string[],learningFolders:string[]):string|undefined {
 const excluded=learningFolders.map(canonical);
 return folders.filter(path.isAbsolute).map(canonical).find(p=>{
  try{return fs.statSync(p).isDirectory()&&!excluded.some(x=>contains(x,p)||contains(p,x));}catch{return false;}
 });
}

/** Thư mục chung sâu nhất của các tệp (tuyệt đối, đã chuẩn hóa). */
function commonDir(files:string[]):string|undefined{
 let base=path.dirname(files[0]!);
 for(const f of files.slice(1))while(!contains(base,f)){const up=path.dirname(base);if(up===base)return undefined;base=up;}
 return base;
}

/**
 * Phạm vi Brain cho một phiên: ưu tiên thư mục được cấp quyền (tầng dự án);
 * nếu không có, dùng đúng các tệp văn bản/mã được đính kèm (chế độ tệp lẻ).
 */
export function brainScope(folders:string[],learningFolders:string[],files:string[]=[]):BrainScope|undefined{
 const root=brainProjectRoot(folders,learningFolders);
 if(root)return {root};
 const excluded=learningFolders.map(canonical);
 const picked=[...new Set(files.filter(f=>path.isAbsolute(f)&&!BINARY.test(f)).map(canonical))].filter(f=>{
  try{return fs.statSync(f).isFile()&&!excluded.some(x=>contains(x,f));}catch{return false;}
 }).sort().slice(0,MAX_SCOPE_FILES);
 if(!picked.length)return undefined;
 const base=commonDir(picked);if(!base)return undefined;
 const rel=picked.map(f=>path.relative(base,f).split(path.sep).join('/')).filter(r=>r&&!r.startsWith('../')&&!path.isAbsolute(r));
 return rel.length?{root:base,files:rel}:undefined;
}

const OK_PREFIX='\nBRAIN cung cấp công cụ';
const OVERVIEW_CHARS=6000;

/** Lập/cập nhật chỉ mục và nạp sẵn TẦNG 1 vào lời nhắc, để AI hiểu toàn dự án (hoặc các tệp) ngay từ đầu. */
export async function brainContext(scope:BrainScope|string|undefined,signal?:AbortSignal,digest='',o:{tools?:boolean}={}):Promise<string>{
 if(!scope)return '';
 const s=asScope(scope);
 const binary=brainBinary();
 if(!binary)return '\nBRAIN: CLI chưa được cài; không tuyên bố đã lập chỉ mục hoặc đã tra Brain.';
 try {
  const overview=(await runBrain(binary,s,['overview','--text'],signal)).slice(0,OVERVIEW_CHARS);
  // CLI cũ (trước khi có hai tầng) chỉ in trợ giúp: không được coi là đã lập chỉ mục.
  if(!/^(TẦNG 1|BRAIN · PHẠM VI TỆP)/.test(overview))return '\nBRAIN: CLI Brain đã cũ (chưa có tầng 1/tầng 2); cần dựng lại ứng dụng. Không tuyên bố đã tra Brain.';
  const mode=s.label?s.label:s.files?.length
   ?`PHẠM VI TỆP: chỉ ${s.files.length} tệp được đính kèm (gốc ${JSON.stringify(s.root)}); Brain không đọc tệp khác, kể cả tệp cùng thư mục.`
   :`PHẠM VI DỰ ÁN: thư mục ${JSON.stringify(s.root)}.`;
  const sources=s.sources?`\nNGUỒN RIÊNG CỦA DỰ ÁN (dữ liệu): ${JSON.stringify(s.sources.map(({id,root,label,files})=>({scope:id,root,label,fileCount:files?.length})))}\nbrain_find/brain_refs/brain_overview mặc định tra mọi nguồn trên; thêm args.scope để chọn một nguồn. brain_read/brain_outline bắt buộc args.scope và file tương đối trong nguồn đó. Không suy ra quyền đọc thư mục cha hoặc dự án khác.\n`:'';
  if(o.tools===false)return `${OK_PREFIX} đã lập chỉ mục (chỉ đọc). ${mode}
Lượt này không có công cụ gọi Brain: chỉ dùng TẦNG 1 nạp sẵn dưới đây để định hướng.
${overview}`+sources+digest;
  return `${OK_PREFIX} tra cứu chỉ đọc (không cấp quyền ghi hay chạy lệnh), chỉ mục tăng dần nằm ngoài dự án. ${mode}
Công cụ qua pvta-read:
- brain_overview args {} — TẦNG 1: hiểu toàn dự án (vùng mã, ký hiệu chính, điểm vào, tệp trung tâm). Bản đã nạp sẵn ở dưới.
- brain_outline args {file} — TẦNG 2: hiểu toàn một tệp (cây ký hiệu có dòng đầu–cuối, import, tệp import tới nó).
- brain_find args {query, limit?} — tìm xếp hạng: tên ký hiệu (chính xác, tiền tố, camelCase, gần đúng) + nội dung (BM25), không phân biệt dấu tiếng Việt; lọc bằng in:<thư mục> kind:<loại> lang:<ngôn ngữ>.
- brain_refs args {name} — ứng viên tham chiếu theo từ (định nghĩa, import, dùng); phải đọc nguồn trước khi khẳng định.
- brain_read args {file,start,end} (tối đa 500 dòng) hoặc {file,symbol} (trọn thân ký hiệu); trả SHA-256 toàn tệp.
Đường dẫn file là đường dẫn tương đối theo gốc ở trên, dấu /. Dòng là số thật từ chỉ mục; không đoán phạm vi.
${overview}`+sources+digest;
 } catch(error){if(signal?.aborted)throw signal.reason??error;return '\nBRAIN chưa lập được chỉ mục: '+String(error).slice(0,1200)+'. Báo rõ giới hạn trước khi dùng cách tra cứu khác.';}
}
/** true khi khối Brain đã lập chỉ mục được (không phải thông báo thiếu CLI hoặc lỗi). */
export function brainAvailable(prompt:string):boolean{return prompt.startsWith(OK_PREFIX);}

export const BRAIN_TOOLS=['brain_overview','brain_outline','brain_find','brain_refs','brain_read'] as const;
export function isBrainTool(tool:string):boolean{return (BRAIN_TOOLS as readonly string[]).includes(tool);}

const parse=(s:string)=>{try{return JSON.parse(s);}catch{return s;}};

export async function brainRead(scope:BrainScope|string,tool:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<unknown>{
 const scoped=asScope(scope);
 if(scoped.sources){
  if(args.scope!==undefined){
   const selected=scoped.sources.find(s=>s.id===args.scope);if(!selected)throw Error('Nguồn Brain không thuộc dự án này.');
   return brainRead(selected,tool,args,signal);
  }
  if(tool==='brain_read'||tool==='brain_outline')throw Error('Chọn args.scope từ brain_overview để đọc đúng nguồn.');
  return Promise.all(scoped.sources.map(async source=>({scope:source.id,result:await brainRead(source,tool,args,signal)})));
 }
 const binary=brainBinary();if(!binary)throw Error('Brain CLI chưa được cài.');
 const str=(key:string)=>{const v=args[key];if(typeof v!=='string'||!v||v.length>1000)throw Error('Brain: tham số không hợp lệ '+key);return v;};
 if(tool==='brain_overview')return runBrain(binary,scope,['overview','--text'],signal);
 if(tool==='brain_outline')return runBrain(binary,scope,['outline',str('file'),'--text'],signal);
 if(tool==='brain_find'){
  const limit=Number.isInteger(args.limit)&&(args.limit as number)>=1&&(args.limit as number)<=50?String(args.limit):'20';
  return parse(await runBrain(binary,scope,['find',str('query'),'--limit',limit],signal));
 }
 if(tool==='brain_refs'){const r=parse(await runBrain(binary,scope,['refs',str('name')],signal));return typeof r==='object'&&r?{kind:'lexical-candidates',...r}:{kind:'lexical-candidates',output:r};}
 if(tool==='brain_read'){
  if(typeof args.symbol==='string'&&args.symbol)return parse(await runBrain(binary,scope,['read',str('file'),str('symbol')],signal));
  if(!Number.isInteger(args.start)||!Number.isInteger(args.end))throw Error('Brain: cần {file,start,end} (số nguyên) hoặc {file,symbol}.');
  return parse(await runBrain(binary,scope,['read',str('file'),String(args.start),String(args.end)],signal));
 }
 throw Error('Brain: công cụ không hợp lệ.');
}
