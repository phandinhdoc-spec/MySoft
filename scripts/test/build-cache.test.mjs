import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fingerprint, recordTree, validTree, ensureDependencies} from '../build-cache.mjs';

test('runtime cache rejects changed inputs, missing and corrupted payloads', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-cache-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'python'),'runtime');
 await recordTree(root,'key');
 assert.equal(await validTree(root,'key'),true);
 assert.equal(await validTree(root,'other'),false);
 await fs.writeFile(path.join(root,'python'),'corrupt');
 assert.equal(await validTree(root,'key'),false);
 await fs.rm(path.join(root,'python'));
 assert.equal(await validTree(root,'key'),false);
});

test('npm installs once, reinstalls after manifest changes or missing dependencies', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-deps-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'local'));
 await fs.writeFile(path.join(root,'local/package.json'),JSON.stringify({name:'local-fixture',version:'1.0.0'}));
 const manifest={name:'fixture',version:'1.0.0',private:true,workspaces:['local']};
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify(manifest));
 execFileSync('npm',['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],{cwd:root,stdio:'pipe'});
 assert.equal(await ensureDependencies(root),true);
 assert.equal(await ensureDependencies(root),false);
 const before=await fingerprint(root,['package.json']);
 manifest.description='changed';
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify(manifest));
 assert.notEqual(await fingerprint(root,['package.json']),before);
 assert.equal(await ensureDependencies(root),true);
 await fs.rm(path.join(root,'node_modules/local-fixture'));
 assert.equal(await ensureDependencies(root),true);
 assert.equal(await ensureDependencies(root),false);
});

test('installer sync updates source, removes stale source and preserves cached outputs', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-sync-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const base=path.join(root,'build cache'), work=path.join(root,'snapshot');
 for(const folder of ['node_modules','chatbox/src-tauri/runtime','chatbox/src-tauri/binaries','dist','target']) {
  await fs.mkdir(path.join(base,'repo',folder),{recursive:true});
  await fs.writeFile(path.join(base,'repo',folder,'keep'),'cached');
 }
 await fs.mkdir(path.join(work,'repo'),{recursive:true});
 await fs.writeFile(path.join(base,'repo','removed.ts'),'old');
 await fs.writeFile(path.join(base,'repo','changed.ts'),'old');
 await fs.writeFile(path.join(work,'repo','changed.ts'),'new source');
 const script=await fs.readFile(new URL('../../installers/source-macos.sh',import.meta.url),'utf8');
 const sync=script.slice(script.indexOf('repo="$base/repo"'),script.indexOf('cd "$repo"'));
 execFileSync('bash',['-euc',sync],{env:{...process.env,base,work}});
 assert.equal(await fs.readFile(path.join(base,'repo','changed.ts'),'utf8'),'new source');
 await assert.rejects(fs.access(path.join(base,'repo','removed.ts')));
 for(const folder of ['node_modules','chatbox/src-tauri/runtime','chatbox/src-tauri/binaries','dist','target'])
  assert.equal(await fs.readFile(path.join(base,'repo',folder,'keep'),'utf8'),'cached');
});
