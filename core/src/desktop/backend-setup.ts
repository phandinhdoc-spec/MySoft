import {spawn,type ChildProcess} from 'node:child_process';
import {quoteWinCommand,whichWin} from '../spawn.js';
import type {InstallBackend} from './backend-install.js';

/**
 * Cài và đăng nhập công cụ AI ngay trong PVTA, không mở cửa sổ Terminal.
 * Lõi chạy lệnh ở nền, đọc chữ công cụ in ra, lấy đường dẫn đăng nhập để mở trình duyệt,
 * và chuyển mã (nếu công cụ hỏi) từ ô nhập của giao diện vào công cụ. Thông tin đăng nhập
 * do chính công cụ lưu; PVTA không giữ mật khẩu hay token.
 */
export type SetupBackend=InstallBackend;
export type SetupKind='install'|'login';
export type SetupPhase='running'|'code'|'done'|'failed';
export interface SetupEvent{backend:SetupBackend;kind:SetupKind;phase:SetupPhase;lines:string[];url?:string;message?:string}

/** Chỉ mở đường dẫn đăng nhập thuộc đúng nhà cung cấp của công cụ. */
const LOGIN_HOSTS:Record<SetupBackend,string[]>={
 claude:['claude.com','claude.ai','anthropic.com'],
 codex:['openai.com','chatgpt.com'],
 agy:['google.com','antigravity.google'],
};
const MAX_LINES=8;
const ANSI=/\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B\][^\u0007]*\u0007/g;
export const stripAnsi=(s:string)=>s.replace(ANSI,'');

