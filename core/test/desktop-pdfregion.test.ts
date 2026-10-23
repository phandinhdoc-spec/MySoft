import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-reg-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.store.data.documentsDir=path.join(dir,'Documents');return {r,dir,spy:vi.spyOn(r.engine,'run')};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
/** PNG 1×1 hợp lệ. */
function png(){const crc=(b:Buffer)=>{let c=~0;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return (~c)>>>0;};const chunk=(t:string,d:Buffer)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.from([0,255,255,255]))),chunk('IEND',Buffer.alloc(0))]);}

describe('PDF: khoanh vùng',()=>{
 it('lưu ảnh vùng vào captures, trả về đường dẫn; dữ liệu lạ bị từ chối',async()=>{
  const {r,dir}=setup();
  const out=await req(r,'pdfRegion',{data:'data:image/png;base64,'+png().toString('base64')});
  expect(path.dirname(out.path)).toBe(path.join(dir,'captures'));expect(fs.existsSync(out.path)).toBe(true);
  expect(typeof out.text).toBe('string');
  await expect(req(r,'pdfRegion',{data:'data:image/png;base64,'+Buffer.from('không phải ảnh png nhưng đủ dài để vượt ngưỡng sáu mươi tư byte tối thiểu nhé').toString('base64')})).rejects.toThrow('PNG');
  await expect(req(r,'pdfRegion',{data:'data:text/html;base64,AAAA'})).rejects.toThrow('không hợp lệ');
 });
 it('ảnh vùng chỉ đi kèm đúng tin nhắn đó; đường dẫn ngoài captures bị bỏ qua',async()=>{
  const {r,dir,spy}=setup();
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValue({text:'Đây là lời giải.',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never);
  const cap=await req(r,'pdfRegion',{data:'data:image/png;base64,'+png().toString('base64')});
  const outside=path.join(dir,'khac.png');fs.writeFileSync(outside,png());
  const chatId=await req(r,'newChat');
  await req(r,'send',{chatId,text:'Giải bài trong ảnh',images:[cap.path,outside,'/etc/passwd']});
  const first=spy.mock.calls.find(c=>!/Đặt một tên/.test(String((c[0] as any).system)))![0] as any;
  expect(first.images).toEqual([cap.path]);
  spy.mockClear();
  await req(r,'send',{chatId,text:'Câu tiếp theo'});
  const second=spy.mock.calls.find(c=>!/Đặt một tên/.test(String((c[0] as any).system)))![0] as any;
  expect(second.images??[]).toEqual([]);
 });
});
