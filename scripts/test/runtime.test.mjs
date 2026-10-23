import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {lockedAsset,downloadVerified,archiveCommand,sharedLibraryPath} from '../runtime/native-tools.mjs';

const lock=JSON.parse(await fs.readFile(new URL('../runtime/tools.lock.json',import.meta.url),'utf8'));
async function temporary(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta runtime test '));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return root;
}
const bytes=Buffer.from('verified runtime archive');
const asset={name:'runtime.tar.gz',url:'https://github.com/example/tool/releases/download/v1/runtime.tar.gz',
 sha256:createHash('sha256').update(bytes).digest('hex')};

test('every supported native platform has pinned release assets and checksums',()=>{
 for(const name of ['uv','typst','tinymist'])for(const platform of ['darwin','win32','linux'])for(const arch of ['x64','arm64']){
  const a=lockedAsset(lock,name,platform,arch);
  assert.match(a.url,/\/releases\/download\//);
  assert.equal(new URL(a.url).pathname.split('/').at(-1),a.name);
  assert.match(a.name,new RegExp(`^${name}-`));
  assert.match(a.name,platform==='win32'?/\.zip$/:/\.tar\.(gz|xz)$/);
 }
 assert.throws(()=>lockedAsset(lock,'uv','linux','riscv64'),/Missing verified/);
});

test('downloads the asset directly, without GitHub API or authentication',async()=>{
 const calls=[];
 const result=await downloadVerified(asset,{fetchImpl:async(url,options)=>{
  calls.push(url);assert.equal(options.headers,undefined);return new Response(bytes);
 }});
 assert.deepEqual(calls,[asset.url]);assert.deepEqual(result,bytes);
});

test('rejects an archive with an incorrect checksum',async()=>{
 await assert.rejects(downloadVerified(asset,{fetchImpl:async()=>new Response('corrupted')}),/Checksum mismatch/);
});

test('retries temporary network/server failures, then checks the archive',async()=>{
 let calls=0;const waits=[];
 const result=await downloadVerified(asset,{fetchImpl:async()=>{
  calls++;if(calls===1)throw Error('connection reset');
  return calls===2?new Response('busy',{status:503}):new Response(bytes);
 },wait:async ms=>waits.push(ms)});
 assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);assert.deepEqual(result,bytes);
});

test('does not retry permanent download errors',async()=>{
 let calls=0;
 await assert.rejects(downloadVerified(asset,{fetchImpl:async()=>{calls++;return new Response('missing',{status:404});}}),/404/);
 assert.equal(calls,1);
});

test('Windows always uses native tar.exe even with Git Bash first in PATH',()=>{
 const archive='C:\\Users\\Runner Name\\Temp\\uv.zip';const dest='C:\\Temp\\runtime files';
 const command=archiveCommand(archive,dest,{platform:'win32',systemRoot:'D:\\Windows'});
 assert.equal(command.bin,'D:\\Windows\\System32\\tar.exe');
 assert.deepEqual(command.args,['-xf',archive,'-C',dest]);
 assert.throws(()=>archiveCommand(archive,dest,{platform:'win32',systemRoot:''}),/SystemRoot/);
});

test('native Windows tar extracts a ZIP using an absolute drive path', {skip:process.platform!=='win32'},async t=>{
 const root=await temporary(t);const archive=path.join(root,'tool.zip');const dest=path.join(root,'unpacked');
 await fs.mkdir(dest);
 await fs.writeFile(archive,Buffer.from('UEsDBBQAAAAAAAAAIVxmNb+UGwAAABsAAAAGAAAAdXYuZXhlYXJjaGl2ZSByZWdyZXNzaW9uIGZpeHR1cmUKUEsBAhQDFAAAAAAAAAAhXGY1v5QbAAAAGwAAAAYAAAAAAAAAAAAAAIABAAAAAHV2LmV4ZVBLBQYAAAAAAQABADQAAAA/AAAAAAA=','base64'));
 const command=archiveCommand(archive,dest);execFileSync(command.bin,command.args);
 assert.equal(await fs.readFile(path.join(dest,'uv.exe'),'utf8'),'archive regression fixture\n');
});

