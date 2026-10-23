/** Subscribe before reading the snapshot; a live update always wins the race. */
export function observeWorkflowState<T>(
 subscribe:(receive:(state:T)=>void)=>Promise<()=>void>,
 snapshot:()=>Promise<T>,
 receive:(state:T)=>void,
 report:(error:unknown)=>void,
):()=>void {
 let alive=true,receivedState=false;
 let off:(()=>void)|undefined;
 void subscribe(state=>{if(alive){receivedState=true;receive(state);}}).then(async unsubscribe=>{
  if(!alive){unsubscribe();return;}
  off=unsubscribe;
  const initial=await snapshot();
  if(alive&&!receivedState)receive(initial);
 }).catch(error=>{if(alive)report(error);});
 // Closing a view only removes its subscription; it never cancels execution.
 return ()=>{alive=false;off?.();};
}
