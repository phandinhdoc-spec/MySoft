import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
import {LearningPanel} from '../src/LearningPanel';
import type {ViewState} from '../src/ipc';

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
