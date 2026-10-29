import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CalendarSyncEngine,
  SyncCursorExpiredError,
  SyncHttpError,
  SyncNetworkError,
  toRemoteBody,
  type RemotePage,
  type SyncKind,
  type SyncRemote,
} from '../src/desktop/calendar-sync.js';
import {
  getRecord,
  markClean,
  markDeleted,
  recordFilePath,
  saveRecord,
  updateAttachments,
  type CalendarAttachment,
} from '../src/desktop/calendar-store.js';

function makeRemote(impl: Partial<SyncRemote> = {}) {
  let n = 0;
  const insert = vi.fn(impl.insert ?? (async (_k: SyncKind, _d: Record<string, unknown>) => `g-${++n}`));
  const patch = vi.fn(impl.patch ?? (async (_k: SyncKind, _id: string, _d: Record<string, unknown>) => {}));
  const remove = vi.fn(impl.remove ?? (async (_k: SyncKind, _id: string) => {}));
  const list = vi.fn(
    impl.list ?? (async (_k: SyncKind, _c: string | null): Promise<RemotePage> => ({ items: [], nextCursor: 'c0' })),
  );
  const remote: SyncRemote = { insert, patch, remove, list };
  return { remote, insert, patch, remove, list };
}

const att = (name: string): CalendarAttachment => ({
  id: `att-${name}`,
  name,
  localPath: `attachments/x/${name}`,
  mimeType: 'image/png',
  size: 10,
  kind: 'image',
  addedAt: '2026-10-29T08:00:00+07:00',
  localOnly: true,
});

