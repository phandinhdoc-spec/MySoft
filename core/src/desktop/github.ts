import {execFile} from 'node:child_process';
import {realpath} from 'node:fs/promises';

import {githubBusy as busy,sanitizeGithub} from './github-tool.js';
export {GithubTool,githubError} from './github-tool.js';
function git(cwd:string,args:string[]):Promise<string>{
 return new Promise((resolve,reject)=>execFile('git',args,{cwd,timeout:120000,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}},(error,stdout,stderr)=>{
  if(error)reject(Error((error as NodeJS.ErrnoException).code==='ENOENT'?'Chưa tìm thấy Git. Hãy cài Git rồi mở lại PVTA.':sanitizeGithub(stderr.trim()||error.message)));else resolve(stdout.trim());
 }));
}
export function githubUrl(remote:string):string{
 const match=/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
 if(!match)throw Error('Remote origin không phải repository trên github.com.');
 return `https://github.com/${match[1]}/${match[2]}`;
}
export async function githubAction(cwd:string,action:string,value=''){
 const root=await realpath(await git(cwd,['rev-parse','--show-toplevel']));
 if(busy.has(root))throw Error('Một thao tác Git đang chạy trong repository này.');
 busy.add(root);
 try{
  switch(action){
   case 'status':return await git(root,['status','--short','--branch']);
   case 'diff':return 'CHƯA STAGE\n'+await git(root,['diff','--no-ext-diff','--no-textconv'])+'\n\nĐÃ STAGE\n'+await git(root,['diff','--cached','--no-ext-diff','--no-textconv']);
   case 'log':return await git(root,['log','-20','--oneline','--decorate']);
   case 'branches':return await git(root,['branch','--list']);
   case 'fetch':return await git(root,['fetch','origin'])||'Đã cập nhật thông tin từ origin.';
   case 'pull':return await git(root,['pull','--ff-only']);
   case 'push':return await git(root,['push'])||'Đã push thành công.';
   case 'commit':{
    if(!value.trim()||value.length>2000)throw Error('Nhập nội dung commit (tối đa 2000 ký tự).');
    return await git(root,['commit','-m',value.trim()]);
   }
   case 'stage':return await git(root,['add','--all'])||'Đã stage các thay đổi (trừ tệp bị Git bỏ qua).';
   case 'switch':case 'createBranch':{
    if(!value||value.startsWith('-')||value.length>200)throw Error('Tên nhánh không hợp lệ.');
    await git(root,['check-ref-format','--branch',value]);
    return await git(root,action==='switch'?['switch',value]:['switch','-c',value])||`Đang ở nhánh ${value}.`;
   }
   case 'repo':case 'actions':case 'pulls':case 'issues':{
    const url=githubUrl(await git(root,['remote','get-url','origin']));
    return url+(action==='repo'?'':'/'+action);
   }
   default:throw Error('Thao tác Git không được hỗ trợ.');
  }
 }finally{busy.delete(root);}
}
