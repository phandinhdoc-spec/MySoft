import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {pythonJob} from './documents.js';
export type LaunchHost='word'|'excel'|'powerpoint';
export const DESKTOP_ADDIN_ID='c40b3f55-7e7e-4a43-8b25-7808fd1e7f39';
export const OFFICE_APPS={word:{name:'Word',bundle:'com.microsoft.Word',ext:'docx',part:'word'},excel:{name:'Excel',bundle:'com.microsoft.Excel',ext:'xlsx',part:'xl'},powerpoint:{name:'PowerPoint',bundle:'com.microsoft.Powerpoint',ext:'pptx',part:'ppt'}} as const;
export function assertOfficeInstalled(host:LaunchHost){
 if(process.platform!=='darwin')throw Error('Mở Office và kết nối tự động hiện hỗ trợ macOS. Dùng kết nối thủ công cho hệ điều hành này.');
 if(!['/Applications',path.join(os.homedir(),'Applications')].some(dir=>fs.existsSync(path.join(dir,`Microsoft ${OFFICE_APPS[host].name}.app`))))throw Error(`Chưa tìm thấy Microsoft ${OFFICE_APPS[host].name}. Cài ứng dụng Office trước khi tạo tài liệu.`);
}
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
/** Only called on a newly generated blank file. Never embed the reusable pairing code. */
export function embedDesktopAddin(bytes:Uint8Array,host:LaunchHost,ticket:string,version:string){
 const parts=unzipSync(bytes),base=`${OFFICE_APPS[host].part}/webextensions`;
 const rel='http://schemas.openxmlformats.org/package/2006/relationships';
 const officeRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const extension='http://schemas.microsoft.com/office/2011/relationships/webextension';
 const taskpanes='http://schemas.microsoft.com/office/2011/relationships/webextensiontaskpanes';
 const put=(name:string,value:string)=>{parts[name]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+value);};
 put(`${base}/webextension1.xml`,`<we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11" id="{${DESKTOP_ADDIN_ID}}"><we:reference id="${DESKTOP_ADDIN_ID}" version="${xml(version)}" store="developer" storeType="Registry"/><we:alternateReferences/><we:properties><we:property name="Office.AutoShowTaskpaneWithDocument" value="true"/><we:property name="PVTA.LaunchTicket" value="${xml(JSON.stringify(ticket))}"/></we:properties><we:bindings/><we:snapshot xmlns:r="${officeRel}"/></we:webextension>`);
 put(`${base}/taskpanes.xml`,`<wetp:taskpanes xmlns:wetp="http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11"><wetp:taskpane dockstate="right" visibility="1" width="350" row="0"><wetp:webextensionref xmlns:r="${officeRel}" r:id="rId1"/></wetp:taskpane></wetp:taskpanes>`);
 put(`${base}/_rels/taskpanes.xml.rels`,`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${extension}" Target="webextension1.xml"/></Relationships>`);
 if(!parts['_rels/.rels']||!parts['[Content_Types].xml'])throw Error('Tệp Office mới thiếu cấu trúc Open XML.');
 parts['_rels/.rels']=strToU8(strFromU8(parts['_rels/.rels']!).replace('</Relationships>',`<Relationship Id="pvtaTaskpanes" Type="${taskpanes}" Target="${base}/taskpanes.xml"/></Relationships>`));
 parts['[Content_Types].xml']=strToU8(strFromU8(parts['[Content_Types].xml']!).replace('</Types>',`<Override PartName="/${base}/taskpanes.xml" ContentType="application/vnd.ms-office.webextensiontaskpanes+xml"/><Override PartName="/${base}/webextension1.xml" ContentType="application/vnd.ms-office.webextension+xml"/></Types>`));
 return zipSync(parts);
}
export async function createOfficeDocument(file:string,host:LaunchHost,ticket:string,assets:string){
 await pythonJob({op:'office_blank',output:file});
 const manifest=fs.readFileSync(path.join(assets,'manifest.xml'),'utf8');
 const version=manifest.match(/<Version>([^<]+)<\/Version>/)?.[1];if(!version)throw Error('Gói add-in thiếu phiên bản.');
 fs.writeFileSync(file,embedDesktopAddin(fs.readFileSync(file),host,ticket,version),{mode:0o600});
}
export async function openOfficeDocument(file:string,host:LaunchHost){
 await new Promise<void>((resolve,reject)=>execFile('/usr/bin/open',['-b',OFFICE_APPS[host].bundle,file],{timeout:30000},e=>e?reject(Error(`Không mở được ${OFFICE_APPS[host].name}. Tệp mới đã lưu tại ${file}.`)):resolve()));
}
export function matchesOfficeDocument(url:unknown,file:string){
 if(typeof url!=='string'||!url)return false;
 try{const local=url.startsWith('file:')?new URL(url):undefined;if(local&&local.hostname&&local.hostname!=='localhost')return false;const value=decodeURIComponent(local?local.pathname:url);return path.normalize(value).normalize('NFC')===path.normalize(file).normalize('NFC');}catch{return false;}
}
