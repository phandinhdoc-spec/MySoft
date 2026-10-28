import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {pythonJob} from './documents.js';
export type LaunchHost='word'|'excel'|'powerpoint';
export const DESKTOP_ADDIN_ID='c40b3f55-7e7e-4a43-8b25-7808fd1e7f39';
export const OFFICE_APPS={word:{name:'Word',bundle:'com.microsoft.Word',ext:'docx',part:'word'},excel:{name:'Excel',bundle:'com.microsoft.Excel',ext:'xlsx',part:'xl'},powerpoint:{name:'PowerPoint',bundle:'com.microsoft.Powerpoint',ext:'pptx',part:'ppt'}} as const;
export function officeAppPath(host:LaunchHost,home=os.homedir()){
 for(const dir of ['/Applications',path.join(home,'Applications')]){
  const p=path.join(dir,`Microsoft ${OFFICE_APPS[host].name}.app`);
  if(fs.existsSync(p))return p;
 }
 return undefined;
}
export function assertOfficeInstalled(host:LaunchHost){
 if(process.platform!=='darwin')throw Error('Mở Office và kết nối tự động hiện hỗ trợ macOS. Dùng kết nối thủ công cho hệ điều hành này.');
 if(!officeAppPath(host))throw Error(`Chưa tìm thấy Microsoft ${OFFICE_APPS[host].name}. Cài ứng dụng Office trước khi tạo tài liệu.`);
}
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function hostForOfficeFile(file:string):LaunchHost|undefined{
 const ext=path.extname(file).toLowerCase();
 return ext==='.docx'?'word':ext==='.xlsx'?'excel':ext==='.pptx'?'powerpoint':undefined;
}
export function hasMacWef(host:LaunchHost,home=os.homedir()):boolean{
 if(process.platform!=='darwin')return true;
 try{
  const wef=path.join(home,'Library/Containers',OFFICE_APPS[host].bundle,'Data/Documents/wef');
  if(fs.existsSync(path.join(wef,'PVTA-Desktop.xml'))||fs.existsSync(path.join(wef,'pvta.manifest.xml')))return true;
 }catch{}
 try{
  const reg=JSON.parse(fs.readFileSync(path.join(home,'Library/Application Support/PVTA/office-plugin/wef-registered.json'),'utf8'));
  if(Array.isArray(reg?.apps)&&reg.apps.some((a:string)=>a.toLowerCase()===OFFICE_APPS[host].name.toLowerCase()))return true;
 }catch{}
 return false;
}
export function stripDesktopAddin(bytes:Uint8Array,host:LaunchHost):Uint8Array|undefined{
 const parts=unzipSync(bytes),base=`${OFFICE_APPS[host].part}/webextensions`;
 const existing=parts[`${base}/webextension1.xml`]&&strFromU8(parts[`${base}/webextension1.xml`]!);
 if(!existing||!existing.includes(DESKTOP_ADDIN_ID))return undefined;
 delete parts[`${base}/webextension1.xml`];
 delete parts[`${base}/taskpanes.xml`];
 delete parts[`${base}/_rels/taskpanes.xml.rels`];
 if(parts['_rels/.rels']){
  const relsXml=strFromU8(parts['_rels/.rels']!).replace(/<Relationship[^>]*Target="[^"]*webextensions\/taskpanes\.xml"[^>]*\/>/g,'');
  parts['_rels/.rels']=strToU8(relsXml);
 }
 if(parts['[Content_Types].xml']){
  const ctXml=strFromU8(parts['[Content_Types].xml']!).replace(/<Override[^>]*PartName="\/[^"]*webextensions\/(?:taskpanes|webextension1)\.xml"[^>]*\/>/g,'');
  parts['[Content_Types].xml']=strToU8(ctXml);
 }
 return zipSync(parts);
}
/** Embeds or updates the PVTA Desktop add-in taskpane in a new or existing Office Open XML package. */
export function embedDesktopAddin(bytes:Uint8Array,host:LaunchHost,ticket='',version='2.0.0.0'){
 const parts=unzipSync(bytes),base=`${OFFICE_APPS[host].part}/webextensions`;
 const rel='http://schemas.openxmlformats.org/package/2006/relationships';
 const officeRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const extension='http://schemas.microsoft.com/office/2011/relationships/webextension';
 const taskpanes='http://schemas.microsoft.com/office/2011/relationships/webextensiontaskpanes';
 const put=(name:string,value:string)=>{parts[name]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+value);};
 const ticketProp=ticket?`<we:property name="PVTA.LaunchTicket" value="${xml(JSON.stringify(ticket))}"/>`:'';
 put(`${base}/webextension1.xml`,`<we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11" id="{${DESKTOP_ADDIN_ID}}"><we:reference id="${DESKTOP_ADDIN_ID}" version="${xml(version)}" store="developer" storeType="Registry"/><we:alternateReferences/><we:properties><we:property name="Office.AutoShowTaskpaneWithDocument" value="true"/>${ticketProp}</we:properties><we:bindings/><we:snapshot xmlns:r="${officeRel}"/></we:webextension>`);
 put(`${base}/taskpanes.xml`,`<wetp:taskpanes xmlns:wetp="http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11"><wetp:taskpane dockstate="right" visibility="1" width="350" row="0"><wetp:webextensionref xmlns:r="${officeRel}" r:id="rId1"/></wetp:taskpane></wetp:taskpanes>`);
 put(`${base}/_rels/taskpanes.xml.rels`,`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${extension}" Target="webextension1.xml"/></Relationships>`);
 if(!parts['_rels/.rels']||!parts['[Content_Types].xml'])throw Error('Tệp Office mới thiếu cấu trúc Open XML.');
 const relsXml=strFromU8(parts['_rels/.rels']!);
 if(!relsXml.includes('Id="pvtaTaskpanes"')&&!relsXml.includes(`${base}/taskpanes.xml`)){
  parts['_rels/.rels']=strToU8(relsXml.replace('</Relationships>',`<Relationship Id="pvtaTaskpanes" Type="${taskpanes}" Target="${base}/taskpanes.xml"/></Relationships>`));
 }
 let ctXml=strFromU8(parts['[Content_Types].xml']!);
 if(!ctXml.includes(`PartName="/${base}/taskpanes.xml"`))ctXml=ctXml.replace('</Types>',`<Override PartName="/${base}/taskpanes.xml" ContentType="application/vnd.ms-office.webextensiontaskpanes+xml"/></Types>`);
 if(!ctXml.includes(`PartName="/${base}/webextension1.xml"`))ctXml=ctXml.replace('</Types>',`<Override PartName="/${base}/webextension1.xml" ContentType="application/vnd.ms-office.webextension+xml"/></Types>`);
 parts['[Content_Types].xml']=strToU8(ctXml);
 return zipSync(parts);
}
export function ensureDocumentAddin(file:string,assets?:string,requireWef=false):boolean{
 const host=hostForOfficeFile(file);
 if(!host||!fs.existsSync(file))return false;
 if(requireWef&&process.platform==='darwin'&&!hasMacWef(host)){
  try{
   const raw=fs.readFileSync(file);
   const cleaned=stripDesktopAddin(raw,host);
   if(cleaned)fs.writeFileSync(file,cleaned,{mode:fs.statSync(file).mode});
  }catch{}
  return false;
 }
 try{
  const raw=fs.readFileSync(file);
  const parts=unzipSync(raw),base=`${OFFICE_APPS[host].part}/webextensions`;
  const existing=parts[`${base}/webextension1.xml`]&&strFromU8(parts[`${base}/webextension1.xml`]!);
  if(existing&&existing.includes(DESKTOP_ADDIN_ID)&&parts[`${base}/taskpanes.xml`])return true;
  let version='2.0.0.0';
  if(assets&&fs.existsSync(path.join(assets,'manifest.xml'))){
   const manifest=fs.readFileSync(path.join(assets,'manifest.xml'),'utf8');
   version=manifest.match(/<Version>([^<]+)<\/Version>/)?.[1]??version;
  }
  const mode=fs.statSync(file).mode;
  fs.writeFileSync(file,embedDesktopAddin(raw,host,'',version),{mode});
  return true;
 }catch{return false;}
}
export async function createCleanOfficeDocument(file:string){
 await pythonJob({op:'office_blank',output:file});
}
export async function createOfficeDocument(file:string,host:LaunchHost,ticket:string,assets:string){
 await pythonJob({op:'office_blank',output:file});
 const manifest=fs.readFileSync(path.join(assets,'manifest.xml'),'utf8');
 const version=manifest.match(/<Version>([^<]+)<\/Version>/)?.[1];if(!version)throw Error('Gói add-in thiếu phiên bản.');
 fs.writeFileSync(file,embedDesktopAddin(fs.readFileSync(file),host,ticket,version),{mode:0o600});
}
export async function openOfficeDocument(file:string,host:LaunchHost){
 const app=officeAppPath(host);
 const args=app?['-a',app,file]:['-b',OFFICE_APPS[host].bundle,file];
 await new Promise<void>((resolve,reject)=>execFile('/usr/bin/open',args,{timeout:30000},e=>e?reject(Error(`Không mở được ${OFFICE_APPS[host].name}. Tệp mới đã lưu tại ${file}.`)):resolve()));
}
export async function syncOfficeDocumentBeforeRead(file:string,host:LaunchHost){
 if(process.platform!=='darwin')return;
 const appName=`Microsoft ${OFFICE_APPS[host].name}`;
 const docName=path.basename(file);
 const script=host==='excel'
  ?`if application "${appName}" is running then tell application "${appName}" to try\nsave workbook ${JSON.stringify(docName)}\nend try`
  :`if application "${appName}" is running then tell application "${appName}" to try\nsave document ${JSON.stringify(docName)}\nend try`;
 await new Promise<void>(resolve=>execFile('/usr/bin/osascript',['-e',script],{timeout:3000},()=>resolve()));
}
export async function reloadOfficeDocumentAfterWrite(file:string,host:LaunchHost){
 if(process.platform!=='darwin')return;
 const appName=`Microsoft ${OFFICE_APPS[host].name}`;
 const docName=path.basename(file);
 const closeScript=host==='excel'
  ?`if application "${appName}" is running then tell application "${appName}" to try\nclose workbook ${JSON.stringify(docName)} saving no\nend try`
  :`if application "${appName}" is running then tell application "${appName}" to try\nclose document ${JSON.stringify(docName)} saving no\nend try`;
 await new Promise<void>(resolve=>execFile('/usr/bin/osascript',['-e',closeScript],{timeout:4000},()=>resolve()));
 await openOfficeDocument(file,host).catch(()=>{});
}
export async function discoverOpenOfficeFiles():Promise<{file:string;host:LaunchHost}[]>{
 if(process.platform!=='darwin')return [];
 return new Promise(resolve=>{
  execFile('/usr/sbin/lsof',['-F','n','-c','Microsoft Word','-c','Microsoft Excel','-c','Microsoft PowerPoint'],{timeout:2500},(err,stdout)=>{
   if(err&&!stdout)return resolve([]);
   const seen=new Set<string>(),out:{file:string;host:LaunchHost}[]=[];
   for(const line of String(stdout??'').split('\n')){
    if(!line.startsWith('n/'))continue;
    const f=line.slice(1).trim();
    const base=path.basename(f);
    if(base.startsWith('~$')||base.startsWith('.')||f.includes('/Applications/')||f.includes('/Library/Containers/'))continue;
    const host=hostForOfficeFile(f);
    if(!host||seen.has(f))continue;
    try{if(fs.statSync(f).isFile()){seen.add(f);out.push({file:f,host});}}catch{}
   }
   resolve(out);
  });
 });
}
export function matchesOfficeDocument(url:unknown,file:string){
 if(typeof url!=='string'||!url)return false;
 try{const local=url.startsWith('file:')?new URL(url):undefined;if(local&&local.hostname&&local.hostname!=='localhost')return false;const value=decodeURIComponent(local?local.pathname:url);return path.normalize(value).normalize('NFC')===path.normalize(file).normalize('NFC');}catch{return false;}
}
