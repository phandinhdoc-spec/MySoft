import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {editPlanSteps,linkPlan} from '../src/desktop/plans';
import {cleanTemplateOrigin,normalizeWorkflow} from '../src/desktop/workflows';
import type {Plan} from '../src/desktop/types';

const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.forEach(r=>r.dispose());runtimes.length=0;roots.forEach(p=>fs.rmSync(p,{recursive:true,force:true}));roots.length=0;});
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const dirOf=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-origin-'));roots.push(dir);return dir;};
const open=(dir:string)=>{const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);return r;};
/** Đóng runtime rồi mở lại trên cùng thư mục dữ liệu: mô phỏng khởi động lại ứng dụng. */
const reopen=(r:DesktopRuntime,dir:string)=>{r.dispose();runtimes.splice(runtimes.indexOf(r),1);return open(dir);};
const makeTemplate=(r:DesktopRuntime)=>req(r,'templateSave',{template:{name:'Mẫu',params:[{key:'chu-de',label:'Chủ đề',required:true}],steps:[{id:'a',name:'Một',prompt:'Về {{chu-de}}'},{id:'b',name:'Hai',prompt:'Tiếp {{prev}}'}],output:{mode:'fixed',text:'Tệp .docx'}}}) as Promise<string>;

it('dữ liệu cũ chỉ có cờ templateCopy: giữ cờ, không tự gán nguồn gốc',()=>{
 const w=normalizeWorkflow({name:'Cũ',steps:[{id:'x',name:'X',prompt:'p',templateCopy:true},{id:'y',name:'Y',prompt:'q'}]});
 expect(w.steps[0]!.templateCopy).toBe(true);
 expect(w.steps[0]!.origin).toBeUndefined();
 expect(w.steps[1]!.templateCopy).toBeUndefined();
 expect(w.steps[1]!.origin).toBeUndefined();
});

it('chỉ nhận nguồn gốc hợp lệ của bản sao',()=>{
 expect(cleanTemplateOrigin({templateId:'t',group:'g'},true)).toEqual({templateId:'t',group:'g'});
 expect(cleanTemplateOrigin({templateId:'t',group:'g'},false)).toBeUndefined();
 expect(cleanTemplateOrigin({templateId:'',group:'g'},true)).toBeUndefined();
 expect(cleanTemplateOrigin({templateId:5,group:'g'},true)).toBeUndefined();
 expect(cleanTemplateOrigin({templateId:'t'.repeat(81),group:'g'},true)).toBeUndefined();
 expect(cleanTemplateOrigin({templateId:'t',group:'g'.repeat(41)},true)).toBeUndefined();
 expect(cleanTemplateOrigin('chuỗi',true)).toBeUndefined();
});

it('quy trình chèn: nguồn gốc giữ qua lưu và tải lại; nút gốc gửi kèm nguồn giả bị bỏ; mẫu gốc không đổi',async()=>{
 const dir=dirOf();let r=open(dir);
 const id=await makeTemplate(r);
 const tplBefore=JSON.stringify(r.store.data.workflowTemplates);
 const out=await req(r,'templateInsert',{templateId:id,target:{name:'Lớp 8A'},params:{'chu-de':'Điện'}}) as any;
 const wf=r.store.data.workflows!.find(w=>w.id===out.id)!;
 expect(wf.steps.every(s=>s.templateCopy===true&&s.origin?.templateId===id)).toBe(true);
 const group=wf.steps[0]!.origin!.group;
 expect(wf.steps.every(s=>s.origin!.group===group)).toBe(true);
 // Sửa bản sao và thêm một nút gốc mang nguồn giả khi lưu.
 const payload={...wf,steps:[{...wf.steps[0]!,prompt:'Đã sửa'},...wf.steps.slice(1).map(s=>({...s})),{id:'gia',name:'Gốc',prompt:'Gốc',choice:'auto',access:'read',origin:{templateId:id,group:'x'}}]};
 await req(r,'workflowSave',{workflow:payload});
 expect(wf.steps.find(s=>s.id==='gia')?.origin).toBeUndefined();
 expect(wf.steps.find(s=>s.id===payload.steps[0]!.id)?.origin).toEqual({templateId:id,group});
 // Tải lại từ đĩa.
 r=reopen(r,dir);
 const wf2=r.store.data.workflows!.find(w=>w.id===out.id)!;
 expect(wf2.steps.find(s=>s.id===payload.steps[0]!.id)).toMatchObject({prompt:'Đã sửa',templateCopy:true,origin:{templateId:id,group}});
 expect(wf2.steps.filter(s=>s.templateCopy).every(s=>s.origin?.templateId===id&&s.origin.group===group)).toBe(true);
 expect(wf2.steps.find(s=>s.id==='gia')?.origin).toBeUndefined();
 expect(JSON.stringify(r.store.data.workflowTemplates)).toBe(tplBefore);
});

