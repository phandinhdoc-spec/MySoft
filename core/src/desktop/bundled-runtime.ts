import fs from 'node:fs';
import path from 'node:path';
/** Bundles are immutable; never install into the application directory. */
export function bundledRuntime(){
 const root=process.env.PVTA_BUNDLED_RUNTIME;if(!root)return undefined;
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(manifest.schema!==1||manifest.platform!==process.platform||manifest.arch!==process.arch)throw Error('Bộ công cụ PVTA không đúng kiến trúc máy. Hãy cài lại ứng dụng.');
 const resolve=(key:string)=>{
  const value=manifest[key];if(typeof value!=='string'||!value||path.isAbsolute(value))throw Error('Invalid bundled runtime path');
  const file=path.resolve(root,value);const relative=path.relative(path.resolve(root),file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||!fs.existsSync(file))throw Error('Bộ công cụ PVTA bị thiếu hoặc hỏng. Hãy cài lại ứng dụng.');
  return file;
 };
 return {python:resolve('python'),packages:resolve('packages'),typst:resolve('typst'),tinymist:resolve('tinymist')};
}
export function pythonEnvironment():NodeJS.ProcessEnv{
 const bundle=bundledRuntime();if(!bundle)return process.env;
 const env:NodeJS.ProcessEnv={...process.env,PYTHONPATH:bundle.packages,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',PVTA_TYPST:bundle.typst};
 delete env.PYTHONHOME;return env;
}
