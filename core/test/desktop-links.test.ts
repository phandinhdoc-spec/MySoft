import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-link-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);return {r,dir};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
const wait=async(f:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await f())return;await new Promise(r=>setTimeout(r,20));}};
async function notebook(r:DesktopRuntime,dir:string){
 const f=path.join(dir,'quang-hop.md');fs.writeFileSync(f,'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ từ khí carbon dioxide và nước nhờ năng lượng ánh sáng.');
 const nb=await req(r,'nb.create',{name:'KHTN 7'});await req(r,'nb.addFiles',{id:nb.id,paths:[f]});
 await wait(async()=>(await req(r,'nb.get',{id:nb.id})).sources[0]?.state==='san-sang');return nb;
}

describe('Liên kết Sổ nguồn với dự án, chat, quy trình',()=>{
 it('ngữ cảnh chat có đoạn nguồn từ sổ liên kết với dự án hoặc chat; bỏ liên kết thì mất',async()=>{
  const {r,dir}=setup();const nb=await notebook(r,dir);
  const projectId=await req(r,'saveProject',{name:'KHTN'});const chatId=(await req(r,'newChat',{projectId})) as any;
  const id=typeof chatId==='string'?chatId:chatId.id??chatId.chatId;
  const chat=()=>(r as any).store.data.chats.find((c:any)=>c.id===id);
  const ctx=()=>(r as any).context(chat(),'Quang hợp tổng hợp chất hữu cơ từ khí carbon dioxide');
  expect(ctx()).not.toContain('NGUỒN TỪ SỔ NGUỒN');
  await req(r,'setNotebookLinks',{scope:'project',id:projectId,notebookIds:[nb.id,'khong-ton-tai']});
  expect((r as any).store.data.projects[0].notebookIds).toEqual([nb.id]);
  expect(ctx()).toContain('NGUỒN TỪ SỔ NGUỒN');expect(ctx()).toContain('KHTN 7 · quang-hop.md');
  await req(r,'setNotebookLinks',{scope:'project',id:projectId,notebookIds:[]});
  expect(ctx()).not.toContain('NGUỒN TỪ SỔ NGUỒN');
  await req(r,'setNotebookLinks',{scope:'chat',id,notebookIds:[nb.id]});expect(ctx()).toContain('NGUỒN TỪ SỔ NGUỒN');
  await req(r,'nb.remove',{id:nb.id});expect(ctx()).not.toContain('NGUỒN TỪ SỔ NGUỒN');
  await expect(req(r,'setNotebookLinks',{scope:'chat',id:'nope',notebookIds:[]})).rejects.toThrow('Không tìm thấy');
 });
 it('quy trình giữ liên kết sổ nguồn sau khi lưu lại',async()=>{
  const {r,dir}=setup();const nb=await notebook(r,dir);
  const wf={id:'w1',name:'Ôn tập',steps:[{id:'s1',name:'Tóm tắt',prompt:'Tóm tắt',choice:'auto',access:'read'}]};
  await req(r,'workflowSave',{workflow:wf});await req(r,'setNotebookLinks',{scope:'workflow',id:'w1',notebookIds:[nb.id]});
  await req(r,'workflowSave',{workflow:{...wf,name:'Ôn tập 2'}});
  expect((r as any).store.data.workflows[0].notebookIds).toEqual([nb.id]);
  expect((r as any).notebooks.grounding([nb.id],'quang hợp là gì')).toContain('quang-hop.md');
 });
});

describe('Dự án nhiều thư mục',()=>{
 it('thêm nhiều thư mục, bỏ trùng và thư mục không hợp lệ, gỡ thì chuyển thư mục lưu chính',async()=>{
  const {r,dir}=setup();const a=path.join(dir,'a'),b=path.join(dir,'b'),file=path.join(dir,'x.txt');fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(file,'x');
  const projectId=await req(r,'saveProject',{name:'STEM'});
  const res=await req(r,'projectAddFolders',{projectId,folders:[a,b,a,file,'tuong-doi']});
  expect(res.added).toHaveLength(2);expect(res.skipped).toHaveLength(1);
  const pr=()=>(r as any).store.data.projects[0];
  expect(pr().folders).toHaveLength(2);expect(pr().outputDir).toBe(pr().folders[0]);
  const first=pr().folders[0];await req(r,'projectRemoveFolder',{projectId,folder:first});
  expect(pr().folders).toHaveLength(1);expect(pr().outputDir).toBe(pr().folders[0]);
  await expect(req(r,'projectRemoveFolder',{projectId,folder:first})).rejects.toThrow('không thuộc');
  await req(r,'projectAddFolders',{projectId,folders:[a,b]});
  expect((r as any).workspacePrompt(pr())).toContain('lưu chính');
  expect(fs.existsSync(a)&&fs.existsSync(b)).toBe(true);
 });
});
