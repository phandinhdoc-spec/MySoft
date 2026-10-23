import {useSyncExternalStore} from 'react';
import {appearanceIcons,type IconStyleId} from '@pvta/shared';
let current:IconStyleId='lucide';
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function setIconStyle(value:unknown){const next=appearanceIcons(value);if(next!==current){current=next;listeners.forEach(listener=>listener());}}
export const useIconStyle=()=>useSyncExternalStore(subscribe,()=>current,()=>current);
