// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {describe,expect,it,vi} from 'vitest';
import {BUILTIN_PROMPTS} from '@pvta/shared';
import {chatTools,chatFiles,countTokens,matchesPrompt,promptSignature} from '../src/chat-tools';

vi.mock('../src/ipc',()=>({rpc:vi.fn(async()=>({name:'bao-cao.md',segments:[{ref:'Dòng 1',text:'Nội dung AI tạo'}]})),subscribe:vi.fn()}));

const rule=(id:string,key:string,always=false)=>({id,key,title:`Quy tắc ${key}`,text:`Nội dung ${key}`,always,at:1});
const msg=(id:string,role:'user'|'assistant',text:string,at:number,actions?:any[])=>({id,role,text,at,actions});
const builtin=BUILTIN_PROMPTS[0]!;

function fixture(){
 const chat:any={id:'c1',title:'Chat độc lập',messages:[
  msg('m1','user','Dùng /soan-de với #giong-van nhé',10),
  msg('m2','assistant','Đã tạo.',20,[{id:'a1',kind:'create_office',path:'/out/de.docx',reason:'',state:'done'},{id:'a2',kind:'write_text',path:'/out/nhap.md',reason:'',state:'declined'},{id:'a3',kind:'open_file',path:'/in/anh.png',reason:'',state:'done'}]),
  msg('m3','user',builtin.text,30),
 ],summary:'',updatedAt:30,ruleBook:[rule('r3','rieng-chat')]};
 const other:any={id:'c2',title:'Khác',messages:[msg('o1','user','/nhan-xet rồi /nhan-xet và #dinh-dang',5)],summary:'',updatedAt:5};
 return {
  skills:[{name:'soan-de',description:'Soạn đề',load:'demand',body:''},{name:'nhan-xet',description:'Nhận xét',load:'demand',body:''},{name:'tat',description:'',load:'off',body:''},{name:'office-word',description:'Word',load:'demand',body:''}],
  prompts:{own:[{id:'own1',title:'Lời nhắc riêng của tôi',text:'Viết thư mời họp phụ huynh lớp [lớp]',category:'cua-toi',own:true}],favorites:[BUILTIN_PROMPTS[1]!.id]},
  data:{chats:[chat,other],projects:[],ruleBook:[rule('r1','giong-van'),rule('r2','dinh-dang'),rule('r4','luon',true)],
   attachments:[{id:'f1',name:'anh.png',path:'/in/anh.png',scope:'chat',scopeId:'c1',fingerprint:'x',segments:[],image:true,at:15},{id:'f2',name:'khac.docx',path:'/in/khac.docx',scope:'chat',scopeId:'c2',fingerprint:'y',segments:[]}]},
 } as any;
}

describe('chatTools',()=>{
 it('đếm token # và / không phân biệt hoa thường, bỏ dấu câu cuối',()=>{
  expect([...countTokens(['Gọi #Giọng-Văn, rồi #giong-van.'],'#')]).toEqual([['giong-van',2]]);
  expect([...countTokens(['a/b /soan-de /Soan-De','http://x'],'/')]).toEqual([['soan-de',2]]);
 });
 it('nhận ra lời nhắc bằng các phần cố định theo thứ tự, kể cả khi ô trống đã điền',()=>{
  expect(promptSignature('Ngắn [x]')).toEqual([]);
  const sig=promptSignature('Soạn kế hoạch [tên] của tổ [tổ], trường [trường]');
  expect(sig).toEqual(['soan ke hoach','cua to',', truong']);
  expect(matchesPrompt(sig,'Soạn kế hoạch ngoại khóa của tổ Toán, trường THCS A')).toBe(true);
  expect(matchesPrompt(sig,'Soạn kế hoạch bài dạy môn Toán lớp 6')).toBe(false);
 });
 it('đưa mục dùng trong chat lên trước, rồi mục thường dùng ở mọi chat',()=>{
  const t=chatTools(fixture(),'c1');
  expect(t.rules.inChat.map(r=>[r.key,r.reason])).toEqual([['giong-van','mentioned'],['rieng-chat','chat'],['luon','always']]);
  expect(t.rules.common.map(r=>[r.key,r.uses])).toEqual([['dinh-dang',1]]);
  expect(t.skills.inChat.map(s=>s.name)).toEqual(['soan-de']);
  expect(t.skills.common.map(s=>s.name)).toEqual(['nhan-xet','office-word']);
  expect(t.skills.common[0]!.uses).toBe(2);
  expect(t.prompts.inChat.map(p=>p.id)).toEqual([builtin.id]);
  expect(t.prompts.common[0]!.id).toBe(BUILTIN_PROMPTS[1]!.id);
  expect(t.prompts.common.map(p=>p.id)).toContain('own1');
 });
 it('liệt kê tệp thầy cô đưa vào và tệp AI tạo thành công, mới nhất trước',()=>{
  const f=fixture();const files=chatFiles(f.data.chats[0],f.data.attachments);
  expect(files.map(x=>[x.name,x.origin,x.image])).toEqual([['de.docx','ai',false],['anh.png','user',true]]);
  expect(chatTools(f,'khong-co').files).toEqual([]);
 });
});

it('cửa sổ tiện ích chèn mục vào ô chat và xem trước tệp AI tạo',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const {ChatToolsWindow}=await import('../src/ChatToolsWindow');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onInsert=vi.fn();const onManage=vi.fn();
 try{
  await act(async()=>root.render(React.createElement(ChatToolsWindow,{state:fixture(),chatId:'c1',title:'Chat độc lập',pinned:false,expanded:false,onPin:()=>{},onExpand:()=>{},onClose:()=>{},onInsert,onManage})));
  const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(label))!;
  await act(async()=>button('#giong-van').click());expect(onInsert).toHaveBeenLastCalledWith('#giong-van','rules');
  await act(async()=>button('/soan-de').click());expect(onInsert).toHaveBeenLastCalledWith('/soan-de','skills');
  await act(async()=>button('Quản lý kỹ năng').click());expect(onManage).toHaveBeenLastCalledWith('skills');
  await act(async()=>button('Ảnh · 1').click());expect(host.textContent).not.toContain('de.docx');
  await act(async()=>button('Tất cả').click());
  await act(async()=>button('de.docx').click());await act(async()=>{await Promise.resolve();});
  expect(host.querySelector('.project-preview-pane')?.textContent).toContain('Nội dung AI tạo');
 }finally{await act(async()=>root.unmount());host.remove();}
});
