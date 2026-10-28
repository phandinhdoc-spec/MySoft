// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';

const mocks = vi.hoisted(() => ({rpc: vi.fn()}));
vi.mock('../src/ipc', () => mocks);

import {Markdown, fileRefOf} from '../src/Markdown';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.rpc.mockReset();
  (HTMLDialogElement.prototype as any).showModal ??= function (this: HTMLDialogElement) {this.setAttribute('open', '');};
  mocks.rpc.mockResolvedValue({path: '/x'});
});
afterEach(() => {act(() => root.unmount()); host.remove();});

describe('tên tệp trong Markdown', () => {
  it('nhận diện tên tệp và đường dẫn, bỏ qua liên kết web và chữ thường', () => {
    expect(fileRefOf('Giao-an.docx')).toBe('Giao-an.docx');
    expect(fileRefOf('/Users/a/MySoft/bao-cao.xlsx')).toBe('/Users/a/MySoft/bao-cao.xlsx');
    expect(fileRefOf('C:\\Docs\\de.pdf')).toBe('C:\\Docs\\de.pdf');
    expect(fileRefOf('https://x.vn/a.pdf')).toBeUndefined();
    expect(fileRefOf('npm run build')).toBeUndefined();
    expect(fileRefOf('anh-bia.PNG')).toBe('anh-bia.PNG');
    expect(fileRefOf('/Users/a/hinh.jpg')).toBe('/Users/a/hinh.jpg');
    expect(fileRefOf('index.ts')).toBeUndefined();
  });

  it('nhấp đúp vào code là mở tệp qua openFileRef kèm chatId; code trong khối mã thì không', async () => {
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Xem `Giao-an.docx` và `npm test`.\n\n```\nx.docx\n```', chatId: 'c1'}));});
    const refs = host.querySelectorAll<HTMLElement>('.pvta-file-ref');
    expect(refs).toHaveLength(1);
    expect(refs[0]!.getAttribute('role')).toBe('button');
    await act(async () => {refs[0]!.click();});
    expect(mocks.rpc).not.toHaveBeenCalled();
    await act(async () => {refs[0]!.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true}));});
    expect(mocks.rpc).toHaveBeenCalledWith('openFileRef', {ref: 'Giao-an.docx', chatId: 'c1'});
  });

  it('liên kết cục bộ cũng mở tệp, liên kết web không bị đổi', async () => {
    await act(async () => {root.render(React.createElement(Markdown, {text: '[Đề](/Users/a/de.pdf) và [Web](https://example.com)', chatId: 'c1'}));});
    expect(host.querySelectorAll('.pvta-file-ref')).toHaveLength(1);
    await act(async () => {host.querySelector<HTMLElement>('.pvta-file-ref')!.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true}));});
    expect(mocks.rpc).toHaveBeenCalledWith('openFileRef', {ref: '/Users/a/de.pdf', chatId: 'c1'});
  });

  it('chuột phải vào tên tệp hiện menu, chọn «Mở thư mục chứa tệp» gọi revealFileRef', async () => {
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Xem `Giao-an.docx`.', chatId: 'c1'}));});
    const node = host.querySelector<HTMLElement>('.pvta-file-ref')!;
    await act(async () => {node.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 10, clientY: 10}));});
    const items = Array.from(document.querySelectorAll<HTMLElement>('.object-menu [role="menuitem"]'));
    expect(items.map(i => i.textContent)).toEqual(expect.arrayContaining(['Mở tệp', 'Mở thư mục chứa tệp']));
    await act(async () => {items.find(i => i.textContent === 'Mở thư mục chứa tệp')!.click();});
    expect(mocks.rpc).toHaveBeenCalledWith('revealFileRef', {ref: 'Giao-an.docx', chatId: 'c1'});
    expect(mocks.rpc).not.toHaveBeenCalledWith('openFileRef', expect.anything());
  });

  it('chuột phải ngoài tên tệp không hiện menu của tệp', async () => {
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Chữ thường `npm test`.', chatId: 'c1'}));});
    await act(async () => {host.querySelector('code')!.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}));});
    expect(document.querySelector('.object-menu')).toBeNull();
  });
  it('nhấp đúp tên ảnh thì xem trong khung ảnh lớn của chat, không mở ứng dụng ngoài', async () => {
    mocks.rpc.mockResolvedValue({path: '/x/Anh-bia.png', name: 'Anh-bia.png', data: 'data:image/png;base64,AAAA'});
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Xem `Anh-bia.png`.', chatId: 'c1'}));});
    await act(async () => {host.querySelector<HTMLElement>('.pvta-file-ref')!.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true}));});
    expect(mocks.rpc).toHaveBeenCalledWith('previewFileRef', {ref: 'Anh-bia.png', chatId: 'c1'});
    expect(mocks.rpc).not.toHaveBeenCalledWith('openFileRef', expect.anything());
    const dialog = document.querySelector('dialog.markdown-image-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('ảnh không đọc được thì tên tệp báo lỗi và không mở khung', async () => {
    mocks.rpc.mockRejectedValue(new Error('Ảnh lớn hơn 15 MB'));
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Xem `to.jpg`.', chatId: 'c1'}));});
    const node = host.querySelector<HTMLElement>('.pvta-file-ref')!;
    await act(async () => {node.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true}));});
    expect(node.classList.contains('pvta-file-ref-error')).toBe(true);
    expect(node.title).toContain('15 MB');
    expect(document.querySelector('dialog.markdown-image-dialog')).toBeNull();
  });

  it('menu chuột phải của ảnh có «Xem ảnh lớn» và «Mở bằng ứng dụng ngoài»', async () => {
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Xem `a.png`.', chatId: 'c1'}));});
    await act(async () => {host.querySelector<HTMLElement>('.pvta-file-ref')!.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 5, clientY: 5}));});
    const items = Array.from(document.querySelectorAll<HTMLElement>('.object-menu [role="menuitem"]')).map(i => i.textContent);
    expect(items).toEqual(expect.arrayContaining(['Xem ảnh lớn', 'Mở bằng ứng dụng ngoài', 'Mở thư mục chứa tệp']));
    await act(async () => {Array.from(document.querySelectorAll<HTMLElement>('.object-menu [role="menuitem"]')).find(i => i.textContent === 'Mở bằng ứng dụng ngoài')!.click();});
    expect(mocks.rpc).toHaveBeenCalledWith('openFileRef', {ref: 'a.png', chatId: 'c1'});
  });

  it('menu chuột phải của tệp Office có «Mở bằng Microsoft Office» và «Mở bằng Visual Studio Code»', async () => {
    await act(async () => {root.render(React.createElement(Markdown, {text: 'Xem `Bang-diem.xlsx` và `ghi-chu.md`.', chatId: 'c1'}));});
    const open = async (n: number) => {
      await act(async () => {host.querySelectorAll<HTMLElement>('.pvta-file-ref')[n]!.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 5, clientY: 5}));});
      return Array.from(document.querySelectorAll<HTMLElement>('.object-menu [role="menuitem"]'));
    };
    let items = await open(0);
    expect(host.querySelectorAll<HTMLElement>('.pvta-file-ref')[0]!.dataset.pvtaFileKind).toBe('excel');
    expect(items.map(i => i.textContent)).toEqual(expect.arrayContaining(['Mở bằng Microsoft Office', 'Mở bằng Visual Studio Code', 'Xem & chỉnh sửa trong PVTA']));
    await act(async () => {items.find(i => i.textContent === 'Mở bằng Microsoft Office')!.click();});
    expect(mocks.rpc).toHaveBeenCalledWith('openFileRef', {ref: 'Bang-diem.xlsx', chatId: 'c1', app: 'office'});
    items = await open(1);
    expect(items.map(i => i.textContent)).not.toContain('Mở bằng Microsoft Office');
    expect(items.map(i => i.textContent)).toContain('Xem & chỉnh sửa trong PVTA');
    await act(async () => {items.find(i => i.textContent === 'Mở bằng Visual Studio Code')!.click();});
    expect(mocks.rpc).toHaveBeenCalledWith('openFileRef', {ref: 'ghi-chu.md', chatId: 'c1', app: 'vscode'});
  });

  it('bấm chuột một lần vào tên tệp mở ngay menu Xem + Chỉnh sửa; chọn Xem & chỉnh sửa trong PVTA gọi resolveFileRef và mở trình sửa', async () => {
    mocks.rpc.mockResolvedValue({path: '/Users/a/Giao-an.docx', name: 'Giao-an.docx'});
    const edited: string[] = [];
    const onEdit = (e: Event) => edited.push((e as CustomEvent).detail.path);
    window.addEventListener('pvta-edit-file', onEdit);
    try {
      await act(async () => {root.render(React.createElement(Markdown, {text: 'Đã tạo `Giao-an.docx`.', chatId: 'c1'}));});
      const node = host.querySelector<HTMLElement>('.pvta-file-ref')!;
      await act(async () => {node.click();});
      const items = Array.from(document.querySelectorAll<HTMLElement>('.object-menu [role="menuitem"]'));
      expect(items.map(i => i.textContent)).toEqual(expect.arrayContaining(['Mở tệp', 'Xem & chỉnh sửa trong PVTA', 'Mở bằng Microsoft Office']));
      await act(async () => {items.find(i => i.textContent === 'Xem & chỉnh sửa trong PVTA')!.click();});
      expect(mocks.rpc).toHaveBeenCalledWith('resolveFileRef', {ref: 'Giao-an.docx', chatId: 'c1'});
      expect(edited).toEqual(['/Users/a/Giao-an.docx']);
    } finally {
      window.removeEventListener('pvta-edit-file', onEdit);
    }
  });
});
