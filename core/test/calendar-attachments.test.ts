import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAttachment,
  attachmentDir,
  detachAttachment,
  listAttachments,
  openAttachment,
} from '../src/desktop/calendar-attachments.js';
import { getRecord, listPendingSync, markClean, recordFilePath, saveRecord } from '../src/desktop/calendar-store.js';

describe('calendar-attachments (đính kèm cục bộ, không gửi Google)', () => {
  const dirs: string[] = [];
  const setup = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-cal-att-'));
    dirs.push(root);
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-cal-src-'));
    dirs.push(src);
    const file = recordFilePath(root, 'calendar');
    const rec = saveRecord(file, { data: { summary: 'KHTN - 8.5' } }, 1000);
    markClean(file, rec.localId, 1000, 'g-1');
    return { root, src, file, localId: rec.localId };
  };

  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('sao chép tệp vào attachments/<localId>/ và giữ nguyên tệp gốc', () => {
    const { root, src, localId } = setup();
    const orig = path.join(src, 'giao-an.docx');
    fs.writeFileSync(orig, 'nội dung');
    const att = addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    expect(att.name).toBe('giao-an.docx');
    expect(att.kind).toBe('file');
    expect(att.localOnly).toBe(true);
    expect(att.localPath.startsWith(`attachments/${localId}/`)).toBe(true);
    expect(fs.existsSync(path.join(root, att.localPath))).toBe(true);
    expect(fs.readFileSync(orig, 'utf8')).toBe('nội dung');
  });

  it('ảnh được nhận diện là kind image', () => {
    const { root, src, localId } = setup();
    const img = path.join(src, 'so-do.PNG');
    fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(addAttachment({ sourcePath: img, kind: 'calendar', root, localId }).kind).toBe('image');
  });

  it('thêm hoặc gỡ đính kèm không đổi syncState, updatedAt hay data (không gửi lại Google)', () => {
    const { root, src, file, localId } = setup();
    const before = getRecord(file, localId)!;
    const orig = path.join(src, 'a.pdf');
    fs.writeFileSync(orig, 'x');
    const att = addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    detachAttachment({ kind: 'calendar', root, localId, attachmentId: att.id });
    const after = getRecord(file, localId)!;
    expect(after.syncState).toBe('clean');
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.data).toEqual(before.data);
    expect(listPendingSync(file)).toEqual([]);
  });

  it('attachments nằm ngoài data: payload dữ liệu không chứa đính kèm', () => {
    const { root, src, file, localId } = setup();
    const orig = path.join(src, 'b.txt');
    fs.writeFileSync(orig, 'y');
    addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    const rec = getRecord(file, localId)!;
    expect(rec.attachments).toHaveLength(1);
    expect(JSON.stringify(rec.data)).not.toContain('attachments');
    expect(JSON.stringify(rec.data)).not.toContain('b.txt');
  });

  it('gỡ đính kèm chỉ bỏ liên kết, bản sao còn trong attachments/', () => {
    const { root, src, localId } = setup();
    const orig = path.join(src, 'c.csv');
    fs.writeFileSync(orig, 'a,b');
    const att = addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    const removed = detachAttachment({ kind: 'calendar', root, localId, attachmentId: att.id });
    expect(removed?.id).toBe(att.id);
    expect(listAttachments({ kind: 'calendar', root, localId })).toEqual([]);
    expect(fs.existsSync(path.join(root, att.localPath))).toBe(true);
  });

  it('mở đính kèm trả về đường dẫn trong thư mục đính kèm', () => {
    const { root, src, localId } = setup();
    const orig = path.join(src, 'd.md');
    fs.writeFileSync(orig, '# d');
    const att = addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    const opened = openAttachment({ kind: 'calendar', root, localId, attachmentId: att.id });
    expect(opened).toBe(path.resolve(root, att.localPath));
    expect(opened.startsWith(attachmentDir(root, localId) + path.sep)).toBe(true);
  });

  it('báo lỗi đúng tệp khi tệp nguồn không tồn tại, không tạo bản ghi đính kèm', () => {
    const { root, src, file, localId } = setup();
    const missing = path.join(src, 'khong-co.pdf');
    expect(() => addAttachment({ sourcePath: missing, kind: 'calendar', root, localId })).toThrow(/khong-co\.pdf/);
    expect(getRecord(file, localId)!.attachments).toBeUndefined();
  });

  it('từ chối thư mục làm nguồn đính kèm', () => {
    const { root, src, localId } = setup();
    expect(() => addAttachment({ sourcePath: src, kind: 'calendar', root, localId })).toThrow(/Không phải tệp/);
  });

  it('từ chối mã bản ghi có ký tự đường dẫn', () => {
    const { root, src } = setup();
    const orig = path.join(src, 'e.txt');
    fs.writeFileSync(orig, 'z');
    expect(() => addAttachment({ sourcePath: orig, kind: 'calendar', root, localId: '../../etc' })).toThrow(
      /không hợp lệ/,
    );
  });

  it('không cho mở đính kèm nếu bản sao đã mất, báo đúng tên tệp', () => {
    const { root, src, localId } = setup();
    const orig = path.join(src, 'f.xlsx');
    fs.writeFileSync(orig, 'q');
    const att = addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    fs.rmSync(path.join(root, att.localPath));
    expect(() => openAttachment({ kind: 'calendar', root, localId, attachmentId: att.id })).toThrow(/f\.xlsx/);
  });

  it('không cho đường dẫn đính kèm thoát ra ngoài attachments/', () => {
    const { root, src, localId } = setup();
    const orig = path.join(src, 'g.txt');
    fs.writeFileSync(orig, 'g');
    const att = addAttachment({ sourcePath: orig, kind: 'calendar', root, localId });
    const file = recordFilePath(root, 'calendar');
    // Giả lập tệp bị sửa tay với đường dẫn thoát ra ngoài.
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    raw.records[0].attachments[0].localPath = '../../../etc/passwd';
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(() => openAttachment({ kind: 'calendar', root, localId, attachmentId: att.id })).toThrow(/ngoài thư mục/);
  });
});
