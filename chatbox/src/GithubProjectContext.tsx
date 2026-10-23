import {t as uiText} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {rpc,pickFiles,type ViewState} from './ipc';
import {githubContextLink,type GithubStatus,type GithubRpcReply} from '../../core/src/desktop/github-model';
import {useObjectMenu} from './ObjectMenu';
export function GithubProjectContext({project}:{project?:ViewState['data']['projects'][number]}){
 const folder=project?.outputDir??project?.folders?.[0];
 const [status,setStatus]=useState<GithubStatus>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const contextKey=JSON.stringify([project?.id,folder]),current=useRef(contextKey),picking=useRef(false),mounted=useRef(true),activeRun=useRef(status?.activeRunId);current.current=contextKey;activeRun.current=status?.activeRunId;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{let alive=true;setStatus(undefined);setError('');if(project)void rpc<GithubRpcReply<GithubStatus>>('githubStatus',{projectId:project.id,folder}).then(r=>{if(!alive)return;if(r.ok)setStatus(r.value);else setError(r.error.message);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[project?.id,folder,project?.url]);
 async function changeFolder(){if(!project||picking.current||status?.activeRunId)return;picking.current=true;setBusy(true);setError('');try{const paths=await pickFiles(true);if(paths[0]&&mounted.current&&!activeRun.current&&current.current===contextKey)await rpc('setProjectGithubFolder',{projectId:project.id,folder:paths[0]});}catch(e){if(mounted.current&&current.current===contextKey)setError(String(e));}finally{picking.current=false;if(mounted.current)setBusy(false);}}
 const menu=useObjectMenu<string>({contextKey,onError:e=>setError(String(e)),commands:()=>project?[{id:'folder',label:uiText("Chọn lại thư mục…"),disabledReason:busy?uiText("Đang chọn thư mục…"):status?.activeRunId?uiText("Chờ thao tác GitHub kết thúc."):undefined,run:changeFolder}]:[]});
 const link=githubContextLink(project?.url)||githubContextLink(status?.repository?.origin);
 return <section className="github-project-context" aria-label={uiText("Dự án GitHub đang làm việc")}>
  <strong>{project?.name??uiText("Chưa chọn dự án")}</strong>
  <small>Kho GitHub</small>{link?<button type="button" title={link} onClick={()=>void rpc('openLink',{url:link}).catch(e=>setError(String(e)))}>{link}</button>:<p>{uiText("Chưa liên kết GitHub")}</p>}
  <small>{uiText("Thư mục trên máy")}</small><div tabIndex={0} {...menu.handlers('folder')}><p title={folder}>{folder??uiText("Chưa chọn thư mục")}</p>{project&&menu.trigger('folder',uiText("Thao tác thư mục GitHub"))}</div>
  {status?.repository?.branch&&<small>{uiText("Nhánh:")} {status.repository.branch}</small>}
  {(status?.folderError||error)&&<p role="alert">{error||status?.folderError}</p>}
  {project?(!folder||status?.folderError)&&<button type="button" disabled={busy||!!status?.activeRunId} onClick={()=>void changeFolder()}>{busy?uiText("Đang cập nhật…"):uiText("Chọn lại thư mục…")}</button>:<p>{uiText("Chọn dự án để dùng cùng liên kết và thư mục.")}</p>}
  {menu.menu}
 </section>;
}
