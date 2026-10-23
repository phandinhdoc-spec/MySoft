import readline from 'node:readline';
import {setDefaultResultOrder} from 'node:dns';
import {setDefaultAutoSelectFamilyAttemptTimeout} from 'node:net';
import { DesktopRuntime } from './runtime.js';
import { runRefineCli } from './refine/host.js';
import { pvtaHome } from '../paths.js';
import type {RpcRequest} from './types.js';
import {PvtaDaemon} from './daemon.js';
const send=(v:unknown)=>process.stdout.write(JSON.stringify(v)+'\n');
// stdout is reserved for IPC; diagnostics must never contain prompts or credentials.
// Prefer working IPv4 routes while keeping IPv6 fallback. The default 250 ms
// address-attempt window can abandon reachable API hosts on higher-latency links.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamilyAttemptTimeout(1500);
if(process.argv.includes('--refine')){
 // Chế độ biên tập nền do bộ lập lịch của hệ điều hành gọi: không mở giao diện, tự thoát khi xong.
 void runRefineCli().then(code=>process.exit(code));
}else{
 // Sidecar là một cửa sổ Desktop. Nếu chưa có lõi nào đang chạy, nó trở thành lõi (HOST);
 // nếu CLI hoặc Desktop khác đã là lõi, nó nối vào lõi đó (CLIENT). Xem core/src/desktop/daemon.ts.
 const home=pvtaHome();
 const daemon=new PvtaDaemon({
  home,
  createRuntime:emit=>new DesktopRuntime(emit,home),
  onEvent:e=>send(e),
 });
 const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 input.on('line',line=>{
  let req:RpcRequest;try{req=JSON.parse(line);}catch{return;}
  // Lỗi từ daemon đã được làm sạch khóa bí mật trước khi tới đây.
  void daemon.invoke(req).then(result=>send({id:req.id,result}),e=>send({id:req.id,error:e instanceof Error?e.message:String(e)}));
 });
 const quit=()=>{daemon.close();process.exit(0);};
 input.on('close',quit);
 process.on('SIGTERM',quit);
 process.on('exit',()=>daemon.close());
 // Lỗi kết nối sẽ được báo ở từng yêu cầu; start() chỉ thử sớm.
 void daemon.start().catch(()=>{});
}
