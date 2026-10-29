import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleWorkspaceHost, createPkcePair } from '../src/desktop/google-workspace.js';

describe('GoogleWorkspaceHost (OAuth 2.0 + Calendar API v3 + Tasks API v1)', () => {
  const dirs: string[] = [];
  const makeDir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pvta-google-test-'));
    dirs.push(d);
    return d;
  };

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('creates PKCE S256 verifier and challenge pair', () => {
    const pair = createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(40);
    expect(pair.challenge.length).toBeGreaterThanOrEqual(40);
    expect(pair.verifier).not.toBe(pair.challenge);
  });

  it('saves OAuth 2.0 config, exchanges code, syncs Calendar & Tasks, and builds grounding prompt', async () => {
    const home = makeDir();
    const notifications: any[] = [];

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'ya29.test_access_token',
            refresh_token: '1//test_refresh_token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200 }
        );
      }
      if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ email: 'giaovien@edu.vn' }), { status: 200 });
      }
      if (url.includes('/calendar/v3/users/me/calendarList')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 'primary', summary: 'Lịch giảng dạy', primary: true }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/calendar/v3/calendars/primary/events') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'ev-1',
                summary: 'Dạy tiết 1 lớp 9A1',
                location: 'Phòng B202',
                start: { dateTime: '2026-10-29T07:00:00+07:00' },
                end: { dateTime: '2026-10-29T07:45:00+07:00' },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/calendar/v3/calendars/primary/events/ev-1') && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'ev-1',
            summary: body.summary,
            description: body.description,
            location: body.location,
            start: body.start,
            end: body.end,
            colorId: body.colorId,
            recurrence: body.recurrence,
            reminders: body.reminders,
            attendees: body.attendees?.map((a: any) => ({ email: a.email, responseStatus: 'needsAction' })),
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
          }),
          { status: 200 }
        );
      }
      if (url.includes('/calendar/v3/calendars/primary/events') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'ev-2',
            summary: body.summary,
            start: body.start,
            end: body.end,
            colorId: body.colorId,
            recurrence: body.recurrence,
            reminders: body.reminders,
            attendees: body.attendees,
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/users/@me/lists')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 'list-1', title: 'Hồ sơ sổ sách' }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/lists/list-1/tasks') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'task-1',
                title: 'Nộp ma trận đề kiểm tra giữa kì 1',
                notes: 'Khối 8 & Khối 9',
                status: 'needsAction',
                due: '2026-10-30T00:00:00.000Z',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/lists/list-1/tasks') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'task-2',
            title: body.title,
            status: 'needsAction',
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/lists/list-1/tasks/task-1') && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'task-1',
            title: 'Nộp ma trận đề kiểm tra giữa kì 1',
            status: body.status,
          }),
          { status: 200 }
        );
      }
      if (url.includes('keep.googleapis.com/v1/notes')) {
        return new Response(
          JSON.stringify({
            notes: [
              {
                name: 'notes/keep-1',
                title: 'Ghi chú chuyên đề STEM khối 9',
                body: { text: { text: 'Chuẩn bị bộ dụng cụ quang học cho lớp 9A1' } },
                updateTime: '2026-10-28T08:00:00Z',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('googleapis.com/drive/v3/files') && (!init?.method || init.method === 'GET')) {
        if (url.includes('notes-folder') || url.includes('application%2Fvnd.google-apps.folder')) {
          return new Response(JSON.stringify({ files: [{ id: 'folder-notes-1', name: 'PVTA Ghi chú (Notes)' }] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'drive-note-1',
                name: 'Biên bản họp tổ KHTN tuần 8.md',
                description: 'Thống nhất cấu trúc đề kiểm tra giữa kì 1',
                modifiedTime: '2026-10-28T09:00:00Z',
                webViewLink: 'https://drive.google.com/file/d/drive-note-1/view',
                appProperties: {
                  pvtaKind: 'note',
                  pvtaColor: 'green',
                  pvtaPinned: 'true',
                  pvtaTags: 'Họp tổ,Đề thi',
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('googleapis.com/drive/v3/files') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'drive-note-new',
            name: body.name,
            description: body.description,
            modifiedTime: '2026-10-28T10:00:00Z',
            appProperties: body.appProperties,
          }),
          { status: 200 }
        );
      }
      if (url.includes('googleapis.com/drive/v3/files/drive-note-new') && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'drive-note-new',
            name: body.name,
            description: body.description,
            modifiedTime: '2026-10-28T10:05:00Z',
            appProperties: body.appProperties,
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const host = new GoogleWorkspaceHost({
      home,
      fetcher: mockFetch as unknown as typeof fetch,
      notify: v => notifications.push(v),
    });

    const saved = await host.rpc('google.saveConfig', {
      clientId: '12345-test.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-secret',
    }) as any;
    expect(saved.configured).toBe(true);
    expect(saved.hasClientSecret).toBe(true);

    await host.exchangeCodeForTokens({
      code: '4/0AeanS0_auth_code',
      redirectUri: 'http://127.0.0.1:54321/oauth2callback',
      verifier: 'test_verifier',
    });

    const synced = await host.rpc('google.sync', {}) as any;
    expect(synced.connected).toBe(true);
    expect(synced.email).toBe('giaovien@edu.vn');
    expect(synced.events).toHaveLength(1);
    expect(synced.events[0].summary).toBe('Dạy tiết 1 lớp 9A1');
    expect(synced.tasks).toHaveLength(1);
    expect(synced.tasks[0].title).toBe('Nộp ma trận đề kiểm tra giữa kì 1');
    expect(synced.notes).toHaveLength(2);
    expect(synced.notes[0].title).toBe('Biên bản họp tổ KHTN tuần 8');

    const grounding = host.grounding();
    expect(grounding).toContain('Dạy tiết 1 lớp 9A1');
    expect(grounding).toContain('Nộp ma trận đề kiểm tra giữa kì 1');
    expect(grounding).toContain('Biên bản họp tổ KHTN tuần 8');
    expect(grounding).toContain('Ghi chú chuyên đề STEM khối 9');

    await host.rpc('google.createEvent', {
      summary: 'Họp hội đồng sư phạm',
      start: '2026-10-31',
      allDay: true,
      colorId: '9',
      recurrence: ['RRULE:FREQ=WEEKLY'],
      remindersMinutes: [15],
      attendees: ['to_khtn@edu.vn', 'hieutruong@edu.vn'],
    });
    const afterEventUpdate = (await host.rpc('google.updateEvent', {
      eventId: 'ev-1',
      calendarId: 'primary',
      summary: 'Dạy tiết 1 lớp 9A1 (Ôn tập chương 2)',
      description: 'Nhắc học sinh mang máy tính cầm tay và phiếu học tập số 2',
      location: 'Phòng Thực hành Lý',
      start: '2026-10-29T07:30:00+07:00',
      end: '2026-10-29T08:15:00+07:00',
      colorId: '2',
      recurrence: ['RRULE:FREQ=WEEKLY'],
      remindersMinutes: [30],
      attendees: ['gv_ly@edu.vn'],
    })) as any;
    const updatedEv = afterEventUpdate.events.find((e: any) => e.id === 'ev-1');
    expect(updatedEv?.summary).toBe('Dạy tiết 1 lớp 9A1 (Ôn tập chương 2)');
    expect(updatedEv?.description).toBe('Nhắc học sinh mang máy tính cầm tay và phiếu học tập số 2');
    expect(updatedEv?.location).toBe('Phòng Thực hành Lý');
    expect(updatedEv?.colorId).toBe('2');
    expect(updatedEv?.recurrence).toEqual(['RRULE:FREQ=WEEKLY']);
    expect(updatedEv?.remindersMinutes).toEqual([30]);
    expect(updatedEv?.attendees).toEqual(['gv_ly@edu.vn']);
    expect(updatedEv?.conferenceLink).toBe('https://meet.google.com/abc-defg-hij');

    await host.rpc('google.createTask', {
      title: 'Soạn KHBD bài 6',
      due: '2026-11-01',
    });
    await host.rpc('google.updateTask', {
      taskId: 'task-1',
      tasklistId: 'list-1',
      title: 'Nộp ma trận & đặc tả đề kiểm tra giữa kì 1',
      notes: 'Đã bổ sung bảng đặc tả KHTN 8 & 9',
      due: '2026-10-31',
    });
    await host.rpc('google.toggleTask', {
      taskId: 'task-1',
      completed: true,
    });
    const afterNoteCreate = await host.rpc('google.createNote', {
      title: 'Sổ đầu bài lớp 9A1',
      content: 'Học sinh tích cực phát biểu bài Khúc xạ ánh sáng.',
      color: 'blue',
      pinned: true,
      tags: ['Sổ đầu bài', '9A1'],
    }) as any;
    expect(afterNoteCreate.notes.some((n: any) => n.title === 'Sổ đầu bài lớp 9A1')).toBe(true);

    const afterNoteUpdate = await host.rpc('google.updateNote', {
      noteId: 'drive-note-new',
      title: 'Sổ đầu bài lớp 9A1 (Đã cập nhật)',
      color: 'purple',
    }) as any;
    expect(afterNoteUpdate.notes.some((n: any) => n.title === 'Sổ đầu bài lớp 9A1 (Đã cập nhật)')).toBe(true);

    const afterNoteDelete = await host.rpc('google.deleteNote', {
      noteId: 'drive-note-new',
    }) as any;
    expect(afterNoteDelete.notes.some((n: any) => n.id === 'drive-note-new')).toBe(false);

    const disconnected = await host.rpc('google.logout', {}) as any;
    expect(disconnected.connected).toBe(false);
    expect(disconnected.events).toHaveLength(0);
    expect(disconnected.notes).toHaveLength(0);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it('merges sub-calendars and multiple tasklists and isolates partial API errors in syncAll', async () => {
    const home = makeDir();
    let failTasks = true;

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'ya29.multi_token',
            refresh_token: '1//multi_refresh',
            expires_in: 3600,
          }),
          { status: 200 }
        );
      }
      if (url === 'https://www.googleapis.com/oauth2/v2/userinfo') {
        return new Response(JSON.stringify({ email: 'gv@school.edu.vn' }), { status: 200 });
      }
      if (url.includes('/calendar/v3/users/me/calendarList')) {
        return new Response(
          JSON.stringify({
            items: [
              { id: 'primary', summary: 'Lịch cá nhân', primary: true },
              { id: 'sub-cal-stem', summary: 'Lớp PP giảng dạy STEM', primary: false },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/calendar/v3/calendars/primary/events')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'ev-pri',
                summary: 'Sinh hoạt chủ nhiệm 9A1',
                start: { dateTime: '2026-10-28T07:00:00+07:00' },
                end: { dateTime: '2026-10-28T07:45:00+07:00' },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/calendar/v3/calendars/sub-cal-stem/events')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'ev-sub',
                summary: 'Tập huấn giáo dục STEM',
                start: { dateTime: '2026-10-29T14:00:00+07:00' },
                end: { dateTime: '2026-10-29T16:30:00+07:00' },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/users/@me/lists')) {
        if (failTasks) {
          return new Response(
            JSON.stringify({ error: { message: 'Google Tasks API has not been used in project before or it is disabled.' } }),
            { status: 403 }
          );
        }
        return new Response(
          JSON.stringify({
            items: [
              { id: 'tl-1', title: 'Việc cần làm của tôi' },
              { id: 'tl-2', title: 'Sổ sách chuyên môn' },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/lists/tl-1/tasks')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 't-1', title: 'Chấm bài KHTN 6', status: 'completed' }],
          }),
          { status: 200 }
        );
      }
      if (url.includes('tasks.googleapis.com/tasks/v1/lists/tl-2/tasks')) {
        return new Response(
          JSON.stringify({
            items: [{ id: 't-2', title: 'Soạn đề cương ôn tập giữa kì', status: 'needsAction' }],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });

    const host = new GoogleWorkspaceHost({
      home,
      fetcher: mockFetch as unknown as typeof fetch,
    });

    await host.rpc('google.saveConfig', { clientId: 'test-client.apps.googleusercontent.com' });
    await host.exchangeCodeForTokens({
      code: 'auth_code',
      redirectUri: 'http://127.0.0.1:50000/oauth2callback',
    });

    // Lần 1: Tasks API bị lỗi 403 nhưng Calendar vẫn phải lấy đủ sự kiện từ cả 2 lịch (primary + sub-cal-stem)
    const partial = (await host.rpc('google.sync', { syncAllSources: true })) as any;
    expect(partial.events).toHaveLength(2);
    expect(partial.events.map((e: any) => e.summary)).toEqual([
      'Sinh hoạt chủ nhiệm 9A1',
      'Tập huấn giáo dục STEM',
    ]);
    expect(partial.lastError).toContain('Google Tasks:');

    // Lần 2: Tasks API hoạt động trở lại, lấy đủ từ cả 2 danh sách việc
    failTasks = false;
    const full = (await host.rpc('google.sync', { syncAllSources: true })) as any;
    expect(full.lastError).toBeUndefined();
    expect(full.events).toHaveLength(2);
    expect(full.tasks).toHaveLength(2);
    expect(full.tasks.map((t: any) => t.title)).toContain('Chấm bài KHTN 6');
    expect(full.tasks.map((t: any) => t.title)).toContain('Soạn đề cương ôn tập giữa kì');
  });

  it('caps Drive appProperties.pvtaTags within 124 UTF-8 bytes, updates Keep/local notes safely, and falls back to local storage when offline', async () => {
    const home = makeDir();
    let capturedDrivePostBody: any;
    let drivePatchCalledForKeep = false;

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'ya29.keep_drive_token',
            refresh_token: '1//keep_drive_refresh',
            expires_in: 3600,
          }),
          { status: 200 }
        );
      }
      if (url.includes('keep.googleapis.com/v1/notes')) {
        return new Response(
          JSON.stringify({
            notes: [
              {
                name: 'notes/keep-1',
                title: 'Ghi chú từ Google Keep',
                body: { text: { text: 'Nội dung Keep gốc' } },
                updateTime: '2026-10-28T08:00:00Z',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('googleapis.com/drive/v3/files') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ files: [{ id: 'folder-1', name: 'PVTA Ghi chú (Notes)' }] }), { status: 200 });
      }
      if (url.includes('googleapis.com/drive/v3/files') && init?.method === 'POST') {
        capturedDrivePostBody = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            id: 'drive-vn-1',
            name: capturedDrivePostBody.name,
            description: capturedDrivePostBody.description,
            modifiedTime: '2026-10-28T11:00:00Z',
            appProperties: capturedDrivePostBody.appProperties,
          }),
          { status: 200 }
        );
      }
      if (url.includes('googleapis.com/drive/v3/files/notes%2Fkeep-1') && init?.method === 'PATCH') {
        drivePatchCalledForKeep = true;
        return new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 });
      }
      return new Response('{}', { status: 200 });
    });

    const host = new GoogleWorkspaceHost({
      home,
      fetcher: mockFetch as unknown as typeof fetch,
    });

    // 1. Khi chưa kết nối OAuth 2.0, vẫn tạo và cập nhật được ghi chú local trên máy
    const localCreated = (await host.rpc('google.createNote', {
      title: 'Ghi chú sổ đầu bài ngoại tuyến',
      content: 'Lớp 9A2 vắng 1 học sinh có phép.',
      color: 'green',
      pinned: true,
      tags: ['Sổ đầu bài', '9A2'],
    })) as any;
    expect(localCreated.notes).toHaveLength(1);
    expect(localCreated.notes[0].source).toBe('local');
    expect(localCreated.notes[0].title).toBe('Ghi chú sổ đầu bài ngoại tuyến');

    // 2. Sau khi kết nối OAuth, tạo ghi chú có nhiều nhãn tiếng Việt dài -> kiểm tra UTF-8 byte length <= 124
    await host.rpc('google.saveConfig', { clientId: 'test-client.apps.googleusercontent.com' });
    await host.exchangeCodeForTokens({
      code: 'auth_code',
      redirectUri: 'http://127.0.0.1:50000/oauth2callback',
    });

    const longVietnameseTags = [
      'Kế hoạch bài dạy Công văn 5512',
      'Sổ đầu bài lớp chủ nhiệm 9A1',
      'Biên bản họp tổ Khoa học tự nhiên',
      'Đề kiểm tra đánh giá giữa học kì 1',
      'Bồi dưỡng học sinh giỏi cấp thành phố',
    ];
    await host.rpc('google.createNote', {
      title: 'Ghi chú chuyên môn tiếng Việt',
      content: 'Nội dung ghi chú tiếng Việt.',
      tags: longVietnameseTags,
    });

    expect(capturedDrivePostBody).toBeTruthy();
    const pvtaTagsVal = String(capturedDrivePostBody.appProperties.pvtaTags || '');
    const totalBytes = Buffer.byteLength('pvtaTags', 'utf8') + Buffer.byteLength(pvtaTagsVal, 'utf8');
    expect(totalBytes).toBeLessThanOrEqual(124);

    // 3. Đồng bộ Keep note và ghim/đổi màu Keep note mà không gọi nhầm Drive PATCH 404
    await host.rpc('google.listNotes', {});
    const afterKeepPin = (await host.rpc('google.updateNote', {
      noteId: 'notes/keep-1',
      pinned: true,
      color: 'pink',
    })) as any;
    expect(drivePatchCalledForKeep).toBe(false);
    const keepNote = afterKeepPin.notes.find((n: any) => n.id === 'notes/keep-1');
    expect(keepNote?.pinned).toBe(true);
    expect(keepNote?.color).toBe('pink');
    // Ghi chú local tạo lúc chưa đăng nhập vẫn được bảo toàn sau khi sync
    expect(afterKeepPin.notes.some((n: any) => n.title === 'Ghi chú sổ đầu bài ngoại tuyến')).toBe(true);
  });
});
