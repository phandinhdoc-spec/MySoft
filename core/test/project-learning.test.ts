import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {within} from '../src/desktop/project-learning';

const roots:string[]=[];const runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));});
const answer=(text:string)=>({text,attempts:1,fullPrompt:true,timings:{totalMs:0}});
async function setup(current=true){
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-project-learning-')));roots.push(home);
 const r=new DesktopRuntime(()=>{},home);runtimes.push(r);
 const call=(method:string,params:Record<string,unknown>={})=>r.dispatch({id:crypto.randomUUID(),method,params}) as Promise<any>;
 const projectId=await call('saveProject',{name:'Báo cáo STEM'});const chatId=await call('newChat',{projectId});
 await call('preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});
 r.store.data.documentsDir=path.join(home,'Documents');
 const now=path.join(home,'STEM-hien-tai'),old=path.join(home,'Hoc-hoi');fs.mkdirSync(now);fs.mkdirSync(old);
 fs.writeFileSync(path.join(now,'bao-cao.md'),'STEM hiện tại: CURRENT_DATA_826. Thông số mới.');
 fs.writeFileSync(path.join(old,'bao-cao.md'),'STEM nguồn cũ: OLD_DATA_417. Cách viết: mở đầu nêu vấn đề, kết thúc nêu bài học.');
 if(current)await call('attach',{chatId,paths:[now],scope:'project',folder:true});
 const attach=()=>call('projectLearningAttach',{projectId,paths:[old]});
 const spy=vi.spyOn(r.engine,'run').mockResolvedValue(answer('Đã đọc.'));
 return {r,call,home,projectId,chatId,now,old,attach,spy};
}
it('keeps learning folders separate from current output, source folders and restart state',async()=>{
 const s=await setup();await s.attach();
 await s.call('saveProjectLearning',{projectId:s.projectId,notes:'Mở đầu nêu vấn đề; rà soát số liệu hiện tại.',enabled:true});
 const saved=s.r.store.data.projects[0]!.learning!.noteFile!;expect(fs.readFileSync(saved.path,'utf8')).toContain('Mở đầu nêu vấn đề; rà soát số liệu hiện tại.');expect(path.dirname(saved.path)).toBe(s.old);
 expect(s.r.store.data.projects[0]).toMatchObject({folders:[s.now],outputDir:s.now,learning:{folders:[s.old],enabled:true}});
 expect(s.r.store.data.chats[0]?.sourceFolders).toEqual([s.now]);
 expect((await s.call('outputLocation',{chatId:s.chatId})).choices).not.toContain(s.old);
 s.r.dispose();const next=new DesktopRuntime(()=>{},s.home);runtimes.push(next);
 expect(next.store.data.projects[0]?.learning).toMatchObject({folders:[s.old],notes:'Mở đầu nêu vấn đề; rà soát số liệu hiện tại.',enabled:true});
 expect(next.store.data.attachments.find(a=>a.path.startsWith(s.old))?.purpose).toBe('learning');
});
it('does not make a learning-only folder the working directory or destination',async()=>{
 const s=await setup(false);await s.attach();
 expect(s.r.store.data.projects[0]?.outputDir).toBeUndefined();expect(s.r.store.data.chats[0]?.sourceFolders).toBeUndefined();
 await s.call('send',{chatId:s.chatId,text:'Soạn báo cáo STEM mới'});
 expect(s.spy.mock.calls[0]![0].cwd).not.toBe(s.old);
 expect((await s.call('outputLocation',{chatId:s.chatId})).dir).not.toBe(s.old);
});
it('labels same-name historical/current files and returns separate search hits with exact paths',async()=>{
 const s=await setup();await s.attach();
 s.spy.mockResolvedValueOnce(answer('```pvta-read\n{"tool":"office_rag_search","args":{"query":"STEM"}}\n```')).mockResolvedValueOnce(answer('Tra cứu xong.'));
 await s.call('send',{chatId:s.chatId,text:'Soạn báo cáo STEM mới'});
 const system=s.spy.mock.calls[0]![0].system!;
 expect(system).toContain('[Tài liệu hiện tại] '+path.join(s.now,'bao-cao.md'));
 expect(system).toContain('[Học hỏi · nguồn cũ, chỉ tham khảo cách làm] '+path.join(s.old,'bao-cao.md'));
 expect(system).toContain('Thiếu dữ kiện mới thì hỏi lại');
 const tools=s.spy.mock.calls[1]![0].buildPrompt(false,false);
 expect(tools).toContain('"learningMatches"');expect(tools).toContain('"purpose":"current"');expect(tools).toContain('"purpose":"learning"');
 expect(tools).toContain(path.join(s.now,'bao-cao.md'));expect(tools).toContain(path.join(s.old,'bao-cao.md'));
});
it('excludes disabled learning from new prompts and tools while preserving current sources',async()=>{
 const s=await setup();await s.attach();await s.call('saveProjectLearning',{projectId:s.projectId,notes:'PRIVATE_LEARNING_NOTES',enabled:false});
 s.spy.mockResolvedValueOnce(answer('```pvta-read\n{"tool":"office_file_read","args":{"name":'+JSON.stringify(path.join(s.old,'bao-cao.md'))+'}}\n```')).mockResolvedValueOnce(answer('Không có nguồn cũ.'));
 await s.call('send',{chatId:s.chatId,text:'Báo cáo STEM'});
 const prompt=s.spy.mock.calls[0]![0].system!;expect(prompt).toContain('CURRENT_DATA_826');expect(prompt).not.toContain('OLD_DATA_417');expect(prompt).not.toContain('PRIVATE_LEARNING_NOTES');expect(prompt).not.toContain(s.old);
 expect(s.spy.mock.calls[1]![0].buildPrompt(false,false)).toContain('tệp đính kèm duy nhất');
});
it('isolates project learning from independent chats and other projects',async()=>{
 const s=await setup();await s.attach();
 const other=await s.call('saveProject',{name:'Dự án khác'});
 for(const projectId of [undefined,other]){const chatId=await s.call('newChat',{projectId});await s.call('send',{chatId,text:'STEM'});const prompt=s.spy.mock.calls.at(-1)![0].system!;expect(prompt).not.toContain(s.old);expect(prompt).not.toContain('OLD_DATA_417');}
});
it('allows a nested learning folder and excludes it when rescanning the current project',async()=>{
 const s=await setup();const nested=path.join(s.now,'Hoc-hoi');fs.mkdirSync(nested);fs.writeFileSync(path.join(nested,'quy-trinh.md'),'Nguồn quy trình cũ');
 await s.call('projectLearningAttach',{projectId:s.projectId,paths:[nested]});await s.call('attach',{chatId:s.chatId,paths:[s.now],scope:'project',folder:true});
 const source=s.r.store.data.attachments.filter(a=>a.path===path.join(nested,'quy-trinh.md'));expect(source).toHaveLength(1);expect(source[0]?.purpose).toBe('learning');
 await s.call('preferences',{patch:{access:'full'}});await s.call('send',{chatId:s.chatId,text:'Xem cách viết báo cáo STEM'});expect(s.spy.mock.calls[0]![0].workspaceWrite).toBe(false);
 await expect(s.call('projectLearningAttach',{projectId:s.projectId,paths:[s.now]})).rejects.toThrow('tách khỏi');
});
it('rejects learning destinations including symlink aliases and preserves proposed output',async()=>{
 const s=await setup();await s.attach();const alias=path.join(s.home,'alias');fs.symlinkSync(s.old,alias,'dir');
 for(const dir of [s.old,alias])await expect(s.call('selectOutput',{chatId:s.chatId,dir})).rejects.toThrow('Học hỏi');
 s.spy.mockResolvedValueOnce(answer('```pvta-action\n'+JSON.stringify({kind:'write_text',path:path.join(s.old,'new.md'),content:'Báo cáo mới',reason:'Soạn mới'})+'\n```'));
 await s.call('send',{chatId:s.chatId,text:'Tạo báo cáo mới'});const action=s.r.store.data.chats[0]!.messages.at(-1)!.actions![0]!;
 expect(action.path).toBe(path.join(s.now,'new.md'));await s.call('approveAction',{id:action.id});expect(fs.existsSync(path.join(s.old,'new.md'))).toBe(false);expect(fs.existsSync(action.path)).toBe(true);
});
it('creates a review draft only from learning sources; saving is explicit and local to the project',async()=>{
 const s=await setup();await s.attach();s.spy.mockResolvedValueOnce(answer('## Cách viết\nNêu vấn đề trước khi trình bày giải pháp.'));
 const result=await s.call('projectLearningDraft',{projectId:s.projectId});
 expect(result).toMatchObject({sourceCount:1,partial:false});expect(s.r.store.data.projects[0]?.learning?.notes).toBe('');
 const prompt=s.spy.mock.calls[0]![0].buildPrompt(false,false);expect(prompt).toContain('OLD_DATA_417');expect(prompt).not.toContain('CURRENT_DATA_826');
 await s.call('saveProjectLearning',{projectId:s.projectId,notes:result.notes,enabled:true});
 expect(s.r.store.data.projects[0]?.learning?.notes).toBe(result.notes);expect(s.r.store.data.learned).toEqual([]);expect(s.r.store.data.learnedDrafts??[]).toEqual([]);
});
it('preserves saved notes after a model failure and rejects oversized or invalid notes',async()=>{
 const s=await setup();await s.attach();await s.call('saveProjectLearning',{projectId:s.projectId,notes:'Giữ kinh nghiệm đã lưu',enabled:true});s.spy.mockRejectedValueOnce(Error('Mất mạng'));
 await expect(s.call('projectLearningDraft',{projectId:s.projectId})).rejects.toThrow('Mất mạng');
 await expect(s.call('saveProjectLearning',{projectId:s.projectId,notes:'x'.repeat(12001),enabled:true})).rejects.toThrow('12.000');
 expect(s.r.store.data.projects[0]?.learning?.notes).toBe('Giữ kinh nghiệm đã lưu');
});
it('rejects model edits and direct editor sessions for historical Office sources',async()=>{
 const s=await setup();await s.attach();const source=s.r.store.data.attachments.find(a=>a.purpose==='learning')!;
 source.path=path.join(s.old,'bao-cao.docx');source.name='bao-cao.docx';fs.writeFileSync(source.path,'original office file');
 s.spy.mockResolvedValueOnce(answer('```pvta-action\n'+JSON.stringify({kind:'patch_office',path:source.path,replacements:[{old:'cũ',new:'mới'}],reason:'Sửa báo cáo'})+'\n```'));
 await s.call('send',{chatId:s.chatId,text:'Soạn báo cáo mới theo cách viết cũ'});
 const message=s.r.store.data.chats[0]!.messages.at(-1)!;expect(message.actions).toEqual([]);expect(message.text).toContain('Nguồn Học hỏi chỉ dùng để tham khảo');
 await expect(s.call('editOpen',{chatId:s.chatId,attachmentId:source.id})).rejects.toThrow('chỉ dùng để tham khảo');expect(fs.readFileSync(source.path,'utf8')).toBe('original office file');
});
it('refreshes changed/deleted learning files and unlinks without deleting the originals',async()=>{
 const s=await setup();await s.attach();const file=path.join(s.old,'bao-cao.md');fs.writeFileSync(file,'Đã cập nhật quy trình STEM');await s.attach();
 expect(s.r.store.data.attachments.find(a=>a.path===file)?.segments[0]?.text).toBe('Đã cập nhật quy trình STEM');
 fs.unlinkSync(file);await s.attach();expect(s.r.store.data.attachments.some(a=>a.path===file)).toBe(false);
 fs.writeFileSync(file,'Nguồn còn nguyên');await s.attach();await s.call('removeProjectLearningFolder',{projectId:s.projectId,folder:s.old});
 expect(fs.readFileSync(file,'utf8')).toBe('Nguồn còn nguyên');expect(s.r.store.data.attachments.some(a=>a.path===file)).toBe(false);expect(s.r.store.data.projects[0]?.learning?.folders).toEqual([]);
});
it('detects source changes during draft extraction instead of returning outdated notes',async()=>{
 const s=await setup();await s.attach();let resolve!:(v:ReturnType<typeof answer>)=>void;s.spy.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const pending=s.call('projectLearningDraft',{projectId:s.projectId});await vi.waitFor(()=>expect(s.spy).toHaveBeenCalled());await s.call('removeProjectLearningFolder',{projectId:s.projectId,folder:s.old});resolve(answer('Bản cũ'));
 await expect(pending).rejects.toThrow('đã đổi');
});
it('uses directory boundaries rather than name prefixes',()=>{expect(within('/tmp/hoc-hoi-khac/file.md','/tmp/hoc-hoi')).toBe(false);expect(within('/tmp/hoc-hoi/file.md','/tmp/hoc-hoi')).toBe(true);});
it('updates its own note file, protects outside edits and makes notes reusable in another project',async()=>{
 const s=await setup();await s.attach();await s.call('saveProjectLearning',{projectId:s.projectId,notes:'Kinh nghiệm ban đầu',enabled:true});
 const file=s.r.store.data.projects[0]!.learning!.noteFile!.path;
 await s.call('saveProjectLearning',{projectId:s.projectId,notes:'Kinh nghiệm đã duyệt',enabled:true});expect(fs.readFileSync(file,'utf8')).toContain('Kinh nghiệm đã duyệt');
 const projectId=await s.call('saveProject',{name:'STEM năm sau'});await s.call('projectLearningAttach',{projectId,paths:[s.old]});expect(s.r.store.data.attachments.find(a=>a.scopeId===projectId&&a.path===file)?.segments.some(s=>s.text.includes('Kinh nghiệm đã duyệt'))).toBe(true);
 fs.writeFileSync(file,'Chỉnh sửa ngoài ứng dụng');await expect(s.call('saveProjectLearning',{projectId:s.projectId,notes:'Nội dung khác',enabled:true})).rejects.toThrow('đã đổi bên ngoài');expect(fs.readFileSync(file,'utf8')).toBe('Chỉnh sửa ngoài ứng dụng');expect(s.r.store.data.projects[0]!.learning!.notes).toBe('Kinh nghiệm đã duyệt');
});
