import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {normalizeWorkflow} from '../src/desktop/workflows';
import type {Workflow} from '../src/desktop/types';

// Kiểm thử RPC cấp ứng dụng: nhiều quy trình chạy đồng thời, hủy chọn lọc, sửa/xóa khi đang bận.
// Mô hình được giả lập: mỗi bước chờ đến khi kiểm thử gọi finish(marker) hoặc bị hủy qua signal.
// Luồng thật: workflowRun không có promptApproval chỉ trả phiếu duyệt; gọi lại với token mới bắt đầu chạy.

const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.forEach(r=>r.dispose());runtimes.length=0;roots.forEach(p=>fs.rmSync(p,{recursive:true,force:true}));roots.length=0;vi.restoreAllMocks();});

const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const result=(text:string)=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}});
const MARKERS=['MAU-A','MAU-B','MAU-C'];

/** Nút có promptFormat yaml-v1 không gọi mô hình viết lại prompt, chỉ cần duyệt bản sẵn có. */
const wf=(name:string,steps:{prompt:string;access?:'full'}[],folder?:string)=>{
 const w=normalizeWorkflow({name,folder,steps});
 for(const s of w.steps)s.promptFormat='yaml-v1';
 return w;
};

function setup(workflows:Workflow[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-indep-'));roots.push(dir);
 const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
 r.store.data.preferences.choice={backend:'api',model:'mock/mini'};
 r.store.data.workflows=workflows;
 const calls:string[]=[];const finishers=new Map<string,(v:ReturnType<typeof result>)=>void>();
 vi.spyOn(r.engine,'run').mockImplementation(async(o:any)=>{
  const text=typeof o.buildPrompt==='function'?String(o.buildPrompt(false,false)??''):'';
  const marker=MARKERS.find(m=>text.includes(m));
  if(!marker)return result('ok');
  calls.push(marker);
  return new Promise(ok=>finishers.set(marker,ok));
 });
 const waitFor=async(m:string)=>{for(let i=0;i<300&&!calls.includes(m);i++)await new Promise(res=>setTimeout(res,5));expect(calls).toContain(m);};
 const finish=(m:string)=>{const f=finishers.get(m);if(!f)throw Error('chưa có lượt gọi '+m);f(result('xong '+m));};
 return {r,calls,waitFor,finish,dir};
}

/** Bắt đầu một lượt chạy đúng luồng sản phẩm: lấy phiếu duyệt rồi gửi lại token để chạy. Trả về promise kết quả lượt chạy. */
async function startRun(r:DesktopRuntime,id:string):Promise<{done:Promise<any>}>{
 const first=await req(r,'workflowRun',{id}) as any;
 const token=first?.promptReview?.token;
 if(typeof token!=='string')throw Error('Không nhận được phiếu duyệt: '+JSON.stringify(first).slice(0,200));
 return {done:req(r,"workflowRun",{id,promptApproval:token}) as Promise<any>};
}

it('chạy A và B đồng thời; từ chối chạy trùng A; dừng A không dừng B; sửa và xóa C khi A, B đang chạy',async()=>{
 const A=wf('A',[{prompt:'MAU-A'}]),B=wf('B',[{prompt:'MAU-B'}]),C=wf('C',[{prompt:'MAU-C'}]);
 const {r,calls,waitFor,finish}=setup([A,B,C]);
 const ta=await startRun(r,A.id);
 const tb=await startRun(r,B.id);
 await waitFor('MAU-A');await waitFor('MAU-B');
 expect((r as any).workflows.isRunning(A.id)).toBe(true);
 expect((r as any).workflows.isRunning(B.id)).toBe(true);

 // Chạy trùng A bị từ chối, không gọi mô hình thêm.
 await expect(req(r,'workflowRun',{id:A.id})).rejects.toThrow('đang chạy');
 expect(calls.filter(m=>m==='MAU-A')).toHaveLength(1);

 // Dừng A chỉ tác động A.
 expect(await req(r,'workflowCancel',{id:A.id})).toBe(true);
 expect((await ta.done).status).toBe('cancelled');
 expect((r as any).workflows.isRunning(A.id)).toBe(false);
 expect((r as any).workflows.isRunning(B.id)).toBe(true);

 // C không bận: sửa và xóa C được, A và B không bị ảnh hưởng.
 const c=r.store.data.workflows!.find(w=>w.id===C.id)!;
 await req(r,'workflowSave',{workflow:{...c,name:'C đã sửa',steps:c.steps.map(s=>({...s,prompt:'MAU-C sửa'}))}});
 expect(r.store.data.workflows!.find(w=>w.id===C.id)?.name).toBe('C đã sửa');
 await req(r,'workflowDelete',{id:C.id});
 expect(r.store.data.workflows!.some(w=>w.id===C.id)).toBe(false);
 expect((r as any).workflows.isRunning(B.id)).toBe(true);

 finish('MAU-B');
 expect((await tb.done).status).toBe('success');
 expect((r as any).workflows.isRunning(B.id)).toBe(false);
});

it('khi A đang chạy, sửa và xóa A bị chặn; sau khi dừng A thì sửa được',async()=>{
 const A=wf('A',[{prompt:'MAU-A'}]);
 const {r,waitFor}=setup([A]);
 const ta=await startRun(r,A.id);
 await waitFor('MAU-A');
 const current=r.store.data.workflows![0]!;
 await expect(req(r,'workflowSave',{workflow:{...current,name:'Đổi tên'}})).rejects.toThrow('Dừng quy trình trước khi sửa');
 await expect(req(r,'workflowDelete',{id:A.id})).rejects.toThrow('Dừng quy trình trước khi xóa');
 expect(r.store.data.workflows![0]!.name).toBe('A');

 await req(r,'workflowCancel',{id:A.id});
 expect((await ta.done).status).toBe('cancelled');
 await req(r,'workflowSave',{workflow:{...current,name:'Đổi tên'}});
 expect(r.store.data.workflows![0]!.name).toBe('Đổi tên');
});

it('hủy tác vụ đang chờ khóa ghi (A) khi B đang giữ khóa: A không gọi mô hình, không để lại trạng thái chạy, C ghi được sau đó',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-indep-lock-'));roots.push(folder);
 const B=wf('B',[{prompt:'MAU-B',access:'full'}],folder);
 const A=wf('A',[{prompt:'MAU-A',access:'full'}],folder);
 const C=wf('C',[{prompt:'MAU-C',access:'full'}],folder);
 for(const w of [A,B,C])for(const s of w.steps)s.access='full';
 const {r,calls,waitFor,finish}=setup([A,B,C]);
 const tb=await startRun(r,B.id);
 await waitFor('MAU-B');
 const ta=await startRun(r,A.id);
 // A đang chờ khóa ghi vì B đang giữ; cho một nhịp để A vào hàng chờ.
 await new Promise(res=>setTimeout(res,30));
 expect((r as any).workflows.isRunning(A.id)).toBe(true);
 expect(calls).not.toContain('MAU-A');

 await req(r,'workflowCancel',{id:A.id});
 expect((await ta.done).status).toBe('cancelled');
 expect((r as any).workflows.isRunning(A.id)).toBe(false);
 expect(calls).not.toContain('MAU-A');
 // B vẫn chạy và hoàn tất.
 expect((r as any).workflows.isRunning(B.id)).toBe(true);
 finish('MAU-B');
 expect((await tb.done).status).toBe('success');

 // Không còn tác vụ treo: C (ghi) chạy được ngay.
 const tc=await startRun(r,C.id);
 await waitFor('MAU-C');
 finish('MAU-C');
 expect((await tc.done).status).toBe('success');
});
