/** JSON-only contracts shared by the desktop UI and executor. No Node imports. */
export type GithubGroup = 'start'|'save'|'sync'|'branches'|'history'|'repositories'|'collaboration'|'settings';
export type GithubRequirement =
 | 'git'|'gh'|'authenticated'|'folder'|'repository'|'noRepository'|'idle'
 | 'clean'|'changes'|'head'|'branch'|'upstream'|'origin'|'identity'
 | 'noOperation'|'stashes'|'parentCommit'|'unpublishedHead'|'repoWrite'|'repoAdmin'|'deleteScope';
export type GithubRisk = 'read'|'write'|'danger';
export const githubRequirementHelp:Record<GithubRequirement,string>={
 git:'Cần cài Git.',gh:'Cần cài GitHub CLI (gh).',authenticated:'Cần đăng nhập GitHub.',
 folder:'Cần chọn thư mục được phép truy cập.',repository:'Thư mục phải là kho Git.',
 noRepository:'Thư mục chưa được nằm trong một kho Git.',idle:'Chờ thao tác đang chạy kết thúc.',
 clean:'Cần lưu hoặc cất tạm mọi thay đổi, kể cả tệp mới.',changes:'Cần có thay đổi để thực hiện.',
 head:'Kho cần có ít nhất một phiên bản đã lưu.',branch:'Cần đứng trên một nhánh, không ở phiên bản tách rời.',
 upstream:'Nhánh hiện tại cần có nhánh theo dõi.',origin:'Cần cấu hình kho từ xa origin.',
 identity:'Cần đặt tên và email người lưu.',noOperation:'Cần xử lý xong lần gộp, đổi gốc hoặc hoàn tác đang dở.',
 stashes:'Cần có ít nhất một lần cất tạm.',parentCommit:'Phiên bản cuối cần có đúng một phiên bản cha.',
 unpublishedHead:'Cần xác minh phiên bản cuối chưa được công bố; chưa rõ thì không cho hoàn tác.',
 repoWrite:'Cần xác minh quyền ghi trên kho GitHub được chọn.',
 repoAdmin:'Cần xác minh quyền quản trị trên kho GitHub được chọn.',
 deleteScope:'Cần cấp quyền delete_repo riêng cho thao tác xóa kho.',
};
export type GithubFieldKind = 'text'|'multiline'|'select'|'folder'|'file'|'branch'|'revision'|'repository'|'account'|'number';
export interface GithubField {
 key:string; label:string; help:string; kind:GithubFieldKind; required:boolean;
 maxLength:number; default?:string; options?:{value:string;label:string}[];
 source?:'branches'|'repositories'|'changes'|'commits'|'stashes';
}
export type GithubConfirmation =
 | {kind:'none'}
 | {kind:'literal';text:string}
 | {kind:'field';field:string}
 | {kind:'when';field:string;equals:string;text:string};
export interface GithubOperation {
 id:string; group:GithubGroup; label:string; help:string; fields:GithubField[];
 requires:GithubRequirement[]; risk:GithubRisk; confirmation:GithubConfirmation;
 result:{kind:'message'|'table'|'history'|'diff'|'file';description:string};
}
export interface GithubCatalog {version:1;groups:{id:GithubGroup;label:string}[];operations:GithubOperation[]}
export interface GithubError {
 code:'invalidInput'|'unavailable'|'confirmationRequired'|'stalePreview'|'missingTool'|'auth'
  |'permission'|'conflict'|'busy'|'network'|'cancelled'|'timeout'|'commandFailed';
 message:string; hint:string; field?:string;
 recovery?:'login'|'installGit'|'installGh'|'identity'|'trustFolder'|'grantDeleteScope'|'inspect';
 /** Sanitized text only. Never tokens or raw credential-bearing URLs. */
 detail?:string;
}
export interface GithubStatus {
 version:1; observedAt:number; folder?:string; root?:string;folderError?:string;
 tools:{git:{installed:boolean;version?:string};gh:{installed:boolean;version?:string}};
 auth:{state:'ready'|'missing'|'unknown';account?:string;host:'github.com';source?:'keyring'|'file'|'environment'|'unknown'};
 repository?:{
  branch:string|null;head:string|null;upstream:string|null;origin:string|null;
  ahead:number|null;behind:number|null;
  changes:{path:string;originalPath?:string;index:string;worktree:string;untracked:boolean}[];
  operation:'none'|'merge'|'rebase'|'cherry-pick'|'revert'|'unknown';
 };
 /** Unknown conditions fail closed. Executor recomputes these for the selected target. */
 conditions:Partial<Record<GithubRequirement,boolean>>;
 unavailable:Partial<Record<GithubRequirement,string>>;
 suggestions:string[]; activeRunId?:string;
 choices?:Partial<Record<NonNullable<GithubField['source']>,{value:string;label:string}[]>>;
}
export interface GithubTarget {projectId?:string;folder?:string}
export interface GithubOperationRequest extends GithubTarget {
 version:1;operationId:string;values:Record<string,string>;
}
export interface GithubPreview {
 version:1;previewId:string;expiresAt:number;operationId:string;target:GithubTarget;
 /** Display only: the client must never submit these commands for execution. */
 steps:{id:string;label:string;executable:'git'|'gh'|'internal';args:string[];cwd?:string}[];
 files?:{path:string;size:number}[];
 warnings:string[];confirmationText:string|null;
}
export interface GithubRunRequest {
 version:1;previewId:string;confirmation:string;
 /** Retry of this request returns the same run, not a second execution. */
 requestId:string;
}
export type GithubOutput =
 | {kind:'message';text:string}
 | {kind:'table';columns:{key:string;label:string}[];rows:Record<string,string|number|boolean|null>[];truncated:boolean}
 | {kind:'history';commits:{sha:string;subject:string;author:string;at:string}[];truncated:boolean}
 | {kind:'diff';text:string;truncated:boolean}
 | {kind:'file';path:string};