test('Linux loader resolves a private Tcl dependency after setting bundle library paths', {skip:process.platform!=='linux'},async t=>{
 const root=await temporary(t);const runtime=path.join(root,'runtime');
 const lib=path.join(runtime,'python','cpython','lib');const dyn=path.join(lib,'python3.12','lib-dynload');
 const wheels=path.join(runtime,'packages','example.libs');
 await fs.mkdir(dyn,{recursive:true});await fs.mkdir(wheels,{recursive:true});
 await fs.writeFile(path.join(root,'tcl.c'),'int pvta_tcl(void){return 42;}\n');
 await fs.writeFile(path.join(root,'tk.c'),'extern int pvta_tcl(void); int pvta_tk(void){return pvta_tcl();}\n');
 execFileSync('cc',['-shared','-fPIC','-Wl,-soname,libtcl9.0.so','-o',path.join(lib,'libtcl9.0.so'),path.join(root,'tcl.c')]);
 const tkinter=path.join(dyn,'_tkinter.so');
 execFileSync('cc',['-shared','-fPIC','-o',tkinter,path.join(root,'tk.c'),`-L${lib}`,'-l:libtcl9.0.so']);
 await fs.writeFile(path.join(wheels,'libexample.so'),'fixture');
 const unresolved=execFileSync('ldd',[tkinter],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:''}});
 assert.match(unresolved,/libtcl9\.0\.so => not found/);
 const search=await sharedLibraryPath(runtime,'/existing/path');
 assert.ok(search.split(':').includes(lib));assert.ok(search.split(':').includes(wheels));
 assert.ok(search.endsWith(':/existing/path'));assert.ok(!search.split(':').includes(''));
 // linuxdeploy inspects a copied AppDir; resolution must still work there.
 const copied=path.join(root,'AppDir');await fs.cp(runtime,copied,{recursive:true});
 const resolved=execFileSync('ldd',[path.join(copied,path.relative(runtime,tkinter))],{
  encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:search},
 });
 assert.doesNotMatch(resolved,/not found/);assert.ok(resolved.includes(lib));
});

test('Windows ARM64 is wired through the build, release check and installer',async()=>{
 const read=file=>fs.readFile(new URL(file,import.meta.url),'utf8');
 const workflow=await read('../../.github/workflows/studio-release.yml');
 assert.match(workflow,/"key":"win-arm64".*"target":"aarch64-pc-windows-msvc".*"arch":"arm64".*"bundles":"nsis"/);
 // One Studio installer embeds both Chat builds; it is assembled once in its own job, never per matrix entry.
 assert.match(workflow,/PVTA-Chatbox-\$v-x64\.exe", "PVTA-Chatbox-\$v-arm64\.exe"/);
 assert.match(workflow,/studio-win:/);
 assert.doesNotMatch(workflow,/matrix\.arch == 'x64'/);
 assert.match(await read('../build-sidecar.mjs'),/'aarch64-pc-windows-msvc':'node22-win-arm64'/);
 const installer=await read('../../installers/studio.ps1');
 assert.match(installer,/PROCESSOR_ARCHITEW6432/);
 assert.match(installer,/PVTA-Chatbox-\*-arm64\.exe/);
 assert.match(installer,/PVTA_PAYLOAD/);
});

test('releases publish only Studio installers, the AppImage and the Office package',async()=>{
 const workflow=await fs.readFile(new URL('../../.github/workflows/studio-release.yml',import.meta.url),'utf8');
 const files=workflow.slice(workflow.indexOf('FILES=()'),workflow.indexOf('for f in "${FILES[@]}"'));
 assert.match(files,/PVTA-Studio-Setup-\$V\.exe/);assert.match(files,/PVTA-Studio-\$V-arm64\.dmg/);assert.match(files,/PVTA-Chatbox-\$V-x64\.AppImage/);
 assert.doesNotMatch(files,/PVTA-Chatbox-\$V-(x64|arm64)\.(exe|dmg)|\.deb|\.sh|\.command|\.bat/);
 assert.match(workflow,/\{"key":"linux-x64".*"bundles":"appimage"\}/);
 const iss=await fs.readFile(new URL('../windows/studio.iss',import.meta.url),'utf8');
 assert.match(iss,/studio-payload/);assert.match(iss,/PVTA_PAYLOAD/);
 const dmg=await fs.readFile(new URL('../build-studio-dmg.sh',import.meta.url),'utf8');
 assert.match(dmg,/PVTA_LOCAL_TGZ/);assert.match(dmg,/PVTA\.app/);
});

test('typst wheel is skipped only on Windows ARM64 using a valid PEP 508 marker',async()=>{
 const requirements=await fs.readFile(new URL('../runtime/requirements.txt',import.meta.url),'utf8');
 assert.match(requirements,/^typst==0\.15\.0; sys_platform != 'win32' or platform_machine != 'ARM64'$/m);
 assert.doesNotMatch(requirements,/;\s*not\b/); // PEP 508 markers have no "not" operator.
});
