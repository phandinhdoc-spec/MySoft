import {EventEmitter} from 'node:events';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({spawn:vi.fn(),execFile:vi.fn(),unref:vi.fn()}));
vi.mock('node:child_process',()=>mocks);
import {openTerminal} from '../src/desktop/terminal';
function child(error?:string){
 const process=Object.assign(new EventEmitter(),{unref:mocks.unref});
 queueMicrotask(()=>error?process.emit('error',Object.assign(new Error(error),{code:error})):process.emit('spawn'));
 return process;
}
beforeEach(()=>{vi.resetAllMocks();mocks.spawn.mockImplementation(()=>child());});
it('opens macOS Terminal and reports launch failure',async()=>{
 mocks.execFile.mockImplementation((_bin,_args,_opts,cb)=>cb(null));
 await openTerminal('darwin');
 expect(mocks.execFile).toHaveBeenCalledWith('/usr/bin/open',['-a','Terminal'],expect.any(Object),expect.any(Function));
 mocks.execFile.mockImplementation((_bin,_args,_opts,cb)=>cb(new Error('failed')));
 await expect(openTerminal('darwin')).rejects.toThrow('Không mở được Terminal');
});
it('opens a visible, detached PowerShell without passing a command',async()=>{
 await openTerminal('win32');
 expect(mocks.spawn).toHaveBeenCalledWith('powershell.exe',['-NoExit'],expect.objectContaining({detached:true,windowsHide:false,stdio:'ignore'}));
 expect(mocks.unref).toHaveBeenCalledOnce();
});
it('falls back on Linux when the default terminal is missing',async()=>{
 mocks.spawn.mockImplementationOnce(()=>child('ENOENT'));
 await openTerminal('linux');
 expect(mocks.spawn.mock.calls.map(call=>call[0])).toEqual(['x-terminal-emulator','gnome-terminal']);
});
it('reports missing terminals and permission failures',async()=>{
 mocks.spawn.mockImplementation(()=>child('ENOENT'));
 await expect(openTerminal('linux')).rejects.toThrow('Không tìm thấy ứng dụng terminal');
 await expect(openTerminal('win32')).rejects.toThrow('Không tìm thấy PowerShell');
 mocks.spawn.mockClear().mockImplementation(()=>child('EACCES'));
 await expect(openTerminal('linux')).rejects.toThrow('quyền chạy');
 expect(mocks.spawn).toHaveBeenCalledOnce();
});
it('rejects unsupported platforms without spawning',async()=>{
 await expect(openTerminal('freebsd')).rejects.toThrow('chưa hỗ trợ');
 expect(mocks.spawn).not.toHaveBeenCalled();
});
