import {it,expect} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {once} from 'node:events';import {WebSocket} from 'ws';
import {OfficeLive,OFFICE_PORT} from '../src/desktop/office-live';
it.each(['https://localhost:52730',`https://localhost:${OFFICE_PORT}`])('pairs safely from %s and routes to the selected Office host',async(origin)=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-live-'));const web=path.join(home,'web');fs.mkdirSync(web);fs.writeFileSync(path.join(web,'desktop.html'),'test');const live=new OfficeLive(home,web,()=>{});const clients:WebSocket[]=[];
 try{
  await live.start();const ca=fs.readFileSync(path.join(home,'office-plugin/certs/ca.crt'));
  const connect=async(token:string)=>{const ws=new WebSocket(`wss://localhost:${OFFICE_PORT}/office`,{ca,headers:{Origin:origin},family:4});clients.push(ws);await once(ws,'open');ws.send(JSON.stringify({type:'pair',token,host:'excel',name:'Grades.xlsx'}));return ws;};
  const hostile=new WebSocket(`wss://localhost:${OFFICE_PORT}/office`,{ca,headers:{Origin:'https://untrusted.example'},family:4});clients.push(hostile);await expect(once(hostile,'open')).rejects.toThrow();
  const bad=await connect('wrong');await once(bad,'close');expect(live.status().sessions).toHaveLength(0);
  const zeroKey=new WebSocket(`wss://localhost:${OFFICE_PORT}/office`,{ca,headers:{Origin:origin},family:4});clients.push(zeroKey);await once(zeroKey,'open');
  zeroKey.send(JSON.stringify({type:'pair',host:'word',name:'OldDoc.docx'}));
  const [zeroReply]=await once(zeroKey,'message');expect(JSON.parse(String(zeroReply))).toMatchObject({type:'paired',selected:true});
  expect(live.selectedSession()?.name).toBe('OldDoc.docx');
  zeroKey.close();await once(zeroKey,'close');await new Promise(r=>setTimeout(r,30));
  const ws=await connect(live.pairingCode());await once(ws,'message');const id=live.status().sessions[0]!.id;live.select(id);expect(live.selectedSession()?.name).toBe('Grades.xlsx');
  ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='execute')ws.send(JSON.stringify({type:'result',id:m.id,result:{value:8}}));});
  await expect(live.execute(id,{tool:'office_excel_get_sheet',args:{}})).resolves.toEqual({value:8});
  await expect(live.execute(id,{tool:'office_word_set_body',args:{text:'wrong host'}})).rejects.toThrow('không thuộc');
  ws.close();await once(ws,'close');await new Promise(r=>setTimeout(r,30));expect(live.status().selected).toBe('');await expect(live.execute(id,{tool:'office_excel_get_sheet',args:{}})).rejects.toThrow('không còn');
 }finally{clients.forEach(c=>c.terminate());live.stop();fs.rmSync(home,{recursive:true,force:true});}
},15000);
it('auto-pairs only the newly launched document and consumes the ticket once',async()=>{
 const launcher=await import('../src/desktop/office-launch');const {vi}=await import('vitest');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-launch-pair-'));const web=path.join(home,'web');fs.mkdirSync(web);fs.writeFileSync(path.join(web,'desktop.html'),'test');const live=new OfficeLive(home,web,()=>{});const clients:WebSocket[]=[];
 const check=vi.spyOn(launcher,'assertOfficeInstalled').mockImplementation(()=>{}),create=vi.spyOn(launcher,'createOfficeDocument').mockResolvedValue(),open=vi.spyOn(launcher,'openOfficeDocument').mockResolvedValue();vi.spyOn(live,'installMac').mockResolvedValue({installed:true});
 try{await live.start();const result=await live.createAndOpen('word'),ticket=create.mock.calls[0]![2],ca=fs.readFileSync(path.join(home,'office-plugin/certs/ca.crt'));
 const connect=async(host:string,url:string,key=ticket)=>{const ws=new WebSocket(`wss://localhost:${OFFICE_PORT}/office`,{ca,headers:{Origin:`https://localhost:${OFFICE_PORT}`},family:4});clients.push(ws);await once(ws,'open');ws.send(JSON.stringify({type:'pair',host,launchTicket:key,documentUrl:url}));return ws;};
 const wrong=await connect('word','/other.docx');await once(wrong,'close');expect(live.status().sessions).toHaveLength(0);
 const wrongHost=await connect('excel',result.path);await once(wrongHost,'close');expect(live.status().sessions).toHaveLength(0);
 const ws=await connect('word',result.path);const [reply]=await once(ws,'message');expect(JSON.parse(String(reply))).toMatchObject({type:'paired',selected:true});expect(live.selectedSession()?.host).toBe('word');expect(live.status().sessions[0]?.launchId).toBe(result.launchId);
 const replay=await connect('word',result.path);await once(replay,'close');expect(live.status().sessions).toHaveLength(1);
 const other=await live.createAndOpen('excel'),otherTicket=create.mock.calls[1]![2];const now=vi.spyOn(Date,'now').mockReturnValue(Date.now()+11*60_000);
 try{const expired=await connect('excel',other.path,otherTicket);await once(expired,'close');expect(live.status().sessions).toHaveLength(1);}finally{now.mockRestore();}
 }finally{clients.forEach(c=>c.terminate());check.mockRestore();create.mockRestore();open.mockRestore();live.stop();fs.rmSync(home,{recursive:true,force:true});}
},15000);
it('reports a clear message when macOS blocks one Office container, and keeps the others',async()=>{
 const {vi}=await import('vitest');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-wef-')),fake=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-home-'));
 const web=path.join(home,'web');fs.mkdirSync(web);fs.writeFileSync(path.join(web,'desktop.html'),'test');fs.writeFileSync(path.join(web,'manifest.xml'),'<x DefaultValue="PVTA"><TaskpaneId>PvtaPane</TaskpaneId></x>');
 const wef=(app:string)=>path.join(fake,`Library/Containers/com.microsoft.${app}/Data/Documents/wef`);
 for(const app of ['Word','Excel','Powerpoint'])fs.mkdirSync(wef(app),{recursive:true});
 fs.chmodSync(wef('Word'),0o500);
 const live=new OfficeLive(home,web,()=>{});const platform=Object.getOwnPropertyDescriptor(process,'platform')!;
 try{
  if(process.getuid?.()===0)return;
  vi.spyOn(live,'start').mockResolvedValue();vi.spyOn(live,'trustMac').mockResolvedValue();vi.spyOn(os,'homedir').mockReturnValue(fake);Object.defineProperty(process,'platform',{value:'darwin'});
  await expect(live.installMac('word')).rejects.toThrow('Toàn quyền truy cập ổ đĩa');
  await expect(live.installMac('excel')).resolves.toMatchObject({installed:true,blocked:['Word']});
  expect(fs.existsSync(path.join(wef('Excel'),'PVTA-Desktop.xml'))).toBe(true);
 }finally{Object.defineProperty(process,'platform',platform);vi.restoreAllMocks();fs.chmodSync(wef('Word'),0o700);live.stop();fs.rmSync(home,{recursive:true,force:true});fs.rmSync(fake,{recursive:true,force:true});}
});
it('executes DESKTOP_OFFICE_TOOLS directly on local Word, Excel and PowerPoint files without wef Add-in',async()=>{
 const launcher=await import('../src/desktop/office-launch');const {vi}=await import('vitest');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-direct-exec-'));
 const live=new OfficeLive(home,'assets',()=>{});
 const syncSpy=vi.spyOn(launcher,'syncOfficeDocumentBeforeRead').mockResolvedValue();
 const reloadSpy=vi.spyOn(launcher,'reloadOfficeDocumentAfterWrite').mockResolvedValue();
 try{
  const wordFile=path.join(home,'Giao-an.docx');
  await launcher.createCleanOfficeDocument(wordFile);
  const wSession=live.connectFile(wordFile)!;
  expect(wSession.host).toBe('word');
  expect(live.selectedSession()?.id).toBe(wSession.id);
  await expect(live.execute(wSession.id,{tool:'office_word_set_body',args:{text:'Bài 1: Khởi động\nNội dung chính'}})).resolves.toBe('đã đặt lại nội dung');
  await expect(live.execute(wSession.id,{tool:'office_word_insert_text',args:{text:'Phần 2: Luyện tập',where:'end'}})).resolves.toBe('đã chèn');
  const body=await live.execute(wSession.id,{tool:'office_word_get_body',args:{}}) as {text:string};
  expect(body.text).toContain('Bài 1: Khởi động');
  expect(body.text).toContain('Phần 2: Luyện tập');

  const excelFile=path.join(home,'Bang-diem.xlsx');
  await launcher.createCleanOfficeDocument(excelFile);
  const xSession=live.connectFile(excelFile)!;
  await expect(live.execute(xSession.id,{tool:'office_excel_set_range',args:{address:'A1',values:[['Học sinh','Điểm'],['An',9.5]]}})).resolves.toBe('đã ghi 2x2');
  const sheet=await live.execute(xSession.id,{tool:'office_excel_get_sheet',args:{}}) as {values:unknown[][]};
  expect(sheet.values).toEqual([['Học sinh','Điểm'],['An',9.5]]);

  const pptFile=path.join(home,'Bai-giang.pptx');
  await launcher.createCleanOfficeDocument(pptFile);
  const pSession=live.connectFile(pptFile)!;
  await expect(live.execute(pSession.id,{tool:'office_ppt_generate_slide',args:{title:'Slide mới',bullets:['Ý 1','Ý 2']}})).resolves.toContain('đã tạo slide');
  const slides=await live.execute(pSession.id,{tool:'office_ppt_get_slides',args:{}}) as Array<{shapes:Array<{text?:string}>}>;
  expect(slides.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(slides)).toContain('Slide mới');
 }finally{syncSpy.mockRestore();reloadSpy.mockRestore();live.stop();fs.rmSync(home,{recursive:true,force:true});}
},20000);
