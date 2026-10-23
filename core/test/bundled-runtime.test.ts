import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {bundledRuntime,pythonEnvironment} from '../src/desktop/bundled-runtime';
let root:string;
beforeEach(()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'pvta bundled runtime '));
 for(const name of ['python','packages','typst','tinymist'])fs.writeFileSync(path.join(root,name),'');
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schema:1,platform:process.platform,arch:process.arch,python:'python',packages:'packages',typst:'typst',tinymist:'tinymist'}));
 vi.stubEnv('PVTA_BUNDLED_RUNTIME',root);
});
afterEach(()=>{vi.unstubAllEnvs();fs.rmSync(root,{recursive:true,force:true});});
it('resolves relocated paths with spaces and isolates Python from user settings',()=>{
 vi.stubEnv('PYTHONHOME','unrelated-python');vi.stubEnv('PYTHONPATH','unrelated-packages');
 expect(bundledRuntime()?.python).toBe(path.join(root,'python'));
 expect(pythonEnvironment().PYTHONPATH).toBe(path.join(root,'packages'));
 expect(pythonEnvironment().PYTHONHOME).toBeUndefined();expect(pythonEnvironment().PYTHONNOUSERSITE).toBe('1');
 // Windows ARM64 has no typst wheel: Python falls back to the bundled executable named here.
 expect(pythonEnvironment().PVTA_TYPST).toBe(path.join(root,'typst'));
});
it('fails closed for missing or wrong architecture bundles',()=>{
 const file=path.join(root,'manifest.json');const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 manifest.arch='unsupported';fs.writeFileSync(file,JSON.stringify(manifest));expect(()=>bundledRuntime()).toThrow('kiến trúc');
 manifest.arch=process.arch;manifest.python='../outside';fs.writeFileSync(file,JSON.stringify(manifest));expect(()=>bundledRuntime()).toThrow();
 manifest.python='missing';fs.writeFileSync(file,JSON.stringify(manifest));expect(()=>bundledRuntime()).toThrow();
});
it('allows source development without a packaged runtime',()=>{
 vi.stubEnv('PVTA_BUNDLED_RUNTIME','');expect(bundledRuntime()).toBeUndefined();
});
