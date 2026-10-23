import {it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {linkPlan,validatePlan} from '../src/desktop/plans';
import {expandTemplate,normalizeTemplate} from '../src/desktop/workflow-templates';
import type {Plan} from '../src/desktop/types';

const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.forEach(r=>r.dispose());runtimes.length=0;roots.forEach(p=>fs.rmSync(p,{recursive:true,force:true}));roots.length=0;});
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-tpl-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);return r;}
const refs={skill:(n:string)=>n==='soan-de'?'Quy trình soạn đề: kiểm tổng điểm.':undefined,rule:(k:string)=>k==='ngan'?'Viết ngắn gọn.':undefined,prompt:(i:string)=>i==='p1'?'Hãy viết rõ ràng.':undefined};
const tpl=(extra:Record<string,unknown>={})=>normalizeTemplate({name:'Ôn tập',params:[{key:'so-cau',label:'Số câu',required:true},{key:'muc-do',label:'Mức độ',default:'Nhận biết'}],steps:[{id:'a',name:'Soạn câu hỏi',prompt:'Soạn {{so-cau}} câu mức {{muc-do}}.',skills:['soan-de'],rules:['ngan'],prompts:['p1']},{id:'b',name:'Kiểm tra',prompt:'Kiểm tra lại kết quả: {{prev}}'}],output:{mode:'ask',text:'Nêu định dạng tệp'},...extra},undefined,1);

