import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Draft} from '../src/files.js';
import {render,themes,width,safe} from '../src/display.js';
import {Session} from '../src/session.js';
import {foregroundLock} from '../../core/src/desktop/foreground-lock.js';
import {editorArgs} from '../src/external.js';
import {runScript} from '../src/process.js';
import type {ViewState} from '../../core/src/desktop/types.js';
const dirs:string[]=[];
async function temp(){const d=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-cli-test-'));dirs.push(d);return d;}
afterEach(async()=>{for(const d of dirs.splice(0))await fs.rm(d,{recursive:true,force:true});});
describe('terminal',()=>{
  it('all five themes fit wide and narrow terminals, including Vietnamese and emoji',()=>{
    for(const theme of Object.keys(themes) as (keyof typeof themes)[])for(const cols of [40,120]){
      const text=render({theme,mode:'markdown',title:'Giáo án 📚',access:'ask',left:'ế 👩‍🏫 '.repeat(400),right:'# Nội dung\nĐọc sách',input:'Xin chào',status:'Sẵn sàng',offset:0,focus:0},cols,24,false);
      expect(text.split('\r\n')).toHaveLength(24);expect(text.split('\r\n').every(l=>width(l)<=cols-1)).toBe(true);
    }
  });
  it('untrusted model output cannot inject terminal control sequences',()=>{
    expect(safe('\x1b[2Jhello\x1b]52;c;AAAA\x07\u202eevil')).toBe('helloevil');
  });
});
describe('Markdown editing',()=>{
  it('stages, saves and undoes without overwriting a concurrent edit',async()=>{
    const root=await temp(),file=path.join(root,'lesson.md');await fs.writeFile(file,'# Cũ\nDòng hai');const d=new Draft(root);await d.load(file);d.replace(1,'# Mới');
    expect(await fs.readFile(file,'utf8')).toContain('# Cũ');expect(d.diff()).toContain('-1 # Cũ');await d.save();expect(await fs.readFile(file,'utf8')).toContain('# Mới');
    await d.undo();expect(await fs.readFile(file,'utf8')).toContain('# Cũ');
    d.replace(1,'# Ba');await fs.writeFile(file,'Bên ngoài');await expect(d.save()).rejects.toThrow('đổi bên ngoài');expect(await fs.readFile(file,'utf8')).toBe('Bên ngoài');
  });
  it('rejects symlinks outside the workspace and stale undo',async()=>{
    const root=await temp(),out=await temp();await fs.writeFile(path.join(out,'x.md'),'outside');await fs.symlink(path.join(out,'x.md'),path.join(root,'link.md'));
    const d=new Draft(root);await expect(d.load('link.md')).rejects.toThrow('ngoài');
    await fs.writeFile(path.join(root,'x.md'),'one');await d.load('x.md');d.replace(1,'two');await d.save();await fs.writeFile(d.file,'external');await expect(d.undo()).rejects.toThrow('đổi bên ngoài');
  });
});
describe('runtime integration contract',()=>{
  async function setup(){
    const root=await temp();const dispatch=vi.fn(async()=>true);const s=new Session({dispatch},root,path.join(root,'settings.json'),()=>{});
    s.chatId='chat';s.view={data:{preferences:{access:'ask'},chats:[{id:'chat',title:'Test',messages:[{id:'m',role:'assistant',text:'OK',at:0,actions:[{id:'a',kind:'write_text',path:'out.md',state:'pending'}],plan:{id:'p',revision:3,steps:[]}}]}]},skills:[]} as unknown as ViewState;return {s,dispatch,root};
  }
  it('Plan Pro maps to the actual planning RPC and revision is preserved on run',async()=>{
    const {s,dispatch}=await setup();s.mode='pro';await s.command('Lập kế hoạch');expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({method:'send',params:{chatId:'chat',text:'Lập kế hoạch',planningMode:'pro'}}));
    await s.command('/run p');expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({method:'runPlan',params:{id:'p',revision:3}}));
    await s.command('/recovery p s1');expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({method:'inspectPlanRecovery',params:{id:'p',stepId:'s1'}}));
  });
  it('approvals are explicit, scoped to this chat, and read-only blocks local writes',async()=>{
    const {s,dispatch,root}=await setup();await s.command('/approve other');expect(dispatch).not.toHaveBeenCalled();
    await s.command('/approve a');expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({method:'approveAction',params:{id:'a'}}));
    s.view!.data.preferences.access='read';await fs.writeFile(path.join(root,'x.md'),'original');await s.command('/edit x.md');await s.command('/replace 1 changed');await s.command('/save');expect(await fs.readFile(path.join(root,'x.md'),'utf8')).toBe('original');
  });
  it('stop stays available during an in-flight request; a second send is rejected',async()=>{
    const {s,dispatch}=await setup();let finish!:(v:unknown)=>void;
    dispatch.mockImplementation(async req=>req.method==='send'?new Promise(resolve=>{finish=resolve;}):true);
    const pending=s.command('hello');await Promise.resolve();await s.command('second');expect(dispatch.mock.calls.filter(([r])=>r.method==='send')).toHaveLength(1);
    await s.command('/stop');expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({method:'cancel',params:{chatId:'chat'}}));finish(true);await pending;expect(s.busy).toBe(false);
  });
  it('persists a selected theme',async()=>{const {s,root}=await setup();await s.command('/theme trang-vo');expect(JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8')).theme).toBe('trang-vo');});
});
it('foreground lock prevents two frontends writing the same data',async()=>{
  const root=await temp();const release=foregroundLock(root);expect(()=>foregroundLock(root)).toThrow('đang dùng');release();foregroundLock(root)();
});
it('editor arguments preserve quoted paths without interpreting shell syntax',()=>{
  expect(editorArgs('"/path with spaces/editor" --wait')).toEqual(['/path with spaces/editor','--wait']);
  expect(editorArgs('vim $(touch /tmp/no)')).toEqual(['vim','$(touch','/tmp/no)']);
  expect(()=>editorArgs('"unfinished')).toThrow('chưa đóng');
});
it('runs actual package scripts and cancels their child process group',async()=>{
  const root=await temp();await fs.writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{ok:'node -e "console.log(42)"',wait:'node wait.cjs'}}));
  await fs.writeFile(path.join(root,'wait.cjs'),'setInterval(()=>{}, 1000);');
  expect(await runScript('ok',root,new AbortController().signal)).toContain('42');
  const ctl=new AbortController();const result=runScript('wait',root,ctl.signal);const assertion=expect(result).rejects.toThrow('Đã dừng');setTimeout(()=>ctl.abort(),200);await assertion;
});
