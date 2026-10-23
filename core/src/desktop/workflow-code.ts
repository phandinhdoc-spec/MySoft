import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

/**
 * Hạ tầng chạy mã sinh bởi AI trong quy trình. Thư mục con chỉ là nơi làm việc, KHÔNG phải hộp cách ly:
 * hàng rào thật là bước phản biện (AI + quét tĩnh) và việc giáo viên duyệt.
 */
export const DEFAULT_CODE_TIMEOUT_MS=30*60_000,MAX_CODE_OUTPUT=20_000;

export interface CodeBlock {lang:string;code:string}
const LANG_ALIAS:Record<string,string>={py:'python',python3:'python',js:'javascript',node:'javascript',sh:'bash',shell:'bash',zsh:'bash'};
const RUNNERS:Record<string,{cmd:string[];ext:string}>={
 python:{cmd:['python3','python'],ext:'py'},
 javascript:{cmd:['node'],ext:'js'},
 bash:{cmd:['bash','sh'],ext:'sh'},
};
export const normalizeLang=(l:string)=>{const k=l.trim().toLowerCase();return LANG_ALIAS[k]??k;};

/** Các khối ```ngôn-ngữ … ``` trong câu trả lời của model. */
export function extractCodeBlocks(text:string):CodeBlock[]{
 return [...text.matchAll(/```([A-Za-z0-9_+#-]*)[^\n]*\n([\s\S]*?)```/g)].map(m=>({lang:normalizeLang(m[1]!),code:m[2]!.replace(/\s+$/,'')+'\n'})).filter(b=>b.code.trim());
}

export type Severity='high'|'medium'|'low';
export interface Finding {level:Severity;text:string;source:'scan'|'ai'}

