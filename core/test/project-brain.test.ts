import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {projectBrainDir,projectBrainScope} from '../src/desktop/project-brain';
import {brainBinary,brainContext,brainRead,prepareBrainMcp} from '../src/desktop/brain';
import {DesktopRuntime} from '../src/desktop/runtime';
import type {Attachment} from '../src/desktop/types';
const homes:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());homes.splice(0).forEach(h=>fs.rmSync(h,{recursive:true,force:true}));vi.restoreAllMocks();});
function setup(){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'project-brain-')));homes.push(home);return home;}
function folder(home:string,name:string,body:string){const root=path.join(home,name);fs.mkdirSync(root);fs.writeFileSync(path.join(root,'same.ts'),body);return root;}
function attached(scopeId:string,file:string):Attachment{return {id:file,name:path.basename(file),path:file,scope:'project',scopeId,fingerprint:'x',segments:[]};}

describe('project-owned Brain',()=>{
 it('gives an empty project its own metadata, without PVTA knowledge or another project',()=>{
  const home=setup();const a=projectBrainScope(home,{id:'a',name:'Alpha',rules:''});const b=projectBrainScope(home,{id:'b',name:'Beta',rules:''});
  expect(a.root).not.toBe(b.root);expect(a.sources).toHaveLength(1);
  const text=fs.readFileSync(path.join(a.root,'project.md'),'utf8');
  expect(text).toContain('Alpha');expect(text).not.toContain('Beta');expect(text).not.toContain('năng lực của phần mềm');
 });
 it('keeps every selected root, excludes other projects and learning, and separates caches even for a shared folder',()=>{
  const home=setup(),a=folder(home,'a','export const first=1;'),b=folder(home,'b','export const second=2;'),secret=folder(home,'secret','secret');
  const p={id:'p',name:'P',rules:'',folders:[a,b],learning:{folders:[secret],enabled:true,notes:''}};
  const scope=projectBrainScope(home,p,[attached('other',path.join(secret,'same.ts'))]);
  expect(scope.sources!.map(s=>s.root)).toEqual([a,b,scope.root]);
  const other=projectBrainScope(home,{id:'other',name:'Other',rules:'',folders:[a]});
  expect(scope.sources![0]!.indexPath).not.toBe(other.sources![0]!.indexPath);
  expect(()=>projectBrainScope(home,p,[],{id:'c',projectId:'other'})).toThrow('không thuộc');
 });
 it('creates Brain for new and existing projects and removes only the deleted project data',async()=>{
  const home=setup();const r=new DesktopRuntime(()=>{},home);runtimes.push(r);
  vi.spyOn(r as any,'brainWarm').mockImplementation(()=>{});
  const call=(method:string,params:Record<string,unknown>)=>r.dispatch({id:'t',method,params});
  const a=await call('saveProject',{name:'A',rules:''}) as string,b=await call('saveProject',{name:'B',rules:''}) as string;
  expect(fs.existsSync(path.join(projectBrainDir(home,a),'project.md'))).toBe(true);
  const chatId=await call('newChat',{projectId:a});const chat=r.store.data.chats.find(c=>c.id===chatId)!;
  expect((r as any).chatBrainScope(chat).root).toBe(projectBrainDir(home,a));
  await call('moveChat',{chatId,projectId:b});expect((r as any).chatBrainScope(chat).root).toBe(projectBrainDir(home,b));
  await call('deleteProject',{id:a,keepFolders:true});expect(fs.existsSync(projectBrainDir(home,a))).toBe(false);expect(fs.existsSync(projectBrainDir(home,b))).toBe(true);
 });
});

