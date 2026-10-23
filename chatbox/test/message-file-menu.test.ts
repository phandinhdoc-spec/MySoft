// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MessageContent} from '../src/MessageContent';
import {AttachmentChip} from '../src/AttachmentChip';
import {rpc,type Message,type ViewState} from '../src/ipc';
vi.mock('../src/ipc',()=>({rpc:vi.fn()}));
let host:HTMLDivElement,root:Root;
const report=vi.fn(),notice=vi.fn(),onDraft=vi.fn(),onPdf=vi.fn(),onProject=vi.fn(),copy=vi.fn();
const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
const command=(s:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent===s)!;
const trigger=()=>host.querySelector<HTMLButtonElement>('.object-menu-trigger')!;
const file={id:'f-other',name:'Đề.md',path:'/tmp/Đề.md',scope:'chat',scopeId:'c',segments:[],fingerprint:'x'} as ViewState['data']['attachments'][number];
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();copy.mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();window.getSelection()?.removeAllRanges();vi.useRealTimers();vi.restoreAllMocks();});
it('retains selected text and native copy menu, offers full copy and feedback for the correct message',async()=>{
 const message={id:'m-other',role:'assistant',text:'Một đoạn để sao chép',at:1} as Message;
 await act(async()=>root.render(React.createElement(MessageContent,{message,chatId:'other',report,notice},React.createElement('p',null,message.text))));
 const text=host.querySelector('p')!.firstChild!,range=document.createRange();range.setStart(text,0);range.setEnd(text,8);window.getSelection()!.addRange(range);
 const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});await act(async()=>host.querySelector('p')!.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);expect(window.getSelection()!.toString()).toBe('Một đoạn');
 await click(trigger());expect(command('Sao chép')).toBeTruthy();await click(command('Sao chép'));expect(copy).toHaveBeenCalledWith(message.text);
 vi.mocked(rpc).mockResolvedValue({queued:true});
 await click(trigger());await click(command('Góp ý'));
 const box=document.querySelector<HTMLTextAreaElement>('dialog textarea')!;expect(box).toBeTruthy();expect(rpc).not.toHaveBeenCalled();
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(box,'Viết ngắn hơn');box.dispatchEvent(new Event('input',{bubbles:true}));});
 await click([...document.querySelectorAll<HTMLButtonElement>('dialog .tpl-actions button')].find(b=>b.textContent==='Gửi')!);
 expect(rpc).toHaveBeenCalledWith('feedback',{chatId:'other',text:'Viết ngắn hơn',about:message.text});
 expect(document.querySelector('dialog')).toBeNull();
});
it('file menu keeps open/edit/project/remove bound to the selected attachment and confirmation',async()=>{
 await act(async()=>root.render(React.createElement(AttachmentChip,{file,chatId:'c',report,onDraft,onPdf,onProject})));
 await click(trigger());const labels=[...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent);
 await act(async()=>host.querySelector('.attachment-chip')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 expect([...document.querySelectorAll('[role=menuitem]')].map(b=>b.textContent)).toEqual(labels);
 await click(command('Thêm vào dự án'));expect(onProject).toHaveBeenCalledOnce();expect(onPdf).not.toHaveBeenCalled();
 vi.spyOn(window,'confirm').mockReturnValue(false);await click(trigger());await click(command('Gỡ khỏi hội thoại'));expect(rpc).not.toHaveBeenCalled();
 vi.mocked(window.confirm).mockReturnValue(true);vi.mocked(rpc).mockRejectedValueOnce(Error('Tệp không còn tồn tại'));
 await click(trigger());await click(command('Gỡ khỏi hội thoại'));expect(rpc).toHaveBeenCalledWith('removeAttachment',{id:file.id});expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'Tệp không còn tồn tại'}));
});
it('clicking the file name opens read-only preview and reports a missing file without blocking menus',async()=>{
 vi.mocked(rpc).mockRejectedValue(Error('Không có quyền đọc tệp'));
 await act(async()=>root.render(React.createElement(AttachmentChip,{file,chatId:'c',report,onDraft,onPdf})));
 await click(host.querySelector('[data-file-open]')!);expect(rpc).toHaveBeenCalledWith('fileQuickPreview',{path:file.path});expect(document.querySelector('[role=alert]')?.textContent).toContain('Không có quyền đọc tệp');
 await click(trigger());expect(command('Gỡ khỏi hội thoại')).toBeTruthy();
});
it('PDF name opens PDF while editing remains an explicit menu command',async()=>{
 await act(async()=>root.render(React.createElement(AttachmentChip,{file:{...file,name:'Đề.pdf',path:'/tmp/Đề.pdf'},chatId:'c',report,onDraft,onPdf})));
 await click(host.querySelector('[data-file-open]')!);expect(onPdf).toHaveBeenCalledOnce();expect(rpc).not.toHaveBeenCalled();
 const edit=vi.fn();window.addEventListener('pvta-edit-file',edit);
 await click(trigger());await click(command('Chỉnh sửa'));expect(edit.mock.calls[0]![0].detail.path).toBe('/tmp/Đề.pdf');window.removeEventListener('pvta-edit-file',edit);
});
it('opens attachment preview only after dwelling, cancels a pass-over and pending work on unmount',async()=>{
 vi.useFakeTimers();vi.mocked(rpc).mockResolvedValue({name:file.name,segments:[]});
 await act(async()=>root.render(React.createElement(AttachmentChip,{file,chatId:'c',report,onDraft,onPdf})));
 const anchor=host.querySelector('.quick-file-anchor')!;
 const hover=async(type:string)=>act(async()=>{anchor.dispatchEvent(new MouseEvent(type,{bubbles:true,relatedTarget:document.body}));});
 await hover('mouseover');await act(async()=>vi.advanceTimersByTime(100));await hover('mouseout');await act(async()=>vi.advanceTimersByTime(1000));
 expect(rpc).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="Xem nhanh tệp"]')).toBeNull();
 await hover('mouseover');await act(async()=>vi.advanceTimersByTime(349));expect(rpc).not.toHaveBeenCalled();
 await act(async()=>vi.advanceTimersByTime(1));expect(rpc).toHaveBeenCalledExactlyOnceWith('fileQuickPreview',{path:file.path});
 expect(document.querySelector('[aria-label="Xem nhanh tệp"]')).not.toBeNull();
 await hover('mouseout');await act(async()=>vi.advanceTimersByTime(250));expect(document.querySelector('[aria-label="Xem nhanh tệp"]')).toBeNull();
 await hover('mouseover');await act(async()=>root.render(null));await act(async()=>vi.advanceTimersByTime(1000));expect(rpc).toHaveBeenCalledTimes(1);
});
