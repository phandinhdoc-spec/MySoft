import {fold} from '../hints.js';
import type {DiscoveryProfile,DiscoverySource} from './types.js';
export function cleanProfile(raw:unknown):DiscoveryProfile {
 const r=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const text=(key:string,max=160)=>typeof r[key]==='string'?(r[key] as string).trim().slice(0,max):'';
 return {province:text('province'),locality:text('locality'),school:text('school'),level:text('level'),subjects:text('subjects'),keywords:text('keywords',300)};
}
/** Only public institutional URLs can become automatically followed sources. */
export function sourceUrl(raw:string):string {
 const u=new URL(raw.trim());
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!/(^|\.)(gov|edu)\.vn$/.test(u.hostname))throw Error('Nguồn theo dõi cần là link HTTPS của cơ quan nhà nước (.gov.vn) hoặc giáo dục (.edu.vn).');
 u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^fbclid$/.test(key))u.searchParams.delete(key);
 return u.href;
}
export function suggestedSources(profile:DiscoveryProfile):DiscoverySource[] {
 const base:DiscoverySource[]=[{id:'moet',name:'Bộ Giáo dục và Đào tạo',url:'https://moet.gov.vn/van-ban/Pages/default.aspx',enabled:true,groups:[],kind:'page'}];
 if(/ho chi minh|tphcm|tp hcm|sai gon/.test(fold(profile.province)))base.unshift({id:'hcm-edu',name:'Sở GDĐT TP. Hồ Chí Minh',url:'https://hcm.edu.vn/',enabled:true,groups:[],kind:'page'});
 return base;
}
export function trackingSources(profile:DiscoveryProfile,saved:DiscoverySource[]=[]):DiscoverySource[] {
 const sources=new Map(suggestedSources(profile).map(s=>[s.url,s]));for(const s of saved){if(s.id==='hcm-edu'&&!sources.has('https://hcm.edu.vn/'))continue;sources.set(s.url,s);}return [...sources.values()];
}
