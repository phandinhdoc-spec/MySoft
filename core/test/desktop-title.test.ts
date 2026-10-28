import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime,cleanTitle,fallbackTitle} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-title-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.store.data.documentsDir=path.join(dir,'Documents');return {r,spy:vi.spyOn(r.engine,'run')};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const wait=async(f:()=>boolean)=>{for(let i=0;i<100&&!f();i++)await new Promise(r=>setTimeout(r,20));};

describe('tên cuộc trò chuyện',()=>{
 it('làm sạch tên AI trả về',()=>{
  expect(cleanTitle('"Giải phương trình bậc hai."\nthêm dòng')).toBe('Giải phương trình bậc hai');
  expect(cleanTitle('  ')).toBe('');
  expect(cleanTitle('<｜DSML｜calls><｜DSML｜invoke name="x">')).toBe('');
  expect(cleanTitle('```json\n{"a":1}\n```')).toBe('');
  expect(cleanTitle('x'.repeat(200)).length).toBeLessThanOrEqual(60);
 });
 it('tên tạm lấy từ câu hỏi, cắt ở ranh giới từ',()=>{
  expect(fallbackTitle('  Soạn   giáo án  ')).toBe('Soạn giáo án');
  const t=fallbackTitle('Hãy giúp tôi soạn một bài giảng chi tiết về phản ứng oxi hóa khử cho học sinh lớp tám ở trường THCS');
  expect(t.endsWith('…')).toBe(true);expect(t.length).toBeLessThanOrEqual(61);
 });
 it('gửi câu hỏi đầu: có tên tạm ngay; sau trả lời, AI đặt tên thay thế', async()=>{
  const {r,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockImplementation(async(req:any)=>({text:/Đặt một tên/.test(req.system)?'"Phương trình bậc hai."':'Đây là lời giải.',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never));
  const chatId=await req(r,'newChat');
  await req(r,'send',{chatId,text:'giải phương trình x2 - 3x + 2 = 0'});
  expect(r.view().data.chats[0]!.title).toBe('giải phương trình x2 - 3x + 2 = 0');
  await wait(()=>r.view().data.chats[0]!.title==='Phương trình bậc hai');
  expect(r.view().data.chats[0]!.title).toBe('Phương trình bậc hai');
  await req(r,'send',{chatId,text:'giải thích thêm'});
  await req(r,'send',{chatId,text:'cho ví dụ khác'});
  expect(spy.mock.calls.filter(([q])=>/Đặt một tên/.test(q.system??''))).toHaveLength(1);
 });
 it('thầy cô đã đổi tên thì AI không ghi đè',async()=>{
  const {r,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  let titleCalls=0;
  spy.mockImplementation(async(req:any)=>{if(/Đặt một tên/.test(req.system))titleCalls++;return {text:/Đặt một tên/.test(req.system)?'Tên AI':'Trả lời',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never;});
  const chatId=await req(r,'newChat');
  await req(r,'renameChat',{chatId,title:'Lớp 8A - tiết 12'});
  await req(r,'send',{chatId,text:'câu hỏi'});
  await wait(()=>titleCalls>0||false);
  await new Promise(x=>setTimeout(x,150));
  expect(r.view().data.chats[0]!.title).toBe('Lớp 8A - tiết 12');
 });
});
