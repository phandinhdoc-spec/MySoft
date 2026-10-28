/** One shared provider budget per Engine. Running work finishes; user work goes next. */
export class ProviderQueue {
 private active=false;
 private pending:Array<{background:boolean;start():void;cancel():void}>=[];

 run<T>(work:()=>Promise<T>,signal?:AbortSignal,background=false):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
   const abort=()=>signal?.reason??new Error('Đã hủy.');
   if(signal?.aborted){reject(abort());return;}
   const entry={background,start:()=>{
    signal?.removeEventListener('abort',entry.cancel);
    this.active=true;
    Promise.resolve().then(()=>{if(signal?.aborted)throw abort();return work();})
     .then(resolve,reject).finally(()=>{this.active=false;this.drain();});
   },cancel:()=>{
    const i=this.pending.indexOf(entry);if(i>=0)this.pending.splice(i,1);
    signal?.removeEventListener('abort',entry.cancel);reject(abort());
   }};
   signal?.addEventListener('abort',entry.cancel,{once:true});
   this.pending.push(entry);this.drain();
  });
 }
 private drain(){
  if(this.active||!this.pending.length)return;
  const foreground=this.pending.findIndex(x=>!x.background);
  this.pending.splice(foreground<0?0:foreground,1)[0]!.start();
 }
}