describe('CalendarSyncEngine (đồng bộ tăng dần, giả lập API)', () => {
  const dirs: string[] = [];
  let root: string;
  let files: Record<SyncKind, string>;
  let backupDir: string;
  let stateFile: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T08:00:00+07:00'));
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-sync-test-'));
    dirs.push(root);
    files = { calendar: recordFilePath(root, 'calendar'), tasks: recordFilePath(root, 'tasks') };
    backupDir = path.join(root, 'backup');
    stateFile = path.join(root, 'sync-state.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function engineWith(remote: SyncRemote, extra: Partial<ConstructorParameters<typeof CalendarSyncEngine>[0]> = {}) {
    return new CalendarSyncEngine({ files, backupDir, stateFile, remote, ...extra });
  }

  it('chờ 30 giây sau thao tác cuối rồi mới đẩy; mỗi thao tác đặt lại bộ đếm', async () => {
    const { remote, insert } = makeRemote();
    const engine = engineWith(remote);
    const r = saveRecord(files.calendar, { data: { summary: 'Tiết 1' } });
    engine.touch();
    await vi.advanceTimersByTimeAsync(20_000);
    saveRecord(files.calendar, { localId: r.localId, data: { summary: 'Tiết 1 đã sửa' } });
    engine.touch();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(insert).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith('calendar', { summary: 'Tiết 1 đã sửa' });
    engine.dispose();
  });

  it('chỉ gửi bản ghi dirty, không gửi lại bản đã đồng bộ', async () => {
    const { remote, insert, patch, remove } = makeRemote();
    const engine = engineWith(remote);
    const ids: Record<string, string> = {};
    for (const s of ['A', 'B', 'C']) {
      const r = saveRecord(files.calendar, { data: { summary: s } }, 1000);
      markClean(files.calendar, r.localId, r.updatedAt, `g-${s}`);
      ids[s] = r.localId;
    }
    saveRecord(files.calendar, { localId: ids.B, data: { summary: 'B2' } });

    await engine.flushNow();

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('calendar', 'g-B', { summary: 'B2' });
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(getRecord(files.calendar, ids.A)?.syncState).toBe('clean');
    engine.dispose();
  });

  it('bản ghi mới chưa có googleId: tạo trên Google, lưu mã và đặt clean', async () => {
    const { remote, insert } = makeRemote();
    const engine = engineWith(remote);
    const r = saveRecord(files.calendar, { data: { summary: 'Họp tổ' } });

    await engine.flushNow();

    expect(insert).toHaveBeenCalledWith('calendar', { summary: 'Họp tổ' });
    const after = getRecord(files.calendar, r.localId)!;
    expect(after.googleId).toBe('g-1');
    expect(after.syncState).toBe('clean');
    engine.dispose();
  });

  it('xóa: có googleId thì gọi xóa trên Google; chưa từng tạo thì không gọi gì', async () => {
    const { remote, remove, insert } = makeRemote();
    const engine = engineWith(remote);
    const synced = saveRecord(files.calendar, { data: { summary: 'Cũ' } }, 1000);
    markClean(files.calendar, synced.localId, synced.updatedAt, 'g-x');
    const localOnly = saveRecord(files.calendar, { data: { summary: 'Nháp' } }, 1000);
    markDeleted(files.calendar, synced.localId);
    markDeleted(files.calendar, localOnly.localId);

    await engine.flushNow();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('calendar', 'g-x');
    expect(insert).not.toHaveBeenCalled();
    expect(getRecord(files.calendar, synced.localId)?.syncState).toBe('clean');
    expect(getRecord(files.calendar, localOnly.localId)?.syncState).toBe('clean');
    engine.dispose();
  });

  it('đính kèm không bao giờ được gửi lên Google và không làm bản ghi dirty', async () => {
    const { remote, insert } = makeRemote();
    const engine = engineWith(remote);
    const r = saveRecord(files.calendar, { data: { summary: 'Tiết 3' } }, 1000);
    updateAttachments(files.calendar, r.localId, () => [att('ảnh.png')]);

    await engine.flushNow();

    expect(insert).toHaveBeenCalledWith('calendar', { summary: 'Tiết 3' });
    const body = insert.mock.calls[0][1] as Record<string, unknown>;
    expect('attachments' in body).toBe(false);
    expect(getRecord(files.calendar, r.localId)?.attachments).toHaveLength(1);
    engine.dispose();
  });

  it('toRemoteBody loại bỏ attachments khỏi dữ liệu gửi đi', () => {
    expect(toRemoteBody({ summary: 'a', attachments: [{ name: 'x' }] })).toEqual({ summary: 'a' });
    expect(() => toRemoteBody(null)).toThrow();
  });

  it('lỗi mạng giữ trạng thái dirty, báo lỗi và thử lại sau 30 giây', async () => {
    let calls = 0;
    const { remote, insert } = makeRemote({
      insert: async () => {
        calls++;
        if (calls === 1) throw new SyncNetworkError('mất kết nối');
        return 'g-ok';
      },
    });
    const engine = engineWith(remote);
    const r = saveRecord(files.calendar, { data: { summary: 'Tiết 2' } });

    await engine.flushNow();

    const failed = getRecord(files.calendar, r.localId)!;
    expect(failed.syncState).toBe('dirty');
    expect(failed.syncError).toBe('mất kết nối');
    const status = engine.getStatus();
    expect(status.state).toBe('retrying');
    expect(status.pending).toBe(1);
    expect(status.nextAttemptAt).toBeDefined();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getRecord(files.calendar, r.localId)?.syncState).toBe('clean');
    expect(insert).toHaveBeenCalledTimes(2);
    expect(getRecord(files.calendar, r.localId)?.googleId).toBe('g-ok');
    expect(getRecord(files.calendar, r.localId)?.syncError).toBeUndefined();
    engine.dispose();
  });

  it('lịch thử lại lùi dần: 30 giây, rồi 60 giây', async () => {
    const { remote, insert } = makeRemote({
      insert: async () => {
        throw new SyncHttpError(503, 'Dịch vụ tạm thời lỗi');
      },
    });
    const engine = engineWith(remote);
    saveRecord(files.calendar, { data: { summary: 'Tiết 4' } });

    await engine.flushNow();
    expect(insert).toHaveBeenCalledTimes(1);

    // Không dùng vi.waitFor: trên đồng hồ giả nó tự cộng thêm thời gian và làm lệch kiểm thử.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(insert).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(insert).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(insert).toHaveBeenCalledTimes(3);
    engine.dispose();
  });

  it('lỗi không tạm thời (HTTP 400) đánh dấu error và không tự thử lại', async () => {
    const { remote, insert } = makeRemote({
      insert: async () => {
        throw new SyncHttpError(400, 'Dữ liệu không hợp lệ');
      },
    });
    const engine = engineWith(remote);
    const r = saveRecord(files.calendar, { data: { summary: 'Sai' } });

    await engine.flushNow();

    const rec = getRecord(files.calendar, r.localId)!;
    expect(rec.syncState).toBe('error');
    expect(rec.syncError).toBe('Dữ liệu không hợp lệ');
    expect(engine.getStatus().state).toBe('error');
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(insert).toHaveBeenCalledTimes(1);
    engine.dispose();
  });

  it('xung đột: bản local mới hơn được giữ, không có sao lưu', async () => {
    const { remote, patch } = makeRemote({
      patch: async () => {
        throw new SyncHttpError(400, 'từ chối tạm');
      },
      list: async (): Promise<RemotePage> => ({
        items: [{ id: 'g-1', updatedAt: 500, deleted: false, data: { summary: 'Google cũ' } }],
        nextCursor: 'c1',
      }),
    });
    const engine = engineWith(remote);
    saveRecord(files.calendar, { data: { summary: 'Local mới' }, googleId: 'g-1' }, 2000);

    await engine.flushNow();

    expect(patch).toHaveBeenCalledTimes(1);
    const rec = listRecords()[0];
    expect(rec.data).toEqual({ summary: 'Local mới' });
    expect(fs.existsSync(backupDir)).toBe(false);
    engine.dispose();
  });

  it('xung đột: Google mới hơn thì áp dụng bản Google, lưu bản local thua vào backup/ và giữ đính kèm', async () => {
    const { remote } = makeRemote({
      patch: async () => {
        throw new SyncHttpError(400, 'từ chối tạm');
      },
      list: async (): Promise<RemotePage> => ({
        items: [{ id: 'g-1', updatedAt: 5000, deleted: false, data: { summary: 'Google mới' } }],
        nextCursor: 'c1',
      }),
    });
    const engine = engineWith(remote);
    const r = saveRecord(files.calendar, { data: { summary: 'Local cũ' }, googleId: 'g-1' }, 1000);
    updateAttachments(files.calendar, r.localId, () => [att('giao-an.png')]);

    await engine.flushNow();

    const rec = getRecord(files.calendar, r.localId)!;
    expect(rec.data).toEqual({ summary: 'Google mới' });
    expect(rec.syncState).toBe('clean');
    expect(rec.updatedAt).toBe(5000);
    expect(rec.attachments).toHaveLength(1);

    const backups = fs.readdirSync(backupDir);
    expect(backups).toHaveLength(1);
    const saved = JSON.parse(fs.readFileSync(path.join(backupDir, backups[0]), 'utf8'));
    expect(saved.reason).toBe('conflict');
    expect(saved.record.data).toEqual({ summary: 'Local cũ' });
    engine.dispose();
  });

  it('kéo dùng mốc: lần sau gửi mốc cũ đã lưu, không tải lại từ đầu', async () => {
    const { remote, list } = makeRemote({
      list: async (_k: SyncKind, cursor: string | null): Promise<RemotePage> => ({
        items: [],
        nextCursor: cursor ? 'tok-2' : 'tok-1',
      }),
    });
    const engine = engineWith(remote);

    await engine.flushNow();
    await engine.flushNow();

    const calendarCursors = list.mock.calls.filter((c) => c[0] === 'calendar').map((c) => c[1]);
    expect(calendarCursors).toEqual([null, 'tok-1']);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(state.cursors.calendar).toBe('tok-2');
    engine.dispose();
  });

  it('mốc hết hạn (410): đồng bộ đầy đủ lại một lần rồi lưu mốc mới', async () => {
    // Lần 1 (null) trả 'cu'; lần 2 (cu) hết hạn; lần 3 (đầy đủ lại) trả 'moi'.
    let fullSyncs = 0;
    const { remote, list } = makeRemote({
      list: async (_k: SyncKind, cursor: string | null): Promise<RemotePage> => {
        if (cursor === 'cu') throw new SyncCursorExpiredError();
        fullSyncs++;
        return { items: [], nextCursor: fullSyncs === 1 ? 'cu' : 'moi' };
      },
    });
    const engine = engineWith(remote);

    await engine.flushNow();
    await engine.flushNow();

    const calendarCursors = list.mock.calls.filter((c) => c[0] === 'calendar').map((c) => c[1]);
    expect(calendarCursors).toEqual([null, 'cu', null]);
    expect(JSON.parse(fs.readFileSync(stateFile, 'utf8')).cursors.calendar).toBe('moi');
    engine.dispose();
  });

  it('thầy sửa trong lúc đang gửi: bản vẫn dirty và lần sau gửi bản mới nhất', async () => {
    const r = saveRecord(files.calendar, { data: { summary: 'V1' }, googleId: 'g-1' }, 1000);
    let edited = false;
    const { remote, patch } = makeRemote({
      patch: async () => {
        if (!edited) {
          edited = true;
          saveRecord(files.calendar, { localId: r.localId, data: { summary: 'V2' } }, 2000);
        }
      },
    });
    const engine = engineWith(remote);

    await engine.flushNow();
    expect(getRecord(files.calendar, r.localId)?.syncState).toBe('dirty');

    await engine.flushNow();
    expect(patch).toHaveBeenLastCalledWith('calendar', 'g-1', { summary: 'V2' });
    expect(getRecord(files.calendar, r.localId)?.syncState).toBe('clean');
    engine.dispose();
  });

  it('kéo bản ghi mới từ Google thành bản clean, không tạo sao lưu', async () => {
    const { remote } = makeRemote({
      list: async (k: SyncKind): Promise<RemotePage> =>
        k === 'calendar'
          ? { items: [{ id: 'g-9', updatedAt: 500, deleted: false, data: { summary: 'Từ Google' } }], nextCursor: 'c' }
          : { items: [], nextCursor: 'c' },
    });
    const engine = engineWith(remote);

    const report = await engine.flushNow();

    expect(report.pulled).toBe(1);
    const rec = listRecords()[0];
    expect(rec.googleId).toBe('g-9');
    expect(rec.syncState).toBe('clean');
    expect(fs.existsSync(backupDir)).toBe(false);
    engine.dispose();
  });

  function listRecords() {
    return JSON.parse(fs.readFileSync(files.calendar, 'utf8')).records as Array<{
      googleId: string | null;
      syncState: string;
      data: unknown;
    }>;
  }
});
