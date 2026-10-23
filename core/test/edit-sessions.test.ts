import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,writeFile,readFile,readdir,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EditSessions} from '../src/desktop/edit-sessions';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function fixture(){const dir=await mkdtemp(path.join(tmpdir(),'pvta-edit-'));dirs.push(dir);const source=path.join(dir,'lesson.docx');await writeFile(source,'original');const root=path.join(dir,'sessions');const manager=new EditSessions(root);return {dir,source,root,manager};}
it('keeps source untouched, persists undo/redo across restart, and branches history',async()=>{
 const {manager,source,root}=await fixture();let s=await manager.open(source);
 s=await manager.change(s.id,s.revision,(_,out)=>writeFile(out,'first'));
 s=await manager.change(s.id,s.revision,(_,out)=>writeFile(out,'second'));
 expect(await readFile(source,'utf8')).toBe('original');
 const restarted=new EditSessions(root);s=await restarted.move(s.id,s.revision,-1);expect(await readFile(restarted.current(s),'utf8')).toBe('first');
 s=await restarted.move(s.id,s.revision,1);expect(await readFile(restarted.current(s),'utf8')).toBe('second');
 s=await restarted.move(s.id,s.revision,-1);s=await restarted.change(s.id,s.revision,(_,out)=>writeFile(out,'branch'));
 expect(s.versions).toHaveLength(3);await expect(restarted.move(s.id,s.revision,1)).rejects.toThrow();
 const previous=await readdir(path.join(root,s.id));expect(previous).toHaveLength(4);
});
it('save publishes current state and resets history only after success',async()=>{
 const {manager,source,root}=await fixture();let s=await manager.open(source);s=await manager.change(s.id,s.revision,(_,out)=>writeFile(out,'edited'));
 s=await manager.save(s.id,s.revision);expect(await readFile(source,'utf8')).toBe('edited');expect(s.cursor).toBe(0);expect(s.versions).toHaveLength(1);expect(await readdir(path.join(root,s.id))).toHaveLength(2);
});
it('external modification prevents overwrite and preserves the draft for Save As',async()=>{
 const {manager,source,dir}=await fixture();let s=await manager.open(source);s=await manager.change(s.id,s.revision,(_,out)=>writeFile(out,'draft'));await writeFile(source,'external');
 await expect(manager.save(s.id,s.revision)).rejects.toThrow('đã đổi');expect((await manager.get(s.id)).versions).toHaveLength(2);
 const destination=path.join(dir,'new.docx');const saved=await manager.save(s.id,s.revision,destination);
 expect(await readFile(source,'utf8')).toBe('external');expect(await readFile(destination,'utf8')).toBe('draft');expect(saved.source).toBe(await realpath(destination));expect(saved.cursor).toBe(0);await expect(manager.get(s.id)).rejects.toThrow();
});
it('rejects existing Save As target and stale revisions without dropping undo',async()=>{
 const {manager,source,dir}=await fixture();let s=await manager.open(source);s=await manager.change(s.id,s.revision,(_,out)=>writeFile(out,'draft'));
 await expect(manager.change(s.id,0,(_,out)=>writeFile(out,'stale'))).rejects.toThrow('đã đổi');
 const target=path.join(dir,'existing.docx');await writeFile(target,'precious');await expect(manager.save(s.id,s.revision,target)).rejects.toThrow();expect(await readFile(target,'utf8')).toBe('precious');expect((await manager.get(s.id)).versions).toHaveLength(2);
});
it('uses one session for symlink aliases and preserves history on failed changes',async()=>{
 const {manager,source,dir}=await fixture();const alias=path.join(dir,'alias.docx');await symlink(source,alias);const s=await manager.open(source);expect((await manager.open(alias)).id).toBe(s.id);
 await expect(manager.change(s.id,s.revision,async(_,out)=>{await writeFile(out,'partial');throw Error('failed');})).rejects.toThrow('failed');expect((await manager.get(s.id)).cursor).toBe(0);
});
it('serializes concurrent writes and discard never changes the original',async()=>{
 const {manager,source}=await fixture();let s=await manager.open(source);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const pending=manager.change(s.id,s.revision,async(_,out)=>{await gate;await writeFile(out,'edit');});
 await expect(manager.change(s.id,s.revision,(_,out)=>writeFile(out,'other'))).rejects.toThrow('đang cập nhật');release();s=await pending;await manager.discard(s.id,s.revision);expect(await readFile(source,'utf8')).toBe('original');
});
it('refreshes a clean baseline after an external save, keeping dirty sessions recoverable',async()=>{
 const {manager,source}=await fixture();let s=await manager.open(source);await writeFile(source,'outside');s=await manager.open(source);expect(await readFile(manager.current(s),'utf8')).toBe('outside');
 s=await manager.change(s.id,s.revision,(_,out)=>writeFile(out,'draft'));await writeFile(source,'new outside');const reopened=await manager.open(source);expect(await readFile(manager.current(reopened),'utf8')).toBe('draft');
});
