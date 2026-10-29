import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatUpdatedAt,
  getRecord,
  listPendingSync,
  markClean,
  markDeleted,
  markDirty,
  markError,
  readRecords,
  recordFilePath,
  saveRecord,
} from '../src/desktop/calendar-store.js';

describe('calendar-store (JSON cục bộ, khóa tạm, ghi qua tệp tạm)', () => {
  const dirs: string[] = [];
  const makeFile = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-calendar-store-'));
    dirs.push(d);
    return recordFilePath(d, 'calendar');
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('đọc tệp chưa có thì trả về mảng rỗng và không tạo tệp', () => {
    const file = makeFile();
    expect(readRecords(file)).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('tạo bản ghi mới với localId, googleId null, dirty, mốc mili giây và deleted false', () => {
    const file = makeFile();
    const rec = saveRecord(file, { data: { title: 'KHTN - 8.5' } }, 1_790_000_000_123);
    expect(rec.localId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rec.googleId).toBeNull();
    expect(rec.syncState).toBe('dirty');
    expect(rec.updatedAt).toBe(1_790_000_000_123);
    expect(rec.deleted).toBe(false);
    expect(readRecords(file)).toEqual([rec]);
  });

  it('sửa bản ghi giữ nguyên localId, đặt dirty và tăng mốc sửa kể cả trong cùng một mili giây', () => {
    const file = makeFile();
    const first = saveRecord(file, { data: { title: 'A' } }, 1000);
    markClean(file, first.localId, 1000, 'g-1');
    const second = saveRecord(file, { localId: first.localId, data: { title: 'B' } }, 1000);
    const third = saveRecord(file, { localId: first.localId, data: { title: 'C' } }, 1000);
    expect(second.localId).toBe(first.localId);
    expect(second.googleId).toBe('g-1');
    expect(second.syncState).toBe('dirty');
    expect(second.updatedAt).toBe(1001);
    expect(third.updatedAt).toBe(1002);
    expect(getRecord(file, first.localId)?.data).toEqual({ title: 'C' });
  });

  it('sửa bản ghi không tồn tại thì ném lỗi và không ghi gì', () => {
    const file = makeFile();
    saveRecord(file, { data: { title: 'A' } }, 1000);
    expect(() => saveRecord(file, { localId: 'khong-co', data: {} }, 1000)).toThrow(/Không tìm thấy/);
    expect(readRecords(file)).toHaveLength(1);
  });

  it('markDirty đặt dirty và tăng mốc sửa', () => {
    const file = makeFile();
    const rec = saveRecord(file, { data: {} }, 1000);
    markClean(file, rec.localId, 1000);
    const dirty = markDirty(file, rec.localId, 5000);
    expect(dirty.syncState).toBe('dirty');
    expect(dirty.updatedAt).toBe(5000);
  });

  it('markDeleted giữ bản ghi, đặt deleted true và dirty để gửi lệnh xóa; không xóa khỏi tệp', () => {
    const file = makeFile();
    const rec = saveRecord(file, { data: { title: 'Chào cờ' } }, 1000);
    markClean(file, rec.localId, 1000, 'g-9');
    const deleted = markDeleted(file, rec.localId, 2000);
    expect(deleted.deleted).toBe(true);
    expect(deleted.syncState).toBe('dirty');
    expect(deleted.googleId).toBe('g-9');
    expect(getRecord(file, rec.localId)?.deleted).toBe(true);
    expect(() => saveRecord(file, { localId: rec.localId, data: {} }, 3000)).toThrow(/đã xóa/);
  });

  it('listPendingSync chỉ trả về bản dirty hoặc error, không trả về bản clean', () => {
    const file = makeFile();
    const a = saveRecord(file, { data: { n: 'a' } }, 1000);
    const b = saveRecord(file, { data: { n: 'b' } }, 1000);
    const c = saveRecord(file, { data: { n: 'c' } }, 1000);
    markClean(file, a.localId, 1000, 'g-a');
    markError(file, b.localId, 'HTTP 503');
    const pending = listPendingSync(file).map((r) => r.localId).sort();
    expect(pending).toEqual([b.localId, c.localId].sort());
  });

  it('markClean chỉ thành công khi mốc sửa còn bằng mốc đã gửi; nếu thầy sửa giữa chừng thì giữ dirty', () => {
    const file = makeFile();
    const rec = saveRecord(file, { data: { v: 1 } }, 1000);
    saveRecord(file, { localId: rec.localId, data: { v: 2 } }, 2000);
    expect(markClean(file, rec.localId, 1000, 'g-1')).toBe(false);
    expect(getRecord(file, rec.localId)).toMatchObject({ syncState: 'dirty', googleId: null });
    expect(markClean(file, rec.localId, 2000, 'g-1')).toBe(true);
    expect(getRecord(file, rec.localId)).toMatchObject({ syncState: 'clean', googleId: 'g-1' });
  });

  it('markError ghi thông báo lỗi và giữ nguyên dữ liệu', () => {
    const file = makeFile();
    const rec = saveRecord(file, { data: { title: 'KHTN' } }, 1000);
    const errored = markError(file, rec.localId, 'HTTP 429: quá giới hạn');
    expect(errored.syncState).toBe('error');
    expect(errored.syncError).toBe('HTTP 429: quá giới hạn');
    expect(errored.data).toEqual({ title: 'KHTN' });
    expect(errored.updatedAt).toBe(1000);
  });

  it('tệp JSON hỏng: đọc và ghi đều ném lỗi, nội dung tệp không đổi', () => {
    const file = makeFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ hỏng', 'utf8');
    expect(() => readRecords(file)).toThrow(/giữ nguyên tệp/);
    expect(() => saveRecord(file, { data: {} }, 1000)).toThrow(/giữ nguyên tệp/);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ hỏng');
  });

  it('sai cấu trúc (thiếu trạng thái hợp lệ hoặc trùng localId) thì từ chối, không ghi đè', () => {
    const file = makeFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const bad = {
      version: 1,
      records: [{ localId: 'x', googleId: null, syncState: 'lạ', updatedAt: 1, deleted: false, data: {} }],
    };
    fs.writeFileSync(file, JSON.stringify(bad), 'utf8');
    expect(() => readRecords(file)).toThrow(/Bản ghi lỗi/);
    expect(() => saveRecord(file, { data: {} }, 1000)).toThrow(/Bản ghi lỗi/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(bad);
  });

  it('lỗi khi đổi tên tệp tạm: tệp cũ còn nguyên, không sót tệp .tmp, khóa được giải phóng', () => {
    const file = makeFile();
    const rec = saveRecord(file, { data: { title: 'gốc' } }, 1000);
    const before = fs.readFileSync(file, 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('đĩa đầy giả lập');
    });
    expect(() => saveRecord(file, { localId: rec.localId, data: { title: 'mới' } }, 2000)).toThrow(/đĩa đầy/);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    const leftovers = fs.readdirSync(path.dirname(file)).filter((n) => n.endsWith('.tmp') || n.endsWith('.lock'));
    expect(leftovers).toEqual([]);
  });

  it('không sót tệp tạm sau ghi thành công', () => {
    const file = makeFile();
    saveRecord(file, { data: {} }, 1000);
    const leftovers = fs.readdirSync(path.dirname(file)).filter((n) => n.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('khóa đang được tiến trình sống giữ: ném lỗi, không ghi, không xóa khóa của người khác', () => {
    const file = makeFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.lock`, `${process.pid} ${Date.now()}`, 'utf8');
    expect(() => saveRecord(file, { data: {} }, 1000)).toThrow(/đang được khóa/);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(`${file}.lock`)).toBe(true);
  });

  it('khóa của tiến trình đã chết được coi là cũ và tự dọn, ghi thành công', () => {
    const file = makeFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const child = spawnSync(process.execPath, ['-e', '']);
    expect(child.pid).toBeGreaterThan(0);
    fs.writeFileSync(`${file}.lock`, `${child.pid} ${Date.now()}`, 'utf8');
    const rec = saveRecord(file, { data: { ok: true } }, 1000);
    expect(rec.syncState).toBe('dirty');
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });

  it('formatUpdatedAt hiển thị theo +07:00 đến giây', () => {
    // 2026-10-29T03:00:00Z tương ứng 10:00:00 giờ Việt Nam
    expect(formatUpdatedAt(Date.UTC(2026, 9, 29, 3, 0, 0, 999))).toBe('2026-10-29T10:00:00+07:00');
  });
});
