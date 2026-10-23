import {describe,it,expect} from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compareVersions,versionFromTag,packageSuffix,parseRelease,expectedHash,downloadPackage,macBundle,fetchRelease} from '../src/desktop/selfupdate';

const DL='https://github.com/phandinhdoc-spec/MySoft/releases/download/desktop-v0.1.12/';
const release=(extra:any[]=[])=>({tag_name:'desktop-v0.1.12',body:'Sửa lỗi',assets:[
 {name:'PVTA-Chatbox-0.1.12-arm64.dmg',browser_download_url:DL+'PVTA-Chatbox-0.1.12-arm64.dmg',size:10},
 {name:'PVTA-Chatbox-0.1.12-x64.dmg',browser_download_url:DL+'PVTA-Chatbox-0.1.12-x64.dmg',size:10},
 {name:'PVTA-Chatbox-0.1.12-x64.exe',browser_download_url:DL+'PVTA-Chatbox-0.1.12-x64.exe',size:10},
 {name:'PVTA-Chatbox-0.1.12-x64.AppImage',browser_download_url:DL+'PVTA-Chatbox-0.1.12-x64.AppImage',size:10},
 {name:'PVTA-Studio-Setup-0.1.12.exe',browser_download_url:DL+'PVTA-Studio-Setup-0.1.12.exe',size:10},
 {name:'SHA256SUMS',browser_download_url:DL+'SHA256SUMS',size:1},...extra]});

describe('cập nhật tại chỗ: chọn gói',()=>{
 it('so phiên bản và đọc số phiên bản từ thẻ',()=>{
  expect(compareVersions('0.1.12','0.1.11')).toBeGreaterThan(0);
  expect(compareVersions('0.1.9','0.1.11')).toBeLessThan(0);
  expect(compareVersions('0.2.0','0.2.0')).toBe(0);
  expect(versionFromTag('desktop-v0.1.12')).toBe('0.1.12');
  expect(versionFromTag('chatbox-v1.0.0')).toBe('1.0.0');
  expect(versionFromTag('studio-latest')).toBeUndefined();
 });
 it('chọn đúng gói theo hệ điều hành và kiến trúc',()=>{
  expect(parseRelease(release(),'darwin','arm64')?.asset?.name).toBe('PVTA-Chatbox-0.1.12-arm64.dmg');
  expect(parseRelease(release(),'darwin','x64')?.asset?.name).toBe('PVTA-Chatbox-0.1.12-x64.dmg');
  const studio=release();studio.assets.push({name:'PVTA-Studio-0.1.12-arm64.dmg',browser_download_url:DL+'PVTA-Studio-0.1.12-arm64.dmg',size:10});
  expect(parseRelease(studio,'darwin','arm64')?.asset?.name).toBe('PVTA-Studio-0.1.12-arm64.dmg');
  expect(parseRelease(release(),'win32','x64')?.asset?.name).toBe('PVTA-Studio-Setup-0.1.12.exe');
  expect(parseRelease(release(),'linux','x64',{APPIMAGE:'/home/a/pvta.AppImage'})?.asset?.name).toBe('PVTA-Chatbox-0.1.12-x64.AppImage');
  expect(parseRelease(release(),'darwin','arm64')?.sumsUrl).toBe(DL+'SHA256SUMS');
 });
 it('bản .deb trên Linux không tự cập nhật, chỉ báo lý do',()=>{
  expect(packageSuffix('linux','x64',{})).toBeUndefined();
  const r=parseRelease(release(),'linux','x64',{});
  expect(r?.asset).toBeUndefined();expect(r?.reason).toMatch(/\.deb/);
 });
 it('bỏ qua địa chỉ tải ngoài kho PVTA',()=>{
  const j=release();j.assets=j.assets.map(a=>a.name.endsWith('.exe')?{...a,browser_download_url:'https://evil.example/x.exe'}:a);
  const r=parseRelease(j,'win32','x64');
  expect(r?.asset).toBeUndefined();expect(r?.reason).toBeTruthy();
 });
 it('thiếu SHA256SUMS thì không cho cài',()=>{
  const j=release();j.assets=j.assets.filter(a=>a.name!=='SHA256SUMS');
  expect(parseRelease(j,'darwin','arm64')?.asset).toBeUndefined();
 });
 it('đọc mã trong SHA256SUMS (có hoặc không có dấu *)',()=>{
  const h='a'.repeat(64);
  expect(expectedHash(`${h}  PVTA-Chatbox-0.1.12-x64.exe\n`,'PVTA-Chatbox-0.1.12-x64.exe')).toBe(h);
  expect(expectedHash(`${h.toUpperCase()} *PVTA-Chatbox-0.1.12-x64.exe\r\n`,'PVTA-Chatbox-0.1.12-x64.exe')).toBe(h);
  expect(expectedHash(`${h}  khac.exe`,'PVTA-Chatbox-0.1.12-x64.exe')).toBeUndefined();
 });
 it('tìm PVTA.app từ đường dẫn lõi',()=>{
  expect(macBundle('/Applications/PVTA.app/Contents/MacOS/pvta-core')).toBe('/Applications/PVTA.app');
  expect(macBundle('/usr/bin/node')).toBeUndefined();
 });
});