it('validates template parameters and placeholders',()=>{
 expect(()=>normalizeTemplate({name:'',steps:[]})).toThrow('đặt tên');
 expect(()=>normalizeTemplate({name:'X',steps:[{prompt:'Dùng {{lạ}}'}],output:{mode:'ask',text:''}})).toThrow('chưa có tham số');
 expect(()=>normalizeTemplate({name:'X',params:[{key:'prev'}],steps:[{prompt:'a'}]})).toThrow('dành cho hệ thống');
 expect(()=>normalizeTemplate({name:'X',params:[{key:'a'},{key:'a'}],steps:[{prompt:'a'}]})).toThrow('trùng');
 expect(()=>normalizeTemplate({name:'X',steps:[{prompt:'a'}],output:{mode:'fixed',text:''}})).toThrow('Đầu ra cố định');
 expect(()=>normalizeTemplate({name:'X',steps:[{id:'a',prompt:'a',dependsOn:['b']},{id:'b',prompt:'b',dependsOn:['a']}]})).toThrow('vòng lặp');
});
it('fills parameters, defaults and the user-defined output; keeps {{prev}}',()=>{
 const steps=expandTemplate(tpl(),{params:{'so-cau':12},output:'Tệp Word 2 trang'},refs,{maxPrompt:4000});
 expect(steps[0]!.prompt).toContain('Soạn 12 câu mức Nhận biết.');
 expect(steps[0]!.prompt).toContain('#ngan: Viết ngắn gọn.');expect(steps[0]!.prompt).toContain('Hãy viết rõ ràng.');expect(steps[0]!.prompt).toContain('kiểm tổng điểm');
 expect(steps[0]!.prompt).not.toContain('Tệp Word');
 expect(steps[1]!.prompt).toContain('{{prev}}');expect(steps[1]!.prompt).toContain('Tệp Word 2 trang');
 expect(steps[1]!.dependsOn).toEqual(['a']);
});
it('requires missing required values, the output and existing references',()=>{
 expect(()=>expandTemplate(tpl(),{params:{},output:'x'},refs,{maxPrompt:4000})).toThrow('Số câu');
 expect(()=>expandTemplate(tpl(),{params:{'so-cau':5}},refs,{maxPrompt:4000})).toThrow('quy định đầu ra');
 const bad=normalizeTemplate({name:'B',steps:[{prompt:'a',skills:['không-có']}],output:{mode:'ask',text:''}});
 expect(()=>expandTemplate(bad,{output:'x'},refs,{maxPrompt:4000})).toThrow('Không tìm thấy kỹ năng');
 const long=normalizeTemplate({name:'L',params:[{key:'n',required:true}],steps:[{prompt:'{{n}}'}],output:{mode:'ask',text:''}});
 expect(()=>expandTemplate(long,{params:{n:'x'.repeat(5000)},output:'y'},refs,{maxPrompt:4000})).toThrow('vượt giới hạn');
});
it('inserts a template block into a plan without touching existing steps, with dashed link suggestions',async()=>{
 const r=setup();const chatId=await req(r,'newChat') as string;
 const p:Plan={id:'plan',chatId,title:'Ôn tập',revision:0,approved:true,steps:['Tìm hiểu','Soạn'].map((goal,i)=>({id:'s'+i,goal,task:'Nhiệm vụ '+i,files:[],risk:'',status:'waiting' as const}))};
 r.store.data.chats[0]!.messages.push({id:'m',role:'assistant',text:'',at:1,plan:p});linkPlan(p,r.store.data.workflows??=[]);
 const id=await req(r,'templateSave',{template:{name:'Ôn tập',params:[{key:'so-cau',label:'Số câu',required:true}],steps:[{id:'a',name:'Soạn câu hỏi',prompt:'Soạn {{so-cau}} câu.'},{id:'b',name:'Rà soát',prompt:'Rà soát.'}],output:{mode:'ask',text:''}}}) as string;
 await expect(req(r,'templateInsert',{templateId:id,target:{planId:'plan'},params:{},output:'Word'})).rejects.toThrow('Số câu');
 await req(r,'templateInsert',{templateId:id,target:{planId:'plan'},params:{'so-cau':10},output:'Word 2 trang'});
 expect(p.steps.map(s=>s.goal)).toEqual(['Tìm hiểu','Soạn','Soạn câu hỏi','Rà soát']);
 expect(p.steps[2]!.task).toContain('Soạn 10 câu.');expect(p.approved).toBe(false);
 expect(p.steps[2]!.dependsOn).toEqual([]); // chưa nối với bước cũ
 expect(p.steps[3]!.dependsOn).toEqual([p.steps[2]!.id]);
 expect(() => validatePlan(p)).not.toThrow();
 const wf=r.store.data.workflows![0]!;
 expect(wf.suggestedLinks).toEqual([expect.objectContaining({from:'s1',to:p.steps[2]!.id})]);
 expect(p.steps[1]!.dependsOn).toEqual(['s0']);
});
it('inserts into a workflow as an editable copy, then accepts or drops the suggested link',async()=>{
 const r=setup();
 const id=await req(r,'templateSave',{template:{name:'Mẫu',params:[{key:'chu-de',label:'Chủ đề',required:true}],steps:[{id:'a',name:'Một',prompt:'Về {{chu-de}}'}],output:{mode:'fixed',text:'Tệp .docx'}}}) as string;
 const out=await req(r,'templateInsert',{templateId:id,target:{name:'Lớp 8A'},params:{'chu-de':'Điện'}}) as any;
 const wf=r.store.data.workflows!.find(w=>w.id===out.id)!;
 expect(wf.name).toBe('Lớp 8A');expect(wf.steps[0]!.prompt).toContain('Về Điện');expect(wf.steps[0]!.choice).toBe('auto');expect(wf.steps[0]!.access).toBe('read');
 const t2=await req(r,'templateFromWorkflow',{workflowId:wf.id,name:'Bản sao mẫu'}) as string;
 expect(r.store.data.workflowTemplates!.find(t=>t.id===t2)!.steps).toHaveLength(1);
 const ins=await req(r,'templateInsert',{templateId:id,target:{workflowId:wf.id},params:{'chu-de':'Nhiệt'}}) as any;
 expect(wf.steps).toHaveLength(2);expect(wf.steps[0]!.prompt).toContain('Về Điện');
 const added=wf.steps[1]!;expect(ins.inserted).toEqual([added.id]);expect(added.insertGroup).toBeTruthy();expect(added.dependsOn).toEqual([]);
 expect(wf.suggestedLinks).toHaveLength(1);
 // sửa bản chèn không đổi mẫu
 added.prompt='Đã sửa';added.access='full';added.choice={backend:'claude',model:'sonnet'};
 expect(r.store.data.workflowTemplates!.find(t=>t.id===id)!.steps[0]!.prompt).toContain('{{chu-de}}');
 const linkId=wf.suggestedLinks![0]!.id;
 await req(r,'workflowLinkResolve',{workflowId:wf.id,linkId,accept:true});
 expect(wf.steps[1]!.dependsOn).toEqual([wf.steps[0]!.id]);expect(wf.suggestedLinks).toBeUndefined();
 await req(r,'templateInsert',{templateId:id,target:{workflowId:wf.id},params:{'chu-de':'Quang'}});
 const dropId=wf.suggestedLinks![0]!.id;await req(r,'workflowLinkResolve',{workflowId:wf.id,linkId:dropId,accept:false});
 expect(wf.suggestedLinks).toBeUndefined();expect(wf.steps[2]!.dependsOn).toEqual([]);
 // lưu quy trình xóa dấu "mới chèn"
 await req(r,'workflowSave',{workflow:{...wf}});expect(wf.steps.some(s=>s.insertGroup)).toBe(false);
 await req(r,'templateDelete',{id});expect(r.store.data.workflowTemplates!.some(t=>t.id===id)).toBe(false);
});

it('keeps a per-step model in templates and rejects invalid ones',()=>{
 const t=normalizeTemplate({name:'M',steps:[{id:'a',prompt:'a',choice:{backend:'claude',model:'sonnet'}},{id:'b',prompt:'b'}],output:{mode:'ask',text:''}});
 expect(t.steps[0]!.choice).toEqual({backend:'claude',model:'sonnet'});
 expect(t.steps[1]!.choice).toBe('auto');
 const steps=expandTemplate(t,{output:'x'},refs,{maxPrompt:4000});
 expect(steps.map(s=>s.choice)).toEqual([{backend:'claude',model:'sonnet'},'auto']);
 expect(()=>normalizeTemplate({name:'M',steps:[{prompt:'a',choice:{backend:'zzz',model:'m'}}]})).toThrow('Model của khâu');
});
