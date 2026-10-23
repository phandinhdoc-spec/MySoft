import {describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-pin-'));roots.push(dir);const r=new DesktopRuntime(()=>{},dir);runtimes.push(r);return r;}
const req=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
const idOf=(v:any)=>typeof v==='string'?v:v.id??v.chatId;
const chats=(r:DesktopRuntime)=>(r as any).store.data.chats as {id:string;pinned?:boolean;updatedAt:number}[];

describe('Ghim hội thoại',()=>{
 it('pinChat đặt và bỏ cờ pinned, không để lại giá trị false',async()=>{
  const r=setup();const id=idOf(await req(r,'newChat',{}));const c=()=>chats(r).find(x=>x.id===id)!;
  expect(c().pinned).toBeUndefined();
  expect(await req(r,'pinChat',{chatId:id,pinned:true})).toBe(true);expect(c().pinned).toBe(true);
  await req(r,'pinChat',{chatId:id,pinned:false});expect(c().pinned).toBeUndefined();expect('pinned' in c()).toBe(false);
 });
 it('từ chối hội thoại không tồn tại',async()=>{
  const r=setup();await expect(req(r,'pinChat',{chatId:'nope',pinned:true})).rejects.toThrow();
 });
 it('thứ tự sắp xếp: hội thoại ghim lên trước, cùng nhóm theo updatedAt giảm dần',()=>{
  const list=[{id:'a',updatedAt:3},{id:'b',updatedAt:1,pinned:true},{id:'c',updatedAt:2},{id:'d',updatedAt:5,pinned:true}] as {id:string;updatedAt:number;pinned?:boolean}[];
  const sorted=list.slice().sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.updatedAt-a.updatedAt).map(x=>x.id);
  expect(sorted).toEqual(['d','b','a','c']);
 });
});
