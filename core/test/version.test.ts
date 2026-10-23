import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
it('updates Chat and Office together and rejects version drift',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-version-'));
 try{
  const files=['package.json','package-lock.json','shared/package.json','core/package.json','bridge/package.json','addin/package.json','chatbox/package.json','chatbox/src-tauri/tauri.conf.json','chatbox/src-tauri/Cargo.toml','chatbox/src-tauri/Cargo.lock','addin/manifest.xml','core/src/desktop/runtime.ts','scripts/windows/studio.iss','scripts/windows/pvta.iss'];
  for(const f of files){fs.mkdirSync(path.dirname(path.join(temp,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(temp,f));}
  const run=(arg:string)=>spawnSync(process.execPath,[path.join(root,'scripts/version.mjs'),arg],{cwd:temp,encoding:'utf8'});
  expect(run('1.2.3').status).toBe(0);expect(run('--check').status).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(temp,'chatbox/src-tauri/tauri.conf.json'),'utf8')).version).toBe('1.2.3');
  expect(fs.readFileSync(path.join(temp,'addin/manifest.xml'),'utf8')).toContain('<Version>1.2.3.0</Version>');
  const file=path.join(temp,'bridge/package.json');const j=JSON.parse(fs.readFileSync(file,'utf8'));j.version='1.2.2';fs.writeFileSync(file,JSON.stringify(j,null,2)+'\n');
  expect(run('--check').status).toBe(1);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
