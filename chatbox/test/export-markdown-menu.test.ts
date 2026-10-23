// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),savePath:vi.fn()}));
vi.mock('../src/ipc',()=>mocks);
vi.mock('../src/Markdown',()=>({Markdown:({text}:{text:string})=>React.createElement('p',null,text)}));
import {MathWorkshop} from '../src/MathWorkshop';
import {MarkdownEditor} from '../src/MarkdownEditor';
let host:HTMLDivElement,root:Root;
const report=vi.fn(),notice=vi.fn(),saved=vi.fn(),close=vi.fn();
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
const click=async(text:string)=>{expect(button(text),text).toBeTruthy();await act(async()=>button(text).click());};
const openExport=async()=>act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Xuất học liệu"]')!.click());
const menuItem=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.startsWith(text))!;
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
 mocks.rpc.mockReset();mocks.savePath.mockReset();report.mockReset();notice.mockReset();saved.mockReset();close.mockReset();
 mocks.rpc.mockImplementation(async(method,params)=>method==='math.list'?[]:method==='math.save'?params.worksheet:method==='outputLocation'?{dir:'/output'}:{path:'/output/copy.md'});
 mocks.savePath.mockResolvedValue(null);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
const math=async()=>act(async()=>root.render(React.createElement(MathWorkshop,{notice,report,onPrompt:vi.fn()})));
const draft={chatId:'chat',name:'draft.md',content:'Nội dung gốc'};
const markdown=async()=>act(async()=>root.render(React.createElement(MarkdownEditor,{draft,onClose:close,onSaved:saved})));
const input=async(el:HTMLInputElement|HTMLTextAreaElement,text:string)=>act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));});
it('offers the same export formats by click and right click; cancelling a save writes nothing',async()=>{
 await math();expect(button('Xuất…')).toBeTruthy();expect(button('Xuất Word')).toBeUndefined();await openExport();const labels=[...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent);expect(labels).toEqual(['Word (.docx)','PowerPoint (.pptx)','Excel (.xlsx)','Hình SVG (.svg)']);
 await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await act(async()=>button('Xuất…').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent)).toEqual(labels);
 await click('Word (.docx)');expect(mocks.savePath).toHaveBeenCalled();expect(mocks.rpc.mock.calls.some(c=>c[0]==='math.export')).toBe(false);expect(notice).not.toHaveBeenCalled();
});
it('exports SVG through the existing RPC and returns to idle after a failure',async()=>{
 await math();mocks.savePath.mockResolvedValue('/output/figure.svg');await openExport();await click('Hình SVG (.svg)');
 expect(mocks.rpc).toHaveBeenCalledWith('math.export',expect.objectContaining({path:'/output/figure.svg',audience:'student',svg:expect.stringContaining('<svg')}));expect(notice).toHaveBeenCalledWith('Đã xuất /output/figure.svg');
 mocks.savePath.mockRejectedValueOnce(Error('Không có quyền ghi'));await openExport();await click('Excel (.xlsx)');expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'Không có quyền ghi'}));await openExport();expect(menuItem('Excel').getAttribute('aria-disabled')).toBe('false');
});
it('rechecks format restrictions while a menu is open and keeps undo/redo and save',async()=>{
 await math();await click('Đoán trước khi kéo');await openExport();expect(menuItem('Word').getAttribute('aria-disabled')).toBe('true');await act(async()=>menuItem('Word').click());expect(mocks.savePath).not.toHaveBeenCalled();expect(menuItem('Excel').getAttribute('aria-disabled')).toBe('false');
 await click('Kết thúc hoạt động');await click('Hình vẽ');await openExport();expect(menuItem('Excel').getAttribute('aria-disabled')).toBe('true');await act(async()=>menuItem('Excel').click());expect(mocks.savePath).not.toHaveBeenCalled();
 await click('Hoàn tác');await openExport();expect(menuItem('Excel').getAttribute('aria-disabled')).toBe('false');await click('Làm lại');await click('Lưu học liệu');expect(mocks.rpc).toHaveBeenCalledWith('math.save',expect.objectContaining({worksheet:expect.objectContaining({kind:'geometry'})}));
 await click('Biến thể bài toán');await openExport();expect(menuItem('Hình SVG')).toBeUndefined();
});
it('blocks repeated exports while a save dialog is pending',async()=>{
 await math();let resolve!:(path:null)=>void;mocks.savePath.mockImplementation(()=>new Promise(r=>{resolve=r;}));await openExport();await click('Excel (.xlsx)');await openExport();expect(menuItem('Excel').getAttribute('aria-disabled')).toBe('true');await act(async()=>menuItem('Excel').click());expect(mocks.savePath).toHaveBeenCalledTimes(1);await act(async()=>resolve(null));
});
it('keeps the formatting toolbar and native text menu; preview and close share the object menu',async()=>{
 await markdown();expect(button('Đậm')).toBeTruthy();expect(button('Bảng')).toBeTruthy();const text=host.querySelector('textarea')!;
 const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});await act(async()=>text.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);expect(document.querySelector('[role=menu]')).toBeNull();
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác bản nháp Markdown"]')!.click());const labels=[...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent);
 await act(async()=>document.querySelector('[role=menu]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await act(async()=>host.querySelector('[role=dialog]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect([...document.querySelectorAll('[role=menuitem]')].map(e=>e.textContent)).toEqual(labels);
 await click('Xem trước');expect(host.querySelector('textarea')).toBeNull();await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác bản nháp Markdown"]')!.click());await click('Sửa Markdown');expect(host.querySelector('textarea')!.value).toBe(draft.content);
});
it('preserves dirty-close confirmation and saves the edited copy with the current filename',async()=>{
 await markdown();await input(host.querySelector('textarea')!,'Bản đã sửa');await input(host.querySelector('input')!,'copy.md');vi.spyOn(window,'confirm').mockReturnValue(false);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Thao tác bản nháp Markdown"]')!.click());await click('Đóng bản nháp');expect(window.confirm).toHaveBeenCalledWith('Đóng bản nháp chưa lưu?');expect(close).not.toHaveBeenCalled();
 await click('Lưu bản Markdown mới và đính kèm');expect(mocks.rpc).toHaveBeenCalledWith('saveDraft',{chatId:'chat',name:'copy.md',content:'Bản đã sửa'});expect(saved).toHaveBeenCalledWith('/output/copy.md');
});
it('shows a save error and keeps the draft available for retry',async()=>{
 await markdown();mocks.rpc.mockRejectedValueOnce(Error('Đĩa đầy'));await click('Lưu bản Markdown mới và đính kèm');expect(host.querySelector('[role=alert]')?.textContent).toContain('Đĩa đầy');expect(host.querySelector('textarea')!.value).toBe(draft.content);expect(saved).not.toHaveBeenCalled();expect(button('Lưu bản Markdown mới và đính kèm').disabled).toBe(false);
});
it('routes Word, PowerPoint and Excel exports with the current worksheet and audience',async()=>{
 await math();await click('Biến thể bài toán');const audience=host.querySelector<HTMLSelectElement>('[aria-label="Bản xuất"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(audience,'teacher');audience.dispatchEvent(new Event('change',{bubbles:true}));});
 for(const [label,extension] of [['Word (.docx)','docx'],['PowerPoint (.pptx)','pptx'],['Excel (.xlsx)','xlsx']]){
  mocks.savePath.mockResolvedValueOnce('/output/worksheet.'+extension);await openExport();await click(label!);
  expect(mocks.rpc).toHaveBeenCalledWith('math.export',expect.objectContaining({path:'/output/worksheet.'+extension,audience:'teacher',worksheet:expect.objectContaining({kind:'variants'})}));
 }
});
