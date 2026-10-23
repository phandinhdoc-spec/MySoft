import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-grp-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.store.data.documentsDir=path.join(dir,'Documents');return {r,dir,spy:vi.spyOn(r.engine,'run')};}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const names=(r:DesktopRuntime)=>(r.skills.list() as {name:string;load:string}[]).filter(s=>s.load!=='off').map(s=>s.name);

describe('nhóm trong ứng dụng',()=>{
 it('chưa chọn nhóm: mọi skill như trước, view báo chưa cấu hình',async()=>{
  const {r}=setup();expect(r.view().groups?.configured).toBe(false);expect(names(r)).toContain('office-giao-an');expect(names(r)).toContain('office-live');
 });
 it('chọn nhóm: skill gắn nhóm khác bị lọc, skill không gắn nhóm vẫn còn',async()=>{
  const {r}=setup();await req(r,'groups.setEnabled',{ids:['ke-toan']});
  expect(r.view().groups?.configured).toBe(true);
  expect(names(r)).not.toContain('office-giao-an');expect(names(r)).toContain('office-bao-cao');expect(names(r)).toContain('office-live');
  await req(r,'groups.toggle',{id:'giao-vien',on:true});expect(names(r)).toContain('office-giao-an');
 });
 it('quy tắc của nhóm vào hệ lệnh gửi cho AI; nhóm đã tắt thì không',async()=>{
  const {r,dir,spy}=setup();await req(r,'groups.setEnabled',{ids:['van-thu']});
  fs.writeFileSync(path.join(dir,'groups','van-thu','rules.md'),'Cỡ chữ nội dung 14, Times New Roman.');
  await req(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValue({text:'ok',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never);
  const chatId=await req(r,'newChat');await req(r,'send',{chatId,text:'soạn công văn'});
  expect(JSON.stringify(spy.mock.calls[0]![0])).toContain('Cỡ chữ nội dung 14');
 });
 it('RPC kiểm tra căn cứ và bản tin chạy cục bộ; ngoài cổng groups.* vẫn báo không hỗ trợ',async()=>{
  const {r}=setup();await req(r,'groups.setEnabled',{ids:['hieu-truong']});
  const res:any=await req(r,'groups.checkBasis',{text:'Căn cứ Nghị định số 115/2020/NĐ-CP;\nQuyết định...'});
  expect(res.report.cited).toBe(1);expect(res.report.unknown[0].no).toBe('115/2020/NĐ-CP');
  const b:any=await req(r,'groups.briefing');expect(b).toHaveProperty('items');
  await expect(req(r,'groups.khongCo')).rejects.toThrow('không được hỗ trợ');
  await req(r,'groups.offline',{on:true});expect(r.view().groups?.offline).toBe(true);
 });
});

describe('tìm văn bản mới chạy ngầm',()=>{
 it('init hẹn một lần; offline thì không gọi mạng; đóng ứng dụng thì hủy hẹn',async()=>{
  vi.useFakeTimers();
  try{
   const {r}=setup();await req(r,'groups.setEnabled',{ids:['giao-vien']});await req(r,'groups.offline',{on:true});
   const run=vi.spyOn(r.groups,'runDiscovery');
   await req(r,'init');await req(r,'init');
   await vi.advanceTimersByTimeAsync(61_000);expect(run).toHaveBeenCalledTimes(1);
   await vi.advanceTimersByTimeAsync(6*3600_000+1000);expect(run).toHaveBeenCalledTimes(2);
   r.dispose();await vi.advanceTimersByTimeAsync(7*3600_000);expect(run).toHaveBeenCalledTimes(2);
  }finally{vi.useRealTimers();}
 });
});
it('saves discovery profile and manages institutional sources without accepting private links',async()=>{
 const {r}=setup();
 await r.dispatch({id:'profile',method:'groups.profile',params:{profile:{province:'Hồ Chí Minh',level:'THCS',subjects:'KHTN'}}});
 expect(r.view().groups?.profile).toMatchObject({province:'Hồ Chí Minh',level:'THCS'});
 await r.dispatch({id:'source',method:'groups.saveSource',params:{name:'Nguồn trường',url:'https://school.edu.vn/van-ban',kind:'page',groups:['giao-vien']}});
 const source=r.view().groups?.sources?.find(s=>s.name==='Nguồn trường');expect(source?.groups).toEqual(['giao-vien']);
 await r.dispatch({id:'disable',method:'groups.saveSource',params:{...source,enabled:false}});expect(r.view().groups?.sources?.find(s=>s.id===source?.id)?.enabled).toBe(false);
 await expect(r.dispatch({id:'private',method:'groups.saveSource',params:{name:'bad',url:'https://127.0.0.1/'}})).rejects.toThrow('HTTPS');
});
