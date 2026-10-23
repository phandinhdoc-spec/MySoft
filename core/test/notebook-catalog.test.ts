import {describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-cat-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);return {r,dir};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
const wait=async(f:()=>Promise<boolean>)=>{for(let i=0;i<150;i++){if(await f())return;await new Promise(r=>setTimeout(r,20));}};
async function book(r:DesktopRuntime,dir:string,name:string,files:Record<string,string>){
 const nb=await req(r,'nb.create',{name});const paths=Object.entries(files).map(([n,t])=>{const d=path.join(dir,name);fs.mkdirSync(d,{recursive:true});const f=path.join(d,n);fs.writeFileSync(f,t+' Đây là đoạn nội dung đủ dài để sổ nguồn đọc được và lập chỉ mục cho kiểm thử.');return f;});
 await req(r,'nb.addFiles',{id:nb.id,paths});
 await wait(async()=>{const b=await req(r,'nb.get',{id:nb.id});return b.sources.length===paths.length&&b.sources.every((s:any)=>s.state==='san-sang');});
 return nb;
}
const host=(r:DesktopRuntime)=>(r as any).notebooks;

describe('Danh mục tệp và đọc trọn tệp của sổ nguồn liên kết',()=>{
 it('danh mục liệt kê mọi tệp của nhiều sổ kể cả khi câu hỏi không khớp đoạn nào',async()=>{
  const {r,dir}=setup();
  const a=await book(r,dir,'Sổ A',{'de-cuong.md':'Đề cương chương một về tế bào.','bai-tap.md':'Bài tập về phân bào.'});
  const b=await book(r,dir,'Sổ B',{'de-cuong.md':'Đề cương chương hai về di truyền.'});
  const out=host(r).grounding([a.id,b.id],'xyz không liên quan');
  expect(out).toContain('Sổ «Sổ A»');expect(out).toContain('Sổ «Sổ B»');
  expect(out).toContain('bai-tap.md');expect(out.match(/de-cuong\.md/g)).toHaveLength(2);
  expect(out).toContain('notebook_source_read');
 });
 it('không có sổ liên kết hoặc sổ đã xóa thì không có gì',async()=>{
  const {r,dir}=setup();const a=await book(r,dir,'Sổ A',{'a.md':'Nội dung A.'});
  expect(host(r).grounding(undefined,'a')).toBe('');expect(host(r).grounding([],'a')).toBe('');
  await req(r,'nb.remove',{id:a.id});expect(host(r).grounding([a.id],'a')).toBe('');
 });
 it('tệp đang tắt không có trong danh mục và không đọc được',async()=>{
  const {r,dir}=setup();const a=await book(r,dir,'Sổ A',{'mo.md':'Tệp mở.','tat.md':'Tệp tắt.'});
  const full=await req(r,'nb.get',{id:a.id});const off=full.sources.find((s:any)=>s.title==='tat.md');
  await req(r,'nb.toggle',{id:a.id,sid:off.id,on:false});
  const out=host(r).grounding([a.id],'');expect(out).toContain('mo.md');expect(out).not.toContain('tat.md');
  expect(()=>host(r).read([a.id],{source:'tat.md'})).toThrow('Không thấy tệp');
 });
 it('đọc trọn tệp theo trang và báo vị trí đọc tiếp',async()=>{
  const {r,dir}=setup();const text='Câu số một. '.repeat(40);
  const a=await book(r,dir,'Sổ A',{'dai.md':text});
  const first=host(r).read([a.id],{source:'dai.md',start:0,length:100});
  expect(first.text.length).toBe(100);expect(first.next).toBe(100);expect(first.total).toBeGreaterThan(100);
  const rest=host(r).read([a.id],{source:'dai.md',start:100,length:20000});
  expect(rest.next).toBeNull();expect(first.text+rest.text).toContain('Câu số một.');
 });
 it('tệp trùng tên ở hai sổ: phải chỉ rõ sổ, và không đọc được sổ chưa liên kết',async()=>{
  const {r,dir}=setup();
  const a=await book(r,dir,'Sổ A',{'de-cuong.md':'Bản của sổ A.'});
  const b=await book(r,dir,'Sổ B',{'de-cuong.md':'Bản của sổ B.'});
  const c=await book(r,dir,'Sổ C',{'bi-mat.md':'Không được đọc.'});
  expect(()=>host(r).read([a.id,b.id],{source:'de-cuong.md'})).toThrow('trùng tên');
  expect(host(r).read([a.id,b.id],{notebook:'Sổ B',source:'de-cuong.md'}).text).toContain('sổ B');
  expect(host(r).read([a.id,b.id],{notebook:b.id,source:'de-cuong.md'}).notebook).toBe('Sổ B');
  expect(()=>host(r).read([a.id,b.id],{source:'bi-mat.md'})).toThrow();
  expect(()=>host(r).read([a.id,b.id],{notebook:'Sổ C',source:'bi-mat.md'})).toThrow('chưa được liên kết');
  expect(()=>host(r).read([],{source:'x'})).toThrow('Chưa có sổ nguồn');
  void c;
 });
 it('danh mục có trần: vượt thì ghi số tệp còn lại',async()=>{
  const {r,dir}=setup();const files:Record<string,string>={};for(let i=0;i<30;i++)files[`tai-lieu-${String(i).padStart(2,'0')}.md`]=`Nội dung ${i}.`;
  const a=await book(r,dir,'Sổ lớn',files);
  const out=host(r).catalog([a.id],900);expect(out.length).toBeLessThan(1200);expect(out).toMatch(/còn \d+ tệp chưa liệt kê/);
 });
 it('nb.sources trả danh sách tệp theo sổ, bỏ sổ đã xóa',async()=>{
  const {r,dir}=setup();const a=await book(r,dir,'Sổ A',{'a.md':'A.'});const b=await book(r,dir,'Sổ B',{'b.md':'B.'});
  await req(r,'nb.remove',{id:b.id});
  const v=await req(r,'nb.sources',{ids:[a.id,b.id]});
  expect(v).toHaveLength(1);expect(v[0].name).toBe('Sổ A');expect(v[0].sources[0]).toMatchObject({title:'a.md',on:true,state:'san-sang'});
 });
 it('chat chỉ đọc được sổ của chính nó và của dự án',async()=>{
  const {r,dir}=setup();
  const a=await book(r,dir,'Sổ A',{'a.md':'Bản A.'});const b=await book(r,dir,'Sổ B',{'b.md':'Bản B.'});
  const projectId=await req(r,'saveProject',{name:'KHTN'});const chat=await req(r,'newChat',{projectId});const id=typeof chat==='string'?chat:chat.id??chat.chatId;
  await req(r,'setNotebookLinks',{scope:'project',id:projectId,notebookIds:[a.id]});
  await req(r,'setNotebookLinks',{scope:'chat',id,notebookIds:[b.id]});
  const c=(r as any).store.data.chats.find((x:any)=>x.id===id);
  expect((r as any).linkedNotebooks(c).sort()).toEqual([a.id,b.id].sort());
  const ctx=(r as any).context(c,'câu hỏi');expect(ctx).toContain('a.md');expect(ctx).toContain('b.md');
 });
});
