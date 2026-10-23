import {randomUUID} from 'node:crypto';
import {progressText,toolTitle,type AiProgressEntry} from '@pvta/shared';
import {safeJson} from './backends/types.js';

/** Extract only tool events. Reasoning/thinking blocks are deliberately not read. */
export function toolProgressParser(backend:string,emit:(entry:AiProgressEntry)=>void){
 const prefix=randomUUID(),entries=new Map<string,AiProgressEntry>();
 const update=(id:string,name:string,state:AiProgressEntry['state'],input?:unknown,output?:unknown,detail?:string)=>{
  const old=entries.get(id),at=Date.now();
  if(old&&old.state!=='running'&&state==='running')return;
  const entry:AiProgressEntry={...old,id:`${prefix}:${id}`,kind:'tool',title:old?.title??toolTitle(name),state,at:old?.at??at,...(state!=='running'?{endedAt:at}:{}),detail:progressText(detail)??old?.detail,input:progressText(input)??old?.input,output:progressText(output)??old?.output};
  entries.set(id,entry);
  if(entries.size>256){const completed=[...entries].find(([,value])=>value.state!=='running');if(completed)entries.delete(completed[0]);}
  emit(entry);
 };
 const inputSummary=(value:any)=>{
  if(!value||typeof value!=='object')return undefined;
  return value.command??value.file_path??value.path??value.pattern??value.query??value.description;
 };
 return (line:string)=>{
  const event=safeJson(line);if(!event)return;
  if(backend==='claude'){
   if(event.type==='stream_event'&&event.event?.type==='content_block_start'){
    const block=event.event.content_block;
    if(block?.type==='tool_use'&&typeof block.id==='string'&&typeof block.name==='string')update(block.id,block.name,'running',inputSummary(block.input));
   }
   if(event.type==='assistant'&&Array.isArray(event.message?.content))for(const block of event.message.content){
    if(block?.type==='tool_use'&&typeof block.id==='string'&&typeof block.name==='string')update(block.id,block.name,'running',inputSummary(block.input));
   }
   if(event.type==='user'&&Array.isArray(event.message?.content))for(const block of event.message.content){
    if(block?.type!=='tool_result'||typeof block.tool_use_id!=='string')continue;
    const old=entries.get(block.tool_use_id);if(!old)continue;
    const output=typeof block.content==='string'?block.content:Array.isArray(block.content)?block.content.filter((part:any)=>part?.type==='text'&&typeof part.text==='string').map((part:any)=>part.text).join('\n'):undefined;
    update(block.tool_use_id,'',block.is_error?'error':'done',undefined,output);
   }
  }else if(backend==='codex'&&['item.started','item.updated','item.completed'].includes(event.type)){
   const item=event.item;if(!item||typeof item.id!=='string')return;
   const state=event.type==='item.completed'?(['failed','declined','cancelled'].includes(item.status)||(typeof item.exit_code==='number'&&item.exit_code!==0)?'error':'done'):'running';
   if(item.type==='command_execution')update(item.id,'Bash',state,item.command,item.aggregated_output);
   else if(item.type==='file_change')update(item.id,'Edit',state,undefined,Array.isArray(item.changes)?item.changes.map((change:any)=>`${change.kind??'update'}: ${change.path??''}`).join('\n'):undefined);
   else if(item.type==='web_search')update(item.id,'office_web_search',state,item.query);
   else if(item.type==='mcp_tool_call')update(item.id,String(item.tool??'MCP'),item.error?'error':state,undefined,undefined,String(item.server??''));
  }
 };
}
