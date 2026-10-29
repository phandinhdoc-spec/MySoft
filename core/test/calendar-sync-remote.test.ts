import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleWorkspaceHost } from '../src/desktop/google-workspace.js';
import {
  CalendarSyncEngine,
  SyncCursorExpiredError,
  SyncHttpError,
  SyncNetworkError,
  type SyncKind,
} from '../src/desktop/calendar-sync.js';
import {
  getRecord,
  markClean,
  recordFilePath,
  saveRecord,
  updateAttachments,
  type CalendarAttachment,
} from '../src/desktop/calendar-store.js';

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const dirs: string[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Dựng GoogleWorkspaceHost với token còn hạn và fetch giả; ghi lại mọi yêu cầu. */
function setup(handler: Handler) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-remote-test-'));
  dirs.push(home);
  fs.writeFileSync(
    path.join(home, 'google-workspace.json'),
    JSON.stringify({
      version: 1,
      config: { clientId: 'test-client' },
      tokens: { accessToken: 'at-test', refreshToken: 'rt-test', expiryDate: Date.now() + 3_600_000 },
      selectedCalendarId: 'primary',
      selectedTasklistId: 'lst-1',
      calendars: [],
      events: [],
      tasklists: [],
      tasks: [],
      notes: [],
    }),
    { mode: 0o600 },
  );
  const calls: Array<{ method: string; url: URL; body: any }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(url, init);
  });
  const host = new GoogleWorkspaceHost({ home, fetcher: fetcher as unknown as typeof fetch, openBrowser: () => {} });
  return { host, calls, root: home };
}

