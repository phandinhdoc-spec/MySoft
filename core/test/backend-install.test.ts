import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {downloadBackendInstaller,installerCommand,installerInfo,trustedInstallerUrl} from '../src/desktop/backend-install';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>fs.rm(d,{recursive:true,force:true})));});
async function home(){const d=await fs.mkdtemp(path.join(os.tmpdir(),'pvta-install-test-'));dirs.push(d);return d;}
describe('official backend installers',()=>{
 it('uses platform-native official scripts without npm',()=>{
  for(const id of ['claude','codex','agy']){
   expect(installerInfo(id,'win32').url).toMatch(/\.ps1$/);
   expect(installerInfo(id,'darwin').url).toMatch(/\.sh$/);
   expect(installerInfo(id,'linux').url).toMatch(/\.sh$/);
  }
  expect(()=>installerInfo('arbitrary','linux')).toThrow();
  expect(()=>installerInfo('__proto__','linux')).toThrow();
  expect(()=>installerInfo('codex','freebsd')).toThrow();
 });
 it('downloads original bytes and records source, without executing anything',async()=>{
  const dir=await home();const source='#!/bin/sh\necho installer\n';
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(source,{headers:{'content-type':'text/plain'}}));
  const result=await downloadBackendInstaller('codex',dir,'darwin',fetcher);
  expect(await fs.readFile(result.file,'utf8')).toBe(source);
  expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.parse(await fs.readFile(path.join(path.dirname(result.file),'source.json'),'utf8')).url).toBe('https://chatgpt.com/codex/install.sh');
  expect(fetcher).toHaveBeenCalledWith(result.url,expect.objectContaining({redirect:'manual'}));
 });
 it('rejects an off-provider redirect before requesting it',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://evil.example/install.sh'}}));
  await expect(downloadBackendInstaller('claude',await home(),'linux',fetcher)).rejects.toThrow('chuyển hướng');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('rejects HTML, empty, oversized and failed downloads',async()=>{
  for(const response of [new Response('<html>error</html>'),new Response(''),new Response('x',{headers:{'content-length':'3000000'}}),new Response('x',{status:503})]){
   const dir=await home();await expect(downloadBackendInstaller('agy',dir,'linux',vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
   expect(await fs.readdir(dir)).toEqual([]);
  }
 });
 it('accepts only HTTPS provider hosts without credentials or custom ports',()=>{
  for(const url of ['http://claude.ai/install.sh','https://claude.ai.evil.example/install.sh','https://user@claude.ai/install.sh','https://claude.ai:444/install.sh'])expect(trustedInstallerUrl('claude',url)).toBe(false);
  expect(trustedInstallerUrl('agy','https://www.antigravity.google/cli/install.sh')).toBe(true);
 });
 it('quotes local installer paths for each shell',()=>{
  expect(installerCommand("/tmp/a'b/$(touch bad)/install.sh",'claude','linux')).toBe("bash '/tmp/a'\\''b/$(touch bad)/install.sh'");
  expect(installerCommand("C:\\Users\\O'Brien\\install.ps1",'codex','win32')).toBe("& powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\\Users\\O''Brien\\install.ps1'");
 });
});
