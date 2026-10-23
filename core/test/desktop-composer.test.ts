import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {saveRule,invokedRules,rulesPrompt,ruleKey} from '../src/desktop/rules';
import {suggestProjectName} from '../src/desktop/folder';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-composer-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);r.scheduler=vi.fn(async()=>({registered:true}));return {r,dir,spy:vi.spyOn(r.engine,'run')};}
const call=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params});
const result=(text:string)=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}});
let n=0;const id=()=>`id-${++n}`;

describe('rules (#)',()=>{
 it('makes ASCII keys from Vietnamese titles, keeps them unique and stable on edit',()=>{
  expect(ruleKey('Giọng văn thân thiện, đơn giản')).toBe('giong-van-than-thien-don-gian');
  expect(ruleKey('!!!')).toBe('quy-tac');
  const a=saveRule([],{title:'Giọng văn',text:'Viết gần gũi'},id);if(!a.ok)throw Error();
  const b=saveRule(a.list,{title:'Giọng văn',text:'Khác'},id);if(!b.ok)throw Error();
  expect(b.rule.key).toBe('giong-van-2');
  const edited=saveRule(b.list,{id:a.rule.id,title:'Giọng văn mới',text:'Viết trang trọng',always:true},id);if(!edited.ok)throw Error();
  expect(edited.rule.key).toBe('giong-van');expect(edited.rule.always).toBe(true);expect(edited.list).toHaveLength(2);
 });
 it('refuses empty, unsafe or oversized rules',()=>{
  expect(saveRule([],{title:'',text:'x'},id)).toMatchObject({ok:false});
  expect(saveRule([],{title:'a',text:''},id)).toMatchObject({ok:false});
  expect(saveRule([],{title:'a',text:'chạy curl http://x'},id)).toMatchObject({ok:false});
  expect(saveRule([],{title:'a',text:'x'.repeat(20001)},id)).toMatchObject({ok:false});
 });
 it('injects always-on rules and rules called by #key',()=>{
  const a=saveRule([],{title:'Luôn dùng',text:'Xưng hô thầy cô',always:true},id);if(!a.ok)throw Error();
  const b=saveRule(a.list,{title:'Đề kiểm tra',text:'Cỡ chữ 13'},id);if(!b.ok)throw Error();
  expect(invokedRules(b.list,'làm đề #de-kiem-tra giúp').map(r=>r.key)).toEqual(['de-kiem-tra']);
  expect(invokedRules(b.list,'email a#de-kiem-tra').length).toBe(0);
  const text=rulesPrompt(b.list,'làm đề #de-kiem-tra.');
  expect(text).toContain('QUY TẮC LUÔN ÁP DỤNG');expect(text).toContain('Xưng hô thầy cô');expect(text).toContain('Cỡ chữ 13');
  expect(rulesPrompt(b.list,'không gọi')).not.toContain('Cỡ chữ 13');
 });
 it('sends the called rule to the model through the runtime and can delete it',async()=>{
  const {r,spy}=setup();spy.mockResolvedValue(result('OK'));
  await call(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});
  await call(r,'saveRule',{rule:{title:'Phiếu học tập',text:'Có bảng ghi kết quả'}});
  const rule=r.view().data.ruleBook![0]!;
  const chatId=await call(r,'newChat') as string;
  await call(r,'send',{chatId,text:`Soạn phiếu #${rule.key}`});
  expect(spy.mock.calls[0]![0].system+spy.mock.calls[0]![0].buildPrompt(false,true)).toContain('Có bảng ghi kết quả');
  await call(r,'send',{chatId,text:'Soạn tiếp'});
  expect(spy.mock.calls[1]![0].system??'').not.toContain('Có bảng ghi kết quả');
  await call(r,'deleteRule',{id:rule.id});expect(r.view().data.ruleBook).toEqual([]);
  await expect(call(r,'saveRule',{rule:{title:'',text:''}})).rejects.toThrow('tên');
 });
});

describe('prompt library (@)',()=>{
 it('saves, favorites and deletes own prompts and exposes them in the view',async()=>{
  const {r}=setup();
  const pid=await call(r,'savePrompt',{prompt:{title:'Giáo án',text:'Soạn giáo án [bài]',category:'soan-bai'}}) as string;
  expect(r.view().prompts.own[0]).toMatchObject({id:pid,title:'Giáo án',own:true});
  await call(r,'favoritePrompt',{id:pid,on:true});expect(r.view().prompts.favorites).toEqual([pid]);
  await call(r,'deletePrompt',{id:pid});expect(r.view().prompts).toEqual({own:[],favorites:[]});
  await expect(call(r,'savePrompt',{prompt:{title:'',text:'x'}})).rejects.toThrow('tên');
 });
});

