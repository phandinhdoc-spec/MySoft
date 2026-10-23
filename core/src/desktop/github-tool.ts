import {execFile} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {resolveGithubLink,changedLocalFiles,remoteTree,remoteSelection,localFiles,selectedPaths,downloadSelected,existingDownloads,uploadSelected,changedRemoteFiles} from './github-files.js';
import {catalog} from './github-ops.js';
import {confirmationText,validateValues,unavailableReasons} from './github-model.js';
import type {GithubError,GithubEvent,GithubOperation,GithubOperationRequest,GithubPreview,GithubRunRequest,GithubRunResult,GithubStatus,GithubTarget} from './github-model.js';

export const githubBusy=new Set<string>();
export function sanitizeGithub(text:string):string {
 let s=text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 for(const key of ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']){const token=process.env[key];if(token)s=s.split(token).join('[đã che]');}
 return s.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g,'[đã che]')
  .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,'$1[đã che]@')
  .replace(/((?:authorization|token|password)\s*[:=]\s*)(?:bearer\s+|basic\s+)?[^\s,]+/gi,'$1[đã che]');
}
class ToolError extends Error {constructor(readonly detail:GithubError){super(detail.message);}}
function fail(code:GithubError['code'],message:string,hint='Kiểm tra trạng thái trước khi thử lại.'):never {throw new ToolError({code,message,hint});}
export function githubError(e:unknown):GithubError {
 if(e instanceof ToolError)return e.detail;
 const text=sanitizeGithub(e instanceof Error?e.message:String(e));
 const code:GithubError['code']=/ENOENT/.test(text)?'missingTool':/conflict|CONFLICT|unmerged/i.test(text)?'conflict':/Authentication|not logged|401/i.test(text)?'auth':/403|permission denied/i.test(text)?'permission':/timed out|timeout/i.test(text)?'timeout':/resolve host|network|connect/i.test(text)?'network':'commandFailed';
 return {code,message:'Không hoàn tất được thao tác GitHub.',hint:'Đọc chi tiết và kiểm tra trạng thái; không tự chạy lại thao tác ghi.',detail:text};
}
export type GithubRunner=(bin:'git'|'gh',args:string[],cwd?:string,signal?:AbortSignal,onData?:(text:string)=>void)=>Promise<string>;
export const runGithub:GithubRunner=(bin,args,cwd,signal,onData)=>new Promise((resolve,reject)=>{
 const env={...process.env,GIT_TERMINAL_PROMPT:'0',GH_PROMPT_DISABLED:'1',LC_ALL:'C',LC_MESSAGES:'C',GH_HOST:'github.com',GH_PAGER:'cat',GIT_PAGER:'cat',GIT_EDITOR:'true',GIT_MERGE_AUTOEDIT:'no'};
 // Do not inherit repository overrides or command injection through Git's environment.
 for(const k of Object.keys(env))if(/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG|SSH|ASKPASS)/.test(k))delete (env as NodeJS.ProcessEnv)[k];
 const child=execFile(bin,args,{cwd,env,signal,timeout:onData?600000:120000,maxBuffer:32*1024*1024,windowsHide:true},(e,out,err)=>{
  if(e?.killed&&!signal?.aborted)reject(new ToolError({code:'timeout',message:'Thao tác vượt thời gian chờ.',hint:'Kiểm tra trạng thái trước khi thử lại; lệnh có thể đã tác động dữ liệu.',detail:sanitizeGithub([out,err].filter(Boolean).join('\n'))}));
  else if(e)reject(new Error(sanitizeGithub([out,err,e.message].filter(Boolean).join('\n'))));else resolve(out);
 });
 child.stdin?.end();
 if(onData){child.stdout?.on('data',d=>onData(String(d)));child.stderr?.on('data',d=>onData(String(d)));}
});
type Step=GithubPreview['steps'][number];
type Saved={request:GithubOperationRequest;preview:GithubPreview;fingerprint:string;used?:string};
type Job={controller:AbortController;result?:GithubRunResult;sequence:number;login?:boolean};
export class GithubTool {
 private previews=new Map<string,Saved>();
 private requests=new Map<string,{payload:string;runId:string}>();
 private jobs=new Map<string,Job>();
 private active?:string;
 constructor(private notify:(event:GithubEvent)=>void=()=>{},private execute:GithubRunner=runGithub,private authorize:(target:GithubTarget)=>Promise<string|undefined>=async t=>t.folder?fs.realpath(t.folder):undefined,private historyFile?:string){}
 catalog(){return catalog();}
 async history(target:GithubTarget){
  if(!this.historyFile)return [];
  const text=await fs.readFile(this.historyFile,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
  return text.split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.projectId===target.projectId).slice(-50).reverse();
 }
 private async recordUpload(saved:Saved,result:GithubRunResult){
  if(!this.historyFile||saved.request.operationId!=='uploadFiles')return;
  const transfer=JSON.parse(saved.preview.steps[0]!.args[1]!);
  const row={version:1,runId:result.runId,at:Date.now(),projectId:saved.request.projectId,source:saved.request.values.source,repository:transfer.remote.repository,branch:transfer.remote.branch,state:result.state,files:transfer.files,output:result.output,error:result.error};
  await fs.mkdir(path.dirname(this.historyFile),{recursive:true});await fs.appendFile(this.historyFile,JSON.stringify(row)+'\n',{mode:0o600});
 }

