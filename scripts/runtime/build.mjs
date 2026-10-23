// Native build only: ship a relocatable interpreter, never a virtualenv.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {fingerprint,recordTree,validTree} from '../build-cache.mjs';
import {lockedAsset,downloadVerified,archiveCommand} from './native-tools.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'chatbox/src-tauri/runtime');
const cacheKey=await fingerprint(root,[
 'scripts/runtime/build.mjs','scripts/runtime/native-tools.mjs','scripts/runtime/tools.lock.json',
 'scripts/runtime/requirements.txt','scripts/runtime/smoke.py','scripts/build-cache.mjs',
]);
if(process.env.PVTA_REBUILD_RUNTIME!=='1' && await validTree(output,cacheKey)) {
 console.log(`Tái sử dụng runtime đã kiểm tra: ${process.platform}/${process.arch}`);
 process.exit(0);
}
const work=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-runtime-'));
const payload=path.join(work,'payload');
const arch={x64:'x86_64',arm64:'aarch64'}[process.arch];
const platform={darwin:'apple-darwin',win32:'pc-windows-msvc',linux:'unknown-linux'}[process.platform];
if(!arch||!platform)throw Error('Unsupported runtime target');
const suffix=process.platform==='win32'?'.exe':'';
const run=(bin,args,env={})=>execFileSync(bin,args,{stdio:'inherit',env:{...process.env,...env},timeout:600000});
const lock=JSON.parse(await fs.readFile(new URL('./tools.lock.json',import.meta.url),'utf8'));
async function files(dir){
 const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(p));else out.push(p);
 }return out;
}
const sources=[];
async function tool(name,dest){
 const asset=lockedAsset(lock,name);
 console.log(`Preparing ${name} ${asset.tag} for ${process.platform}/${process.arch}`);
 const bytes=await downloadVerified(asset);
 const dir=path.join(work,name);await fs.mkdir(dir);const archive=path.join(work,asset.name);await fs.writeFile(archive,bytes);
 const command=archiveCommand(archive,dir);run(command.bin,command.args);
 const executable=(await files(dir)).find(p=>path.basename(p)===name+suffix);
 if(!executable)throw Error(`Missing executable: ${name}`);
 await fs.mkdir(dest,{recursive:true});const bin=path.join(dest,name+suffix);await fs.copyFile(executable,bin);await fs.chmod(bin,0o755);
 // Preserve licenses/readmes included in upstream distributions.
 for(const p of await files(dir))if(/^(license|copying|notice|readme)/i.test(path.basename(p)))await fs.copyFile(p,path.join(dest,`${name}-${path.basename(p)}`));
 sources.push({name,tag:asset.tag,url:asset.url,sha256:asset.sha256});return bin;
}
try{
 await fs.mkdir(payload);
 const uv=await tool('uv',path.join(work,'builder'));
 const env={UV_PYTHON_INSTALL_DIR:path.join(payload,'python'),UV_PYTHON_BIN_DIR:path.join(work,'bin'),UV_NO_CACHE:'1',UV_NO_PROGRESS:'1',UV_PYTHON_NO_REGISTRY:'1'};
 run(uv,['python','install','--no-bin','3.12.12'],env);
 // Windows distributions also ship venv launchers (Lib/venv/scripts/nt/python.exe).
 // Pick the interpreter closest to the distribution root, never a nested launcher.
 const depth=p=>path.relative(env.UV_PYTHON_INSTALL_DIR,p).split(path.sep).length;
 const python=(await files(env.UV_PYTHON_INSTALL_DIR))
  .filter(p=>process.platform==='win32'?path.basename(p).toLowerCase()==='python.exe':p.endsWith('/bin/python3.12'))
  .sort((a,b)=>depth(a)-depth(b)||a.length-b.length)[0];
 if(!python)throw Error('Missing standalone Python');
 // uv creates absolute minor-version aliases outside the actual distribution.
 // They are unnecessary in the bundle and become dangling after relocation.
 for(const entry of await fs.readdir(env.UV_PYTHON_INSTALL_DIR,{withFileTypes:true}))
  if(entry.isSymbolicLink())await fs.unlink(path.join(env.UV_PYTHON_INSTALL_DIR,entry.name));
 const requirements=path.join(root,'scripts/runtime/requirements.txt');
 run(uv,['pip','install','--python',python,'--target',path.join(payload,'packages'),'--only-binary',':all:','--index-url','https://pypi.org/simple','-r',requirements],env);
 const typst=await tool('typst',path.join(payload,'bin'));
 const tinymist=await tool('tinymist',path.join(payload,'bin'));
 const relative=p=>path.relative(payload,p).split(path.sep).join('/');
 const manifest={schema:1,platform:process.platform,arch:process.arch,python:relative(python),packages:'packages',typst:relative(typst),tinymist:relative(tinymist),sources};
 await fs.writeFile(path.join(payload,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.copyFile(requirements,path.join(payload,'requirements.txt'));
 // Move before probing: catches absolute interpreter paths and missing shared libraries.
 const relocated=path.join(work,'relocated runtime');await fs.rename(payload,relocated);
 const pythonEnv={PYTHONPATH:path.join(relocated,'packages'),PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',PYTHONHOME:'',PVTA_TYPST:path.join(relocated,manifest.typst)};
 run(path.join(relocated,manifest.python),[path.join(root,'scripts/runtime/smoke.py')],pythonEnv);
 run(path.join(relocated,manifest.typst),['--version']);run(path.join(relocated,manifest.tinymist),['--version']);
 await fs.rm(output,{recursive:true,force:true});await fs.cp(relocated,output,{recursive:true,dereference:true});
 await recordTree(output,cacheKey);
 console.log(`Bundled document runtime: ${process.platform}/${process.arch}`);
}finally{await fs.rm(work,{recursive:true,force:true});}
