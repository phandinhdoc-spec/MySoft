import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import type {GithubEvent} from './github-model.js';
import type {GithubRunner} from './github-tool.js';

export function safeGithubPath(p:string):string {
 if(!p||p.startsWith('/')||/[\\\x00-\x1f:]/.test(p)||p.split('/').some(x=>!x||x==='.'||x==='..'||x.toLowerCase()==='.git'))throw Error('Đường dẫn tệp không hợp lệ: '+p);
 return p;
}
export function selectedPaths(text:string):string[]{
 const paths=[...new Set(text.split('\n').map(x=>x.trim()).filter(Boolean).map(safeGithubPath))];
 if(!paths.length)throw Error('Chọn ít nhất một tệp hoặc thư mục.');
 return paths.filter(p=>!paths.some(other=>other!==p&&p.startsWith(other+'/')));
}
export function parseGithubLink(text:string){
 const u=new URL(text);
 if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||u.search)throw Error('Chỉ nhận liên kết HTTPS của github.com, không kèm thông tin đăng nhập hoặc tham số.');
 const parts=u.pathname.replace(/\/$/,'').split('/').slice(1).map(decodeURIComponent);
 const [owner,repo,kind,...tail]=parts;
 if(!owner||!repo||! /^(?:[A-Za-z0-9-]+)$/.test(owner)||! /^[A-Za-z0-9_.-]+$/.test(repo)||['.','..'].includes(repo)||kind&&!['tree','blob'].includes(kind))throw Error('Dùng liên kết kho, thư mục (tree) hoặc tệp (blob).');
 return {repository:`${owner}/${repo.replace(/\.git$/,'')}`,tail,kind};
}
const enc=(s:string)=>encodeURIComponent(s);
export async function resolveGithubLink(link:string,ref:string,run:GithubRunner){
 const parsed=parseGithubLink(link),base=`repos/${parsed.repository}`;
 const api=async(p:string)=>JSON.parse(await run('gh',['api','--hostname','github.com',p]));
 let branch=ref,remotePath='';
 if(!branch&&!parsed.kind)branch=(await api(base)).default_branch;
 if(parsed.kind){
  if(branch){const suffix=parsed.tail.join('/');if(suffix!==branch&&!suffix.startsWith(branch+'/'))throw Error('Nhánh không khớp liên kết.');remotePath=suffix.slice(branch.length).replace(/^\//,'');}
  else {
   // Resolve the longest existing ref so branch names containing slashes work.
   for(let i=parsed.tail.length;i>0;i--){const candidate=parsed.tail.slice(0,i).join('/');try{await api(`${base}/commits/${enc(candidate)}`);branch=candidate;remotePath=parsed.tail.slice(i).join('/');break;}catch{/* Try the next ref boundary. */}}
   if(!branch)throw Error('Không xác định được nhánh của liên kết; nhập nhánh rõ ràng.');
  }
 }
 if(remotePath)safeGithubPath(remotePath);
 const commit=await api(`${base}/commits/${enc(branch)}`);
 return {repository:parsed.repository,branch,remotePath,head:commit.sha as string,tree:commit.commit.tree.sha as string};
}
export type RemoteTarget=Awaited<ReturnType<typeof resolveGithubLink>>;
type Entry={path:string;sha:string;type:string;mode:string;size?:number};
export async function remoteTree(t:RemoteTarget,run:GithubRunner):Promise<Entry[]>{
 const data=JSON.parse(await run('gh',['api','--hostname','github.com',`repos/${t.repository}/git/trees/${t.tree}?recursive=1`]));
 if(data.truncated)throw Error('Kho quá lớn để liệt kê đầy đủ; chưa thực hiện chuyển tệp.');
 return data.tree;
}
export async function localFiles(root:string,selection:string){
 const real=await fs.realpath(root),files:{path:string;hash:string;size:number}[]=[];
 async function walk(relative:string){
  safeGithubPath(relative);const full=path.join(real,relative);const actual=await fs.realpath(full);
  if(!actual.startsWith(real+path.sep))throw Error('Tệp nằm ngoài thư mục nguồn.');
  // Check every ancestor as well as the selected entry.
  let cursor=real;for(const part of relative.split('/')){cursor=path.join(cursor,part);if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Không hỗ trợ liên kết tượng trưng.');}
  const st=await fs.lstat(full);
  if(st.isDirectory()){for(const name of (await fs.readdir(full)).sort()){if(name.toLowerCase()==='.git')continue;await walk(relative+'/'+name);}}
  else if(st.isFile()){if(st.size>20*1024*1024)throw Error('Mỗi tệp tối đa 20 MB.');files.push({path:relative,hash:createHash('sha256').update(await fs.readFile(full)).digest('hex'),size:st.size});}
  else throw Error('Chỉ hỗ trợ tệp thường và thư mục.');
  if(files.length>500||files.reduce((n,f)=>n+f.size,0)>100*1024*1024)throw Error('Mỗi lần tối đa 500 tệp và 100 MB.');
 }
 for(const p of selectedPaths(selection))await walk(p);
 if(!files.length)throw Error('Không có tệp trong lựa chọn.');return files;
}
export async function remoteSelection(t:RemoteTarget,selection:string,run:GithubRunner){
 const tree=await remoteTree(t,run),paths=selectedPaths(selection);
 for(const p of paths)if(!tree.some(e=>e.path===p))throw Error('Không tìm thấy: '+p);
 const entries=tree.filter(e=>paths.some(p=>e.path===p||e.path.startsWith(p+'/'))&&e.type!=='tree');
 if(!entries.length||entries.length>500)throw Error('Chọn từ 1 đến 500 tệp.');
 if(entries.some(e=>(e.size??0)>20*1024*1024))throw Error('Mỗi tệp tải xuống tối đa 20 MB.');
 if(entries.reduce((n,e)=>n+(e.size??0),0)>100*1024*1024)throw Error('Tổng tệp vượt 100 MB.');
 for(const e of entries){safeGithubPath(e.path);if(e.type!=='blob'||!['100644','100755'].includes(e.mode))throw Error('Không hỗ trợ symlink hoặc submodule: '+e.path);}
 return entries;
}
/** Existing local files that a download into `destination` would replace. */
export async function existingDownloads(destination:string,entries:{path:string}[]){
 const found:string[]=[];
 for(const e of entries){const st=await fs.lstat(path.join(destination,e.path)).catch(()=>undefined);if(st)found.push(e.path);}
 return found;
}
export async function downloadSelected(t:RemoteTarget,selection:string,destination:string,run:GithubRunner,signal:AbortSignal,overwrite=false){
 const entries=await remoteSelection(t,selection,run);
 signal.throwIfAborted();
 // Fetch and verify everything first so a failure never leaves a half-updated project.
 const blobs:{entry:typeof entries[number];bytes:Buffer}[]=[];
 for(const e of entries){
  signal.throwIfAborted();const blob=JSON.parse(await run('gh',['api','--hostname','github.com',`repos/${t.repository}/git/blobs/${e.sha}`],undefined,signal));
  if(blob.encoding!=='base64')throw Error('Định dạng nội dung không được hỗ trợ.');
  const bytes=Buffer.from(blob.content,'base64');
  if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==e.sha)throw Error('Nội dung tải xuống không khớp mã Git.');
  blobs.push({entry:e,bytes});
 }
 signal.throwIfAborted();
 if(overwrite)await fs.mkdir(destination,{recursive:true});
 else await fs.mkdir(destination); // Exclusive creation, never merge into existing data.
 const real=await fs.realpath(destination);
 for(const {entry:e,bytes} of blobs){
  signal.throwIfAborted();
  const output=path.join(destination,e.path),dir=path.dirname(output);
  await fs.mkdir(dir,{recursive:true});
  if(!(await fs.realpath(dir)+path.sep).startsWith(real+path.sep))throw Error('Đường dẫn đi ra ngoài thư mục đích: '+e.path);
  const mode=e.mode==='100755'?0o755:0o644;
  if(!overwrite){await fs.writeFile(output,bytes,{flag:'wx',mode});continue;}
  const st=await fs.lstat(output).catch(()=>undefined);
  if(st&&!st.isFile())throw Error('Không ghi đè thư mục hoặc liên kết tượng trưng: '+e.path);
  await fs.writeFile(output,bytes,{mode});
 }
 return destination;
}
export async function uploadSelected(t:RemoteTarget,root:string,selection:string,message:string,expected:Awaited<ReturnType<typeof localFiles>>,run:GithubRunner,signal:AbortSignal,onProgress?:(event:Omit<Extract<GithubEvent,{kind:'upload'}>,'runId'|'sequence'|'at'>)=>void){
 if(JSON.stringify(await localFiles(root,selection))!==JSON.stringify(expected))throw Error('Tệp nguồn đã thay đổi; xem trước lại.');
 const files=expected.map(f=>({path:f.path,state:'waiting' as 'waiting'|'uploading'|'uploaded'}));
 const report=(completed:number,message:string)=>onProgress?.({kind:'upload',files:files.map(f=>({...f})),percent:Math.floor(completed/(files.length+3)*100),message});
 report(0,'Chuẩn bị tải tệp');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-github-'));
 const api=async(endpoint:string,body:unknown,method='POST')=>{
  signal.throwIfAborted();const input=path.join(temp,'request.json');await fs.writeFile(input,JSON.stringify(body),{mode:0o600});
  return JSON.parse(await run('gh',['api','--hostname','github.com','--method',method,`repos/${t.repository}/${endpoint}`,'--input',input],undefined,signal));
 };
 try{
  const existing=await remoteTree(t,run),tree=[];
  for(const [index,f] of expected.entries()){
   signal.throwIfAborted();files[index]!.state='uploading';report(index,'Đang tải: '+f.path);
   const bytes=await fs.readFile(path.join(root,f.path));if(createHash('sha256').update(bytes).digest('hex')!==f.hash)throw Error('Tệp nguồn đã thay đổi; xem trước lại.');
   const old=existing.find(e=>e.path===f.path);if(old&&(old.type!=='blob'||!['100644','100755'].includes(old.mode)))throw Error('Không thể thay thư mục, symlink hoặc submodule bằng tệp: '+f.path);
   const blob=await api('git/blobs',{content:bytes.toString('base64'),encoding:'base64'});tree.push({path:f.path,mode:old?.mode??'100644',type:'blob',sha:blob.sha});
   files[index]!.state='uploaded';report(index+1,'Đã truyền: '+f.path);
  }
  const next=await api('git/trees',{base_tree:t.tree,tree});
  report(files.length+1,'Đang tạo phiên bản');
  if(next.sha===t.tree){report(files.length+3,'Nội dung đã đồng bộ');return 'Các tệp đã giống nội dung trên GitHub; không tạo phiên bản mới.';}
  const commit=await api('git/commits',{message,tree:next.sha,parents:[t.head]});
  report(files.length+2,'Đang cập nhật nhánh');
  await api(`git/refs/heads/${t.branch.split('/').map(enc).join('/')}`,{sha:commit.sha,force:false},'PATCH');
  report(files.length+3,'Đã cập nhật trên GitHub');
  return `Đã cập nhật ${expected.length} tệp trên ${t.repository}, nhánh ${t.branch}. Phiên bản: ${commit.sha}`;
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}

/** Compare eligible local files to the actual remote tree, not just the Git index. */
export async function changedLocalFiles(root:string,t:RemoteTarget,run:GithubRunner,onSkipped?:(path:string)=>void){
 const realRoot=await fs.realpath(root);
 const entries=await remoteTree(t,run),remote=new Map(entries.map(e=>[e.path,e]));
 const names=[...new Set((await run('git',['ls-files','--cached','--others','--exclude-standard','-z'],root)).split('\0').filter(Boolean))].sort();
 const changed:string[]=[];
 for(const entry of names){
  const name=entry.replace(/\/$/,'');
  safeGithubPath(name);const full=path.join(root,name);const st=await fs.lstat(full).catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});
  if(!st)continue; // This operation never deletes remote files.
  if(st.isDirectory()&&await fs.lstat(path.join(full,'.git')).then(()=>true,()=>false)){onSkipped?.(name);continue;}
  if(!st.isFile())throw Error('Không hỗ trợ symlink hoặc submodule: '+name);
  const actual=await fs.realpath(full);if(!actual.startsWith(realRoot+path.sep))throw Error('Tệp nằm ngoài thư mục nguồn.');
  const hash=createHash('sha1').update(`blob ${st.size}\0`);
  for await(const chunk of createReadStream(full))hash.update(chunk);
  if(remote.get(name)?.sha!==hash.digest('hex'))changed.push(name);
 }
 return changed.length?localFiles(root,changed.join('\n')):[];
}
/** Remote files that are missing or different locally. Local files with unsaved edits, or that Git does not track, are never selected. */
export async function changedRemoteFiles(root:string,t:RemoteTarget,run:GithubRunner,onKept?:(path:string)=>void,onSkipped?:(path:string)=>void){
 const prefix=t.remotePath?t.remotePath+'/':'';
 const entries=(await remoteTree(t,run)).filter(e=>e.type!=='tree'&&(!t.remotePath||e.path===t.remotePath||e.path.startsWith(prefix)));
 const dirty=new Set<string>(),tracked=new Set((await run('git',['ls-files','-z'],root)).split('\0').filter(Boolean));
 const status=(await run('git',['status','--porcelain','-z','--untracked-files=all'],root)).split('\0');
 for(let i=0;i<status.length;i++){const item=status[i]!;if(item.length<4)continue;dirty.add(item.slice(3));if(item[0]==='R'||item[0]==='C')i++;}
 const changed:string[]=[];
 for(const e of entries){
  if(e.type!=='blob'||!['100644','100755'].includes(e.mode)){onSkipped?.(e.path);continue;}
  safeGithubPath(e.path);
  const full=path.join(root,e.path),st=await fs.lstat(full).catch(err=>{if(err.code==='ENOENT'||err.code==='ENOTDIR')return undefined;throw err;});
  if(!st){if(dirty.has(e.path))onKept?.(e.path);else changed.push(e.path);continue;}
  if(!st.isFile()){onKept?.(e.path);continue;}
  const hash=createHash('sha1').update(`blob ${st.size}\0`);
  for await(const chunk of createReadStream(full))hash.update(chunk);
  if(hash.digest('hex')===e.sha)continue;
  if(dirty.has(e.path)||!tracked.has(e.path))onKept?.(e.path);else changed.push(e.path);
 }
 return changed;
}
