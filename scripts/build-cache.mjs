import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export async function fingerprint(root, names, extra='') {
 const hash=createHash('sha256').update(`${process.platform}/${process.arch}/${extra}`);
 for(const name of [...names].sort()) {
  hash.update(name);
  try { hash.update(await fs.readFile(path.join(root,name))); }
  catch(error) { if(error.code!=='ENOENT')throw error; hash.update('<missing>'); }
 }
 return hash.digest('hex');
}

const receipt='.pvta-cache.json';
async function inventory(root, prefix='') {
 const entries=[];
 for(const entry of await fs.readdir(path.join(root,prefix),{withFileTypes:true})) {
  const name=path.join(prefix,entry.name);
  if(name===receipt)continue;
  if(entry.isDirectory())entries.push(...await inventory(root,name));
  else {
   const file=path.join(root,name);
   const stat=await fs.lstat(file);
   const value=entry.isSymbolicLink()?await fs.readlink(file):createHash('sha256').update(await fs.readFile(file)).digest('hex');
   entries.push([name,stat.mode,value]);
  }
 }
 return entries.sort((a,b)=>a[0].localeCompare(b[0]));
}
export async function recordTree(root,key) {
 await fs.writeFile(path.join(root,receipt),JSON.stringify({key,entries:await inventory(root)}));
}
export async function validTree(root,key) {
 try {
  const cached=JSON.parse(await fs.readFile(path.join(root,receipt),'utf8'));
  return cached.key===key && JSON.stringify(cached.entries)===JSON.stringify(await inventory(root));
 } catch { return false; }
}

export async function ensureDependencies(root) {
 const npm=process.platform==='win32'?'npm.cmd':'npm';
 const run=(args,stdio='pipe')=>execFileSync(npm,args,{cwd:root,stdio});
 const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
 const names=['package.json','package-lock.json','.npmrc','scripts/build-cache.mjs',
  ...Object.keys(lock.packages??{}).filter(p=>p&&!p.split('/').includes('node_modules')).map(p=>`${p}/package.json`)];
 const key=await fingerprint(root,names,`${process.version}/${run(['--version']).toString().trim()}`);
 const stamp=path.join(root,'node_modules/.pvta-dependencies.json');
 let reuse=false;
 try {
  const cached=JSON.parse(await fs.readFile(stamp,'utf8'));
  reuse=cached.key===key && cached.installed===await fingerprint(root,['node_modules/.package-lock.json']);
  if(reuse)run(['ls','--all','--silent']);
 } catch { reuse=false; }
 if(reuse && process.env.PVTA_REBUILD_DEPS!=='1') {
  console.log('Tái sử dụng phụ thuộc npm đã cài.');return false;
 }
 await fs.rm(stamp,{force:true});
 run(['ci'],'inherit');
 await fs.mkdir(path.dirname(stamp),{recursive:true});
 await fs.writeFile(stamp,JSON.stringify({key,installed:await fingerprint(root,['node_modules/.package-lock.json'])}));
 return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await ensureDependencies(process.cwd());
