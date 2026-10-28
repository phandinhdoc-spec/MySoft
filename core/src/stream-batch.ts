/** Batch deltas before parsing visible text and sending IPC, preserving exact Unicode. */
export function streamBatch(emit:(text:string)=>void,signal:AbortSignal,delayMs=75){
 let chunks:string[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
 const flush=()=>{
  if(timer)clearTimeout(timer);timer=undefined;
  const text=chunks.join('');chunks=[];
  if(text&&!signal.aborted)emit(text);
 };
 return {push(text:string){if(signal.aborted)return;chunks.push(text);timer??=setTimeout(flush,delayMs);},flush};
}