/** Tìm đường dẫn đăng nhập đầu tiên thuộc nhà cung cấp; bỏ dấu câu dính ở cuối. */
export function extractLoginUrl(backend:SetupBackend,text:string):string|undefined{
 for(const m of stripAnsi(text).matchAll(/https:\/\/[^\s"'<>\u0000-\u001f]+/g)){
  const raw=m[0].replace(/[.,;:)\]]+$/,'');
  try{
   const u=new URL(raw);
   if(u.protocol!=='https:'||u.username||u.password)continue;
   if(LOGIN_HOSTS[backend].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return u.href;
  }catch{/* bỏ qua chuỗi không phải địa chỉ */}
 }
 return undefined;
}
/** Công cụ đang chờ người dùng dán mã (Claude: "Paste code here if prompted >"). */
export const asksForCode=(text:string)=>/paste (?:the )?(?:authorization )?code|enter (?:the )?(?:authorization )?code/i.test(stripAnsi(text));
/** Mã dán vào chỉ gồm chữ, số và vài ký hiệu; không xuống dòng, không dấu cách. */
export const validCode=(s:string)=>/^[A-Za-z0-9._~#:\/+=-]{6,4000}$/.test(s);

const SECRET_ENV=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','OPENAI_API_KEY','CODEX_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY'];
/** Môi trường để đăng nhập: bỏ khóa API và token đã có để công cụ hiện đúng bước đăng nhập tài khoản. */
export function loginEnv(env:NodeJS.ProcessEnv):NodeJS.ProcessEnv{
 const out={...env};for(const k of Object.keys(out))if(SECRET_ENV.includes(k.toUpperCase()))delete out[k];return out;
}
/** Lệnh đăng nhập không cần Terminal. agy chưa có lệnh như vậy (phải qua giao diện dòng lệnh của nó). */
export function loginArgs(backend:SetupBackend,deviceCode=false):string[]|undefined{
 if(backend==='claude')return ['auth','login'];
 if(backend==='codex')return deviceCode?['login','--device-auth']:['login'];
 return undefined;
}

/** Chạy một lệnh ở nền (Windows: .exe chạy thẳng, shim .cmd qua cmd.exe với tên lệnh được thoát an toàn). */
export function spawnHidden(bin:string,args:string[],env:NodeJS.ProcessEnv,platform:NodeJS.Platform=process.platform):ChildProcess{
 let command=bin,argv=args,shell=false;
 if(platform==='win32'){
  const found=whichWin(bin,env);
  if(found&&/\.(exe|com)$/i.test(found))command=found;
  else{command=quoteWinCommand(found??bin);shell=true;}
 }
 return spawn(command,argv,{env,shell,windowsHide:true,stdio:['pipe','pipe','pipe']});
}

const cleanLine=(s:string)=>stripAnsi(s).replace(/https?:\/\/\S+/g,u=>{try{return `[${new URL(u).host}]`;}catch{return '[liên kết]';}}).trim().slice(0,160);

export interface RunOptions{
  backend:SetupBackend;kind:SetupKind;timeoutMs:number;
  /** Đọc đường dẫn đăng nhập và lời nhắc dán mã trong chữ công cụ in ra. */
  watchLogin?:boolean;
}
export type ExitReport={code:number|null;timedOut:boolean;cancelled:boolean;spawnError?:string};

/** Một lần chạy: gom chữ đầu ra, báo tiến trình qua emit, nhận mã dán vào, hủy được, tự hết giờ. */
export class CliRun{
 private child?:ChildProcess;private lines:string[]=[];private raw='';private url?:string;private phase:SetupPhase='running';
 private partial={out:'',err:''};private timedOut=false;private cancelled=false;private timer?:ReturnType<typeof setTimeout>;
 readonly done:Promise<ExitReport>;
 constructor(private o:RunOptions,private emit:(e:SetupEvent)=>void,start:()=>ChildProcess){
  this.done=new Promise<ExitReport>(resolve=>{
   let child:ChildProcess;
   try{child=start();}catch(e){resolve({code:null,timedOut:false,cancelled:false,spawnError:e instanceof Error?e.message:String(e)});return;}
   this.child=child;
   const feed=(key:'out'|'err')=>(buf:Buffer)=>this.feed(key,buf.toString('utf8'));
   child.stdout?.on('data',feed('out'));child.stderr?.on('data',feed('err'));
   child.stdin?.on('error',()=>{});
   let settled=false;const finish=(r:ExitReport)=>{if(settled)return;settled=true;if(this.timer)clearTimeout(this.timer);this.flush();resolve(r);};
   child.once('error',e=>finish({code:null,timedOut:false,cancelled:false,spawnError:e.message}));
   child.once('close',code=>finish({code,timedOut:this.timedOut,cancelled:this.cancelled}));
   this.timer=setTimeout(()=>{this.timedOut=true;this.kill();},o.timeoutMs);
  });
  this.send();
 }
 private feed(key:'out'|'err',text:string){
  this.raw=(this.raw+text).slice(-6000);
  const parts=(this.partial[key]+text).split(/\r\n|\n|\r/);this.partial[key]=parts.pop()??'';
  for(const p of parts){const l=cleanLine(p);if(l)this.lines.push(l);}
  if(this.lines.length>MAX_LINES)this.lines.splice(0,this.lines.length-MAX_LINES);
  if(this.o.watchLogin){
   if(!this.url)this.url=extractLoginUrl(this.o.backend,this.raw);
   if(this.phase==='running'&&asksForCode(this.raw.slice(-400)))this.phase='code';
  }
  this.send();
 }
 private flush(){for(const k of ['out','err'] as const){const l=cleanLine(this.partial[k]);if(l)this.lines.push(l);this.partial[k]='';}if(this.lines.length>MAX_LINES)this.lines.splice(0,this.lines.length-MAX_LINES);}
 snapshot(extra:Partial<SetupEvent>={}):SetupEvent{return {backend:this.o.backend,kind:this.o.kind,phase:this.phase,lines:[...this.lines],url:this.url,...extra};}
 private send(){this.emit(this.snapshot());}
 /** Gửi mã người dùng dán vào công cụ; chỉ nhận khi công cụ đã hỏi mã. */
 sendCode(code:string){
  const c=code.trim();
  if(!this.o.watchLogin||this.phase!=='code')throw Error('Công cụ chưa yêu cầu nhập mã.');
  if(!validCode(c))throw Error('Mã không hợp lệ. Hãy dán đúng mã hiện trên trang đăng nhập.');
  this.child?.stdin?.write(c+'\n');this.phase='running';this.send();
 }
 cancel(){this.cancelled=true;this.kill();}
 private kill(){
  const child=this.child;if(!child||child.killed)return;
  try{
   if(process.platform==='win32'&&child.pid)spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
   else child.kill('SIGTERM');
  }catch{/* tiến trình đã thoát */}
 }
}
