// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
const native=vi.hoisted(()=>({setTheme:vi.fn()}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>native}));
import {syncNativeTheme} from '../src/native-appearance';
afterEach(()=>{vi.unstubAllGlobals();native.setTheme.mockReset();});
it('updates the native title bar, supports system mode and has the required narrow permission',async()=>{
 vi.stubGlobal('__TAURI_INTERNALS__',{});native.setTheme.mockResolvedValue(undefined);
 await syncNativeTheme('dark');await syncNativeTheme('light');await syncNativeTheme(null);
 expect(native.setTheme.mock.calls).toEqual([['dark'],['light'],[null]]);
 const capability=JSON.parse(fs.readFileSync('chatbox/src-tauri/capabilities/main.json','utf8'));
 expect(capability.permissions).toContain('core:window:allow-set-theme');expect(capability.windows).toContain('workflow-*');
});
it('serializes rapid updates and recovers after an unsuccessful call',async()=>{
 vi.stubGlobal('__TAURI_INTERNALS__',{});let finish!:()=>void;
 native.setTheme.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;})).mockResolvedValue(undefined);
 const first=syncNativeTheme('dark'),second=syncNativeTheme('light');await vi.waitFor(()=>expect(native.setTheme).toHaveBeenCalledOnce());finish();await Promise.all([first,second]);expect(native.setTheme.mock.calls).toEqual([['dark'],['light']]);
 native.setTheme.mockRejectedValueOnce(Error('failed'));await expect(syncNativeTheme('dark')).rejects.toThrow('failed');await syncNativeTheme(null);expect(native.setTheme).toHaveBeenLastCalledWith(null);
});
it('does not call native IPC in browser previews',async()=>{await syncNativeTheme('dark');expect(native.setTheme).not.toHaveBeenCalled();});