describe.skipIf(!brainBinary())('project Brain real tools',()=>{
 it('workflow model calls receive only their own project MCP descriptor',async()=>{
  const home=setup(),a=folder(home,'a','export const one=1;'),b=folder(home,'b','export const two=2;');
  const runtime=new DesktopRuntime(()=>{},home);runtimes.push(runtime);const r=runtime as any;
  runtime.store.data.projects.push({id:'a',name:'A',rules:'',folders:[a]},{id:'b',name:'B',rules:'',folders:[b]});
  const scopes:any[]=[];
  vi.spyOn(runtime.engine,'run').mockImplementation(async request=>{
   scopes.push(JSON.parse(fs.readFileSync(request.brain!.args[1]!,'utf8')));
   return {text:'ok',attempts:1,fullPrompt:true,timings:{totalMs:0}};
  });
  for(const projectId of ['a','b'])await r.taskContext.run({kind:'workflow',projectId},()=>r.executeModel('read code','system',new AbortController().signal,undefined,{backend:'codex',model:'sol'}));
  expect(scopes[0].sources.map((s:any)=>s.root)).toEqual([a,projectBrainDir(home,'a')]);
  expect(scopes[1].sources.map((s:any)=>s.root)).toEqual([b,projectBrainDir(home,'b')]);
 });
 it('searches two roots through MCP, routes same-name files, and rejects a different project scope',async()=>{
  const home=setup(),a=folder(home,'a','export function firstProjectSymbol(){return 1;}'),b=folder(home,'b','export function secondProjectSymbol(){return 2;}'),secret=folder(home,'secret','export const secretSymbol=99;');
  const scope=projectBrainScope(home,{id:'p',name:'P',rules:'',folders:[a,b]});
  const other=projectBrainScope(home,{id:'other',name:'Other',rules:'',folders:[secret]});
  const ctx=await brainContext(scope);expect(ctx).toContain('PHẠM VI DỰ ÁN RIÊNG');expect(ctx).toContain(scope.sources![1]!.id);
  const direct=await brainRead(scope,'brain_find',{query:'secondProjectSymbol'});expect(JSON.stringify(direct)).toContain('secondProjectSymbol');
  const connection=await prepareBrainMcp(home,scope,new AbortController().signal);
  const messages=[
   {id:1,method:'tools/list'},
   {id:2,method:'tools/call',params:{name:'brain_find',arguments:{query:'secondProjectSymbol'}}},
   {id:3,method:'tools/call',params:{name:'brain_read',arguments:{scope:scope.sources![1]!.id,file:'same.ts',symbol:'secondProjectSymbol'}}},
   {id:4,method:'tools/call',params:{name:'brain_read',arguments:{scope:other.sources![0]!.id,file:'same.ts',start:1,end:1}}},
   {id:5,method:'tools/call',params:{name:'brain_read',arguments:{file:'same.ts',start:1,end:1}}},
  ];
  try{
   const output=execFileSync(connection.config.command,connection.config.args,{input:messages.map(m=>JSON.stringify({jsonrpc:'2.0',...m})).join('\n')+'\n',encoding:'utf8'});
   const replies=output.trim().split('\n').map(l=>JSON.parse(l));
   expect(replies[0].result.tools.find((t:any)=>t.name==='brain_read').inputSchema.required).toContain('scope');
   expect(replies[1].result.isError).toBe(false);expect(replies[1].result.content[0].text).toContain('secondProjectSymbol');
   expect(replies[2].result.content[0].text).toContain('return 2');
   expect(replies[3].result.isError).toBe(true);expect(replies[4].result.isError).toBe(true);
   expect(output).not.toContain('secretSymbol');
   expect(fs.existsSync(scope.sources![0]!.indexPath!)).toBe(true);expect(fs.existsSync(other.sources![0]!.indexPath!)).toBe(false);
  }finally{await connection.dispose();}
  const removed=projectBrainScope(home,{id:'p',name:'P',rules:'',folders:[a]});
  await expect(brainRead(removed,'brain_read',{scope:scope.sources![1]!.id,file:'same.ts',start:1,end:1})).rejects.toThrow('không thuộc');
 });
});
