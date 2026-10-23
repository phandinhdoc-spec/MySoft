import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {Engine} from '../src/engine';
import {Refiner} from '../src/desktop/refine/refiner';
import {readManifest,writeManifest} from '../src/desktop/refine/files';
import {defaultRefineSettings} from '../src/desktop/refine/settings';
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.forEach(r=>r.dispose());runtimes.length=0;roots.forEach(p=>fs.rmSync(p,{recursive:true,force:true}));roots.length=0;vi.restoreAllMocks();});
function setup(home?:string){if(!home){home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-refine-runtime-'));roots.push(home);}const r=new DesktopRuntime(()=>{},home);r.scheduler=vi.fn(async()=>{});runtimes.push(r);return r;}
function miss(r:DesktopRuntime){const m=readManifest(r.store.home);m.schedule!.nextAt=new Date(2026,0,1,22,30).getTime();writeManifest(r.store.home,m);}
it('restores a missed schedule and opt-out without calling AI on startup',async()=>{
 const r=setup();r.store.data.preferences.refine={...defaultRefineSettings(),autoCatchUp:false};r.store.save();miss(r);
 const spy=vi.spyOn(Refiner.prototype,'run');r.dispose();const reopened=setup(r.store.home);await reopened.syncRefine();
 expect(reopened.view().refine.missedAt).toBeDefined();expect(spy).not.toHaveBeenCalled();
 expect(reopened.view().refine.settings.autoCatchUp).toBe(false);
});
it('auto catch-up starts once on startup only when enabled',async()=>{
 const r=setup();r.store.data.preferences.refine={...defaultRefineSettings(),autoCatchUp:true};r.store.save();miss(r);
 const run=vi.spyOn(Refiner.prototype,'run').mockResolvedValue({state:'done',updated:0,unchanged:0,failed:0,remaining:0});
 await r.syncRefine();await r.syncRefine();expect(run).toHaveBeenCalledTimes(1);expect(run.mock.calls[0]![0]).toMatchObject({force:true,catchUp:true});
 const off=setup();off.store.data.preferences.refine={...defaultRefineSettings(),enabled:false,autoCatchUp:true};off.store.save();miss(off);await off.syncRefine();expect(run).toHaveBeenCalledTimes(1);
});
it('manual and catch-up RPCs reject overlap and surface progress and completion with the selected model',async()=>{
 const r=setup();r.store.data.preferences.refine={...defaultRefineSettings(),enabled:false,model:{backend:'claude',model:'sonnet'}};
 r.store.data.learned.push({id:'r',rule:'Dùng chữ đen',source:'test',at:1,status:'proposed'});r.store.save();
 const schedule=readManifest(r.store.home).schedule;
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const engine=vi.spyOn(Engine.prototype,'run').mockImplementation(async()=>{await gate;return {text:JSON.stringify({items:[{id:'r',rule:'Dùng chữ đen.',duplicateOf:null}]})} as any;});
 const first=r.dispatch({id:'first',method:'runRefineNow'});
 await vi.waitFor(()=>expect(engine).toHaveBeenCalled());
 expect(r.view().refine).toMatchObject({running:true,progress:{completed:0,total:1}});
 await expect(r.dispatch({id:'second',method:'runRefineNow'})).rejects.toThrow('Đang tổng hợp');
 await expect(r.dispatch({id:'third',method:'catchUpRefine'})).rejects.toThrow('Đang tổng hợp');
 release();await first;
 expect(engine.mock.calls[0]![0]).toMatchObject({backend:'claude',model:'sonnet',permission:'read'});
 expect(r.view().refine).toMatchObject({running:false,last:{state:'done',updated:1}});
 expect(readManifest(r.store.home).schedule).toEqual(schedule);expect(r.store.data.preferences.refine.enabled).toBe(false);
});
it('exposes model errors and keeps the missed slot available for retry',async()=>{
 const r=setup();r.store.data.preferences.refine={...defaultRefineSettings(),model:{backend:'claude',model:'sonnet'}};
 r.store.data.learned.push({id:'r',rule:'Dùng chữ đen',source:'test',at:1,status:'proposed'});r.store.save();miss(r);
 vi.spyOn(Engine.prototype,'run').mockRejectedValue(Error('Mất mạng thử nghiệm'));
 await r.dispatch({id:'run',method:'catchUpRefine'});
 expect(r.view().refine).toMatchObject({running:false,last:{state:'no-model',message:'Mất mạng thử nghiệm'}});expect(r.view().refine.missedAt).toBeDefined();
});
