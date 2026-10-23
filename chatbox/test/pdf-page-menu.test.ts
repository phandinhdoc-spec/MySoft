// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import PdfWorkspace from '../src/PdfWorkspace';
import {readPdf,writePdf} from '../src/pdfio';
import {buildPdf} from '../src/pdfedit';
import {pickFiles,savePath} from '../src/ipc';
vi.mock('../src/ipc',()=>({pickFiles:vi.fn(),savePath:vi.fn()}));
vi.mock('../src/pdfio',()=>({readPdf:vi.fn(),writePdf:vi.fn(),vietnameseFont:vi.fn()}));
vi.mock('../src/pdfedit',async original=>({...await original<typeof import('../src/pdfedit')>(),buildPdf:vi.fn()}));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:3,getPage:async()=>({getViewport:()=>({width:500,height:700}),rotate:0}),destroy:vi.fn()})})}));
let host:HTMLDivElement,root:Root;
const report=vi.fn(),notice=vi.fn(),onAsk=vi.fn(),onRegion=vi.fn(),onAskRegion=vi.fn(),onSaved=vi.fn();
const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
const command=(s:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b=>b.textContent?.startsWith(s))!;
const pages=()=>[...host.querySelectorAll<HTMLElement>('.pdf-page-wrap')];
const menu=async(pos:number)=>click(pages()[pos]!.querySelector('.object-menu-trigger')!);
const button=(s:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.startsWith(s))!;
const render=()=>act(async()=>root.render(React.createElement(PdfWorkspace,{path:'/tmp/sample.pdf',name:'sample.pdf',onClose:vi.fn(),onAsk,onSaved,notice,report,onRegion,onAskRegion})));
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();
 vi.stubGlobal('IntersectionObserver',class {observe(){}disconnect(){}});
 vi.mocked(readPdf).mockResolvedValue(new Uint8Array([1]));vi.mocked(buildPdf).mockResolvedValue(new Uint8Array([2]));vi.mocked(writePdf).mockResolvedValue('/tmp/saved.pdf');vi.mocked(savePath).mockResolvedValue('/tmp/saved.pdf');vi.spyOn(window,'confirm').mockReturnValue(false);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();window.getSelection()?.removeAllRanges();});
it('uses the same page menu from right click and ellipsis, reorders, rotates and saves by source identity',async()=>{
 await render();expect(pages()).toHaveLength(3);await menu(1);expect(document.querySelectorAll('[role=menuitem]')).toHaveLength(5);
 const middle=pages()[1]!;await act(async()=>middle.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await click(command('Đưa lên trước'));expect(pages()[0]).toBe(middle);
 await menu(0);expect(command('Đưa lên trước').getAttribute('aria-disabled')).toBe('true');await click(command('Xoay phải'));
 await menu(0);await click(command('Đưa xuống sau'));expect(pages()[1]).toBe(middle);
 await click(button('Lưu ▾'));await click(button('Lưu thành tệp mới…'));
 expect(buildPdf).toHaveBeenLastCalledWith(expect.anything(),[{doc:0,index:0,rot:0},{doc:0,index:1,rot:90},{doc:0,index:2,rot:0}],[],expect.any(Function));expect(writePdf).toHaveBeenCalledWith('/tmp/saved.pdf',new Uint8Array([2]));
 expect(host.textContent).not.toContain('chưa lưu');expect(report).not.toHaveBeenCalled();
});
it('delete last page is disabled; undo restores ordering and save reflects restored pages',async()=>{
 await render();await menu(1);await click(command('Xóa trang'));await menu(1);await click(command('Xóa trang'));expect(pages()).toHaveLength(1);
 await menu(0);expect(command('Xóa trang').getAttribute('aria-disabled')).toBe('true');await click(command('Xóa trang'));expect(pages()).toHaveLength(1);
 await click(button('↶Hoàn tác'));expect(pages()).toHaveLength(2);await click(button('↶Hoàn tác'));expect(pages()).toHaveLength(3);
 await click(button('Lưu ▾'));await click(button('Lưu thành tệp mới…'));expect(vi.mocked(buildPdf).mock.calls[0]![1].map(p=>p.index)).toEqual([0,1,2]);
});
it('keeps native text selection and edit fields; page menu does not consume drawing pointer events',async()=>{
 await render();const page=pages()[0]!,text=document.createElement('span');text.textContent='Văn bản PDF';page.append(text);
 const range=document.createRange();range.selectNodeContents(text);window.getSelection()!.addRange(range);
 const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});await act(async()=>text.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);expect(document.querySelector('[role=menu]')).toBeNull();
 await menu(0);expect(command('Xoay trái')).toBeTruthy();
 const pointer=new MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0});await act(async()=>page.dispatchEvent(pointer));expect(pointer.defaultPrevented).toBe(false);
 expect(host.querySelector('[title^="Khoanh vùng"]')).toBeTruthy();expect(host.querySelector('[aria-label="Đi tới trang"]')).toBeTruthy();expect(host.querySelector('[aria-label="Phóng to"]')).toBeTruthy();
});
it('a menu still targets the original source page after undo changes its position',async()=>{
 await render();const original=pages()[1]!;await menu(1);await click(command('Đưa lên trước'));await menu(0);
 await click(button('↶Hoàn tác'));expect(pages()[1]).toBe(original);await click(command('Xoay trái'));
 await click(button('Lưu ▾'));await click(button('Lưu thành tệp mới…'));expect(vi.mocked(buildPdf).mock.calls[0]![1]).toEqual([{doc:0,index:0,rot:0},{doc:0,index:1,rot:270},{doc:0,index:2,rot:0}]);
});
it('failed load shows an alert, and failed save reports the error while retaining undo',async()=>{
 vi.mocked(readPdf).mockRejectedValueOnce(Error('Không đọc được tệp'));await render();expect(host.querySelector('[role=alert]')?.textContent).toContain('Không đọc được tệp');expect(pages()).toHaveLength(0);
 await act(async()=>root.unmount());root=createRoot(host);await render();await menu(0);await click(command('Xoay phải'));vi.mocked(writePdf).mockRejectedValueOnce(Error('Không có quyền ghi'));
 await click(button('Lưu ▾'));await click(button('Lưu thành tệp mới…'));expect(report).toHaveBeenCalledWith(expect.objectContaining({message:'Không có quyền ghi'}));expect(button('Lưu ▾').disabled).toBe(false);expect(button('↶Hoàn tác').disabled).toBe(false);expect(host.textContent).toContain('chưa lưu');
});
