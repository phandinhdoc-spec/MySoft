import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
const runtimes:DesktopRuntime[]=[];const homes:string[]=[];
afterEach(()=>{for(const r of runtimes.splice(0))r.dispose();for(const p of homes.splice(0))fs.rmSync(p,{recursive:true,force:true});});
it('routes typed GitHub RPCs, wraps validation errors',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-github-rpc-'));homes.push(home);const events:unknown[]=[];const runtime=new DesktopRuntime(e=>events.push(e),home);runtimes.push(runtime);vi.spyOn(runtime.license,'activated').mockReturnValue(true);
 const dispatch=(method:string,params:Record<string,unknown>={})=>runtime.dispatch({id:'test',method,params});
 expect(await dispatch('githubCatalog',{version:1})).toMatchObject({ok:true,value:{version:1}});
 expect(await dispatch('githubPreview',{version:1,operationId:'not-real',values:{}})).toMatchObject({ok:false,error:{code:'invalidInput'}});
 const status=vi.spyOn(runtime.githubTool,'status').mockResolvedValue({version:1} as never);
 expect(await dispatch('githubStatus',{projectId:'x'})).toEqual({ok:true,value:{version:1}});expect(status).toHaveBeenCalledWith({projectId:'x'});
 vi.spyOn(runtime.githubTool,'run').mockReturnValue({runId:'run'});
 expect(await dispatch('githubRun',{version:1,previewId:'p',requestId:'r',confirmation:''})).toEqual({ok:true,value:{runId:'run'}});
 expect(await dispatch('githubCancel',{runId:'missing'})).toEqual({ok:true,value:{accepted:false}});
 expect(await dispatch('githubCancelLogin',{runId:'missing'})).toEqual({ok:true,value:{accepted:false}});
});

it('repairs a project folder and ignores other missing roots when authorizing GitHub',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-context-'));homes.push(home);const runtime=new DesktopRuntime(()=>{},home);runtimes.push(runtime);vi.spyOn(runtime.license,'activated').mockReturnValue(true);
 const missing=path.join(home,'removed');runtime.store.data.projects.push({id:'p',name:'Project',rules:'',folders:[missing],outputDir:missing});
 await runtime.dispatch({id:'repair',method:'setProjectGithubFolder',params:{projectId:'p',folder:home}});
 expect(runtime.store.data.projects[0]?.outputDir).toBe(fs.realpathSync(home));expect(runtime.store.data.projects[0]?.folders?.[0]).toBe(fs.realpathSync(home));
 vi.spyOn(runtime.githubTool as any,'execute').mockRejectedValue(Error('offline'));
 const status=await runtime.githubTool.status({projectId:'p'});expect(status.folder).toBe(fs.realpathSync(home));
});
