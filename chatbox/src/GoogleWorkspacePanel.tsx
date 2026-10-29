import {t as uiText} from './i18n';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Icon} from './Icon';
import {pickFiles,rpc,subscribe} from './ipc';
import type {
  GoogleWorkspaceView,
  GoogleCalendarEvent,
  GoogleTaskItem,
  GoogleNoteItem,
  GoogleNoteColor,
  WorkspaceLocalAttachment,
} from '../../core/src/desktop/google-workspace';
import type { LocalEventData, LocalRecordView, LocalTaskData } from '../../core/src/desktop/calendar-local';
import './google-workspace.css';

export type LocalOverlay = {
  events: LocalRecordView<LocalEventData>[];
  tasks: LocalRecordView<LocalTaskData>[];
};
const EMPTY_LOCAL_OVERLAY: LocalOverlay = { events: [], tasks: [] };

/**
 * Gộp bản ghi cục bộ chưa đồng bộ (dirty/error) lên danh sách từ Google để lưới hiển thị đúng sau khi lưu.
 * Bản clean không được gộp: dữ liệu đó đã nằm trong danh sách Google.
 */
function overlayEvents(base: GoogleCalendarEvent[], pending: LocalRecordView<LocalEventData>[]): GoogleCalendarEvent[] {
  const byId = new Map<string, GoogleCalendarEvent>(base.map(e => [e.id, e]));
  for (const r of pending) {
    const id = r.googleId ?? r.localId;
    if (r.deleted) {
      byId.delete(id);
      continue;
    }
    const prev = byId.get(id);
    byId.set(id, {
      ...(prev ?? {}),
      ...r.data,
      id,
      attachments: r.attachments?.length ? r.attachments : prev?.attachments,
      localId: r.localId,
      localPending: true,
    } as unknown as GoogleCalendarEvent);
  }
  return [...byId.values()];
}

function overlayTasks(base: GoogleTaskItem[], pending: LocalRecordView<LocalTaskData>[]): GoogleTaskItem[] {
  const byId = new Map<string, GoogleTaskItem>(base.map(t => [t.id, t]));
  for (const r of pending) {
    const id = r.googleId ?? r.localId;
    if (r.deleted) {
      byId.delete(id);
      continue;
    }
    const prev = byId.get(id);
    byId.set(id, {
      ...(prev ?? {}),
      id,
      title: r.data.title,
      due: r.data.due,
      notes: r.data.notes,
      tasklistId: r.data.tasklistId ?? prev?.tasklistId,
      attachments: r.attachments?.length ? r.attachments : prev?.attachments,
      localId: r.localId,
      localPending: true,
    } as unknown as GoogleTaskItem);
  }
  return [...byId.values()];
}

export type GoogleTab ='overview' | 'calendar' | 'tasks' | 'notes' | 'setup';
export type CalendarViewMode = 'day' | 'week' | 'month' | 'year' | 'agenda';
export interface GoogleNavigation {
  tab?: GoogleTab;
  calendarView?: CalendarViewMode;
  action?: 'new-event' | 'new-task' | 'new-note' | 'sync' | 'export-week';
}

const NOTE_COLOR_META: Array<{ id: GoogleNoteColor; label: string; hex: string }> = [
  { id: 'yellow', label: 'Vàng ghi chú', hex: '#fef3c7' },
  { id: 'green', label: 'Xanh ngọc', hex: '#d1fae5' },
  { id: 'blue', label: 'Xanh dương', hex: '#dbeafe' },
  { id: 'purple', label: 'Tím nhạt', hex: '#ede9fe' },
  { id: 'pink', label: 'Hồng phấn', hex: '#fce7f3' },
  { id: 'default', label: 'Trắng chuẩn', hex: '#f8fafc' },
];

export const GOOGLE_EVENT_COLORS: Array<{ id: string; label: string; hex: string; bg: string; fg: string }> = [
  { id: '', label: 'Tự động theo loại tiết', hex: '#2563eb', bg: '#eff6ff', fg: '#0f172a' },
  { id: '1', label: 'Xanh Oải hương (Lavender)', hex: '#7986cb', bg: '#eef2ff', fg: '#1e1b4b' },
  { id: '2', label: 'Xanh Xô thơm (Sage)', hex: '#33b679', bg: '#ecfdf5', fg: '#064e3b' },
  { id: '3', label: 'Tím Nho (Grape)', hex: '#8e24aa', bg: '#faf5ff', fg: '#4c1d95' },
  { id: '4', label: 'Hồng Hồng hạc (Flamingo)', hex: '#e67c73', bg: '#fff1f2', fg: '#881337' },
  { id: '5', label: 'Vàng Chuối (Banana)', hex: '#f6bf26', bg: '#fefce8', fg: '#713f12' },
  { id: '6', label: 'Cam Quýt (Tangerine)', hex: '#f4511e', bg: '#fff7ed', fg: '#7c2d12' },
  { id: '7', label: 'Xanh Lam khổng tước (Peacock)', hex: '#039be5', bg: '#f0f9ff', fg: '#0c4a6e' },
  { id: '9', label: 'Xanh Việt quất (Blueberry)', hex: '#3f51b5', bg: '#eff6ff', fg: '#1e3a8a' },
  { id: '10', label: 'Xanh Húng quế (Basil)', hex: '#0b8043', bg: '#f0fdf4', fg: '#14532d' },
  { id: '11', label: 'Đỏ Cà chua (Tomato)', hex: '#d50000', bg: '#fef2f2', fg: '#7f1d1d' },
];

export const RECURRENCE_PRESETS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Không lặp lại (Chỉ tiết/sự kiện này)' },
  { value: 'RRULE:FREQ=WEEKLY', label: 'Hàng tuần vào thứ này (Thời khóa biểu cố định)' },
  { value: 'RRULE:FREQ=WEEKLY;INTERVAL=2', label: 'Cách 2 tuần 1 lần (Tuần chẵn / lẻ)' },
  { value: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Mỗi ngày đi dạy (Thứ 2 → Thứ 6)' },
  { value: 'RRULE:FREQ=DAILY', label: 'Hàng ngày' },
  { value: 'RRULE:FREQ=MONTHLY', label: 'Hàng tháng' },
];

export const REMINDER_PRESETS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Theo mặc định của Google Calendar' },
  { value: '0', label: 'Đúng giờ bắt đầu tiết dạy' },
  { value: '5', label: 'Trước 5 phút' },
  { value: '10', label: 'Trước 10 phút' },
  { value: '15', label: 'Trước 15 phút (Chuẩn bị vào lớp)' },
  { value: '30', label: 'Trước 30 phút' },
  { value: '60', label: 'Trước 1 giờ' },
  { value: '1440', label: 'Trước 1 ngày (Soạn bài / Chuẩn bị hồ sơ)' },
];

const WEEKDAY_SHORT_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
const WEEKDAY_LONG_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'] as const;
const HOURS_GRID = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 -> 21:00
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT_PX = 84;
const TIME_AXIS_WIDTH_PX = 106;

export interface TimetablePeriodRow {
  id: string;
  session: 'morning' | 'afternoon' | 'break' | 'evening';
  label: string;
  subLabel?: string;
  /** Khung giờ chuẩn từ Thứ 2 đến Thứ 6 */
  weekdayRange: string;
  weekdayStartMin: number;
  weekdayEndMin: number;
  /** Khung giờ chuẩn Sáng Thứ 7 (nếu khác Thứ 2–Thứ 6) */
  saturdayRange?: string;
  saturdayStartMin?: number;
  saturdayEndMin?: number;
}

/**
 * Khung giờ tiết học chính xác theo Thời khóa biểu chuẩn của trường:
 * 1) Thứ 2 → Thứ 6:
 *    - Sáng: Tiết 1 (07:30–08:15), Tiết 2 (08:15–09:00), Tiết 3 (09:30–10:15), Tiết 4 (10:15–11:00)
 *    - Chiều: Tiết 1 (13:30–14:15), Tiết 2 (14:15–15:00), Tiết 3 (15:30–16:15), Tiết 4 (16:15–17:00)
 * 2) Sáng Thứ 7:
 *    - Tiết 1 (07:15–08:00), Tiết 2 (08:00–08:45), Tiết 3 (09:15–10:00), Tiết 4 (10:00–10:45), Tiết 5 (10:45–11:30)
 */
export const TIMETABLE_PERIOD_ROWS: readonly TimetablePeriodRow[] = [
  {
    id: 'morning-p1',
    session: 'morning',
    label: 'Tiết 1 (Sáng)',
    weekdayRange: '07:30 – 08:15',
    weekdayStartMin: 7 * 60 + 30,
    weekdayEndMin: 8 * 60 + 15,
    saturdayRange: '07:15 – 08:00',
    saturdayStartMin: 7 * 60 + 15,
    saturdayEndMin: 8 * 60,
  },
  {
    id: 'morning-p2',
    session: 'morning',
    label: 'Tiết 2 (Sáng)',
    weekdayRange: '08:15 – 09:00',
    weekdayStartMin: 8 * 60 + 15,
    weekdayEndMin: 9 * 60,
    saturdayRange: '08:00 – 08:45',
    saturdayStartMin: 8 * 60,
    saturdayEndMin: 8 * 60 + 45,
  },
  {
    id: 'morning-break',
    session: 'break',
    label: 'Ra chơi sáng',
    weekdayRange: '09:00 – 09:30',
    weekdayStartMin: 9 * 60,
    weekdayEndMin: 9 * 60 + 30,
    saturdayRange: '08:45 – 09:15',
    saturdayStartMin: 8 * 60 + 45,
    saturdayEndMin: 9 * 60 + 15,
  },
  {
    id: 'morning-p3',
    session: 'morning',
    label: 'Tiết 3 (Sáng)',
    weekdayRange: '09:30 – 10:15',
    weekdayStartMin: 9 * 60 + 30,
    weekdayEndMin: 10 * 60 + 15,
    saturdayRange: '09:15 – 10:00',
    saturdayStartMin: 9 * 60 + 15,
    saturdayEndMin: 10 * 60,
  },
  {
    id: 'morning-p4',
    session: 'morning',
    label: 'Tiết 4 (Sáng)',
    weekdayRange: '10:15 – 11:00',
    weekdayStartMin: 10 * 60 + 15,
    weekdayEndMin: 11 * 60,
    saturdayRange: '10:00 – 10:45',
    saturdayStartMin: 10 * 60,
    saturdayEndMin: 10 * 60 + 45,
  },
  {
    id: 'morning-p5',
    session: 'morning',
    label: 'Tiết 5 (Thứ 7)',
    subLabel: 'T2–T6 nghỉ trưa',
    weekdayRange: '11:00 – 11:30',
    weekdayStartMin: 11 * 60,
    weekdayEndMin: 11 * 60 + 30,
    saturdayRange: '10:45 – 11:30',
    saturdayStartMin: 10 * 60 + 45,
    saturdayEndMin: 11 * 60 + 30,
  },
  {
    id: 'noon-break',
    session: 'break',
    label: 'Nghỉ trưa',
    weekdayRange: '11:30 – 13:30',
    weekdayStartMin: 11 * 60 + 30,
    weekdayEndMin: 13 * 60 + 30,
  },
  {
    id: 'afternoon-p1',
    session: 'afternoon',
    label: 'Tiết 1 (Chiều)',
    weekdayRange: '13:30 – 14:15',
    weekdayStartMin: 13 * 60 + 30,
    weekdayEndMin: 14 * 60 + 15,
  },
  {
    id: 'afternoon-p2',
    session: 'afternoon',
    label: 'Tiết 2 (Chiều)',
    weekdayRange: '14:15 – 15:00',
    weekdayStartMin: 14 * 60 + 15,
    weekdayEndMin: 15 * 60,
  },
  {
    id: 'afternoon-break',
    session: 'break',
    label: 'Ra chơi chiều',
    weekdayRange: '15:00 – 15:30',
    weekdayStartMin: 15 * 60,
    weekdayEndMin: 15 * 60 + 30,
  },
  {
    id: 'afternoon-p3',
    session: 'afternoon',
    label: 'Tiết 3 (Chiều)',
    weekdayRange: '15:30 – 16:15',
    weekdayStartMin: 15 * 60 + 30,
    weekdayEndMin: 16 * 60 + 15,
  },
  {
    id: 'afternoon-p4',
    session: 'afternoon',
    label: 'Tiết 4 (Chiều)',
    weekdayRange: '16:15 – 17:00',
    weekdayStartMin: 16 * 60 + 15,
    weekdayEndMin: 17 * 60,
  },
];

const PERIOD_HINTS: Record<number, { title: string; time: string; satTime?: string }> = {
  7: { title: 'Tiết 1 (Sáng)', time: '07:30–08:15', satTime: 'T7: 07:15–08:00' },
  8: { title: 'Tiết 2 (Sáng)', time: '08:15–09:00', satTime: 'T7: 08:00–08:45' },
  9: { title: 'Tiết 3 (Sáng)', time: '09:30–10:15', satTime: 'T7: 09:15–10:00' },
  10: { title: 'Tiết 4 (Sáng)', time: '10:15–11:00', satTime: 'T7: 10:00–10:45' },
  11: { title: 'Tiết 5 (Sáng T7)', time: 'T7: 10:45–11:30' },
  13: { title: 'Tiết 1 (Chiều)', time: '13:30–14:15' },
  14: { title: 'Tiết 2 (Chiều)', time: '14:15–15:00' },
  15: { title: 'Tiết 3 (Chiều)', time: '15:30–16:15' },
  16: { title: 'Tiết 4 (Chiều)', time: '16:15–17:00' },
};

function matchEventPeriodLabel(startDate: Date, endDate: Date): string | undefined {
  const dow = startDate.getDay(); // 6 = Thứ 7, 1..5 = Thứ 2..Thứ 6
  const startMin = startDate.getHours() * 60 + startDate.getMinutes();
  const endMin = endDate.getHours() * 60 + endDate.getMinutes();
  for (const row of TIMETABLE_PERIOD_ROWS) {
    if (row.session === 'break') continue;
    if (dow === 6 && row.saturdayStartMin !== undefined && row.saturdayEndMin !== undefined) {
      if (Math.abs(startMin - row.saturdayStartMin) <= 5 && Math.abs(endMin - row.saturdayEndMin) <= 5) {
        return row.label.replace(/\s*\(.*\)$/, '');
      }
    }
    if (dow >= 1 && dow <= 5) {
      if (Math.abs(startMin - row.weekdayStartMin) <= 5 && Math.abs(endMin - row.weekdayEndMin) <= 5) {
        return row.label.replace(/\s*\(.*\)$/, '');
      }
    }
  }
  return undefined;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res;
}

