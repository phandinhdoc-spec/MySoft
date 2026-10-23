import fs from 'node:fs';
import path from 'node:path';
import {pidAlive} from './refine/locks.js';

/** Only the daemon host may hold the writable snapshot; clients share its runtime. */
export function foregroundLock(home:string):()=>void {
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  const file=path.join(home,'foreground.lock');
  for(let attempt=0;attempt<2;attempt++){
    try{
      fs.writeFileSync(file,String(process.pid),{flag:'wx',mode:0o600});
      return ()=>{try{if(fs.readFileSync(file,'utf8')===String(process.pid))fs.unlinkSync(file);}catch{}};
    }catch(e){
      if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
      const recorded=fs.readFileSync(file,'utf8');
      // An empty/invalid lock may belong to a writer between open and write.
      if(!/^\d+$/.test(recorded)||pidAlive(Number(recorded)))throw Error('PVTA Desktop hoặc CLI đang dùng kho dữ liệu này. Đóng phiên đó trước.');
      fs.unlinkSync(file);
    }
  }
  throw Error('Không lấy được khóa kho dữ liệu PVTA.');
}
