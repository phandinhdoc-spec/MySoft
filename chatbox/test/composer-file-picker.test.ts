import {describe, expect, it, vi} from 'vitest';
import {menuItems, type PickContext} from '../src/Composer';
import type {ViewState} from '../src/ipc';
import type {ContextFile} from '../src/notebook-files';

vi.mock('../src/ipc', () => ({rpc: vi.fn()}));

const state = {} as ViewState;
const file = (name: string, path: string, extra: Partial<ContextFile> = {}): ContextFile => ({id: path, name, path, scope: 'project', scopeId: 'p', fingerprint: name, at: 0, segments: [], ...extra});
const nb = (name: string, book: string): ContextFile => file(name, `https://x/${name}`, {id: `nb:${book}:${name}`, notebook: {id: book, name: `Sổ ${book}`, sid: name, on: true, state: 'san-sang'}});

describe('$ liệt kê tệp trong ngữ cảnh', () => {
  const ctx: PickContext = {files: [file('Giáo án 1.docx', '/d/Giáo án 1.docx'), file('Điểm.xlsx', '/d/Điểm.xlsx', {scope: 'chat'}), nb('Đề cương', 'A')]};
  it('liệt kê mọi tệp, nhóm theo nơi lưu, tên có khoảng trắng được bọc dấu huyền', () => {
    const items = menuItems('files', '', state, ctx);
    expect(items.map(i => i.title)).toEqual(['Giáo án 1.docx', 'Điểm.xlsx', 'Đề cương']);
    expect(items[0]!.value).toBe('`Giáo án 1.docx`');
    expect(items[1]!.value).toBe('Điểm.xlsx');
    expect(items[2]!.group).toBe('Sổ nguồn: Sổ A');
  });
  it('lọc không phân biệt dấu theo tên hoặc đường dẫn', () => {
    expect(menuItems('files', 'giao an', state, ctx).map(i => i.title)).toEqual(['Giáo án 1.docx']);
    expect(menuItems('files', 'khong-co', state, ctx)).toEqual([]);
  });
  it('hai tệp trùng tên thì chèn đường dẫn đầy đủ để không đọc nhầm', () => {
    const dup: PickContext = {files: [file('a.docx', '/x/a.docx'), file('a.docx', '/y/a.docx', {scope: 'chat'})]};
    expect(menuItems('files', '', state, dup).map(i => i.value).sort()).toEqual(['/x/a.docx', '/y/a.docx']);
  });
});

describe('$$ liệt kê thư mục', () => {
  it('thư mục dự án (lưu chính) trước, rồi thư mục chứa tài liệu; không trùng; bỏ thư mục của sổ nguồn', () => {
    const ctx: PickContext = {
      files: [file('a.docx', '/Users/a/Lớp 8/a.docx', {scope: 'chat'}), file('b.docx', '/Users/a/Lớp 8/b.docx', {scope: 'chat'}), nb('Đề cương', 'A')],
      project: {folders: ['/Users/a/Dự án', '/Users/a/Phụ'], outputDir: '/Users/a/Dự án', learning: {folders: ['/Users/a/Cũ']}},
    };
    const items = menuItems('folders', '', state, ctx);
    expect(items.map(i => i.desc)).toEqual(['/Users/a/Dự án', '/Users/a/Phụ', '/Users/a/Lớp 8', '/Users/a/Cũ']);
    expect(items[0]!.group).toBe('Thư mục dự án · lưu chính');
    expect(items[2]!.group).toBe('Thư mục chứa tài liệu');
    expect(items[0]!.value).toBe('`/Users/a/Dự án`');
    expect(menuItems('folders', 'lop 8', state, ctx).map(i => i.desc)).toEqual(['/Users/a/Lớp 8']);
  });
  it('không có dự án hay tài liệu thì danh sách trống', () => {
    expect(menuItems('folders', '', state, {files: []})).toEqual([]);
  });
});
