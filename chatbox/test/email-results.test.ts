// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
vi.mock('../src/ipc', () => ({rpc: vi.fn()}));
import {Markdown} from '../src/Markdown';
import {parseEmailResults, gmailSearchUrl} from '../src/email-results';

const payload = {
  nguon: 'Gmail đã kết nối (teacher@example.com)',
  luu_y_tai_khoan: 'Tài khoản kết nối khác tài khoản đã yêu cầu.',
  so_thread_tim_thay: 10,
  lien_quan_den_SSC_2026: [
    {ngay: '2026-10-19', nguoi_gui: 'organizer@example.com', tieu_de: 'SSC 2026 — Top 8', noi_dung_tom_tat: 'Chưa đọc toàn văn.', thread_id: 'opaque'},
    {ngay: '2026-10-20', nguoi_gui: 'teacher@example.com', nguoi_nhan: 'organizer@example.com', tieu_de: 'Re: SSC', chieu: 'Thư đã gửi trả lời', noi_dung: '<script>alert(1)</script>'},
  ],
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {act(() => root.unmount()); host.remove();});

it('nhận đúng mẫu JSON trong ảnh, giữ lưu ý và không coi số thread là số thẻ', () => {
  const data = parseEmailResults(JSON.stringify(payload))!;
  expect(data.items).toHaveLength(2);
  expect(data.notes).toEqual([payload.luu_y_tai_khoan]);
  expect(data.account).toBe('teacher@example.com');
  const url = gmailSearchUrl(data.items[0]!, data.account);
  expect(url).toContain('authuser=teacher%40example.com');
  expect(decodeURIComponent(url)).toContain('subject:"SSC 2026 — Top 8"');
  expect(url).not.toContain('opaque');
});

it('giữ nguyên JSON thường, JSON hỏng hoặc JSON chưa nhận đủ khi streaming', () => {
  for (const text of ['{"subject":"bài học"}', '{"emails":[', '{"emails":[]}', 'không phải JSON']) expect(parseEmailResults(text)).toBeUndefined();
  expect(parseEmailResults(JSON.stringify([{subject: 'Hello', from: 'a@example.com'}]))?.items).toHaveLength(1);
});

it('hiển thị thẻ giữa Markdown, giữ dữ liệu gốc, lọc và sao chép', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
  await act(async () => {root.render(React.createElement(Markdown, {text: `Thông tin email:\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n\nKết thúc.`}));});
  expect(host.querySelectorAll('.email-card')).toHaveLength(2);
  expect(host.textContent).toContain('Thông tin email:');
  expect(host.textContent).toContain('Kết thúc.');
  expect(host.querySelector('.email-notice')?.textContent).toContain('khác tài khoản');
  expect(host.querySelector('script')).toBeNull();
  expect(host.querySelector('.email-raw')?.textContent).toContain('so_thread_tim_thay');
  await act(async () => {(Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Sao chép tiêu đề'))!.click();});
  expect(writeText).toHaveBeenCalledWith('SSC 2026 — Top 8');
  expect(host.textContent).toContain('Đã sao chép.');
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-10-20');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
  expect(host.querySelectorAll('.email-card')).toHaveLength(1);
  expect(host.querySelector('.email-card h3')?.textContent).toBe('Re: SSC');
});

it('không dựng thẻ từ JSON trong khối ngôn ngữ khác', async () => {
  await act(async () => {root.render(React.createElement(Markdown, {text: `\`\`\`javascript\n${JSON.stringify(payload)}\n\`\`\``}));});
  expect(host.querySelector('.email-results')).toBeNull();
  expect(host.querySelector('pre')).not.toBeNull();
});

it('báo lỗi sao chép và không tự suy ra tài khoản từ người gửi', async () => {
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: vi.fn().mockRejectedValue(Error('denied'))}});
  const text = JSON.stringify({emails: [{from: 'a@example.com', subject: 'Hello'}]});
  expect(parseEmailResults(text)?.account).toBe('');
  await act(async () => {root.render(React.createElement(Markdown, {text}));});
  await act(async () => {host.querySelector('button')!.click();});
  expect(host.textContent).toContain('Không thể sao chép');
});
