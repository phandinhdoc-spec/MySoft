import path from 'node:path';
import {
  formatUpdatedAt,
  listPendingSync,
  readRecords,
  recordFilePath,
  saveRecord,
  type CalendarRecordKind,
  type StoredRecord,
} from './calendar-store.js';

// RPC lưu cục bộ cho cửa sổ sửa sự kiện/công việc (calendar.*).
// Mọi bản ghi đi qua calendar-store: syncState = dirty, updatedAt là mili giây.
// Tệp đính kèm KHÔNG nằm trong data, nên không bao giờ đi theo payload gửi Google.

export interface LocalEventData {
  calendarId?: string;
  summary: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  colorId?: string;
  recurrence?: string[];
  remindersMinutes?: number[];
  attendees?: string[];
}

export interface LocalTaskData {
  tasklistId?: string;
  title: string;
  notes?: string;
  due?: string;
}

export interface LocalRecordView<T> {
  kind: CalendarRecordKind;
  localId: string;
  googleId: string | null;
  syncState: StoredRecord<T>['syncState'];
  updatedAt: number;
  updatedAtText: string;
  deleted: boolean;
  data: T;
  attachments: StoredRecord<T>['attachments'];
}

const LOCAL_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const TEXT_MAX = 8192;

function fail(message: string): never {
  throw new Error(message);
}

function text(value: unknown, field: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`Thiếu ${field}`);
    return undefined;
  }
  if (typeof value !== 'string') fail(`${field} phải là chuỗi`);
  const s = value.trim();
  if (!s && required) fail(`Thiếu ${field}`);
  if (s.length > max) fail(`${field} quá dài (tối đa ${max} ký tự)`);
  return s || undefined;
}

function strList(value: unknown, field: string, max: number): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > max) fail(`${field} phải là danh sách tối đa ${max} mục`);
  return value.map((v, i) => {
    const s = text(v, `${field}[${i}]`, 320, true);
    return s as string;
  });
}

export function sanitizeEventData(input: unknown): LocalEventData {
  if (!input || typeof input !== 'object') fail('Dữ liệu sự kiện không hợp lệ');
  const d = input as Record<string, unknown>;
  const remindersRaw = d.remindersMinutes;
  let reminders: number[] | undefined;
  if (remindersRaw !== undefined && remindersRaw !== null) {
    if (!Array.isArray(remindersRaw) || remindersRaw.length > 10) fail('remindersMinutes không hợp lệ');
    reminders = remindersRaw.map(v => {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 40320) fail('Số phút nhắc không hợp lệ');
      return v;
    });
  }
  if (d.allDay !== undefined && typeof d.allDay !== 'boolean') fail('allDay phải là true/false');
  const out: LocalEventData = {
    summary: text(d.summary, 'Tiêu đề', 1024, true) as string,
    start: text(d.start, 'Bắt đầu', 40, true) as string,
  };
  const calendarId = text(d.calendarId, 'calendarId', 320);
  const end = text(d.end, 'Kết thúc', 40);
  const location = text(d.location, 'Địa điểm', 1024);
  const description = text(d.description, 'Mô tả', TEXT_MAX);
  const colorId = text(d.colorId, 'colorId', 16);
  const recurrence = strList(d.recurrence, 'recurrence', 10);
  const attendees = strList(d.attendees, 'attendees', 100);
  if (calendarId) out.calendarId = calendarId;
  if (end) out.end = end;
  if (d.allDay !== undefined) out.allDay = d.allDay as boolean;
  if (location) out.location = location;
  if (description) out.description = description;
  if (colorId) out.colorId = colorId;
  if (recurrence) out.recurrence = recurrence;
  if (reminders) out.remindersMinutes = reminders;
  if (attendees) out.attendees = attendees;
  return out;
}

