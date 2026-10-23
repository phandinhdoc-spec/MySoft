import en from './en.json';
export function chatLanguage():'vi'|'en'{try{return localStorage.getItem('pvta.chat.language')==='en'?'en':'vi';}catch{return 'vi';}}
/** Only UI-owned strings are localized; never translate document or conversation content. */
export function t(value:string,params?:unknown[]):string{const text=chatLanguage()==='en'?(en as Record<string,string>)[value]??value:value;return params?text.replace(/\{(\d+)\}/g,(match,index)=>Number(index)<params.length?String(params[Number(index)]):match):text;}
