import React from 'react';
const paths:Record<string,React.ReactNode>={
 chat:<><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></>,
 project:<><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2"/></>,
 skills:<><path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="M8 12h8m-4-4v8"/></>,
 tools:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
 settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 attach:<path d="m8 12 6-6a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3m-7 13a2 2 0 0 0 3 3L19 9"/>,
 send:<path d="M12 20V4m-7 7 7-7 7 7"/>,
 stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
 file:<><path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/></>,
 search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
 arrow:<path d="M5 19 19 5M7 5h12v12"/>,
 exam:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m9 9 2 2 4-4"/><path d="M9 15h6"/></>,
 shuffle:<><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></>,
 diff:<><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><path d="M6 9h2M6 13h2M16 9h2M16 13h2"/></>,
 grade:<><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></>,
 slides:<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m10 8 5 2.5-5 2.5V8Z"/></>,
 palette:<><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-9.6-10-9.6Z"/></>
};
export function Icon({name, size = 20}:{name:string; size?: number}){return <span className="studio-glyph" aria-hidden="true"><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{paths[name]??paths.project}</svg></span>;}
