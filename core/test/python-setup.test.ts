import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const mock=vi.hoisted(()=>({created:false,pdf:false,failInstall:false,installs:0,commands:[] as {bin:string;args:string[]}[]}));
vi.mock('node:child_process',()=>({execFile:(bin:string,args:string[],_options:unknown,callback:(error:Error|null,out:string)=>void)=>{
 mock.commands.push({bin,args});let error:Error|null=null;let out='';
 if(args.includes('venv'))mock.created=true;
 else if(args.includes('install')){mock.installs++;if(mock.failInstall)error=Error('offline');else mock.pdf=true;}
 else if(args.includes('-c')){
  const code=args.at(-1)!;const privateBin=bin.includes('pvta-python-test-');
  if(code.includes('print(sys.executable)'))out='/test-system/python3';
  else if((privateBin&&!mock.created)||(code.includes('import pypdf')&&!mock.pdf))error=Object.assign(Error('missing'),{code:'ENOENT'});
 }
 queueMicrotask(()=>callback(error,out));return {};
}}));
import {ensurePython} from '../src/desktop/python';
let home:string;
beforeEach(()=>{home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-python-test-'));Object.assign(mock,{created:false,pdf:false,failInstall:false,installs:0,commands:[]});});
afterEach(()=>{fs.rmSync(home,{recursive:true,force:true});vi.unstubAllGlobals();});
describe('automatic document support',()=>{
 it('installs once in the private environment for simultaneous PDF attachments and reuses it',async()=>{
  const [a,b]=await Promise.all([ensurePython(true,home),ensurePython(true,home)]);expect(a).toBe(b);expect(a.startsWith(home)).toBe(true);expect(mock.installs).toBe(1);
  await ensurePython(true,home);expect(mock.installs).toBe(1);
  expect(mock.commands.filter(c=>c.args.includes('install')).every(c=>c.bin.startsWith(home))).toBe(true);
 });
 it('does not install PDF dependencies for ordinary Office or calculation tasks',async()=>{await ensurePython(false,home);expect(mock.installs).toBe(0);expect(mock.commands.some(c=>c.args.includes('venv'))).toBe(false);});
 it('allows retry after a failed setup without caching the failure',async()=>{
  mock.failInstall=true;vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));
  await expect(ensurePython(true,home)).rejects.toThrow('tự thử cài lại');mock.failInstall=false;
  await expect(ensurePython(true,home)).resolves.toContain(home);expect(mock.installs).toBe(2);
 });
 it('rejects a corrupted runtime download before extracting or executing it',async()=>{
  mock.failInstall=true;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.endsWith('.sha256')?'0'.repeat(64):'bad archive')));
  await expect(ensurePython(true,home)).rejects.toThrow('tự thử cài lại');
  expect(mock.commands.some(c=>c.bin==='/usr/bin/tar'||c.bin.endsWith('/uv'))).toBe(false);
 });
});

it('selects only the dependency required by each file task',async()=>{
 const {supportForJob}=await import('../src/desktop/python');
 expect(supportForJob({op:'create_office',output:'a.docx'})).toBe('word');
 expect(supportForJob({op:'create_office',output:'a.XLSX'})).toBe('excel');
 expect(supportForJob({op:'create_office',output:'a.pptx'})).toBe('powerpoint');
 expect(supportForJob({op:'edit_excel'})).toBe('excel');
 expect(supportForJob({op:'extract',path:'a.pdf'})).toBe(true);
 expect(supportForJob({op:'extract',path:'a.docx'})).toBe(false);
 expect(supportForJob({op:'calculate'})).toBe(false);
});
it('uses noninteractive installation without retaining pip download cache',async()=>{
 await ensurePython(true,home);
 const install=mock.commands.find(c=>c.args.includes('install'))!;
 expect(install.args).toContain('--no-input');expect(install.args).toContain('--no-cache-dir');
});

it('uses bundled Python offline without attempting pip or a system interpreter',async()=>{
 const bundle=path.join(home,'bundled');fs.mkdirSync(bundle);
 for(const name of ['python','packages','typst','tinymist'])fs.writeFileSync(path.join(bundle,name),'');
 fs.writeFileSync(path.join(bundle,'manifest.json'),JSON.stringify({schema:1,platform:process.platform,arch:process.arch,python:'python',packages:'packages',typst:'typst',tinymist:'tinymist'}));
 vi.stubEnv('PVTA_BUNDLED_RUNTIME',bundle);mock.created=true;mock.pdf=true;
 const network=vi.fn().mockRejectedValue(Error('offline'));vi.stubGlobal('fetch',network);
 try{
  expect(await ensurePython(true,home)).toBe(path.join(bundle,'python'));
  expect(mock.installs).toBe(0);expect(network).not.toHaveBeenCalled();
  expect(mock.commands.every(c=>c.bin===path.join(bundle,'python'))).toBe(true);
  mock.created=false;
  await expect(ensurePython(true,home)).rejects.toThrow('cài lại');expect(network).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();}
});
