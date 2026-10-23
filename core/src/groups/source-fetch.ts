import dns from 'node:dns/promises';
import {isPrivateIp,type Fetcher,type Resolver} from '../refs.js';
import {sourceUrl} from './profile.js';
/** Bounded public fetch, revalidate every redirect; no local network or executable content. */
export async function fetchSource(url:string,fetcher:Fetcher=fetch,resolve:Resolver=async host=>(await dns.lookup(host,{all:true})).map(x=>x.address)):Promise<string>{
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
 try{
  for(let hop=0;hop<4;hop++){
   url=sourceUrl(url);const ips=await resolve(new URL(url).hostname);
   if(!ips.length||ips.some(isPrivateIp))throw Error('Nguồn trỏ về mạng nội bộ.');
   const r=await fetcher(url,{signal:ctl.signal,redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (PVTA)','accept':'text/html,application/rss+xml,application/atom+xml'}});
   if(r.status>=300&&r.status<400){const loc=r.headers.get('location');if(!loc)throw Error('Chuyển hướng không hợp lệ.');url=new URL(loc,url).href;continue;}
   if(!r.ok)throw Error(`HTTP ${r.status}`);
   if(Number(r.headers.get('content-length')??0)>1_000_000)throw Error('Nguồn quá lớn.');
   const reader=r.body?.getReader();if(!reader)return '';
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();throw Error('Nguồn quá lớn.');}chunks.push(value);}
   return Buffer.concat(chunks).toString('utf8');
  }
  throw Error('Quá nhiều chuyển hướng.');
 }finally{clearTimeout(timer);}
}
