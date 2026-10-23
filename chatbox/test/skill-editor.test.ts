// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {SkillEditor} from '../src/SkillEditor';import {rpc} from '../src/ipc';
vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
it('requires successful backup before showing editor and supports restore after cancelling edits',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const base={name:'office-test',text:'Original',revision:'r1',bundled:true,backups:[]};const snapshot={...base,backups:[{id:'backup',at:1}],backupId:'backup'};
 vi.mocked(rpc).mockResolvedValueOnce(base);const report=vi.fn();
 await act(async()=>root.render(React.createElement(SkillEditor,{name:base.name,report,notice:vi.fn()})));
 expect(host.querySelector('textarea')).toBeNull();const click=async(label:string)=>{await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!.click());};
 vi.mocked(rpc).mockRejectedValueOnce(Error('disk full'));await click('Sửa');expect(host.querySelector('textarea')).toBeNull();expect(report).toHaveBeenCalled();
 vi.mocked(rpc).mockResolvedValueOnce(snapshot);await click('Sửa');expect(host.querySelector('textarea')?.value).toBe('Original');expect(rpc).toHaveBeenLastCalledWith('beginSkillEdit',{name:'office-test'});
 await click('Hủy sửa');expect(host.querySelector('textarea')).toBeNull();
 vi.mocked(rpc).mockResolvedValueOnce(snapshot);await click('Khôi phục backup');expect(rpc).toHaveBeenLastCalledWith('restoreSkillBackup',{name:'office-test',backupId:'backup',revision:'r1'});
 await act(async()=>root.unmount());host.remove();
});

it.each(['ellipsis','contextmenu'])('menu edit via %s waits for backup and blocks on failure',async(trigger)=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.mocked(rpc).mockReset();
 const {SkillCard}=await import('../src/SkillCard');
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),report=vi.fn();
 const base={name:'office-test',text:'Original',revision:'r1',bundled:true,backups:[]};
 let finish!:(value:any)=>void;let fail!:(error:Error)=>void;
 vi.mocked(rpc).mockImplementation(async(method)=>method==='skillDetail'?base:new Promise((resolve,reject)=>{finish=resolve;fail=reject;}));
 function Harness(){const [view,setView]=React.useState<{edit:boolean}>();return React.createElement(React.Fragment,null,
  React.createElement(SkillCard,{skill:{name:'office-test',description:'Skill',load:'demand'} as any,onView:()=>setView({edit:false}),onEdit:()=>setView({edit:true}),report}),
  view&&React.createElement(SkillEditor,{name:'office-test',requestEdit:view.edit,report,notice:vi.fn()}));}
 try{
  await act(async()=>root.render(React.createElement(Harness)));
  await act(async()=>{if(trigger==='ellipsis')host.querySelector<HTMLButtonElement>('.object-menu-trigger')!.click();else host.querySelector('article')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));});
  expect(rpc).not.toHaveBeenCalled();
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent==='Sửa')!.click());
  expect(host.querySelector('textarea')).toBeNull();expect(rpc).toHaveBeenLastCalledWith('beginSkillEdit',{name:'office-test'});
  await act(async()=>{if(trigger==='contextmenu')fail(Error('disk full'));else finish(base);});expect(host.querySelector('textarea')).toBeNull();expect(report).toHaveBeenCalled();
  vi.mocked(rpc).mockResolvedValueOnce({...base,backupId:'b',backups:[{id:'b',at:1}]});
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Sửa')!.click());expect(host.querySelector('textarea')?.value).toBe('Original');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('ignores a previous skill backup response after switching skills',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.mocked(rpc).mockReset();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let finish!:(v:any)=>void;
 const base={text:'Original',revision:'r1',bundled:false,backups:[]};
 vi.mocked(rpc).mockImplementation(async(method,p)=>method==='beginSkillEdit'?new Promise(resolve=>{finish=resolve;}):{...base,name:p.name});
 const report=vi.fn(),notice=vi.fn();const render=(name:string)=>act(async()=>root.render(React.createElement(SkillEditor,{name,report,notice})));
 try{await render('one');await act(async()=>host.querySelector('button')!.click());await render('two');
  await act(async()=>finish({...base,name:'one',backupId:'b',backups:[{id:'b',at:1}]}));
  expect(host.querySelector('textarea')).toBeNull();expect(host.querySelector('section')?.getAttribute('aria-label')).toContain('two');expect(notice).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});

it('saves with its edit backup and restores the explicitly selected backup',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.mocked(rpc).mockReset();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),report=vi.fn();
 const base={name:'office-test',text:'Original',revision:'r1',bundled:false,backups:[{id:'new',at:2},{id:'old',at:1}]};
 vi.mocked(rpc).mockResolvedValueOnce(base);
 const click=async(label:string)=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!.click());
 try{await act(async()=>root.render(React.createElement(SkillEditor,{name:base.name,report,notice:vi.fn()})));
  vi.mocked(rpc).mockResolvedValueOnce({...base,backupId:'new'});await click('Sửa');
  await act(async()=>{const input=host.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Changed');input.dispatchEvent(new Event('input',{bubbles:true}));});
  vi.mocked(rpc).mockRejectedValueOnce(Error('save failed'));await click('Lưu thay đổi');expect(host.querySelector('textarea')?.value).toBe('Changed');
  expect(rpc).toHaveBeenLastCalledWith('saveSkillEdit',{name:base.name,backupId:'new',text:'Changed'});
  vi.mocked(rpc).mockResolvedValueOnce({...base,text:'Changed',revision:'r2'});await click('Lưu thay đổi');expect(host.querySelector('textarea')).toBeNull();
  await act(async()=>{const select=host.querySelector('select')!;select.value='old';select.dispatchEvent(new Event('change',{bubbles:true}));});
  vi.mocked(rpc).mockResolvedValueOnce(base);await click('Khôi phục backup');expect(rpc).toHaveBeenLastCalledWith('restoreSkillBackup',{name:base.name,backupId:'old',revision:'r2'});
 }finally{await act(async()=>root.unmount());host.remove();}
});
