import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

export function lockedAsset(lock,name,platform=process.platform,arch=process.arch){
 const tool=lock.schema===1?lock.tools?.[name]:undefined;
 const asset=tool?.assets?.[`${platform}-${arch}`];
 if(!asset||!/^https:\/\/github\.com\//.test(asset.url)||!/^[a-f0-9]{64}$/.test(asset.sha256))
  throw Error(`Missing verified ${name} asset for ${platform}/${arch}; update tools.lock.json`);
 return {...asset,tag:tool.tag};
}

// Download pinned public release assets directly: CI does not need GitHub's metadata API.
export async function downloadVerified(asset,{fetchImpl=fetch,wait=delay}={}){
 let bytes;
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{
   response=await fetchImpl(asset.url,{signal:AbortSignal.timeout(180000)});
   if(!response.ok){
    const error=Error(`Download failed (${response.status}): ${asset.url}`);
    error.retryable=response.status===408||response.status===429||response.status>=500;
    throw error;
   }
   bytes=Buffer.from(await response.arrayBuffer());
   break;
  }catch(error){
   await response?.body?.cancel().catch(()=>{});
   if(error.retryable===false||attempt===2)throw error;
   const seconds=Number(response?.headers?.get('retry-after'));
   const ms=seconds>0?Math.min(seconds*1000,30000):1000*2**attempt;
   console.warn(`Retrying download of ${asset.name} (${attempt+1}/2)`);
   await wait(ms);
  }
 }
 if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)
  throw Error(`Checksum mismatch: ${asset.name}`);
 return bytes;
}

export function archiveCommand(archive,destination,{
 platform=process.platform,systemRoot=process.env.SystemRoot??process.env.WINDIR,
}={}){
 if(platform==='win32'){
  if(!systemRoot||!path.win32.isAbsolute(systemRoot))throw Error('Missing Windows SystemRoot for native tar.exe');
  // Git Bash prepends GNU tar to PATH. It treats C: as a remote host and cannot read ZIP.
  return {bin:path.win32.join(systemRoot,'System32','tar.exe'),args:['-xf',archive,'-C',destination]};
 }
 return {bin:'tar',args:['--no-same-owner','-xf',archive,'-C',destination]};
}

export async function sharedLibraryPath(runtime,existing=''){
 const dirs=new Set();
 async function visit(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())await visit(file);
   else if(/\.so(?:\.|$)/.test(entry.name))dirs.add(path.resolve(dir));
  }
 }
 await visit(runtime);
 // Include private Python/Tcl libraries and wheel .libs folders before linuxdeploy runs.
 // Keep the caller's search path, without an empty entry (which would mean cwd).
 return [...dirs].sort().concat(existing.split(':').filter(Boolean)).join(':');
}
