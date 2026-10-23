import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-dnb-'));roots.push(dir);const events:any[]=[];const r=new DesktopRuntime(e=>events.push(e),dir);runtimes.push(r);return {r,dir,events,spy:vi.spyOn(r.engine,'run')};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
const wait=async(f:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await f())return;await new Promise(r=>setTimeout(r,20));}};

describe('Sổ nguồn trong ứng dụng',()=>{
 it('tạo sổ, thêm tệp, hỏi chỉ từ nguồn, nhận trích dẫn; định dạng lạ báo ngay',async()=>{
  const {r,dir,events,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  const f=path.join(dir,'quang-hop.md');fs.writeFileSync(f,'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ từ khí carbon dioxide và nước nhờ năng lượng ánh sáng, giải phóng khí oxygen.');
  const bad=path.join(dir,'x.exe');fs.writeFileSync(bad,'x');
  const nb=await req(r,'nb.create',{name:'KHTN 7'});
  const added=await req(r,'nb.addFiles',{id:nb.id,paths:[f,bad]});
  expect(added.queued).toBe(1);expect(added.errors[0]).toContain('Chưa hỗ trợ');
  await wait(async()=>(await req(r,'nb.get',{id:nb.id})).sources[0]?.state==='san-sang');
  expect(events.some(e=>e.event==='notebook'&&e.data.id===nb.id)).toBe(true);
  spy.mockResolvedValue({text:'Quang hợp giải phóng khí oxygen [1].',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never);
  const m=await req(r,'nb.ask',{id:nb.id,question:'Quang hợp giải phóng khí gì?'});
  expect(m.grounded).toBe(true);expect(m.citations[0].title).toBe('quang-hop.md');
  expect(String((spy.mock.calls[0]![0] as any).system)).toContain('CHỈ dựa trên các NGUỒN');
  expect((await req(r,'nb.list')).map((x:any)=>x.name)).toEqual(['KHTN 7']);
  const recent=await req(r,'nb.recentSources');expect(recent).toHaveLength(1);expect(recent[0]).toMatchObject({bookId:nb.id,bookName:'KHTN 7',title:'quang-hop.md'});expect(recent[0]).not.toHaveProperty('messages');
  await expect(req(r,'nb.addUrl',{id:nb.id,url:'ftp://x'})).rejects.toThrow('https');
  events.length=0;await req(r,'nb.remove',{id:nb.id});expect(await req(r,'nb.recentSources')).toEqual([]);expect(events.some(e=>e.event==='notebook'&&e.data.id===nb.id)).toBe(true);
 });
 it('quy tắc cá nhân luôn áp dụng đi vào lời nhắc của sổ nguồn, quy tắc gọi bằng # thì không',async()=>{
  const {r,dir,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  await req(r,'saveRule',{rule:{title:'Xưng hô',text:'QT-SONGUON-LUON',always:true}});
  await req(r,'saveRule',{rule:{title:'Chỉ khi gọi',text:'QT-SONGUON-GOI',always:false}});
  const f=path.join(dir,'bai.md');fs.writeFileSync(f,'Quang hợp giải phóng khí oxygen.');
  const nb=await req(r,'nb.create',{name:'Sổ thử'});await req(r,'nb.addFiles',{id:nb.id,paths:[f]});
  await wait(async()=>(await req(r,'nb.get',{id:nb.id})).sources[0]?.state==='san-sang');
  spy.mockResolvedValue({text:'Có [1].',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never);
  await req(r,'nb.ask',{id:nb.id,question:'Quang hợp giải phóng khí gì?'});
  const system=String((spy.mock.calls[0]![0] as any).system);
  expect(system).toContain('QT-SONGUON-LUON');expect(system).not.toContain('QT-SONGUON-GOI');
 });
});
