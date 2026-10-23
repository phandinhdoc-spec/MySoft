import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const token=crypto.randomBytes(32).toString('hex');
export default defineConfig({plugins:[react(),{name:'pvta-development-ipc',async configureServer(server){
 const output=path.resolve('../core/dist/dev-runtime.mjs');
 await build({entryPoints:[path.resolve('../core/src/desktop/runtime.ts')],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22',external:['bufferutil','utf-8-validate'],banner:{js:"import{createRequire as __pvtaRequire}from'node:module';const require=__pvtaRequire(import.meta.url);"}});
 process.env.PVTA_DESKTOP_SKILLS=path.resolve('../desktop-skills');
 process.env.PVTA_OFFICE_ADDIN=path.resolve('../addin/dist');
 process.env.PVTA_PYTHON_SCRIPT=path.resolve('../core/python/documents.py');
 const {DesktopRuntime}=await import(pathToFileURL(output).href+'?t='+Date.now());
 const runtime=new DesktopRuntime((e:unknown)=>server.ws.send({type:'custom',event:'pvta:event',data:e}));
 server.httpServer?.once('close',()=>runtime.dispose());
 server.middlewares.use('/__pvta/rpc',(req,res)=>{
  const origin=req.headers.origin;
  if(req.method!=='POST'||req.headers['x-pvta-token']!==token||(origin&&!/^http:\/\/127\.0\.0\.1:1420$/.test(origin))){res.statusCode=403;res.end();return;}
  let raw='';let tooLarge=false;req.on('data',chunk=>{raw+=chunk;if(raw.length>2_000_000){tooLarge=true;res.statusCode=413;res.end();req.destroy();}});
  req.on('end',()=>{if(tooLarge)return;let r;try{r=JSON.parse(raw);}catch{res.statusCode=400;res.end();return;}void runtime.dispatch(r).then((result:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));},(e:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:runtime.publicError(e)}));});});
 });
}}],define:{__PVTA_DEV_TOKEN__:JSON.stringify(token)},server:{host:'127.0.0.1',port:1420,strictPort:true},clearScreen:false,build:{target:'es2022'}});
