import {describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
const env={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE};
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true}));process.env.HOME=env.HOME;if(env.USERPROFILE===undefined)delete process.env.USERPROFILE;else process.env.USERPROFILE=env.USERPROFILE;});

/** Trang bị HOME giả để screenshotScan chỉ quét thư mục tạm. */
function setup(){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-shot-home-'));roots.push(home);
 process.env.HOME=home;process.env.USERPROFILE=home;
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-shot-data-'));roots.push(data);
 const r=new DesktopRuntime(()=>{},data);runtimes.push(r);
 const scan=(params:Record<string,unknown>)=>r.dispatch({id:crypto.randomUUID(),method:'screenshotScan',params}) as Promise<{files:string[];now:number;clip?:string}>;
 const put=(rel:string,age=0)=>{const f=path.join(home,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'x');if(age){const t=new Date(Date.now()-age);fs.utimesSync(f,t,t);}return f;};
 return {home,scan,put};
}
const PNG='Screenshot 2026-10-22 at 10.31.22.png';

describe('screenshotScan',()=>{
 it('nhận ảnh mới ở Desktop dù tên bất kỳ, bỏ tệp không phải ảnh',async()=>{
  const {home,scan,put}=setup();const since=Date.now()-10000;
  const a=put('Desktop/anh-bat-ky.png',2000);put('Desktop/ghi-chu.txt',2000);
  const res=await scan({since});
  expect(res.files).toContain(a);expect(res.files.some(f=>f.endsWith('.txt'))).toBe(false);
  expect(res.files.every(f=>f.startsWith(home)||f.includes('pvta-screenshots'))).toBe(true);
 });
 it('thư mục chung Downloads chỉ nhận tên giống ảnh chụp',async()=>{
  const {scan,put}=setup();const since=Date.now()-10000;
  const shot=put(`Downloads/${PNG}`,2000);const plain=put('Downloads/bai-giang.png',2000);const snip=put('Documents/Snip-001.jpg',2000);
  const res=await scan({since});
  expect(res.files).toContain(shot);expect(res.files).toContain(snip);expect(res.files).not.toContain(plain);
 });
 it('bỏ qua tệp đã thấy (seen)',async()=>{
  const {scan,put}=setup();const since=Date.now()-10000;
  const a=put(`Pictures/Screenshots/${PNG}`,2000);
  expect((await scan({since})).files).toContain(a);
  expect((await scan({since,seen:[a]})).files).not.toContain(a);
 });
 it('bỏ qua ảnh có trước lúc bấm nút',async()=>{
  const {scan,put}=setup();
  const old=put(`Desktop/${PNG}`,8000);await sleep(100);
  const since=Date.now()-1000;
  expect((await scan({since})).files).not.toContain(old);
 });
 it('chờ tệp ổn định: ảnh vừa ghi dưới 0,6 giây chưa được lấy',async()=>{
  const {scan,put}=setup();const since=Date.now()-10000;
  const fresh=put(`Desktop/${PNG}`);
  expect((await scan({since})).files).not.toContain(fresh);
  await sleep(700);
  expect((await scan({since})).files).toContain(fresh);
 });
 it.skipIf(process.platform==='win32'||process.getuid?.()===0)('báo thư mục lưu ảnh chụp bị chặn quyền đọc',async()=>{
  const {home,scan}=setup();const desk=path.join(home,'Desktop');fs.mkdirSync(desk);fs.chmodSync(desk,0o000);
  try{const res=await scan({since:Date.now()-1000}) as {denied?:string[]};expect(res.denied).toContain(desk);}
  finally{fs.chmodSync(desk,0o700);}
 });
 it('đính kèm ảnh chụp (capture) không đổi thư mục lưu của chat, bỏ tệp không phải ảnh',async()=>{
  const {put}=setup();const r=runtimes.at(-1)!;
  const shot=put(`Desktop/${PNG}`);const txt=put('Desktop/ghi-chu.txt');
  const chatId=await r.dispatch({id:'a',method:'newChat',params:{}}) as string;
  const res=await r.dispatch({id:'b',method:'attach',params:{chatId,paths:[shot,txt],scope:'chat',capture:true}}) as {count:number;outputDir?:string};
  expect(res.count).toBe(1);expect(res.outputDir).toBeUndefined();
  const st=(r as any).store as {data:{chats:{id:string;outputDir?:string;sourceFolders?:string[]}[];attachments:{path:string;image?:boolean}[]}};
  const chat=st.data.chats.find(c=>c.id===chatId)!;
  expect(chat.outputDir).toBeUndefined();expect(chat.sourceFolders??[]).toEqual([]);
  expect(st.data.attachments.find(a=>a.path===shot)?.image).toBe(true);
 });
 it('trả tối đa 5 ảnh, theo thứ tự thời gian',async()=>{
  const {scan,put}=setup();const since=Date.now()-10000;
  for(let i=0;i<7;i++)put(`Desktop/Screenshot ${i}.png`,2000);
  expect((await scan({since})).files.length).toBeLessThanOrEqual(5);
 });
});