describe('cập nhật tại chỗ: tải gói',()=>{
 const body=Buffer.alloc(300_000,7);
 const sha=crypto.createHash('sha256').update(body).digest('hex');
 const fakeFetch=(sums:string)=>(async(url:any)=>String(url).endsWith('SHA256SUMS')?new Response(sums):new Response(body,{headers:{'content-length':String(body.length)}})) as typeof fetch;
 const info=parseRelease(release(),'win32','x64')!;
 it('tải, báo tiến trình và khớp mã kiểm tra',async()=>{
  const seen:number[]=[];const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-test-'));
  const file=await downloadPackage(info,p=>seen.push(p.received),{fetchFn:fakeFetch(`${sha}  ${info.asset!.name}\n`),dir});
  expect(fs.readFileSync(file).equals(body)).toBe(true);
  expect(seen.at(-1)).toBe(body.length);
  fs.rmSync(dir,{recursive:true,force:true});
 });
 it('sai mã kiểm tra thì xóa tệp và báo lỗi',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-test-'));
  await expect(downloadPackage(info,()=>{},{fetchFn:fakeFetch(`${'0'.repeat(64)}  ${info.asset!.name}\n`),dir})).rejects.toThrow(/không khớp/);
  expect(fs.existsSync(dir)).toBe(false);
 });
 it('lỗi mạng khi hỏi GitHub có thông báo dễ hiểu',async()=>{
  await expect(fetchRelease((async()=>{throw new TypeError('fetch failed');}) as any)).rejects.toThrow(/Kiểm tra mạng/);
  await expect(fetchRelease((async()=>new Response('',{status:404})) as any)).rejects.toThrow(/Chưa có bản/);
 });
});

describe('cập nhật tại chỗ: cài trên Linux (AppImage)',()=>{
 it('thay tệp AppImage đang dùng và giữ quyền chạy',async()=>{
  const {installPackage}=await import('../src/desktop/selfupdate');
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-app-'));const target=path.join(home,'pvta.AppImage');fs.writeFileSync(target,'cu');
  const dl=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-dl-'));const pkg=path.join(dl,'PVTA-Chatbox-0.1.12-x64.AppImage');fs.writeFileSync(pkg,'moi');
  const old=process.env.APPIMAGE;process.env.APPIMAGE=target;
  try{expect(await installPackage(pkg,'linux')).toBe('relaunch');}finally{if(old===undefined)delete process.env.APPIMAGE;else process.env.APPIMAGE=old;}
  expect(fs.readFileSync(target,'utf8')).toBe('moi');
  expect(fs.statSync(target).mode&0o111).toBeTruthy();
  expect(fs.existsSync(dl)).toBe(false);
  fs.rmSync(home,{recursive:true,force:true});
 });
});

describe('source installation and release channels',()=>{
 it('chooses a complete desktop release instead of a newer Office-only release',async()=>{
  const newest={tag_name:'v9.0.0',assets:[]};
  const incomplete={tag_name:'desktop-v0.1.13',assets:[]};
  const r=await fetchRelease((async()=>Response.json([newest,incomplete,release()])) as typeof fetch,'win32','x64');
  expect(r.version).toBe('0.1.12');expect(r.asset).toBeTruthy();
 });
 it('opens the source installer without terminating the running app and quotes paths',async()=>{
  const {startMacSourceInstall}=await import('../src/desktop/selfupdate');
  let dir='';
  try{
   await startMacSourceInstall({bundle:"/Users/O'Brien/Applications/PVTA.app",fetchFn:(async()=>new Response('#!/usr/bin/env bash\necho test\n')) as typeof fetch,openFn:async file=>{
    dir=path.dirname(file);
    expect(fs.readFileSync(file,'utf8')).toContain("O'\\''Brien");
    expect(fs.readFileSync(path.join(dir,'install.sh'),'utf8')).toContain('echo test');
   }});
  }finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('falls back to github.com when raw.githubusercontent.com is unreachable, and names the cause when both fail',async()=>{
  const {startMacSourceInstall}=await import('../src/desktop/selfupdate');let dir='';const seen:string[]=[];
  try{
   await startMacSourceInstall({bundle:'/Applications/PVTA.app',fetchFn:(async(u:string)=>{seen.push(new URL(u).host);if(u.includes('raw.githubusercontent.com'))throw Object.assign(new TypeError('fetch failed'),{cause:{code:'ENOTFOUND'}});return new Response('#!/usr/bin/env bash\necho ok\n');}) as unknown as typeof fetch,openFn:async file=>{dir=path.dirname(file);}});
   expect(seen).toEqual(['raw.githubusercontent.com','github.com']);
  }finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}
  await expect(startMacSourceInstall({bundle:'/Applications/PVTA.app',fetchFn:(async(u:string)=>u.includes('raw.')?new Response('',{status:429}):new Response('',{status:404})) as unknown as typeof fetch})).rejects.toThrow('raw.githubusercontent.com: HTTP 429; github.com: HTTP 404');
 });
 it('reports a failed Terminal launch and cleans its temporary script',async()=>{
  const {startMacSourceInstall}=await import('../src/desktop/selfupdate');let dir='';
  await expect(startMacSourceInstall({bundle:'/Applications/PVTA.app',fetchFn:(async()=>new Response('#!/usr/bin/env bash\n')) as typeof fetch,openFn:async file=>{dir=path.dirname(file);throw Error('Terminal failed');}})).rejects.toThrow('Terminal failed');
  expect(fs.existsSync(dir)).toBe(false);
 });
});
