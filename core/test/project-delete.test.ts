import {afterEach,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';

const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));});

async function setup(){
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-project-delete-')));roots.push(home);
 const r=new DesktopRuntime(()=>{},home);runtimes.push(r);
 const call=(method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
 const projectId=await call('saveProject',{name:'Lớp 8A'});const chatId=await call('newChat',{projectId});
 const folder=path.join(home,'Lop-8A');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'bao-cao.md'),'Tệp của giáo viên');
 await call('attach',{chatId,paths:[folder],scope:'project',folder:true});
 const selfDir=path.join(folder,'.pvta','self',`project-${projectId}`);fs.mkdirSync(selfDir,{recursive:true});fs.writeFileSync(path.join(selfDir,'ghi-nho.md'),'vùng AI');
 return {r,call,projectId,chatId,folder,selfDir};
}

it('chỉ xóa dự án (keepFolders) giữ nguyên thư mục trên máy, vùng AI trong thư mục và hội thoại',async()=>{
 const s=await setup();
 await s.call('deleteProject',{id:s.projectId,keepFolders:true});
 expect(s.r.store.data.projects.find(p=>p.id===s.projectId)).toBeUndefined();
 const chat=s.r.store.data.chats.find(c=>c.id===s.chatId);
 expect(chat).toBeDefined();expect(chat?.projectId).toBeUndefined();
 expect(fs.readFileSync(path.join(s.folder,'bao-cao.md'),'utf8')).toBe('Tệp của giáo viên');
 expect(fs.existsSync(s.selfDir)).toBe(true);
});

it('xóa thường chỉ dọn vùng .pvta/self của dự án, không xóa tệp của người dùng',async()=>{
 const s=await setup();
 await s.call('deleteProject',{id:s.projectId});
 expect(s.r.store.data.projects.find(p=>p.id===s.projectId)).toBeUndefined();
 expect(fs.existsSync(s.selfDir)).toBe(false);
 expect(fs.readFileSync(path.join(s.folder,'bao-cao.md'),'utf8')).toBe('Tệp của giáo viên');
});
