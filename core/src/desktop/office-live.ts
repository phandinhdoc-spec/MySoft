import {assertOfficeInstalled,createCleanOfficeDocument,createOfficeDocument,openOfficeDocument,matchesOfficeDocument,ensureDocumentAddin,hostForOfficeFile,syncOfficeDocumentBeforeRead,reloadOfficeDocumentAfterWrite,discoverOpenOfficeFiles,OFFICE_APPS,type LaunchHost} from './office-launch.js';
import {pythonJob} from './documents.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {WebSocketServer,WebSocket} from 'ws';
import {ensureCerts} from '../ipad.js';
import {DESKTOP_OFFICE_TOOLS as TOOL_CATALOG,isDesktopOfficeReadTool as isReadTool,type OfficeHost,type ToolCall} from '@pvta/shared';
export const OFFICE_PORT=52734;
export class OfficeLive {
 private server?:https.Server;private wss?:WebSocketServer;private token=randomBytes(24).toString('hex');
 private sessions=new Map<string,{socket?:WebSocket;file?:string;host:OfficeHost;name:string;launchId?:string}>();
 private pending=new Map<string,{session:string;resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private launches=new Map<string,{id:string;host:LaunchHost;file:string;expires:number}>();
 private launching=false;private trusted=false;
 selected='';private starting?:Promise<void>;
 constructor(private home:string,private assets:string,private changed:()=>void){}
 status(){return {running:!!this.server||this.sessions.size>0,selected:this.selected,sessions:[...this.sessions].map(([id,s])=>({id,host:s.host,name:s.name,launchId:s.launchId,file:s.file,mode:s.socket?'addin':'direct'})),manifest:path.join(this.home,'office-plugin','PVTA-Desktop.xml')};}
 selectedSession(){const s=this.sessions.get(this.selected);return s?{id:this.selected,host:s.host,name:s.name,file:s.file,mode:s.socket?'addin':'direct'}:undefined;}
 select(id:string){if(id&&!this.sessions.has(id))throw Error('Tài liệu Office đã ngắt kết nối.');this.selected=id;this.changed();}
 connectFile(file:string,launchId?:string,select=true){
  const host=hostForOfficeFile(file);
  if(!host||!fs.existsSync(file))return undefined;
  const resolved=path.resolve(file);
  for(const [id,s] of this.sessions){
   if((s.file&&path.resolve(s.file)===resolved)||(launchId&&s.launchId===launchId)){
    s.file=resolved;if(launchId)s.launchId=launchId;
    if(select)this.selected=id;
    this.changed();
    return {id,host:s.host,name:s.name,file:resolved,launchId:s.launchId};
   }
  }
  const id=randomUUID(),name=path.basename(resolved).slice(0,200);
  this.sessions.set(id,{file:resolved,host,name,launchId});
  if(select||!this.selected)this.selected=id;
  this.changed();
  return {id,host,name,file:resolved,launchId};
 }
 async syncOpenDocuments(){
  const openFiles=await discoverOpenOfficeFiles();
  let added=0;
  for(const item of openFiles){
   const existed=[...this.sessions.values()].some(s=>s.file&&path.resolve(s.file)===path.resolve(item.file));
   if(this.connectFile(item.file,undefined,!this.selected)&&!existed)added++;
  }
  return {count:this.sessions.size,added};
 }
 async start(){
  if(this.starting)return this.starting;if(this.server)return;
  this.starting=this.startServer().finally(()=>{this.starting=undefined;});return this.starting;
 }
 private async startServer(){
  if(!fs.existsSync(path.join(this.assets,'desktop.html')))throw Error('Gói cài thiếu add-in Office. Hãy cập nhật PVTA.');
  const certs=ensureCerts(path.join(this.home,'office-plugin','certs'),['localhost'],['127.0.0.1']);
  const server=https.createServer({cert:certs.certPem,key:certs.keyPem},(req,res)=>{
   const host=req.headers.host;if(host!==`localhost:${OFFICE_PORT}`&&host!==`127.0.0.1:${OFFICE_PORT}`){res.writeHead(403).end();return;}
   if(req.method!=='GET'){res.writeHead(405).end();return;}
   let rel:string;try{rel=decodeURIComponent(new URL(req.url??'/',`https://localhost:${OFFICE_PORT}`).pathname);}catch{res.writeHead(400).end();return;}
   const defaultPage=fs.existsSync(path.join(this.assets,'index.html'))?'/index.html':'/desktop.html';
   const file=path.resolve(this.assets,'.'+(rel==='/'?defaultPage:rel));
   if(!file.startsWith(path.resolve(this.assets)+path.sep)){res.writeHead(403).end();return;}
   fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);});
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4*1024*1024});
  server.on('upgrade',(req,socket,head)=>{const origin=req.headers.origin;if(req.url!=='/office'||![`https://localhost:${OFFICE_PORT}`,'https://localhost:52730'].includes(origin??'')){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  wss.on('connection',socket=>{
   const id=randomUUID();const timeout=setTimeout(()=>socket.close(),10000);
   socket.on('message',raw=>{let msg:any;try{msg=JSON.parse(String(raw));}catch{return socket.close();}
    if(!this.sessions.has(id)){
     if(msg.type!=='pair'||!['word','excel','powerpoint'].includes(msg.host))return socket.close();
     const launch=typeof msg.launchTicket==='string'?this.launches.get(msg.launchTicket):undefined;
     if(msg.launchTicket){if(!launch||launch.expires<Date.now()||launch.host!==msg.host||!matchesOfficeDocument(msg.documentUrl,launch.file))return socket.close();}
     else if(typeof msg.token==='string'&&msg.token.length>0&&msg.token!==this.token)return socket.close();
     clearTimeout(timeout);
     for(const [oldId,old] of this.sessions){
      if(!old.socket&&((launch&&old.launchId===launch.id)||(old.file&&matchesOfficeDocument(msg.documentUrl,old.file)))){
       this.sessions.delete(oldId);if(this.selected===oldId)this.selected=id;
      }
     }
     const autoSelect=!!launch||!msg.token||!this.selected;
     this.sessions.set(id,{socket,file:launch?.file,host:msg.host,name:launch?path.basename(launch.file):String(msg.name||'Tài liệu chưa lưu').slice(0,200),launchId:launch?.id});
     if(launch)this.launches.delete(msg.launchTicket);
     if(autoSelect)this.selected=id;
     socket.send(JSON.stringify({type:'paired',selected:this.selected===id}));this.changed();return;
    }
    if(msg.type==='result'){const p=this.pending.get(msg.id);if(p?.session!==id)return;if(p){clearTimeout(p.timer);this.pending.delete(msg.id);if(msg.error)p.reject(Error(String(msg.error).slice(0,1200)));else p.resolve(msg.result);}}
   });
   socket.on('error',()=>{});socket.on('close',()=>{clearTimeout(timeout);const old=this.sessions.get(id);if(old?.file&&fs.existsSync(old.file)){delete old.socket;}else{this.sessions.delete(id);if(this.selected===id)this.selected='';}for(const [key,p] of this.pending)if(p.session===id){clearTimeout(p.timer);p.reject(Error('Office đã ngắt kết nối; kiểm tra tài liệu trước khi thử lại.'));this.pending.delete(key);}if(this.server)this.changed();});
  });
  try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(OFFICE_PORT,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});}catch(e){wss.close();throw e;}
  server.on('error',()=>{});this.server=server;this.wss=wss;this.changed();
 }
 pairingCode(){return this.token;}
 async prepareOpen(file?:string){
  const host=file?hostForOfficeFile(file):undefined;
  if(!file||!host)return;
  ensureDocumentAddin(file,this.assets,process.platform==='darwin');
  this.connectFile(file);
  void this.start().catch(()=>{});
 }
 async createAndOpen(host:unknown){
  if(host!=='word'&&host!=='excel'&&host!=='powerpoint')throw Error('Ứng dụng Office không hợp lệ.');
  if(this.launching)throw Error('Đang chuẩn bị tài liệu Office. Chờ thao tác hiện tại hoàn tất.');
  this.launching=true;let ticket='';
  try{
   assertOfficeInstalled(host);
   let wefReady=false;
   try{const res=await this.installMac(host);wefReady=!!(res as {installed?:boolean})?.installed;}catch{wefReady=false;}
   const folder=path.join(this.home,'office-documents');fs.mkdirSync(folder,{recursive:true,mode:0o700});
   const id=randomUUID(),file=path.join(folder,`${OFFICE_APPS[host].name}-${id}.${OFFICE_APPS[host].ext}`);
   if(wefReady){
    ticket=randomBytes(32).toString('hex');
    await createOfficeDocument(file,host,ticket,this.assets);
    for(const [key,old] of this.launches)if(old.expires<Date.now())this.launches.delete(key);
    this.launches.set(ticket,{id,host,file,expires:Date.now()+10*60_000});
    await openOfficeDocument(file,host);
    return {launchId:id,path:file,host};
   }
   await createCleanOfficeDocument(file);
   this.connectFile(file,id,true);
   await openOfficeDocument(file,host);
   return {launchId:id,path:file,host,direct:true};
  }catch(e){if(ticket)this.launches.delete(ticket);throw e;}finally{this.launching=false;}
 }
 async installMac(host?:'word'|'excel'|'powerpoint'){
  await this.start();
  const folder=path.join(this.home,'office-plugin');fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const original=fs.readFileSync(path.join(this.assets,'manifest.xml'),'utf8');
  const manifest=original.replaceAll('6d1f3b52-8e0a-4c53-9a47-2f6f0f6a11d0','c40b3f55-7e7e-4a43-8b25-7808fd1e7f39').replaceAll('https://localhost:3000',`https://localhost:${OFFICE_PORT}`).replaceAll('<TaskpaneId>PvtaPane</TaskpaneId>','<TaskpaneId>Office.AutoShowTaskpaneWithDocument</TaskpaneId>').replace('DefaultValue="PVTA"','DefaultValue="PVTA Desktop"');
  fs.writeFileSync(path.join(folder,'PVTA-Desktop.xml'),manifest,{mode:0o600});
  if(process.platform!=='darwin')return {manual:true,manifest:path.join(folder,'PVTA-Desktop.xml'),certificate:path.join(folder,'certs/ca.crt')};
  await this.trustMac();
  const wanted=host==='word'?['Word']:host==='excel'?['Excel']:host==='powerpoint'?['Powerpoint']:['Word','Excel','Powerpoint'];
  let preRegistered:string[]=[];
  try{const reg=JSON.parse(fs.readFileSync(path.join(folder,'wef-registered.json'),'utf8'));if(Array.isArray(reg?.apps))preRegistered=reg.apps;}catch{}
  const done:string[]=[],blocked:string[]=[];
  for(const app of ['Word','Excel','Powerpoint']){
   try{const wef=path.join(os.homedir(),`Library/Containers/com.microsoft.${app}/Data/Documents/wef`);fs.mkdirSync(wef,{recursive:true});fs.writeFileSync(path.join(wef,'PVTA-Desktop.xml'),manifest);done.push(app);}
   catch(e){const code=(e as NodeJS.ErrnoException).code;if(code!=='EPERM'&&code!=='EACCES')throw e;if(preRegistered.includes(app))done.push(app);else blocked.push(app);}
  }
  // macOS bảo vệ thư mục dữ liệu của ứng dụng khác: thiếu quyền thì báo rõ cách cấp, không bỏ cả các ứng dụng còn lại.
  if(wanted.some(app=>blocked.includes(app))||!done.length)throw Error(`macOS đang chặn PVTA ghi tệp đăng ký vào thư mục của ${(wanted.filter(app=>blocked.includes(app)).length?wanted.filter(app=>blocked.includes(app)):blocked).join(', ')}. Mở Cài đặt hệ thống → Quyền riêng tư & Bảo mật → Toàn quyền truy cập ổ đĩa (hoặc Quản lý ứng dụng), bật PVTA, rồi thoát hẳn PVTA, mở lại và bấm Thiết lập kết nối.`);
  return {installed:true,registered:done,...(blocked.length?{blocked}:{})};
 }
 async trustMac(){
  await this.start();if(process.platform!=='darwin'||this.trusted)return;
  const folder=path.join(this.home,'office-plugin');
  // Trust only in the signed-in user's keychain. macOS may show its own consent UI.
  await new Promise<void>((resolve,reject)=>execFile('/usr/bin/security',['add-trusted-cert','-r','trustRoot','-k',path.join(os.homedir(),'Library/Keychains/login.keychain-db'),path.join(folder,'certs/ca.crt')],{timeout:120000},e=>e?reject(Error('macOS chưa cho phép chứng chỉ kết nối Office. Mở lại thiết lập và xác nhận hộp thoại của macOS.')):resolve()));
  this.trusted=true;
 }
 async execute(session:string,call:ToolCall){
  const s=this.sessions.get(session);if(!s)throw Error('Tài liệu Office không còn kết nối.');
  if(!TOOL_CATALOG.some(t=>t.host===s.host&&t.name===call.tool))throw Error('Công cụ không thuộc tài liệu đã chọn.');
  if(s.socket&&s.socket.readyState===WebSocket.OPEN){
   const socket=s.socket;
   const id=randomUUID();return new Promise<unknown>((resolve,reject)=>{
    const timer=setTimeout(()=>{this.pending.delete(id);socket.send(JSON.stringify({type:'cancel',id}));reject(Error('Office chưa trả kết quả. Kiểm tra tài liệu và bảng PVTA trong Office trước khi thử lại.'));},180000);
    this.pending.set(id,{session,resolve,reject,timer});socket.send(JSON.stringify({type:'execute',id,call}),e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
   });
  }
  if(s.file&&fs.existsSync(s.file)){
   await syncOfficeDocumentBeforeRead(s.file,s.host);
   const out=await pythonJob({op:'office_direct_tool',path:s.file,host:s.host,tool:call.tool,args:call.args}) as {result?:unknown};
   if(!isReadTool(call.tool))await reloadOfficeDocumentAfterWrite(s.file,s.host);
   return out?.result;
  }
  throw Error('Tài liệu Office không còn kết nối.');
 }
 stop(){this.launches.clear();this.selected='';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Đã ngắt kết nối Office.'));}this.pending.clear();for(const s of this.sessions.values())s.socket?.close();this.sessions.clear();this.wss?.close();this.server?.close();this.wss=undefined;this.server=undefined;this.token=randomBytes(24).toString('hex');}
}
