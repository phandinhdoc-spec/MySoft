// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
import {LearningPanel} from '../src/LearningPanel';
import type {ViewState} from '../src/ipc';
import {rpc} from '../src/ipc';

it('requires clicking approve to publish a pending skill and disables it while saving',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const state={data:{learned:[],learnedDrafts:[{id:'pending',name:'learned-review',description:'Test',body:'Review',source:'test',at:1,status:'proposed'}]}} as ViewState;
 const el=document.createElement('div'),root=createRoot(el);let finish!:()=>void;
 vi.mocked(rpc).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve(true);}));
 try{
  await act(async()=>root.render(React.createElement(LearningPanel,{state,report:vi.fn()})));
  const button=[...el.querySelectorAll('button')].find(b=>b.textContent==='Duyệt và dùng')!;
  await act(async()=>button.click());
  expect(rpc).toHaveBeenLastCalledWith('reviewLearnedSkill',{id:'pending',action:'approve'});
  expect(button.disabled).toBe(true);
  await act(async()=>finish());expect(button.disabled).toBe(false);
 }finally{await act(async()=>root.unmount());}
});

it('shows edit and delete controls without an acceptance step, including active skills',()=>{
 const state={data:{learned:[{id:'rule',rule:'Viết ngắn gọn.',source:'test',at:1,status:'active'}],learnedDrafts:[{id:'skill',name:'learned-review',description:'Kiểm tra nội dung',body:'Kiểm tra trước khi xuất.',source:'test',at:1,status:'active'}]}} as ViewState;
 const html=renderToStaticMarkup(React.createElement(LearningPanel,{state,report:vi.fn()}));
 expect(html).toContain('Lưu sửa');expect(html).toContain('Xóa bỏ');
 expect(html).not.toContain('Chấp nhận');expect(html).not.toContain('>Dùng<');expect(html).not.toContain('readonly');
});
it('hides removed memories and explains skills that could not be applied',()=>{
 const state={data:{learned:[{id:'removed',rule:'REMOVED_RULE',source:'test',at:1,status:'rejected'}],learnedDrafts:[
  {id:'removed-skill',name:'learned-removed',status:'rejected'},
  {id:'blocked',name:'learned-blocked',description:'Kiểm tra nội dung',body:'Kiểm tra trước khi xuất.',source:'test',at:1,status:'proposed',activationError:'Tên skill đã tồn tại.'},
 ]}} as ViewState;
 const html=renderToStaticMarkup(React.createElement(LearningPanel,{state,report:vi.fn()}));
 expect(html).not.toContain('REMOVED_RULE');expect(html).not.toContain('learned-removed');
 expect(html).toContain('role="alert"');expect(html).toContain('Tên skill đã tồn tại.');expect(html).toContain('Lưu sửa');
});
