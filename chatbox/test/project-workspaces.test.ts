// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn(async()=>true));
vi.mock('../src/ipc',()=>({rpc}));
import {ProjectWorkspaces} from '../src/ProjectWorkspaces';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:Root,host:HTMLDivElement;
const report=vi.fn();
async function render(query=''){
 await act(async()=>{root.render(React.createElement(ProjectWorkspaces,{compact:true,projects:[{id:'p',name:'Bài 1',rules:'',workspaceId:'a'},{id:'q',name:'Bài 2',rules:''}],workspaces:[{id:'a',name:'Chương 1',collapsed:true},{id:'b',name:'Chương 2'}],query,report,renderProject:p=>React.createElement('button',{},p.name)}));});
}
beforeEach(async()=>{rpc.mockClear();host=document.createElement('div');document.body.append(host);root=createRoot(host);await render();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('collapses projects, preserves drop targets, and reveals matching projects in search',async()=>{
 expect(host.textContent).not.toContain('Bài 1');expect(host.querySelectorAll('[data-project-workspace]')).toHaveLength(3);
 await render('Bài 1');expect(host.textContent).toContain('Bài 1');expect(host.textContent).not.toContain('Bài 2');
});
it('moves projects by select and drop, including to ungrouped',async()=>{
 const select=host.querySelector('select')!;
 await act(async()=>{select.value='b';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(rpc).toHaveBeenLastCalledWith('moveProjectToWorkspace',{projectId:'q',workspaceId:'b'});
 const drop=new Event('drop',{bubbles:true,cancelable:true});
 Object.defineProperty(drop,'dataTransfer',{value:{getData:()=> 'q'}});
 await act(async()=>{host.querySelector('[data-project-workspace="a"]')!.dispatchEvent(drop);});
 expect(rpc).toHaveBeenLastCalledWith('moveProjectToWorkspace',{projectId:'q',workspaceId:'a'});
 await act(async()=>{host.querySelector('[data-project-workspace=""]')!.dispatchEvent(drop);});
 expect(rpc).toHaveBeenLastCalledWith('moveProjectToWorkspace',{projectId:'q',workspaceId:''});
});
it('supports pointer dragging without native webview drag events',async()=>{
 const handle=host.querySelector<HTMLButtonElement>('[aria-label="Kéo dự án Bài 2"]')!;
 handle.setPointerCapture=vi.fn();
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>host.querySelector('[data-project-workspace="a"]')});
 const pointer=async(type:string,x:number)=>{await act(async()=>{const e=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:10});Object.defineProperty(e,'pointerId',{value:1});handle.dispatchEvent(e);});};
 await pointer('pointerdown',0);await pointer('pointermove',40);await pointer('pointerup',40);
 expect(rpc).toHaveBeenLastCalledWith('moveProjectToWorkspace',{projectId:'q',workspaceId:'a'});
});
it('persists collapse and requires a separate confirmation before deleting a group',async()=>{
 await act(async()=>{host.querySelector<HTMLButtonElement>('.workspace-toggle')!.click();});
 expect(rpc).toHaveBeenLastCalledWith('setWorkspaceCollapsed',{id:'a',collapsed:false});
 await act(async()=>{host.querySelector<HTMLButtonElement>('[aria-label="Xóa Workspace Chương 1"]')!.click();});
 expect(rpc).not.toHaveBeenCalledWith('deleteWorkspace',expect.anything());
 await act(async()=>{host.querySelector<HTMLButtonElement>('.workspace-delete button')!.click();});
 expect(rpc).toHaveBeenLastCalledWith('deleteWorkspace',{id:'a'});
});
