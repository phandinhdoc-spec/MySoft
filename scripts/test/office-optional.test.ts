import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {expect,it} from 'vitest';

it('opens the installed desktop without installing or requiring Office',()=>{
 const source=fs.readFileSync(new URL('../../installers/source-macos.sh',import.meta.url),'utf8');
 const tail=source.slice(source.indexOf('backup="$parent/PVTA.previous.app"'));
 expect(tail).toContain('open "$target"');
 const run=spawnSync('bash',['-c',`
set -eu
parent=/unused; target=/unused/PVTA.app; stage=/unused/stage; repo=/unused/repo
rm() { :; }
mv() { :; }
bash() { echo OFFICE_INSTALL_ATTEMPT; return 1; }
open() { echo DESKTOP_OPENED; }
${tail}`],{encoding:'utf8'});
 expect(run.stdout).not.toContain('OFFICE_INSTALL_ATTEMPT');
 expect(run.status).toBe(0);
 expect(run.stdout).toContain('DESKTOP_OPENED');
});
