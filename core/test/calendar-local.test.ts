import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCalendarLocalHost, sanitizeEventData } from '../src/desktop/calendar-local.js';
import { readRecords, recordFilePath } from '../src/desktop/calendar-store.js';

describe('calendar.* RPC lưu cục bộ', () => {
  const dirs: string[] = [];
  const makeHost = (start = 1_800_000_000_000) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-calendar-local-'));
    dirs.push(dir);
    let t = start;
    const host = createCalendarLocalHost(dir, { now: () => t });
    return { host, dir, tick: (ms: number) => (t += ms) };
  };
  const ev = { summary: 'Tiết 2: KHTN 8.6', start: '2026-10-29T07:45:00+07:00', end: '2026-10-29T08:30:00+07:00' };

  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('tạo sự kiện mới: syncState dirty, updatedAt là mili giây, lưu đúng tệp calendar.json', () => {
    const { host, dir } = makeHost();
    const saved = host.rpc('calendar.saveEvent', { data: ev }) as any;
    expect(saved.syncState).toBe('dirty');
    expect(saved.googleId).toBeNull();
    expect(saved.updatedAt).toBe(1_800_000_000_000);
    expect(saved.updatedAtText).toMatch(/\+07:00$/);
    const stored = readRecords(recordFilePath(dir, 'calendar'));
    expect(stored).toHaveLength(1);
    expect(stored[0].syncState).toBe('dirty');
    expect(stored[0].data).toMatchObject({ summary: ev.summary, start: ev.start });
  });

  it('sửa sự kiện đã có googleId: cập nhật đúng một bản ghi, không nhân đôi, mốc sửa tăng', () => {
    const { host, dir, tick } = makeHost();
    host.rpc('calendar.saveEvent', { googleId: 'g-100', data: ev });
    tick(5_000);
    const second = host.rpc('calendar.saveEvent', { googleId: 'g-100', data: { ...ev, summary: 'Tiết 2: KHTN 8.6 (đổi)' } }) as any;
    const stored = readRecords(recordFilePath(dir, 'calendar'));
    expect(stored).toHaveLength(1);
    expect(second.localId).toBe(stored[0].localId);
    expect(stored[0].googleId).toBe('g-100');
    expect(stored[0].data).toMatchObject({ summary: 'Tiết 2: KHTN 8.6 (đổi)' });
    expect(stored[0].updatedAt).toBe(1_800_000_005_000);
  });

  it('sửa hai lần trong cùng một mili giây vẫn cho mốc tăng nghiêm ngặt', () => {
    const { host } = makeHost();
    const a = host.rpc('calendar.saveEvent', { googleId: 'g-1', data: ev }) as any;
    const b = host.rpc('calendar.saveEvent', { googleId: 'g-1', data: ev }) as any;
    expect(b.updatedAt).toBeGreaterThan(a.updatedAt);
  });

  it('không đưa đính kèm vào data (không đi lên Google), giữ đính kèm riêng', () => {
    const { host, dir } = makeHost();
    const saved = host.rpc('calendar.saveEvent', {
      data: { ...ev, attachments: [{ id: 'a1', name: 'f.pdf', localPath: 'x', size: 1, kind: 'file' }] },
    }) as any;
    expect(saved.data).not.toHaveProperty('attachments');
    const raw = fs.readFileSync(recordFilePath(dir, 'calendar'), 'utf8');
    expect(raw).not.toContain('"attachments"');
  });

  it('công việc: tạo và sửa theo localId, trạng thái dirty', () => {
    const { host, dir, tick } = makeHost();
    const first = host.rpc('calendar.saveTask', { data: { title: 'Chấm bài KHTN 8.5', due: '2026-10-29' } }) as any;
    tick(1000);
    const again = host.rpc('calendar.saveTask', { localId: first.localId, data: { title: 'Chấm bài KHTN 8.5 (xong)', due: '2026-10-30' } }) as any;
    expect(again.localId).toBe(first.localId);
    expect(again.syncState).toBe('dirty');
    expect(readRecords(recordFilePath(dir, 'tasks'))).toHaveLength(1);
  });

  it('listLocal chỉ trả bản dirty/error, bỏ bản clean', () => {
    const { host, dir } = makeHost();
    host.rpc('calendar.saveEvent', { googleId: 'g-clean', data: ev });
    host.rpc('calendar.saveEvent', { googleId: 'g-dirty', data: ev });
    // Đánh dấu bản g-clean là clean bằng cách ghi trực tiếp qua calendar-store
    const file = recordFilePath(dir, 'calendar');
    const recs = readRecords(file);
    recs[0].syncState = 'clean';
    fs.writeFileSync(file, JSON.stringify({ version: 1, records: recs }));
    const out = host.rpc('calendar.listLocal') as any;
    expect(out.events.map((r: any) => r.googleId)).toEqual(['g-dirty']);
    expect(out.tasks).toEqual([]);
  });

  it('từ chối dữ liệu sai và localId có ký tự lạ', () => {
    const { host } = makeHost();
    expect(() => host.rpc('calendar.saveEvent', { data: { summary: '', start: ev.start } })).toThrow(/Tiêu đề/);
    expect(() => host.rpc('calendar.saveEvent', { data: { ...ev, allDay: 'yes' } })).toThrow(/allDay/);
    expect(() => host.rpc('calendar.saveEvent', { localId: '../x', data: ev })).toThrow(/localId/);
    expect(() => host.rpc('calendar.saveEvent', { data: { ...ev, remindersMinutes: [-1] } })).toThrow(/nhắc/);
    expect(() => host.rpc('calendar.unknown')).toThrow(/không được hỗ trợ/);
  });

  it('sanitizeEventData chỉ giữ các trường cho phép', () => {
    const out = sanitizeEventData({ ...ev, htmlLink: 'https://x', foo: 1 });
    expect(out).not.toHaveProperty('htmlLink');
    expect(out).not.toHaveProperty('foo');
    expect(out.summary).toBe(ev.summary);
  });
});
