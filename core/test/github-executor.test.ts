import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {GithubTool,runGithub,sanitizeGithub,type GithubRunner} from '../src/desktop/github-tool';
import type {GithubEvent,GithubRunResult} from '../src/desktop/github-model';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function repo(){const dir=await mkdtemp(path.join(tmpdir(),'pvta-executor-'));dirs.push(dir);const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.com');await writeFile(path.join(dir,'lesson.txt'),'first\n');git('add','.');git('commit','-m','first');return {dir,git};}
const offline:GithubRunner=(bin,args,cwd,signal,onData)=>bin==='gh'?Promise.reject(Error('ENOENT')):runGithub(bin,args,cwd,signal,onData);
function harness(runner=offline){const events:GithubEvent[]=[];const tool=new GithubTool(e=>events.push(e),runner);async function wait(id:string){for(let i=0;i<1000;i++){const result=tool.result(id);if(result)return result;await new Promise(r=>setTimeout(r,10));}throw Error('run did not finish');}async function execute(folder:string,operationId:string,values:Record<string,string>={},confirmation=''){const p=await tool.preview({version:1,folder,operationId,values});const {runId}=tool.run({version:1,previewId:p.previewId,confirmation,requestId:crypto.randomUUID()});return wait(runId);}return {tool,events,wait,execute};}
describe('GitHub executor',()=>{
 it('rejects a moved remote head before uploading selected files',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pvta-selected-'));dirs.push(dir);await writeFile(path.join(dir,'one.txt'),'one');
  let head='old',writes=0;
  const h=harness(async(bin,args)=>{
   if(args.includes('--input')){writes++;return '{}';}
   if(args[0]==='--version')return 'version';
   if(args[0]==='repo')return 'WRITE';
   if(args.includes('user'))return 'teacher';
   const endpoint=args[3]??'';
   if(endpoint.endsWith('/commits/main'))return JSON.stringify({sha:head,commit:{tree:{sha:'tree'}}});
   if(endpoint.endsWith('/git/ref/heads/main'))return '{}';
   if(endpoint==='repos/teacher/test')return JSON.stringify({default_branch:'main'});
   throw Error('Unexpected command '+args.join(' '));
  });
  const preview=await h.tool.preview({version:1,operationId:'uploadFiles',values:{link:'https://github.com/teacher/test',ref:'main',source:dir,paths:'one.txt',message:'Selected update'}});
  expect(preview.files).toEqual([{path:'one.txt',size:3}]);head='new';
  const result=await h.wait(h.tool.run({version:1,previewId:preview.previewId,confirmation:'CẬP NHẬT',requestId:'selected-stale'}).runId);
  expect(result.error?.code).toBe('stalePreview');expect(writes).toBe(0);expect(result.effects).toBe('none');
 });
 it('reports missing tools and blocks previews without launching mutations',async()=>{
  const calls:string[][]=[];
  const h=harness(async(_bin,args)=>{calls.push(args);throw Error('ENOENT');});
  const status=await h.tool.status();
  expect(status.tools.git.installed).toBe(false);
  expect(status.tools.gh.installed).toBe(false);
  await expect(h.tool.preview({version:1,operationId:'repoCreate',values:{repository:'teacher/test',visibility:'private'}})).rejects.toThrow();
  expect(calls.every(args=>args[0]==='--version')).toBe(true);
 });
 it('blocks remote writes when gh is installed but not authenticated',async()=>{
  const calls:string[][]=[];
  const h=harness(async(_bin,args)=>{calls.push(args);if(args[0]==='--version')return 'version';throw Error('not logged in');});
  expect((await h.tool.status()).auth.state).toBe('missing');
  await expect(h.tool.preview({version:1,operationId:'repoCreate',values:{repository:'teacher/test',visibility:'private'}})).rejects.toThrow();
  expect(calls.some(args=>args[0]==='repo'&&args[1]==='create')).toBe(false);
 });
 it('pushes and fast-forward pulls through a local bare remote',async()=>{
  const {dir,git}=await repo();
  const remote=await mkdtemp(path.join(tmpdir(),'pvta-remote-'));dirs.push(remote);
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
  git('remote','add','origin',remote);git('push','-u','origin','main');
  const h=harness();
  await writeFile(path.join(dir,'lesson.txt'),'second\n');
  expect((await h.execute(dir,'saveAndPush',{message:'second'})).state).toBe('success');
  const peer=await mkdtemp(path.join(tmpdir(),'pvta-peer-'));dirs.push(peer);
  execFileSync('git',['clone','--branch','main',remote,peer],{stdio:'ignore'});
  const peerGit=(...args:string[])=>execFileSync('git',args,{cwd:peer,stdio:'ignore'});
  peerGit('config','user.name','Peer');peerGit('config','user.email','peer@example.com');
  await writeFile(path.join(peer,'lesson.txt'),'from peer\n');
  peerGit('commit','-am','peer update');peerGit('push');
  expect((await h.execute(dir,'pull')).state).toBe('success');
  expect(await readFile(path.join(dir,'lesson.txt'),'utf8')).toBe('from peer\n');
  expect(git('status','--porcelain')).toBe('');
 },20000);
 it('syncs both ways with unsaved local files by saving them first, and still works when the tree is clean',async()=>{
  const {dir,git}=await repo();
  const remote=await mkdtemp(path.join(tmpdir(),'pvta-remote-'));dirs.push(remote);
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
  git('remote','add','origin',remote);git('push','-u','origin','main');
  const peer=await mkdtemp(path.join(tmpdir(),'pvta-peer-'));dirs.push(peer);
  execFileSync('git',['clone','--branch','main',remote,peer],{stdio:'ignore'});
  const peerGit=(...args:string[])=>execFileSync('git',args,{cwd:peer,stdio:'ignore'});
  peerGit('config','user.name','Peer');peerGit('config','user.email','peer@example.com');
  await writeFile(path.join(peer,'from-peer.txt'),'peer\n');peerGit('add','.');peerGit('commit','-m','peer file');peerGit('push');
  await writeFile(path.join(dir,'lesson.txt'),'edited here\n');await writeFile(path.join(dir,'new-here.txt'),'new\n');
  const h=harness();
  const p=await h.tool.preview({version:1,folder:dir,operationId:'sync',values:{message:'Lưu trước khi đồng bộ'}});
  expect(p.steps.map(s=>s.args.slice(0,2).join(' '))).toEqual(['add --all','commit -m','fetch origin','merge --no-edit','push origin']);
  const {runId}=h.tool.run({version:1,previewId:p.previewId,confirmation:'',requestId:crypto.randomUUID()});
  expect((await h.wait(runId)).state).toBe('success');
  expect(await readFile(path.join(dir,'from-peer.txt'),'utf8')).toBe('peer\n');
  expect(git('status','--porcelain')).toBe('');
  expect(git('log','-1','--format=%s','--no-merges')).toBe('Lưu trước khi đồng bộ');
  expect(git('rev-parse','HEAD')).toBe(git('rev-parse','origin/main'));
  expect((await h.tool.preview({version:1,folder:dir,operationId:'sync',values:{}})).steps.map(s=>s.args[0])).toEqual(['fetch','merge','push']);
 },20000);
 it('commits once for repeated requests and rejects reuse of a consumed preview',async()=>{const {dir,git}=await repo();await writeFile(path.join(dir,'lesson.txt'),'second\n');const h=harness();const p=await h.tool.preview({version:1,folder:dir,operationId:'commit',values:{message:'second'}});const req={version:1 as const,previewId:p.previewId,confirmation:'',requestId:'same'};const first=h.tool.run(req);expect(h.tool.run(req)).toEqual(first);const r=await h.wait(first.runId);expect(r.state).toBe('success');expect(r.completedStepIds).toEqual(['1','2']);expect(git('rev-list','--count','HEAD')).toBe('2');expect(()=>h.tool.run({...req,requestId:'new'})).toThrow('đã được dùng');expect(h.events.at(-1)?.kind).toBe('result');},20000);
 it('rejects stale contents even when porcelain status is unchanged',async()=>{const {dir,git}=await repo();await writeFile(path.join(dir,'lesson.txt'),'second\n');const h=harness();const p=await h.tool.preview({version:1,folder:dir,operationId:'commit',values:{message:'second'}});await writeFile(path.join(dir,'lesson.txt'),'third\n');const r=await h.wait(h.tool.run({version:1,previewId:p.previewId,confirmation:'',requestId:'stale'}).runId);expect(r.error?.code).toBe('stalePreview');expect(r.effects).toBe('none');expect(git('rev-list','--count','HEAD')).toBe('1');},20000);
 it('requires confirmation and keeps untracked files when discarding tracked changes',async()=>{const {dir}=await repo();await writeFile(path.join(dir,'lesson.txt'),'second\n');await writeFile(path.join(dir,'new.txt'),'keep');const h=harness();const p=await h.tool.preview({version:1,folder:dir,operationId:'discardAll',values:{}});expect(()=>h.tool.run({version:1,previewId:p.previewId,confirmation:'',requestId:'bad'})).toThrow('xác nhận');const r=await h.wait(h.tool.run({version:1,previewId:p.previewId,confirmation:'BỎ HẾT',requestId:'ok'}).runId);expect(r.state).toBe('success');expect(await readFile(path.join(dir,'new.txt'),'utf8')).toBe('keep');expect(await readFile(path.join(dir,'lesson.txt'),'utf8')).toBe('first\n');},20000);
 it('reports partial completion when push fails after a commit and never retries',async()=>{const {dir,git}=await repo();git('remote','add','origin','https://github.com/example/lessons.git');git('update-ref','refs/remotes/origin/main','HEAD');git('config','branch.main.remote','origin');git('config','branch.main.merge','refs/heads/main');await writeFile(path.join(dir,'lesson.txt'),'second\n');let pushes=0;const h=harness((bin,args,cwd,signal)=>{if(bin==='git'&&args[0]==='push'){pushes++;return Promise.reject(Error('network failure token=secret'));}return offline(bin,args,cwd,signal);});const r=await h.execute(dir,'saveAndPush',{message:'saved locally'});expect(r.state).toBe('partial');expect(r.completedStepIds).toEqual(['1','2']);expect(r.effects).toBe('unknown');expect(pushes).toBe(1);expect(git('log','-1','--format=%s')).toBe('saved locally');expect(JSON.stringify(r)).not.toContain('token=secret');},20000);
 it('preserves conflicts for explicit recovery and blocks subsequent writes',async()=>{const {dir,git}=await repo();git('switch','-c','other');await writeFile(path.join(dir,'lesson.txt'),'other\n');git('commit','-am','other');git('switch','main');await writeFile(path.join(dir,'lesson.txt'),'main\n');git('commit','-am','main');const h=harness();const r=await h.execute(dir,'merge',{branch:'other'});expect(r.error?.code).toBe('conflict');expect(r.recovery.state).toBe('manualRequired');expect(r.status?.repository?.operation).toBe('merge');expect(await readFile(path.join(dir,'lesson.txt'),'utf8')).toContain('<<<<<<<');await expect(h.tool.preview({version:1,folder:dir,operationId:'commit',values:{message:'bad'}})).rejects.toThrow('đang dở');},20000);
 it('cancels before the first write and emits cancelled results',async()=>{const {dir,git}=await repo();await writeFile(path.join(dir,'lesson.txt'),'second');const h=harness();const p=await h.tool.preview({version:1,folder:dir,operationId:'commit',values:{message:'second'}});const {runId}=h.tool.run({version:1,previewId:p.previewId,confirmation:'',requestId:'cancel'});expect(h.tool.cancel(runId).accepted).toBe(true);const r=await h.wait(runId);expect(r.state).toBe('cancelled');expect(r.effects).toBe('none');expect(git('rev-list','--count','HEAD')).toBe('1');},20000);
 it('does not overwrite an existing archive or gitignore',async()=>{const {dir}=await repo();const h=harness();await writeFile(path.join(dir,'existing.zip'),'original');await expect(h.tool.preview({version:1,folder:dir,operationId:'archive',values:{output:path.join(dir,'existing.zip')}})).rejects.toThrow('đã tồn tại');await writeFile(path.join(dir,'.gitignore'),'original');const r=await h.execute(dir,'gitignore',{patterns:'new'});expect(r.state).toBe('error');expect(await readFile(path.join(dir,'.gitignore'),'utf8')).toBe('original');},20000);
 it('rejects option injection, path traversal and unknown fields',async()=>{const {dir}=await repo();const h=harness();for(const values of [{branch:'--detach'},{branch:'../bad'},{branch:'good',extra:'bad'}])await expect(h.tool.preview({version:1,folder:dir,operationId:'switch',values})).rejects.toThrow();await expect(h.tool.preview({version:1,folder:dir,operationId:'restoreFile',values:{path:'../outside',revision:'1234567'}})).rejects.toThrow();},20000);
 it('parses split device codes, sets up git and returns a verified account',async()=>{const calls:string[][]=[];const h=harness(async(bin,args,_cwd,_signal,onData)=>{calls.push(args);if(args[0]==='auth'&&args[1]==='login'){onData?.('code: ABCD-');onData?.('1234');return '';}if(args[0]==='api')return 'teacher';return 'version 1';});const {runId}=h.tool.login({requestId:'login',purpose:'login'});const r=await h.wait(runId);expect(r.state).toBe('success');expect(h.events.some(e=>e.kind==='login'&&e.deviceCode==='ABCD-1234')).toBe(true);expect(calls).toContainEqual(['auth','setup-git','--hostname','github.com']);expect(r.status?.auth.account).toBe('teacher');});
 it('cancels login without starting setup-git',async()=>{const calls:string[][]=[];const h=harness(async(bin,args,cwd,signal)=>{calls.push(args);if(args[1]==='login')return new Promise((resolve,reject)=>{if(signal?.aborted)reject(Error('aborted'));else signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});return 'version';});const {runId}=h.tool.login({requestId:'cancel-login',purpose:'login'});h.tool.cancelLogin(runId);const r=await h.wait(runId);expect(r.state).toBe('cancelled');expect(calls.some(a=>a[1]==='setup-git')).toBe(false);});
 it('rechecks remote permissions before a destructive command',async()=>{let admin=true;let deletions=0;const h=harness(async(bin,args,cwd,signal)=>{if(bin==='git')return offline(bin,args,cwd,signal);if(args[0]==='repo'&&args[1]==='view')return admin?'ADMIN':'READ';if(args[0]==='repo'&&args[1]==='delete'){deletions++;return ''; }if(args.includes('-i'))return 'x-oauth-scopes: repo, delete_repo';if(args[0]==='api')return 'teacher';return 'gh version';});const p=await h.tool.preview({version:1,operationId:'repoDelete',values:{repository:'teacher/test'}});admin=false;const r=await h.wait(h.tool.run({version:1,previewId:p.previewId,confirmation:'teacher/test',requestId:'delete'}).runId);expect(r.state).toBe('error');expect(r.error?.code).toBe('unavailable');expect(deletions).toBe(0);});
 it('stops a running command without repeating the successful stage step',async()=>{const {dir,git}=await repo();await writeFile(path.join(dir,'lesson.txt'),'second');let entered!:()=>void;const started=new Promise<void>(r=>entered=r);let commits=0;const h=harness((bin,args,cwd,signal)=>{if(bin==='git'&&args[0]==='commit'){commits++;entered();return new Promise((resolve,reject)=>signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}return offline(bin,args,cwd,signal);});const p=await h.tool.preview({version:1,folder:dir,operationId:'commit',values:{message:'second'}});const {runId}=h.tool.run({version:1,previewId:p.previewId,confirmation:'',requestId:'cancel-mid'});await started;h.tool.cancel(runId);const r=await h.wait(runId);expect(r.state).toBe('partial');expect(r.error?.code).toBe('cancelled');expect(r.completedStepIds).toEqual(['1']);expect(commits).toBe(1);expect(git('diff','--cached')).toContain('second');},20000);
 it('redacts tokens, credential URLs and authorization headers',()=>{expect(sanitizeGithub('ghp_abc https://user:pass@github.com/x Authorization: Bearer secret')).not.toMatch(/ghp_abc|user:pass|secret/);});
});

it('a removed project directory reports a repairable status instead of blocking the panel',async()=>{
 const tool=new GithubTool(()=>{},async()=>{throw Error('offline');},async()=>{throw Object.assign(Error('gone'),{code:'ENOENT'});});
 const status=await tool.status({projectId:'p',folder:'/missing'});expect(status.folderError).toContain('Chọn lại');expect(status.conditions.folder).toBe(false);
});
it('auto download fetches new GitHub files, keeps unsaved local edits and reports when nothing is left',async()=>{
 const {dir}=await repo();await writeFile(path.join(dir,'lesson.txt'),'cua toi\n');
 const sha=(t:string)=>createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0${t}`).digest('hex');
 const remote:Record<string,string>={'lesson.txt':'tren github\n','new.txt':'tep moi\n'};
 const runner:GithubRunner=async(bin,args,cwd,signal,onData)=>{
  if(bin==='git')return runGithub(bin,args,cwd,signal,onData);
  if(args[0]==='--version')return 'version';if(args[0]==='repo')return 'WRITE';if(args.includes('user'))return 'teacher';
  const endpoint=args[3]??'';
  if(endpoint.endsWith('/commits/main'))return JSON.stringify({sha:'head',commit:{tree:{sha:'tree'}}});
  if(endpoint.endsWith('/git/trees/tree?recursive=1'))return JSON.stringify({tree:Object.entries(remote).map(([p,t])=>({path:p,type:'blob',mode:'100644',sha:sha(t),size:t.length}))});
  const blob=Object.values(remote).find(t=>endpoint.endsWith('/git/blobs/'+sha(t)));if(blob!==undefined)return JSON.stringify({encoding:'base64',content:Buffer.from(blob).toString('base64')});
  throw Error('Unexpected '+args.join(' '));
 };
 const h=harness(runner),values={selection:'changed',link:'https://github.com/school/repo',ref:'main'};
 const p=await h.tool.preview({version:1,folder:dir,operationId:'downloadFiles',values});
 expect(p.files?.map(f=>f.path)).toEqual(['new.txt']);expect(p.warnings.join(' ')).toContain('Giữ nguyên 1 tệp');
 const result=await h.execute(dir,'downloadFiles',values);
 expect(result.state).toBe('success');expect(JSON.stringify(result.output)).toContain('Giữ nguyên 1 tệp');
 expect(await readFile(path.join(dir,'new.txt'),'utf8')).toBe('tep moi\n');expect(await readFile(path.join(dir,'lesson.txt'),'utf8')).toBe('cua toi\n');
 const again=await h.execute(dir,'downloadFiles',values);
 expect(again.state).toBe('success');expect(again.effects).toBe('none');expect(JSON.stringify(again.output)).toContain('không có tệp mới');
});
it('persists uploaded file hashes and results across restarts',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'pvta-upload-history-'));dirs.push(dir);await writeFile(path.join(dir,'one.txt'),'one');
 const history=path.join(dir,'history.jsonl');
 const runner:GithubRunner=async(_bin,args)=>{
  if(args.includes('--input')){const endpoint=args[args.indexOf('--input')-1]!;return JSON.stringify({sha:endpoint.endsWith('/git/trees')?'newtree':endpoint.endsWith('/git/commits')?'commit123':'blob'});}
  if(args[0]==='--version')return 'version';if(args[0]==='repo')return 'WRITE';if(args.includes('user'))return 'teacher';
  const endpoint=args[3]??'';
  if(endpoint.endsWith('/commits/main'))return JSON.stringify({sha:'head',commit:{tree:{sha:'tree'}}});
  if(endpoint.endsWith('/git/ref/heads/main'))return '{}';if(endpoint.endsWith('/git/trees/tree?recursive=1'))return JSON.stringify({tree:[]});
  throw Error('Unexpected '+args.join(' '));
 };
 const tool=new GithubTool(()=>{},runner,async t=>t.folder,history);
 const preview=await tool.preview({version:1,projectId:'p',operationId:'uploadFiles',values:{link:'https://github.com/school/repo',ref:'main',source:dir,paths:'one.txt',message:'Update'}});
 const run=tool.run({version:1,previewId:preview.previewId,confirmation:'',requestId:'upload'});
 for(let i=0;i<200&&!tool.result(run.runId);i++)await new Promise(r=>setTimeout(r,10));
 expect(tool.result(run.runId)?.state).toBe('success');
 const restarted=new GithubTool(()=>{},runner,async t=>t.folder,history),rows=await restarted.history({projectId:'p'});
 expect(rows).toHaveLength(1);expect(rows[0].files[0]).toMatchObject({path:'one.txt',hash:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(JSON.stringify(rows[0].output)).toContain('commit123');
 expect(await restarted.history({projectId:'other'})).toEqual([]);
});
