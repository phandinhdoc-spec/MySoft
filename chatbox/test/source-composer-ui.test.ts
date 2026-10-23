import {describe, expect, it, vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlotBar} from '../src/SlotBar';
import {SourceContext, type ContextFile} from '../src/WorkspaceContext';

vi.mock('../src/ipc', () => ({rpc: vi.fn()}));
vi.mock('../src/QuickFile', () => ({EditFileButton: () => null}));

describe('source and placeholder UI', () => {
  it('hiện tệp của sổ nguồn kèm nhãn sổ, hai sổ trùng tên vẫn là hai dòng, có nút lọc Sổ nguồn', () => {
    const nb = (sid: string, book: string): ContextFile => ({id: `nb:${book}:${sid}`, name: 'de-cuong.md', path: `/tmp/${book}/de-cuong.md`, scope: 'project', scopeId: book, fingerprint: '10', at: 0, segments: [], notebook: {id: book, name: `Sổ ${book}`, sid, on: true, state: 'san-sang'}});
    const html = renderToStaticMarkup(createElement(SourceContext, {files: [nb('s1', 'A'), nb('s2', 'B')], chatId: 'c', rag: true, onOffice() {}, office: undefined}));
    expect(html.match(/id="source-item-/g)).toHaveLength(2);
    expect(html).toContain('Sổ nguồn: Sổ A');
    expect(html).toContain('Sổ nguồn: Sổ B');
    expect(html).toContain('>Sổ nguồn (2)</option>');
  });
  it('renders documents first with search, refresh and a separate preview', () => {
    const file = (name: string, image = false): ContextFile => ({id: name, name, path: `/tmp/${name}`, image, scope: 'project', scopeId: 'p', fingerprint: name, at: 0, segments: []});
    const html = renderToStaticMarkup(createElement(SourceContext, {files: [file('Bài học.md'), file('icon-32.png', true)], chatId: 'c', rag: true, onOffice() {}, office: undefined}));
    expect(html).toContain('Bài học.md');
    expect(html).not.toContain('icon-32.png');
    expect(html).toContain('type="search"');
    expect(html).toContain('Cập nhật tệp mới');
    expect(html).toContain('Bản xem trước');
    expect(html).toMatch(/<option value="documents" selected="">Tài liệu<\/option>/);
    // Tìm kiếm, bộ lọc, sắp xếp và nút nằm chung một hàng.
    expect(html.match(/class="source-row/g)).toHaveLength(1);
    // Không còn nút «Tìm bằng AI»: tìm bằng AI là mặc định khi gõ từ khóa.
    expect(html).not.toContain('Tìm bằng AI');
    expect(html).toContain('Nhóm theo thư mục');
  });
  it('vẫn tìm và cập nhật được ở trang dự án khi chưa mở chat', () => {
    const file: ContextFile = {id: 'a', name: 'a.md', path: '/tmp/a.md', scope: 'project', scopeId: 'p', fingerprint: 'a', at: 0, segments: []};
    const none = renderToStaticMarkup(createElement(SourceContext, {files: [file], chatId: '', rag: true, onOffice() {}, office: undefined}));
    const project = renderToStaticMarkup(createElement(SourceContext, {files: [file], chatId: '', projectId: 'p', rag: true, onOffice() {}, office: undefined}));
    const refresh = (html: string) => /<button[^>]*aria-label="↻ Cập nhật tệp mới"[^>]*>/.exec(html)![0];
    expect(refresh(none)).toContain('disabled');
    expect(refresh(project)).not.toContain('disabled');
  });
  it('shows filled values in green chips while incomplete slots remain pending', () => {
    const html = renderToStaticMarkup(createElement(SlotBar, {template: 'Lớp [lớp], môn [môn].', text: 'Lớp 8A, môn [môn].', onPick() {}, onClose() {}}));
    expect(html).toContain('slot-chip filled');
    expect(html).toContain('slot-value">8A');
    expect(html).toContain('slot-chip pending');
    expect(html).toContain('1/2 đã điền');
  });
});
