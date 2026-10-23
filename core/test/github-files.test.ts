import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {changedLocalFiles,parseGithubLink,selectedPaths,resolveGithubLink,localFiles,downloadSelected,existingDownloads,uploadSelected,changedRemoteFiles} from '../src/desktop/github-files';
import type {GithubRunner} from '../src/desktop/github-tool';
const target={repository:'school/lessons',branch:'main',head:'old',tree:'base',remotePath:''};
describe('Selected GitHub files',()=>{
 it('rejects unsafe links and paths, deduplicates nested selections',()=>{
  expect(parseGithubLink('https://github.com/school/lessons/tree/topic/science/docs').tail).toEqual(['topic','science','docs']);
  for(const link of ['https://evil.test/a/b','https://token@github.com/a/b','https://github.com/a/b/issues','https://github.com/a/b?token=secret'])expect(()=>parseGithubLink(link)).toThrow();
  for(const p of ['../secret','/etc/file','a/.git/config','a\\b','a/../b','C:/file'])expect(()=>selectedPaths(p)).toThrow();
  expect(selectedPaths('docs\ndocs/a.md\nicon.png\ndocs')).toEqual(['docs','icon.png']);
 });
 it('resolves slash-containing branches from links',async()=>{
  const runner:GithubRunner=async(_bin,args)=>{const endpoint=args[3]!;if(endpoint.endsWith('topic%2Fscience'))return JSON.stringify({sha:'head',commit:{tree:{sha:'tree'}}});throw Error('Not found');};
  expect(await resolveGithubLink('https://github.com/school/lessons/tree/topic/science/docs','',runner)).toEqual({...target,branch:'topic/science',head:'head',tree:'tree',remotePath:'docs'});
 });
 it('includes binary files, excludes .git and rejects symlinks',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-files-test-'));
  try{
   await fs.mkdir(path.join(root,'docs/.git'),{recursive:true});await fs.writeFile(path.join(root,'docs/icon.png'),Buffer.from([0,255,128]));await fs.writeFile(path.join(root,'docs/.git/config'),'secret');
   expect((await localFiles(root,'docs')).map(f=>f.path)).toEqual(['docs/icon.png']);
   await fs.symlink(path.join(root,'docs/icon.png'),path.join(root,'alias'));
   await expect(localFiles(root,'alias')).rejects.toThrow('liên kết');
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it('downloads selected binaries without overwriting and checks blob integrity',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-download-test-')),bytes=Buffer.from([0,255,3]);
  const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const runner:GithubRunner=async(_bin,args)=>JSON.stringify(args[3]!.includes('/git/trees/')?{tree:[{path:'docs',type:'tree',mode:'040000',sha:'folder'},{path:'docs/icon.png',type:'blob',mode:'100644',sha,size:bytes.length},{path:'other.txt',type:'blob',mode:'100644',sha,size:3}]}:{encoding:'base64',content:bytes.toString('base64')});
  try{
   const dest=path.join(root,'out');await downloadSelected(target,'docs',dest,runner,new AbortController().signal);
   expect(await fs.readFile(path.join(dest,'docs/icon.png'))).toEqual(bytes);expect(await fs.readdir(dest)).toEqual(['docs']);
   await expect(downloadSelected(target,'docs',dest,runner,new AbortController().signal)).rejects.toThrow();
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it('downloads straight into an existing project folder and replaces same-named files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-download-test-')),bytes=Buffer.from([1,2,3]);
  const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const runner:GithubRunner=async(_bin,args)=>JSON.stringify(args[3]!.includes('/git/trees/')?{tree:[{path:'docs',type:'tree',mode:'040000',sha:'folder'},{path:'docs/a.bin',type:'blob',mode:'100644',sha,size:bytes.length}]}:{encoding:'base64',content:bytes.toString('base64')});
  try{
   await fs.mkdir(path.join(root,'docs'));await fs.writeFile(path.join(root,'docs/a.bin'),'cu');await fs.writeFile(path.join(root,'keep.txt'),'giu');
   expect(await existingDownloads(root,[{path:'docs/a.bin'},{path:'docs/b.bin'}])).toEqual(['docs/a.bin']);
   await downloadSelected(target,'docs',root,runner,new AbortController().signal,true);
   expect(await fs.readFile(path.join(root,'docs/a.bin'))).toEqual(bytes);expect(await fs.readFile(path.join(root,'keep.txt'),'utf8')).toBe('giu');
   await fs.rm(path.join(root,'docs/a.bin'));await fs.symlink(path.join(root,'keep.txt'),path.join(root,'docs/a.bin'));
   await expect(downloadSelected(target,'docs',root,runner,new AbortController().signal,true)).rejects.toThrow('liên kết');
   expect(await fs.readFile(path.join(root,'keep.txt'),'utf8')).toBe('giu');
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it('updates only selected files in one non-forced commit and rejects changed sources',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-upload-test-')),calls:{endpoint:string;body:any}[]=[];
  const runner:GithubRunner=async(_bin,args)=>{
   const input=args.indexOf('--input');if(input<0)return JSON.stringify({tree:[]});
   const body=JSON.parse(await fs.readFile(args[input+1]!,'utf8')),endpoint=args[input-1]!;calls.push({endpoint,body});
   return JSON.stringify({sha:endpoint.endsWith('/git/trees')?'newtree':endpoint.endsWith('/git/commits')?'newcommit':'blob'});
  };
  try{
   await fs.writeFile(path.join(root,'one.txt'),'one');await fs.writeFile(path.join(root,'unselected.txt'),'other');
   const files=await localFiles(root,'one.txt'),events:any[]=[];await uploadSelected(target,root,'one.txt','Update',files,runner,new AbortController().signal,e=>events.push(e));
   expect(events.map(e=>e.percent)).toEqual([0,0,25,50,75,100]);
   expect(events[1].files[0].state).toBe('uploading');expect(events.at(-1).files[0].state).toBe('uploaded');
   const failed:any[]=[];const rejectRef:GithubRunner=async(...args)=>{if(args[1].includes('PATCH'))throw Error('ref conflict');return runner(...args);};
   await expect(uploadSelected(target,root,'one.txt','Update',files,rejectRef,new AbortController().signal,e=>failed.push(e))).rejects.toThrow('ref conflict');expect(failed.at(-1).percent).toBe(75);
   const cancelled=new AbortController(),stopped:any[]=[];await expect(uploadSelected(target,root,'one.txt','Update',files,runner,cancelled.signal,e=>{stopped.push(e);if(e.percent===25)cancelled.abort();})).rejects.toThrow();expect(stopped.at(-1).percent).toBe(25);
   expect(calls.find(c=>c.endpoint.endsWith('/git/trees'))!.body).toEqual({base_tree:'base',tree:[{path:'one.txt',mode:'100644',type:'blob',sha:'blob'}]});
   expect(calls.find(c=>c.endpoint.endsWith('/git/commits'))!.body.parents).toEqual(['old']);
   expect(calls.find(c=>c.endpoint.includes('/git/refs/heads/'))!.body).toEqual({sha:'newcommit',force:false});
   await fs.writeFile(path.join(root,'one.txt'),'changed');await expect(uploadSelected(target,root,'one.txt','Update',files,runner,new AbortController().signal)).rejects.toThrow('thay đổi');
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it('refuses truncated trees before writing any file',async()=>{
  const runner:GithubRunner=async()=>JSON.stringify({truncated:true,tree:[]});
  await expect(downloadSelected(target,'docs','unused',runner,new AbortController().signal)).rejects.toThrow('quá lớn');
 });
});

it('automatic updates find new/changed files, respect ignores and skip already uploaded content',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-auto-update-'));
 try{
  execFileSync('git',['init'],{cwd:root,stdio:'ignore'});
  await fs.writeFile(path.join(root,'.gitignore'),'secret.txt\n');await fs.writeFile(path.join(root,'secret.txt'),'secret');await fs.writeFile(path.join(root,'same.txt'),'same');await fs.writeFile(path.join(root,'new.txt'),'new');
  const blob=(text:string)=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  let tree=[{path:'same.txt',sha:blob('same'),type:'blob',mode:'100644'},{path:'.gitignore',sha:blob('secret.txt\n'),type:'blob',mode:'100644'}];
  const run:GithubRunner=async(bin,args)=>bin==='git'?execFileSync(bin,args,{cwd:root,encoding:'utf8'}):JSON.stringify({tree});
  expect((await changedLocalFiles(root,target,run)).map(f=>f.path)).toEqual(['new.txt']);
  tree.push({path:'new.txt',sha:blob('new'),type:'blob',mode:'100644'});
  expect(await changedLocalFiles(root,target,run)).toEqual([]);
  await fs.writeFile(path.join(root,'same.txt'),'edited');expect((await changedLocalFiles(root,target,run)).map(f=>f.path)).toEqual(['same.txt']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

it('bundled comparison runs without a VM dynamic-import callback',async()=>{
 const bundle=await build({entryPoints:['core/src/desktop/github-files.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',write:false});
 const module={exports:{} as {changedLocalFiles:typeof changedLocalFiles}};
 runInNewContext(bundle.outputFiles[0]!.text,{module,exports:module.exports,require:createRequire(import.meta.url),Buffer});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-bundle-regression-'));
 try{await fs.writeFile(path.join(root,'one.txt'),'one');const files=await module.exports.changedLocalFiles(root,target,async bin=>bin==='git'?'one.txt\0':JSON.stringify({tree:[]}));expect(files.map(f=>f.path)).toEqual(['one.txt']);}finally{await fs.rm(root,{recursive:true,force:true});}
});
it('skips an embedded repository reported as a directory by Git and reports it',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-nested-git-'));
 try{
  execFileSync('git',['init'],{cwd:root,stdio:'ignore'});const nested=path.join(root,'MySoft');await fs.mkdir(nested);
  execFileSync('git',['init'],{cwd:nested,stdio:'ignore'});await fs.writeFile(path.join(nested,'inner.txt'),'private nested content');execFileSync('git',['add','.'],{cwd:nested});execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.com','commit','-m','nested'],{cwd:nested,stdio:'ignore'});
  await fs.writeFile(path.join(root,'outer.txt'),'outer');const skipped:string[]=[];
  const run:GithubRunner=async(bin,args)=>bin==='git'?execFileSync(bin,args,{cwd:root,encoding:'utf8'}):JSON.stringify({tree:[]});
  const files=await changedLocalFiles(root,target,run,p=>skipped.push(p));
  expect(files.map(f=>f.path)).toEqual(['outer.txt']);expect(skipped).toEqual(['MySoft']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

describe('Automatic download selection',()=>{
 const blob=(text:string)=>createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex');
 it('selects missing and outdated tracked files but keeps unsaved and untracked local work',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-auto-download-')),git=(...a:string[])=>execFileSync('git',a,{cwd:root,encoding:'utf8'});
  try{
   git('init','-q');git('config','user.email','t@t.vn');git('config','user.name','T');
   const write=(name:string,text:string)=>fs.writeFile(path.join(root,name),text);
   await write('same.txt','a');await write('old.txt','cu');await write('edited.txt','goc');await write('mine.txt','rieng');
   git('add','same.txt','old.txt','edited.txt');git('commit','-qm','x');
   await write('edited.txt','sua tren may'); // unsaved edit
   const remote=[['same.txt','a'],['old.txt','moi'],['edited.txt','tren github'],['mine.txt','khac'],['new.txt','tep moi']].map(([p,t])=>({path:p!,type:'blob',mode:'100644',sha:blob(t!),size:t!.length}));
   const runner:GithubRunner=async(bin,args)=>bin==='git'?execFileSync('git',args,{cwd:root,encoding:'utf8'}):JSON.stringify({tree:remote});
   const kept:string[]=[];
   const changed=await changedRemoteFiles(root,target,runner,p=>kept.push(p));
   expect(changed.sort()).toEqual(['new.txt','old.txt']);
   expect(kept.sort()).toEqual(['edited.txt','mine.txt']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
});
