import {describe,it,expect} from 'vitest';
import {draftKey,readPlanDraft,draftConflicts} from '../src/plan-draft';
import type {Plan} from '../src/ipc';
const draft={revision:3,context:'Lớp 8',steps:[{id:'s1',goal:'Soạn bài',task:'Viết giáo án',files:[],risk:'',status:'waiting' as const}]};
describe('Bản sửa Plan tại từng cửa sổ',()=>{
 it('khôi phục nội dung sửa sau khi cửa sổ đóng và mở lại',()=>{
  const data=new Map([[draftKey('p1',true),JSON.stringify(draft)]]);
  expect(readPlanDraft({getItem:key=>data.get(key)??null},draftKey('p1',true))).toEqual(draft);
 });
 it('giữ riêng bản sửa chat và quy trình để không ghi đè nhau',()=>{
  expect(draftKey('p1',true)).not.toBe(draftKey('p1',false));
  expect(draftKey('p1',true)).not.toBe(draftKey('p2',true));
 });
 it('chặn lưu bản sửa dựa trên phiên bản cũ',()=>{
  expect(draftConflicts(draft,{revision:4} as Plan)).toBe(true);
  expect(draftConflicts(draft,{revision:3} as Plan)).toBe(false);
 });
 it.each(['{','null','{"revision":3,"context":"x","steps":[null]}','{"revision":3,"context":"x","steps":[{}]}'])('bỏ qua dữ liệu bản sửa hỏng: %s',raw=>{
  expect(readPlanDraft({getItem:()=>raw},'draft')).toBeUndefined();
 });
 it('không làm hỏng giao diện khi kho lưu trữ không truy cập được',()=>{
  expect(readPlanDraft({getItem:()=>{throw Error('denied');}},'draft')).toBeUndefined();
 });
});