const RULES:{re:RegExp;level:Severity;text:string}[]=[
 {re:/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/,level:'high',text:'Xóa tệp bằng rm -r/-f.'},
 {re:/\b(shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir|fs\.(rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync)|Remove-Item)\b/,level:'high',text:'Mã xóa tệp hoặc thư mục.'},
 {re:/\bsudo\b|\bchmod\s+-R\b|\bmkfs\b|\bdd\s+if=/,level:'high',text:'Lệnh đặc quyền hoặc phá hủy dữ liệu (sudo, chmod -R, mkfs, dd).'},
 {re:/\b(curl|wget)\b|requests\.(get|post|put)|urllib|http\.client|\bfetch\s*\(|https?:\/\/|\bsocket\b|require\(['"](https?|net)['"]\)/,level:'medium',text:'Mã gọi mạng hoặc tải dữ liệu từ Internet.'},
 {re:/(^|[\s"'`=(])(\/(?!tmp\b)[A-Za-z0-9_.-]+(\/[^\s"'`)]*)?|[A-Za-z]:[\\/])/m,level:'medium',text:'Dùng đường dẫn tuyệt đối, có thể đụng tới tệp ngoài thư mục làm việc.'},
 {re:/(^|[\\/"'\s])\.\.([\\/]|["'\s]|$)/m,level:'medium',text:'Dùng “..” để đi lên ngoài thư mục làm việc.'},
 {re:/\b(os\.system|subprocess|child_process|exec(Sync)?\s*\(|eval\s*\(|Popen)\b/,level:'medium',text:'Mã chạy thêm lệnh hệ thống hoặc đánh giá mã động.'},
 {re:/\b(open\([^)]*['"][wa]b?\+?['"]|writeFile(Sync)?|\bwrite_text\b|>\s*[\w./~-]+)/,level:'low',text:'Mã ghi tệp trong thư mục làm việc.'},
];
/** Quét tĩnh theo mẫu: bổ sung cho AI phản biện, không thay thế. Không thấy gì KHÔNG có nghĩa là an toàn. */
export function scanCode(code:string):Finding[]{
 const seen=new Set<string>(),out:Finding[]=[];
 for(const r of RULES)if(r.re.test(code)&&!seen.has(r.text)){seen.add(r.text);out.push({level:r.level,text:r.text,source:'scan'});}
 return out;
}

/** Tách JSON cảnh báo từ câu trả lời phản biện của AI; lỗi định dạng được coi là một cảnh báo mức trung bình. */
export function parseReview(text:string):Finding[]{
 const m=/\[[\s\S]*\]/.exec(text);
 try{
  if(!m)throw Error();
  const arr=JSON.parse(m[0]);
  if(!Array.isArray(arr))throw Error();
  return arr.slice(0,20).flatMap((x:any):Finding[]=>typeof x?.text==='string'&&x.text.trim()?[{level:x.level==='high'||x.level==='low'?x.level:'medium',text:x.text.slice(0,400),source:'ai'}]:[]);
 }catch{
  return [{level:'medium',text:'AI phản biện trả lời không đúng định dạng; hãy tự đọc kỹ mã trước khi duyệt.',source:'ai'}];
 }
}
export const reviewPrompt=(code:string,lang:string,goal:string,declarations:string)=>
 `Bạn là AI PHẢN BIỆN mã. Đọc mã ${lang} dưới đây và chỉ liệt kê vấn đề thật, không viết lại mã.\nYêu cầu của bước: ${goal.slice(0,1500)}\n${declarations}\nKiểm tra: (1) lỗi logic hoặc cú pháp; (2) mã không khớp mô tả hay thiếu biến/hàm đã khai báo; (3) rủi ro: xóa tệp, ghi ngoài thư mục làm việc, đường dẫn tuyệt đối, “..”, gọi mạng, chạy lệnh hệ thống.\nTrả lời DUY NHẤT một mảng JSON, mỗi phần tử {"level":"high|medium|low","text":"mô tả ngắn tiếng Việt"}; không có vấn đề thì trả [].\n\nMÃ:\n\`\`\`${lang}\n${code.slice(0,12000)}\n\`\`\``;

export const hasHigh=(f:Finding[])=>f.some(x=>x.level==='high');

/** Tìm trình thông dịch có trên máy; không tự cài. */
export function findInterpreter(lang:string):{cmd:string;ext:string}|undefined{
 const r=RUNNERS[normalizeLang(lang)];if(!r)return undefined;
 const which=process.platform==='win32'?'where':'which';
 for(const c of r.cmd)if(spawnSync(which,[c],{stdio:'ignore'}).status===0)return {cmd:c,ext:r.ext};
 return undefined;
}
export const supportedLanguages=()=>Object.keys(RUNNERS);

/** Chép tệp/thư mục đính kèm vào thư mục con (không giới hạn dung lượng). Hủy được; báo tiến độ theo số tệp. */
export async function copyAttachments(sources:string[],dest:string,signal:AbortSignal,onProgress?:(copied:number)=>void):Promise<number>{
 let n=0;
 const walk=async(src:string,to:string)=>{
  signal.throwIfAborted();
  const st=await fs.promises.stat(src);
  if(st.isDirectory()){
   await fs.promises.mkdir(to,{recursive:true});
   for(const e of await fs.promises.readdir(src))await walk(path.join(src,e),path.join(to,e));
  }else if(st.isFile()){
   await fs.promises.mkdir(path.dirname(to),{recursive:true});
   await fs.promises.copyFile(src,to,fs.constants.COPYFILE_EXCL);n++;onProgress?.(n);
  }
 };
 const used=new Set<string>();
 for(const src of sources){
  let name=path.basename(src.replace(/[\\/]+$/,''))||'tep',k=2;
  while(used.has(name))name=`${path.basename(src)}-${k++}`;
  used.add(name);
  await walk(src,path.join(dest,name));
 }
 return n;
}

/** Thư mục con của lượt chạy; hai lượt không bao giờ dùng chung thư mục. */
export function makeRunDir(outputDir:string,workflowName:string,runId:string):string{
 const safe=workflowName.replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'quy-trinh';
 const dir=path.join(outputDir,`${safe}-${runId.slice(0,8)}`);
 fs.mkdirSync(dir,{recursive:false});
 return dir;
}

export interface CodeResult {ok:boolean;exitCode:number|null;timedOut:boolean;output:string}
/** Chạy mã trong cwd, có giới hạn thời gian. Mã chạy với quyền của tài khoản (xem chú thích đầu tệp). */
export function runCode(file:string,interp:{cmd:string},cwd:string,timeoutMs:number,signal:AbortSignal):Promise<CodeResult>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const child=spawn(interp.cmd,[file],{cwd,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUNBUFFERED:'1'}});
  let out='',timedOut=false;
  const add=(b:Buffer)=>{out+=b.toString('utf8');if(out.length>MAX_CODE_OUTPUT*2)out=out.slice(-MAX_CODE_OUTPUT*2);};
  child.stdout.on('data',add);child.stderr.on('data',add);
  const kill=()=>{try{child.kill('SIGKILL');}catch{}};
  const timer=setTimeout(()=>{timedOut=true;kill();},timeoutMs);
  const abort=()=>{kill();};
  signal.addEventListener('abort',abort,{once:true});
  child.on('error',e=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(e);});
  child.on('close',code=>{
   clearTimeout(timer);signal.removeEventListener('abort',abort);
   if(signal.aborted)return reject(signal.reason);
   resolve({ok:code===0&&!timedOut,exitCode:code,timedOut,output:out.slice(-MAX_CODE_OUTPUT)});
  });
 });
}
