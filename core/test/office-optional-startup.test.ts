import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect,it,vi} from 'vitest';
import {DesktopRuntime} from '../src/desktop/runtime';
import {OfficeLive} from '../src/desktop/office-live';

it('initializes and creates chats without Office assets or starting the add-in',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-no-office-'));
 vi.stubEnv('PVTA_RESULT_DIR',path.join(home,'output'));
 vi.stubEnv('PVTA_OFFICE_ADDIN',path.join(home,'missing-addin'));
 const start=vi.spyOn(OfficeLive.prototype,'start').mockRejectedValue(Error('Office unavailable'));
 const install=vi.spyOn(OfficeLive.prototype,'installMac').mockRejectedValue(Error('Office unavailable'));
 const trust=vi.spyOn(OfficeLive.prototype,'trustMac').mockRejectedValue(Error('Office unavailable'));
 let runtime:DesktopRuntime|undefined;
 try{
  runtime=new DesktopRuntime(()=>{},home);
  vi.spyOn(runtime,'refresh').mockResolvedValue(undefined);
  vi.spyOn(runtime.license,'refresh').mockResolvedValue(undefined);
  vi.spyOn(runtime.groups,'scheduleDiscovery').mockImplementation(()=>{});
  const request=(method:string)=>runtime!.dispatch({id:crypto.randomUUID(),method,params:{}});
  for(const _ of [1,2]){
   const state=await request('init') as ReturnType<DesktopRuntime['view']>;
   expect(state.office).toMatchObject({running:false,sessions:[]});
   await expect(request('newChat')).resolves.toBeTruthy();
  }
  expect(start).not.toHaveBeenCalled();expect(install).not.toHaveBeenCalled();expect(trust).not.toHaveBeenCalled();
  await expect(request('officeStart')).rejects.toThrow('Office unavailable');
  expect(start).toHaveBeenCalledOnce();
  await expect(request('newChat')).resolves.toBeTruthy();
 }finally{runtime?.dispose();vi.restoreAllMocks();vi.unstubAllEnvs();fs.rmSync(home,{recursive:true,force:true});}
});
