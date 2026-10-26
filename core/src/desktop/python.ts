import {bundledRuntime,pythonEnvironment,utf8Env} from './bundled-runtime.js';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {pvtaHome} from '../paths.js';

const PDF_PACKAGE='pypdf==6.21.0';
const OFFICE_PACKAGES=['python-docx==1.2.0','openpyxl==3.1.5','python-pptx==1.0.2'];
export type Support=boolean|'office'|'typst'|'word'|'excel'|'powerpoint'|'media'|'youtube';
/** Phiên âm (faster-whisper) và phụ đề YouTube: chỉ cài khi thầy cô thêm nguồn loại đó vào Sổ nguồn. */
const MEDIA_PACKAGES=['faster-whisper==1.2.1'];const YOUTUBE_PACKAGES=['youtube-transcript-api==1.2.4'];
const packages=(support:Support)=>support==='media'?MEDIA_PACKAGES:support==='youtube'?YOUTUBE_PACKAGES:support==='typst'?['typst==0.15.0']:support==='office'?OFFICE_PACKAGES:support==='word'?[OFFICE_PACKAGES[0]!]:support==='excel'?[OFFICE_PACKAGES[1]!]:support==='powerpoint'?[OFFICE_PACKAGES[2]!]:[PDF_PACKAGE];
const imports=(support:Support)=>support==='media'?'faster_whisper':support==='youtube'?'youtube_transcript_api':support==='typst'?'typst':support==='office'?'docx, openpyxl, pptx':support==='word'?'docx':support==='excel'?'openpyxl':support==='powerpoint'?'pptx':support?'pypdf':'';
export function supportForJob(job:{op?:string;path?:string;output?:string}):Support{
 if(job.op==='transcribe')return 'media';
 if(job.op==='youtube')return 'youtube';
 if(job.op==='create_typst')return 'typst';
 if(job.op?.startsWith('office_editor_'))return 'word';
 if(job.op==='edit_excel')return 'excel';
 if(job.op==='office_blank'||job.op==='create_office'||job.op==='math_export')return ({'.docx':'word','.xlsx':'excel','.pptx':'powerpoint'} as const)[path.extname(job.output??'').toLowerCase()]??'office';
 return job.op==='extract'&&path.extname(job.path??'').toLowerCase()==='.pdf';
}
const UV_VERSION='0.13.1';
const pending=new Map<string,Promise<string>>();
type Python={bin:string;args:string[]};
function run(bin:string,args:string[],env:NodeJS.ProcessEnv=process.env,timeout=180_000):Promise<string>{
 // utf8Env: lệnh kiểm tra in cả đường dẫn có dấu tiếng Việt (vd print(sys.executable)); Windows cp1252 sẽ lỗi charmap.
 return new Promise((resolve,reject)=>execFile(bin,args,{env:utf8Env(env),timeout,maxBuffer:4*1024*1024,windowsHide:true},(error,out)=>error?reject(error):resolve(out.trim())));
}
// Typst works through the Python module, or (Windows ARM64, where PyPI has no wheel) through the bundled executable.
const TYPST_PROBE="; import os\ntry:\n import typst\nexcept ImportError:\n assert os.path.isfile(os.environ.get('PVTA_TYPST',''))";
async function available(p:Python,pdf:Support=false){
 const probe=pdf==='typst'?TYPST_PROBE:imports(pdf)?'; import '+imports(pdf):'';
 try{await run(p.bin,[...p.args,'-c',`import sys; assert sys.version_info >= (3,9)${probe}`],pythonEnvironment(),15_000);return true;}catch{return false;}
}
function interpreter(home:string){return path.join(home,'python',process.platform==='win32'?'Scripts':'bin',process.platform==='win32'?'python.exe':'python');}
async function uv(home:string){
 const tools=path.join(home,'tools');const bin=path.join(tools,process.platform==='win32'?'uv.exe':'uv');
 if(existsSync(bin))return bin;
 const arch=process.arch==='arm64'?'aarch64':process.arch==='x64'?'x86_64':undefined;
 const platform=process.platform==='darwin'?'apple-darwin':process.platform==='win32'?'pc-windows-msvc':process.platform==='linux'?'unknown-linux-gnu':undefined;
 if(!arch||!platform)throw Error('Chưa có bộ hỗ trợ tài liệu tự động cho hệ điều hành này.');
 const name=`uv-${arch}-${platform}`;const archive=name+(process.platform==='win32'?'.zip':'.tar.gz');
 const base=`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${archive}`;
 await fs.mkdir(tools,{recursive:true,mode:0o700});const temp=await fs.mkdtemp(path.join(tools,'.setup-'));
 try{
  const [res,sum]=await Promise.all([fetch(base,{signal:AbortSignal.timeout(120_000)}),fetch(base+'.sha256',{signal:AbortSignal.timeout(30_000)})]);
  if(!res.ok||!sum.ok)throw Error('Không tải được bộ hỗ trợ tài liệu.');
  const data=Buffer.from(await res.arrayBuffer());const expected=(await sum.text()).trim().split(/\s+/)[0];
  if(!expected||createHash('sha256').update(data).digest('hex')!==expected)throw Error('Tệp hỗ trợ tải về không khớp mã kiểm tra.');
  const staged=path.join(temp,path.basename(bin));
  if(process.platform==='win32'){
   const files=unzipSync(data);const entry=Object.keys(files).find(n=>n==='uv.exe'||n.endsWith('/uv.exe'));
   if(!entry)throw Error('Thiếu chương trình cài hỗ trợ.');await fs.writeFile(staged,files[entry]!);
  }else{
   const file=path.join(temp,archive);await fs.writeFile(file,data);
   await run('/usr/bin/tar',['-xzf',file,'-C',temp,'--strip-components=1',`${name}/uv`]);await fs.chmod(staged,0o700);
  }
  await fs.rename(staged,bin);return bin;
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
const installTimeout=(s:Support)=>s==='media'?900_000:180_000;
async function prepare(home:string,pdf:Support):Promise<string>{
 const privateBin=interpreter(home);const privatePython={bin:privateBin,args:[]};
 if(await available(privatePython,pdf))return privateBin;
 const candidates:Python[]=process.platform==='win32'?[{bin:'py',args:['-3']},{bin:'python',args:[]},{bin:'python3',args:[]}]:[{bin:'python3',args:[]},{bin:'python',args:[]}];
 for(const candidate of candidates){
  if(!await available(candidate))continue;
  // Return the actual executable: the Windows py launcher requires extra arguments.
  const executable=await run(candidate.bin,[...candidate.args,'-c','import sys; print(sys.executable)']);
  if(!pdf||await available({bin:executable,args:[]},pdf))return executable;
  if(!await available(privatePython)){
   await fs.mkdir(home,{recursive:true,mode:0o700});
   try{await run(executable,['-m','venv',path.join(home,'python')]);}catch{break;}
  }
  try{
   await run(privateBin,['-m','pip','--disable-pip-version-check','install','--no-input','--no-cache-dir','--only-binary=:all:','--index-url','https://pypi.org/simple',...packages(pdf)],process.env,installTimeout(pdf));
   if(await available(privatePython,pdf))return privateBin;
  }catch{break;}
 }
 // A private managed runtime also covers machines without Python or ensurepip.
 const manager=await uv(home);
 const env={...process.env,UV_PYTHON_INSTALL_DIR:path.join(home,'python-runtime'),UV_CACHE_DIR:path.join(home,'cache','uv'),UV_NO_PROGRESS:'1',UV_NO_CACHE:'1'};
 if(!await available(privatePython))await run(manager,['venv','--python','3.12','--managed-python','--allow-existing',path.join(home,'python')],env,300_000);
 if(pdf)await run(manager,['pip','install','--python',privateBin,'--index-url','https://pypi.org/simple',...packages(pdf)],env,installTimeout(pdf));
 if(!await available(privatePython,pdf))throw Error('Không khởi tạo được bộ đọc tài liệu.');
 return privateBin;
}
export async function ensurePython(pdf:Support=false,home=pvtaHome()):Promise<string>{
 const bundle=bundledRuntime();
 // Gói phiên âm/YouTube không có sẵn trong bản đóng gói: cài riêng vào môi trường Python của PVTA.
 if(bundle&&pdf!=='media'&&pdf!=='youtube'){
  if(!await available({bin:bundle.python,args:[]},pdf))throw Error('Bộ công cụ PVTA không hoạt động. Hãy cài lại ứng dụng.');
  return bundle.python;
 }
 // Serialize setup for simultaneous attachments. A failed setup can be retried.
 const previous=pending.get(home);if(previous){try{await previous;}catch{}return ensurePython(pdf,home);}
 const task=prepare(home,pdf);pending.set(home,task);
 try{return await task;}catch{throw Error('PVTA chưa tải xong bộ hỗ trợ tài liệu. Kiểm tra kết nối mạng rồi đính kèm lại; ứng dụng sẽ tự thử cài lại.');}
 finally{if(pending.get(home)===task)pending.delete(home);}
}

/** Read-only capability check: never downloads or installs. */
export async function pythonHealth(home=pvtaHome()){
 const bundle=bundledRuntime();
 const candidates:Python[]=bundle?[{bin:bundle.python,args:[]}]:[{bin:interpreter(home),args:[]},...(process.platform==='win32'?[{bin:'py',args:['-3']},{bin:'python',args:[]}]:[{bin:'python3',args:[]},{bin:'python',args:[]}])];
 const results=[];
 for(const [label,support] of [['Typst · PDF + mã nguồn','typst'],['Đọc PDF',true],['Word · Excel · PowerPoint','office']] as const){
  let ready=false;for(const p of candidates){if(await available(p,support)){ready=true;break;}}
  results.push({label,ready,detail:ready?'Công cụ đã sẵn sàng':'Tự chuẩn bị khi tác vụ cần sử dụng.'});
 }
 return results;
}
