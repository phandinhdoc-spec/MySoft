import {spawn} from 'node:child_process';

/** Kill the process group on POSIX so npm's child runner does not outlive /stop. */
export function runScript(script:string,cwd:string,signal:AbortSignal):Promise<string>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(Error('Đã dừng.'));return;}
    const child=spawn('npm',['run',script],{cwd,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    let output='',failure='',finished=false;
    const kill=()=>{
      if(!child.pid)return;
      try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{}
    };
    const stop=()=>{failure='Đã dừng tác vụ.';kill();};
    const timer=setTimeout(()=>{failure='Tác vụ quá thời gian (5 phút).';kill();},300_000);
    const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',stop);error?reject(error):resolve(`${script}: ĐẠT\n${output}`);};
    const collect=(data:Buffer)=>{if(output.length<3_000_000)output+=data.toString();else if(!failure){failure='Đầu ra vượt giới hạn 3 MB.';kill();}};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.on('error',e=>finish(e));child.on('close',(code,sig)=>finish(failure||code!==0?Error(`${script}: LỖI\n${output}\n${failure||`Mã thoát ${code}, tín hiệu ${sig??'không'}`}`):undefined));
    signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
  });
}
