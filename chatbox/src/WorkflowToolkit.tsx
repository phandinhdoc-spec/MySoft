import React from 'react';

/**
 * Bộ biểu tượng, nhóm nút và huy hiệu cho màn hình Quy trình.
 * Biểu tượng vẽ sẵn (nét 1.75, khung 24) nên không phụ thuộc kiểu biểu tượng người dùng chọn và không bị thay bằng biểu tượng thư mục khi thiếu tên.
 */
const G:Record<string,React.ReactNode>={
 undo:<><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></>,
 redo:<><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></>,
 save:<><path d="M5 3h11l4 4v14H5V3Z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/></>,
 pin:<><path d="m16 3 5 5-4 2-3 5-2 1-4-4 1-2 5-3 2-4ZM8 16l-5 5"/></>,
 copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
 insert:<><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/></>,
 template:<><path d="M5 3h14v18H5V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
 export:<><path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6"/></>,
 import:<><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/></>,
 trash:<><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
 discard:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
 frame:<><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9h6v6H9z" strokeDasharray="2 2"/></>,
 hash:<path d="M5 9h14M5 15h14M10 4 8 20m8-16-2 16"/>,
 play:<path d="m7 4 13 8-13 8V4Z"/>,
 stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
 retry:<><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/></>,
 link:<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></>,
 check:<path d="m5 12 5 5 9-10"/>,
 x:<path d="m6 6 12 12M18 6 6 18"/>,
 folder:<path d="M3 7h7l2 2h9v11H3V7Z"/>,
 plus:<path d="M12 5v14M5 12h14"/>,
 branch:<><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m12-10c0 7-12 3-12 10"/></>,
 spark:<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>,
 shield:<><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
 zoomIn:<><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/></>,
 zoomOut:<><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8 11h6"/></>,
 fit:<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>,
 expand:<><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></>,
 shrink:<><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7"/></>,
 eye:<><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/></>,
 eyeOff:<><path d="M3 3l18 18M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3.2 4M6.2 7.2C3.7 9 2 12 2 12s3.5 6.5 10 6.5c1.5 0 2.8-.3 4-.8"/></>,
 mouse:<><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></>,
 warn:<><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4m0 3v.01"/></>,
};
export function WfGlyph({name,size=14}:{name:string;size?:number}){
 return <svg className="wf-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{G[name]??G.plus}</svg>;
}
/** Nhóm nút có vạch ngăn bên trái (trừ nhóm đầu): nhìn là biết nút nào đi với nút nào. */
export function ToolGroup({label,children}:{label:string;children:React.ReactNode}){
 return <div className="wf-tgroup" role="group" aria-label={label}><span className="wf-tlabel">{label}</span><div className="wf-tbtns">{children}</div></div>;
}
export const ToolSep=()=> <span className="wf-sep" role="separator" aria-orientation="vertical"/>;
type BtnProps=React.ButtonHTMLAttributes<HTMLButtonElement>&{icon:string;tone?:'primary'|'danger'};
export function ToolButton({icon,tone,children,className,...rest}:BtnProps){
 return <button type="button" {...rest} className={`wf-tbtn${tone?` wf-t-${tone}`:''}${className?` ${className}`:''}`}><WfGlyph name={icon}/><span>{children}</span></button>;
}
/** Huy hiệu trạng thái nhỏ: tone quyết định màu, luôn kèm chữ để không chỉ dựa vào màu. */
export function Badge({tone='muted',icon,children,title}:{tone?:'muted'|'ok'|'warn'|'err'|'info';icon?:string;children:React.ReactNode;title?:string}){
 return <span className={`wf-badge wf-b-${tone}`} title={title}>{icon&&<WfGlyph name={icon} size={11}/>}{children}</span>;
}
