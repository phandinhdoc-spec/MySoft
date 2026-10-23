import {t as uiText} from './i18n';
import {withPromptReview} from './workflow-prompt-review';
import type {RpcEvent,ViewState} from '../../core/src/desktop/types';
export type {ViewState,Chat,Message,Action,Plan,PlanStep,Preferences} from '../../core/src/desktop/types';
declare const __PVTA_DEV_TOKEN__:string;
const desktop='__TAURI_INTERNALS__' in window;
const listeners=new Set<(e:RpcEvent)=>void>();let hooked=false;
/** Nhiều nơi có thể nghe sự kiện cùng lúc (App, Sổ nguồn…). */
export async function subscribe(cb:(e:RpcEvent)=>void){
 if(desktop){const {listen}=await import('@tauri-apps/api/event');return listen<RpcEvent>('pvta:event',e=>cb(e.payload));}
 listeners.add(cb);if(!hooked){hooked=true;import.meta.hot?.on('pvta:event',e=>{for(const l of listeners)l(e);});}
 return ()=>{listeners.delete(cb);};
}
export async function rpc<T=any>(method:string,params:Record<string,unknown>={},id=crypto.randomUUID()):Promise<T>{
 return withPromptReview<T>(method,params,(next,args)=>rawRpc<T>(next,args,id));
}
async function rawRpc<T>(method:string,params:Record<string,unknown>,id:string):Promise<T>{
 if(desktop&&method==='init'){const {documentDir}=await import('@tauri-apps/api/path');params={...params,documentsDir:await documentDir()};}
 const request={id,method,params};
 if(desktop){const {invoke}=await import('@tauri-apps/api/core');return invoke<T>('rpc',{request});}
 if(!import.meta.env.DEV)throw Error(uiText("Mở ứng dụng PVTA để dùng chức năng này."));
 const res=await fetch('/__pvta/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-PVTA-Token':__PVTA_DEV_TOKEN__},body:JSON.stringify(request)});
 if(!res.ok)throw Error(uiText("Không kết nối được lõi PVTA."));const body=await res.json();if(body.error)throw Error(body.error);return body.result;
}
export async function pickFiles(directory=false,filter?:{name:string;extensions:string[]}):Promise<string[]>{
 if(desktop){const {open}=await import('@tauri-apps/plugin-dialog');const result=await open({directory,multiple:!directory,title:directory?uiText("Chọn thư mục tài liệu"):uiText("Chọn tài liệu"),filters:directory?undefined:[filter??{name:uiText("Tài liệu và hình ảnh"),extensions:['docx','xlsx','pptx','pdf','txt','md','typ','csv','png','jpg','jpeg','webp']}]});return typeof result==='string'?[result]:result??[];}
 const result=window.prompt(directory?uiText("Đường dẫn tuyệt đối của thư mục:"):uiText("Đường dẫn tuyệt đối của tệp (mỗi dòng một tệp):"));return result?result.split('\n').filter(Boolean):[];
}
export async function savePath(name:string):Promise<string|null>{
 if(desktop){
  const {save}=await import('@tauri-apps/plugin-dialog');
  const ext=name.includes('.')?name.split('.').pop()?.toLowerCase():undefined;
  const p=await save({defaultPath:name,title:uiText("Lưu bản sao tệp"),filters:ext?[{name:uiText("Tệp .{0}",[ext]),extensions:[ext]}]:undefined});
  if(!p)return null;
  return ext&&!p.toLowerCase().endsWith('.'+ext)?`${p}.${ext}`:p;
 }
 return window.prompt(uiText("Đường dẫn tuyệt đối của tệp:"),name);
}
export async function chooseBackup():Promise<string|null>{
 if(desktop){const {open}=await import('@tauri-apps/plugin-dialog');const p=await open({multiple:false,filters:[{name:uiText("Sao lưu PVTA"),extensions:['zip']}]});return typeof p==='string'?p:null;}
 return window.prompt(uiText("Đường dẫn tuyệt đối của bản sao lưu .zip:"));
}
