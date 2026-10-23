import {describe,expect,it} from 'vitest';
import {timeline} from '../src/chat-timeline';

const msg=(id:string,at:number)=>({id,at,role:'user',text:id}) as any;
const file=(id:string,at?:number)=>({id,name:`${id}.png`,at}) as any;

describe('timeline đính kèm',()=>{
 it('đặt tệp ngay trước tin nhắn gửi sau đó',()=>{
  const t=timeline([msg('m1',10),msg('m2',30)],[file('a',20)]);
  expect(t.map(i=>i.kind==='message'?i.message.id:'files')).toEqual(['m1','files','m2']);
 });
 it('gộp nhiều tệp liên tiếp và không bỏ sót tệp thiếu mốc thời gian',()=>{
  const t=timeline([msg('m1',10)],[file('a',20),file('b',21),file('c')]);
  const f=t.filter(i=>i.kind==='files') as any[];
  expect(f).toHaveLength(1);expect(f[0].files.map((x:any)=>x.id)).toEqual(['a','b','c']);
 });
 it('hiện tệp khi hội thoại chưa có tin nhắn',()=>{
  expect(timeline([],[file('a',1)])).toHaveLength(1);
 });
});