describe('createCalendarSyncRemote (adapter REST cho bộ đồng bộ tăng dần)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('lịch: đầy đủ trong ±180 ngày, phân trang, lấy nextSyncToken ở trang cuối', async () => {
    const { host, calls } = setup((url) => {
      if (!url.searchParams.has('pageToken')) {
        return json({
          items: [
            {
              id: 'e1',
              status: 'confirmed',
              updated: '2026-10-28T03:00:00Z',
              summary: 'Tiết 1',
              start: { dateTime: '2026-10-29T07:30:00+07:00' },
              end: { dateTime: '2026-10-29T08:15:00+07:00' },
            },
          ],
          nextPageToken: 'p2',
        });
      }
      return json({ items: [{ id: 'e2', status: 'cancelled', updated: '2026-10-27T03:00:00Z' }], nextSyncToken: 'sync-1' });
    });
    const remote = host.createCalendarSyncRemote();

    const page = await remote.list('calendar', null);

    expect(page.nextCursor).toBe('sync-1');
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ id: 'e1', deleted: false, data: { summary: 'Tiết 1' } });
    expect(page.items[1]).toMatchObject({ id: 'e2', deleted: true });
    expect(calls[0].url.searchParams.get('showDeleted')).toBe('true');
    expect(calls[0].url.searchParams.has('syncToken')).toBe(false);
    const from = Date.parse(calls[0].url.searchParams.get('timeMin')!);
    const to = Date.parse(calls[0].url.searchParams.get('timeMax')!);
    expect(to - from).toBe(360 * 86_400_000);
    expect(calls[1].url.searchParams.get('pageToken')).toBe('p2');
  });

  it('lịch: có mốc thì chỉ gửi syncToken (không kèm cửa sổ thời gian); 410 → SyncCursorExpiredError', async () => {
    const { host, calls } = setup(() => json({ error: { message: 'Gone' } }, 410));
    const remote = host.createCalendarSyncRemote();

    await expect(remote.list('calendar', 'sync-cu')).rejects.toBeInstanceOf(SyncCursorExpiredError);
    expect(calls[0].url.searchParams.get('syncToken')).toBe('sync-cu');
    expect(calls[0].url.searchParams.has('timeMin')).toBe(false);
  });

  it('HTTP 503 → SyncHttpError (thử lại được); lỗi fetch → SyncNetworkError', async () => {
    const busy = setup(() => json({ error: { message: 'busy' } }, 503)).host.createCalendarSyncRemote();
    await expect(busy.list('calendar', null)).rejects.toMatchObject({ status: 503 });
    await expect(busy.list('calendar', null)).rejects.toBeInstanceOf(SyncHttpError);

    const offline = setup(() => {
      throw new TypeError('fetch failed');
    }).host.createCalendarSyncRemote();
    await expect(offline.list('calendar', null)).rejects.toBeInstanceOf(SyncNetworkError);
  });

  it('công việc: dùng updatedMin và showDeleted; mốc tiếp theo là ISO và không vượt thời điểm hiện tại', async () => {
    const { host, calls } = setup(() =>
      json({
        items: [
          { id: 't1', title: 'Chấm bài', status: 'needsAction', updated: '2026-10-28T02:00:00Z' },
          { id: 't2', title: '', deleted: true, updated: '2026-10-28T02:05:00Z' },
        ],
      }),
    );
    const remote = host.createCalendarSyncRemote();

    const page = await remote.list('tasks', '2026-10-28T01:00:00.000Z');

    expect(calls[0].url.searchParams.get('updatedMin')).toBe('2026-10-28T01:00:00.000Z');
    expect(calls[0].url.searchParams.get('showDeleted')).toBe('true');
    expect(page.items[0]).toMatchObject({ id: 't1', deleted: false, data: { title: 'Chấm bài' } });
    expect(page.items[1].deleted).toBe(true);
    expect(Date.parse(page.nextCursor)).toBeLessThanOrEqual(Date.now());
  });

  it('ghi: thêm, sửa, xóa đúng đường dẫn; đính kèm không bao giờ có trong payload', async () => {
    const { host, calls } = setup((url, init) => {
      if (init?.method === 'POST' && url.hostname === 'tasks.googleapis.com') return json({ id: 'task-new' });
      if (init?.method === 'POST') return json({ id: 'g-new' });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return json({});
    });
    const remote = host.createCalendarSyncRemote();

    const id = await remote.insert('calendar', {
      summary: 'Họp tổ',
      start: '2026-10-30T09:00:00+07:00',
      end: '2026-10-30T10:00:00+07:00',
      attachments: [{ name: 'giao-an.png' }],
    });
    expect(id).toBe('g-new');
    expect(calls[0].url.pathname).toBe('/calendar/v3/calendars/primary/events');
    expect(JSON.stringify(calls[0].body)).not.toContain('giao-an.png');
    expect('attachments' in calls[0].body).toBe(false);

    await remote.patch('calendar', 'g-new', { summary: 'Họp tổ 2', start: '2026-10-30T09:00:00+07:00' });
    expect(calls[1]).toMatchObject({ method: 'PATCH' });
    expect(calls[1].url.pathname).toBe('/calendar/v3/calendars/primary/events/g-new');

    await remote.remove('calendar', 'g-new');
    expect(calls[2]).toMatchObject({ method: 'DELETE' });

    const taskId = await remote.insert('tasks', { title: 'Chuẩn bị', status: 'needsAction' });
    expect(taskId).toBe('task-new');
    expect(calls[3].url.pathname).toBe('/tasks/v1/lists/lst-1/tasks');
    expect('notes' in calls[3].body).toBe(false);
    expect('due' in calls[3].body).toBe(false);
  });

  it('kết nối với engine: lần đầu tạo mới, lần sau chỉ gửi bản dirty, đính kèm không lên Google', async () => {
    const { host, calls } = setup((url, init) => {
      if (init?.method === 'POST') return json({ id: 'g-1' });
      if (init?.method === 'PATCH') return json({});
      if (url.hostname === 'tasks.googleapis.com') return json({ items: [] });
      return json({ items: [], nextSyncToken: 's-1' });
    });
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-remote-data-'));
    dirs.push(dataDir);
    const files: Record<SyncKind, string> = {
      calendar: recordFilePath(dataDir, 'calendar'),
      tasks: recordFilePath(dataDir, 'tasks'),
    };
    const engine = new CalendarSyncEngine({
      files,
      backupDir: path.join(dataDir, 'backup'),
      stateFile: path.join(dataDir, 'sync-state.json'),
      remote: host.createCalendarSyncRemote(),
    });
    const attachment: CalendarAttachment = {
      id: 'a1',
      name: 'ảnh-tiết.png',
      localPath: 'attachments/x/ảnh-tiết.png',
      mimeType: 'image/png',
      size: 12,
      kind: 'image',
      addedAt: '2026-10-29T08:00:00+07:00',
      localOnly: true,
    };
    const dirty = saveRecord(files.calendar, { data: { summary: 'Tiết 3', start: '2026-10-30T09:30:00+07:00' } });
    updateAttachments(files.calendar, dirty.localId, () => [attachment]);
    const synced = saveRecord(files.calendar, { data: { summary: 'Tiết 4', start: '2026-10-30T10:15:00+07:00' } }, 1000);
    markClean(files.calendar, synced.localId, synced.updatedAt, 'g-old');

    await engine.flushNow();

    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    expect(JSON.stringify(posts[0].body)).not.toContain('ảnh-tiết');
    expect(getRecord(files.calendar, dirty.localId)?.googleId).toBe('g-1');
    expect(getRecord(files.calendar, dirty.localId)?.syncState).toBe('clean');
    expect(getRecord(files.calendar, dirty.localId)?.attachments).toHaveLength(1);

    calls.length = 0;
    await engine.flushNow();
    expect(calls.filter((c) => c.method === 'POST' || c.method === 'PATCH')).toHaveLength(0);
    engine.dispose();
  });
});
