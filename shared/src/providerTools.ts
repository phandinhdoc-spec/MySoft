import type {ToolCall} from './protocol.js';
const marker=String.raw`<\/?\s*[|｜]+\s*DSML\s*[|｜]+\s*`;
const tag=new RegExp(marker+String.raw`(function_calls|calls|invoke|parameter)\b([^>]*)>`,'gi');
const decode=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const attr=(s:string,key:string)=>new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`,'i').exec(s)?.[1];
export function parseProviderCalls(input:string):{calls:ToolCall[];invalid:boolean}{
 const calls:ToolCall[]=[];let invalid=false;
 const add=(v:any)=>{if(!v||typeof v.tool!=='string'||!v.args||typeof v.args!=='object'||Array.isArray(v.args))throw Error();if(calls.length<8)calls.push({tool:v.tool,args:v.args});};
 for(const m of input.matchAll(/```(?:pvta-read|office-tool)\s*\n([\s\S]*?)```/g)){
  try{const v=JSON.parse(m[1]!);for(const c of Array.isArray(v)?v:[v])add({...c,args:c.args??{}});}catch{invalid=true;}
 }
 const normalized=input.replace(tag,(raw,name,attrs)=>`<${raw.startsWith('</')?'/':''}${name.toLowerCase()}${attrs}>`);
 for(const m of normalized.matchAll(/<invoke\b([^>]*)>([\s\S]*?)<\/invoke>/gi)){
  // Only accept invokes which came from the provider markup, never arbitrary XML prose.
  if(!new RegExp(marker+'invoke\\b','i').test(input))break;
  try{
   const tool=attr(m[1]!,'name');const args:Record<string,unknown>=Object.create(null);
   for(const p of m[2]!.matchAll(/<parameter\b([^>]*)>([\s\S]*?)<\/parameter>/gi)){
    const key=attr(p[1]!,'name');if(!key||['__proto__','constructor','prototype'].includes(key))throw Error();
    const value=decode(p[2]!);args[key]=attr(p[1]!,'string')==='true'?value:JSON.parse(value);
   }
   add({tool,args});
  }catch{invalid=true;}
 }
 if(new RegExp(marker,'i').test(input)&&!calls.length)invalid=true;
 return {calls,invalid};
}
/** Hide protocol blocks, including incomplete stream chunks and historic messages. */
export function visibleModelText(input:string,partial=false):string{
 let text=input.replace(new RegExp(marker+String.raw`(?:function_calls|calls)\b[^>]*>[\s\S]*?(?:<\/\s*[|｜]+\s*DSML\s*[|｜]+\s*(?:function_calls|calls)\s*>|$)`,'gi'),'');
 const start=text.search(new RegExp(marker,'i'));if(start>=0)text=text.slice(0,start);
 text=text.replace(/```(?:pvta-(?:read|action|plan|calc)|office-tool)[^\n]*\n[\s\S]*?(?:```|$)/g,'');
 if(partial){
  const angle=text.lastIndexOf('<');if(angle>=0&&!text.slice(angle).includes('>'))text=text.slice(0,angle);
  const fence=text.lastIndexOf('`');if(fence>=0){const open=text.lastIndexOf('```');if(open>=0&&!text.slice(open).includes('\n'))text=text.slice(0,open);else if(/`{1,2}$/.test(text))text=text.replace(/`{1,2}$/,'');}
 }
 return text;
}
