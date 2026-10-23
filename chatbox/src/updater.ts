import {t as uiText} from './i18n';
import {useSyncExternalStore} from 'react';
import {rpc} from './ipc';

/**
 * Cập nhật PVTA tại chỗ. Lõi PVTA hỏi GitHub, tải gói (báo tiến trình), đối chiếu mã SHA256 rồi cài ẩn;
 * giao diện chỉ hiển thị trạng thái rồi mở lại (macOS, Linux) hoặc thoát để bộ cài Windows tự mở lại.
 * Không mở Terminal, không cần thầy cô gõ lệnh hay bấm qua trình cài đặt.
 */
export type UpdatePhase='idle'|'checking'|'none'|'available'|'downloading'|'installing'|'done'|'external'|'error';
export interface UpdateState{source?:boolean;phase:UpdatePhase;version:string;notes:string;received:number;total:number;error:string}

const desktop='__TAURI_INTERNALS__' in window;
export const canSelfUpdate=desktop;

let state:UpdateState={phase:'idle',version:'',notes:'',received:0,total:0,error:''};
const listeners=new Set<()=>void>();
function set(patch:Partial<UpdateState>){state={...state,...patch};listeners.forEach(l=>l());}
const subscribe=(cb:()=>void)=>{listeners.add(cb);return()=>{listeners.delete(cb);};};
const snapshot=()=>state;
export function useUpdate():UpdateState{return useSyncExternalStore(subscribe,snapshot);}

const message=(e:unknown)=>e instanceof Error?e.message:typeof e==='string'?e:uiText("Chưa cập nhật được. Thử lại sau.");
const busyPhase=()=>state.phase==='checking'||state.phase==='downloading'||state.phase==='installing'||state.phase==='done';

// Tiến trình tải do lõi gửi lên.
if(desktop)void import('@tauri-apps/api/event').then(({listen})=>listen<any>('pvta:event',e=>{
 const r=e.payload;
 if(r?.event!=='update'||!(state.phase==='downloading'||state.phase==='installing'))return;
 const d=r.data??{};
 set({phase:d.phase==='installing'?'installing':'downloading',received:Number(d.received)||0,total:Number(d.total)||0});
})).catch(()=>{});

/** Hỏi GitHub xem có bản mới không. silent: lỗi (mất mạng…) thì im lặng, giữ trạng thái cũ. */
export async function checkForUpdate(silent=false):Promise<void>{
 if(!desktop||busyPhase())return;
 if(silent&&state.phase==='available')return;
 const before=state.phase;
 set({phase:'checking',error:''});
 try{
  const r=await rpc<{latest:string;notes:string;available:boolean;reason?:string;source?:boolean}>('checkUpdate');
  if(r.source&&silent){set({phase:before});return;}
  if(!r.available){set({phase:'none'});return;}
  if(r.reason){set(silent?{phase:before}:{phase:'error',version:r.latest,error:r.reason});return;}
  set({phase:'available',source:!!r.source,version:r.latest,notes:r.notes??'',received:0,total:0});
 }catch(e){
  set(silent?{phase:before}:{phase:'error',error:message(e)});
 }
}

/** Tải, cài và mở lại. Chỉ chạy khi thầy cô bấm "Cập nhật ngay". */
export async function installUpdate():Promise<void>{
 if(!desktop||state.phase!=='available')return;
 set({phase:'downloading',received:0,total:0,error:''});
 try{
  const r=await rpc<{version:string;finish:'relaunch'|'exit'|'external'}>('installUpdate');
  if(r.finish==='external'){set({phase:'external',version:r.version});return;}
  set({phase:'done',version:r.version});
  const p=await import('@tauri-apps/plugin-process');
  // Windows: bộ cài đang chạy sẽ thay tệp rồi tự mở lại PVTA, nên ở đây chỉ cần thoát.
  setTimeout(()=>void (r.finish==='exit'?p.exit(0):p.relaunch()).catch(e=>set({phase:'error',error:'Đã cài nhưng chưa mở lại được PVTA. Hãy mở lại ứng dụng. '+message(e)})),1500);
 }catch(e){
  set({phase:'error',error:message(e)});
 }
}

export function dismissUpdateError(){if(state.phase==='error')set({phase:'idle',error:''});}
