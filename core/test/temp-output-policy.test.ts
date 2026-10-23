import {it,expect,afterEach,beforeEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {resultDir,tempResultDir} from '../src/desktop/office-capabilities';

// Mỗi test dùng thư mục tạm dùng chung riêng, không ghi vào /tmp thật.
beforeEach(()=>{process.env.PVTA_RESULT_DIR=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-policy-')),'PVTA-Ket-qua');});
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));});
const rpc=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
async function setup(){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-policy-home-')));roots.push(home);const r=new DesktopRuntime(()=>{},home);runtimes.push(r);r.store.data.documentsDir=path.join(home,'Documents');return {r,home,chatId:await rpc(r,'newChat')};}
const policy=(r:DesktopRuntime)=>r as never as {projectOutput(c:unknown):string;chosenSaveDir(c:unknown):string;prepareOutput(dir:string):Promise<void>};

it('mặc định đầu ra là thư mục tạm dùng chung, không phải Documents',()=>{
 expect(resultDir('/home/x/Documents')).toBe(tempResultDir());
 expect(tempResultDir()).toBe(process.env.PVTA_RESULT_DIR);
});

it('thư mục tạm được tạo với quyền đọc/ghi cho mọi người (1777)',async()=>{
 const {r}=await setup();
 const dir=tempResultDir();
 await policy(r).prepareOutput(dir);
 expect(fs.statSync(dir).mode & 0o7777).toBe(0o1777);
});

it('«Lưu» không có nơi lưu đã chọn thì báo cần «Lưu như…»',async()=>{
 const {r,chatId}=await setup();
 const c=r.store.data.chats.find(x=>x.id===chatId);
 expect(()=>policy(r).chosenSaveDir(c)).toThrow('Lưu như');
});

it('«Lưu» dùng nơi đã chọn khi thư mục đó còn tồn tại',async()=>{
 const {r,home,chatId}=await setup();
 const chosen=path.join(home,'Lop-8A');fs.mkdirSync(chosen);
 await rpc(r,'attach',{chatId,paths:[chosen]});
 await rpc(r,'selectOutput',{chatId,dir:chosen});
 const c=r.store.data.chats.find(x=>x.id===chatId);
 expect(policy(r).chosenSaveDir(c)).toBe(chosen);
});

it('nơi đã chọn bị xóa thì rơi về thư mục tạm và không tạo lại',async()=>{
 const {r,home,chatId}=await setup();
 const chosen=path.join(home,'Lop-8B');fs.mkdirSync(chosen);
 await rpc(r,'attach',{chatId,paths:[chosen]});
 await rpc(r,'selectOutput',{chatId,dir:chosen});
 fs.rmdirSync(chosen);
 const c=r.store.data.chats.find(x=>x.id===chatId);
 expect(policy(r).projectOutput(c)).toBe(tempResultDir());
 expect(fs.existsSync(chosen)).toBe(false);
});