 dispose(){for(const job of this.jobs.values())if(!job.result)job.controller.abort();}
 private event(id:string,event:Omit<GithubEvent,'runId'|'sequence'|'at'>){const job=this.jobs.get(id);try{this.notify({...event,runId:id,sequence:job?++job.sequence:0,at:Date.now()} as GithubEvent);}catch{/* A disconnected UI must not interrupt a write. */}}
 private async optional(bin:'git'|'gh',args:string[],cwd?:string){try{return (await this.execute(bin,args,cwd)).trim();}catch{return null;}}
 async status(target:GithubTarget={}):Promise<GithubStatus>{
  let folder:string|undefined,folderError:string|undefined;
  try{folder=await this.authorize(target);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;folderError='Thư mục dự án không còn tồn tại. Chọn lại thư mục trên máy trong menu GitHub.';}
  const [git,gh]=await Promise.all([this.optional('git',['--version']),this.optional('gh',['--version'])]);
  const s:GithubStatus={version:1,observedAt:Date.now(),folder,folderError,tools:{git:{installed:git!==null,version:git??undefined},gh:{installed:gh!==null,version:gh??undefined}},auth:{state:'unknown',host:'github.com'},conditions:{git:git!==null,gh:gh!==null,folder:!!folder,idle:!this.active},unavailable:{},suggestions:[],activeRunId:this.active};
  if(gh!==null){const user=await this.optional('gh',['api','--hostname','github.com','user','--jq','.login']);s.auth={state:user?'ready':'missing',account:user??undefined,host:'github.com',source:process.env.GH_TOKEN||process.env.GITHUB_TOKEN?'environment':'unknown'};s.conditions.authenticated=!!user;}
  if(folder&&git!==null){
   const root=await this.optional('git',['rev-parse','--show-toplevel'],folder);
   s.conditions.repository=!!root;
   // A failed probe may be dubious ownership, not absence of a repository.
   s.conditions.noRepository=false;
   if(!root){try{await this.execute('git',['rev-parse','--git-dir'],folder);}catch(e){s.conditions.noRepository=/not a git repository/.test(String(e));}}
   if(root){
    s.root=await fs.realpath(root);s.conditions.idle=!this.active&&!githubBusy.has(s.root);
    const g=(args:string[])=>this.optional('git',args,s.root);
    const [head,branch,upstream,origin,raw,identity,email,stash,parents]=await Promise.all([
     g(['rev-parse','--verify','HEAD']),g(['symbolic-ref','--quiet','--short','HEAD']),g(['rev-parse','--abbrev-ref','@{upstream}']),g(['remote','get-url','origin']),
     this.execute('git',['status','--porcelain=v1','-z','--untracked-files=all'],s.root),g(['config','user.name']),g(['config','user.email']),g(['stash','list','--format=%gd']),g(['rev-list','--parents','-n','1','HEAD'])]);
    const changes:NonNullable<GithubStatus['repository']>['changes']=[];const entries=raw.split('\0');
    for(let i=0;i<entries.length;i++){const line=entries[i];if(!line)continue;const index=line[0]!,worktree=line[1]!;changes.push({path:line.slice(3),index,worktree,untracked:index==='?',...(/[RC]/.test(index+worktree)?{originalPath:entries[++i]}:{})});}
    let operation:NonNullable<GithubStatus['repository']>['operation']='none';
    for(const [marker,kind] of [['MERGE_HEAD','merge'],['rebase-merge','rebase'],['rebase-apply','rebase'],['CHERRY_PICK_HEAD','cherry-pick'],['REVERT_HEAD','revert'],['sequencer','unknown']] as const){const p=await g(['rev-parse','--git-path',marker]);if(p&&await fs.stat(path.resolve(s.root,p)).then(()=>true,()=>false))operation=kind;}
    if(changes.some(c=>c.index==='U'||c.worktree==='U'||['AA','DD'].includes(c.index+c.worktree)))operation=operation==='none'?'unknown':operation;
    const counts=upstream?await g(['rev-list','--left-right','--count','HEAD...@{upstream}']):null;const [ahead,behind]=counts?counts.split(/\s+/).map(Number):[null,null];
    s.repository={branch,head,upstream,origin:origin?sanitizeGithub(origin):null,ahead:ahead??null,behind:behind??null,changes,operation};
    Object.assign(s.conditions,{head:!!head,branch:!!branch,upstream:!!upstream,origin:!!origin,clean:changes.length===0,changes:changes.length>0,identity:!!identity&&!!email,noOperation:operation==='none',stashes:!!stash,parentCommit:parents?.split(' ').length===2,unpublishedHead:false});
    const branches=await g(['for-each-ref','--format=%(refname:short)','refs/heads']);
    const commits=await g(['log','-100','--format=%H %s']);
    s.choices={commits:(commits?.split('\n').filter(Boolean)??[]).map(line=>({value:line.slice(0,40),label:line})),branches:(branches?.split('\n').filter(Boolean)??[]).map(value=>({value,label:value})),changes:changes.map(c=>({value:c.path,label:c.path})),stashes:(stash?.split('\n').filter(Boolean)??[]).map(value=>({value,label:value}))};
   }
  }
  s.suggestions=!s.conditions.repository?['init','clone']:s.conditions.changes?['commit','stash']:['fetch'];
  return s;
 }
 private async fingerprint(s:GithubStatus){
  const hash=createHash('sha256').update(JSON.stringify({root:s.root,repo:s.repository,auth:s.auth}));
  if(s.root){
   for(const args of [['for-each-ref','--format=%(refname) %(objectname)'],['config','--local','--null','--list'],['diff','--cached','--binary','--no-ext-diff','--no-textconv']])hash.update(await this.execute('git',args,s.root));
   hash.update(await this.execute('git',['diff','--binary','--no-ext-diff','--no-textconv',...(s.repository?.head?['HEAD']:[])],s.root));
   for(const c of s.repository?.changes??[]){const p=path.resolve(s.root,c.path);if(!p.startsWith(s.root+path.sep))fail('invalidInput','Đường dẫn ngoài kho.');const st=await fs.lstat(p).catch(()=>null);if(st?.isSymbolicLink())hash.update(await fs.readlink(p));else if(st?.isFile())hash.update(await fs.readFile(p));}
  }return hash.digest('hex');
 }
 private async prepare(request:GithubOperationRequest,ownRun?:string){
  if(request?.version!==1||typeof request.operationId!=='string')fail('invalidInput','Yêu cầu không hợp lệ.');
  const op=catalog().operations.find(o=>o.id===request.operationId);if(!op)fail('invalidInput','Thao tác không được hỗ trợ.');
  const errors=validateValues(op,request.values);if(errors[0])throw new ToolError(errors[0]);
  const v={...request.values};
  for(const f of op.fields){const x=v[f.key];if(!x)continue;
   if(['branch','revision','repository','account','number','folder','file'].includes(f.kind)&&/[\r\n\x00-\x1f]/.test(x))fail('invalidInput','Ô nhập chứa ký tự điều khiển.');
   if(['branch','revision','account'].includes(f.kind)&&x.startsWith('-'))fail('invalidInput','Giá trị không được bắt đầu bằng dấu gạch ngang.');
   if(f.kind==='repository'&&!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(x))fail('invalidInput','Tên kho phải có dạng chủ/tên-kho.');
   if(f.kind==='repository'&&['.','..'].includes(x.split('/')[1]!))fail('invalidInput','Tên kho không hợp lệ.');
   if(f.kind==='account'&&!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(x))fail('invalidInput','Tên tài khoản không hợp lệ.');
   if(f.kind==='branch'&&(!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(x)||x.includes('..')||x.endsWith('/')||x.includes('//')||x.endsWith('.lock')))fail('invalidInput','Tên nhánh không hợp lệ.');
   if(f.kind==='revision'&&!/^[0-9a-fA-F]{7,40}$/.test(x))fail('invalidInput','Hãy chọn mã commit đầy đủ.');
  }
  if(v.tag&&(!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(v.tag)||v.tag.includes('..')))fail('invalidInput','Nhãn phiên bản không hợp lệ.');
  if(op.id==='repoRename'&&!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(v.name!))fail('invalidInput','Tên kho không hợp lệ.');
  const s=await this.status(request);
  if(ownRun&&this.active===ownRun)s.conditions.idle=!s.root||!githubBusy.has(s.root);
  if(v.repository&&(op.requires.includes('repoAdmin')||op.requires.includes('repoWrite'))){const permission=await this.optional('gh',['repo','view',v.repository,'--json','viewerPermission','--jq','.viewerPermission']);s.conditions.repoAdmin=permission==='ADMIN';s.conditions.repoWrite=['ADMIN','MAINTAIN','WRITE'].includes(permission??'');}
  if(op.requires.includes('deleteScope')){const headers=await this.optional('gh',['api','--hostname','github.com','-i','user']);s.conditions.deleteScope=/^x-oauth-scopes:.*\bdelete_repo\b/im.test(headers??'');}
  if(['push','saveAndPush','sync','pull'].includes(op.id)&&s.repository?.upstream&&!s.repository.upstream.startsWith('origin/'))fail('unavailable','Nhánh theo dõi phải thuộc origin.');
  if(op.id==='undoCommit')s.unavailable.unpublishedHead='Không thể chứng minh phiên bản chưa được công bố ở mọi nơi. Dùng Hủy một phiên bản cũ để giữ lịch sử.';
  const reasons=unavailableReasons(op,s);if(reasons.length)fail('unavailable',reasons.join(' '));
  if(s.root&&s.folder!==s.root&&op.risk!=='read'&&!['uploadFiles','downloadFiles'].includes(op.id))fail('invalidInput','Chọn thư mục gốc của kho để thao tác toàn kho.');
  if(s.conditions.git)for(const f of op.fields)if(f.kind==='branch'&&v[f.key])await this.execute('git',['check-ref-format','--branch',v[f.key]!],s.root);
  if(v.path){if(path.isAbsolute(v.path)||v.path.split(/[\\/]/).some(p=>p==='..'||p==='.git')||v.path.startsWith(':'))fail('invalidInput','Chọn tệp tương đối bên trong kho.');
   const p=path.resolve(s.root!,v.path);const parent=await fs.realpath(path.dirname(p));if(parent!==s.root&&!parent.startsWith(s.root!+path.sep))fail('invalidInput','Đường dẫn đi ra ngoài kho.');
   if(op.id==='discardFile'&&!s.repository?.changes.some(c=>c.path===v.path&&!c.untracked))fail('invalidInput','Chỉ được bỏ thay đổi của tệp đang được theo dõi.');
  }
  if(v.revision){const parents=(await this.execute('git',['rev-list','--parents','-n','1',v.revision],s.root)).trim().split(' ');if(op.id==='revert'&&parents.length>2)fail('invalidInput','Không hỗ trợ đảo ngược commit gộp trong biểu mẫu này.');}
  if(v.stash&&!s.choices?.stashes?.some(x=>x.value===v.stash))fail('invalidInput','Bản cất tạm không còn tồn tại.');
  if(op.id==='createFromFolder'&&s.conditions.origin)fail('unavailable','Kho đã có origin; không tự thay địa chỉ khi tạo kho mới.');
  if(op.id==='downloadFiles'){if(!s.folder)fail('invalidInput','Chọn thư mục dự án trước khi tải về.');v.destination=s.root??s.folder;}
  else for(const key of ['destination','output'])if(v[key]){const p=v[key]!;if(!path.isAbsolute(p))fail('invalidInput','Cần đường dẫn tuyệt đối.');await this.authorize({...request,folder:path.dirname(p)});if(await fs.lstat(p).then(()=>true,()=>false))fail('invalidInput','Đường dẫn đích đã tồn tại; chọn tên mới.');if(key==='output'&&!p.endsWith('.zip'))fail('invalidInput','Chọn tệp .zip.');}
  if(['browseFiles','downloadFiles','uploadFiles'].includes(op.id)){
   const remote=await resolveGithubLink(v.link!,v.ref??'',this.execute);
   if(v.paths)selectedPaths(v.paths);
   let files;const skipped:string[]=[];
   let overwrites:string[]|undefined;const kept:string[]=[];
   if(op.id==='downloadFiles'){
    if(v.selection==='changed'){
     if(!s.root)fail('invalidInput','Tải tự động cần thư mục gốc của kho Git; hãy chọn tệp và thư mục cụ thể.');
     const list=await changedRemoteFiles(s.root,remote,this.execute,p=>kept.push(p),p=>skipped.push(p));v.paths=list.join('\n');
     files=list.length?await remoteSelection(remote,v.paths,this.execute):[];overwrites=await existingDownloads(v.destination!,files);
    }else{files=await remoteSelection(remote,v.paths!,this.execute);overwrites=await existingDownloads(v.destination!,files);}
   }
   if(op.id==='uploadFiles'){
    const source=await this.authorize({...request,folder:v.source});if(!source)fail('permission','Chọn thư mục nguồn được phép truy cập.');v.source=source;
    const permission=await this.optional('gh',['repo','view',remote.repository,'--json','viewerPermission','--jq','.viewerPermission']);
    if(!['ADMIN','MAINTAIN','WRITE'].includes(permission??''))fail('permission','Không xác minh được quyền ghi kho GitHub.');
    await this.execute('gh',['api','--hostname','github.com',`repos/${remote.repository}/git/ref/heads/${encodeURIComponent(remote.branch)}`]);
    if(v.selection==='changed'){
     if(source!==s.root)fail('invalidInput','Cập nhật tự động cần thư mục gốc của kho Git.');
     files=await changedLocalFiles(source,remote,this.execute,p=>skipped.push(p));v.paths=files.map(f=>f.path).join('\n');
    }else files=await localFiles(source,v.paths??'');
   }
   v.transfer=JSON.stringify({remote,files,skipped,overwrites,kept});
  }
  return {op,v,s};
 }
 private steps(op:GithubOperation,v:Record<string,string>,s:GithubStatus):Step[]{
  const steps:Step[]=[];const add=(executable:Step['executable'],args:string[],label=op.label)=>steps.push({id:String(steps.length+1),label,executable,args,cwd:s.root??s.folder});
  const g=(...args:string[])=>add('git',args);const h=(...args:string[])=>add('gh',args);const repo=v.repository!;
  const commit=()=>{g('add','--all');g('commit','-m',v.message!);};
  const push=()=>g('push','origin',`HEAD:refs/heads/${s.repository!.upstream!.replace(/^origin\//,'')}`);
  switch(op.id){
   case 'browseFiles':case 'downloadFiles':case 'uploadFiles':
    add('internal',[op.id,v.transfer!,v.paths??'',v.source??v.destination??'',v.message??''],op.label);break;
   case 'init':g('init');break;
   case 'clone':h('repo','clone',repo,v.destination!);break;
   case 'repoCreate':case 'createFromFolder':h('repo','create',repo,`--${v.visibility}`);if(op.id==='createFromFolder'){g('remote','add','origin',`https://github.com/${repo}.git`);g('push','--set-upstream','origin',s.repository!.branch!);}break;
   case 'commit':commit();break;case 'saveAndPush':commit();push();break;case 'push':push();break;
   case 'fetch':g('fetch','origin');break;case 'pull':g('pull','--ff-only');break;
   case 'sync':if(!s.conditions.clean){g('add','--all');g('commit','-m',v.message?.trim()||'Đồng bộ tài liệu');}g('fetch','origin');g('merge','--no-edit','@{upstream}');push();break;
   case 'archive':add('internal',['archive',v.output!]);break;
   case 'branches':g('branch','--list');break;case 'createBranch':g('switch','-c',v.branch!);break;case 'switch':g('switch','--no-guess',v.branch!);break;
   case 'merge':g('merge','--no-edit',v.branch!);break;case 'renameBranch':g('branch','-m',v.name!);break;case 'deleteBranch':g('branch','-d',v.branch!);break;
   case 'log':g('log','-100','--format=%H%x09%an%x09%aI%x09%s');break;
   case 'diff':g('diff','--no-ext-diff','--no-textconv');g('diff','--cached','--no-ext-diff','--no-textconv');break;
   case 'discardFile':case 'discardAll':g('--literal-pathspecs','restore','--source=HEAD','--staged','--worktree','--',op.id==='discardAll'?'.':v.path!);break;
   case 'undoCommit':g('reset','--soft','HEAD^');break;
   case 'revert':g('revert','--no-edit',v.revision!);break;
   case 'restoreFile':g('--literal-pathspecs','restore',`--source=${v.revision}`,'--worktree','--',v.path!);break;
   case 'stash':g('stash','push','--include-untracked','-m',v.message||'PVTA');break;
   case 'stashPop':g('stash','pop',v.stash!);break;case 'stashList':g('stash','list');break;
   case 'repoList':h('repo','list','--limit','100','--json','nameWithOwner,url,visibility');break;
   case 'repoRename':h('repo','rename',v.name!,'--repo',repo,'--yes');break;
   case 'repoDescription':h('repo','edit',repo,'--description',v.description??'');break;
   case 'repoVisibility':h('repo','edit',repo,'--visibility',v.visibility!,'--accept-visibility-change-consequences');break;
   case 'repoDelete':h('repo','delete',repo,'--yes');break;
   case 'fork':h('repo','fork',repo,'--clone=false');break;
   case 'collaboratorList':h('api',`repos/${repo}/collaborators?per_page=100`);break;
   case 'collaboratorAdd':h('api','--method','PUT',`repos/${repo}/collaborators/${v.account}`,'-f',`permission=${v.permission}`);break;
   case 'collaboratorRemove':h('api','--method','DELETE',`repos/${repo}/collaborators/${v.account}`);break;
   case 'releaseCreate':h('release','create',v.tag!,'--repo',repo,'--draft','--verify-tag','--title',v.title!,'--notes',v.body!);break;
   case 'releaseList':h('release','list','--repo',repo,'--limit','100','--json','tagName,name,isDraft');break;
   case 'releaseDownload':h('release','download',v.tag!,'--repo',repo,'--dir',v.destination!);break;
   case 'prCreate':h('pr','create','--repo',repo,'--head',v.head!,'--base',v.base!,'--title',v.title!,'--body',v.body!);break;
   case 'prList':h('pr','list','--repo',repo,'--limit','100','--json','number,title,url,state');break;
   case 'prMerge':h('pr','merge',v.number!,'--repo',repo,`--${v.method}`);h('pr','view',v.number!,'--repo',repo,'--json','state,mergedAt,mergeStateStatus,url');break;
   case 'issueCreate':h('issue','create','--repo',repo,'--title',v.title!,'--body',v.body!);break;
   case 'issueList':h('issue','list','--repo',repo,'--limit','100','--json','number,title,url,state');break;
   case 'issueClose':h('issue','close',v.number!,'--repo',repo);break;
   case 'identity':g('config','--local','user.name',v.name!);g('config','--local','user.email',v.email!);break;
   case 'remote':g('remote',s.conditions.origin?'set-url':'add','origin',`https://github.com/${repo}.git`);break;
   case 'gitignore':add('internal',['gitignore',v.patterns!]);break;
   case 'trustFolder':g('config','--global','--add','safe.directory',s.folder!);break;
   case 'logout':h('auth','logout','--hostname','github.com','--user',v.account!);break;
   default:fail('unavailable','Thao tác chưa có bộ thực thi.');
  }
  return steps;
 }
 async preview(request:GithubOperationRequest):Promise<GithubPreview>{
  request=structuredClone(request);const {op,v,s}=await this.prepare(request);
  const preview:GithubPreview={version:1,previewId:randomUUID(),expiresAt:Date.now()+300000,operationId:op.id,target:{projectId:request.projectId,folder:s.folder},steps:this.steps(op,v,s),confirmationText:confirmationText(op,v),warnings:op.risk==='read'?[]:['Hủy chỉ dừng bước tiếp theo; các thay đổi đã thực hiện vẫn được giữ.','Nếu xung đột, dừng để kiểm tra và phục hồi thủ công; không tự ghi đè nội dung.']};
  if(v.transfer){const {remote,files,skipped,overwrites,kept}=JSON.parse(v.transfer);if(kept?.length)preview.warnings.push(`Giữ nguyên ${kept.length} tệp trên máy vì có thay đổi chưa lưu hoặc chưa được Git theo dõi: ${kept.slice(0,20).join(', ')}${kept.length>20?'…':''}`);if(skipped?.length)preview.warnings.push('Bỏ qua kho Git lồng nhau (quản lí và cập nhật riêng): '+skipped.join(', '));if(overwrites?.length)preview.warnings.push(`Sẽ thay ${overwrites.length} tệp đã có trong dự án bằng bản trên GitHub: ${overwrites.slice(0,20).join(', ')}${overwrites.length>20?'…':''}`);preview.warnings.push(`Kho: ${remote.repository} · Nhánh: ${remote.branch} · Phiên bản nguồn: ${remote.head}`);if(files)preview.files=files.map((f:{path:string;size:number})=>({path:f.path,size:f.size}));}
  for(const [id,p] of this.previews)if(p.preview.expiresAt<Date.now()&&!p.used)this.previews.delete(id);
  this.previews.set(preview.previewId,{request,preview,fingerprint:await this.fingerprint(s)});return structuredClone(preview);
 }
 run(request:GithubRunRequest):{runId:string}{
  if(request?.version!==1||typeof request.requestId!=='string'||!request.requestId||request.requestId.length>200)fail('invalidInput','Mã yêu cầu không hợp lệ.');
  const payload=JSON.stringify(request);const old=this.requests.get(request.requestId);if(old){if(old.payload!==payload)fail('invalidInput','Mã yêu cầu đã được dùng cho nội dung khác.');const previous=this.jobs.get(old.runId)?.result;if(previous)setImmediate(()=>this.event(old.runId,{kind:'result',result:previous} as Omit<GithubEvent,'runId'|'sequence'|'at'>));return {runId:old.runId};}
  const saved=this.previews.get(request.previewId);if(!saved||saved.preview.expiresAt<Date.now())fail('stalePreview','Bản xem trước đã hết hạn.');
  if(saved.used)fail('stalePreview','Bản xem trước đã được dùng. Hãy kiểm tra kết quả.');
  if(saved.preview.confirmationText!==null&&request.confirmation!==saved.preview.confirmationText)fail('confirmationRequired','Chưa nhập đúng chữ xác nhận.');
  if(this.active)fail('busy','Một thao tác GitHub đang chạy.');
  const runId=randomUUID();saved.used=runId;this.active=runId;this.requests.set(request.requestId,{payload,runId});this.jobs.set(runId,{controller:new AbortController(),sequence:0});
  setImmediate(()=>{void this.perform(runId,saved);});return {runId};
 }
 cancel(runId:string){const job=this.jobs.get(runId);if(!job||job.result)return {accepted:false};job.controller.abort();return {accepted:true};}
 result(runId:string){return this.jobs.get(runId)?.result;}
 private async perform(id:string,saved:Saved){
  const job=this.jobs.get(id)!;const result:GithubRunResult={runId:id,operationId:saved.request.operationId,state:'success',completedStepIds:[],output:[],effects:'none',recovery:{state:'notNeeded',message:'Không cần phục hồi.'}};
  let root:string|undefined;let startedWrite=false;
  try{
   // This run owns the tool's busy state; external/legacy locks are still checked.
   const {op,v,s}=await this.prepare(saved.request,id);
   if(s.root){if(githubBusy.has(s.root))fail('busy','Kho đang có thao tác khác.');githubBusy.add(s.root);root=s.root;}
   if(await this.fingerprint(await this.status(saved.request))!==saved.fingerprint)fail('stalePreview','Kho hoặc tài khoản đã đổi. Hãy xem trước lại.');
   if(v.transfer){const {skipped,kept}=JSON.parse(v.transfer);if(skipped?.length)result.output.push({kind:'message',text:(v.selection==='changed'&&op.id==='downloadFiles'?'Bỏ qua liên kết tượng trưng hoặc mô-đun con: ':'Bỏ qua kho Git lồng nhau (quản lí và cập nhật riêng): ')+skipped.join(', ')});if(kept?.length)result.output.push({kind:'message',text:`Giữ nguyên ${kept.length} tệp trên máy vì có thay đổi chưa lưu hoặc chưa được Git theo dõi: ${kept.slice(0,50).join(', ')}${kept.length>50?'…':''}`});}
   const steps=this.steps(op,v,s);
   if(v.transfer&&JSON.stringify(steps)!==JSON.stringify(saved.preview.steps))fail('stalePreview','Nhánh hoặc tệp nguồn đã thay đổi; hãy xem trước lại.');
   for(const step of steps){
    if(job.controller.signal.aborted)fail('cancelled','Đã hủy thao tác.');
    this.event(id,{kind:'progress',stepId:step.id,completed:result.completedStepIds.length,total:steps.length,message:step.label} as Omit<GithubEvent,'runId'|'sequence'|'at'>);
    startedWrite=op.risk!=='read';if(startedWrite)result.effects='unknown';
    let output:string;
    if(step.executable==='internal'){
     if(['browseFiles','downloadFiles','uploadFiles'].includes(op.id)){
      const {remote,files}=JSON.parse(v.transfer!);
      if(op.id==='browseFiles'){
       const entries=await remoteTree(remote,this.execute),prefix=remote.remotePath?remote.remotePath+'/':'';
       const exact=entries.find(e=>e.path===remote.remotePath&&e.type!=='tree');
       const rows=(exact?[exact]:entries.filter(e=>e.path.startsWith(prefix)&&!e.path.slice(prefix.length).includes('/'))).map(e=>({path:e.path,type:e.type==='tree'?'Thư mục':'Tệp',link:`https://github.com/${remote.repository}/${e.type==='tree'?'tree':'blob'}/${remote.branch.split('/').map(encodeURIComponent).join('/')}/${e.path.split('/').map(encodeURIComponent).join('/')}`}));
       output=JSON.stringify(rows);
      }else if(op.id==='downloadFiles'&&v.selection==='changed'&&!files.length){startedWrite=false;result.effects='none';output='Đã đồng bộ; không có tệp mới hoặc thay đổi cần tải về.';}
      else if(op.id==='downloadFiles')output=await downloadSelected(remote,v.paths!,v.destination!,this.execute,job.controller.signal,true);
      else if(!files.length){startedWrite=false;result.effects='none';output='Đã đồng bộ; không có tệp mới hoặc thay đổi cần tải lên.';this.event(id,{kind:'upload',files:[],percent:100,message:output} as Omit<GithubEvent,'runId'|'sequence'|'at'>);}
      else output=await uploadSelected(remote,v.source!,v.paths!,v.message!,files,this.execute,job.controller.signal,event=>this.event(id,event));
     }
     else if(step.args[0]==='gitignore'){const p=path.join(root!,'.gitignore');await fs.writeFile(p,step.args[1]!,{flag:'wx'});output=p;}
     else {const p=step.args[1]!;const temp=await fs.mkdtemp(path.join(path.dirname(p),'.pvta-archive-'));try{const zip=path.join(temp,'archive.zip');await this.execute('git',['archive','--format=zip',`--output=${zip}`,'HEAD'],root,job.controller.signal);await fs.link(zip,p);}finally{await fs.rm(temp,{recursive:true,force:true});}output=p;}
    }else output=await this.execute(step.executable,step.args,step.cwd,job.controller.signal);
    result.completedStepIds.push(step.id);if(startedWrite)result.effects='applied';
    const clean=sanitizeGithub(output);
    if(op.result.kind==='diff')result.output.push({kind:'diff',text:clean,truncated:false});
    else if(op.result.kind==='history')result.output.push({kind:'history',commits:clean.trim().split('\n').filter(Boolean).map(line=>{const [sha='',author='',at='',...subject]=line.split('\t');return {sha,author,at,subject:subject.join('\t')};}),truncated:clean.trim().split('\n').length>=100});
    else if(op.result.kind==='table'){
     let rows:Record<string,string|number|boolean|null>[];
     try{const parsed:unknown=JSON.parse(clean);if(!Array.isArray(parsed))throw Error();rows=parsed.map(value=>Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,val])=>[k,val===null||['string','number','boolean'].includes(typeof val)?val:JSON.stringify(val)]))) as typeof rows;}
     catch{rows=clean.trim().split('\n').filter(Boolean).map(text=>({text}));}
     result.output.push({kind:'table',columns:Object.keys(rows[0]??{text:''}).map(key=>({key,label:key})),rows,truncated:rows.length>=100});
    }else if(op.result.kind==='file'&&!(op.id==='downloadFiles'&&v.selection==='changed'&&!JSON.parse(v.transfer!).files.length))result.output.push({kind:'file',path:v.output??v.destination??path.join(root!,'.gitignore')});
    else result.output.push({kind:'message',text:clean||`Đã hoàn tất: ${step.label}`});
   }
  }catch(e){result.error=job.controller.signal.aborted?{code:'cancelled',message:'Đã dừng theo yêu cầu.',hint:'Kiểm tra trạng thái; thao tác đang chạy có thể đã tác động dữ liệu.'}:githubError(e);result.state=result.completedStepIds.length?'partial':result.error.code==='cancelled'?'cancelled':'error';if(startedWrite)result.recovery={state:'manualRequired',message:'Giữ nguyên dữ liệu hiện tại. Kiểm tra trạng thái kho và kết quả trên GitHub trước khi thử lại; không tự hoàn tác hoặc chạy lại bước ghi.'};}
  finally{if(root)githubBusy.delete(root);this.active=undefined;try{result.status=await this.status(saved.request);}catch(e){result.output.push({kind:'message',text:'Không đọc được trạng thái sau thao tác: '+githubError(e).message});}try{await this.recordUpload(saved,result);}catch{result.output.push({kind:'message',text:'Không lưu được lịch sử trên máy. Kiểm tra kết quả trên GitHub trước khi thử lại.'});}job.result=result;this.event(id,{kind:'result',result} as Omit<GithubEvent,'runId'|'sequence'|'at'>);}
 }
 login(request:{requestId:string;purpose:'login'|'deleteScope'}){
  if(!request||!['login','deleteScope'].includes(request.purpose)||typeof request.requestId!=='string'||!request.requestId||request.requestId.length>200)fail('invalidInput','Yêu cầu đăng nhập không hợp lệ.');
  const key='login:'+request.requestId,payload=JSON.stringify(request),old=this.requests.get(key);if(old){if(old.payload!==payload)fail('invalidInput','Mã yêu cầu đã được dùng.');return {runId:old.runId};}
  if(this.active)fail('busy','Một thao tác GitHub đang chạy.');
  const id=randomUUID();this.active=id;this.jobs.set(id,{controller:new AbortController(),sequence:0,login:true});this.requests.set(key,{payload,runId:id});
  setImmediate(()=>{void this.performLogin(id,request.purpose);});return {runId:id};
 }
 cancelLogin(id:string){return this.jobs.get(id)?.login?this.cancel(id):{accepted:false};}
 private async performLogin(id:string,purpose:'login'|'deleteScope'){
  const job=this.jobs.get(id)!;let buffer='';const result:GithubRunResult={runId:id,operationId:purpose,state:'success',completedStepIds:[],output:[],effects:'unknown',recovery:{state:'notNeeded',message:'Không cần phục hồi.'}};
  try{
   if(process.env.GH_TOKEN||process.env.GITHUB_TOKEN)fail('unavailable','Đang dùng token môi trường. Hãy bỏ cấu hình token trước khi đăng nhập bằng trình duyệt.');
   const args=purpose==='login'?['auth','login','--hostname','github.com','--git-protocol','https','--web','--skip-ssh-key']:['auth','refresh','--hostname','github.com','--scopes','delete_repo'];
   await this.execute('gh',args,undefined,job.controller.signal,text=>{buffer=(buffer+text).slice(-16000);const code=/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.exec(buffer)?.[0];if(code)this.event(id,{kind:'login',state:'waiting',url:'https://github.com/login/device',deviceCode:code,message:'Mở GitHub và nhập mã một lần.'} as Omit<GithubEvent,'runId'|'sequence'|'at'>);});
   result.completedStepIds.push('authenticate');await this.execute('gh',['auth','setup-git','--hostname','github.com'],undefined,job.controller.signal);result.completedStepIds.push('setup-git');
   result.status=await this.status();if(!result.status.conditions.authenticated)fail('auth','Chưa xác minh được tài khoản GitHub.');result.effects='applied';
   this.event(id,{kind:'login',state:'authenticated',message:'Đã đăng nhập GitHub.'} as Omit<GithubEvent,'runId'|'sequence'|'at'>);
  }catch(e){result.error=job.controller.signal.aborted?{code:'cancelled',message:'Đã hủy đăng nhập.',hint:'Kiểm tra tài khoản: gh có thể đã lưu đăng nhập trước khi hủy.'}:githubError(e);result.state=result.completedStepIds.length?'partial':job.controller.signal.aborted?'cancelled':'error';result.recovery={state:'manualRequired',message:'Kiểm tra lại tài khoản; không tự thử lại đăng nhập.'};this.event(id,{kind:'login',state:job.controller.signal.aborted?'cancelled':'error',message:result.error.message} as Omit<GithubEvent,'runId'|'sequence'|'at'>);}
  finally{this.active=undefined;result.status=await this.status().catch(()=>undefined);job.result=result;this.event(id,{kind:'result',result} as Omit<GithubEvent,'runId'|'sequence'|'at'>);}
 }
}
