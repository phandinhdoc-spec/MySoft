// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock('../src/ipc', () => mocks);

import { GoogleWorkspacePanel } from '../src/GoogleWorkspacePanel';
import { ACTIVITY_MENUS } from '../src/ActivityRail';

it('includes Google Calendar & Tasks in ACTIVITY_MENUS and renders full timetable calendar views (day, week, month, agenda)', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  expect(ACTIVITY_MENUS.some(([key, icon]) => key === 'calendar' && icon === 'calendar')).toBe(true);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  mocks.subscribe.mockResolvedValue(() => {});
  mocks.rpc.mockImplementation(async (method: string) => {
    if (method === 'google.status') {
      return {
        configured: true,
        connected: true,
        authenticating: false,
        clientId: 'client-123.apps.googleusercontent.com',
        hasClientSecret: true,
        email: 'giaovien@hcm.edu.vn',
        selectedCalendarId: 'primary',
        selectedTasklistId: 'list-1',
        calendars: [{ id: 'primary', summary: 'Lịch giảng dạy', primary: true }],
        events: [
          {
            id: 'ev-1',
            calendarId: 'primary',
            summary: 'Tiết 2: KHTN 8A2',
            start: `${todayIso}T08:00:00`,
            end: `${todayIso}T08:45:00`,
            location: 'Phòng 204',
          },
          {
            id: 'ev-2',
            calendarId: 'primary',
            summary: 'Họp tổ chuyên môn KHTN',
            start: `${todayIso}T14:00:00`,
            end: `${todayIso}T15:30:00`,
            location: 'Phòng Hội đồng',
          },
        ],
        tasklists: [{ id: 'list-1', title: 'Công việc tuần' }],
        tasks: [
          {
            id: 'task-1',
            tasklistId: 'list-1',
            title: 'Hoàn thiện sổ đầu bài tuần 8',
            status: 'needsAction',
            due: `${todayIso}T00:00:00.000Z`,
          },
        ],
        notes: [
          {
            id: 'note-1',
            title: 'Ghi chú họp tổ KHTN tuần 9',
            content: 'Thống nhất ma trận đề kiểm tra giữa kì 1 cho khối 8 và khối 9.',
            color: 'yellow',
            pinned: true,
            tags: ['Họp tổ', 'KHTN'],
            source: 'drive',
            updated: `${todayIso}T09:00:00.000Z`,
          },
        ],
        scopes: [],
      };
    }
    return {};
  });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onPrompt = vi.fn();

  try {
    await act(async () => {
      root.render(
        React.createElement(GoogleWorkspacePanel, {
          report: vi.fn(),
          notice: vi.fn(),
          onPrompt,
        })
      );
    });

    expect(host.textContent).toContain('Google Calendar, Tasks & Sổ tay Ghi chú');
    expect(host.textContent).toContain('giaovien@hcm.edu.vn');
    expect(host.textContent).toContain('Tiết 2: KHTN 8A2');
    expect(host.textContent).toContain('Hoàn thiện sổ đầu bài tuần 8');
    expect(host.textContent).toContain('Ghi chú họp tổ KHTN tuần 9');

    const aiBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Xuất Kế hoạch tuần ra Word'));
    expect(aiBtn).toBeTruthy();
    await act(async () => aiBtn!.click());
    expect(onPrompt).toHaveBeenCalled();

    // Chuyển sang tab Lịch & Thời khóa biểu (mặc định mở chế độ Tuần TKB)
    const calTab = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Lịch & Thời khóa biểu'));
    expect(calTab).toBeTruthy();
    await act(async () => calTab!.click());

    // Kiểm tra chế độ Tuần (TimeGrid) có cột giờ/tiết và sự kiện
    expect(host.querySelector('.google-timegrid-wrapper.mode-week')).toBeTruthy();
    expect(host.textContent).toContain('Tiết 1 (Sáng)');
    expect(host.textContent).toContain('07:30–08:15');
    expect(host.textContent).toContain('T7: 07:15–08:00');
    expect(host.textContent).toContain('13:30–14:15');
    expect(host.textContent).toContain('Tiết 2: KHTN 8A2');

    // Bấm vào sự kiện trên lưới Thời khóa biểu để mở hộp chi tiết nhanh
    const evBlock = host.querySelector('.google-timegrid-event') as HTMLButtonElement | null;
    expect(evBlock).toBeTruthy();
    await act(async () => evBlock!.click());
    expect(host.querySelector('.google-event-popover')).toBeTruthy();
    expect(host.textContent).toContain('Soạn bài / Chuẩn bị với AI');

    // Chuyển sang chế độ Ngày (Day view)
    const dayBtn = [...host.querySelectorAll('.google-view-switcher button')].find(b => b.textContent === 'Ngày');
    expect(dayBtn).toBeTruthy();
    await act(async () => dayBtn!.click());
    expect(host.querySelector('.google-timegrid-wrapper.mode-day')).toBeTruthy();

    // Chuyển sang chế độ Tháng (Month view)
    const monthBtn = [...host.querySelectorAll('.google-view-switcher button')].find(b => b.textContent === 'Tháng');
    expect(monthBtn).toBeTruthy();
    await act(async () => monthBtn!.click());
    expect(host.querySelector('.google-monthgrid-wrapper')).toBeTruthy();
    expect(host.querySelectorAll('.google-monthgrid-cell').length).toBe(42);

    // Chuyển sang chế độ Danh sách (Agenda view)
    const agendaBtn = [...host.querySelectorAll('.google-view-switcher button')].find(b => b.textContent === 'Danh sách');
    expect(agendaBtn).toBeTruthy();
    await act(async () => agendaBtn!.click());
    expect(host.querySelector('.google-item-list')).toBeTruthy();

    // Chuyển sang tab Sổ tay Ghi chú (Notes)
    const notesTab = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Sổ tay Ghi chú (Notes)'));
    expect(notesTab).toBeTruthy();
    await act(async () => notesTab!.click());
    expect(host.querySelector('.google-notes-grid')).toBeTruthy();
    expect(host.textContent).toContain('Ghi chú họp tổ KHTN tuần 9');
    expect(host.textContent).toContain('#Họp tổ');
    expect(host.textContent).toContain('Triển khai với AI');

    const setupTab = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Cấu hình OAuth 2.0'));
    expect(setupTab).toBeTruthy();
    await act(async () => setupTab!.click());
    expect(host.textContent).toContain('OAuth Client ID');
    expect(host.textContent).toContain('Sổ tay Ghi chú kiểu Keep sẽ tự động lưu và đồng bộ qua Google Drive API');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
