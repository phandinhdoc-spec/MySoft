import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {afterEach,expect,it,vi} from 'vitest';

// Execute the actual App effect against a small DOM event harness.
const source=readFileSync(new URL('../../chatbox/src/App.tsx',import.meta.url),'utf8');
const start=source.indexOf(' useEffect(()=>{\n  if(!projectTools');
const end=source.indexOf(' },[projectTools,toolsPinned,modal,attaching]);',start);
const body=ts.transpileModule(source.slice(start+' useEffect(()=>{'.length,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
class Target {
 constructor(readonly inside:boolean){}
 closest(){return this.inside?this:null;}
}
function mount(pinned=false){
 vi.useFakeTimers();
 const handlers=new Map<string,Function>();
 const document={activeElement:new Target(false),addEventListener:(name:string,fn:Function)=>handlers.set(name,fn),removeEventListener:(name:string)=>handlers.delete(name)};
 const close=vi.fn();
 const cleanup=new Function('document','Element','projectTools','toolsPinned','modal','attaching','setProjectTools',body)(document,Target,true,pinned,'',false,close);
 const move=(inside:boolean)=>handlers.get('pointermove')?.({target:new Target(inside)});
 const focus=(inside:boolean)=>{document.activeElement=new Target(inside);handlers.get('focusin')?.({target:document.activeElement});};
 return {move,focus,close,cleanup};
}
afterEach(()=>vi.useRealTimers());
it('keeps preview open when chat receives focus while pointer is still in panel',()=>{
 const h=mount();h.move(true);h.focus(false);vi.advanceTimersByTime(1500);expect(h.close).not.toHaveBeenCalled();h.cleanup();
});
it('hides only after leaving, and cancels hiding when returning to the panel',()=>{
 const h=mount();h.move(false);vi.advanceTimersByTime(300);h.move(true);vi.advanceTimersByTime(1500);expect(h.close).not.toHaveBeenCalled();h.move(false);vi.advanceTimersByTime(1500);expect(h.close).toHaveBeenCalledWith(false);h.cleanup();
});
it('keeps keyboard interactions and pinned panels open',()=>{
 const h=mount();h.focus(true);h.move(false);vi.advanceTimersByTime(1500);expect(h.close).not.toHaveBeenCalled();h.cleanup();
 const pinned=mount(true);pinned.move(false);vi.advanceTimersByTime(1500);expect(pinned.close).not.toHaveBeenCalled();
});
// Attachment hover behavior is exercised through AttachmentChip/QuickFile DOM events
// in chatbox/test/message-file-menu.test.ts, rather than removed App helpers.
it('clears a pending hide when effect is disposed',()=>{
 const h=mount();h.move(false);h.cleanup();vi.advanceTimersByTime(1500);expect(h.close).not.toHaveBeenCalled();
});