export interface GithubRunResult {
 runId:string;operationId:string;state:'success'|'partial'|'error'|'cancelled';
 completedStepIds:string[];output:GithubOutput[];error?:GithubError;
 recovery:{state:'notNeeded'|'abortedOwnOperation'|'manualRequired';message:string};
 /** Cancellation/timeout may leave a remote mutation with an unknown outcome. */
 effects:'none'|'applied'|'unknown';status?:GithubStatus;
}
export type GithubEvent = {runId:string;sequence:number;at:number} & (
 | {kind:'progress';stepId:string;completed:number;total:number;message:string}
 | {kind:'upload';files:{path:string;state:'waiting'|'uploading'|'uploaded'}[];percent:number;message:string}
 | {kind:'log';level:'info'|'warning'|'error';text:string}
 | {kind:'login';state:'waiting'|'authenticated'|'cancelled'|'error';url?:string;deviceCode?:string;message:string}
 | {kind:'result';result:GithubRunResult}
);
/** Planned RPC surface. Adding this map does not register runtime handlers. */
export interface GithubRpcMethods {
 githubUploadHistory:{params:GithubTarget;result:{runId:string;at:number;source:string;repository:string;branch:string;state:GithubRunResult['state'];files:{path:string;hash:string;size:number}[];output:GithubOutput[]}[]};
 githubCatalog:{params:{version:1};result:GithubCatalog};
 githubStatus:{params:GithubTarget;result:GithubStatus};
 githubPreview:{params:GithubOperationRequest;result:GithubPreview};
 githubRun:{params:GithubRunRequest;result:{runId:string}};
 githubCancel:{params:{runId:string};result:{accepted:boolean}};
 githubLogin:{params:{requestId:string;purpose:'login'|'deleteScope'};result:{runId:string}};
 githubCancelLogin:{params:{runId:string};result:{accepted:boolean}};
}
export type GithubRpcReply<T> = {ok:true;value:T}|{ok:false;error:GithubError};
export type GithubRpcRequest = {
 [M in keyof GithubRpcMethods]:{id:string;method:M;params:GithubRpcMethods[M]['params']}
}[keyof GithubRpcMethods];

export function confirmationText(op:GithubOperation,values:Record<string,string>):string|null {
 const rule=op.confirmation;
 switch(rule.kind){
  case 'none':return null;
  case 'literal':return rule.text;
  case 'field':{
   const value=values[rule.field];
   if(!value?.trim())throw Error(`Thiếu giá trị xác nhận: ${rule.field}`);
   return value;
  }
  case 'when':return values[rule.field]===rule.equals?rule.text:null;
 }
}
/** UI hints only. Recheck conditions, values and confirmation on the backend. */
export function unavailableReasons(op:GithubOperation,status:GithubStatus):string[] {
 return op.requires.filter(key=>status.conditions[key]!==true)
  .map(key=>status.unavailable[key]??githubRequirementHelp[key]);
}
/** Shape/choice validation, not a substitute for git ref/path and permission checks. */
export function validateValues(op:GithubOperation,input:unknown):GithubError[] {
 const invalid=(message:string,field?:string):GithubError=>({code:'invalidInput',message,field,hint:'Kiểm tra lại biểu mẫu.'});
 if(!input||typeof input!=='object'||Array.isArray(input))return [invalid('Dữ liệu biểu mẫu không hợp lệ.')];
 const values=input as Record<string,unknown>;
 const errors:GithubError[]=[];
 for(const key of Object.keys(values))if(!op.fields.some(f=>f.key===key))errors.push(invalid('Ô nhập không được hỗ trợ.',key));
 for(const f of op.fields){
  const value=values[f.key];
  if(value===undefined&&!f.required)continue;
  if(typeof value!=='string'){errors.push(invalid(`Giá trị ${f.label} phải là văn bản.`,f.key));continue;}
  if((f.required&&!value.trim())||value.length>f.maxLength||value.includes('\0')){
   errors.push(invalid(`Kiểm tra độ dài và nội dung ${f.label}.`,f.key));continue;
  }
  if(!value&&!f.required)continue;
  if(f.options&&!f.options.some(o=>o.value===value))errors.push(invalid(`Chọn giá trị hợp lệ cho ${f.label}.`,f.key));
  if(f.kind==='number'&&!/^[1-9]\d*$/.test(value))errors.push(invalid('Nhập số nguyên dương.',f.key));
 }
 return errors;
}

/** Accept only GitHub origins, including the SSH forms used by Git. */
export function githubContextLink(value?:string|null):string {
 if(!value)return '';
 const ssh=/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)$/.exec(value);
 if(ssh)return 'https://github.com/'+ssh[1]!.replace(/\.git$/,'');
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||u.search)return '';if(!/^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\/(?:tree|blob)\/.+)?\/?$/.test(u.pathname))return '';return value.replace(/\/$/,'').replace(/\.git$/,'');}catch{return '';}
}
