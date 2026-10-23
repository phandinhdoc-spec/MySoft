// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {WorkflowGraph} from '../src/WorkflowGraph';
let host:HTMLDivElement,root:Root;
const changed=vi.fn(),selected=vi.fn();
const nodes=[{id:'a',name:'A',dependsOn:[]},{id:'b',name:'B',dependsOn:['a']},{id:'c',name:'C',dependsOn:[]}];
const render=async(disabled=false)=>act(async()=>root.render(React.createElement(WorkflowGraph,{nodes,disabled,onSelect:selected,onDependencies:changed,renderAction:()=>null,onAdd:vi.fn()})));
const click=async(label:string)=>act(async()=>host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;changed.mockReset();selected.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('connects using two nodes, blocks a cycle and removes an edge using the keyboard',async()=>{
 await render();await click('Sửa bước: A');expect(selected).toHaveBeenCalledWith('a');
 await act(async()=>host.querySelectorAll('.wf-node')[1]!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100})));
 await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='↗Tạo liên kết mới')!.click());await click('Nối tới: A');expect(changed).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toContain('vòng lặp');
 await click('Nối tới: C');expect(changed).toHaveBeenLastCalledWith('c',['b']);
 const edge=host.querySelector<SVGElement>('[aria-label="Chọn liên kết: A → B"]')!;
 await act(async()=>edge.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(changed).toHaveBeenCalledTimes(1);
 await act(async()=>edge.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true})));
 await act(async()=>document.querySelector<HTMLButtonElement>('[role=menuitem]')!.click());expect(changed).toHaveBeenLastCalledWith('b',[]);
});
it('moves nodes with arrow keys, resets layout and locks connections while running',async()=>{
 await render();const node=host.querySelector<HTMLElement>('.wf-node')!;const before=parseFloat(node.style.left);
 await act(async()=>host.querySelector('[aria-label="Di chuyển bước: A"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(parseFloat(node.style.left)).toBe(before+20);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác sơ đồ"]')!.click());await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.includes('Sắp xếp lại sơ đồ'))!.click());expect(parseFloat(node.style.left)).toBe(before);
 await render(true);await click('Chọn liên kết: A → B');expect(changed).not.toHaveBeenCalled();expect([...host.querySelectorAll<HTMLButtonElement>('.wf-port')].every(b=>b.disabled)).toBe(true);await act(async()=>node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true})));expect(document.querySelector('[role=menuitem][aria-disabled=true]')).not.toBeNull();
});

it('creates arbitrary additional edge ports from the context menu and persists them',async()=>{
 const props={nodes,disabled:false,onSelect:selected,onDependencies:changed,renderAction:()=>null,onAdd:vi.fn(),storageKey:'test:ports'};localStorage.removeItem('test:ports:ports');
 await act(async()=>root.render(React.createElement(WorkflowGraph,{...props,key:'first'})));
 expect(host.textContent).not.toContain('Nối từ đây');
 for(let i=0;i<25;i++){
  await act(async()=>host.querySelector('.wf-node')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:50})));
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='↗Tạo liên kết mới')!.click());
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 }
 expect(host.querySelectorAll('.wf-node')[0]!.querySelectorAll('.wf-port')).toHaveLength(26);
 await act(async()=>root.render(React.createElement(WorkflowGraph,{...props,key:'second'})));
 expect(host.querySelectorAll('.wf-node')[0]!.querySelectorAll('.wf-port')).toHaveLength(26);
 localStorage.removeItem('test:ports:ports');localStorage.removeItem('test:ports');
});
it('opens the link menu with Shift+F10 and dismisses it on Escape',async()=>{
 await render();await act(async()=>host.querySelector('[aria-label="Sửa bước: C"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true})));
 expect(document.querySelector('[role=menu]')?.textContent).toContain('Tạo liên kết mới');
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(host.querySelector('[role=menu]')).toBeNull();
});

it('offers an ellipsis for a selected edge and refuses stale deletion after a running-state update',async()=>{
 await render();await click('Chọn liên kết: A → B');expect(changed).not.toHaveBeenCalled();
 await click('Thao tác liên kết đã chọn');const stale=document.querySelector<HTMLButtonElement>('[role=menuitem]')!;expect(stale.textContent).toContain('Xóa liên kết');
 await render(true);await act(async()=>stale.click());expect(changed).not.toHaveBeenCalled();expect(document.querySelector('[role=menu]')).toBeNull();
});
it('provides background commands through the same menu without opening a step editor',async()=>{
 await render();await click('Thao tác sơ đồ');expect(document.querySelector('[role=menu]')?.textContent).toContain('Đặt lại vị trí sơ đồ');expect(selected).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
});
