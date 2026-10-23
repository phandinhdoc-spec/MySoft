import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {parseRuleScope,effectiveRules,scopedRulesPrompt,type RuleLayers} from '../src/desktop/rules';
import type {Rule} from '../src/desktop/types';

const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-rule-scope-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.scheduler=vi.fn(async()=>({registered:true}));return {r,spy:vi.spyOn(r.engine,'run')};}
const call=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const result=(text:string)=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}});
const rule=(key:string,text:string,always:boolean):Rule=>({id:`id-${key}-${text}`,key,title:key,text,always,at:0});
/** Gửi một tin và trả về lời nhắc của lượt trả lời chính (bỏ qua lượt tự đặt tên chat). */
async function ask(r:DesktopRuntime,spy:ReturnType<typeof setup>['spy'],chatId:string,text:string):Promise<string>{
 const before=spy.mock.calls.length;await call(r,'send',{chatId,text});
 const prompts=spy.mock.calls.slice(before).map(c=>c[0].system+c[0].buildPrompt(false,true));
 const main=prompts.find(x=>x.includes('QUY TẮC NGƯỜI DÙNG:'));if(!main)throw Error('Không thấy lời nhắc chính.');return main;
}

describe('phạm vi quy tắc (cá nhân · dự án · hội thoại)',()=>{
 it('đọc phạm vi: thiếu thì là cá nhân, sai thì báo lỗi',()=>{
  expect(parseRuleScope(undefined)).toEqual({kind:'profile'});
  expect(parseRuleScope({kind:'project',id:'p-1'})).toEqual({kind:'project',id:'p-1'});
  expect(()=>parseRuleScope({kind:'chat'})).toThrow('Phạm vi');
  expect(()=>parseRuleScope({kind:'chat',id:'../x'})).toThrow('Phạm vi');
  expect(()=>parseRuleScope('profile')).toThrow('Phạm vi');
 });
 it('cùng khóa thì phạm vi hẹp hơn thay thế phạm vi rộng hơn',()=>{
  const layers:RuleLayers={profile:[rule('giong','cá nhân',true),rule('rieng','chỉ cá nhân',true)],project:[rule('giong','dự án',true)],chat:[rule('giong','hội thoại',true)]};
  const list=effectiveRules(layers);
  expect(list.find(r=>r.key==='giong')).toMatchObject({text:'hội thoại',scope:'chat'});
  expect(list.find(r=>r.key==='rieng')).toMatchObject({scope:'profile'});
  expect(list).toHaveLength(2);
 });
 it('lời nhắc ghi rõ phạm vi; quy tắc cục bộ chỉ chạy khi được gọi',()=>{
  const layers:RuleLayers={profile:[rule('a','xưng thầy cô',true)],project:[rule('toan','cả dự án',true),rule('de','cỡ chữ 13',false)],chat:[]};
  const quiet=scopedRulesPrompt(layers,'soạn bài');
  expect(quiet).toContain('(cá nhân)');expect(quiet).toContain('(dự án) toan');expect(quiet).not.toContain('cỡ chữ 13');
  const called=scopedRulesPrompt(layers,'làm đề #de nhé');
  expect(called).toContain('QUY TẮC THẦY CÔ GỌI TRONG YÊU CẦU');expect(called).toContain('cỡ chữ 13');
  expect(scopedRulesPrompt({profile:[],project:[],chat:[]},'x')).toBe('');
 });

 it('lưu quy tắc theo từng phạm vi, không lẫn sang nơi khác',async()=>{
  const {r}=setup();
  const projectId=await call(r,'saveProject',{name:'Lớp 8A',rules:''}) as string;
  const chatA=await call(r,'newChat',{projectId}) as string;
  const chatB=await call(r,'newChat') as string;
  await call(r,'saveRule',{rule:{title:'Cá nhân',text:'Xưng thầy cô',always:true}});
  await call(r,'saveRule',{scope:{kind:'project',id:projectId},rule:{title:'Của dự án',text:'Dùng SGK Cánh Diều',always:true}});
  await call(r,'saveRule',{scope:{kind:'chat',id:chatA},rule:{title:'Của chat',text:'Chỉ soạn tiết 1',always:false}});
  const d=r.view().data;
  expect(d.ruleBook!.map(x=>x.title)).toEqual(['Cá nhân']);
  expect(d.projects.find(p=>p.id===projectId)!.ruleBook!.map(x=>x.title)).toEqual(['Của dự án']);
  expect(d.chats.find(c=>c.id===chatA)!.ruleBook!.map(x=>x.title)).toEqual(['Của chat']);
  expect(d.chats.find(c=>c.id===chatB)!.ruleBook).toBeUndefined();
  await expect(call(r,'saveRule',{scope:{kind:'project',id:'khong-co'},rule:{title:'x',text:'y'}})).rejects.toThrow('dự án');
  await expect(call(r,'saveRule',{scope:{kind:'chat',id:'khong-co'},rule:{title:'x',text:'y'}})).rejects.toThrow('hội thoại');
 });
 it('xóa quy tắc đúng phạm vi và dọn phạm vi trống',async()=>{
  const {r}=setup();
  const projectId=await call(r,'saveProject',{name:'Lớp 8B',rules:''}) as string;
  const scope={kind:'project',id:projectId};
  const ruleId=await call(r,'saveRule',{scope,rule:{title:'Tạm',text:'Nội dung tạm'}}) as string;
  await call(r,'deleteRule',{id:ruleId,scope:{kind:'profile'}});
  expect(r.view().data.projects.find(p=>p.id===projectId)!.ruleBook).toHaveLength(1);
  await call(r,'deleteRule',{id:ruleId,scope});
  expect(r.view().data.projects.find(p=>p.id===projectId)!.ruleBook).toBeUndefined();
 });
 it('sửa dự án không làm mất quy tắc của dự án',async()=>{
  const {r}=setup();
  const projectId=await call(r,'saveProject',{name:'Lớp 8C',rules:''}) as string;
  await call(r,'saveRule',{scope:{kind:'project',id:projectId},rule:{title:'Giữ lại',text:'Nội dung giữ'}});
  await call(r,'saveProject',{id:projectId,name:'Lớp 8C mới',rules:'Quy tắc chữ'});
  expect(r.view().data.projects.find(p=>p.id===projectId)!.ruleBook).toHaveLength(1);
 });

 it('mô hình nhận quy tắc của đúng hội thoại và dự án, không nhận của nơi khác',async()=>{
  const {r,spy}=setup();spy.mockResolvedValue(result('OK'));
  await call(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});
  const projectId=await call(r,'saveProject',{name:'Lớp 9A',rules:''}) as string;
  const inProject=await call(r,'newChat',{projectId}) as string;
  const outside=await call(r,'newChat') as string;
  await call(r,'saveRule',{rule:{title:'Cá nhân',text:'QT-CANHAN',always:true}});
  await call(r,'saveRule',{scope:{kind:'project',id:projectId},rule:{title:'Toàn cục dự án',text:'QT-DUAN-TOANCUC',always:true}});
  const local=await call(r,'saveRule',{scope:{kind:'project',id:projectId},rule:{title:'Cục bộ dự án',text:'QT-DUAN-CUCBO',always:false}}) as string;
  await call(r,'saveRule',{scope:{kind:'chat',id:inProject},rule:{title:'Chat',text:'QT-CHAT',always:true}});
  const key=r.view().data.projects.find(p=>p.id===projectId)!.ruleBook!.find(x=>x.id===local)!.key;

  const a=await ask(r,spy,inProject,'Soạn bài');
  expect(a).toContain('QT-CANHAN');expect(a).toContain('QT-DUAN-TOANCUC');expect(a).toContain('QT-CHAT');
  expect(a).not.toContain('QT-DUAN-CUCBO');

  expect(await ask(r,spy,inProject,`Soạn đề #${key}`)).toContain('QT-DUAN-CUCBO');

  const b=await ask(r,spy,outside,`Soạn đề #${key}`);
  expect(b).toContain('QT-CANHAN');
  expect(b).not.toContain('QT-DUAN-TOANCUC');expect(b).not.toContain('QT-DUAN-CUCBO');expect(b).not.toContain('QT-CHAT');
 });

 it('lưu tên người dùng: gọn khoảng trắng, bỏ ký tự điều khiển, cắt 60 ký tự, cho phép xóa',async()=>{
  const {r}=setup();
  await call(r,'preferences',{patch:{userName:'  Đốc \n  Phan\t'}});
  expect(r.view().data.preferences.userName).toBe('Đốc Phan');
  await call(r,'preferences',{patch:{userName:'x'.repeat(90)}});
  expect(r.view().data.preferences.userName).toHaveLength(60);
  await call(r,'preferences',{patch:{userName:12 as unknown as string}});
  expect(r.view().data.preferences.userName).toBe('');
 });
});
