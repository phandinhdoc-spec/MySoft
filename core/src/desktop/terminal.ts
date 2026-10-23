import {execFile,spawn} from 'node:child_process';
import {homedir} from 'node:os';

/** Open an interactive terminal without executing user-provided commands. */
export async function openTerminal(platform:NodeJS.Platform=process.platform):Promise<void>{
 if(platform==='darwin'){
  await new Promise<void>((resolve,reject)=>{
   execFile('/usr/bin/open',['-a','Terminal'],{timeout:10_000},error=>error?reject(Error('Không mở được Terminal trên macOS.')):resolve());
  });
  return;
 }
 const candidates=platform==='win32'?['powershell.exe']:platform==='linux'
  ?['x-terminal-emulator','gnome-terminal','konsole','xfce4-terminal','mate-terminal','kitty','alacritty','xterm']:[];
 if(!candidates.length)throw Error('Hệ điều hành này chưa hỗ trợ mở terminal.');
 for(const bin of candidates){
  try{
   const child=spawn(bin,platform==='win32'?['-NoExit']:[],{cwd:homedir(),detached:true,stdio:'ignore',windowsHide:false});
   await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
   child.unref();
   return;
  }catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT')continue;
   throw Error(`Không mở được ${platform==='win32'?'PowerShell':'Terminal'}. Hãy kiểm tra quyền chạy ứng dụng.`);
  }
 }
 throw Error(platform==='win32'?'Không tìm thấy PowerShell trên máy.':'Không tìm thấy ứng dụng terminal. Hãy cài GNOME Terminal, Konsole hoặc xterm.');
}
