import os from 'node:os';
import type {ChildProcess} from 'node:child_process';
import {buildSpawn,launch,resolveWin} from '../spawn.js';
import {cleanEnv} from '../env.js';
import {BACKENDS,resolveBin} from '../backends/index.js';
import {parseUsageSnapshot} from '../provider-usage.js';
import type {ProviderUsage} from '@pvta/shared';

/** Read quota through the installed CLI's own authentication. Never send a user/model turn. */
export async function readProviderUsage(backend:'agy'|'claude'|'codex',options:{model?:string;signal?:AbortSignal;env?:NodeJS.ProcessEnv;spawn?:(backend:string)=>ChildProcess;timeoutMs?:number}={}):Promise<ProviderUsage>{
 const child=options.spawn?options.spawn(backend):(()=>{
  const env=cleanEnv(options.env??process.env),bin=resolveBin(BACKENDS[backend],env);
  if(backend==='claude'){env.CLAUDE_CODE_DISABLE_CLAUDE_MDS='1';env.CLAUDE_CODE_DISABLE_AUTO_MEMORY='1';}
  const args=backend==='claude'?['--print','--verbose','--input-format','stream-json','--output-format','stream-json','--no-session-persistence','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--settings','{"disableAllHooks":true}']:backend==='agy'?['--print','/usage','--output-format','json']:['app-server','--listen','stdio://'];
  return launch(buildSpawn(process.platform,bin,args.map(flag=>({flag})),process.platform==='win32'?{target:resolveWin(bin,env)}:undefined),{cwd:os.tmpdir(),env});
 })();
 return new Promise((resolve,reject)=>{
  let done=false,buffer='',received=0;
  const finish=(error?:Error,usage?:ProviderUsage)=>{if(done)return;done=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);child.stdin?.end();child.kill();if(error)reject(error);else resolve(usage!);};
  const timer=setTimeout(()=>finish(Error('Nguồn AI chưa trả lời truy vấn hạn mức.')),options.timeoutMs??15000);
  const abort=()=>finish(Error('Đã dừng truy vấn hạn mức.'));
  const send=(value:unknown)=>{if(!done&&child.stdin?.writable)child.stdin.write(JSON.stringify(value)+'\n');};
  child.stdin?.on('error',()=>finish(Error('Không gửi được truy vấn hạn mức tới CLI.')));
  child.on('error',()=>finish(Error('Không mở được CLI để đọc hạn mức.')));
  child.once('exit',()=>{if(!done)finish(Error('CLI không hỗ trợ hoặc chưa trả số liệu hạn mức.'));});
  child.stderr?.on('data',()=>{});
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data',(chunk:string)=>{
   received+=chunk.length;if(received>2_000_000){finish(Error('Phản hồi hạn mức quá lớn.'));return;}
   buffer+=chunk;let newline:number;
   while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let event:any;try{event=JSON.parse(line);}catch{continue;}
    if(backend==='agy'){
     if(event.status==='ERROR'||event.event==='error'){finish(Error(event.error?.message??event.message??'Antigravity chưa trả số liệu hạn mức.'));return;}
     const usage=parseUsageSnapshot('agy',event,Date.now(),options.model);
     if(usage)finish(undefined,usage);
     else if(event.status||event.event==='result')finish(Error('Antigravity chưa cung cấp số phần trăm hạn mức cho phiên đăng nhập hiện tại.'));
    }else if(backend==='claude'){
     const response=event.type==='control_response'?event.response:undefined;
     if(response?.request_id==='usage-init'){
      if(response.subtype==='error'){finish(Error('CLI chưa hỗ trợ truy vấn hạn mức.'));return;}
      send({type:'control_request',request_id:'usage-read',request:{subtype:'get_usage',skip_behaviors:true}});
     }else if(response?.request_id==='usage-read'){
      if(response.subtype==='error'){finish(Error('Phiên bản CLI này chưa hỗ trợ đọc hạn mức.'));return;}
      const value=response.response,usage=parseUsageSnapshot('claude',value);
      if(usage)finish(undefined,usage);else finish(Error(value?.rate_limits_available===false?'Phiên đăng nhập hiện tại không cung cấp hạn mức gói 5h/tuần.':'Nguồn AI chưa trả số phần trăm 5h/tuần; hãy thử làm mới sau.'));
     }
    }else if(event.id===1){
     if(event.error){finish(Error('Không khởi tạo được truy vấn hạn mức Codex.'));return;}
     send({method:'initialized',params:{}});send({id:2,method:'account/rateLimits/read',params:null});
    }else if(event.id===2){const usage=parseUsageSnapshot('codex',event.result);if(usage)finish(undefined,usage);else finish(Error('Codex chưa cung cấp số phần trăm hạn mức cho phiên đăng nhập hiện tại.'));}
   }
  });
  if(options.signal?.aborted){abort();return;}options.signal?.addEventListener('abort',abort,{once:true});
  if(backend==='agy')child.stdin?.end();
  else if(backend==='claude')send({type:'control_request',request_id:'usage-init',request:{subtype:'initialize',hooks:{}}});
  else send({id:1,method:'initialize',params:{clientInfo:{name:'pvta_usage',version:'1.4.2'},capabilities:{experimentalApi:true}}});
 });
}
