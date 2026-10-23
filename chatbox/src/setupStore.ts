import {useSyncExternalStore} from 'react';
import type {SetupEvent} from '../../core/src/desktop/backend-setup';
export type {SetupEvent};

/**
 * Tiến trình cài và đăng nhập công cụ AI do lõi PVTA gửi lên (sự kiện 'setup').
 * Giữ sự kiện mới nhất của từng công cụ để thẻ trong Cài đặt hiển thị.
 */
let events:Record<string,SetupEvent>={};
const listeners=new Set<()=>void>();
export function applySetup(e:SetupEvent){events={...events,[e.backend]:e};listeners.forEach(l=>l());}
export function clearSetup(backend:string){const {[backend]:_,...rest}=events;events=rest;listeners.forEach(l=>l());}
const subscribe=(cb:()=>void)=>{listeners.add(cb);return()=>{listeners.delete(cb);};};
export function useSetup():Record<string,SetupEvent>{return useSyncExternalStore(subscribe,()=>events);}
/** Đang chạy hoặc đang chờ người dùng dán mã. */
export const isBusy=(e?:SetupEvent)=>e?.phase==='running'||e?.phase==='code';
