import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {examPlanPrompt} from '../../shared/src/assessment-workflow';
import type {Plan} from '../src/desktop/types';
const homes:string[]=[],runs:DesktopRuntime[]=[];
afterEach(()=>{runs.forEach(r=>r.dispose());homes.forEach(h=>fs.rmSync(h,{recursive:true,force:true}));runs.length=homes.length=0;vi.restoreAllMocks();});
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
function setup(){const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-exam-'));homes.push(home);const r=new DesktopRuntime(()=>{},home);runs.push(r);r.store.data.preferences.choice={backend:'api',model:'mock/mini'};return r;}
it('forces Pro despite chat mode and delivers source beyond the history excerpt',async()=>{
 const r=setup();const spy=vi.spyOn(r.engine,'run').mockResolvedValue({text:'Cần thời lượng đề?',attempts:1,fullPrompt:true,timings:{totalMs:0}});
 const id=await req(r,'newChat');await req(r,'send',{chatId:id,text:examPlanPrompt('Tạo đề',{source:'x'.repeat(8500)+'END-SOURCE'}),planningMode:'chat'});
 expect(r.store.data.chats[0]!.messages[0]!.planning?.mode).toBe('pro');expect(spy.mock.calls[0]![0].buildPrompt?.(false,false)).toContain('END-SOURCE');
});
it('blocks skipped verification and invalid exam plans before model execution',async()=>{
 const r=setup();const spy=vi.spyOn(r.engine,'run');const chatId=await req(r,'newChat') as string;
 const ids=['exam-source','exam-allocation','exam-draft','exam-solve','exam-audit','exam-export'];
 const plan:Plan={id:'p',chatId,assessment:true,approved:false,title:'Đề',steps:ids.map((id,i)=>({id,goal:id,task:id,files:[],risk:'',status:'waiting',dependsOn:i?[ids[i-1]!]:[]}))};
 r.store.data.chats[0]!.messages.push({id:'m',role:'assistant',text:'',at:1,plan});plan.steps[0]!.status='skipped';
 await expect(req(r,'runPlan',{id:'p'})).rejects.toThrow('không được bỏ qua');expect(spy).not.toHaveBeenCalled();
});
it('rejects oversized input instead of silently truncating evidence',async()=>{
 const r=setup();const id=await req(r,'newChat');await expect(req(r,'send',{chatId:id,text:examPlanPrompt('Tạo đề',{source:'x'.repeat(100001)})})).rejects.toThrow('quá dài');
});
it('does not write an exam file when the pre-export check fails',async()=>{
 const r=setup();const id=await req(r,'newChat');const chat=r.store.data.chats.find(c=>c.id===id)!;
 r.store.data.preferences.access='full';
 const target=path.join(homes.at(-1)!,'unverified.md');
 vi.spyOn(r.engine,'run').mockImplementation(async o=>({text:o.system?.startsWith('PLAN PRO — KIỂM ĐỊNH')?'{"passed":false,"issues":["Sai đáp án câu 2"]}':'```pvta-action\n'+JSON.stringify({kind:'write_text',path:target,content:'Đề sai',reason:'Xuất đề'})+'\n```',attempts:1,fullPrompt:true,timings:{totalMs:0}}));
 const p:Plan={id:'exam',chatId:chat.id,title:'Đề',assessment:true,pro:true,approved:true,steps:[{id:'exam-export',goal:'Xuất',task:'Xuất',status:'running',files:[],risk:''}]};
 await expect((r as any).ask(chat,'Xuất đề đã kiểm định',false,new AbortController().signal,'test',false,[],undefined,undefined,false,p)).rejects.toThrow('Sai đáp án câu 2');
 expect(fs.existsSync(target)).toBe(false);expect(chat.messages.flatMap(m=>m.actions??[])).toHaveLength(0);
});
