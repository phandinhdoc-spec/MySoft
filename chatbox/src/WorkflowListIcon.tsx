import React from 'react';

/** Icon danh sách dùng currentColor, độc lập với tông màu của bộ icon chung. */
export function WorkflowListIcon({template=false,size=20}:{template?:boolean;size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" focusable="false">
  <path d="M8 10v6h6"/>
  <rect x="3" y="3" width="8" height="8" rx="1.5" fill={template?'currentColor':'none'}/>
  <rect x="13" y="13" width="8" height="8" rx="1.5" fill={template?'currentColor':'none'}/>
  {template&&<path d="M16 3h5v5M3 16v5h5" strokeLinecap="square"/>}
 </svg>;
}