export function sanitizeTaskData(input: unknown): LocalTaskData {
  if (!input || typeof input !== 'object') fail('Dữ liệu công việc không hợp lệ');
  const d = input as Record<string, unknown>;
  const out: LocalTaskData = { title: text(d.title, 'Tiêu đề', 1024, true) as string };
  const tasklistId = text(d.tasklistId, 'tasklistId', 320);
  const notes = text(d.notes, 'Ghi chú', TEXT_MAX);
  const due = text(d.due, 'Hạn', 40);
  if (tasklistId) out.tasklistId = tasklistId;
  if (notes) out.notes = notes;
  if (due) out.due = due;
  return out;
}

function optionalLocalId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !LOCAL_ID_RE.test(value)) fail('localId không hợp lệ');
  return value;
}

function optionalGoogleId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 1024) fail('googleId không hợp lệ');
  return value;
}

function view<T>(kind: CalendarRecordKind, rec: StoredRecord<T>): LocalRecordView<T> {
  return {
    kind,
    localId: rec.localId,
    googleId: rec.googleId,
    syncState: rec.syncState,
    updatedAt: rec.updatedAt,
    updatedAtText: formatUpdatedAt(rec.updatedAt),
    deleted: rec.deleted,
    data: rec.data,
    attachments: rec.attachments,
  };
}

/**
 * Lưu một sự kiện/công việc cục bộ.
 * - Có localId: sửa đúng bản ghi đó.
 * - Không có localId nhưng có googleId: sửa bản ghi đã gắn googleId đó, nếu chưa có thì tạo mới gắn googleId.
 *   Nhờ vậy sự kiện đã có trên Google không bị nhân đôi.
 * - Không có cả hai: tạo mới (googleId = null, chờ tạo trên Google ở bước đồng bộ).
 */
function saveLocal<T>(
  kind: CalendarRecordKind,
  root: string,
  params: Record<string, unknown>,
  data: T,
  now: number
): LocalRecordView<T> {
  const file = recordFilePath(root, kind);
  const localId = optionalLocalId(params.localId);
  const googleId = optionalGoogleId(params.googleId);
  let targetLocalId = localId;
  if (!targetLocalId && googleId) {
    targetLocalId = readRecords<T>(file).find(r => r.googleId === googleId)?.localId;
  }
  const rec = saveRecord<T>(file, { localId: targetLocalId, googleId: googleId ?? null, data }, now);
  return view(kind, rec);
}

/** Lấy các bản ghi chưa đồng bộ (dirty hoặc error). Bản clean không gửi lại. */
function listLocal(root: string): { events: LocalRecordView<LocalEventData>[]; tasks: LocalRecordView<LocalTaskData>[] } {
  return {
    events: listPendingSync<LocalEventData>(recordFilePath(root, 'calendar')).map(r => view('calendar', r)),
    tasks: listPendingSync<LocalTaskData>(recordFilePath(root, 'tasks')).map(r => view('tasks', r)),
  };
}

export interface CalendarLocalOptions {
  /** Đồng hồ, tiêm vào để kiểm thử. Mặc định Date.now(). */
  now?: () => number;
}

/**
 * Tạo bộ xử lý RPC calendar.* gắn với một thư mục gốc.
 * Thư mục gốc do runtime truyền vào (mặc định: <pvtaHome>/pvta-calendar).
 */
export function createCalendarLocalHost(root: string, options: CalendarLocalOptions = {}) {
  const clock = options.now ?? (() => Date.now());
  const resolvedRoot = path.resolve(root);

  return {
    root: resolvedRoot,
    rpc(method: string, params: Record<string, unknown> = {}): unknown {
      switch (method) {
        case 'calendar.saveEvent': {
          const data = sanitizeEventData(params.data);
          return saveLocal<LocalEventData>('calendar', resolvedRoot, params, data, clock());
        }
        case 'calendar.saveTask': {
          const data = sanitizeTaskData(params.data);
          return saveLocal<LocalTaskData>('tasks', resolvedRoot, params, data, clock());
        }
        case 'calendar.listLocal':
          return listLocal(resolvedRoot);
        default:
          throw new Error('Yêu cầu lịch cục bộ không được hỗ trợ.');
      }
    },
  };
}

export type CalendarLocalHost = ReturnType<typeof createCalendarLocalHost>;
