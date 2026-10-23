// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  pickFiles: vi.fn(),
  savePath: vi.fn()
}));

vi.mock('../src/ipc', () => mocks);

import {Markdown} from '../src/Markdown';
import {MarkdownEditor} from '../src/MarkdownEditor';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.rpc.mockReset();
  mocks.pickFiles.mockReset();
  mocks.rpc.mockImplementation(async (method: string) => {
    if (method === 'outputLocation') return {dir: '/Users/test/Output'};
    if (method === 'saveDraft') return {path: '/Users/test/Output/saved.md'};
    if (method === 'fileQuickPreview') return {data: 'data:image/png;base64,mockImage'};
    return {};
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('Markdown Component Nâng cao', () => {
  it('biến task [ ] thành ô checkbox tương tác và gọi onToggleTask khi click', async () => {
    const onToggle = vi.fn();
    const md = `- [ ] Bài tập 1\n- [x] Bài tập 2`;

    await act(async () => {
      root.render(React.createElement(Markdown, {text: md, onToggleTask: onToggle}));
    });

    const checkboxes = host.querySelectorAll<HTMLInputElement>('input.task-checkbox');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);
    expect(checkboxes[0]?.getAttribute('data-task-index')).toBe('0');
    expect(checkboxes[1]?.getAttribute('data-task-index')).toBe('1');

    // Click checkbox 0
    await act(async () => {
      checkboxes[0]?.click();
    });
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('tạo nút cuộn vào / sổ ra cho các danh sách và enum có mục con', async () => {
    const md = `
1. Khâu 1: Chuẩn bị
   - Bước 1.1: Đọc tài liệu
   - Bước 1.2: Soạn ma trận
2. Khâu 2: Thực hiện
`;
    await act(async () => {
      root.render(React.createElement(Markdown, {text: md}));
    });

    const liWithChild = host.querySelector('li.has-child-list');
    expect(liWithChild).toBeTruthy();

    const toggleBtn = liWithChild?.querySelector<HTMLButtonElement>('.list-toggle-btn');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn?.textContent).toBe('▾');

    // Click toggle to collapse
    await act(async () => {
      toggleBtn?.click();
    });
    expect(liWithChild?.classList.contains('collapsed')).toBe(true);
    expect(toggleBtn?.textContent).toBe('▸');

    // Click toggle again to expand
    await act(async () => {
      toggleBtn?.click();
    });
    expect(liWithChild?.classList.contains('collapsed')).toBe(false);
    expect(toggleBtn?.textContent).toBe('▾');
  });

  it('hiển thị màu luân phiên (xanh, đỏ, tím...) cho các link gần nhau trong cùng đoạn', async () => {
    const md = `Các liên kết: [Link 1](https://a.com) và [Link 2](https://b.com) và [Link 3](https://c.com)`;

    await act(async () => {
      root.render(React.createElement(Markdown, {text: md}));
    });

    const links = host.querySelectorAll('a');
    expect(links.length).toBe(3);
    expect(links[0]?.classList.contains('link-color-0')).toBe(true); // Xanh dương
    expect(links[1]?.classList.contains('link-color-1')).toBe(true); // Đỏ
    expect(links[2]?.classList.contains('link-color-2')).toBe(true); // Tím
  });

  it('tự động nhận diện và gán badge cho các ô bảng mức độ NB, TH, VD, VDC', async () => {
    const md = `
| Chủ đề | Mức độ | YCCĐ |
| --- | --- | --- |
| Từ trường | NB | Nhận biết từ trường |
| Nam châm điện | VD | Vận dụng chế tạo |
`;
    await act(async () => {
      root.render(React.createElement(Markdown, {text: md}));
    });

    expect(host.querySelector('.badge-nb')).toBeTruthy();
    expect(host.querySelector('.badge-vd')).toBeTruthy();
  });
});

describe('MarkdownEditor Component', () => {
  it('hỗ trợ vừa soạn thảo vừa xem trước trực tiếp (Live Preview) và cập nhật định dạng chữ', async () => {
    const draft = {chatId: 'c1', name: 'bai-day.md', content: '**Chữ đậm mẫu** và *in nghiêng*'};
    const onSaved = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(React.createElement(MarkdownEditor, {draft, onClose, onSaved}));
    });

    // Cả textarea và live preview đều tồn tại
    const textarea = host.querySelector('textarea');
    expect(textarea).toBeTruthy();
    expect(host.querySelector('.live-preview-content')).toBeTruthy();
    expect(host.querySelector('.live-preview-content strong')?.textContent).toBe('Chữ đậm mẫu');
    expect(host.querySelector('.live-preview-content em')?.textContent).toBe('in nghiêng');
  });

  it('click vào checkbox task trong live preview sẽ tự động đổi [ ] thành [x] trong nội dung Markdown', async () => {
    const draft = {chatId: 'c1', name: 'task.md', content: '- [ ] Chuẩn bị giáo án\n- [x] Đã in phiếu'};
    const onSaved = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(React.createElement(MarkdownEditor, {draft, onClose, onSaved}));
    });

    const textarea = host.querySelector('textarea')!;
    const checkbox0 = host.querySelector<HTMLInputElement>('input.task-checkbox[data-task-index="0"]')!;
    expect(checkbox0).toBeTruthy();
    expect(checkbox0.checked).toBe(false);

    // Click checkbox 0 trong preview
    await act(async () => {
      checkbox0.click();
    });

    // Check textarea text
    expect(textarea.value).toContain('- [x] Chuẩn bị giáo án');
  });

  it('cung cấp công cụ Quản lý bảng biểu với chức năng gộp ô, chia ô và nạp mẫu ma trận GDPT 2018', async () => {
    const draft = {chatId: 'c1', name: 'matrix.md', content: ''};
    const onSaved = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(React.createElement(MarkdownEditor, {draft, onClose, onSaved}));
    });

    // Mở Quản lý bảng biểu
    const btnTableManager = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Quản lý bảng biểu'))!;
    expect(btnTableManager).toBeTruthy();

    await act(async () => {
      btnTableManager.click();
    });

    expect(host.querySelector('.table-manager-dialog')).toBeTruthy();

    // Nạp mẫu ma trận GDPT 2018
    const btnMatrixPreset = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Ma trận GDPT 2018'))!;
    expect(btnMatrixPreset).toBeTruthy();
    await act(async () => {
      btnMatrixPreset.click();
    });

    // Gộp ô cột
    const btnMergeCol = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Gộp cột'))!;
    expect(btnMergeCol).toBeTruthy();
    await act(async () => {
      btnMergeCol.click();
    });

    // Chèn bảng vào văn bản
    const btnApply = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Chèn bảng vào văn bản'))!;
    await act(async () => {
      btnApply.click();
    });

    const textarea = host.querySelector('textarea')!;
    expect(textarea.value).toContain('<table class="pvta-table">');
    expect(textarea.value).toContain('colspan="2"');
  });

  it('hỗ trợ chèn ảnh qua chọn tệp hoặc nhập URL', async () => {
    const draft = {chatId: 'c1', name: 'image.md', content: ''};
    const onSaved = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(React.createElement(MarkdownEditor, {draft, onClose, onSaved}));
    });

    const btnImage = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Chèn ảnh'))!;
    expect(btnImage).toBeTruthy();

    await act(async () => {
      btnImage.click();
    });

    expect(host.querySelector('[aria-label="Chèn hình ảnh"]')).toBeTruthy();

    // Giả lập chọn file ảnh
    mocks.pickFiles.mockResolvedValue(['/Users/phananh/Documents/hinh-anh-thi-nghiem.png']);
    const btnPickFile = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Chọn tệp ảnh từ máy'))!;
    await act(async () => {
      btnPickFile.click();
    });

    const textarea = host.querySelector('textarea')!;
    expect(textarea.value).toContain('![hinh-anh-thi-nghiem](/Users/phananh/Documents/hinh-anh-thi-nghiem.png)');
  });
});