it('chèn vào Plan: bước chèn mang nguồn gốc; bước gốc của Plan không mang; dựng lại và tải lại giữ nguyên',async()=>{
 const dir=dirOf();let r=open(dir);
 const chatId=await req(r,'newChat') as string;
 const p:Plan={id:'plan',chatId,title:'Ôn tập',revision:0,approved:true,steps:['Tìm hiểu','Soạn'].map((goal,i)=>({id:'s'+i,goal,task:'Nhiệm vụ '+i,files:[],risk:'',status:'waiting' as const}))};
 r.store.data.chats[0]!.messages.push({id:'m',role:'assistant',text:'',at:1,plan:p});linkPlan(p,r.store.data.workflows??=[]);
 const id=await makeTemplate(r);
 const tplBefore=JSON.stringify(r.store.data.workflowTemplates);
 await req(r,'templateInsert',{templateId:id,target:{planId:'plan'},params:{'chu-de':'Điện'}});
 const added=p.steps.filter(s=>s.templateCopy);
 expect(added).toHaveLength(2);
 expect(added.every(s=>s.origin?.templateId===id)).toBe(true);
 const group=added[0]!.origin!.group;
 expect(p.steps.slice(0,2).every(s=>!s.templateCopy&&!s.origin)).toBe(true);
 // Mô phỏng sửa Plan: đính kèm tệp cho bản sao; dữ liệu gửi lên mang nguồn giả thì bị bỏ.
 editPlanSteps(p,p.steps.map(s=>({...s,origin:{templateId:'gia',group:'x'},files:s.templateCopy?['/Users/gv/tai-lieu.txt']:s.files})));
 expect(p.steps.filter(s=>s.templateCopy).every(s=>s.origin?.templateId===id&&s.origin.group===group)).toBe(true);
 expect(p.steps.slice(0,2).every(s=>!s.origin)).toBe(true);
 // Dựng lại nút từ Plan: nguồn gốc, prompt và tệp đính kèm của bản sao được giữ.
 const wf=linkPlan(p,r.store.data.workflows!);
 const copies=wf.steps.filter(s=>s.templateCopy);
 expect(copies.map(s=>s.origin)).toEqual(added.map(()=>({templateId:id,group})));
 expect(copies.every(s=>s.files?.[0]==='/Users/gv/tai-lieu.txt')).toBe(true);
 expect(copies[0]!.prompt).toBe(added[0]!.task);
 expect(wf.steps.slice(0,2).every(s=>!s.templateCopy&&!s.origin)).toBe(true);
 // Tải lại: Plan và nút dựng lại vẫn giữ nguồn gốc.
 r=reopen(r,dir);
 const plan2=r.store.data.chats.find(c=>c.id===chatId)!.messages.find(m=>m.plan)!.plan!;
 expect(plan2.steps.filter(s=>s.templateCopy).every(s=>s.origin?.templateId===id&&s.origin.group===group)).toBe(true);
 expect(plan2.steps.slice(0,2).every(s=>!s.origin&&!s.templateCopy)).toBe(true);
 const wf2=linkPlan(plan2,r.store.data.workflows!);
 expect(wf2.steps.filter(s=>s.templateCopy).map(s=>s.origin)).toEqual(added.map(()=>({templateId:id,group})));
 expect(JSON.stringify(r.store.data.workflowTemplates)).toBe(tplBefore);
});

it('dữ liệu Plan cũ chỉ có templateCopy: dựng lại giữ cờ, không có nguồn gốc',()=>{
 const legacy={id:'old',chatId:'c',title:'Cũ',revision:0,approved:false,steps:[{id:'k',goal:'G',task:'T',files:[],risk:'',status:'waiting',templateCopy:true}]} as unknown as Plan;
 const w=linkPlan(legacy,[]);
 expect(w.steps[0]!.templateCopy).toBe(true);
 expect(w.steps[0]!.origin).toBeUndefined();
});
