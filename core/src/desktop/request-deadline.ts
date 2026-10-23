/** Settle promptly even when a provider ignores cancellation. Late results are discarded. */
export function abortable<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason instanceof Error?signal.reason:new Error('Đã dừng yêu cầu.'));
  if(signal.aborted){abort();return;}
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{if(signal.aborted)throw signal.reason;return work();}).then(value=>{if(signal.aborted)abort();else resolve(value);},reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
