import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
vi.mock('../src/desktop/documents.js',()=>({
 SUPPORTED:new Set(['.docx']),
 extract:async(file:string)=>({segments:[{ref:'Đoạn 1',text:fs.readFileSync(file,'utf8')}],image:false}),
 pythonJob:async(q:any)=>{const text=fs.readFileSync(q.path,'utf8');if(q.op==='office_editor_read')return {kind:'docx',hash:crypto.createHash('sha256').update(text).digest('hex'),groups:[{id:'body',name:'Nội dung',entries:[{id:'run1',label:'Đoạn 1',value:text}]}]};let result=text;if(q.op==='patch')for(const r of q.replacements)result=result.replace(r.old,r.new);else if(q.op==='office_editor_save')result=q.edits[0].value;fs.writeFileSync(q.output,result,{flag:'wx'});return {path:q.output};}
}));
import {DesktopRuntime} from '../src/desktop/runtime';
const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));vi.restoreAllMocks();});
const rpc=(r:DesktopRuntime,method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
async function setup(){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-session-rpc-')));roots.push(home);const events:any[]=[];const r=new DesktopRuntime(e=>events.push(e),home);runtimes.push(r);r.store.data.documentsDir=path.join(home,'Documents');const chatId=await rpc(r,'newChat');const source=path.join(home,'lesson.docx');fs.writeFileSync(source,'Original');const target=await rpc(r,'prepareFileEdit',{chatId,path:source});return {r,home,chatId,source,target,events};}
it('hover is read only; UI edit, AI action, undo, Save As use one durable session',async()=>{
 const {r,home,chatId,source,target,events}=await setup();await rpc(r,'fileQuickPreview',{path:source});expect(await r.editSessions.find(source)).toBeUndefined();
 let s=await rpc(r,'editOpen',target);const view=await rpc(r,'editRead',{chatId,sessionId:s.id});s=await rpc(r,'editApply',{chatId,sessionId:s.id,revision:s.revision,hash:view.doc.hash,edits:[{id:'run1',value:'Manual'}]});
 expect(fs.readFileSync(source,'utf8')).toBe('Original');expect(r.store.data.attachments[0]?.segments[0]?.text).toBe('Manual');
 const run=vi.spyOn(r.engine,'run').mockResolvedValue({text:'```pvta-action\n'+JSON.stringify({kind:'patch_office',path:source,replacements:[{old:'Manual',new:'AI edit'}],reason:'Sửa nháp'})+'\n```',attempts:1,fullPrompt:true,timings:{totalMs:0}});
 await rpc(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},access:'full',learning:false}});await rpc(r,'send',{chatId,text:'Sửa nội dung'});
 expect(run.mock.calls[0]?.[0].workspaceWrite).toBe(false);s=await r.editSessions.get(s.id);expect(s.cursor).toBe(2);expect(fs.readFileSync(r.editSessions.current(s),'utf8')).toBe('AI edit');expect(fs.readFileSync(source,'utf8')).toBe('Original');
 expect(r.store.data.chats[0]?.messages.at(-1)?.actions?.[0]?.draftSession).toBe(s.id);expect(events.some(e=>e.event==='editSession')).toBe(true);
 s=await rpc(r,'editUndo',{chatId,sessionId:s.id,revision:s.revision});expect(fs.readFileSync(r.editSessions.current(s),'utf8')).toBe('Manual');
 const destination=path.join(home,'copy.docx');s=await rpc(r,'editSave',{chatId,sessionId:s.id,revision:s.revision,path:destination});expect(fs.readFileSync(destination,'utf8')).toBe('Manual');expect(fs.readFileSync(source,'utf8')).toBe('Original');expect(s.cursor).toBe(0);expect(r.store.data.attachments.find(a=>a.path===source)?.segments[0]?.text).toBe('Original');await expect(rpc(r,'editRead',{chatId,sessionId:s.id})).resolves.toBeTruthy();
});
it('denies another conversation and discards without overwriting the source',async()=>{
 const {r,chatId,source,target}=await setup();let s=await rpc(r,'editOpen',target);const other=await rpc(r,'newChat');await expect(rpc(r,'editRead',{chatId:other,sessionId:s.id})).rejects.toThrow('không thuộc');
 s=await rpc(r,'editApply',{chatId,sessionId:s.id,revision:s.revision,edits:[{id:'run1',value:'Draft'}]});await rpc(r,'editDiscard',{chatId,sessionId:s.id,revision:s.revision});expect(fs.readFileSync(source,'utf8')).toBe('Original');expect(r.store.data.attachments[0]?.segments[0]?.text).toBe('Original');
});