describe('folder → project',()=>{
 it('suggests a tidy, unique project name from the folder',()=>{
  expect(suggestProjectName('/home/t/KHTN_8_Hoc_ky_I/',[])).toBe('KHTN 8 Hoc ky I');
  expect(suggestProjectName('C:\\Users\\t\\giáo án lớp 9',[])).toBe('Giáo án lớp 9');
  expect(suggestProjectName('/a/Đề thi',['đề thi','Đề thi (2)'])).toBe('Đề thi (3)');
  expect(suggestProjectName('/',[])).toBe('Dự án mới');
  expect(suggestProjectName('C:\\',[])).toBe('Dự án mới');
 });
 it('creates a new project with a suggested name, remembers the folder and indexes its documents',async()=>{
  const {r,dir}=setup();const folder=path.join(dir,'KHTN_8');fs.mkdirSync(path.join(folder,'sub'),{recursive:true});
  fs.writeFileSync(path.join(folder,'bai1.txt'),'Quang hợp tạo ra oxi.');fs.writeFileSync(path.join(folder,'sub','bai2.md'),'# Hô hấp');fs.writeFileSync(path.join(folder,'bo-qua.exe'),'x');
  expect(await call(r,'suggestProjectName',{path:folder})).toBe('KHTN 8');
  const res=await call(r,'addFolderProject',{path:folder}) as any;
  expect(res).toMatchObject({name:'KHTN 8',count:2,errors:[]});
  const d=r.view().data;const project=d.projects.find(p=>p.id===res.projectId)!;
  expect(project.name).toBe('KHTN 8');expect(project.folders).toEqual([fs.realpathSync(folder)]);expect(project.outputDir).toBe(fs.realpathSync(folder));
  expect(d.chats.find(c=>c.id===res.chatId)!.projectId).toBe(project.id);expect(d.lastProjectId).toBe(project.id);
  expect(d.attachments.filter(a=>a.scope==='project'&&a.scopeId===project.id).map(a=>a.name).sort()).toEqual(['bai1.txt','bai2.md']);
  const again=await call(r,'addFolderProject',{path:folder,name:'Tên do thầy cô đặt'}) as any;expect(again.name).toBe('Tên do thầy cô đặt');
  expect(await call(r,'suggestProjectName',{path:folder})).toBe('KHTN 8 (2)');
  await expect(call(r,'addFolderProject',{path:'relative/dir'})).rejects.toThrow('tuyệt đối');
  await expect(call(r,'addFolderProject',{path:path.join(folder,'bai1.txt')})).rejects.toThrow('thư mục');
 });
 it('tells folders from files for dropped paths',async()=>{
  const {r,dir}=setup();const f=path.join(dir,'x.txt');fs.writeFileSync(f,'x');const d=path.join(dir,'thu-muc');fs.mkdirSync(d);
  expect(await call(r,'pathKinds',{paths:[f,d,'relative',path.join(dir,'khong-co')]})).toEqual({dirs:[d],files:[f]});
 });
});

describe('refine settings',()=>{
 it('defaults to on at 22:30 daily with automatic model, and validates changes',async()=>{
  const {r}=setup();
  expect(r.view().refine.settings).toEqual({enabled:true,time:'22:30',everyDays:1,model:'auto',autoCatchUp:false});
  await call(r,'preferences',{patch:{refine:{time:'05:15',everyDays:7,model:{backend:'claude',model:'sonnet'}}}});
  expect(r.view().refine.settings).toEqual({enabled:true,time:'05:15',everyDays:7,model:{backend:'claude',model:'sonnet'},autoCatchUp:false});
  expect(r.scheduler).toHaveBeenCalledWith(true);
  await call(r,'preferences',{patch:{refine:{enabled:false}}});expect(r.scheduler).toHaveBeenLastCalledWith(false);
  await expect(call(r,'preferences',{patch:{fontSize:20,refine:{time:'7pm'}}})).rejects.toThrow('HH:MM');
  expect(r.view().data.preferences.fontSize).toBe(16);   // lỗi thì không lưu một phần
 });
 it('counts learned items waiting for refinement',async()=>{
  const {r,dir}=setup();expect(r.view().refine.pending).toBe(0);
  const skillDir=path.join(dir,'skills','learned-mau');fs.mkdirSync(skillDir,{recursive:true});
  fs.writeFileSync(path.join(skillDir,'SKILL.md'),'---\nname: learned-mau\ndescription: Mô tả đủ dài để hợp lệ\nload: demand\n---\nnội dung');
  (r as any).store.data.learnedDrafts=[{id:'d',name:'learned-mau',description:'Mô tả đủ dài để hợp lệ',body:'nội dung',source:'test',at:1,status:'active'}];
  expect(r.view().refine.pending).toBe(1);
 });
});