function startOfWeekMonday(d: Date): Date {
  const s = startOfDay(d);
  const day = s.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(s, diff);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseEventRange(ev: GoogleCalendarEvent): {
  startDate: Date;
  endDate: Date;
  allDay: boolean;
} {
  const allDay = Boolean(ev.allDay || /^\d{4}-\d{2}-\d{2}$/.test(ev.start));
  if (allDay) {
    const [sy, sm, sd] = ev.start.slice(0, 10).split('-').map(Number);
    const startDate = new Date(sy || 2026, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
    let endDate = startDate;
    if (ev.end && /^\d{4}-\d{2}-\d{2}/.test(ev.end)) {
      const [ey, em, ed] = ev.end.slice(0, 10).split('-').map(Number);
      const rawEnd = new Date(ey || 2026, (em || 1) - 1, ed || 1, 0, 0, 0, 0);
      // Google Calendar all-day end date is exclusive
      endDate = rawEnd > startDate ? addDays(rawEnd, -1) : startDate;
    }
    return { startDate, endDate, allDay: true };
  }
  const s = new Date(ev.start);
  const startDate = Number.isNaN(s.getTime()) ? new Date() : s;
  const e = ev.end ? new Date(ev.end) : new Date(startDate.getTime() + 45 * 60_000);
  const endDate = Number.isNaN(e.getTime()) || e <= startDate ? new Date(startDate.getTime() + 45 * 60_000) : e;
  return { startDate, endDate, allDay: false };
}

function eventOccursOnDay(ev: GoogleCalendarEvent, day: Date): boolean {
  const { startDate, endDate, allDay } = parseEventRange(ev);
  const dayStart = startOfDay(day);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  if (allDay) {
    return dayStart >= startOfDay(startDate) && dayStart <= startOfDay(endDate);
  }
  return startDate <= dayEnd && endDate >= dayStart;
}

function fmtTimeShort(dt: Date): string {
  return dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDateTime(iso: string, allDay?: boolean): string {
  if (!iso) return '';
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y} (Cả ngày)`;
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateShort(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function toLocalDateTimeInput(iso: string, fallbackAllDay?: boolean): string {
  if (!iso) return defaultEventStart();
  if (fallbackAllDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return `${iso.slice(0, 10)}T07:30`;
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function defaultEventStart(baseDate?: Date, hour?: number): string {
  const d = baseDate ? new Date(baseDate) : new Date(Date.now() + 3600_000);
  if (typeof hour === 'number') {
    const isSat = d.getDay() === 6;
    const hint = PERIOD_HINTS[hour];
    const timeStr = isSat && hint?.satTime ? hint.satTime.replace(/^T7:\s*/, '') : hint?.time;
    const startPart = timeStr?.split('–')[0];
    if (startPart && /^\d{2}:\d{2}$/.test(startPart)) {
      const [hh = hour, mm = 0] = startPart.split(':').map(Number);
      d.setHours(hh, mm, 0, 0);
    } else {
      d.setHours(hour, 0, 0, 0);
    }
  } else {
    d.setMinutes(0, 0, 0);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEventEnd(baseDate?: Date, hour?: number): string {
  const d = baseDate ? new Date(baseDate) : new Date(Date.now() + 3600_000);
  if (typeof hour === 'number') {
    const isSat = d.getDay() === 6;
    const hint = PERIOD_HINTS[hour];
    const timeStr = isSat && hint?.satTime ? hint.satTime.replace(/^T7:\s*/, '') : hint?.time;
    const endPart = timeStr?.split('–')[1];
    if (endPart && /^\d{2}:\d{2}$/.test(endPart)) {
      const [hh = hour, mm = 45] = endPart.split(':').map(Number);
      d.setHours(hh, mm, 0, 0);
    } else {
      d.setHours(hour, 45, 0, 0);
    }
  } else {
    d.setMinutes(45, 0, 0);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function classifyEventTone(summary: string): string {
  const s = summary.toLowerCase();
  if (
    s.includes('tiết') ||
    s.includes('lớp') ||
    s.includes('dạy') ||
    s.includes('khtn') ||
    s.includes('stem') ||
    s.includes('gdđp') ||
    s.includes('kns') ||
    s.includes('hdtn') ||
    s.includes('hđtn') ||
    s.includes('shcn') ||
    s.includes('chào cờ') ||
    s.includes('toán') ||
    s.includes('văn') ||
    s.includes('anh')
  ) {
    return 'lesson';
  }
  if (s.includes('họp') || s.includes('hội đồng') || s.includes('chuyên đề') || s.includes('tổ')) {
    return 'meeting';
  }
  if (s.includes('thi') || s.includes('kiểm tra') || s.includes('coi thi') || s.includes('chấm')) {
    return 'exam';
  }
  return 'general';
}

export function GoogleWorkspacePanel({
  report,
  notice,
  onPrompt,
  navigationRequest,
  onNavigated,
}: {
  report: (e: unknown) => void;
  notice: (s: string) => void;
  onPrompt: (prompt: string) => void;
  navigationRequest?: GoogleNavigation;
  onNavigated?: () => void;
}) {
  const reportRef = useRef(report);
  const noticeRef = useRef(notice);
  reportRef.current = report;
  noticeRef.current = notice;

  const [view, setView] = useState<GoogleWorkspaceView>();
  const [tab, setTab] = useState<GoogleTab>('overview');
  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>('week');
  const [cursorDate, setCursorDate] = useState<Date>(() => startOfDay(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<GoogleCalendarEvent | null>(null);
  const [busy, setBusy] = useState('');

  // Form OAuth 2.0 Config
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [configDirty, setConfigDirty] = useState(false);

  // Form New / Edit Calendar Event
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingEventSourceCalId, setEditingEventSourceCalId] = useState<string>('');
  const [evTargetCalId, setEvTargetCalId] = useState<string>('');
  const [evSummary, setEvSummary] = useState('');
  const [evStart, setEvStart] = useState(() => defaultEventStart());
  const [evEnd, setEvEnd] = useState(() => defaultEventEnd());
  const [evAllDay, setEvAllDay] = useState(false);
  const [evLocation, setEvLocation] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evColorId, setEvColorId] = useState<string>('');
  const [evRecurrence, setEvRecurrence] = useState<string>('');
  const [evReminderMin, setEvReminderMin] = useState<string>('');
  const [evAttendees, setEvAttendees] = useState<string>('');
  const [evAttachments, setEvAttachments] = useState<WorkspaceLocalAttachment[]>([]);

  // Bộ lọc hiển thị từng lịch con (Multi-calendar checkboxes kiểu macOS / Google Calendar), tìm kiếm & bảng bên
  const [hiddenCalIds, setHiddenCalIds] = useState<string[]>([]);
  const [calSearchQuery, setCalSearchQuery] = useState('');
  const [showCalSidebar, setShowCalSidebar] = useState(true);
  const [draggingEvent, setDraggingEvent] = useState<GoogleCalendarEvent | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<Date>(() => new Date());

  // Form New / Edit Task
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskSourceListId, setEditingTaskSourceListId] = useState<string>('');
  const [taskTargetListId, setTaskTargetListId] = useState<string>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskAttachments, setTaskAttachments] = useState<WorkspaceLocalAttachment[]>([]);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('all');

  // Form & State Notes (Google Keep & Google Drive)
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState<GoogleNoteColor>('yellow');
  const [notePinned, setNotePinned] = useState(false);
  const [noteTagsInput, setNoteTagsInput] = useState('');
  const [noteAttachments, setNoteAttachments] = useState<WorkspaceLocalAttachment[]>([]);
  const [noteQuery, setNoteQuery] = useState('');
  const [noteTagFilter, setNoteTagFilter] = useState('');

  // Bản ghi lưu cục bộ (calendar-store) đang chờ đồng bộ, gộp lên lưới khi hiển thị
  const [localOverlay, setLocalOverlay] = useState<LocalOverlay>(EMPTY_LOCAL_OVERLAY);
  const refreshLocalOverlay = useCallback(() => {
    void rpc<LocalOverlay>('calendar.listLocal')
      .then(o => setLocalOverlay(o))
      .catch(err => reportRef.current(err));
  }, []);
  const upsertLocalOverlay = useCallback(
    (rec: LocalRecordView<LocalEventData> | LocalRecordView<LocalTaskData>) => {
      setLocalOverlay(prev =>
        rec.kind === 'calendar'
          ? { ...prev, events: [...prev.events.filter(r => r.localId !== rec.localId), rec as LocalRecordView<LocalEventData>] }
          : { ...prev, tasks: [...prev.tasks.filter(r => r.localId !== rec.localId), rec as LocalRecordView<LocalTaskData>] }
      );
    },
    []
  );

  // Cửa sổ nổi rời (Detached Floating Window) nằm ngay cạnh vị trí chuột / tiết dạy được chọn
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number }>({ x: 340, y: 120 });
  const floatingDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Tự động đồng bộ tăng dần (Incremental Delta Sync) sau 30 giây ngừng tương tác
  const [autoSyncDeadline, setAutoSyncDeadline] = useState<number | null>(null);
  const [autoSyncRemainingSec, setAutoSyncRemainingSec] = useState<number>(0);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clampFloatingPosition = useCallback((rawX: number, rawY: number, width = 500, height = 520) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const x = Math.max(16, Math.min(vw - width - 16, rawX));
    const y = Math.max(52, Math.min(vh - Math.min(height, vh - 80) - 16, rawY));
    return { x, y };
  }, []);

  const anchorFloatingNearEvent = useCallback(
    (ev?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }) => {
      if (typeof window === 'undefined') return;
      const vw = window.innerWidth || 1280;
      const winW = 500;
      const winH = 520;
      if (ev?.currentTarget && ev.currentTarget instanceof HTMLElement) {
        const rect = ev.currentTarget.getBoundingClientRect();
        // Ưu tiên đặt cửa sổ rời ngay bên phải ô tiết dạy; nếu thiếu chỗ thì đặt bên trái để không che tiết đang xem
        let candidateX = rect.right + 14;
        if (candidateX + winW > vw - 16) {
          candidateX = Math.max(16, rect.left - winW - 14);
        }
        const candidateY = rect.top - 12;
        setFloatingPos(clampFloatingPosition(candidateX, candidateY, winW, winH));
        return;
      }
      if (typeof ev?.clientX === 'number' && typeof ev?.clientY === 'number' && (ev.clientX > 0 || ev.clientY > 0)) {
        const candidateX = ev.clientX + 20 + winW > vw - 16 ? ev.clientX - winW - 20 : ev.clientX + 20;
        const candidateY = ev.clientY - 40;
        setFloatingPos(clampFloatingPosition(candidateX, candidateY, winW, winH));
        return;
      }
      setFloatingPos(prev => clampFloatingPosition(prev.x, prev.y, winW, winH));
    },
    [clampFloatingPosition]
  );

  const startFloatingDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement)?.closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    floatingDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: floatingPos.x,
      origY: floatingPos.y,
    };
    const onMove = (moveEv: MouseEvent) => {
      if (!floatingDragRef.current) return;
      const dx = moveEv.clientX - floatingDragRef.current.startX;
      const dy = moveEv.clientY - floatingDragRef.current.startY;
      setFloatingPos(
        clampFloatingPosition(floatingDragRef.current.origX + dx, floatingDragRef.current.origY + dy, 480, 320)
      );
    };
    const onUp = () => {
      floatingDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [floatingPos, clampFloatingPosition]);

  const triggerIncrementalSyncNow = useCallback(async () => {
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    setAutoSyncDeadline(null);
    setAutoSyncRemainingSec(0);
    setBusy('sync-dirty');
    try {
      const res = await rpc<GoogleWorkspaceView & { syncedCount?: number }>('google.syncDirty');
      setView(res);
      if (res.syncedCount && res.syncedCount > 0) {
        noticeRef.current(
          uiText(`Đã tự động đồng bộ tăng dần ${res.syncedCount} mục mới/chỉnh sửa lên Google!`)
        );
      }
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }, []);

  /**
   * Đặt/làm mới bộ đếm 30 giây kể từ lần tương tác cuối cùng để tự động đẩy
   * duy nhất các dữ liệu mới thêm hoặc chỉnh sửa (`dirtyQueue`) lên Google.
   */
  const scheduleIncrementalSync = useCallback(() => {
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }
    const deadline = Date.now() + 30_000;
    setAutoSyncDeadline(deadline);
    setAutoSyncRemainingSec(30);
    autoSyncTimerRef.current = setTimeout(() => {
      autoSyncTimerRef.current = null;
      setAutoSyncDeadline(null);
      setAutoSyncRemainingSec(0);
      void triggerIncrementalSyncNow();
    }, 30_000);
  }, [triggerIncrementalSyncNow]);

  // Nếu người dùng tiếp tục gõ phím hoặc thao tác trong khi đang đếm ngược 30s thì tự động dời mốc 30s
  const bumpInteractionIfPendingSync = useCallback(() => {
    if (autoSyncTimerRef.current || (view?.dirtyCount && view.dirtyCount > 0)) {
      scheduleIncrementalSync();
    }
  }, [scheduleIncrementalSync, view?.dirtyCount]);

  useEffect(() => {
    if (!autoSyncDeadline) {
      setAutoSyncRemainingSec(0);
      return;
    }
    const iv = setInterval(() => {
      const rem = Math.max(0, Math.ceil((autoSyncDeadline - Date.now()) / 1000));
      setAutoSyncRemainingSec(rem);
    }, 1000);
    return () => clearInterval(iv);
  }, [autoSyncDeadline]);

  useEffect(() => {
    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, []);

  // Hỗ trợ đính kèm tệp và hình ảnh cục bộ vào Sự kiện lịch, Công việc hoặc Ghi chú
  const handlePickLocalAttachments = useCallback(
    async (target: 'event' | 'task' | 'note') => {
      try {
        const paths = await pickFiles();
        if (!paths.length) return;
        setBusy('attach');
        const added: WorkspaceLocalAttachment[] = [];
        for (const p of paths) {
          const att = await rpc<WorkspaceLocalAttachment>('google.addAttachment', { filePath: p });
          if (att && att.id) added.push(att);
        }
        if (added.length) {
          if (target === 'event') setEvAttachments(prev => [...prev, ...added]);
          else if (target === 'task') setTaskAttachments(prev => [...prev, ...added]);
          else setNoteAttachments(prev => [...prev, ...added]);
          bumpInteractionIfPendingSync();
        }
      } catch (err) {
        reportRef.current(err);
      } finally {
        setBusy('');
      }
    },
    [bumpInteractionIfPendingSync]
  );

  const handleUploadInputFiles = useCallback(
    async (files: FileList | null, target: 'event' | 'task' | 'note') => {
      if (!files || !files.length) return;
      setBusy('attach');
      try {
        const added: WorkspaceLocalAttachment[] = [];
        for (const file of Array.from(files)) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Không đọc được tệp đính kèm.'));
            reader.readAsDataURL(file);
          });
          const att = await rpc<WorkspaceLocalAttachment>('google.addAttachment', {
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataUrl,
          });
          if (att && att.id) added.push(att);
        }
        if (added.length) {
          if (target === 'event') setEvAttachments(prev => [...prev, ...added]);
          else if (target === 'task') setTaskAttachments(prev => [...prev, ...added]);
          else setNoteAttachments(prev => [...prev, ...added]);
          bumpInteractionIfPendingSync();
        }
      } catch (err) {
        reportRef.current(err);
      } finally {
        setBusy('');
      }
    },
    [bumpInteractionIfPendingSync]
  );

  const handleClipboardPasteAttachment = useCallback(
    async (e: React.ClipboardEvent, target: 'event' | 'task' | 'note') => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (!imageFiles.length) return;
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of imageFiles) dt.items.add(f);
      await handleUploadInputFiles(dt.files, target);
    },
    [handleUploadInputFiles]
  );

  const autoSyncedRef = useRef(false);
  const loadStatus = useCallback(() => {
    void rpc<GoogleWorkspaceView>('google.status')
      .then(v => {
        setView(v);
        refreshLocalOverlay();
        setClientId(prev => (configDirty ? prev : v.clientId || ''));
        if (
          v.connected &&
          !autoSyncedRef.current &&
          ((v.selectedCalendarId && v.selectedCalendarId !== '__all__' && v.events.length === 0) ||
            (!v.events.length && !v.tasks.length))
        ) {
          autoSyncedRef.current = true;
          const now = new Date();
          const rangeStart = addDays(startOfWeekMonday(new Date(now.getFullYear(), now.getMonth(), 1)), -180);
          const rangeEnd = addDays(new Date(now.getFullYear(), now.getMonth() + 2, 0), 180);
          void rpc<GoogleWorkspaceView>('google.sync', {
            syncAllSources: true,
            timeMin: rangeStart.toISOString(),
            timeMax: rangeEnd.toISOString(),
          })
            .then(synced => setView(synced))
            .catch(() => {});
        }
      })
      .catch(e => reportRef.current(e));
  }, [configDirty]);

  useEffect(() => {
    loadStatus();
    let alive = true;
    let off: (() => void) | undefined;
    void subscribe(e => {
      if (!alive || e.event !== 'google') return;
      const next = e.data as GoogleWorkspaceView;
      setView(next);
      if (!configDirty && next.clientId) setClientId(next.clientId);
    }).then(unsub => {
      if (alive) off = unsub;
      else unsub();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [loadStatus, configDirty]);

  const handledNav = useRef<GoogleNavigation>();
  useEffect(() => {
    if (!navigationRequest || handledNav.current === navigationRequest) return;
    handledNav.current = navigationRequest;
    onNavigated?.();
    if (navigationRequest.tab) setTab(navigationRequest.tab);
    if (navigationRequest.calendarView) {
      setTab('calendar');
      setCalendarMode(navigationRequest.calendarView);
    }
    if (navigationRequest.action === 'new-event') {
      setTab('calendar');
      setShowEventForm(true);
    } else if (navigationRequest.action === 'new-task') {
      setTab('tasks');
      setShowTaskForm(true);
    } else if (navigationRequest.action === 'new-note') {
      setTab('notes');
      openNewNoteForm();
    } else if (navigationRequest.action === 'sync') {
      void handleSync();
    } else if (navigationRequest.action === 'export-week') {
      handleAskAi('Hãy lập bảng Kế hoạch công tác tuần và Lịch báo giảng từ dữ liệu Google Calendar & Google Tasks hiện tại rồi xuất ra file Word (.docx) chuẩn đẹp.');
    }
  }, [navigationRequest]);

  // Tính khoảng thời gian cần tải cho chế độ Ngày / Tuần / Tháng / Năm
  const visibleRange = useMemo(() => {
    if (calendarMode === 'day') {
      const start = startOfDay(cursorDate);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    if (calendarMode === 'week') {
      const start = startOfWeekMonday(cursorDate);
      const endDay = addDays(start, 6);
      const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    if (calendarMode === 'month') {
      const firstOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
      const start = startOfWeekMonday(firstOfMonth);
      const endDay = addDays(start, 41); // 6 tuần * 7 ngày
      const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
    if (calendarMode === 'year') {
      const start = new Date(cursorDate.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(cursorDate.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    const start = addDays(startOfDay(cursorDate), -14);
    const end = addDays(startOfDay(cursorDate), 60);
    return { start, end };
  }, [cursorDate, calendarMode]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function syncRangeForDate(targetDate: Date, mode: CalendarViewMode = calendarMode, calendarId?: string) {
    if (!view?.connected) return;
    const rangeStart =
      mode === 'year'
        ? new Date(targetDate.getFullYear(), 0, 1)
        : addDays(startOfWeekMonday(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)), -7);
    const rangeEnd =
      mode === 'year'
        ? new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59)
        : addDays(new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0), 14);
    setBusy('sync');
    try {
      const next = await rpc<GoogleWorkspaceView>('google.sync', {
        calendarId: calendarId || view.selectedCalendarId,
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
      });
      setView(next);
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  function navigateCalendar(delta: number) {
    let nextDate: Date;
    if (calendarMode === 'day') {
      nextDate = addDays(cursorDate, delta);
    } else if (calendarMode === 'week') {
      nextDate = addDays(cursorDate, delta * 7);
    } else if (calendarMode === 'year') {
      nextDate = new Date(cursorDate.getFullYear() + delta, cursorDate.getMonth(), 1);
    } else {
      nextDate = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + delta, 1);
    }
    setCursorDate(nextDate);
    if (
      nextDate.getMonth() !== cursorDate.getMonth() ||
      nextDate.getFullYear() !== cursorDate.getFullYear()
    ) {
      void syncRangeForDate(nextDate, calendarMode);
    }
  }

  function jumpToToday() {
    const today = startOfDay(new Date());
    setCursorDate(today);
  }

  function openQuickSlotCreate(
    day: Date,
    hour?: number,
    allDay = false,
    anchorEv?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }
  ) {
    if (anchorEv) anchorFloatingNearEvent(anchorEv);
    setEditingEventId(null);
    setEditingEventSourceCalId('');
    const defaultCal =
      view?.selectedCalendarId && view.selectedCalendarId !== '__all__'
        ? view.selectedCalendarId
        : view?.calendars.find(c => c.primary)?.id || view?.calendars[0]?.id || 'primary';
    setEvTargetCalId(defaultCal);
    setEvSummary('');
    setEvLocation('');
    setEvDesc('');
    setEvColorId('');
    setEvRecurrence('');
    setEvReminderMin('');
    setEvAttendees('');
    setEvAttachments([]);
    setEvAllDay(allDay);
    if (allDay) {
      const key = toLocalDateKey(day);
      setEvStart(`${key}T08:00`);
      setEvEnd(`${key}T08:45`);
    } else {
      setEvStart(defaultEventStart(day, hour ?? 7));
      setEvEnd(defaultEventEnd(day, hour ?? 7));
    }
    setShowEventForm(true);
  }

  function openEditEventForm(
    ev: GoogleCalendarEvent,
    anchorEv?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }
  ) {
    if (anchorEv) anchorFloatingNearEvent(anchorEv);
    setEditingEventId(ev.id);
    const srcCal =
      ev.calendarId ||
      (view?.selectedCalendarId && view.selectedCalendarId !== '__all__'
        ? view.selectedCalendarId
        : view?.calendars.find(c => c.primary)?.id || view?.calendars[0]?.id || 'primary');
    setEditingEventSourceCalId(srcCal);
    setEvTargetCalId(srcCal);
    setEvSummary(ev.summary);
    const isAllDay = Boolean(ev.allDay || /^\d{4}-\d{2}-\d{2}$/.test(ev.start));
    setEvAllDay(isAllDay);
    if (isAllDay) {
      const { startDate, endDate } = parseEventRange(ev);
      setEvStart(`${toLocalDateKey(startDate)}T07:30`);
      setEvEnd(`${toLocalDateKey(endDate)}T08:15`);
    } else {
      setEvStart(toLocalDateTimeInput(ev.start, false));
      setEvEnd(ev.end ? toLocalDateTimeInput(ev.end, false) : toLocalDateTimeInput(ev.start, false));
    }
    setEvLocation(ev.location || '');
    setEvDesc(ev.description || '');
    setEvColorId(ev.colorId || '');
    setEvRecurrence(ev.recurrence?.[0] || '');
    setEvReminderMin(ev.remindersMinutes?.length ? String(ev.remindersMinutes[0]) : '');
    setEvAttendees((ev.attendees ?? []).join(', '));
    setEvAttachments(ev.attachments ?? []);
    setSelectedEvent(ev);
    setShowEventForm(true);
  }

  async function handleDropMoveEvent(ev: GoogleCalendarEvent, targetDay: Date, targetHour?: number, makeAllDay = false) {
    setDraggingEvent(null);
    setDragOverTarget(null);
    const { startDate, endDate, allDay } = parseEventRange(ev);
    const durationMs = Math.max(30 * 60_000, endDate.getTime() - startDate.getTime());
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtLocalIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    let nextStartStr: string;
    let nextEndStr: string;
    let nextAllDay = makeAllDay;

    if (makeAllDay) {
      nextStartStr = toLocalDateKey(targetDay);
      nextEndStr = toLocalDateKey(addDays(targetDay, 1));
    } else if (typeof targetHour === 'number') {
      const nextStart = new Date(targetDay);
      const isSat = nextStart.getDay() === 6;
      const hint = PERIOD_HINTS[targetHour];
      const timeStr = isSat && hint?.satTime ? hint.satTime.replace(/^T7:\s*/, '') : hint?.time;
      const startPart = timeStr?.split('–')[0];
      const endPart = timeStr?.split('–')[1];
      if (startPart && endPart && /^\d{2}:\d{2}$/.test(startPart) && /^\d{2}:\d{2}$/.test(endPart)) {
        const [sh = targetHour, sm = 0] = startPart.split(':').map(Number);
        const [eh = targetHour, em = 45] = endPart.split(':').map(Number);
        nextStart.setHours(sh, sm, 0, 0);
        const nextEnd = new Date(targetDay);
        nextEnd.setHours(eh, em, 0, 0);
        nextStartStr = fmtLocalIso(nextStart);
        nextEndStr = fmtLocalIso(nextEnd);
      } else {
        nextStart.setHours(targetHour, allDay ? 0 : startDate.getMinutes(), 0, 0);
        const nextEnd = new Date(nextStart.getTime() + (allDay ? 45 * 60_000 : durationMs));
        nextStartStr = fmtLocalIso(nextStart);
        nextEndStr = fmtLocalIso(nextEnd);
      }
      nextAllDay = false;
    } else {
      // Kéo thả trên lịch Tháng: giữ nguyên khung giờ trong ngày, chỉ đổi ngày
      if (allDay) {
        nextStartStr = toLocalDateKey(targetDay);
        nextEndStr = toLocalDateKey(addDays(targetDay, 1));
        nextAllDay = true;
      } else {
        const nextStart = new Date(targetDay);
        nextStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        const nextEnd = new Date(nextStart.getTime() + durationMs);
        nextStartStr = fmtLocalIso(nextStart);
        nextEndStr = fmtLocalIso(nextEnd);
        nextAllDay = false;
      }
    }

    setBusy(`move-ev-${ev.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.updateEvent', {
        eventId: ev.id,
        calendarId: ev.calendarId || view?.selectedCalendarId,
        summary: ev.summary,
        start: nextStartStr,
        end: nextEndStr,
        allDay: nextAllDay,
        location: ev.location || '',
        description: ev.description || '',
        attachments: ev.attachments,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      if (selectedEvent?.id === ev.id) {
        setSelectedEvent(next.events.find(item => item.id === ev.id) ?? null);
      }
      noticeRef.current(
        uiText(`Đã dời "${ev.summary}" sang ${targetDay.getDate()}/${targetDay.getMonth() + 1} (tự động đồng bộ Google sau 30 giây).`)
      );
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  function handleExportIcs() {
    const list = eventsInVisibleRange.length ? eventsInVisibleRange : events;
    if (!list.length) {
      noticeRef.current(uiText('Chưa có sự kiện nào để xuất tệp .ics.'));
      return;
    }
    const fmtIcsDate = (d: Date, allDay: boolean) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      if (allDay) {
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
      }
      return (
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
        `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
      );
    };
    const escIcs = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PVTA Studio//Google & macOS Calendar Sync//VI',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    const stamp = fmtIcsDate(new Date(), false);
    for (const ev of list) {
      const { startDate, endDate, allDay } = parseEventRange(ev);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id}@pvta.local`);
      lines.push(`DTSTAMP:${stamp}`);
      if (allDay) {
        lines.push(`DTSTART;VALUE=DATE:${fmtIcsDate(startDate, true)}`);
        lines.push(`DTEND;VALUE=DATE:${fmtIcsDate(addDays(endDate, 1), true)}`);
      } else {
        lines.push(`DTSTART:${fmtIcsDate(startDate, false)}`);
        lines.push(`DTEND:${fmtIcsDate(endDate, false)}`);
      }
      lines.push(`SUMMARY:${escIcs(ev.summary)}`);
      if (ev.location) lines.push(`LOCATION:${escIcs(ev.location)}`);
      if (ev.description) lines.push(`DESCRIPTION:${escIcs(ev.description)}`);
      if (ev.recurrence?.length) {
        for (const r of ev.recurrence) {
          if (r.startsWith('RRULE:')) lines.push(r);
        }
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PVTA-Lich-${toLocalDateKey(cursorDate)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    noticeRef.current(uiText('Đã xuất tệp lịch chuẩn .ics (mở trực tiếp bằng Apple Calendar macOS hoặc Google Calendar).'));
  }

  async function handleImportIcsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rawText = await file.text();
      // Gộp các dòng bị ngắt chuẩn RFC 5545 (line folding)
      const unfolded = rawText.replace(/\r?\n[ \t]/g, '');
      const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
      if (!blocks.length) {
        reportRef.current(new Error(uiText('Không tìm thấy sự kiện VEVENT nào trong tệp .ics đã chọn.')));
        return;
      }
      setBusy('import-ics');
      let importedCount = 0;
      const parseIcsProp = (block: string, prop: string): string => {
        const re = new RegExp(`^${prop}(?:;[^:]*)?:(.*)$`, 'im');
        const m = block.match(re);
        return m?.[1]
          ? m[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
          : '';
      };
      const parseIcsTime = (raw: string): { iso: string; allDay: boolean } | null => {
        const clean = raw.trim();
        if (/^\d{8}$/.test(clean)) {
          return {
            iso: `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`,
            allDay: true,
          };
        }
        const m = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
        if (m) {
          const [, y, mo, d, hh, mm, ss, isUtc] = m;
          if (isUtc) {
            const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
            return { iso: dt.toISOString(), allDay: false };
          }
          return { iso: `${y}-${mo}-${d}T${hh}:${mm}:${ss}`, allDay: false };
        }
        return null;
      };

      const targetCal =
        view?.selectedCalendarId && view.selectedCalendarId !== '__all__'
          ? view.selectedCalendarId
          : undefined;

      for (const rawBlock of blocks.slice(0, 50)) {
        const block = rawBlock.split(/END:VEVENT/i)[0] || '';
        const summary = parseIcsProp(block, 'SUMMARY');
        const dtStartRaw = parseIcsProp(block, 'DTSTART');
        const dtEndRaw = parseIcsProp(block, 'DTEND');
        const location = parseIcsProp(block, 'LOCATION');
        const description = parseIcsProp(block, 'DESCRIPTION');
        const rrule = parseIcsProp(block, 'RRULE');
        if (!summary || !dtStartRaw) continue;
        const startParsed = parseIcsTime(dtStartRaw);
        if (!startParsed) continue;
        const endParsed = dtEndRaw ? parseIcsTime(dtEndRaw) : null;

        const next = await rpc<GoogleWorkspaceView>('google.createEvent', {
          calendarId: targetCal,
          summary,
          start: startParsed.iso,
          end: endParsed?.iso,
          allDay: startParsed.allDay,
          location: location || undefined,
          description: description || undefined,
          recurrence: rrule ? [`RRULE:${rrule.replace(/^RRULE:/i, '')}`] : undefined,
        });
        setView(next);
        importedCount++;
      }
      noticeRef.current(
        uiText(`Đã nhập thành công ${importedCount} sự kiện từ tệp .ics và đồng bộ lên Google Calendar!`)
      );
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  function applyQuickPeriodSlot(row: TimetablePeriodRow) {
    const basePart = (evStart || defaultEventStart(cursorDate)).slice(0, 10);
    const [y, m, d] = basePart.split('-').map(Number);
    const dt = y && m && d ? new Date(y, m - 1, d) : cursorDate;
    const isSat = dt.getDay() === 6 && row.saturdayStartMin !== undefined && row.saturdayEndMin !== undefined;
    const startMin = isSat ? row.saturdayStartMin! : row.weekdayStartMin;
    const endMin = isSat ? row.saturdayEndMin! : row.weekdayEndMin;
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateKey = toLocalDateKey(dt);
    setEvAllDay(false);
    setEvStart(`${dateKey}T${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`);
    setEvEnd(`${dateKey}T${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`);
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId.trim()) {
      reportRef.current(new Error(uiText('Vui lòng nhập OAuth Client ID.')));
      return;
    }
    setBusy('config');
    try {
      const next = await rpc<GoogleWorkspaceView>('google.saveConfig', {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
      });
      setView(next);
      setClientSecret('');
      setConfigDirty(false);
      noticeRef.current(uiText('Đã lưu cấu hình Google OAuth 2.0.'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleLogin() {
    setBusy('login');
    try {
      if (configDirty && clientId.trim()) {
        await rpc<GoogleWorkspaceView>('google.saveConfig', {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() || undefined,
        });
        setConfigDirty(false);
      }
      const next = await rpc<GoogleWorkspaceView>('google.login');
      setView(next);
      if (!next.connected) {
        return;
      }
      setTab('calendar');
      if (next.lastError) {
        noticeRef.current(
          uiText(
            `Đã kết nối Google (${next.events.length} sự kiện, ${next.tasks.length} công việc), nhưng có cảnh báo: ${next.lastError}`
          )
        );
      } else {
        noticeRef.current(
          uiText(
            `Đã kết nối và đồng bộ thành công: ${next.events.length} sự kiện lịch, ${next.tasks.length} công việc, ${next.notes.length} ghi chú!`
          )
        );
      }
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleCancelLogin() {
    try {
      const next = await rpc<GoogleWorkspaceView>('google.cancelLogin');
      setView(next);
      setBusy('');
    } catch (err) {
      reportRef.current(err);
    }
  }

  async function handleLogout() {
    setBusy('logout');
    try {
      const next = await rpc<GoogleWorkspaceView>('google.logout');
      setView(next);
      noticeRef.current(uiText('Đã ngắt kết nối tài khoản Google.'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleSync(options?: { syncAllSources?: boolean }) {
    if (view && !view.connected) {
      setTab('setup');
      reportRef.current(
        new Error(
          uiText('Chưa kết nối tài khoản Google. Vui lòng đăng nhập OAuth 2.0 trong mục «Cấu hình OAuth 2.0» trước khi đồng bộ.')
        )
      );
      return;
    }
    setBusy('sync');
    try {
      const rangeStart = addDays(startOfWeekMonday(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1)), -180);
      const rangeEnd = addDays(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 2, 0), 180);
      const shouldSyncAll =
        options?.syncAllSources === true ||
        (view?.selectedCalendarId && view.selectedCalendarId !== '__all__' && view.events.length === 0);
      const next = await rpc<GoogleWorkspaceView>('google.sync', {
        ...(shouldSyncAll ? { syncAllSources: true } : {}),
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
      });
      setView(next);
      const pendingCount = next.tasks.filter(t => t.status !== 'completed').length;
      if (next.lastError) {
        noticeRef.current(
          uiText(
            `Đã đồng bộ một phần (${next.events.length} sự kiện, ${next.tasks.length} công việc) · Cảnh báo: ${next.lastError}`
          )
        );
      } else if (!next.events.length && !next.tasks.length && !next.notes.length) {
        noticeRef.current(
          uiText(
            'Đã kết nối Google nhưng chưa có sự kiện hoặc công việc nào trong khoảng thời gian này.'
          )
        );
      } else {
        noticeRef.current(
          uiText(
            `Đã đồng bộ thành công từ ${next.calendars.length || 1} lịch & ${next.tasklists.length || 1} danh sách việc: ${next.events.length} sự kiện, ${next.tasks.length} công việc (${pendingCount} chưa xong) và ${next.notes.length} ghi chú.`
          )
        );
      }
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleSelectCalendar(calendarId: string) {
    setBusy('calendar');
    try {
      const rangeStart = addDays(startOfWeekMonday(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1)), -14);
      const rangeEnd = addDays(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 2, 0), 14);
      const next = await rpc<GoogleWorkspaceView>('google.selectCalendar', {
        calendarId,
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
      });
      setView(next);
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleSelectTasklist(tasklistId: string) {
    setBusy('tasks');
    try {
      const next = await rpc<GoogleWorkspaceView>('google.selectTasklist', { tasklistId });
      setView(next);
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!evSummary.trim() || !evStart.trim()) return;
    setBusy('save-event');
    try {
      const startVal = evAllDay ? evStart.slice(0, 10) : evStart;
      const endVal = evAllDay ? (evEnd ? evEnd.slice(0, 10) : undefined) : evEnd || undefined;
      const recurrenceArr = evRecurrence.trim() ? [evRecurrence.trim()] : [];
      const remindersArr =
        evReminderMin.trim() !== '' && Number.isFinite(Number(evReminderMin))
          ? [Number(evReminderMin)]
          : undefined;
      const attendeesArr = evAttendees
        .split(',')
        .map(s => s.trim())
        .filter(s => s.includes('@'));

      // Lưu qua calendar.saveEvent (calendar-store): bản ghi thành dirty, không đi qua dirtyQueue cũ.
      // Tệp đính kèm không nằm trong payload này.
      const payload = {
        calendarId:
          evTargetCalId || editingEventSourceCalId || selectedEvent?.calendarId || view?.selectedCalendarId || undefined,
        summary: evSummary.trim(),
        start: startVal,
        end: endVal,
        allDay: evAllDay,
        location: evLocation.trim() || undefined,
        description: evDesc.trim() || undefined,
        colorId: evColorId || undefined,
        recurrence: recurrenceArr.length ? recurrenceArr : undefined,
        remindersMinutes: remindersArr,
        attendees: attendeesArr.length ? attendeesArr : undefined,
      };
      if (editingEventId) {
        const localOnly = localOverlay.events.some(r => r.googleId === null && r.localId === editingEventId);
        const rec = await rpc<LocalRecordView<LocalEventData>>('calendar.saveEvent', {
          ...(localOnly ? { localId: editingEventId } : { googleId: editingEventId }),
          data: payload,
        });
        upsertLocalOverlay(rec);
        const merged =
          overlayEvents(view?.events ?? [], [rec]).find(item => item.id === (rec.googleId ?? rec.localId)) ?? null;
        setSelectedEvent(merged);
        noticeRef.current(uiText('Đã lưu cục bộ (calendar-store, chờ đồng bộ). Chưa gửi lên Google.'));
      } else {
        const rec = await rpc<LocalRecordView<LocalEventData>>('calendar.saveEvent', { data: payload });
        upsertLocalOverlay(rec);
        noticeRef.current(uiText('Đã thêm sự kiện mới vào kho cục bộ (chờ đồng bộ, chưa gửi lên Google).'));
      }
      setEditingEventId(null);
      setEditingEventSourceCalId('');
      setEvSummary('');
      setEvLocation('');
      setEvDesc('');
      setEvColorId('');
      setEvRecurrence('');
      setEvReminderMin('');
      setEvAttendees('');
      setEvAttachments([]);
      setShowEventForm(false);
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleDuplicateEvent(ev: GoogleCalendarEvent, offsetDays: number) {
    setBusy(`dup-ev-${ev.id}`);
    try {
      const { startDate, endDate, allDay } = parseEventRange(ev);
      const nextStart = addDays(startDate, offsetDays);
      const nextEnd = addDays(endDate, offsetDays);
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmtLocalIso = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const startPayload = allDay ? toLocalDateKey(nextStart) : fmtLocalIso(nextStart);
      const endPayload = allDay ? toLocalDateKey(addDays(nextEnd, 1)) : fmtLocalIso(nextEnd);
      const next = await rpc<GoogleWorkspaceView>('google.createEvent', {
        calendarId: ev.calendarId && ev.calendarId !== '__all__' ? ev.calendarId : view?.selectedCalendarId,
        summary: ev.summary,
        start: startPayload,
        end: endPayload,
        allDay,
        location: ev.location || undefined,
        description: ev.description || undefined,
        attachments: ev.attachments,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      noticeRef.current(
        offsetDays === 7
          ? uiText('Đã nhân bản tiết dạy / sự kiện sang tuần sau (tự động đồng bộ Google sau 30 giây).')
          : uiText('Đã nhân bản tiết dạy / sự kiện sang ngày kế tiếp (tự động đồng bộ Google sau 30 giây).')
      );
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleEventToTask(ev: GoogleCalendarEvent) {
    setBusy(`ev-task-${ev.id}`);
    try {
      const { startDate } = parseEventRange(ev);
      const dueStr = toLocalDateKey(startDate);
      const notesParts = [
        ev.location ? `Địa điểm: ${ev.location}` : '',
        ev.description || '',
      ].filter(Boolean);
      const next = await rpc<GoogleWorkspaceView>('google.createTask', {
        tasklistId: view?.selectedTasklistId,
        title: `Chuẩn bị: ${ev.summary}`,
        due: dueStr,
        notes: notesParts.join('\n') || undefined,
        attachments: ev.attachments,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      noticeRef.current(uiText('Đã tạo công việc chuẩn bị trong Tasks (tự động đồng bộ Google sau 30 giây)!'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleDeleteEvent(ev: GoogleCalendarEvent) {
    setBusy(`del-ev-${ev.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.deleteEvent', {
        calendarId: ev.calendarId,
        eventId: ev.id,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      if (selectedEvent?.id === ev.id) setSelectedEvent(null);
      if (editingEventId === ev.id) {
        setEditingEventId(null);
        setShowEventForm(false);
      }
      noticeRef.current(uiText('Đã xóa sự kiện (tự động đồng bộ Google Calendar sau 30 giây).'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  function openNewTaskForm(anchorEv?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }) {
    if (anchorEv) anchorFloatingNearEvent(anchorEv);
    setEditingTaskId(null);
    setEditingTaskSourceListId('');
    const defaultList =
      view?.selectedTasklistId && view.selectedTasklistId !== '__all__'
        ? view.selectedTasklistId
        : view?.tasklists[0]?.id || '@default';
    setTaskTargetListId(defaultList);
    setTaskTitle('');
    setTaskDue('');
    setTaskNotes('');
    setTaskAttachments([]);
    setShowTaskForm(true);
  }

  function openEditTaskForm(
    item: GoogleTaskItem,
    anchorEv?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }
  ) {
    if (anchorEv) anchorFloatingNearEvent(anchorEv);
    setEditingTaskId(item.id);
    const srcList =
      item.tasklistId ||
      (view?.selectedTasklistId && view.selectedTasklistId !== '__all__'
        ? view.selectedTasklistId
        : view?.tasklists[0]?.id || '@default');
    setEditingTaskSourceListId(srcList);
    setTaskTargetListId(srcList);
    setTaskTitle(item.title);
    setTaskDue(item.due ? item.due.slice(0, 10) : '');
    setTaskNotes(item.notes || '');
    setTaskAttachments(item.attachments ?? []);
    setShowTaskForm(true);
  }

  async function handleSaveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy('save-task');
    try {
      // Lưu qua calendar.saveTask (calendar-store): dirty, chưa gửi lên Google. Đính kèm không đi theo payload.
      const taskPayload = {
        tasklistId: taskTargetListId || editingTaskSourceListId || view?.selectedTasklistId || undefined,
        title: taskTitle.trim(),
        due: taskDue.trim() || undefined,
        notes: taskNotes.trim() || undefined,
      };
      if (editingTaskId) {
        const localOnly = localOverlay.tasks.some(r => r.googleId === null && r.localId === editingTaskId);
        const rec = await rpc<LocalRecordView<LocalTaskData>>('calendar.saveTask', {
          ...(localOnly ? { localId: editingTaskId } : { googleId: editingTaskId }),
          data: taskPayload,
        });
        upsertLocalOverlay(rec);
        noticeRef.current(uiText('Đã lưu công việc cục bộ (calendar-store, chờ đồng bộ). Chưa gửi lên Google.'));
      } else {
        const rec = await rpc<LocalRecordView<LocalTaskData>>('calendar.saveTask', { data: taskPayload });
        upsertLocalOverlay(rec);
        noticeRef.current(uiText('Đã thêm công việc mới vào kho cục bộ (chờ đồng bộ, chưa gửi lên Google).'));
      }
      setEditingTaskId(null);
      setEditingTaskSourceListId('');
      setTaskTitle('');
      setTaskDue('');
      setTaskNotes('');
      setTaskAttachments([]);
      setShowTaskForm(false);
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleToggleTask(item: GoogleTaskItem) {
    setBusy(`toggle-task-${item.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.toggleTask', {
        tasklistId: item.tasklistId,
        taskId: item.id,
        completed: item.status !== 'completed',
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleDeleteTask(item: GoogleTaskItem) {
    setBusy(`del-task-${item.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.deleteTask', {
        tasklistId: item.tasklistId,
        taskId: item.id,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      noticeRef.current(uiText('Đã xóa công việc (tự động đồng bộ Google Tasks sau 30 giây).'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  function openNewNoteForm(anchorEv?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }) {
    if (anchorEv) anchorFloatingNearEvent(anchorEv);
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteColor('yellow');
    setNotePinned(false);
    setNoteTagsInput('Sổ đầu bài, Giáo án');
    setNoteAttachments([]);
    setShowNoteForm(true);
  }

  function openEditNoteForm(
    note: GoogleNoteItem,
    anchorEv?: { clientX?: number; clientY?: number; currentTarget?: EventTarget | null }
  ) {
    if (anchorEv) anchorFloatingNearEvent(anchorEv);
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteColor(note.color || 'yellow');
    setNotePinned(Boolean(note.pinned));
    setNoteTagsInput((note.tags ?? []).join(', '));
    setNoteAttachments(note.attachments ?? []);
    setShowNoteForm(true);
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    const tags = noteTagsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    setBusy('save-note');
    try {
      if (editingNoteId) {
        const next = await rpc<GoogleWorkspaceView>('google.updateNote', {
          noteId: editingNoteId,
          title: noteTitle.trim(),
          content: noteContent.trim(),
          color: noteColor,
          pinned: notePinned,
          tags,
          attachments: noteAttachments,
          deferSync: true,
        });
        setView(next);
        scheduleIncrementalSync();
        noticeRef.current(
          next.connected
            ? uiText('Đã lưu ghi chú vào notes.json cục bộ (tự động đồng bộ Google sau 30 giây).')
            : uiText('Đã cập nhật ghi chú trong Sổ tay trên máy (notes.json).')
        );
      } else {
        const next = await rpc<GoogleWorkspaceView>('google.createNote', {
          title: noteTitle.trim(),
          content: noteContent.trim(),
          color: noteColor,
          pinned: notePinned,
          tags,
          attachments: noteAttachments,
          deferSync: true,
        });
        setView(next);
        scheduleIncrementalSync();
        noticeRef.current(
          next.connected
            ? uiText('Đã lưu ghi chú mới vào notes.json cục bộ (tự động đồng bộ Google sau 30 giây).')
            : uiText('Đã lưu ghi chú mới vào Sổ tay trên máy (notes.json).')
        );
      }
      setShowNoteForm(false);
      setEditingNoteId(null);
      setNoteTitle('');
      setNoteContent('');
      setNoteAttachments([]);
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleTogglePinNote(note: GoogleNoteItem) {
    setBusy(`pin-note-${note.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.updateNote', {
        noteId: note.id,
        pinned: !note.pinned,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleChangeNoteColor(note: GoogleNoteItem, color: GoogleNoteColor) {
    setBusy(`color-note-${note.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.updateNote', {
        noteId: note.id,
        color,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleDeleteNote(note: GoogleNoteItem) {
    setBusy(`del-note-${note.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.deleteNote', {
        noteId: note.id,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      if (editingNoteId === note.id) {
        setShowNoteForm(false);
        setEditingNoteId(null);
      }
      noticeRef.current(uiText('Đã xóa ghi chú (tự động đồng bộ Google sau 30 giây).'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  async function handleNoteToTask(note: GoogleNoteItem) {
    setBusy(`note-task-${note.id}`);
    try {
      const next = await rpc<GoogleWorkspaceView>('google.createTask', {
        tasklistId: view?.selectedTasklistId,
        title: note.title,
        notes: note.content,
        attachments: note.attachments,
        deferSync: true,
      });
      setView(next);
      scheduleIncrementalSync();
      noticeRef.current(uiText('Đã chuyển ghi chú thành công việc trong Tasks!'));
    } catch (err) {
      reportRef.current(err);
    } finally {
      setBusy('');
    }
  }

  function handleAskAi(promptText: string) {
    onPrompt(promptText);
  }

  const events = useMemo(
    () => overlayEvents(view?.events ?? [], localOverlay.events.filter(r => r.syncState !== 'clean')),
    [view?.events, localOverlay.events]
  );
  const tasks = useMemo(
    () => overlayTasks(view?.tasks ?? [], localOverlay.tasks.filter(r => r.syncState !== 'clean')),
    [view?.tasks, localOverlay.tasks]
  );
  const notes = view?.notes ?? [];
  const pendingTasks = useMemo(() => tasks.filter(t => t.status !== 'completed'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed'), [tasks]);
  const filteredTasks = useMemo(() => {
    if (taskFilter === 'pending') return pendingTasks;
    if (taskFilter === 'completed') return completedTasks;
    return tasks;
  }, [tasks, pendingTasks, completedTasks, taskFilter]);

  const allNoteTags = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags ?? []) {
        if (t.trim()) s.add(t.trim());
      }
    }
    return [...s];
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const q = noteQuery.trim().toLocaleLowerCase('vi');
    return notes.filter(n => {
      if (noteTagFilter && !(n.tags ?? []).includes(noteTagFilter)) return false;
      if (!q) return true;
      const hay = `${n.title} ${n.content} ${(n.tags ?? []).join(' ')}`.toLocaleLowerCase('vi');
      return hay.includes(q);
    });
  }, [notes, noteQuery, noteTagFilter]);

  const today = useMemo(() => startOfDay(new Date()), []);

  // Danh sách các ngày hiển thị cho lưới Ngày hoặc Tuần
  const gridDays = useMemo(() => {
    if (calendarMode === 'day') return [startOfDay(cursorDate)];
    const start = startOfWeekMonday(cursorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursorDate, calendarMode]);

  // Danh sách 42 ô ngày cho lưới Tháng (6 tuần x 7 ngày) và Mini Calendar
  const monthDays = useMemo(() => {
    const first = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const start = startOfWeekMonday(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursorDate]);

  // Danh sách 12 tháng cho chế độ xem Năm (Year View)
  const yearMonths = useMemo(() => {
    const y = cursorDate.getFullYear();
    return Array.from({ length: 12 }, (_, m) => {
      const first = new Date(y, m, 1);
      const start = startOfWeekMonday(first);
      const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
      return { monthIndex: m, label: `Tháng ${m + 1}`, days };
    });
  }, [cursorDate]);

  // Lọc sự kiện theo lịch con được bật (multi-calendar checkboxes) và từ khóa tìm kiếm
  const filteredCalendarEvents = useMemo(() => {
    const q = calSearchQuery.trim().toLocaleLowerCase('vi');
    return events.filter(ev => {
      if (ev.calendarId && hiddenCalIds.includes(ev.calendarId)) return false;
      if (!q) return true;
      const hay = `${ev.summary} ${ev.location || ''} ${ev.description || ''} ${ev.calendarSummary || ''}`.toLocaleLowerCase('vi');
      return hay.includes(q);
    });
  }, [events, hiddenCalIds, calSearchQuery]);

  // Nhãn tiêu đề cho thanh điều hướng lịch
  const calendarPeriodTitle = useMemo(() => {
    if (calendarMode === 'day') {
      const dow = (cursorDate.getDay() + 6) % 7;
      return `${WEEKDAY_LONG_VI[dow]}, ${cursorDate.getDate()} tháng ${cursorDate.getMonth() + 1}, ${cursorDate.getFullYear()}`;
    }
    if (calendarMode === 'week') {
      const wStart = startOfWeekMonday(cursorDate);
      const wEnd = addDays(wStart, 6);
      const sameMonth = wStart.getMonth() === wEnd.getMonth();
      if (sameMonth) {
        return `Tuần ${wStart.getDate()} – ${wEnd.getDate()} tháng ${wEnd.getMonth() + 1}, ${wEnd.getFullYear()}`;
      }
      return `Tuần ${wStart.getDate()}/${wStart.getMonth() + 1} – ${wEnd.getDate()}/${wEnd.getMonth() + 1}/${wEnd.getFullYear()}`;
    }
    if (calendarMode === 'year') {
      return `Năm ${cursorDate.getFullYear()}`;
    }
    return `Tháng ${cursorDate.getMonth() + 1}, ${cursorDate.getFullYear()}`;
  }, [cursorDate, calendarMode]);

  // Sự kiện trong phạm vi đang xem
  const eventsInVisibleRange = useMemo(() => {
    return filteredCalendarEvents.filter(ev => {
      const { startDate, endDate } = parseEventRange(ev);
      return startDate <= visibleRange.end && endDate >= visibleRange.start;
    });
  }, [filteredCalendarEvents, visibleRange]);

  const fmtAttachmentSize = (bytes: number) => {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderAttachmentEditor = (
    target: 'event' | 'task' | 'note',
    items: WorkspaceLocalAttachment[],
    setItems: React.Dispatch<React.SetStateAction<WorkspaceLocalAttachment[]>>
  ) => (
    <div className="google-attachments-box" onPaste={e => void handleClipboardPasteAttachment(e, target)}>
      <div className="google-attachments-head">
        <div>
          <strong>📎 {uiText('Tệp & Hình ảnh đính kèm')} ({items.length})</strong>
          <small className="google-local-only-badge">
            {uiText('Lưu cục bộ trên máy · Không gửi lên Google API')}
          </small>
        </div>
        <div className="google-attachments-btns">
          <button
            type="button"
            disabled={busy === 'attach'}
            onClick={() => void handlePickLocalAttachments(target)}
            title={uiText('Chọn tệp Word, PDF, PowerPoint, Excel hoặc hình ảnh từ máy tính')}
          >
            📁 {busy === 'attach' ? uiText('Đang chèn…') : uiText('Chọn tệp / ảnh')}
          </button>
          <label className="google-attach-upload-label" title={uiText('Chèn nhanh ảnh hoặc tệp tài liệu (hoặc Ctrl+V dán ảnh)')}>
            🖼️ {uiText('Tải ảnh / tệp')}
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip"
              style={{ display: 'none' }}
              onChange={e => {
                void handleUploadInputFiles(e.target.files, target);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
      {items.length > 0 ? (
        <ul className="google-attachments-list">
          {items.map(att => (
            <li key={att.id} className={`google-attachment-chip ${att.kind}`}>
              {att.kind === 'image' && att.previewDataUrl ? (
                <img src={att.previewDataUrl} alt={att.name} className="google-attachment-thumb" />
              ) : (
                <span className="google-attachment-icon">{att.kind === 'image' ? '🖼️' : '📄'}</span>
              )}
              <div className="google-attachment-meta">
                <strong title={att.localPath}>{att.name}</strong>
                <small>{fmtAttachmentSize(att.size)} · {uiText('Cục bộ')}</small>
              </div>
              <div className="google-attachment-ops">
                <button
                  type="button"
                  title={uiText('Mở tệp / hình ảnh này trên máy')}
                  onClick={() => void rpc('openFileRef', { path: att.localPath }).catch(report)}
                >
                  {uiText('Mở')}
                </button>
                <button
                  type="button"
                  className="danger"
                  title={uiText('Gỡ đính kèm này')}
                  onClick={() => {
                    setItems(prev => prev.filter(x => x.id !== att.id));
                    bumpInteractionIfPendingSync();
                  }}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="google-attachments-hint">
          {uiText('Bấm «Chọn tệp / ảnh» hoặc dán ảnh trực tiếp (Ctrl+V / Cmd+V) vào biểu mẫu để đính kèm bài giảng, phiếu học tập, ảnh bảng phấn.')}
        </p>
      )}
    </div>
  );

  const renderAttachmentGalleryReadonly = (items?: WorkspaceLocalAttachment[]) => {
    if (!items?.length) return null;
    return (
      <div className="google-attachments-readonly">
        <div className="google-attachments-readonly-title">
          📎 {uiText('Tệp & ảnh đính kèm cục bộ')} ({items.length})
        </div>
        <div className="google-attachments-list">
          {items.map(att => (
            <div key={att.id} className={`google-attachment-chip ${att.kind}`}>
              {att.kind === 'image' && att.previewDataUrl ? (
                <img src={att.previewDataUrl} alt={att.name} className="google-attachment-thumb" />
              ) : (
                <span className="google-attachment-icon">{att.kind === 'image' ? '🖼️' : '📄'}</span>
              )}
              <div className="google-attachment-meta">
                <strong title={att.localPath}>{att.name}</strong>
                <small>{fmtAttachmentSize(att.size)}</small>
              </div>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  void rpc('openFileRef', { path: att.localPath }).catch(report);
                }}
              >
                {uiText('Mở')}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="workspace-panel google-workspace-panel"
      aria-label={uiText('Google Calendar & Tasks')}
      onKeyDown={() => bumpInteractionIfPendingSync()}
    >
      <div className="page-heading">
        <div>
          <span className="eyebrow">{uiText('ĐỒNG BỘ HAI CHIỀU QUA OAUTH 2.0 API & DỮ LIỆU JSON CỤC BỘ')}</span>
          <h1>{uiText('Google Calendar, Tasks & Sổ tay Ghi chú')}</h1>
          <p>{uiText('Quản lý Thời khóa biểu bằng cửa sổ nổi rời ngay cạnh tiết học, đính kèm tệp/hình ảnh cục bộ (calendar.json, tasks.json, notes.json) và tự động đồng bộ tăng dần sau 30 giây.')}</p>
        </div>
        <div className="google-header-actions">
          {((view?.dirtyCount ?? 0) > 0 || autoSyncRemainingSec > 0) && (
            <span
              className="google-dirty-sync-pill"
              title={uiText('Chỉ những mục mới thêm hoặc vừa sửa đổi mới được đẩy lên Google sau 30 giây không tương tác')}
            >
              ⏳{' '}
              {busy === 'sync-dirty'
                ? uiText('Đang đồng bộ mục mới…')
                : autoSyncRemainingSec > 0
                ? uiText(`Đã lưu JSON cục bộ (${view?.dirtyCount || 1} mục) · Đồng bộ sau ${autoSyncRemainingSec}s`)
                : uiText(`Chờ đồng bộ tăng dần (${view?.dirtyCount} mục)`)}
              {view?.connected && busy !== 'sync-dirty' && (
                <button
                  type="button"
                  className="google-dirty-sync-now-btn"
                  onClick={() => void triggerIncrementalSyncNow()}
                >
                  {uiText('Đẩy ngay')}
                </button>
              )}
            </span>
          )}
          {view?.connected ? (
            <>
              <span className="google-status-pill connected" title={view.email || uiText('Đã kết nối OAuth 2.0')}>
                <i /> {view.email ? `${uiText('Đã kết nối')}: ${view.email}` : uiText('Đã kết nối Google OAuth 2.0')}
              </span>
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={() => void handleSync()}
              >
                <Icon name="calendar" size={16} />
                {busy === 'sync' ? uiText('Đang đồng bộ…') : uiText('Đồng bộ ngay')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={!!busy && busy !== 'login'}
              onClick={() => {
                if (view?.configured) void handleLogin();
                else setTab('setup');
              }}
            >
              <Icon name="calendar" size={16} />
              {view?.authenticating || busy === 'login'
                ? uiText('Đang chờ trình duyệt xác thực…')
                : view?.configured
                ? uiText('Đăng nhập Google (OAuth 2.0)')
                : uiText('Cấu hình OAuth 2.0 để bắt đầu')}
            </button>
          )}
        </div>
      </div>

      {view?.lastError && (
        <div role="alert" className="google-error-banner">
          <span>{view.lastError}</span>
        </div>
      )}

      <nav className="google-tabs" aria-label={uiText('Chế độ xem Google Workspace')}>
        {([
          ['overview', 'calendar', uiText('Tổng quan & Trợ lý AI')],
          ['calendar', 'calendar', `${uiText('Lịch & Thời khóa biểu')} (${events.length})`],
          [
            'tasks',
            'tasks',
            `${uiText('Việc cần làm (Tasks)')} (${pendingTasks.length || tasks.length})`,
          ],
          ['notes', 'notebook', `${uiText('Sổ tay Ghi chú (Notes)')} (${notes.length})`],
          ['setup', 'settings', uiText('Cấu hình OAuth 2.0')],
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'selected' : ''}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon name={icon} size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="google-overview">
          <div className="google-stats-strip">
            <div className="google-stat-card">
              <span className="google-stat-icon"><Icon name="calendar" size={22} /></span>
              <div>
                <strong>{events.length}</strong>
                <small>{uiText('Sự kiện & tiết dạy đã đồng bộ')}</small>
              </div>
              <button type="button" onClick={() => { setTab('calendar'); setCalendarMode('week'); }}>
                {uiText('Mở Thời khóa biểu')}
              </button>
            </div>
            <div className="google-stat-card">
              <span className="google-stat-icon"><Icon name="tasks" size={22} /></span>
              <div>
                <strong>{pendingTasks.length || tasks.length}</strong>
                <small>
                  {pendingTasks.length
                    ? `${pendingTasks.length} ${uiText('chưa xong')} / ${tasks.length} ${uiText('công việc')}`
                    : tasks.length
                    ? `${tasks.length} ${uiText('công việc đã hoàn thành')}`
                    : uiText('Công việc đang chờ hoàn thành')}
                </small>
              </div>
              <button type="button" onClick={() => { setTab('tasks'); setShowTaskForm(true); }}>
                {uiText('＋ Công việc')}
              </button>
            </div>
            <div className="google-stat-card">
              <span className="google-stat-icon"><Icon name="notebook" size={22} /></span>
              <div>
                <strong>{notes.length}</strong>
                <small>{uiText('Ghi chú chuyên môn (Keep & Drive)')}</small>
              </div>
              <button type="button" onClick={() => { setTab('notes'); openNewNoteForm(); }}>
                {uiText('＋ Ghi chú')}
              </button>
            </div>
            <div className="google-stat-card">
              <span className="google-stat-icon"><Icon name="spark" size={22} /></span>
              <div>
                <strong>{view?.connected ? uiText('Sẵn sàng') : uiText('Chưa kết nối')}</strong>
                <small>
                  {view?.lastSyncedAt
                    ? `${uiText('Đồng bộ lúc')} ${new Date(view.lastSyncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                    : uiText('Xác thực OAuth 2.0 trực tiếp với Google')}
                </small>
              </div>
              <button type="button" onClick={() => setTab('setup')}>
                {uiText('Cài đặt')}
              </button>
            </div>
          </div>

          <section className="google-section">
            <h2>{uiText('Tự động hóa cùng Trợ lý PVTA')}</h2>
            <p className="muted">{uiText('PVTA tự động đọc ngữ cảnh Lịch và Công việc đã đồng bộ để hỗ trợ thầy cô soạn kế hoạch, lịch báo giảng và nhắc hạn hồ sơ.')}</p>
            <div className="google-ai-actions">
              <button
                type="button"
                className="google-ai-card"
                onClick={() => handleAskAi('Dựa vào dữ liệu Google Calendar và Google Tasks đã đồng bộ, hãy tổng hợp bảng Kế hoạch công tác tuần và Lịch báo giảng rồi xuất ra file Word (.docx) chuẩn đẹp.')}
              >
                <Icon name="office" size={18} />
                <div>
                  <strong>{uiText('Xuất Kế hoạch tuần ra Word (.docx)')}</strong>
                  <small>{uiText('Tự động gom sự kiện và việc cần làm trong tuần thành bảng công tác chuẩn.')}</small>
                </div>
              </button>
              <button
                type="button"
                className="google-ai-card"
                onClick={() => handleAskAi('Dựa vào danh sách Google Calendar & Google Tasks hiện tại, hãy tạo bảng theo dõi tiến độ công việc và thời khóa biểu ra file Excel (.xlsx).')}
              >
                <Icon name="office" size={18} />
                <div>
                  <strong>{uiText('Xuất Sổ báo giảng / Tiến độ ra Excel (.xlsx)')}</strong>
                  <small>{uiText('Tạo sheet lịch công tác và checklist theo dõi hạn nộp hồ sơ sổ sách.')}</small>
                </div>
              </button>
              <button
                type="button"
                className="google-ai-card"
                onClick={() => handleAskAi('Hãy rà soát các sự kiện trong Google Calendar và các nhiệm vụ chưa xong trong Google Tasks của tôi, sắp xếp thứ tự ưu tiên và gợi ý chuẩn bị tài liệu cần thiết.')}
              >
                <Icon name="spark" size={18} />
                <div>
                  <strong>{uiText('Phân tích ưu tiên & Nhắc hạn hồ sơ')}</strong>
                  <small>{uiText('AI kiểm tra các đầu việc sắp đến hạn và đề xuất soạn giáo án / đề kiểm tra.')}</small>
                </div>
              </button>
            </div>
          </section>

          <div className="google-split-columns">
            <section className="google-section">
              <header className="google-section-head">
                <div>
                  <h3><Icon name="calendar" size={16} /> {uiText('Sự kiện & Lịch dạy sắp tới')}</h3>
                </div>
                <button type="button" onClick={() => setTab('calendar')}>{uiText('Xem lịch đầy đủ →')}</button>
              </header>
              {!events.length ? (
                <p className="muted small">
                  {view?.connected
                    ? uiText('Không có sự kiện nào trong khoảng thời gian này.')
                    : uiText('Kết nối Google OAuth 2.0 để hiển thị lịch dạy và sự kiện của thầy cô.')}
                </p>
              ) : (
                <ul className="google-item-list">
                  {events.slice(0, 6).map(ev => (
                    <li
                      key={`${ev.calendarId || ''}:${ev.id}`}
                      className="google-item"
                      onClick={() => {
                        setTab('calendar');
                        openEditEventForm(ev);
                      }}
                      title={uiText('Bấm để xem hoặc chỉnh sửa tiết dạy / sự kiện này')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="google-item-main">
                        <strong>{ev.summary}</strong>
                        <small>
                          {ev.calendarSummary ? `[${ev.calendarSummary}] · ` : ''}
                          {fmtDateTime(ev.start, ev.allDay)}
                          {ev.location ? ` · 📍 ${ev.location}` : ''}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="google-section">
              <header className="google-section-head">
                <div>
                  <h3><Icon name="tasks" size={16} /> {uiText('Việc cần làm (Google Tasks)')}</h3>
                </div>
                <button type="button" onClick={() => setTab('tasks')}>{uiText('Xem tất cả →')}</button>
              </header>
              {!tasks.length ? (
                <p className="muted small">
                  {view?.connected
                    ? uiText('Chưa có công việc nào trong Google Tasks.')
                    : uiText('Kết nối Google OAuth 2.0 để đồng bộ danh sách công việc từ Google Tasks.')}
                </p>
              ) : (
                <ul className="google-item-list">
                  {(pendingTasks.length ? pendingTasks : tasks).slice(0, 6).map(t => (
                    <li key={`${t.tasklistId || ''}:${t.id}`} className={`google-item ${t.status === 'completed' ? 'completed' : ''}`}>
                      <label className="google-task-check">
                        <input
                          type="checkbox"
                          checked={t.status === 'completed'}
                          disabled={!!busy}
                          onChange={() => void handleToggleTask(t)}
                        />
                        <div className="google-item-main">
                          <strong>{t.title}</strong>
                          <small>
                            {t.tasklistTitle ? `[${t.tasklistTitle}] · ` : ''}
                            {t.due ? `${uiText('Hạn')}: ${fmtDateShort(t.due)}` : uiText('Chưa đặt hạn')}
                            {t.status === 'completed' ? ` · ✓ ${uiText('Đã xong')}` : ''}
                            {t.notes ? ` · ${t.notes}` : ''}
                          </small>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="google-section">
              <header className="google-section-head">
                <div>
                  <h3><Icon name="notebook" size={16} /> {uiText('Sổ tay Ghi chú (Keep & Drive)')}</h3>
                </div>
                <button type="button" onClick={() => setTab('notes')}>{uiText('Mở Sổ tay →')}</button>
              </header>
              {!notes.length ? (
                <p className="muted small">
                  {view?.connected
                    ? uiText('Chưa có ghi chú nào. Bấm «＋ Ghi chú» để tạo nhanh sổ đầu bài hoặc biên bản họp tổ.')
                    : uiText('Kết nối Google OAuth 2.0 để đồng bộ Sổ tay Ghi chú từ Google Keep & Google Drive.')}
                </p>
              ) : (
                <ul className="google-item-list">
                  {notes.slice(0, 6).map(n => (
                    <li
                      key={n.id}
                      className="google-item"
                      onClick={() => {
                        setTab('notes');
                        openEditNoteForm(n);
                      }}
                      title={uiText('Bấm để xem hoặc chỉnh sửa ghi chú này')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="google-item-main">
                        <strong>{n.pinned ? '📌 ' : ''}{n.title}</strong>
                        <small>{n.content ? n.content.slice(0, 90) : uiText('(Ghi chú trống)')}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'calendar' && (
        <section className="google-section google-fullcal-section">
          {/* Thanh điều khiển Lịch đầy đủ (Chế độ Ngày / Tuần / Tháng / Năm / Danh sách + Tìm kiếm + Nhập/Xuất .ics) */}
          <header className="google-fullcal-toolbar">
            <div className="google-fullcal-nav">
              <button
                type="button"
                className={`google-sidebar-toggle ${showCalSidebar ? 'active' : ''}`}
                title={showCalSidebar ? uiText('Thu gọn bảng lịch bên trái') : uiText('Mở bảng Lịch thu nhỏ & Lịch của tôi')}
                onClick={() => setShowCalSidebar(s => !s)}
              >
                ☰ {uiText('Lịch')}
              </button>
              <button type="button" className="google-today-btn" onClick={jumpToToday}>
                {uiText('Hôm nay')}
              </button>
              <div className="google-nav-arrows" role="group" aria-label={uiText('Điều hướng thời gian')}>
                <button
                  type="button"
                  aria-label={uiText('Trước')}
                  title={uiText('Trước')}
                  onClick={() => navigateCalendar(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label={uiText('Tiếp theo')}
                  title={uiText('Tiếp theo')}
                  onClick={() => navigateCalendar(1)}
                >
                  ›
                </button>
              </div>
              <input
                type="date"
                className="google-date-jump"
                aria-label={uiText('Chọn ngày bất kỳ')}
                value={toLocalDateKey(cursorDate)}
                onChange={e => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  if (y && m && d) {
                    const next = new Date(y, m - 1, d);
                    setCursorDate(next);
                    void syncRangeForDate(next, calendarMode);
                  }
                }}
              />
              <h3 className="google-fullcal-title">{calendarPeriodTitle}</h3>
            </div>

            <div className="google-fullcal-controls">
              <label className="google-cal-search" aria-label={uiText('Tìm kiếm sự kiện trên lịch')}>
                <Icon name="search" size={14} />
                <input
                  type="search"
                  placeholder={uiText('Tìm tiết dạy, lớp, phòng, ghi chú…')}
                  value={calSearchQuery}
                  onChange={e => setCalSearchQuery(e.target.value)}
                />
              </label>

              <div className="google-view-switcher" role="group" aria-label={uiText('Chế độ hiển thị lịch')}>
                {([
                  ['day', uiText('Ngày')],
                  ['week', uiText('Tuần (TKB)')],
                  ['month', uiText('Tháng')],
                  ['year', uiText('Năm')],
                  ['agenda', uiText('Danh sách')],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={calendarMode === mode ? 'selected' : ''}
                    aria-pressed={calendarMode === mode}
                    onClick={() => setCalendarMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {!!view?.calendars.length && (
                <select
                  aria-label={uiText('Chọn lịch Google Calendar')}
                  value={view.selectedCalendarId}
                  disabled={!!busy}
                  onChange={e => void handleSelectCalendar(e.target.value)}
                >
                  <option value="__all__">{uiText('Tất cả các lịch')} ({view.calendars.length})</option>
                  {view.calendars.map(cal => (
                    <option key={cal.id} value={cal.id}>
                      {cal.summary}{cal.primary ? ` (${uiText('Chính')})` : ''}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                className="primary"
                disabled={!view?.connected || !!busy}
                onClick={() => {
                  if (showEventForm && !editingEventId) {
                    setShowEventForm(false);
                  } else {
                    openQuickSlotCreate(cursorDate, 7, false);
                  }
                }}
              >
                {showEventForm && !editingEventId ? uiText('Đóng biểu mẫu') : uiText('＋ Thêm tiết dạy / sự kiện')}
              </button>

              <button
                type="button"
                disabled={!view?.connected || !!busy}
                onClick={() => void handleSync()}
              >
                {busy === 'sync' ? uiText('Đang tải…') : uiText('Làm mới')}
              </button>
            </div>
          </header>

          {/* Chú giải màu sắc Thời khóa biểu */}
          <div className="google-timetable-legend" aria-label={uiText('Chú giải phân loại sự kiện')}>
            <span className="legend-pill lesson"><i /> {uiText('Tiết dạy / Lớp học')}</span>
            <span className="legend-pill meeting"><i /> {uiText('Họp tổ / Hội đồng')}</span>
            <span className="legend-pill exam"><i /> {uiText('Kiểm tra / Coi thi')}</span>
            <span className="legend-pill general"><i /> {uiText('Sự kiện chung')}</span>
            <span className="legend-tip">{uiText('💡 Kéo-thả tiết dạy để đổi giờ/ngày · Nháy đúp để sửa/ghi chú · Chuột vào ô trống để thêm mới.')}</span>
          </div>

          {showEventForm && (
            <form className="google-form" onSubmit={e => void handleSaveEvent(e)}>
              <div className="google-form-head">
                <h4>
                  {editingEventId
                    ? uiText('Chỉnh sửa tiết dạy / sự kiện & đồng bộ Google Calendar')
                    : uiText('Tạo sự kiện / Tiết dạy mới trên Google Calendar')}
                </h4>
                <div className="google-period-presets" role="group" aria-label={uiText('Chọn nhanh khung tiết học')}>
                  <span>{uiText('Khung tiết nhanh:')}</span>
                  {TIMETABLE_PERIOD_ROWS.filter(r => r.session !== 'break').map(row => (
                    <button
                      key={row.id}
                      type="button"
                      className="google-period-chip"
                      title={`${row.label}: ${row.weekdayRange}${row.saturdayRange ? ` (T7: ${row.saturdayRange})` : ''}`}
                      onClick={() => applyQuickPeriodSlot(row)}
                    >
                      {row.label.replace(' (Sáng)', ' S').replace(' (Chiều)', ' C').replace(' (Thứ 7)', ' T7')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="google-form-grid">
                <label className="full">
                  {uiText('Tiêu đề sự kiện / Tiết dạy *')}
                  <input
                    required
                    value={evSummary}
                    onChange={e => setEvSummary(e.target.value)}
                    placeholder={uiText('Ví dụ: KHTN - 8.5 (Bài 12: Đòn bẩy)')}
                  />
                </label>
                {!!view?.calendars.length && (
                  <label>
                    {uiText('Lịch Google Calendar đích')}
                    <select
                      value={
                        evTargetCalId ||
                        (view.selectedCalendarId !== '__all__'
                          ? view.selectedCalendarId
                          : view.calendars.find(c => c.primary)?.id || view.calendars[0]?.id || 'primary')
                      }
                      onChange={e => setEvTargetCalId(e.target.value)}
                    >
                      {view.calendars.map(cal => (
                        <option key={cal.id} value={cal.id}>
                          {cal.summary}{cal.primary ? ` (${uiText('Chính')})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {uiText('Bắt đầu *')}
                  <input
                    required
                    type={evAllDay ? 'date' : 'datetime-local'}
                    value={evAllDay ? evStart.slice(0, 10) : evStart}
                    onChange={e => setEvStart(e.target.value)}
                  />
                </label>
                <label>
                  {uiText('Kết thúc')}
                  <input
                    type={evAllDay ? 'date' : 'datetime-local'}
                    value={evAllDay ? evEnd.slice(0, 10) : evEnd}
                    onChange={e => setEvEnd(e.target.value)}
                  />
                </label>
                <label className="google-checkbox-inline">
                  <input
                    type="checkbox"
                    checked={evAllDay}
                    onChange={e => setEvAllDay(e.target.checked)}
                  />
                  <span>{uiText('Sự kiện cả ngày')}</span>
                </label>
                <label>
                  {uiText('Địa điểm / Phòng học')}
                  <input
                    value={evLocation}
                    onChange={e => setEvLocation(e.target.value)}
                    placeholder={uiText('Ví dụ: Trường THCS Phan Văn Trị / Phòng B204')}
                  />
                </label>
                <label>
                  {uiText('Lặp lại định kỳ (Thời khóa biểu)')}
                  <select value={evRecurrence} onChange={e => setEvRecurrence(e.target.value)}>
                    {RECURRENCE_PRESETS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {uiText('Thông báo nhắc hẹn')}
                  <select value={evReminderMin} onChange={e => setEvReminderMin(e.target.value)}>
                    {REMINDER_PRESETS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {uiText('Màu sắc thẻ sự kiện')}
                  <select value={evColorId} onChange={e => setEvColorId(e.target.value)}>
                    {GOOGLE_EVENT_COLORS.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {uiText('Khách mời / Đồng nghiệp (Email)')}
                  <input
                    value={evAttendees}
                    onChange={e => setEvAttendees(e.target.value)}
                    placeholder={uiText('gv1@edu.vn, totruong@edu.vn')}
                  />
                </label>
                <label className="full">
                  {uiText('Ghi chú nội dung / Dặn dò tiết dạy (Đồng bộ trực tiếp với mô tả sự kiện Google Calendar)')}
                  <textarea
                    rows={3}
                    value={evDesc}
                    onChange={e => setEvDesc(e.target.value)}
                    placeholder={uiText('Nhập ghi chú tiết dạy, bài tập về nhà, thiết bị thí nghiệm, nhận xét sổ đầu bài...')}
                  />
                </label>
              </div>
              <div className="google-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowEventForm(false);
                    setEditingEventId(null);
                    setEditingEventSourceCalId('');
                  }}
                >
                  {uiText('Hủy')}
                </button>
                <button type="submit" className="primary" disabled={busy === 'save-event' || !evSummary.trim()}>
                  {busy === 'save-event'
                    ? uiText('Đang đồng bộ…')
                    : editingEventId
                    ? uiText('Cập nhật lên Google Calendar')
                    : uiText('Lưu lên Google Calendar')}
                </button>
              </div>
            </form>
          )}

          {/* Hộp chi tiết nhanh khi bấm vào một tiết dạy / sự kiện trên lịch */}
          {selectedEvent && (
            <div className="google-event-popover" role="region" aria-label={uiText('Chi tiết sự kiện đã chọn')}>
              <div className="google-event-popover-main">
                <div className="google-event-popover-badges">
                  <span className={`google-tone-badge ${classifyEventTone(selectedEvent.summary)}`}>
                    {selectedEvent.allDay ? uiText('Cả ngày') : uiText('Tiết dạy / Sự kiện')}
                  </span>
                  {selectedEvent.calendarSummary && (
                    <span className="google-cal-source-pill">📅 {selectedEvent.calendarSummary}</span>
                  )}
                  {(selectedEvent.recurrence?.length || selectedEvent.recurringEventId) && (
                    <span className="google-cal-source-pill">🔁 {uiText('Lặp định kỳ')}</span>
                  )}
                  {!!selectedEvent.remindersMinutes?.length && (
                    <span className="google-cal-source-pill">🔔 {uiText(`Nhắc trước ${selectedEvent.remindersMinutes[0]}p`)}</span>
                  )}
                </div>
                <h4>{selectedEvent.summary}</h4>
                <p className="google-event-popover-meta">
                  🕒 {fmtDateTime(selectedEvent.start, selectedEvent.allDay)}
                  {!selectedEvent.allDay && selectedEvent.end ? ` → ${fmtDateTime(selectedEvent.end, false)}` : ''}
                  {selectedEvent.location ? ` · 📍 ${selectedEvent.location}` : ''}
                </p>
                {!!selectedEvent.attendees?.length && (
                  <p className="google-event-popover-meta">
                    👥 {uiText('Khách mời')}: {selectedEvent.attendees.join(', ')}
                  </p>
                )}
                {selectedEvent.description ? (
                  <p className="google-event-popover-desc">{selectedEvent.description}</p>
                ) : (
                  <p className="google-event-popover-desc muted">
                    {uiText('Chưa có ghi chú cho tiết dạy / sự kiện này. Bấm «Sửa / Ghi chú» để thêm nội dung đồng bộ lên Google Calendar.')}
                  </p>
                )}
              </div>
              <div className="google-event-popover-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => openEditEventForm(selectedEvent)}
                >
                  ✏️ {uiText('Sửa / Ghi chú')}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  title={uiText('Sao chép tiết dạy / sự kiện này sang ngày kế tiếp (+1 ngày)')}
                  onClick={() => void handleDuplicateEvent(selectedEvent, 1)}
                >
                  {uiText('＋ Ngày mai')}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  title={uiText('Sao chép tiết dạy / sự kiện này sang tuần kế tiếp (+7 ngày) trên Google Calendar')}
                  onClick={() => void handleDuplicateEvent(selectedEvent, 7)}
                >
                  {busy === `dup-ev-${selectedEvent.id}` ? uiText('Đang chép…') : uiText('＋ Tuần sau')}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  title={uiText('Tạo công việc cần chuẩn bị trong Google Tasks từ sự kiện này')}
                  onClick={() => void handleEventToTask(selectedEvent)}
                >
                  {busy === `ev-task-${selectedEvent.id}` ? uiText('Đang tạo…') : uiText('→ Tạo Task')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleAskAi(
                      `Hãy giúp tôi soạn bài / chuẩn bị tài liệu cho tiết dạy hoặc sự kiện: "${selectedEvent.summary}" diễn ra vào ${fmtDateTime(selectedEvent.start, selectedEvent.allDay)}${selectedEvent.location ? ` tại ${selectedEvent.location}` : ''}${selectedEvent.description ? ` (${selectedEvent.description})` : ''}.`
                    )
                  }
                >
                  <Icon name="spark" size={14} /> {uiText('Soạn bài với AI')}
                </button>
                {selectedEvent.conferenceLink && (
                  <button
                    type="button"
                    onClick={() => void rpc('openLink', { url: selectedEvent.conferenceLink }).catch(report)}
                  >
                    🎥 {uiText('Google Meet ↗')}
                  </button>
                )}
                {selectedEvent.htmlLink && (
                  <button
                    type="button"
                    onClick={() => void rpc('openLink', { url: selectedEvent.htmlLink }).catch(report)}
                  >
                    {uiText('Mở trên Google ↗')}
                  </button>
                )}
                <button
                  type="button"
                  className="danger"
                  disabled={busy === `del-ev-${selectedEvent.id}`}
                  onClick={() => void handleDeleteEvent(selectedEvent)}
                >
                  {uiText('Xóa')}
                </button>
                <button type="button" onClick={() => setSelectedEvent(null)}>
                  {uiText('Đóng')}
                </button>
              </div>
            </div>
          )}

          {!view?.connected ? (
            <div className="empty-card">
              <p>{uiText('Chưa kết nối tài khoản Google. Hãy chuyển sang mục «Cấu hình OAuth 2.0» để đăng nhập và hiển thị Thời khóa biểu.')}</p>
              <button type="button" className="primary" onClick={() => setTab('setup')}>
                {uiText('Mở cấu hình OAuth 2.0')}
              </button>
            </div>
          ) : (
            <>
              <div className={`google-cal-workspace ${showCalSidebar ? 'with-sidebar' : 'no-sidebar'}`}>
                {/* BẢNG BÊN TRÁI KIỂU MACOS CALENDAR / GOOGLE CALENDAR: LỊCH THU NHỎ + LỊCH CỦA TÔI + .ICS */}
                {showCalSidebar && (
                  <aside className="google-cal-sidebar" aria-label={uiText('Lịch thu nhỏ và bộ lọc lịch')}>
                    {/* Mini Calendar điều hướng nhanh */}
                    <div className="google-minical">
                      <div className="google-minical-head">
                        <strong>
                          Tháng {cursorDate.getMonth() + 1}, {cursorDate.getFullYear()}
                        </strong>
                        <div className="google-minical-arrows">
                          <button
                            type="button"
                            title={uiText('Tháng trước')}
                            onClick={() => {
                              const prevM = new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1);
                              setCursorDate(prevM);
                              void syncRangeForDate(prevM, calendarMode);
                            }}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            title={uiText('Tháng sau')}
                            onClick={() => {
                              const nextM = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1);
                              setCursorDate(nextM);
                              void syncRangeForDate(nextM, calendarMode);
                            }}
                          >
                            ›
                          </button>
                        </div>
                      </div>
                      <div className="google-minical-dow">
                        {WEEKDAY_SHORT_VI.map(d => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>
                      <div className="google-minical-grid">
                        {monthDays.map(d => {
                          const inM = d.getMonth() === cursorDate.getMonth();
                          const isT = isSameDay(d, today);
                          const isS = isSameDay(d, cursorDate);
                          const hasEv = filteredCalendarEvents.some(ev => eventOccursOnDay(ev, d));
                          return (
                            <button
                              key={`mini-${toLocalDateKey(d)}`}
                              type="button"
                              className={`minical-day ${inM ? '' : 'outside'} ${isT ? 'today' : ''} ${isS ? 'selected' : ''} ${hasEv ? 'has-events' : ''}`}
                              onClick={() => setCursorDate(d)}
                              onDoubleClick={() => {
                                setCursorDate(d);
                                setCalendarMode('day');
                              }}
                            >
                              {d.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Danh sách Lịch của tôi (Bật/Tắt từng lịch con) */}
                    {!!view.calendars.length && (
                      <div className="google-sidebar-box">
                        <div className="google-sidebar-box-head">
                          <strong>{uiText('Lịch của tôi')}</strong>
                          {hiddenCalIds.length > 0 && (
                            <button type="button" className="link-btn" onClick={() => setHiddenCalIds([])}>
                              {uiText('Hiện tất cả')}
                            </button>
                          )}
                        </div>
                        <ul className="google-cal-checklist">
                          {view.calendars.map(cal => {
                            const checked = !hiddenCalIds.includes(cal.id);
                            return (
                              <li key={cal.id}>
                                <label className="google-cal-checkitem">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setHiddenCalIds(prev =>
                                        prev.includes(cal.id) ? prev.filter(x => x !== cal.id) : [...prev, cal.id]
                                      );
                                    }}
                                  />
                                  <span
                                    className="cal-color-dot"
                                    style={{ backgroundColor: cal.backgroundColor || '#2563eb' }}
                                  />
                                  <span className="cal-name" title={cal.summary}>
                                    {cal.summary}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Tiện ích Nhập / Xuất tệp lịch .ics (Chuẩn Apple Calendar macOS & Google Calendar) */}
                    <div className="google-sidebar-box">
                      <strong>{uiText('Đồng bộ Apple Calendar (.ics)')}</strong>
                      <p className="muted small" style={{ margin: '2px 0 6px' }}>
                        {uiText('Nhập hoặc xuất tệp .ics tiêu chuẩn để dùng chung với Calendar trên macOS / iPhone.')}
                      </p>
                      <div className="google-ics-buttons">
                        <button type="button" onClick={handleExportIcs}>
                          ⬇️ {uiText('Xuất tệp .ics')}
                        </button>
                        <label className="google-ics-upload-btn">
                          ⬆️ {busy === 'import-ics' ? uiText('Đang nhập…') : uiText('Nhập tệp .ics')}
                          <input
                            type="file"
                            accept=".ics,text/calendar"
                            disabled={!!busy}
                            onChange={e => void handleImportIcsFile(e)}
                            style={{ display: 'none' }}
                          />
                        </label>
                      </div>
                    </div>
                  </aside>
                )}

                <div className="google-cal-main">
                  {/* CHẾ ĐỘ 1 & 2: LƯỚI THỜI KHÓA BIỂU THEO NGÀY (DAY) HOẶC TUẦN (WEEK) */}
                  {(calendarMode === 'day' || calendarMode === 'week') && (
                    <div
                      className={`google-timegrid-wrapper mode-${calendarMode}`}
                      role="grid"
                      aria-label={calendarMode === 'day' ? uiText('Lịch chi tiết theo ngày') : uiText('Thời khóa biểu theo tuần')}
                    >
                      {/* Hàng tiêu đề Thứ / Ngày */}
                      <div
                        className="google-timegrid-header"
                        style={{ gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px repeat(${gridDays.length}, minmax(132px, 1fr))` }}
                      >
                        <div className="google-timegrid-corner">{uiText('Giờ / Tiết')}</div>
                        {gridDays.map(day => {
                          const dow = (day.getDay() + 6) % 7;
                          const isToday = isSameDay(day, today);
                          return (
                            <div
                              key={toLocalDateKey(day)}
                              className={`google-timegrid-dayhead ${isToday ? 'today' : ''}`}
                              onClick={() => {
                                setCursorDate(day);
                                if (calendarMode === 'week') setCalendarMode('day');
                              }}
                              title={uiText('Bấm để xem chi tiết ngày này')}
                            >
                              <span className="dow">{calendarMode === 'day' ? WEEKDAY_LONG_VI[dow] : WEEKDAY_SHORT_VI[dow]}</span>
                              <strong className="dom">{day.getDate()}/{day.getMonth() + 1}</strong>
                            </div>
                          );
                        })}
                      </div>

                      {/* Hàng sự kiện Cả ngày (All-day banner) - Hỗ trợ kéo thả sự kiện vào */}
                      <div
                        className="google-timegrid-allday"
                        style={{ gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px repeat(${gridDays.length}, minmax(132px, 1fr))` }}
                      >
                        <div className="google-timegrid-allday-label">{uiText('Cả ngày')}</div>
                        {gridDays.map(day => {
                          const dayKey = toLocalDateKey(day);
                          const dropKey = `allday-${dayKey}`;
                          const dayAllDayEvents = filteredCalendarEvents.filter(ev => {
                            const parsed = parseEventRange(ev);
                            return parsed.allDay && eventOccursOnDay(ev, day);
                          });
                          return (
                            <div
                              key={dropKey}
                              className={`google-timegrid-allday-cell ${dragOverTarget === dropKey ? 'drag-over' : ''}`}
                              onDoubleClick={() => openQuickSlotCreate(day, undefined, true)}
                              onDragOver={e => {
                                e.preventDefault();
                                if (dragOverTarget !== dropKey) setDragOverTarget(dropKey);
                              }}
                              onDragLeave={() => {
                                if (dragOverTarget === dropKey) setDragOverTarget(null);
                              }}
                              onDrop={e => {
                                e.preventDefault();
                                if (draggingEvent) void handleDropMoveEvent(draggingEvent, day, undefined, true);
                              }}
                            >
                              {dayAllDayEvents.map(ev => (
                                <button
                                  key={ev.id}
                                  type="button"
                                  draggable
                                  onDragStart={() => setDraggingEvent(ev)}
                                  onDragEnd={() => {
                                    setDraggingEvent(null);
                                    setDragOverTarget(null);
                                  }}
                                  className={`google-allday-chip ${classifyEventTone(ev.summary)} ${selectedEvent?.id === ev.id ? 'active' : ''}`}
                                  onClick={() => setSelectedEvent(ev)}
                                  onDoubleClick={e => {
                                    e.stopPropagation();
                                    openEditEventForm(ev);
                                  }}
                                  title={uiText('Bấm để xem · Nháy đúp để sửa · Kéo thả để dời ngày')}
                                >
                                  {ev.summary}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      {/* Khung cuộn Lưới Giờ học & Tiết dạy (06:00 -> 21:00) */}
                      <div className="google-timegrid-body-scroll">
                        <div
                          className="google-timegrid-body"
                          style={{
                            gridTemplateColumns: `${TIME_AXIS_WIDTH_PX}px repeat(${gridDays.length}, minmax(132px, 1fr))`,
                            height: `${HOURS_GRID.length * HOUR_HEIGHT_PX}px`,
                          }}
                        >
                          {/* Cột nhãn giờ & thời gian từng tiết học chính xác (T2–T6 & Sáng T7) */}
                          <div className="google-timegrid-axis">
                            {HOURS_GRID.map(h => {
                              const hint = PERIOD_HINTS[h];
                              const isDaySat = calendarMode === 'day' && cursorDate.getDay() === 6;
                              return (
                                <div key={h} className="google-timegrid-hour-label" style={{ height: `${HOUR_HEIGHT_PX}px` }}>
                                  <strong className="axis-hour">{String(h).padStart(2, '0')}:00</strong>
                                  {hint && (
                                    <div className="axis-period-box">
                                      <span className="axis-period-title">{hint.title}</span>
                                      <small className="axis-period-time">
                                        {isDaySat && hint.satTime ? hint.satTime.replace(/^T7:\s*/, '') : hint.time}
                                      </small>
                                      {calendarMode === 'week' && hint.satTime && (
                                        <small className="axis-period-sat">{hint.satTime}</small>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Các cột ngày trong tuần */}
                          {gridDays.map(day => {
                            const dayKey = toLocalDateKey(day);
                            const isToday = isSameDay(day, today);
                            const isSaturday = day.getDay() === 6;
                            const timedEvents = filteredCalendarEvents
                              .filter(ev => {
                                const parsed = parseEventRange(ev);
                                return !parsed.allDay && eventOccursOnDay(ev, day);
                              })
                              .sort((a, b) => a.start.localeCompare(b.start));

                            // Tính vị trí vạch đỏ thời gian thực (Now indicator line) nếu là ngày hôm nay
                            const nowHourFloat = nowTick.getHours() + nowTick.getMinutes() / 60;
                            const showNowLine = isToday && nowHourFloat >= GRID_START_HOUR && nowHourFloat <= GRID_END_HOUR;
                            const nowTopPx = (nowHourFloat - GRID_START_HOUR) * HOUR_HEIGHT_PX;

                            // Phân bổ cột ngang khi có nhiều sự kiện trùng giờ trong cùng một ngày
                            const layoutItems = timedEvents.map((ev, idx) => {
                              const { startDate, endDate } = parseEventRange(ev);
                              const startHours = Math.max(
                                GRID_START_HOUR,
                                Math.min(GRID_END_HOUR - 0.25, startDate.getHours() + startDate.getMinutes() / 60)
                              );
                              const endHours = Math.max(
                                startHours + 0.5,
                                Math.min(GRID_END_HOUR, endDate.getHours() + endDate.getMinutes() / 60)
                              );
                              const top = (startHours - GRID_START_HOUR) * HOUR_HEIGHT_PX;
                              const height = Math.max(46, (endHours - startHours) * HOUR_HEIGHT_PX - 2);

                              const overlapping = timedEvents.filter(other => {
                                if (other.id === ev.id) return true;
                                const o = parseEventRange(other);
                                return o.startDate < endDate && o.endDate > startDate;
                              });
                              const colCount = Math.max(1, overlapping.length);
                              const colIndex = Math.max(0, overlapping.findIndex(o => o.id === ev.id));

                              return {
                                ev,
                                startDate,
                                endDate,
                                top,
                                height,
                                widthPct: 100 / colCount,
                                leftPct: (colIndex * 100) / colCount,
                                idx,
                              };
                            });

                            return (
                              <div
                                key={`col-${dayKey}`}
                                className={`google-timegrid-daycol ${isToday ? 'today' : ''} ${isSaturday ? 'saturday' : ''}`}
                              >
                                {/* Các ô giờ nền để bấm tạo nhanh hoặc kéo-thả tiết dạy đúng khung giờ T2–T6 hoặc T7 */}
                                {HOURS_GRID.map(h => {
                                  const hint = PERIOD_HINTS[h];
                                  const slotTimeLabel = isSaturday && hint?.satTime
                                    ? hint.satTime.replace(/^T7:\s*/, '')
                                    : hint?.time || `${String(h).padStart(2, '0')}:00`;
                                  const slotDropKey = `slot-${dayKey}-${h}`;
                                  return (
                                    <div
                                      key={h}
                                      className={`google-timegrid-slot ${h === 12 ? 'noon-break' : ''} ${dragOverTarget === slotDropKey ? 'drag-over' : ''}`}
                                      style={{ height: `${HOUR_HEIGHT_PX}px` }}
                                      title={uiText(`Bấm để thêm tiết dạy / sự kiện (${slotTimeLabel}) ngày ${day.getDate()}/${day.getMonth() + 1} · Hoặc thả tiết dạy vào đây`)}
                                      onClick={() => openQuickSlotCreate(day, h, false)}
                                      onDragOver={e => {
                                        e.preventDefault();
                                        if (dragOverTarget !== slotDropKey) setDragOverTarget(slotDropKey);
                                      }}
                                      onDragLeave={() => {
                                        if (dragOverTarget === slotDropKey) setDragOverTarget(null);
                                      }}
                                      onDrop={e => {
                                        e.preventDefault();
                                        if (draggingEvent) void handleDropMoveEvent(draggingEvent, day, h, false);
                                      }}
                                    />
                                  );
                                })}

                                {/* Vạch đỏ báo giờ hiện tại (Red current-time line kiểu macOS / Google Calendar) */}
                                {showNowLine && (
                                  <div
                                    className="google-now-indicator"
                                    style={{ top: `${nowTopPx}px` }}
                                    title={`Giờ hiện tại: ${fmtTimeShort(nowTick)}`}
                                  >
                                    <span className="now-dot" />
                                  </div>
                                )}

                                {/* Các khối sự kiện / tiết dạy định vị theo giờ (Hỗ trợ kéo thả & màu sắc tùy chỉnh) */}
                                {layoutItems.map(({ ev, startDate, endDate, top, height, widthPct, leftPct }) => {
                                  const tone = classifyEventTone(ev.summary);
                                  const periodBadge = matchEventPeriodLabel(startDate, endDate);
                                  const timeRangeStr = `${fmtTimeShort(startDate)} – ${fmtTimeShort(endDate)}`;
                                  const isSelected = selectedEvent?.id === ev.id;
                                  const customColor = ev.colorId ? GOOGLE_EVENT_COLORS.find(c => c.id === ev.colorId) : undefined;
                                  return (
                                    <button
                                      key={ev.id}
                                      type="button"
                                      draggable
                                      onDragStart={e => {
                                        e.stopPropagation();
                                        setDraggingEvent(ev);
                                      }}
                                      onDragEnd={() => {
                                        setDraggingEvent(null);
                                        setDragOverTarget(null);
                                      }}
                                      className={`google-timegrid-event ${tone} ${isSelected ? 'active' : ''}`}
                                      style={{
                                        top: `${top}px`,
                                        height: `${height}px`,
                                        width: `calc(${widthPct}% - 4px)`,
                                        left: `calc(${leftPct}% + 2px)`,
                                        ...(customColor
                                          ? {
                                              borderLeftColor: customColor.hex,
                                              backgroundColor: customColor.bg,
                                              color: customColor.fg,
                                            }
                                          : {}),
                                      }}
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (isSelected) {
                                          openEditEventForm(ev);
                                        } else {
                                          setSelectedEvent(ev);
                                        }
                                      }}
                                      onDoubleClick={e => {
                                        e.stopPropagation();
                                        openEditEventForm(ev);
                                      }}
                                      title={`${periodBadge ? `[${periodBadge}] ` : ''}${ev.summary} (${timeRangeStr})${ev.location ? ` · ${ev.location}` : ''}${ev.description ? ` · Ghi chú: ${ev.description}` : ''} — Bấm để xem/sửa · Kéo thả để đổi giờ`}
                                    >
                                      <div className="ev-time-row">
                                        {periodBadge && <span className="ev-period-tag">{periodBadge}</span>}
                                        <span className="ev-time">{timeRangeStr}</span>
                                        {(ev.recurrence?.length || ev.recurringEventId) && (
                                          <span className="ev-note-dot" title={uiText('Tiết dạy lặp định kỳ')}>🔁</span>
                                        )}
                                        {ev.description && <span className="ev-note-dot" title={ev.description}>📝</span>}
                                      </div>
                                      <strong className="ev-title">{ev.summary}</strong>
                                      {ev.location && <small className="ev-loc">📍 {ev.location}</small>}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CHẾ ĐỘ 3: LƯỚI LỊCH THÁNG (MONTH VIEW - HỖ TRỢ KÉO THẢ SỰ KIỆN GIỮA CÁC NGÀY) */}
                  {calendarMode === 'month' && (
                    <div className="google-monthgrid-wrapper" role="grid" aria-label={uiText('Lịch tổng quan theo tháng')}>
                      <div className="google-monthgrid-header">
                        {WEEKDAY_LONG_VI.map(label => (
                          <div key={label} className="google-monthgrid-dow">
                            {label}
                          </div>
                        ))}
                      </div>
                      <div className="google-monthgrid-cells">
                        {monthDays.map(day => {
                          const dayKey = toLocalDateKey(day);
                          const monthDropKey = `month-${dayKey}`;
                          const inCurrentMonth = day.getMonth() === cursorDate.getMonth();
                          const isToday = isSameDay(day, today);
                          const isSelectedDay = isSameDay(day, cursorDate);
                          const dayEvents = filteredCalendarEvents
                            .filter(ev => eventOccursOnDay(ev, day))
                            .sort((a, b) => a.start.localeCompare(b.start));

                          return (
                            <div
                              key={dayKey}
                              className={`google-monthgrid-cell ${inCurrentMonth ? '' : 'outside'} ${isToday ? 'today' : ''} ${isSelectedDay ? 'selected' : ''} ${dragOverTarget === monthDropKey ? 'drag-over' : ''}`}
                              onClick={() => setCursorDate(day)}
                              onDoubleClick={() => openQuickSlotCreate(day, 7, false)}
                              onDragOver={e => {
                                e.preventDefault();
                                if (dragOverTarget !== monthDropKey) setDragOverTarget(monthDropKey);
                              }}
                              onDragLeave={() => {
                                if (dragOverTarget === monthDropKey) setDragOverTarget(null);
                              }}
                              onDrop={e => {
                                e.preventDefault();
                                if (draggingEvent) void handleDropMoveEvent(draggingEvent, day, undefined, false);
                              }}
                            >
                              <div className="google-monthgrid-cell-top">
                                <button
                                  type="button"
                                  className="day-number"
                                  title={uiText('Xem chi tiết ngày này')}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setCursorDate(day);
                                    setCalendarMode('day');
                                  }}
                                >
                                  {day.getDate() === 1 ? `${day.getDate()}/${day.getMonth() + 1}` : day.getDate()}
                                </button>
                                <button
                                  type="button"
                                  className="quick-add-day"
                                  title={uiText('Thêm sự kiện vào ngày này')}
                                  onClick={e => {
                                    e.stopPropagation();
                                    openQuickSlotCreate(day, 7, false);
                                  }}
                                >
                                  ＋
                                </button>
                              </div>

                              <div className="google-monthgrid-events">
                                {dayEvents.slice(0, 4).map(ev => {
                                  const parsed = parseEventRange(ev);
                                  const tone = classifyEventTone(ev.summary);
                                  const isSelected = selectedEvent?.id === ev.id;
                                  return (
                                    <button
                                      key={ev.id}
                                      type="button"
                                      draggable
                                      onDragStart={e => {
                                        e.stopPropagation();
                                        setDraggingEvent(ev);
                                      }}
                                      onDragEnd={() => {
                                        setDraggingEvent(null);
                                        setDragOverTarget(null);
                                      }}
                                      className={`google-month-event-pill ${tone} ${isSelected ? 'active' : ''}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (isSelected) {
                                          openEditEventForm(ev);
                                        } else {
                                          setSelectedEvent(ev);
                                        }
                                      }}
                                      onDoubleClick={e => {
                                        e.stopPropagation();
                                        openEditEventForm(ev);
                                      }}
                                      title={`${ev.summary}${ev.location ? ` · ${ev.location}` : ''}${ev.description ? ` · ${ev.description}` : ''} — Bấm để xem/sửa · Kéo thả để đổi ngày`}
                                    >
                                      {!parsed.allDay && <span className="pill-time">{fmtTimeShort(parsed.startDate)}</span>}
                                      <span className="pill-title">{ev.summary}</span>
                                    </button>
                                  );
                                })}
                                {dayEvents.length > 4 && (
                                  <button
                                    type="button"
                                    className="google-month-more-btn"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setCursorDate(day);
                                      setCalendarMode('day');
                                    }}
                                  >
                                    +{dayEvents.length - 4} {uiText('mục khác')}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CHẾ ĐỘ 4: LƯỚI LỊCH NĂM (YEAR VIEW 12 THÁNG CHUẨN APPLE CALENDAR MACOS) */}
                  {calendarMode === 'year' && (
                    <div className="google-yeargrid-wrapper" aria-label={uiText('Lịch tổng quan 12 tháng trong năm')}>
                      {yearMonths.map(ym => (
                        <div key={ym.monthIndex} className="google-year-month-card">
                          <button
                            type="button"
                            className="google-year-month-title"
                            onClick={() => {
                              setCursorDate(new Date(cursorDate.getFullYear(), ym.monthIndex, 1));
                              setCalendarMode('month');
                            }}
                          >
                            {ym.label}
                          </button>
                          <div className="google-year-dow">
                            {WEEKDAY_SHORT_VI.map(d => (
                              <span key={d}>{d}</span>
                            ))}
                          </div>
                          <div className="google-year-days">
                            {ym.days.map(d => {
                              const inM = d.getMonth() === ym.monthIndex;
                              const isT = isSameDay(d, today);
                              const hasEv = inM && filteredCalendarEvents.some(ev => eventOccursOnDay(ev, d));
                              return (
                                <button
                                  key={`yr-${ym.monthIndex}-${toLocalDateKey(d)}`}
                                  type="button"
                                  className={`year-day ${inM ? '' : 'outside'} ${isT ? 'today' : ''} ${hasEv ? 'has-events' : ''}`}
                                  onClick={() => {
                                    setCursorDate(d);
                                    setCalendarMode('day');
                                  }}
                                  title={
                                    hasEv
                                      ? `${d.getDate()}/${d.getMonth() + 1}: Có sự kiện / tiết dạy (Bấm để mở ngày)`
                                      : `${d.getDate()}/${d.getMonth() + 1}`
                                  }
                                >
                                  {d.getDate()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CHẾ ĐỘ 5: DANH SÁCH SỰ KIỆN CHI TIẾT (AGENDA LIST VIEW) */}
                  {calendarMode === 'agenda' && (
                    !filteredCalendarEvents.length ? (
                      <p className="muted">{uiText('Chưa có sự kiện nào khớp với bộ lọc trong khoảng thời gian đã đồng bộ.')}</p>
                    ) : (
                      <ul className="google-item-list">
                        {filteredCalendarEvents.map(ev => (
                          <li key={`${ev.calendarId || ''}:${ev.id}`} className="google-item">
                            <div
                              className="google-item-main"
                              onClick={() => openEditEventForm(ev)}
                              style={{ cursor: 'pointer' }}
                              title={uiText('Bấm để chỉnh sửa tiết dạy / sự kiện này')}
                            >
                              <strong>
                                {ev.summary}
                                {(ev.recurrence?.length || ev.recurringEventId) ? ' 🔁' : ''}
                              </strong>
                              <small>
                                {ev.calendarSummary ? `[${ev.calendarSummary}] · ` : ''}
                                {fmtDateTime(ev.start, ev.allDay)}
                                {!ev.allDay && ev.end ? ` → ${fmtDateTime(ev.end, false)}` : ''}
                                {ev.location ? ` · 📍 ${ev.location}` : ''}
                              </small>
                              {ev.description && <p className="google-item-desc">{ev.description}</p>}
                            </div>
                            <div className="google-item-ops">
                              <button
                                type="button"
                                className="primary"
                                onClick={() => openEditEventForm(ev)}
                              >
                                ✏️ {uiText('Sửa / Ghi chú')}
                              </button>
                              <button
                                type="button"
                                disabled={!!busy}
                                title={uiText('Sao chép tiết dạy này sang tuần sau (+7 ngày)')}
                                onClick={() => void handleDuplicateEvent(ev, 7)}
                              >
                                {uiText('＋ Tuần sau')}
                              </button>
                              <button
                                type="button"
                                title={uiText('Nhờ PVTA chuẩn bị nội dung cho sự kiện này')}
                                onClick={() => handleAskAi(`Hãy giúp tôi chuẩn bị nội dung và tài liệu cho sự kiện trên lịch: "${ev.summary}" diễn ra vào ${fmtDateTime(ev.start, ev.allDay)}${ev.location ? ` tại ${ev.location}` : ''}.`)}
                              >
                                {uiText('Chuẩn bị với AI')}
                              </button>
                              {ev.htmlLink && (
                                <button
                                  type="button"
                                  onClick={() => void rpc('openLink', { url: ev.htmlLink }).catch(report)}
                                >
                                  {uiText('Mở ↗')}
                                </button>
                              )}
                              <button
                                type="button"
                                className="danger"
                                disabled={busy === `del-ev-${ev.id}`}
                                onClick={() => void handleDeleteEvent(ev)}
                              >
                                {uiText('Xóa')}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </div>

              {/* Chân trang tóm tắt & xuất nhanh Thời khóa biểu đang xem */}
              <footer className="google-fullcal-footer">
                <span>
                  {uiText('Đang hiển thị')}: <strong>{eventsInVisibleRange.length}</strong> {uiText('tiết dạy / sự kiện trong')} {calendarPeriodTitle.toLowerCase()}
                </span>
                <div className="google-toolbar-row">
                  <button type="button" onClick={handleExportIcs}>
                    📅 {uiText('Xuất lịch .ics (macOS / Google)')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAskAi(
                        `Dựa vào Thời khóa biểu và Lịch Google Calendar trong ${calendarPeriodTitle}, hãy lập bảng Thời khóa biểu & Lịch báo giảng chuẩn đẹp rồi xuất ra file Excel (.xlsx).`
                      )
                    }
                  >
                    <Icon name="office" size={14} /> {uiText('Xuất Thời khóa biểu ra Excel (.xlsx)')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAskAi(
                        `Dựa vào Thời khóa biểu và sự kiện trong ${calendarPeriodTitle}, hãy soạn Kế hoạch công tác và Lịch báo giảng xuất ra file Word (.docx).`
                      )
                    }
                  >
                    <Icon name="office" size={14} /> {uiText('Xuất Lịch báo giảng ra Word (.docx)')}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      )}

      {tab === 'tasks' && (
        <section className="google-section">
          <header className="google-section-head">
            <div className="google-toolbar-row">
              <h3><Icon name="tasks" size={18} /> {uiText('Danh sách việc cần làm (Google Tasks)')}</h3>
              {!!view?.tasklists.length && (
                <select
                  aria-label={uiText('Chọn danh sách Google Tasks')}
                  value={view.selectedTasklistId}
                  disabled={!!busy}
                  onChange={e => void handleSelectTasklist(e.target.value)}
                >
                  <option value="__all__">{uiText('Tất cả danh sách')} ({view.tasklists.length})</option>
                  {view.tasklists.map(list => (
                    <option key={list.id} value={list.id}>{list.title}</option>
                  ))}
                </select>
              )}
              <div className="google-filter-pills" role="group" aria-label={uiText('Lọc công việc')}>
                {([
                  ['all', `${uiText('Tất cả')} (${tasks.length})`],
                  ['pending', `${uiText('Chưa xong')} (${pendingTasks.length})`],
                  ['completed', `${uiText('Đã xong')} (${completedTasks.length})`],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={taskFilter === key ? 'selected' : ''}
                    onClick={() => setTaskFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="google-toolbar-row">
              <button
                type="button"
                className="primary"
                disabled={!view?.connected || !!busy}
                onClick={() => {
                  if (showTaskForm && !editingTaskId) {
                    setShowTaskForm(false);
                  } else {
                    openNewTaskForm();
                  }
                }}
              >
                {showTaskForm && !editingTaskId ? uiText('Đóng biểu mẫu') : uiText('＋ Thêm công việc')}
              </button>
              <button
                type="button"
                disabled={!view?.connected || !!busy}
                onClick={() => void handleSync()}
              >
                {busy === 'sync' ? uiText('Đang tải…') : uiText('Làm mới')}
              </button>
            </div>
          </header>

          {showTaskForm && (
            <form className="google-form" onSubmit={e => void handleSaveTask(e)}>
              <h4>
                {editingTaskId
                  ? uiText('Chỉnh sửa công việc & đồng bộ Google Tasks')
                  : uiText('Thêm công việc mới vào Google Tasks')}
              </h4>
              <div className="google-form-grid">
                <label className="full">
                  {uiText('Tên công việc / Nhiệm vụ *')}
                  <input
                    required
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    placeholder={uiText('Ví dụ: Nộp đề kiểm tra giữa kì 1 khối 8 / Chấm bài lớp 9A2')}
                  />
                </label>
                {!!view?.tasklists.length && (
                  <label>
                    {uiText('Danh sách công việc')}
                    <select
                      value={
                        taskTargetListId ||
                        (view.selectedTasklistId !== '__all__'
                          ? view.selectedTasklistId
                          : view.tasklists[0]?.id || '@default')
                      }
                      onChange={e => setTaskTargetListId(e.target.value)}
                    >
                      {view.tasklists.map(list => (
                        <option key={list.id} value={list.id}>{list.title}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {uiText('Hạn hoàn thành')}
                  <input
                    type="date"
                    value={taskDue}
                    onChange={e => setTaskDue(e.target.value)}
                  />
                </label>
                <label className="full">
                  {uiText('Ghi chú chi tiết')}
                  <textarea
                    rows={2}
                    value={taskNotes}
                    onChange={e => setTaskNotes(e.target.value)}
                    placeholder={uiText('Yêu cầu ma trận, đường dẫn thư mục nộp bài...')}
                  />
                </label>
              </div>
              <div className="google-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowTaskForm(false);
                    setEditingTaskId(null);
                    setEditingTaskSourceListId('');
                  }}
                >
                  {uiText('Hủy')}
                </button>
                <button type="submit" className="primary" disabled={busy === 'save-task' || !taskTitle.trim()}>
                  {busy === 'save-task'
                    ? uiText('Đang đồng bộ…')
                    : editingTaskId
                    ? uiText('Cập nhật lên Google Tasks')
                    : uiText('Lưu vào Google Tasks')}
                </button>
              </div>
            </form>
          )}

          {!view?.connected ? (
            <div className="empty-card">
              <p>{uiText('Chưa kết nối tài khoản Google. Hãy chuyển sang mục «Cấu hình OAuth 2.0» để đăng nhập.')}</p>
              <button type="button" className="primary" onClick={() => setTab('setup')}>
                {uiText('Mở cấu hình OAuth 2.0')}
              </button>
            </div>
          ) : !filteredTasks.length ? (
            <p className="muted">{uiText('Không có công việc nào trong mục này.')}</p>
          ) : (
            <ul className="google-item-list">
              {filteredTasks.map(item => (
                <li key={`${item.tasklistId || ''}:${item.id}`} className={`google-item ${item.status === 'completed' ? 'completed' : ''}`}>
                  <label className="google-task-check">
                    <input
                      type="checkbox"
                      checked={item.status === 'completed'}
                      disabled={busy === `toggle-task-${item.id}`}
                      onChange={() => void handleToggleTask(item)}
                    />
                    <div className="google-item-main">
                      <strong>{item.title}</strong>
                      <small>
                        {item.tasklistTitle ? `[${item.tasklistTitle}] · ` : ''}
                        {item.due ? `${uiText('Hạn')}: ${fmtDateShort(item.due)}` : uiText('Không có hạn')}
                        {item.status === 'completed' ? ` · ✓ ${uiText('Đã hoàn thành')}` : ''}
                      </small>
                      {item.notes && <p className="google-item-desc">{item.notes}</p>}
                    </div>
                  </label>
                  <div className="google-item-ops">
                    <button
                      type="button"
                      onClick={() => openEditTaskForm(item)}
                    >
                      ✏️ {uiText('Sửa')}
                    </button>
                    <button
                      type="button"
                      title={uiText('Nhờ PVTA thực hiện hoặc soạn tài liệu cho công việc này')}
                      onClick={() => handleAskAi(`Hãy giúp tôi thực hiện công việc này trong Google Tasks: "${item.title}"${item.notes ? ` (${item.notes})` : ''}${item.due ? `, hạn hoàn thành ${fmtDateShort(item.due)}` : ''}.`)}
                    >
                      {uiText('Làm cùng AI')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy === `del-task-${item.id}`}
                      onClick={() => void handleDeleteTask(item)}
                    >
                      {uiText('Xóa')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section className="google-section google-notes-section">
          <header className="google-section-head">
            <div className="google-toolbar-row">
              <h3><Icon name="notebook" size={18} /> {uiText('Sổ tay Ghi chú Giáo viên (Google Keep & Google Drive)')}</h3>
              <label className="google-note-search">
                <Icon name="search" size={14} />
                <input
                  type="search"
                  aria-label={uiText('Tìm kiếm ghi chú')}
                  placeholder={uiText('Tìm theo tiêu đề, nội dung hoặc nhãn…')}
                  value={noteQuery}
                  onChange={e => setNoteQuery(e.target.value)}
                />
              </label>
              {!!allNoteTags.length && (
                <div className="google-filter-pills" role="group" aria-label={uiText('Lọc theo nhãn ghi chú')}>
                  <button
                    type="button"
                    className={noteTagFilter === '' ? 'selected' : ''}
                    onClick={() => setNoteTagFilter('')}
                  >
                    {uiText('Tất cả nhãn')}
                  </button>
                  {allNoteTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={noteTagFilter === tag ? 'selected' : ''}
                      onClick={() => setNoteTagFilter(prev => (prev === tag ? '' : tag))}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="google-toolbar-row">
              <button
                type="button"
                className="primary"
                disabled={!!busy}
                onClick={() => {
                  if (showNoteForm && !editingNoteId) setShowNoteForm(false);
                  else openNewNoteForm();
                }}
              >
                {showNoteForm && !editingNoteId ? uiText('Đóng biểu mẫu') : uiText('＋ Tạo ghi chú mới')}
              </button>
              <button
                type="button"
                disabled={!view?.connected || !!busy}
                onClick={() => void handleSync()}
              >
                {busy === 'sync' ? uiText('Đang đồng bộ…') : uiText('Đồng bộ Keep & Drive')}
              </button>
            </div>
          </header>

          {showNoteForm && (
            <form className="google-form google-note-form" onSubmit={e => void handleSaveNote(e)}>
              <h4>{editingNoteId ? uiText('Chỉnh sửa ghi chú') : uiText('Tạo ghi chú mới (lưu trên máy & đồng bộ Google Drive / Keep)')}</h4>
              <div className="google-form-grid">
                <label className="full">
                  {uiText('Tiêu đề ghi chú *')}
                  <input
                    required
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    placeholder={uiText('Ví dụ: Biên bản họp tổ KHTN tuần 9 / Dặn dò học sinh lớp 9A1')}
                  />
                </label>
                <label className="full">
                  {uiText('Nội dung ghi chú (Hỗ trợ Markdown, danh sách gạch đầu dòng)')}
                  <textarea
                    rows={4}
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder={uiText('Nhập nội dung chi tiết, ý tưởng bài giảng, nhận xét học sinh...')}
                  />
                </label>
                <label>
                  {uiText('Nhãn phân loại (cách nhau bởi dấu phẩy)')}
                  <input
                    value={noteTagsInput}
                    onChange={e => setNoteTagsInput(e.target.value)}
                    placeholder={uiText('Họp tổ, Sổ đầu bài, Chủ nhiệm, Đề thi')}
                  />
                </label>
                <div className="google-note-color-picker" role="group" aria-label={uiText('Chọn màu thẻ ghi chú')}>
                  <span>{uiText('Màu thẻ Keep:')}</span>
                  <div className="color-swatches">
                    {NOTE_COLOR_META.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-swatch ${c.id} ${noteColor === c.id ? 'selected' : ''}`}
                        style={{ backgroundColor: c.hex }}
                        title={c.label}
                        aria-label={c.label}
                        aria-pressed={noteColor === c.id}
                        onClick={() => setNoteColor(c.id)}
                      />
                    ))}
                  </div>
                </div>
                <label className="google-checkbox-inline">
                  <input
                    type="checkbox"
                    checked={notePinned}
                    onChange={e => setNotePinned(e.target.checked)}
                  />
                  <span>📌 {uiText('Ghim lên đầu Sổ tay')}</span>
                </label>
              </div>
              <div className="google-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowNoteForm(false);
                    setEditingNoteId(null);
                  }}
                >
                  {uiText('Hủy')}
                </button>
                <button type="submit" className="primary" disabled={busy === 'save-note' || !noteTitle.trim()}>
                  {busy === 'save-note'
                    ? uiText('Đang lưu…')
                    : editingNoteId
                    ? uiText('Cập nhật ghi chú')
                    : view?.connected
                    ? uiText('Lưu ghi chú lên Google')
                    : uiText('Lưu vào Sổ tay')}
                </button>
              </div>
            </form>
          )}

          {!filteredNotes.length ? (
            <div className="empty-card">
              <p className="muted">
                {notes.length
                  ? uiText('Không tìm thấy ghi chú nào khớp với bộ lọc hiện tại.')
                  : view?.connected
                  ? uiText('Chưa có ghi chú nào. Bấm «＋ Tạo ghi chú mới» để lưu nhanh ý tưởng dạy học, sổ đầu bài hoặc biên bản họp tổ lên Google Drive / Keep.')
                  : uiText('Chưa có ghi chú nào. Bấm «＋ Tạo ghi chú mới» để tạo nhanh ghi chú trên máy, hoặc kết nối OAuth 2.0 để đồng bộ hai chiều với Google Drive / Keep.')}
              </p>
              {!view?.connected && !notes.length && (
                <div className="google-toolbar-row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <button type="button" className="primary" onClick={openNewNoteForm}>
                    {uiText('＋ Tạo ghi chú mới ngay')}
                  </button>
                  <button type="button" onClick={() => setTab('setup')}>
                    {uiText('Kết nối Google OAuth 2.0')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="google-notes-grid" role="list" aria-label={uiText('Danh sách thẻ ghi chú')}>
              {filteredNotes.map(note => (
                <article
                  key={note.id}
                  role="listitem"
                  className={`google-note-card color-${note.color || 'yellow'} ${note.pinned ? 'pinned' : ''}`}
                >
                  <header className="google-note-card-head">
                    <div className="google-note-title-wrap">
                      <h4>{note.title}</h4>
                      <span className="google-note-source-badge">
                        {note.source === 'keep'
                          ? 'Google Keep'
                          : note.source === 'local'
                          ? uiText('Lưu trên máy')
                          : 'Google Drive'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`google-pin-btn ${note.pinned ? 'active' : ''}`}
                      title={note.pinned ? uiText('Bỏ ghim ghi chú') : uiText('Ghim ghi chú lên đầu')}
                      aria-label={note.pinned ? uiText('Bỏ ghim ghi chú') : uiText('Ghim ghi chú lên đầu')}
                      disabled={busy === `pin-note-${note.id}`}
                      onClick={() => void handleTogglePinNote(note)}
                    >
                      📌
                    </button>
                  </header>

                  <div
                    className="google-note-body"
                    onClick={() => openEditNoteForm(note)}
                    title={uiText('Bấm để chỉnh sửa nội dung ghi chú này')}
                    style={{ cursor: 'pointer' }}
                  >
                    {note.content ? (
                      <p>{note.content}</p>
                    ) : (
                      <p className="muted small">{uiText('(Chưa có nội dung chi tiết — bấm để nhập)')}</p>
                    )}
                  </div>

                  {!!note.tags?.length && (
                    <div className="google-note-tags">
                      {note.tags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          className="google-note-tag"
                          onClick={() => setNoteTagFilter(tag)}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}

                  <footer className="google-note-footer">
                    <div className="google-note-QuickColors" aria-label={uiText('Đổi màu nhanh')}>
                      {NOTE_COLOR_META.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className={`mini-swatch ${note.color === c.id ? 'active' : ''}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                          onClick={() => void handleChangeNoteColor(note, c.id)}
                        />
                      ))}
                    </div>
                    <div className="google-note-actions">
                      <button
                        type="button"
                        className="primary"
                        title={uiText('Nhờ PVTA phát triển ghi chú này thành Giáo án, Kế hoạch hoặc Văn bản Word/PowerPoint')}
                        onClick={() =>
                          handleAskAi(
                            `Dựa trên ghi chú "${note.title}" với nội dung:\n"${note.content}"\nHãy giúp tôi triển khai chi tiết hoặc soạn thành tài liệu Word (.docx) / bài giảng PowerPoint (.pptx) hoàn chỉnh.`
                          )
                        }
                      >
                        <Icon name="spark" size={13} /> {uiText('Triển khai với AI')}
                      </button>
                      <button
                        type="button"
                        title={uiText('Chuyển ghi chú này thành công việc cần làm trong Google Tasks')}
                        disabled={!view?.connected || busy === `note-task-${note.id}`}
                        onClick={() => void handleNoteToTask(note)}
                      >
                        {uiText('→ Tạo Task')}
                      </button>
                      <button type="button" onClick={() => openEditNoteForm(note)}>
                        {uiText('Sửa')}
                      </button>
                      {note.webViewLink && (
                        <button
                          type="button"
                          onClick={() => void rpc('openLink', { url: note.webViewLink }).catch(report)}
                        >
                          {uiText('Drive ↗')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="danger"
                        disabled={busy === `del-note-${note.id}`}
                        onClick={() => void handleDeleteNote(note)}
                      >
                        {uiText('Xóa')}
                      </button>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'setup' && (
        <div className="google-setup-grid">
          <section className="google-section">
            <h3>{uiText('Kết nối OAuth 2.0 chuẩn qua Google API')}</h3>
            <p className="muted">
              {uiText('Sử dụng Google Calendar API v3, Google Tasks API v1, Google Drive API v3 và Google Keep API v1 chính thức (miễn phí 100%, không cần thẻ ngân hàng). Dữ liệu và khóa token được lưu cục bộ an toàn trên máy của thầy cô.')}
            </p>
            <form className="google-form" onSubmit={e => void handleSaveConfig(e)}>
              <label>
                {uiText('OAuth Client ID (Desktop App) *')}
                <input
                  required
                  value={clientId}
                  onChange={e => {
                    setClientId(e.target.value);
                    setConfigDirty(true);
                  }}
                  placeholder="1234567890-abcdef.apps.googleusercontent.com"
                />
              </label>
              <label>
                {uiText('OAuth Client Secret (Tùy chọn với Desktop App PKCE)')}
                <input
                  type="password"
                  value={clientSecret}
                  onChange={e => {
                    setClientSecret(e.target.value);
                    setConfigDirty(true);
                  }}
                  placeholder={view?.hasClientSecret ? uiText('Đã lưu Client Secret (nhập mới nếu muốn thay đổi)') : uiText('GOCSPX-...')}
                />
              </label>
              <div className="google-form-actions">
                <button type="submit" disabled={busy === 'config' || !clientId.trim()}>
                  {busy === 'config' ? uiText('Đang lưu…') : uiText('Lưu cấu hình OAuth')}
                </button>
                {view?.authenticating || busy === 'login' ? (
                  <button type="button" className="danger" onClick={() => void handleCancelLogin()}>
                    {uiText('Hủy chờ đăng nhập')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={!clientId.trim() && !view?.configured}
                    onClick={() => void handleLogin()}
                  >
                    {view?.connected ? uiText('Đăng nhập lại Google (OAuth 2.0)') : uiText('Đăng nhập bằng trình duyệt (OAuth 2.0)')}
                  </button>
                )}
                {view?.connected && (
                  <button type="button" className="danger" disabled={!!busy} onClick={() => void handleLogout()}>
                    {uiText('Ngắt kết nối')}
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="google-section">
            <h3>{uiText('Hướng dẫn lấy OAuth Client ID miễn phí (3 phút)')}</h3>
            <ol className="google-guide-steps">
              <li>
                <strong>{uiText('Bước 1 — Bật API (Miễn phí, không cần thẻ):')}</strong>{' '}
                {uiText('Mở Google Cloud Console, tạo một dự án mới (ví dụ: PVTA Teacher), vào mục «APIs & Services → Library» rồi bật 3 dịch vụ chuẩn:')}{' '}
                <code>Google Calendar API</code>, <code>Google Tasks API</code> {uiText('và')} <code>Google Drive API</code>{' '}
                <small className="muted">
                  ({uiText('Sổ tay Ghi chú kiểu Keep sẽ tự động lưu và đồng bộ qua Google Drive API; không cần bật Google Keep API vì Google chỉ mở Keep API cho tài khoản doanh nghiệp Workspace')})
                </small>.
              </li>
              <li>
                <strong>{uiText('Bước 2 — Cấu hình màn hình cấp quyền:')}</strong>{' '}
                {uiText('Vào «OAuth consent screen», chọn User Type là External (hoặc Internal nếu dùng email trường học .edu.vn), điền tên ứng dụng là PVTA và thêm email của thầy cô vào danh sách Test users.')}
              </li>
              <li>
                <strong>{uiText('Bước 3 — Tạo OAuth Client ID:')}</strong>{' '}
                {uiText('Vào «Credentials → Create Credentials → OAuth client ID», chọn Application type là')}{' '}
                <strong>Desktop app</strong>. {uiText('Sao chép Client ID (và Client Secret nếu có) dán vào khung bên trái rồi bấm «Đăng nhập bằng trình duyệt (OAuth 2.0)».')}
              </li>
            </ol>
            <div className="google-guide-links">
              <button
                type="button"
                onClick={() => void rpc('openLink', { url: 'https://console.cloud.google.com/apis/library' }).catch(report)}
              >
                {uiText('Mở Google Cloud API Library ↗')}
              </button>
              <button
                type="button"
                onClick={() => void rpc('openLink', { url: 'https://console.cloud.google.com/apis/credentials' }).catch(report)}
              >
                {uiText('Mở trang tạo OAuth Credentials ↗')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
