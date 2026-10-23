// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {Markdown} from '../src/Markdown';
import {rpc} from '../src/ipc';
vi.mock('../src/ipc', () => ({rpc: vi.fn()}));
vi.mock('mermaid', () => ({default: {initialize: vi.fn(), render: vi.fn(async (_id: string, code: string) => {
  if (code.includes('LOI')) throw new Error('cú pháp sai');
  return {svg: '<svg data-test="ok"></svg>'};
})}}));
let host: HTMLDivElement, root: Root;
const show = (text: string) => act(async () => root.render(React.createElement(Markdown, {text})));
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(rpc).mockReset();
  vi.mocked(rpc).mockResolvedValue({name: 'a.mp3', data: 'data:audio/mpeg;base64,YQ=='});
});
afterEach(async () => {await act(async () => root.unmount()); host.remove();});
it('vẽ sơ đồ mermaid và có nút lưu SVG', async () => {
  await show('```mermaid\ngraph TD; A-->B\n```');
  expect(host.querySelector('svg[data-test=ok]')).not.toBeNull();
  expect(host.textContent).toContain('Lưu SVG');
});
it('báo lỗi rõ khi sơ đồ sai, vẫn giữ mã', async () => {
  await show('```mermaid\nLOI\n```');
  expect(host.textContent).toContain('Không thể vẽ sơ đồ: cú pháp sai');
  expect(host.querySelector('pre')?.textContent).toContain('LOI');
});
it('khối html chạy trong iframe sandbox không script', async () => {
  await show('```html\n<h1>Xin chào</h1><script>alert(1)</script>\n```');
  const frame = host.querySelector('iframe')!;
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('srcdoc')).toContain('<h1>Xin chào</h1>');
  expect(host.querySelector('details pre')?.textContent).toContain('Xin chào');
});
it('phát âm thanh cục bộ qua fileMediaPreview', async () => {
  await show('[Bài nghe](/tmp/a.mp3)');
  expect(rpc).toHaveBeenCalledWith('fileMediaPreview', {path: '/tmp/a.mp3'});
  expect(host.querySelector('audio')?.getAttribute('src')).toBe('data:audio/mpeg;base64,YQ==');
});
it('phát video file URL, báo lỗi khi không đọc được', async () => {
  vi.mocked(rpc).mockRejectedValue(Error('Tệp lớn hơn 25 MB'));
  await show('![Clip](file:///tmp/clip.mp4)');
  expect(rpc).toHaveBeenCalledWith('fileMediaPreview', {path: '/tmp/clip.mp4'});
  expect(host.textContent).toContain('Tệp lớn hơn 25 MB');
});
it('không tải media từ địa chỉ mạng và không tự thêm script/iframe từ HTML thô', async () => {
  await show('[Nghe](https://example.com/a.mp3)\n\n<iframe src="https://evil"></iframe><script>x()</script>');
  expect(rpc).not.toHaveBeenCalled();
  expect(host.querySelector('audio')).toBeNull();
  expect(host.querySelector('iframe')).toBeNull();
  expect(host.querySelector('script')).toBeNull();
  expect(host.textContent).toContain('Chỉ phát được tệp trên máy này');
});
