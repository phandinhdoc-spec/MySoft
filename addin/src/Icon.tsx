import React from 'react';
const iconTones:Record<string,string>={chat:'teal',project:'amber',folder:'amber','folder-add':'amber',notebook:'green',workflow:'violet',spark:'rose',settings:'blue',office:'blue',file:'blue',skills:'violet',eye:'blue',mouth:'rose',pen:'amber',stop:'rose',close:'rose',brain:'violet',scale:'amber',palette:'violet',tools:'blue',exam:'teal',grade:'green',slides:'amber',diff:'blue'};
const tones=['blue','violet','green','amber','rose','teal'];
const paths:Record<string,React.ReactNode>={
 calculator:<><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 6h10M7 11h2m6 0h2M7 15h2m6 0h2M7 19h2m6 0h2"/></>,
 brain:<><path d="M12 4c-4-5-9 0-7 4-5 2-3 8 0 8-1 5 5 7 7 3 2 4 8 2 7-3 3 0 5-6 0-8 2-4-3-9-7-4Zm0 0v15M5 8l3 2m11-2-3 2M5 16l3-2m11 2-3-2"/></>,
 scale:<><path d="M12 3v18M5 21h14M4 7h16M5 7l-4 8h8L5 7Zm14 0-4 8h8l-4-8Z"/></>,
 flag:<><path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5" fill="currentColor" fillOpacity=".9"/></>,
 pin:<><path d="m16 3 5 5-4 2-3 5-2 1-4-4 1-2 5-3 2-4ZM8 16l-5 5"/></>,
 gear:<><path d="M20.96 11.12 L20.96 12.88 L18.79 14.06 L18.26 15.35 L18.96 17.71 L17.71 18.96 L15.35 18.26 L14.06 18.79 L12.88 20.96 L11.12 20.96 L9.94 18.79 L8.65 18.26 L6.29 18.96 L5.04 17.71 L5.74 15.35 L5.21 14.06 L3.04 12.88 L3.04 11.12 L5.21 9.94 L5.74 8.65 L5.04 6.29 L6.29 5.04 L8.65 5.74 L9.94 5.21 L11.12 3.04 L12.88 3.04 L14.06 5.21 L15.35 5.74 L17.71 5.04 L18.96 6.29 L18.26 8.65 L18.79 9.94Z"/><circle cx="12" cy="12" r="3"/></>,
 terminal:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 8 4 4-4 4m6 0h4"/></>,
 chat:<><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></>,
 history:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
 project:<><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2"/></>,
 office:<><rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
 notebook:<><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h6M9 11h4"/></>,
 groups:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
 activity:<><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
 skills:<><path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="M8 12h8m-4-4v8"/></>,
 tools:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
 settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></>,
 workflow:<><rect x="2.5" y="4" width="6" height="6" rx="1.5"/><rect x="15.5" y="14" width="6" height="6" rx="1.5"/><path d="M8.5 7H12v10h3.5"/></>,
 eye:<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
 mouth:<><path d="M2.5 12c2.8-3.6 5.4-4.6 9.5-2.6 4.1-2 6.7-1 9.5 2.6-2.8 4.6-5.7 6-9.5 6s-6.7-1.4-9.5-6Z"/><path d="M2.5 12h19"/></>,
 pen:<><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"/><path d="m14.5 6.5 3 3"/></>,
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
 palette:<><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-9.6-10-9.6Z"/></>,
 'folder-add':<><path d="M3 7h7l2 2h9v11H3V7Z"/><path d="M12 12v5m-2.5-2.5h5"/></>,
 folder:<path d="M3 7h7l2 2h9v11H3V7Z"/>,
 math:<><path d="M4 20 11 4l9 16H4Z"/><path d="M8.5 14.5h7"/></>,
 help:<><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M10.6 8.6a1.9 1.9 0 0 1 3.6.7c0 1.4-1.9 1.6-1.9 3m0 2.5v.01"/></>,
 more:<><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
 download:<><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
 copy:<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
};
export function Icon({name, size = 18, inheritColor = false}:{name:string; size?: number; inheritColor?: boolean}){
 const tone=inheritColor?undefined:iconTones[name]??tones[Array.from(name).reduce((sum,c)=>sum+c.charCodeAt(0),0)%tones.length];
 return <span className="icon studio-glyph" data-icon-tone={tone} aria-hidden="true"><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{paths[name]??paths.project}</svg></span>;
}
