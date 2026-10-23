// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Markdown} from '../src/Markdown';
import {rpc} from '../src/ipc';
vi.mock('../src/ipc', () => ({rpc: vi.fn()}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(rpc).mockReset();
  vi.mocked(rpc).mockResolvedValue({name: 'Mẫu.png', segments: [], image: true, data: 'data:image/png;base64,YQ=='});
  HTMLDialogElement.prototype.showModal = function() {this.setAttribute('open', '');};
});
it('ảnh base64 từ công cụ hiện trong câu trả lời và mở được ảnh lớn bằng bàn phím', async () => {
  await act(async () => root.render(React.createElement(Markdown, {text: '![Ảnh từ công cụ AI](data:image/png;base64,YQ==)'})));
  expect(host.querySelector('img')?.src).toBe('data:image/png;base64,YQ==');
  expect(rpc).not.toHaveBeenCalled();
  await act(async () => {host.querySelector('img')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));});
  expect(document.querySelector('dialog[open] img')?.getAttribute('src')).toBe('data:image/png;base64,YQ==');
  await act(async () => {document.querySelector<HTMLButtonElement>('dialog button')!.click();});
  expect(document.querySelector('dialog')).toBeNull();
});
it('giữ bộ lọc HTML và không coi URL mạng là đường dẫn tệp', async () => {
  await act(async () => root.render(React.createElement(Markdown, {text: '<img src="javascript:alert(1)" onerror="alert(1)">\n\n![Ảnh](//example.com/image.png)'})));
  expect(host.innerHTML).not.toContain('onerror=');
  expect(host.innerHTML).not.toContain('javascript:');
  expect(rpc).not.toHaveBeenCalled();
});
it('giải mã tên tệp có dấu và khoảng trắng trong đường dẫn tuyệt đối', async () => {
  await act(async () => root.render(React.createElement(Markdown, {text: '![Mẫu](/tmp/M%E1%BA%ABu%20CLI.png)'})));
  expect(rpc).toHaveBeenCalledWith('fileQuickPreview', {path: '/tmp/Mẫu CLI.png'});
});
afterEach(async () => {await act(async () => root.unmount()); host.remove();});
it('hiển thị ảnh file URL trong câu trả lời qua preview hiện có', async () => {
  await act(async () => root.render(React.createElement(Markdown, {text: '![Mẫu CLI](file:///tmp/M%E1%BA%ABu.png)'})));
  expect(rpc).toHaveBeenCalledWith('fileQuickPreview', {path: '/tmp/Mẫu.png'});
  expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,YQ==');
});
it('báo rõ khi ảnh không đọc được, không để ảnh trống', async () => {
  vi.mocked(rpc).mockRejectedValue(Error('Tệp không tồn tại'));
  await act(async () => root.render(React.createElement(Markdown, {text: '![Mẫu CLI](/tmp/missing.png)'})));
  expect(host.textContent).toContain('Không thể hiển thị ảnh');
  expect(host.textContent).toContain('Tệp không tồn tại');
});
