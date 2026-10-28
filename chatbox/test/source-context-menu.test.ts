// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn(async()=>({indexing:false,roots:[]})));
vi.mock('../src/ipc',()=>({rpc}));
import {SourceContext,type ContextFile} from '../src/WorkspaceContext';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:Root;
const files:ContextFile[]=[{id:'a',name:'A.docx',path:'/tmp/A.docx',scope:'project',scopeId:'p',fingerprint:'1',segments:[]},{id:'b',name:'B.pdf',path:'/tmp/B.pdf',scope:'project',scopeId:'p',fingerprint:'1',segments:[]}];
beforeEach(async()=>{rpc.mockClear();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(SourceContext,{files,chatId:'c',projectId:'p',rag:true,office:undefined,onOffice(){}})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('opens the right-clicked file using the selected app rather than the previewed file',async()=>{
 await act(async()=>host.querySelector('#source-item-a')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 const item=Array.from(document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')).find(b=>b.textContent?.includes('Microsoft Office'))!;
 await act(async()=>item.click());
 expect(rpc).toHaveBeenCalledWith('openFileRef',{ref:'/tmp/A.docx',chatId:'c',app:'office'});
});
it('supports keyboard context menus and default application opening',async()=>{
 await act(async()=>host.querySelector('#source-item-a')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})));
 await act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());
 expect(rpc).toHaveBeenCalledWith('openFileRef',{ref:'/tmp/A.docx',chatId:'c',app:'default'});
});
