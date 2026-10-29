// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ActionCard} from '../src/ActionCard';
import {rpc,savePath,type Action} from '../src/ipc';
vi.mock('../src/ipc',()=>({rpc:vi.fn(),savePath:vi.fn()}));
const {show}=vi.hoisted(()=>({show:vi.fn()}));
vi.mock('../src/DocumentPreview',()=>({useDocumentPreview:()=>({show})}));
vi.mock('../src/OfficePanel',()=>({OfficePreview:()=>null}));
let host:HTMLDivElement,root:Root;
const report=vi.fn(),notice=vi.fn();
const action:Action={id:'other',kind:'write_text',path:'/tmp/source.md',output:'/tmp/result.md',savedPath:'/tmp/copy.md',content:'Nội dung',reason:'Bản sao',state:'done',outputHash:'abc'};
const render=(a=action)=>act(async()=>root.render(React.createElement(ActionCard,{action:a,report,notice})));
const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
const command=(s:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.startsWith(s))!;
const trigger=()=>host.querySelector<HTMLButtonElement>('.object-menu-trigger')!;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();vi.mocked(rpc).mockResolvedValue({});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('keeps open primary and moves reveal, save, preview and undo into a shared menu',async()=>{
 await render();expect(host.textContent).not.toContain('Hiện trong Finder');await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Mở tệp ↗')!);expect(rpc).toHaveBeenCalledWith('openOutput',{id:'other'});
 await click(trigger());const labels=[...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent);
 await act(async()=>host.querySelector('section')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 expect([...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent)).toEqual(labels);
 await click(command('Hiện trong Finder'));expect(rpc).toHaveBeenLastCalledWith('revealOutput',{id:'other'});
 vi.mocked(savePath).mockResolvedValue('/tmp/new.md');await click(trigger());await click(command('Lưu như…'));expect(rpc).toHaveBeenLastCalledWith('saveOutput',{id:'other',path:'/tmp/new.md'});expect(savePath).toHaveBeenCalledWith('copy.md');
 await click(trigger());await click(command('Xem cạnh chat'));expect(show).toHaveBeenCalledWith(action);
 vi.spyOn(window,'confirm').mockReturnValue(false);await click(trigger());await click(command('Hoàn tác'));expect(rpc).not.toHaveBeenCalledWith('undoOutput',expect.anything());
 vi.mocked(window.confirm).mockReturnValue(true);await click(trigger());await click(command('Hoàn tác'));expect(rpc).toHaveBeenLastCalledWith('undoOutput',{id:'other'});
});
it('revalidates undo after props change while menu is open, reports file error and unlocks controls',async()=>{
 await render();await click(trigger());const stale=command('Hoàn tác');
 await render({...action,state:'undone'});expect(command('Hoàn tác')).toBeUndefined();await click(stale);expect(rpc).not.toHaveBeenCalled();
 await render();vi.mocked(rpc).mockRejectedValueOnce(Error('Tệp đã bị di chuyển'));await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Mở tệp ↗')!);expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'Tệp đã bị di chuyển'}));expect(host.querySelector('[aria-busy]')!.getAttribute('aria-busy')).toBe('false');
});
it('leaves approval, decline and upload retry visible',async()=>{
 await render({...action,state:'pending',output:undefined,savedPath:undefined});
 expect(host.textContent).toContain('Bỏ qua');await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Áp dụng · Tạo tệp')!);expect(rpc).toHaveBeenLastCalledWith('approveAction',{id:'other'});
 await render({...action,uploadError:'Tải lên chưa xong'});await click([...host.querySelectorAll('button')].find(b=>b.textContent==='Thử tải lên lại')!);expect(rpc).toHaveBeenLastCalledWith('retryUpload',{id:'other'});
});
it('clicks file name or path on ActionCard to open directly',async()=>{
 await render();
 const titleNode=host.querySelector('.artifact-heading strong[role="button"]')!;
 await click(titleNode);
 expect(rpc).toHaveBeenLastCalledWith('openOutput',{id:'other'});
 const codes=host.querySelectorAll('.artifact-locations code');
 await click(codes[0]!);
 expect(rpc).toHaveBeenLastCalledWith('openOutput',{id:'other',preferSaved:false});
 await click(codes[1]!);
 expect(rpc).toHaveBeenLastCalledWith('openOutput',{id:'other',preferSaved:true});
});
