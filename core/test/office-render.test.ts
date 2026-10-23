import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const exec=vi.hoisted(()=>vi.fn());vi.mock('node:child_process',()=>({execFile:exec}));
import {OfficeRenderer} from '../src/desktop/office-render';
const dirs:string[]=[];const id='a'.repeat(64);
afterEach(()=>{vi.unstubAllEnvs();exec.mockReset();dirs.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true}));});
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-render-'));dirs.push(dir);const input=path.join(dir,'draft.docx');fs.writeFileSync(input,'one');const binary=path.join(dir,'soffice');fs.writeFileSync(binary,'fixture');vi.stubEnv('PVTA_LIBREOFFICE',binary);const root=path.join(dir,'cache');return {renderer:new OfficeRenderer(root),input,root};}
it('converts once per content revision and clears the session cache',async()=>{
 const {renderer,input,root}=setup();exec.mockImplementation((_bin,args,_opts,done)=>{fs.writeFileSync(path.join(args[args.indexOf('--outdir')+1],'source.pdf'),'%PDF-fixture');done(null);});
 const [a,b]=await Promise.all([renderer.render(input,id),renderer.render(input,id)]);expect(a).toBe(b);expect(exec).toHaveBeenCalledTimes(1);expect(await renderer.render(input,id)).toBe(a);expect(exec).toHaveBeenCalledTimes(1);
 fs.writeFileSync(input,'two');expect(await renderer.render(input,id)).not.toBe(a);expect(exec).toHaveBeenCalledTimes(2);await renderer.clear(id);expect(fs.existsSync(path.join(root,id))).toBe(false);
});
it('does not reuse a partial PDF after conversion fails',async()=>{
 const {renderer,input}=setup();exec.mockImplementation((_bin,args,_opts,done)=>{fs.writeFileSync(path.join(args[args.indexOf('--outdir')+1],'source.pdf'),'partial');done(Error('failed'));});
 await expect(renderer.render(input,id)).rejects.toThrow('Không dựng');await expect(renderer.render(input,id)).rejects.toThrow();expect(exec).toHaveBeenCalledTimes(2);
});

import {CraftTools,CRAFT_LOCK} from '../src/desktop/craft-tools';
function craftSetup(){const s=setup();const bin=path.join(path.dirname(s.input),'wordcraft-cli');fs.writeFileSync(bin,'#!/bin/sh\n');fs.chmodSync(bin,0o755);vi.stubEnv('PVTA_WORDCRAFT',bin);const craft=new CraftTools(path.join(path.dirname(s.input),'tools'),'darwin');return {...s,craft,renderer:new OfficeRenderer(s.root,craft)};}
it('prefers the light Word renderer and checks that the output is a PDF',async()=>{
 const {renderer,input}=craftSetup();exec.mockImplementation((_bin,args,_opts,done)=>{fs.writeFileSync(args[2],'%PDF-1.7 light');done(null);});
 const out=await renderer.render(input,id);expect(exec.mock.calls[0][1].slice(0,1)).toEqual(['convert']);expect(fs.readFileSync(out,'utf8')).toContain('light');expect(exec).toHaveBeenCalledTimes(1);
});
it('falls back to LibreOffice when the light renderer fails or writes a non-PDF',async()=>{
 const {renderer,input}=craftSetup();exec.mockImplementation((bin,args,_opts,done)=>{if(args[0]==='convert'){fs.writeFileSync(args[2],'not a pdf');done(null);}else{fs.writeFileSync(path.join(args[args.indexOf('--outdir')+1],'source.pdf'),'%PDF-office');done(null);}});
 expect(fs.readFileSync(await renderer.render(input,id),'utf8')).toBe('%PDF-office');expect(exec).toHaveBeenCalledTimes(2);
});
it('downloads only pinned archives and rejects a checksum mismatch',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-craft-'));dirs.push(dir);
 const bad=new CraftTools(dir,'darwin',vi.fn(async()=>new Response(Buffer.from('tampered'))) as unknown as typeof fetch);
 await expect(bad.install()).rejects.toThrow('SHA-256');expect((await bad.status()).installed.wordcraft).toBe(false);
 await expect(new CraftTools(dir,'win32').install()).rejects.toThrow('macOS');
 for(const v of Object.values(CRAFT_LOCK)){expect(v.url).toMatch(/^https:\/\/github\.com\/storytold\//);expect(v.sha256).toMatch(/^[a-f0-9]{64}$/);}
});
