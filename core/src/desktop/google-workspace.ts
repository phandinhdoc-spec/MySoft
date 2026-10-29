import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { atomicJson, uid } from './storage.js';
import {
  SyncCursorExpiredError,
  SyncHttpError,
  SyncNetworkError,
  type RemoteItem,
  type RemotePage,
  type SyncRemote,
} from './calendar-sync.js';

const S = (v: unknown, max = 2000) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Dữ liệu không hợp lệ.');
  return v.trim();
};

const OPT_S = (v: unknown, max = 2000) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > max) throw Error('Dữ liệu không hợp lệ.');
  return v.trim();
};

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

/** Keep là tùy chọn: chỉ xin khi đặt PVTA_GOOGLE_KEEP=1, vì nhiều dự án/tài khoản bị Google trả invalid_scope. */
export const GOOGLE_KEEP_SCOPE = 'https://www.googleapis.com/auth/keep';
export const googleScopes = (): string[] =>
  process.env.PVTA_GOOGLE_KEEP === '1' ? [...GOOGLE_OAUTH_SCOPES, GOOGLE_KEEP_SCOPE] : [...GOOGLE_OAUTH_SCOPES];

export const GOOGLE_NOTES_FOLDER_NAME = 'PVTA Ghi chú (Notes)';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret?: string;
}

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  email?: string;
}

export const ALL_CALENDARS_ID = '__all__';
export const ALL_TASKLISTS_ID = '__all__';

/**
 * Tệp hoặc hình ảnh đính kèm cục bộ cho sự kiện Calendar, công việc Task hoặc ghi chú Note.
 * Google Calendar API v3 (mặc định không bật supportsAttachments/Drive fileId) và Google Tasks API v1
 * không cho phép tải trực tiếp file/ảnh nhị phân từ máy lên sự kiện/task, nên dữ liệu đính kèm
 * luôn được lưu trữ an toàn tại máy cục bộ (trong thư mục `workspace-attachments` và các tệp JSON cục bộ)
 * và KHÔNG đẩy trường `attachments` lên Google Calendar / Tasks API khi đồng bộ để tránh lỗi API.
 */
export interface WorkspaceLocalAttachment {
  id: string;
  name: string;
  /** Đường dẫn tệp đã sao lưu cục bộ trong thư mục dữ liệu PVTA */
  localPath: string;
  /** Đường dẫn tệp gốc khi người dùng chọn (nếu có) */
  originalPath?: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
  /** Bản xem trước Data URL (thu gọn cho ảnh) để hiển thị ngay trên cửa sổ rời */
  previewDataUrl?: string;
  addedAt: string;
  localOnly: true;
}

export type SyncDirtyAction = 'create' | 'update' | 'delete';

export interface SyncDirtyRecord {
  kind: 'event' | 'task' | 'note';
  id: string;
  action: SyncDirtyAction;
  calendarId?: string;
  targetCalendarId?: string;
  tasklistId?: string;
  targetTasklistId?: string;
  updatedAt: number;
}

export interface LocalCalendarStoreFile {
  version: 1;
  updatedAt: number;
  selectedCalendarId: string;
  calendars: GoogleCalendarSummary[];
  events: GoogleCalendarEvent[];
}

export interface LocalTasksStoreFile {
  version: 1;
  updatedAt: number;
  selectedTasklistId: string;
  tasklists: GoogleTaskListSummary[];
  tasks: GoogleTaskItem[];
}

export interface LocalNotesStoreFile {
  version: 1;
  updatedAt: number;
  notesFolderId?: string;
  notes: GoogleNoteItem[];
}

export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  calendarId: string;
  calendarSummary?: string;
  calendarColor?: string;
  colorId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  recurrence?: string[];
  recurringEventId?: string;
  remindersMinutes?: number[];
  attendees?: string[];
  conferenceLink?: string;
  htmlLink?: string;
  status?: string;
  /** Tệp & hình ảnh đính kèm lưu cục bộ tại máy (không gửi lên Google Calendar API) */
  attachments?: WorkspaceLocalAttachment[];
  /** Đánh dấu sự kiện mới/sửa cục bộ đang chờ đồng bộ tự động (sau 30s ngưng thao tác) */
  dirtyAction?: 'create' | 'update';
  localUpdatedAt?: number;
}

export interface GoogleTaskListSummary {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTaskItem {
  id: string;
  tasklistId: string;
  tasklistTitle?: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated?: string;
  webViewLink?: string;
  /** Tệp & hình ảnh đính kèm lưu cục bộ tại máy (không gửi lên Google Tasks API) */
  attachments?: WorkspaceLocalAttachment[];
  dirtyAction?: 'create' | 'update';
  localUpdatedAt?: number;
}

export type GoogleNoteColor = 'default' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export interface GoogleNoteItem {
  id: string;
  title: string;
  content: string;
  color: GoogleNoteColor;
  pinned?: boolean;
  tags: string[];
  source: 'drive' | 'keep' | 'local';
  updated: string;
  webViewLink?: string;
  /** Tệp & hình ảnh đính kèm lưu cục bộ tại máy */
  attachments?: WorkspaceLocalAttachment[];
  dirtyAction?: 'create' | 'update';
  localUpdatedAt?: number;
}

export interface GoogleWorkspaceStoreData {
  version: 1;
  config: GoogleOAuthConfig;
  tokens?: GoogleOAuthTokens;
  selectedCalendarId: string;
  selectedTasklistId: string;
  notesFolderId?: string;
  calendars: GoogleCalendarSummary[];
  events: GoogleCalendarEvent[];
  tasklists: GoogleTaskListSummary[];
  tasks: GoogleTaskItem[];
  notes: GoogleNoteItem[];
  dirtyQueue?: SyncDirtyRecord[];
  lastSyncedAt?: number;
  lastError?: string;
}

export interface GoogleWorkspaceView {
  configured: boolean;
  connected: boolean;
  authenticating: boolean;
  clientId: string;
  hasClientSecret: boolean;
  email?: string;
  selectedCalendarId: string;
  selectedTasklistId: string;
  notesFolderId?: string;
  calendars: GoogleCalendarSummary[];
  events: GoogleCalendarEvent[];
  tasklists: GoogleTaskListSummary[];
  tasks: GoogleTaskItem[];
  notes: GoogleNoteItem[];
  dirtyCount: number;
  dirtyQueue: SyncDirtyRecord[];
  localFiles: {
    calendarJson: string;
    tasksJson: string;
    notesJson: string;
    attachmentsDir: string;
  };
  lastSyncedAt?: number;
  lastError?: string;
  scopes: readonly string[];
}

export interface GoogleWorkspaceHostOptions {
  home: string;
  notify?: (view: GoogleWorkspaceView) => void;
  fetcher?: typeof fetch;
  openBrowser?: (url: string) => void;
}

/** Chuyển lỗi fetch/HTTP sang lỗi có phân loại để bộ đồng bộ quyết định thử lại hay đánh dấu lỗi. */
function toSyncError(err: unknown): unknown {
  const e = err as { status?: unknown; name?: string; message?: string } | null;
  if (typeof e?.status === 'number') return new SyncHttpError(e.status, e.message ?? `HTTP ${e.status}`);
  if (err instanceof Error && (err.name === 'TypeError' || err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return new SyncNetworkError(err.message || 'Lỗi mạng khi gọi Google');
  }
  return err;
}

/** Payload công việc từ dữ liệu nội bộ. Khi tạo mới bỏ các trường rỗng như syncDirty cũ. */
function syncTaskBody(data: Record<string, unknown>, isCreate: boolean): Record<string, unknown> {
  if (typeof data.title !== 'string') throw Error('Công việc thiếu tiêu đề');
  const completed = data.status === 'completed';
  const body: Record<string, unknown> = {
    title: data.title,
    notes: typeof data.notes === 'string' ? data.notes : '',
    status: completed ? 'completed' : 'needsAction',
    due: typeof data.due === 'string' && data.due ? data.due : null,
    completed: completed ? (typeof data.completed === 'string' && data.completed ? data.completed : new Date().toISOString()) : null,
  };
  if (isCreate) {
    if (!body.notes) delete body.notes;
    if (!body.due) delete body.due;
    if (!completed) delete body.completed;
  }
  return body;
}

function calendarEventToData(ev: any): Record<string, unknown> {
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime);
  return {
    summary: typeof ev.summary === 'string' ? ev.summary : '',
    start: String(ev.start?.dateTime || ev.start?.date || ''),
    end: String(ev.end?.dateTime || ev.end?.date || ''),
    allDay,
    location: typeof ev.location === 'string' ? ev.location : undefined,
    description: typeof ev.description === 'string' ? ev.description : undefined,
    colorId: typeof ev.colorId === 'string' ? ev.colorId : undefined,
    recurrence: Array.isArray(ev.recurrence) ? ev.recurrence.filter((r: unknown) => typeof r === 'string') : undefined,
    attendees: Array.isArray(ev.attendees)
      ? ev.attendees.map((a: any) => a?.email).filter((e: unknown): e is string => typeof e === 'string')
      : undefined,
  };
}

function taskToData(t: any): Record<string, unknown> {
  return {
    title: typeof t.title === 'string' ? t.title : '',
    notes: typeof t.notes === 'string' ? t.notes : undefined,
    status: t.status === 'completed' ? 'completed' : 'needsAction',
    due: typeof t.due === 'string' ? t.due : undefined,
    completed: typeof t.completed === 'string' ? t.completed : undefined,
  };
}

function defaultOpenBrowser(url: string): void {
  if (!/^https:\/\//i.test(url)) return;
  if (process.platform === 'darwin') {
    execFile('open', [url], () => {});
  } else if (process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, () => {});
  } else {
    execFile('xdg-open', [url], () => {});
  }
}

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

function buildDriveTagsProp(tags: string[]): string {
  const out: string[] = [];
  for (const raw of tags) {
    const t = String(raw).trim();
    if (!t) continue;
    const candidate = out.length ? `${out.join(',')},${t}` : t;
    // Google Drive appProperties requires utf8Length(key) + utf8Length(value) <= 124 bytes.
    // Key 'pvtaTags' is 8 bytes, so value must be <= 110 UTF-8 bytes.
    if (utf8ByteLength(candidate) > 110) break;
    out.push(t);
  }
  return out.join(',');
}

function truncateUtf8(s: string, maxBytes: number): string {
  if (utf8ByteLength(s) <= maxBytes) return s;
  return Buffer.from(s, 'utf8').subarray(0, maxBytes).toString('utf8').replace(/\uFFFD+$/, '');
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

function isImageMime(mime: string, name: string): boolean {
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

function sanitizeAttachments(raw: unknown): WorkspaceLocalAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WorkspaceLocalAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Record<string, unknown>;
    const id = typeof x.id === 'string' && x.id.trim() ? x.id.trim() : uid();
    const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : 'tai-lieu-dinh-kem';
    const localPath = typeof x.localPath === 'string' ? x.localPath.trim() : '';
    const originalPath = typeof x.originalPath === 'string' && x.originalPath.trim() ? x.originalPath.trim() : undefined;
    const mimeType = typeof x.mimeType === 'string' && x.mimeType.trim() ? x.mimeType.trim() : guessMimeType(name);
    const size = typeof x.size === 'number' && Number.isFinite(x.size) && x.size >= 0 ? x.size : 0;
    const kind: 'image' | 'file' = x.kind === 'image' || isImageMime(mimeType, name) ? 'image' : 'file';
    const previewDataUrl =
      typeof x.previewDataUrl === 'string' && x.previewDataUrl.startsWith('data:image/')
        ? x.previewDataUrl
        : undefined;
    const addedAt = typeof x.addedAt === 'string' && x.addedAt ? x.addedAt : new Date().toISOString();
    out.push({
      id,
      name,
      localPath,
      ...(originalPath ? { originalPath } : {}),
      mimeType,
      size,
      kind,
      ...(previewDataUrl ? { previewDataUrl } : {}),
      addedAt,
      localOnly: true,
    });
  }
  return out.length ? out : undefined;
}

/**
 * Quản lý bộ dữ liệu cục bộ JSON (`calendar.json`, `tasks.json`, `notes.json`) và kết nối
 * Google Calendar API v3, Google Tasks API v1, Google Drive API v3 qua OAuth 2.0 (PKCE Loopback).
 * - Tệp cấu hình tổng hợp và token được lưu tại `<home>/google-workspace.json` (quyền 0o600).
 * - Bộ 3 tệp dữ liệu JSON chuyên biệt:
 *   + `<home>/calendar.json` (sự kiện, thời khóa biểu, tệp/ảnh đính kèm cục bộ)
 *   + `<home>/tasks.json` (danh sách công việc, tệp/ảnh đính kèm cục bộ)
 *   + `<home>/notes.json` (sổ tay ghi chú, tệp/ảnh đính kèm cục bộ)
 * - Tệp/ảnh đính kèm được lưu tại `<home>/workspace-attachments/` và giữ nguyên cục bộ,
 *   tuyệt đối không đẩy lên Google Calendar API để tránh lỗi từ chối schema hoặc mất dữ liệu.
 */
export class GoogleWorkspaceHost {
  readonly file: string;
  readonly calendarFile: string;
  readonly tasksFile: string;
  readonly notesFile: string;
  readonly attachmentsDir: string;
  private data: GoogleWorkspaceStoreData;
  private f: typeof fetch;
  private openBrowser: (url: string) => void;
  private authServer?: http.Server;
  private authReject?: (err: Error) => void;
  private authenticating = false;

  constructor(private o: GoogleWorkspaceHostOptions) {
    this.file = path.join(o.home, 'google-workspace.json');
    this.calendarFile = path.join(o.home, 'calendar.json');
    this.tasksFile = path.join(o.home, 'tasks.json');
    this.notesFile = path.join(o.home, 'notes.json');
    this.attachmentsDir = path.join(o.home, 'workspace-attachments');
    try {
      fs.mkdirSync(this.attachmentsDir, { recursive: true, mode: 0o700 });
    } catch {}
    this.f = o.fetcher ?? fetch;
    this.openBrowser = o.openBrowser ?? defaultOpenBrowser;
    this.data = this.load();
    this.writeSplitJsonFiles();
  }

  private readJsonSafe<T = any>(filePath: string): T | undefined {
    try {
      if (!fs.existsSync(filePath)) return undefined;
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  private load(): GoogleWorkspaceStoreData {
    const envClientId = (process.env.PVTA_GOOGLE_CLIENT_ID ?? '').trim();
    const envSecret = (process.env.PVTA_GOOGLE_CLIENT_SECRET ?? '').trim();
    const raw = this.readJsonSafe<any>(this.file);
    const calRaw = this.readJsonSafe<LocalCalendarStoreFile>(this.calendarFile);
    const tasksRaw = this.readJsonSafe<LocalTasksStoreFile>(this.tasksFile);
    const notesRaw = this.readJsonSafe<LocalNotesStoreFile>(this.notesFile);

    if ((raw && typeof raw === 'object') || calRaw || tasksRaw || notesRaw) {
      const clientId =
        typeof raw?.config?.clientId === 'string' && raw.config.clientId.trim()
          ? raw.config.clientId.trim()
          : envClientId;
      const clientSecret =
        typeof raw?.config?.clientSecret === 'string' && raw.config.clientSecret.trim()
          ? raw.config.clientSecret.trim()
          : envSecret || undefined;

      const calendars = Array.isArray(calRaw?.calendars) && calRaw.calendars.length
        ? calRaw.calendars
        : Array.isArray(raw?.calendars)
        ? raw.calendars
        : [];
      const events = (
        Array.isArray(calRaw?.events) && (calRaw.events.length || !Array.isArray(raw?.events))
          ? calRaw.events
          : Array.isArray(raw?.events)
          ? raw.events
          : []
      ).map((ev: any) => ({
        ...ev,
        ...(sanitizeAttachments(ev?.attachments) ? { attachments: sanitizeAttachments(ev?.attachments) } : {}),
      }));

      const tasklists = Array.isArray(tasksRaw?.tasklists) && tasksRaw.tasklists.length
        ? tasksRaw.tasklists
        : Array.isArray(raw?.tasklists)
        ? raw.tasklists
        : [];
      const tasks = (
        Array.isArray(tasksRaw?.tasks) && (tasksRaw.tasks.length || !Array.isArray(raw?.tasks))
          ? tasksRaw.tasks
          : Array.isArray(raw?.tasks)
          ? raw.tasks
          : []
      ).map((t: any) => ({
        ...t,
        ...(sanitizeAttachments(t?.attachments) ? { attachments: sanitizeAttachments(t?.attachments) } : {}),
      }));

      const notes = (
        Array.isArray(notesRaw?.notes) && (notesRaw.notes.length || !Array.isArray(raw?.notes))
          ? notesRaw.notes
          : Array.isArray(raw?.notes)
          ? raw.notes
          : []
      ).map((n: any) => ({
        ...n,
        ...(sanitizeAttachments(n?.attachments) ? { attachments: sanitizeAttachments(n?.attachments) } : {}),
      }));

      const dirtyQueue: SyncDirtyRecord[] = Array.isArray(raw?.dirtyQueue)
        ? raw.dirtyQueue.filter((d: any) => d && typeof d.id === 'string' && ['event', 'task', 'note'].includes(d.kind))
        : [];

      return {
        version: 1,
        config: { clientId, ...(clientSecret ? { clientSecret } : {}) },
        tokens: raw?.tokens && typeof raw.tokens.accessToken === 'string' ? raw.tokens : undefined,
        selectedCalendarId:
          typeof calRaw?.selectedCalendarId === 'string' && calRaw.selectedCalendarId
            ? calRaw.selectedCalendarId
            : typeof raw?.selectedCalendarId === 'string' && raw.selectedCalendarId
            ? raw.selectedCalendarId
            : ALL_CALENDARS_ID,
        selectedTasklistId:
          typeof tasksRaw?.selectedTasklistId === 'string' && tasksRaw.selectedTasklistId
            ? tasksRaw.selectedTasklistId
            : typeof raw?.selectedTasklistId === 'string' && raw.selectedTasklistId
            ? raw.selectedTasklistId
            : ALL_TASKLISTS_ID,
        notesFolderId:
          typeof notesRaw?.notesFolderId === 'string' && notesRaw.notesFolderId
            ? notesRaw.notesFolderId
            : typeof raw?.notesFolderId === 'string' && raw.notesFolderId
            ? raw.notesFolderId
            : undefined,
        calendars,
        events,
        tasklists,
        tasks,
        notes,
        dirtyQueue,
        lastSyncedAt: typeof raw?.lastSyncedAt === 'number' ? raw.lastSyncedAt : undefined,
        lastError: typeof raw?.lastError === 'string' ? raw.lastError : undefined,
      };
    }

    return {
      version: 1,
      config: { clientId: envClientId, ...(envSecret ? { clientSecret: envSecret } : {}) },
      selectedCalendarId: ALL_CALENDARS_ID,
      selectedTasklistId: ALL_TASKLISTS_ID,
      calendars: [],
      events: [],
      tasklists: [],
      tasks: [],
      notes: [],
      dirtyQueue: [],
    };
  }

  private writeSplitJsonFiles(): void {
    const now = Date.now();
    try {
      const calPayload: LocalCalendarStoreFile = {
        version: 1,
        updatedAt: now,
        selectedCalendarId: this.data.selectedCalendarId || ALL_CALENDARS_ID,
        calendars: this.data.calendars,
        events: this.data.events,
      };
      atomicJson(this.calendarFile, calPayload);
    } catch {}
    try {
      const tasksPayload: LocalTasksStoreFile = {
        version: 1,
        updatedAt: now,
        selectedTasklistId: this.data.selectedTasklistId || ALL_TASKLISTS_ID,
        tasklists: this.data.tasklists,
        tasks: this.data.tasks,
      };
      atomicJson(this.tasksFile, tasksPayload);
    } catch {}
    try {
      const notesPayload: LocalNotesStoreFile = {
        version: 1,
        updatedAt: now,
        notesFolderId: this.data.notesFolderId,
        notes: this.data.notes,
      };
      atomicJson(this.notesFile, notesPayload);
    } catch {}
  }

  private save(): void {
    atomicJson(this.file, this.data);
    this.writeSplitJsonFiles();
    this.o.notify?.(this.view());
  }

  private enqueueDirty(record: SyncDirtyRecord): void {
    const queue = this.data.dirtyQueue ?? [];
    const existingIdx = queue.findIndex(x => x.kind === record.kind && x.id === record.id);
    if (existingIdx >= 0) {
      const prev = queue[existingIdx]!;
      // Nếu bản ghi vừa được tạo mới cục bộ (local-...) rồi xóa ngay trước khi đồng bộ thì xóa khỏi hàng đợi
      if (prev.action === 'create' && record.action === 'delete' && record.id.startsWith('local-')) {
        queue.splice(existingIdx, 1);
        this.data.dirtyQueue = queue;
        return;
      }
      // Nếu bản ghi tạo mới cục bộ được chỉnh sửa trước khi đồng bộ thì vẫn giữ action = 'create'
      const mergedAction: SyncDirtyAction =
        prev.action === 'create' && record.action === 'update' ? 'create' : record.action;
      queue[existingIdx] = {
        ...prev,
        ...record,
        action: mergedAction,
        updatedAt: record.updatedAt,
      };
    } else {
      if (record.action === 'delete' && record.id.startsWith('local-')) {
        return;
      }
      queue.push(record);
    }
    this.data.dirtyQueue = queue;
  }

  private clearDirty(kind: SyncDirtyRecord['kind'], id: string): void {
    if (!this.data.dirtyQueue?.length) return;
    this.data.dirtyQueue = this.data.dirtyQueue.filter(x => !(x.kind === kind && x.id === id));
  }

  /**
   * Lưu tệp hoặc hình ảnh đính kèm vào thư mục cục bộ `<home>/workspace-attachments/`
   * để sử dụng trong cửa sổ quản lý Calendar, Tasks, Notes.
   */
  addLocalAttachment(input: {
    filePath?: string;
    name?: string;
    dataUrl?: string;
    mimeType?: string;
  }): WorkspaceLocalAttachment {
    fs.mkdirSync(this.attachmentsDir, { recursive: true, mode: 0o700 });
    const id = `att-${uid()}`;

    if (input.filePath && typeof input.filePath === 'string' && input.filePath.trim()) {
      const srcPath = path.resolve(input.filePath.trim());
      if (!fs.existsSync(srcPath)) {
        throw Error(`Không tìm thấy tệp để đính kèm: ${srcPath}`);
      }
      const stat = fs.statSync(srcPath);
      if (!stat.isFile()) {
        throw Error('Đường dẫn đính kèm không phải là tệp.');
      }
      if (stat.size > 50 * 1024 * 1024) {
        throw Error('Tệp đính kèm vượt quá giới hạn 50 MB.');
      }
      const baseName = path.basename(srcPath);
      const safeName = baseName.replace(/[^a-zA-Z0-9._\-\u00C0-\u1EF9 ]/g, '_');
      const destPath = path.join(this.attachmentsDir, `${id}-${safeName}`);
      fs.copyFileSync(srcPath, destPath);
      const mimeType = input.mimeType || guessMimeType(srcPath);
      const kind: 'image' | 'file' = isImageMime(mimeType, baseName) ? 'image' : 'file';
      let previewDataUrl: string | undefined;
      if (kind === 'image' && stat.size <= 4 * 1024 * 1024) {
        try {
          const b64 = fs.readFileSync(destPath).toString('base64');
          previewDataUrl = `data:${mimeType};base64,${b64}`;
        } catch {}
      }
      return {
        id,
        name: input.name?.trim() || baseName,
        localPath: destPath,
        originalPath: srcPath,
        mimeType,
        size: stat.size,
        kind,
        ...(previewDataUrl ? { previewDataUrl } : {}),
        addedAt: new Date().toISOString(),
        localOnly: true,
      };
    }

    if (input.dataUrl && typeof input.dataUrl === 'string' && input.dataUrl.startsWith('data:')) {
      const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(input.dataUrl);
      if (!m) throw Error('Dữ liệu tệp đính kèm không hợp lệ.');
      const mimeType = (input.mimeType || m[1] || 'application/octet-stream').trim();
      const buf = Buffer.from(m[2] || '', 'base64');
      if (buf.byteLength > 25 * 1024 * 1024) {
        throw Error('Dữ liệu đính kèm vượt quá 25 MB.');
      }
      const rawName = (input.name || '').trim() || `dinh-kem-${Date.now()}.${mimeType.split('/')[1] || 'bin'}`;
      const safeName = rawName.replace(/[^a-zA-Z0-9._\-\u00C0-\u1EF9 ]/g, '_');
      const destPath = path.join(this.attachmentsDir, `${id}-${safeName}`);
      fs.writeFileSync(destPath, buf, { mode: 0o600 });
      const kind: 'image' | 'file' = isImageMime(mimeType, rawName) ? 'image' : 'file';
      const previewDataUrl = kind === 'image' && buf.byteLength <= 4 * 1024 * 1024 ? input.dataUrl : undefined;
      return {
        id,
        name: rawName,
        localPath: destPath,
        mimeType,
        size: buf.byteLength,
        kind,
        ...(previewDataUrl ? { previewDataUrl } : {}),
        addedAt: new Date().toISOString(),
        localOnly: true,
      };
    }

    throw Error('Thiếu đường dẫn tệp hoặc dữ liệu ảnh/tệp đính kèm.');
  }

  close(): void {
    this.cancelLogin();
  }

  view(): GoogleWorkspaceView {
    const clientId = this.data.config.clientId || (process.env.PVTA_GOOGLE_CLIENT_ID ?? '').trim();
    const hasSecret = Boolean(this.data.config.clientSecret || (process.env.PVTA_GOOGLE_CLIENT_SECRET ?? '').trim());
    const dirtyQueue = this.data.dirtyQueue ?? [];
    return {
      configured: Boolean(clientId),
      connected: Boolean(this.data.tokens?.accessToken || this.data.tokens?.refreshToken),
      authenticating: this.authenticating,
      clientId,
      hasClientSecret: hasSecret,
      email: this.data.tokens?.email,
      selectedCalendarId: this.data.selectedCalendarId || ALL_CALENDARS_ID,
      selectedTasklistId: this.data.selectedTasklistId || ALL_TASKLISTS_ID,
      notesFolderId: this.data.notesFolderId,
      calendars: this.data.calendars,
      events: this.data.events,
      tasklists: this.data.tasklists,
      tasks: this.data.tasks,
      notes: this.data.notes,
      dirtyCount: dirtyQueue.length,
      dirtyQueue,
      localFiles: {
        calendarJson: this.calendarFile,
        tasksJson: this.tasksFile,
        notesJson: this.notesFile,
        attachmentsDir: this.attachmentsDir,
      },
      lastSyncedAt: this.data.lastSyncedAt,
      lastError: this.data.lastError,
      scopes: googleScopes(),
    };
  }

  /** Trích ngữ cảnh Lịch, Công việc & Sổ tay Ghi chú cho PVTA Chat khi đã kết nối. */
  grounding(maxChars = 4200): string {
    if (
      !this.data.tokens?.accessToken &&
      !this.data.tokens?.refreshToken &&
      !this.data.events.length &&
      !this.data.tasks.length &&
      !this.data.notes.length
    ) {
      return '';
    }
    const lines: string[] = [];
    if (this.data.events.length) {
      lines.push('LỊCH GOOGLE CALENDAR ĐÃ ĐỒNG BỘ:');
      for (const ev of this.data.events.slice(0, 15)) {
        const time = ev.allDay ? `${ev.start} (Cả ngày)` : `${ev.start} → ${ev.end}`;
        const attInfo = ev.attachments?.length ? ` [Đính kèm cục bộ: ${ev.attachments.map(a => a.name).join(', ')}]` : '';
        lines.push(`- [${time}] ${ev.summary}${ev.location ? ` @ ${ev.location}` : ''}${ev.description ? ` (${ev.description.slice(0, 120)})` : ''}${attInfo}`);
      }
    }
    const pendingTasks = this.data.tasks.filter(t => t.status !== 'completed');
    if (pendingTasks.length) {
      lines.push('CÔNG VIỆC GOOGLE TASKS ĐANG CHỜ:');
      for (const t of pendingTasks.slice(0, 15)) {
        const attInfo = t.attachments?.length ? ` [Đính kèm cục bộ: ${t.attachments.map(a => a.name).join(', ')}]` : '';
        lines.push(`- [Chưa xong${t.due ? ` · Hạn ${t.due.slice(0, 10)}` : ''}] ${t.title}${t.notes ? ` (${t.notes.slice(0, 120)})` : ''}${attInfo}`);
      }
    }
    if (this.data.notes.length) {
      lines.push('SỔ TAY GHI CHÚ (GOOGLE KEEP / GOOGLE DRIVE):');
      for (const n of this.data.notes.slice(0, 12)) {
        const tags = n.tags?.length ? ` [${n.tags.join(', ')}]` : '';
        const attInfo = n.attachments?.length ? ` [Đính kèm cục bộ: ${n.attachments.map(a => a.name).join(', ')}]` : '';
        lines.push(`- ${n.pinned ? '📌 ' : ''}${n.title}${tags}: ${n.content.replace(/\s+/g, ' ').slice(0, 180)}${attInfo}`);
      }
    }
    if (!lines.length) return '';
    return ('\nDỮ LIỆU GOOGLE CALENDAR, TASKS & GHI CHÚ (dữ liệu tham khảo của giáo viên):\n' + lines.join('\n')).slice(0, maxChars) + '\n';
  }

  saveConfig(input: { clientId?: unknown; clientSecret?: unknown }): GoogleWorkspaceView {
    const clientId = OPT_S(input.clientId, 400);
    if (!clientId) throw Error('Vui lòng nhập OAuth Client ID từ Google Cloud Console.');
    const secretRaw = OPT_S(input.clientSecret, 400);
    const prevSecret = this.data.config.clientSecret;
    this.data.config = {
      clientId,
      ...(secretRaw ? { clientSecret: secretRaw } : prevSecret && input.clientSecret === undefined ? { clientSecret: prevSecret } : {}),
    };
    delete this.data.lastError;
    this.save();
    return this.view();
  }

  cancelLogin(): void {
    if (this.authServer) {
      try {
        this.authServer.close();
      } catch {}
      this.authServer = undefined;
    }
    if (this.authReject) {
      const rej = this.authReject;
      this.authReject = undefined;
      const err = new Error('Đã hủy đăng nhập Google OAuth 2.0.');
      (err as any).cancelled = true;
      rej(err);
    }
    if (this.authenticating) {
      this.authenticating = false;
      delete this.data.lastError;
      this.save();
    }
  }

  disconnect(): GoogleWorkspaceView {
    this.cancelLogin();
    delete this.data.tokens;
    delete this.data.notesFolderId;
    this.data.calendars = [];
    this.data.events = [];
    this.data.tasklists = [];
    this.data.tasks = [];
    this.data.notes = [];
    delete this.data.lastSyncedAt;
    delete this.data.lastError;
    this.save();
    return this.view();
  }

  /**
   * Khởi chạy luồng OAuth 2.0 Authorization Code + PKCE qua cổng loopback cục bộ `http://127.0.0.1:<port>/oauth2callback`.
   * Mở trình duyệt hệ thống để giáo viên xác nhận quyền, sau đó tự động đổi code lấy access_token & refresh_token.
   */
  async loginOAuth(timeoutMs = 180_000): Promise<GoogleWorkspaceView> {
    const clientId = this.data.config.clientId || (process.env.PVTA_GOOGLE_CLIENT_ID ?? '').trim();
    const clientSecret = this.data.config.clientSecret || (process.env.PVTA_GOOGLE_CLIENT_SECRET ?? '').trim() || undefined;
    if (!clientId) {
      throw Error('Chưa cấu hình Google OAuth Client ID. Hãy nhập Client ID trong mục Cấu hình OAuth 2.0 trước khi đăng nhập.');
    }
    this.cancelLogin();
    this.authenticating = true;
    delete this.data.lastError;
    this.o.notify?.(this.view());

    const { verifier, challenge } = createPkcePair();
    const stateToken = uid();

    try {
      const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
        this.authReject = reject;
        const server = http.createServer((req, res) => {
          try {
            const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
            if (reqUrl.pathname !== '/oauth2callback') {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('Không tìm thấy trang.');
              return;
            }
            const err = reqUrl.searchParams.get('error');
            const returnedState = reqUrl.searchParams.get('state');
            const authCode = reqUrl.searchParams.get('code');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            if (err || !authCode || returnedState !== stateToken) {
              res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PVTA - Đăng nhập Google</title></head><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center"><h2>Chưa hoàn tất đăng nhập Google</h2><p>Bạn có thể đóng cửa sổ này và thử lại trong ứng dụng PVTA.</p></body></html>');
              reject(new Error(err ? `Google từ chối cấp quyền: ${err}` : 'Phản hồi OAuth không hợp lệ.'));
              return;
            }
            res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PVTA - Đã kết nối Google</title></head><body style="font-family:system-ui,sans-serif;padding:32px;text-align:center"><h2>Đã kết nối Google Calendar &amp; Google Tasks với PVTA!</h2><p>Thầy/cô có thể đóng thẻ trình duyệt này và quay lại ứng dụng PVTA.</p></body></html>');
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            resolve({ code: authCode, redirectUri: `http://127.0.0.1:${port}/oauth2callback` });
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          } finally {
            setTimeout(() => {
              try {
                server.close();
              } catch {}
            }, 150);
          }
        });

        this.authServer = server;
        const timer = setTimeout(() => {
          this.cancelLogin();
          reject(new Error('Hết thời gian chờ đăng nhập Google trên trình duyệt (3 phút). Hãy thử lại.'));
        }, timeoutMs);
        timer.unref?.();

        server.on('error', err => {
          clearTimeout(timer);
          reject(new Error(`Không mở được cổng nhận phản hồi OAuth: ${err.message}`));
        });

        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          const port = typeof addr === 'object' && addr ? addr.port : 0;
          const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
          const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          authUrl.searchParams.set('client_id', clientId);
          authUrl.searchParams.set('redirect_uri', redirectUri);
          authUrl.searchParams.set('response_type', 'code');
          authUrl.searchParams.set('scope', googleScopes().join(' '));
          authUrl.searchParams.set('code_challenge', challenge);
          authUrl.searchParams.set('code_challenge_method', 'S256');
          authUrl.searchParams.set('access_type', 'offline');
          authUrl.searchParams.set('prompt', 'consent');
          authUrl.searchParams.set('state', stateToken);
          this.openBrowser(authUrl.toString());
        });
      });

      this.authReject = undefined;
      this.authServer = undefined;

      await this.exchangeCodeForTokens({
        code,
        redirectUri,
        verifier,
        clientId,
        clientSecret,
      });

      await this.syncAll().catch(e => {
        this.data.lastError = e instanceof Error ? e.message : String(e);
      });
      this.save();
      return this.view();
    } catch (e) {
      if ((e as any)?.cancelled) {
        delete this.data.lastError;
        this.save();
        return this.view();
      }
      this.data.lastError = e instanceof Error ? e.message : String(e);
      this.save();
      throw e;
    } finally {
      this.authenticating = false;
      this.authReject = undefined;
      this.authServer = undefined;
      this.o.notify?.(this.view());
    }
  }

  /** Đổi authorization code (hoặc mã người dùng dán trực tiếp) lấy token OAuth 2.0. */
  async exchangeCodeForTokens(params: {
    code: string;
    redirectUri: string;
    verifier?: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<GoogleOAuthTokens> {
    const clientId = params.clientId || this.data.config.clientId || (process.env.PVTA_GOOGLE_CLIENT_ID ?? '').trim();
    const clientSecret = params.clientSecret ?? this.data.config.clientSecret ?? ((process.env.PVTA_GOOGLE_CLIENT_SECRET ?? '').trim() || undefined);
    if (!clientId) throw Error('Chưa có Google OAuth Client ID.');

    const body = new URLSearchParams({
      client_id: clientId,
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri,
    });
    if (params.verifier) body.set('code_verifier', params.verifier);
    if (clientSecret) body.set('client_secret', clientSecret);

    const res = await this.f('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== 'string') {
      const desc = typeof json.error_description === 'string' ? json.error_description : typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
      throw Error(`Không lấy được token OAuth 2.0 từ Google: ${desc}`);
    }

    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    const tokens: GoogleOAuthTokens = {
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : this.data.tokens?.refreshToken,
      expiryDate: Date.now() + expiresIn * 1000,
      scope: typeof json.scope === 'string' ? json.scope : undefined,
      tokenType: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
    };

    try {
      const infoRes = await this.f('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (infoRes.ok) {
        const info = (await infoRes.json()) as { email?: unknown };
        if (typeof info.email === 'string') tokens.email = info.email;
      }
    } catch {
      /* không chặn nếu không lấy được email */
    }

    this.data.tokens = tokens;
    delete this.data.lastError;
    this.save();
    return tokens;
  }

  /** Làm mới access_token tự động bằng refresh_token khi sắp hết hạn. */
  async ensureAccessToken(): Promise<string> {
    const t = this.data.tokens;
    if (!t) throw Error('Chưa kết nối tài khoản Google. Hãy bấm «Đăng nhập Google (OAuth 2.0)».');
    if (t.accessToken && (!t.expiryDate || t.expiryDate - Date.now() > 60_000)) {
      return t.accessToken;
    }
    if (!t.refreshToken) {
      if (t.accessToken) return t.accessToken;
      throw Error('Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại.');
    }
    const clientId = this.data.config.clientId || (process.env.PVTA_GOOGLE_CLIENT_ID ?? '').trim();
    const clientSecret = this.data.config.clientSecret || (process.env.PVTA_GOOGLE_CLIENT_SECRET ?? '').trim() || undefined;
    if (!clientId) throw Error('Thiếu OAuth Client ID để làm mới phiên Google.');

    const body = new URLSearchParams({
      client_id: clientId,
      refresh_token: t.refreshToken,
      grant_type: 'refresh_token',
    });
    if (clientSecret) body.set('client_secret', clientSecret);

    const res = await this.f('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.access_token !== 'string') {
      const desc = typeof json.error_description === 'string' ? json.error_description : typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
      throw Error(`Không làm mới được phiên Google OAuth: ${desc}`);
    }
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    t.accessToken = json.access_token;
    t.expiryDate = Date.now() + expiresIn * 1000;
    if (typeof json.refresh_token === 'string') t.refreshToken = json.refresh_token;
    this.save();
    return t.accessToken;
  }

  private async apiRequest<T = any>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.ensureAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const res = await this.f(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const msg = json?.error?.message || json?.error_description || json?.error || `Lỗi Google API (HTTP ${res.status})`;
      // Gắn mã HTTP để bộ đồng bộ phân biệt 410 (mốc hết hạn) với 429/5xx (thử lại).
      throw Object.assign(Error(String(msg)), { status: res.status });
    }
    return json as T;
  }

  async listCalendars(): Promise<GoogleCalendarSummary[]> {
    const res = await this.apiRequest<{ items?: any[] }>('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50');
    const items = (res?.items ?? [])
      .filter(x => x && typeof x.id === 'string')
      .map((x): GoogleCalendarSummary => ({
        id: String(x.id),
        summary: String(x.summaryOverride || x.summary || x.id),
        primary: x.primary === true,
        backgroundColor: typeof x.backgroundColor === 'string' ? x.backgroundColor : undefined,
        accessRole: typeof x.accessRole === 'string' ? x.accessRole : undefined,
      }));
    this.data.calendars = items;
    if (
      this.data.selectedCalendarId !== ALL_CALENDARS_ID &&
      items.length &&
      !items.some(c => c.id === this.data.selectedCalendarId)
    ) {
      this.data.selectedCalendarId = ALL_CALENDARS_ID;
    }
    return items;
  }

  private async fetchEventsFromSingleCalendar(
    cal: GoogleCalendarSummary,
    timeMin: string,
    timeMax: string,
    maxResults: number
  ): Promise<GoogleCalendarEvent[]> {
    const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`);
    u.searchParams.set('singleEvents', 'true');
    u.searchParams.set('orderBy', 'startTime');
    u.searchParams.set('timeMin', timeMin);
    u.searchParams.set('timeMax', timeMax);
    u.searchParams.set('maxResults', String(maxResults));

    const res = await this.apiRequest<{ items?: any[] }>(u.toString());
    return (res?.items ?? [])
      .filter(x => x && typeof x.id === 'string' && x.status !== 'cancelled')
      .map((x): GoogleCalendarEvent => {
        const start = String(x.start?.dateTime || x.start?.date || '');
        const end = String(x.end?.dateTime || x.end?.date || start);
        const allDay = Boolean(x.start?.date && !x.start?.dateTime);
        const recurrence = Array.isArray(x.recurrence)
          ? x.recurrence.filter((r: unknown) => typeof r === 'string')
          : undefined;
        const remindersMinutes = Array.isArray(x.reminders?.overrides)
          ? x.reminders.overrides
              .map((o: any) => Number(o?.minutes))
              .filter((m: number) => Number.isFinite(m) && m >= 0)
          : undefined;
        const attendees = Array.isArray(x.attendees)
          ? x.attendees
              .map((a: any) => String(a?.email || '').trim())
              .filter(Boolean)
          : undefined;
        const conferenceLink =
          typeof x.hangoutLink === 'string'
            ? x.hangoutLink
            : Array.isArray(x.conferenceData?.entryPoints)
            ? x.conferenceData.entryPoints.find((ep: any) => typeof ep?.uri === 'string')?.uri
            : undefined;
        return {
          id: String(x.id),
          calendarId: cal.id,
          calendarSummary: cal.summary,
          calendarColor: cal.backgroundColor,
          colorId: typeof x.colorId === 'string' ? x.colorId : undefined,
          summary: String(x.summary || '(Không có tiêu đề)'),
          description: typeof x.description === 'string' ? x.description : undefined,
          location: typeof x.location === 'string' ? x.location : undefined,
          start,
          end,
          allDay,
          recurrence: recurrence?.length ? recurrence : undefined,
          recurringEventId: typeof x.recurringEventId === 'string' ? x.recurringEventId : undefined,
          remindersMinutes: remindersMinutes?.length ? remindersMinutes : undefined,
          attendees: attendees?.length ? attendees : undefined,
          conferenceLink,
          htmlLink: typeof x.htmlLink === 'string' ? x.htmlLink : undefined,
          status: typeof x.status === 'string' ? x.status : undefined,
        };
      });
  }

  async listEvents(options?: { calendarId?: string; timeMin?: string; timeMax?: string; maxResults?: number }): Promise<GoogleCalendarEvent[]> {
    const requestedId = options?.calendarId || this.data.selectedCalendarId || ALL_CALENDARS_ID;
    const now = new Date();
    const timeMin = options?.timeMin || new Date(now.getFullYear(), now.getMonth(), now.getDate() - 180).toISOString();
    const timeMax = options?.timeMax || new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180).toISOString();
    const maxResults = Math.min(250, Math.max(1, options?.maxResults ?? 250));

    let targets: GoogleCalendarSummary[];
    if (requestedId === ALL_CALENDARS_ID) {
      if (this.data.calendars.length) {
        targets = this.data.calendars;
      } else {
        targets = [{ id: 'primary', summary: 'Lịch chính', primary: true }];
      }
    } else {
      const found = this.data.calendars.find(c => c.id === requestedId);
      targets = [found ?? { id: requestedId, summary: requestedId }];
    }

    const settled = await Promise.allSettled(
      targets.map(cal => this.fetchEventsFromSingleCalendar(cal, timeMin, timeMax, maxResults))
    );

    const existingById = new Map<string, GoogleCalendarEvent>();
    for (const prev of this.data.events) {
      existingById.set(`${prev.calendarId}:${prev.id}`, prev);
      existingById.set(prev.id, prev);
    }
    const dirtyEventMap = new Map<string, SyncDirtyRecord>();
    for (const d of this.data.dirtyQueue ?? []) {
      if (d.kind === 'event') dirtyEventMap.set(d.id, d);
    }

    const mergedMap = new Map<string, GoogleCalendarEvent>();
    let firstError: unknown;
    let anySuccess = false;
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        anySuccess = true;
        for (const ev of r.value) {
          const dirty = dirtyEventMap.get(ev.id);
          if (dirty?.action === 'delete') continue;
          const prev = existingById.get(`${ev.calendarId}:${ev.id}`) ?? existingById.get(ev.id);
          if (dirty?.action === 'update' && prev) {
            mergedMap.set(`${prev.calendarId}:${prev.id}`, prev);
            continue;
          }
          const mergedEv: GoogleCalendarEvent = {
            ...ev,
            ...(prev?.attachments?.length ? { attachments: prev.attachments } : {}),
          };
          mergedMap.set(`${ev.calendarId}:${ev.id}`, mergedEv);
        }
      } else if (!firstError) {
        firstError = r.reason;
      }
    }

    if (!anySuccess && firstError) {
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
    }

    // Giữ lại các sự kiện cục bộ chưa đồng bộ (local-*) hoặc đang chờ cập nhật trong dirtyQueue
    for (const prev of this.data.events) {
      const key = `${prev.calendarId}:${prev.id}`;
      const dirty = dirtyEventMap.get(prev.id);
      if (dirty?.action === 'delete') continue;
      if ((prev.id.startsWith('local-') || dirty) && !mergedMap.has(key)) {
        if (requestedId === ALL_CALENDARS_ID || prev.calendarId === requestedId) {
          mergedMap.set(key, prev);
        }
      }
    }

    const events = [...mergedMap.values()].sort((a, b) => a.start.localeCompare(b.start));
    this.data.selectedCalendarId = requestedId;
    this.data.events = events;
    return events;
  }

  private resolveWritableCalendarId(calendarIdInput?: string): string {
    const raw = OPT_S(calendarIdInput, 200);
    if (raw && raw !== ALL_CALENDARS_ID) return raw;
    if (this.data.selectedCalendarId && this.data.selectedCalendarId !== ALL_CALENDARS_ID) {
      return this.data.selectedCalendarId;
    }
    const pri = this.data.calendars.find(c => c.primary) ?? this.data.calendars[0];
    return pri?.id || 'primary';
  }

  private isConnected(): boolean {
    return Boolean(this.data.tokens?.accessToken || this.data.tokens?.refreshToken);
  }

  /**
   * Tạo payload chuẩn cho Google Calendar API v3 (tuyệt đối loại bỏ trường `attachments` cục bộ
   * vì Google Calendar API v3 không cho phép tải trực tiếp tệp/ảnh nhị phân từ máy lên sự kiện).
   */
  private buildGoogleCalendarEventPayload(
    ev: {
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
    },
    isPatch = false
  ): Record<string, unknown> {
    const allDay = ev.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(ev.start);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
    const recurrence = Array.isArray(ev.recurrence)
      ? ev.recurrence.map(r => OPT_S(r, 400)).filter(Boolean)
      : undefined;

    let startObj: Record<string, unknown>;
    let endObj: Record<string, unknown>;
    if (allDay) {
      const startDate = ev.start.slice(0, 10);
      let endDate = ev.end ? ev.end.slice(0, 10) : '';
      if (!endDate || endDate <= startDate) {
        const d = new Date(`${startDate}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        endDate = d.toISOString().slice(0, 10);
      }
      startObj = isPatch ? { date: startDate, dateTime: null } : { date: startDate };
      endObj = isPatch ? { date: endDate, dateTime: null } : { date: endDate };
    } else {
      const startIso = new Date(ev.start).toISOString();
      const endIso = ev.end
        ? new Date(ev.end).toISOString()
        : new Date(new Date(ev.start).getTime() + 45 * 60_000).toISOString();
      startObj = {
        dateTime: startIso,
        ...(isPatch ? { date: null } : {}),
        ...(recurrence?.length ? { timeZone: tz } : {}),
      };
      endObj = {
        dateTime: endIso,
        ...(isPatch ? { date: null } : {}),
        ...(recurrence?.length ? { timeZone: tz } : {}),
      };
    }

    const payload: Record<string, unknown> = {
      summary: ev.summary,
      start: startObj,
      end: endObj,
    };
    if (isPatch || ev.location) payload.location = ev.location ?? '';
    if (isPatch || ev.description) payload.description = ev.description ?? '';
    if (ev.colorId !== undefined) payload.colorId = ev.colorId || (isPatch ? null : undefined);
    if (recurrence?.length) payload.recurrence = recurrence;
    else if (isPatch && ev.recurrence !== undefined) payload.recurrence = [];

    if (Array.isArray(ev.remindersMinutes)) {
      const validMins = ev.remindersMinutes.map(Number).filter(m => Number.isFinite(m) && m >= 0 && m <= 40320);
      payload.reminders = {
        useDefault: false,
        overrides: validMins.slice(0, 5).map(minutes => ({ method: 'popup', minutes })),
      };
    }
    if (Array.isArray(ev.attendees)) {
      const emails = ev.attendees.map(e => OPT_S(e, 200)).filter(e => e.includes('@'));
      if (emails.length || isPatch) {
        payload.attendees = emails.slice(0, 30).map(email => ({ email }));
      }
    }
    return payload;
  }

  async createEvent(input: {
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
    attachments?: WorkspaceLocalAttachment[];
    deferSync?: boolean;
  }): Promise<GoogleCalendarEvent> {
    const calendarId = this.resolveWritableCalendarId(input.calendarId);
    const summary = S(input.summary, 500);
    const startRaw = S(input.start, 60);
    const endRaw = OPT_S(input.end, 60);
    const allDay = input.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(startRaw);
    const recurrence = Array.isArray(input.recurrence)
      ? input.recurrence.map(r => OPT_S(r, 400)).filter(Boolean)
      : undefined;
    const remindersMinutes = Array.isArray(input.remindersMinutes)
      ? input.remindersMinutes.map(Number).filter(m => Number.isFinite(m) && m >= 0 && m <= 40320)
      : undefined;
    const attendees = Array.isArray(input.attendees)
      ? input.attendees.map(e => OPT_S(e, 200)).filter(e => e.includes('@'))
      : undefined;
    const attachments = sanitizeAttachments(input.attachments);
    const calMeta = this.data.calendars.find(c => c.id === calendarId);

    let normalizedStart = startRaw;
    let normalizedEnd = endRaw;
    if (allDay) {
      normalizedStart = startRaw.slice(0, 10);
      if (!normalizedEnd || normalizedEnd.slice(0, 10) <= normalizedStart) {
        const d = new Date(`${normalizedStart}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        normalizedEnd = d.toISOString().slice(0, 10);
      } else {
        normalizedEnd = normalizedEnd.slice(0, 10);
      }
    } else {
      normalizedStart = new Date(startRaw).toISOString();
      normalizedEnd = endRaw
        ? new Date(endRaw).toISOString()
        : new Date(new Date(startRaw).getTime() + 45 * 60_000).toISOString();
    }

    if (input.deferSync === true || !this.isConnected()) {
      const localId = `local-ev-${uid()}`;
      const now = Date.now();
      const localItem: GoogleCalendarEvent = {
        id: localId,
        calendarId,
        calendarSummary: calMeta?.summary,
        calendarColor: calMeta?.backgroundColor,
        colorId: OPT_S(input.colorId, 20) || undefined,
        summary,
        description: OPT_S(input.description, 4000) || undefined,
        location: OPT_S(input.location, 500) || undefined,
        start: normalizedStart,
        end: normalizedEnd,
        allDay,
        recurrence: recurrence?.length ? recurrence : undefined,
        remindersMinutes: remindersMinutes?.length ? remindersMinutes : undefined,
        attendees: attendees?.length ? attendees : undefined,
        ...(attachments ? { attachments } : {}),
        dirtyAction: 'create',
        localUpdatedAt: now,
      };
      this.data.events.push(localItem);
      this.data.events.sort((a, b) => a.start.localeCompare(b.start));
      this.enqueueDirty({
        kind: 'event',
        action: 'create',
        id: localId,
        calendarId,
        updatedAt: now,
      });
      this.save();
      return localItem;
    }

    const payload = this.buildGoogleCalendarEventPayload(
      {
        summary,
        start: startRaw,
        end: endRaw || undefined,
        allDay,
        location: OPT_S(input.location, 500) || undefined,
        description: OPT_S(input.description, 4000) || undefined,
        colorId: OPT_S(input.colorId, 20) || undefined,
        recurrence,
        remindersMinutes,
        attendees,
      },
      false
    );

    const created = await this.apiRequest<any>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    const createdId = String(created.id);
    await this.listEvents({ calendarId: this.data.selectedCalendarId });
    const createdItem: GoogleCalendarEvent = {
      id: createdId,
      calendarId,
      calendarSummary: calMeta?.summary,
      calendarColor: calMeta?.backgroundColor,
      colorId: typeof created.colorId === 'string' ? created.colorId : input.colorId || undefined,
      summary: String(created.summary || summary),
      description: created.description,
      location: created.location,
      start: String(created.start?.dateTime || created.start?.date || normalizedStart),
      end: String(created.end?.dateTime || created.end?.date || normalizedEnd),
      allDay,
      recurrence: Array.isArray(created.recurrence) ? created.recurrence : recurrence,
      remindersMinutes,
      attendees,
      htmlLink: created.htmlLink,
      status: created.status,
      ...(attachments ? { attachments } : {}),
    };
    if (attachments?.length) {
      const idx = this.data.events.findIndex(e => e.id === createdId && e.calendarId === calendarId);
      if (idx >= 0) {
        this.data.events[idx] = { ...this.data.events[idx]!, attachments };
      } else {
        this.data.events.push(createdItem);
        this.data.events.sort((a, b) => a.start.localeCompare(b.start));
      }
    }
    this.clearDirty('event', createdId);
    this.save();
    return createdItem;
  }

  /**
   * Cập nhật sự kiện / tiết dạy (tiêu đề, thời gian, địa điểm, ghi chú nội dung, màu sắc, lặp lại, nhắc hẹn, khách mời, tệp/ảnh đính kèm cục bộ).
   * Nếu `deferSync === true` hoặc đang ngoại tuyến, lưu ngay vào `calendar.json` và đưa vào hàng đợi đồng bộ tăng dần sau 30 giây.
   */
  async updateEvent(input: {
    calendarId?: string;
    targetCalendarId?: string;
    eventId: string;
    summary?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    location?: string;
    description?: string;
    colorId?: string;
    recurrence?: string[];
    remindersMinutes?: number[];
    attendees?: string[];
    attachments?: WorkspaceLocalAttachment[];
    deferSync?: boolean;
  }): Promise<GoogleCalendarEvent> {
    const eventId = S(input.eventId, 200);
    const existing = this.data.events.find(e => e.id === eventId && (!input.calendarId || e.calendarId === input.calendarId)) ??
      this.data.events.find(e => e.id === eventId);
    const sourceCalendarId =
      (OPT_S(input.calendarId, 200) && OPT_S(input.calendarId, 200) !== ALL_CALENDARS_ID
        ? OPT_S(input.calendarId, 200)
        : existing?.calendarId) || this.resolveWritableCalendarId(input.calendarId);
    const targetCalendarId =
      OPT_S(input.targetCalendarId, 200) && OPT_S(input.targetCalendarId, 200) !== ALL_CALENDARS_ID
        ? OPT_S(input.targetCalendarId, 200)
        : sourceCalendarId;

    const summary = input.summary !== undefined ? S(input.summary, 500) : existing?.summary ?? '(Không có tiêu đề)';
    const startRaw = input.start !== undefined ? S(input.start, 60) : existing?.start ?? new Date().toISOString();
    const endRaw = input.end !== undefined ? OPT_S(input.end, 60) : existing?.end ?? '';
    const allDay =
      input.allDay !== undefined
        ? input.allDay === true
        : Boolean(existing?.allDay || /^\d{4}-\d{2}-\d{2}$/.test(startRaw));
    const location = input.location !== undefined ? OPT_S(input.location, 500) : existing?.location ?? '';
    const description = input.description !== undefined ? OPT_S(input.description, 4000) : existing?.description ?? '';
    const colorId = input.colorId !== undefined ? OPT_S(input.colorId, 20) : existing?.colorId;
    const recurrence =
      input.recurrence !== undefined
        ? input.recurrence.map(r => OPT_S(r, 400)).filter(Boolean)
        : existing?.recurrence;
    const remindersMinutes =
      input.remindersMinutes !== undefined
        ? input.remindersMinutes.map(Number).filter(m => Number.isFinite(m) && m >= 0 && m <= 40320)
        : existing?.remindersMinutes;
    const attendees =
      input.attendees !== undefined
        ? input.attendees.map(e => OPT_S(e, 200)).filter(e => e.includes('@'))
        : existing?.attendees;
    const attachments =
      input.attachments !== undefined
        ? sanitizeAttachments(input.attachments)
        : existing?.attachments;

    if (targetCalendarId !== sourceCalendarId) {
      const moved = await this.createEvent({
        calendarId: targetCalendarId,
        summary,
        start: startRaw,
        end: endRaw || undefined,
        allDay,
        location: location || undefined,
        description: description || undefined,
        colorId: colorId || undefined,
        recurrence: recurrence?.length ? recurrence : undefined,
        remindersMinutes,
        attendees,
        attachments,
        deferSync: input.deferSync,
      });
      await this.deleteEvent(sourceCalendarId, eventId, { deferSync: input.deferSync }).catch(() => {});
      return moved;
    }

    let normalizedStart = startRaw;
    let normalizedEnd = endRaw;
    if (allDay) {
      normalizedStart = startRaw.slice(0, 10);
      if (!normalizedEnd || normalizedEnd.slice(0, 10) <= normalizedStart) {
        const d = new Date(`${normalizedStart}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        normalizedEnd = d.toISOString().slice(0, 10);
      } else {
        normalizedEnd = normalizedEnd.slice(0, 10);
      }
    } else {
      normalizedStart = new Date(startRaw).toISOString();
      normalizedEnd = endRaw
        ? new Date(endRaw).toISOString()
        : new Date(new Date(startRaw).getTime() + 45 * 60_000).toISOString();
    }

    const calMeta = this.data.calendars.find(c => c.id === sourceCalendarId);

    if (input.deferSync === true || !this.isConnected() || eventId.startsWith('local-')) {
      const now = Date.now();
      const isCreate = eventId.startsWith('local-') || existing?.dirtyAction === 'create';
      const localUpdated: GoogleCalendarEvent = {
        id: eventId,
        calendarId: sourceCalendarId,
        calendarSummary: existing?.calendarSummary ?? calMeta?.summary,
        calendarColor: existing?.calendarColor ?? calMeta?.backgroundColor,
        colorId: colorId || undefined,
        summary,
        description: description || undefined,
        location: location || undefined,
        start: normalizedStart,
        end: normalizedEnd,
        allDay,
        recurrence: recurrence?.length ? recurrence : undefined,
        recurringEventId: existing?.recurringEventId,
        remindersMinutes: remindersMinutes?.length ? remindersMinutes : undefined,
        attendees: attendees?.length ? attendees : undefined,
        conferenceLink: existing?.conferenceLink,
        htmlLink: existing?.htmlLink,
        status: existing?.status,
        ...(attachments?.length ? { attachments } : {}),
        dirtyAction: isCreate ? 'create' : 'update',
        localUpdatedAt: now,
      };
      const idx = this.data.events.findIndex(e => e.id === eventId && e.calendarId === sourceCalendarId);
      if (idx >= 0) this.data.events[idx] = localUpdated;
      else {
        const fallbackIdx = this.data.events.findIndex(e => e.id === eventId);
        if (fallbackIdx >= 0) this.data.events[fallbackIdx] = localUpdated;
        else this.data.events.push(localUpdated);
      }
      this.data.events.sort((a, b) => a.start.localeCompare(b.start));
      this.enqueueDirty({
        kind: 'event',
        action: isCreate ? 'create' : 'update',
        id: eventId,
        calendarId: sourceCalendarId,
        updatedAt: now,
      });
      this.save();
      return localUpdated;
    }

    const payload = this.buildGoogleCalendarEventPayload(
      {
        summary,
        start: startRaw,
        end: endRaw || undefined,
        allDay,
        location,
        description,
        colorId: input.colorId !== undefined ? colorId : undefined,
        recurrence: input.recurrence !== undefined ? recurrence ?? [] : undefined,
        remindersMinutes: input.remindersMinutes !== undefined ? remindersMinutes ?? [] : undefined,
        attendees: input.attendees !== undefined ? attendees ?? [] : undefined,
      },
      true
    );

    const targetEventId =
      input.recurrence !== undefined && input.recurrence.length > 0 && existing?.recurringEventId
        ? existing.recurringEventId
        : eventId;
    if (targetEventId !== eventId && input.recurrence !== undefined) {
      payload.recurrence = recurrence?.length ? recurrence : [];
    }

    const updated = await this.apiRequest<any>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(sourceCalendarId)}/events/${encodeURIComponent(targetEventId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );

    if (input.recurrence !== undefined) {
      await this.listEvents({ calendarId: this.data.selectedCalendarId }).catch(() => {});
    }

    const updatedItem: GoogleCalendarEvent = {
      id: String(updated?.id || eventId),
      calendarId: sourceCalendarId,
      calendarSummary: existing?.calendarSummary ?? calMeta?.summary,
      calendarColor: existing?.calendarColor ?? calMeta?.backgroundColor,
      colorId: typeof updated?.colorId === 'string' ? updated.colorId : colorId || undefined,
      summary: String(updated?.summary || summary),
      description:
        typeof updated?.description === 'string'
          ? updated.description || undefined
          : description || undefined,
      location:
        typeof updated?.location === 'string'
          ? updated.location || undefined
          : location || undefined,
      start: String(updated?.start?.dateTime || updated?.start?.date || normalizedStart),
      end: String(updated?.end?.dateTime || updated?.end?.date || normalizedEnd),
      allDay,
      recurrence: Array.isArray(updated?.recurrence) ? updated.recurrence : recurrence?.length ? recurrence : undefined,
      recurringEventId: typeof updated?.recurringEventId === 'string' ? updated.recurringEventId : existing?.recurringEventId,
      remindersMinutes: remindersMinutes?.length ? remindersMinutes : undefined,
      attendees: attendees?.length ? attendees : undefined,
      conferenceLink:
        typeof updated?.hangoutLink === 'string'
          ? updated.hangoutLink
          : Array.isArray(updated?.conferenceData?.entryPoints)
            ? updated.conferenceData.entryPoints.find((ep: any) => ep?.entryPointType === 'video')?.uri || existing?.conferenceLink
            : existing?.conferenceLink,
      htmlLink: typeof updated?.htmlLink === 'string' ? updated.htmlLink : existing?.htmlLink,
      status: typeof updated?.status === 'string' ? updated.status : existing?.status,
      ...(attachments?.length ? { attachments } : {}),
    };

    const idx = this.data.events.findIndex(e => e.id === eventId && e.calendarId === sourceCalendarId);
    if (idx >= 0) {
      this.data.events[idx] = updatedItem;
    } else {
      const fallbackIdx = this.data.events.findIndex(e => e.id === eventId);
      if (fallbackIdx >= 0) this.data.events[fallbackIdx] = updatedItem;
      else this.data.events.push(updatedItem);
    }
    this.data.events.sort((a, b) => a.start.localeCompare(b.start));
    this.clearDirty('event', eventId);
    this.save();
    return updatedItem;
  }

  async deleteEvent(
    calendarIdInput: string | undefined,
    eventIdInput: string,
    options?: { deferSync?: boolean }
  ): Promise<boolean> {
    const eventId = S(eventIdInput, 200);
    const existing = this.data.events.find(e => e.id === eventId);
    const calendarId =
      (OPT_S(calendarIdInput, 200) && OPT_S(calendarIdInput, 200) !== ALL_CALENDARS_ID
        ? OPT_S(calendarIdInput, 200)
        : existing?.calendarId) || this.resolveWritableCalendarId(calendarIdInput);

    if (eventId.startsWith('local-')) {
      this.data.events = this.data.events.filter(e => !(e.id === eventId && e.calendarId === calendarId));
      this.clearDirty('event', eventId);
      this.save();
      return true;
    }

    if (options?.deferSync === true || !this.isConnected()) {
      this.data.events = this.data.events.filter(e => !(e.id === eventId && e.calendarId === calendarId));
      this.enqueueDirty({
        kind: 'event',
        action: 'delete',
        id: eventId,
        calendarId,
        updatedAt: Date.now(),
      });
      this.save();
      return true;
    }

    await this.apiRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    );
    this.data.events = this.data.events.filter(e => !(e.id === eventId && e.calendarId === calendarId));
    this.clearDirty('event', eventId);
    this.save();
    return true;
  }

  async listTaskLists(): Promise<GoogleTaskListSummary[]> {
    const res = await this.apiRequest<{ items?: any[] }>('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=50');
    const items = (res?.items ?? [])
      .filter(x => x && typeof x.id === 'string')
      .map((x): GoogleTaskListSummary => ({
        id: String(x.id),
        title: String(x.title || 'Danh sách việc cần làm'),
        updated: typeof x.updated === 'string' ? x.updated : undefined,
      }));
    this.data.tasklists = items;
    if (
      this.data.selectedTasklistId !== ALL_TASKLISTS_ID &&
      items.length &&
      !items.some(l => l.id === this.data.selectedTasklistId)
    ) {
      this.data.selectedTasklistId = ALL_TASKLISTS_ID;
    }
    return items;
  }

  private async fetchTasksFromSingleList(
    list: GoogleTaskListSummary,
    showCompleted: boolean
  ): Promise<GoogleTaskItem[]> {
    const u = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks`);
    u.searchParams.set('showCompleted', showCompleted ? 'true' : 'false');
    u.searchParams.set('showHidden', 'true');
    u.searchParams.set('maxResults', '100');

    const res = await this.apiRequest<{ items?: any[] }>(u.toString());
    return (res?.items ?? [])
      .filter(x => x && typeof x.id === 'string' && !x.deleted && String(x.title ?? '').trim())
      .map((x): GoogleTaskItem => ({
        id: String(x.id),
        tasklistId: list.id,
        tasklistTitle: list.title,
        title: String(x.title),
        notes: typeof x.notes === 'string' ? x.notes : undefined,
        status: x.status === 'completed' ? 'completed' : 'needsAction',
        due: typeof x.due === 'string' ? x.due : undefined,
        completed: typeof x.completed === 'string' ? x.completed : undefined,
        updated: typeof x.updated === 'string' ? x.updated : undefined,
        webViewLink: typeof x.webViewLink === 'string' ? x.webViewLink : undefined,
      }));
  }

  async listTasks(options?: { tasklistId?: string; showCompleted?: boolean }): Promise<GoogleTaskItem[]> {
    const requestedId = options?.tasklistId || this.data.selectedTasklistId || ALL_TASKLISTS_ID;
    const showCompleted = options?.showCompleted !== false;

    let targets: GoogleTaskListSummary[];
    if (requestedId === ALL_TASKLISTS_ID) {
      if (this.data.tasklists.length) {
        targets = this.data.tasklists;
      } else {
        targets = [{ id: '@default', title: 'Danh sách mặc định' }];
      }
    } else {
      const found = this.data.tasklists.find(l => l.id === requestedId);
      targets = [found ?? { id: requestedId, title: requestedId }];
    }

    const settled = await Promise.allSettled(
      targets.map(list => this.fetchTasksFromSingleList(list, showCompleted))
    );

    const existingById = new Map<string, GoogleTaskItem>();
    for (const prev of this.data.tasks) {
      existingById.set(`${prev.tasklistId}:${prev.id}`, prev);
      existingById.set(prev.id, prev);
    }
    const dirtyTaskMap = new Map<string, SyncDirtyRecord>();
    for (const d of this.data.dirtyQueue ?? []) {
      if (d.kind === 'task') dirtyTaskMap.set(d.id, d);
    }

    const mergedMap = new Map<string, GoogleTaskItem>();
    let firstError: unknown;
    let anySuccess = false;
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        anySuccess = true;
        for (const item of r.value) {
          const dirty = dirtyTaskMap.get(item.id);
          if (dirty?.action === 'delete') continue;
          const prev = existingById.get(`${item.tasklistId}:${item.id}`) ?? existingById.get(item.id);
          if (dirty?.action === 'update' && prev) {
            mergedMap.set(`${prev.tasklistId}:${prev.id}`, prev);
            continue;
          }
          mergedMap.set(`${item.tasklistId}:${item.id}`, {
            ...item,
            ...(prev?.attachments?.length ? { attachments: prev.attachments } : {}),
          });
        }
      } else if (!firstError) {
        firstError = r.reason;
      }
    }

    if (!anySuccess && firstError) {
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
    }

    for (const prev of this.data.tasks) {
      const key = `${prev.tasklistId}:${prev.id}`;
      const dirty = dirtyTaskMap.get(prev.id);
      if (dirty?.action === 'delete') continue;
      if ((prev.id.startsWith('local-') || dirty) && !mergedMap.has(key)) {
        if (requestedId === ALL_TASKLISTS_ID || prev.tasklistId === requestedId) {
          mergedMap.set(key, prev);
        }
      }
    }

    const tasks = [...mergedMap.values()];
    this.data.selectedTasklistId = requestedId;
    this.data.tasks = tasks;
    return tasks;
  }

  private resolveWritableTasklistId(tasklistIdInput?: string): string {
    const raw = OPT_S(tasklistIdInput, 200);
    if (raw && raw !== ALL_TASKLISTS_ID) return raw;
    if (this.data.selectedTasklistId && this.data.selectedTasklistId !== ALL_TASKLISTS_ID) {
      return this.data.selectedTasklistId;
    }
    return this.data.tasklists[0]?.id || '@default';
  }

  async createTask(input: {
    tasklistId?: string;
    title: string;
    notes?: string;
    due?: string;
    attachments?: WorkspaceLocalAttachment[];
    deferSync?: boolean;
  }): Promise<GoogleTaskItem> {
    const tasklistId = this.resolveWritableTasklistId(input.tasklistId);
    const title = S(input.title, 500);
    const notesStr = input.notes ? OPT_S(input.notes, 4000) : undefined;
    const attachments = sanitizeAttachments(input.attachments);
    const listMeta = this.data.tasklists.find(l => l.id === tasklistId);

    let normalizedDue: string | undefined;
    if (input.due) {
      const dueStr = OPT_S(input.due, 60);
      if (dueStr) {
        normalizedDue = /^\d{4}-\d{2}-\d{2}$/.test(dueStr) ? `${dueStr}T00:00:00.000Z` : new Date(dueStr).toISOString();
      }
    }

    if (input.deferSync === true || !this.isConnected()) {
      const localId = `local-task-${uid()}`;
      const now = Date.now();
      const localTask: GoogleTaskItem = {
        id: localId,
        tasklistId,
        tasklistTitle: listMeta?.title,
        title,
        notes: notesStr,
        status: 'needsAction',
        due: normalizedDue,
        updated: new Date(now).toISOString(),
        ...(attachments?.length ? { attachments } : {}),
        dirtyAction: 'create',
        localUpdatedAt: now,
      };
      this.data.tasks = [localTask, ...this.data.tasks];
      this.enqueueDirty({
        kind: 'task',
        action: 'create',
        id: localId,
        tasklistId,
        updatedAt: now,
      });
      this.save();
      return localTask;
    }

    // Google Tasks API v1 không hỗ trợ đính kèm tệp nhị phân trực tiếp, chỉ gửi title/notes/due
    const payload: Record<string, unknown> = { title };
    if (notesStr) payload.notes = notesStr;
    if (normalizedDue) payload.due = normalizedDue;

    const created = await this.apiRequest<any>(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    const createdId = String(created.id);
    await this.listTasks({ tasklistId: this.data.selectedTasklistId });
    const createdItem: GoogleTaskItem = {
      id: createdId,
      tasklistId,
      tasklistTitle: listMeta?.title,
      title: String(created.title || title),
      notes: created.notes ?? notesStr,
      status: created.status === 'completed' ? 'completed' : 'needsAction',
      due: created.due ?? normalizedDue,
      updated: created.updated,
      ...(attachments?.length ? { attachments } : {}),
    };
    if (attachments?.length) {
      const idx = this.data.tasks.findIndex(t => t.id === createdId && t.tasklistId === tasklistId);
      if (idx >= 0) {
        this.data.tasks[idx] = { ...this.data.tasks[idx]!, attachments };
      } else {
        this.data.tasks.unshift(createdItem);
      }
    }
    this.clearDirty('task', createdId);
    this.save();
    return createdItem;
  }

  async toggleTask(input: {
    tasklistId?: string;
    taskId: string;
    completed: boolean;
    deferSync?: boolean;
  }): Promise<GoogleTaskItem> {
    const taskId = S(input.taskId, 200);
    const existing = this.data.tasks.find(t => t.id === taskId);
    const tasklistId =
      (OPT_S(input.tasklistId, 200) && OPT_S(input.tasklistId, 200) !== ALL_TASKLISTS_ID
        ? OPT_S(input.tasklistId, 200)
        : existing?.tasklistId) || this.resolveWritableTasklistId(input.tasklistId);
    const status = input.completed ? 'completed' : 'needsAction';
    const completedIso = input.completed ? new Date().toISOString() : undefined;

    if (input.deferSync === true || !this.isConnected() || taskId.startsWith('local-')) {
      const now = Date.now();
      const isCreate = taskId.startsWith('local-') || existing?.dirtyAction === 'create';
      const localUpdated: GoogleTaskItem = {
        id: taskId,
        tasklistId,
        tasklistTitle: existing?.tasklistTitle,
        title: existing?.title || 'Công việc',
        notes: existing?.notes,
        status,
        due: existing?.due,
        completed: completedIso,
        updated: new Date(now).toISOString(),
        ...(existing?.attachments?.length ? { attachments: existing.attachments } : {}),
        dirtyAction: isCreate ? 'create' : 'update',
        localUpdatedAt: now,
      };
      const idx = this.data.tasks.findIndex(t => t.id === taskId);
      if (idx >= 0) this.data.tasks[idx] = localUpdated;
      else this.data.tasks.unshift(localUpdated);
      this.enqueueDirty({
        kind: 'task',
        action: isCreate ? 'create' : 'update',
        id: taskId,
        tasklistId,
        updatedAt: now,
      });
      this.save();
      return localUpdated;
    }

    const payload: Record<string, unknown> = {
      id: taskId,
      status,
      completed: completedIso ?? null,
    };
    const updated = await this.apiRequest<any>(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    await this.listTasks({ tasklistId: this.data.selectedTasklistId });
    this.clearDirty('task', taskId);
    this.save();
    return {
      id: String(updated.id || taskId),
      tasklistId,
      title: String(updated.title || existing?.title || ''),
      notes: updated.notes ?? existing?.notes,
      status: updated.status === 'completed' ? 'completed' : 'needsAction',
      due: updated.due ?? existing?.due,
      completed: updated.completed,
      updated: updated.updated,
      ...(existing?.attachments?.length ? { attachments: existing.attachments } : {}),
    };
  }

  /**
   * Cập nhật công việc (tên, hạn hoàn thành, ghi chú chi tiết, tệp/ảnh đính kèm cục bộ, hoặc chuyển danh sách).
   */
  async updateTask(input: {
    tasklistId?: string;
    targetTasklistId?: string;
    taskId: string;
    title?: string;
    notes?: string;
    due?: string;
    completed?: boolean;
    attachments?: WorkspaceLocalAttachment[];
    deferSync?: boolean;
  }): Promise<GoogleTaskItem> {
    const taskId = S(input.taskId, 200);
    const existing =
      this.data.tasks.find(t => t.id === taskId && (!input.tasklistId || t.tasklistId === input.tasklistId)) ??
      this.data.tasks.find(t => t.id === taskId);
    const sourceTasklistId =
      (OPT_S(input.tasklistId, 200) && OPT_S(input.tasklistId, 200) !== ALL_TASKLISTS_ID
        ? OPT_S(input.tasklistId, 200)
        : existing?.tasklistId) || this.resolveWritableTasklistId(input.tasklistId);
    const targetTasklistId =
      OPT_S(input.targetTasklistId, 200) && OPT_S(input.targetTasklistId, 200) !== ALL_TASKLISTS_ID
        ? OPT_S(input.targetTasklistId, 200)
        : sourceTasklistId;

    const title = input.title !== undefined ? S(input.title, 500) : existing?.title ?? 'Công việc';
    const notes = input.notes !== undefined ? OPT_S(input.notes, 4000) : existing?.notes ?? '';
    const dueRaw = input.due !== undefined ? OPT_S(input.due, 60) : existing?.due ?? '';
    const isCompleted =
      input.completed !== undefined ? input.completed === true : existing?.status === 'completed';
    const attachments =
      input.attachments !== undefined
        ? sanitizeAttachments(input.attachments)
        : existing?.attachments;

    if (targetTasklistId !== sourceTasklistId) {
      const moved = await this.createTask({
        tasklistId: targetTasklistId,
        title,
        notes: notes || undefined,
        due: dueRaw || undefined,
        attachments,
        deferSync: input.deferSync,
      });
      if (isCompleted) {
        await this.toggleTask({
          tasklistId: targetTasklistId,
          taskId: moved.id,
          completed: true,
          deferSync: input.deferSync,
        }).catch(() => {});
      }
      await this.deleteTask(sourceTasklistId, taskId, { deferSync: input.deferSync }).catch(() => {});
      return moved;
    }

    let normalizedDue: string | undefined;
    if (dueRaw) {
      normalizedDue = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw)
        ? `${dueRaw}T00:00:00.000Z`
        : new Date(dueRaw).toISOString();
    }

    if (input.deferSync === true || !this.isConnected() || taskId.startsWith('local-')) {
      const now = Date.now();
      const isCreate = taskId.startsWith('local-') || existing?.dirtyAction === 'create';
      const localUpdated: GoogleTaskItem = {
        id: taskId,
        tasklistId: sourceTasklistId,
        tasklistTitle: existing?.tasklistTitle,
        title,
        notes: notes || undefined,
        status: isCompleted ? 'completed' : 'needsAction',
        due: normalizedDue,
        completed: isCompleted ? existing?.completed || new Date(now).toISOString() : undefined,
        updated: new Date(now).toISOString(),
        ...(attachments?.length ? { attachments } : {}),
        dirtyAction: isCreate ? 'create' : 'update',
        localUpdatedAt: now,
      };
      const idx = this.data.tasks.findIndex(t => t.id === taskId && t.tasklistId === sourceTasklistId);
      if (idx >= 0) this.data.tasks[idx] = localUpdated;
      else {
        const fallbackIdx = this.data.tasks.findIndex(t => t.id === taskId);
        if (fallbackIdx >= 0) this.data.tasks[fallbackIdx] = localUpdated;
        else this.data.tasks.unshift(localUpdated);
      }
      this.enqueueDirty({
        kind: 'task',
        action: isCreate ? 'create' : 'update',
        id: taskId,
        tasklistId: sourceTasklistId,
        updatedAt: now,
      });
      this.save();
      return localUpdated;
    }

    // Tuyệt đối không gửi `attachments` lên Google Tasks API v1
    const payload: Record<string, unknown> = {
      id: taskId,
      title,
      notes,
      status: isCompleted ? 'completed' : 'needsAction',
      completed: isCompleted ? existing?.completed || new Date().toISOString() : null,
    };
    if (input.due !== undefined) {
      payload.due = normalizedDue ?? null;
    }

    const updated = await this.apiRequest<any>(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(sourceTasklistId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
    await this.listTasks({ tasklistId: this.data.selectedTasklistId });
    const updatedItem: GoogleTaskItem = {
      id: String(updated?.id || taskId),
      tasklistId: sourceTasklistId,
      tasklistTitle: existing?.tasklistTitle,
      title: String(updated?.title || title),
      notes: typeof updated?.notes === 'string' ? updated.notes || undefined : notes || undefined,
      status: updated?.status === 'completed' ? 'completed' : 'needsAction',
      due: typeof updated?.due === 'string' ? updated.due : normalizedDue,
      completed: typeof updated?.completed === 'string' ? updated.completed : undefined,
      updated: typeof updated?.updated === 'string' ? updated.updated : new Date().toISOString(),
      ...(attachments?.length ? { attachments } : {}),
    };
    if (attachments !== undefined) {
      const idx = this.data.tasks.findIndex(t => t.id === updatedItem.id && t.tasklistId === sourceTasklistId);
      if (idx >= 0) {
        this.data.tasks[idx] = {
          ...this.data.tasks[idx]!,
          ...(attachments?.length ? { attachments } : { attachments: undefined }),
        };
      }
    }
    this.clearDirty('task', taskId);
    this.save();
    return updatedItem;
  }

  async deleteTask(
    tasklistIdInput: string | undefined,
    taskIdInput: string,
    options?: { deferSync?: boolean }
  ): Promise<boolean> {
    const taskId = S(taskIdInput, 200);
    const existing = this.data.tasks.find(t => t.id === taskId);
    const tasklistId =
      (OPT_S(tasklistIdInput, 200) && OPT_S(tasklistIdInput, 200) !== ALL_TASKLISTS_ID
        ? OPT_S(tasklistIdInput, 200)
        : existing?.tasklistId) || this.resolveWritableTasklistId(tasklistIdInput);

    if (taskId.startsWith('local-')) {
      this.data.tasks = this.data.tasks.filter(t => !(t.id === taskId && t.tasklistId === tasklistId));
      this.clearDirty('task', taskId);
      this.save();
      return true;
    }

    if (options?.deferSync === true || !this.isConnected()) {
      this.data.tasks = this.data.tasks.filter(t => !(t.id === taskId && t.tasklistId === tasklistId));
      this.enqueueDirty({
        kind: 'task',
        action: 'delete',
        id: taskId,
        tasklistId,
        updatedAt: Date.now(),
      });
      this.save();
      return true;
    }

    await this.apiRequest(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' }
    );
    this.data.tasks = this.data.tasks.filter(t => !(t.id === taskId && t.tasklistId === tasklistId));
    this.clearDirty('task', taskId);
    this.save();
    return true;
  }

  /**
   * Đảm bảo có thư mục riêng `PVTA Ghi chú (Notes)` trên Google Drive để lưu trữ ghi chú của giáo viên.
   */
  async ensureNotesFolder(): Promise<string> {
    if (this.data.notesFolderId) return this.data.notesFolderId;
    const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${GOOGLE_NOTES_FOLDER_NAME}' and trashed = false`;
    const u = new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q', q);
    u.searchParams.set('fields', 'files(id,name)');
    u.searchParams.set('pageSize', '5');
    const found = await this.apiRequest<{ files?: Array<{ id?: string }> }>(u.toString());
    const existingId = found?.files?.find(f => typeof f.id === 'string')?.id;
    if (existingId) {
      this.data.notesFolderId = existingId;
      return existingId;
    }
    const created = await this.apiRequest<{ id?: string }>('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      body: JSON.stringify({
        name: GOOGLE_NOTES_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: { pvtaKind: 'notes-folder' },
      }),
    });
    const folderId = String(created?.id || 'root');
    this.data.notesFolderId = folderId;
    return folderId;
  }

  /**
   * Đồng bộ Sổ tay Ghi chú từ Google Keep API v1 (nếu tài khoản Google Workspace cấp quyền)
   * và từ thư mục `PVTA Ghi chú (Notes)` trên Google Drive API v3 (kèm lưu dự phòng cục bộ trên máy).
   */
  async listNotes(): Promise<GoogleNoteItem[]> {
    const merged = new Map<string, GoogleNoteItem>();
    const dirtyNoteMap = new Map<string, SyncDirtyRecord>();
    for (const d of this.data.dirtyQueue ?? []) {
      if (d.kind === 'note') dirtyNoteMap.set(d.id, d);
    }

    // 1. Thử đọc từ Google Keep API v1 (chỉ gọi khi đã cấp scope Keep hoặc đặt PVTA_GOOGLE_KEEP=1)
    const tokenScope = this.data.tokens?.scope ?? '';
    const canTryKeep =
      process.env.PVTA_GOOGLE_KEEP === '1' ||
      tokenScope.includes(GOOGLE_KEEP_SCOPE) ||
      !tokenScope;
    if (canTryKeep) {
      try {
        const keepRes = await this.apiRequest<{ notes?: any[] }>('https://keep.googleapis.com/v1/notes?pageSize=50');
        for (const raw of keepRes?.notes ?? []) {
          if (!raw || raw.trashed) continue;
          const id = String(raw.name || raw.id || uid());
          const dirty = dirtyNoteMap.get(id);
          if (dirty?.action === 'delete') continue;
          const existing = this.data.notes.find(n => n.id === id);
          if (dirty?.action === 'update' && existing) {
            merged.set(id, existing);
            continue;
          }
          const title = String(raw.title || existing?.title || '(Ghi chú Keep)');
          const textBody = typeof raw.body?.text?.text === 'string'
            ? raw.body.text.text
            : Array.isArray(raw.body?.list?.listItems)
            ? raw.body.list.listItems.map((li: any) => `${li.checked ? '[x]' : '[ ]'} ${li.text?.text ?? ''}`).join('\n')
            : existing?.content ?? '';
          merged.set(id, {
            id,
            title,
            content: textBody,
            color: existing?.color ?? 'yellow',
            pinned: existing?.pinned ?? false,
            tags: existing?.tags?.length ? existing.tags : ['Google Keep'],
            source: 'keep',
            updated: String(raw.updateTime || raw.createTime || existing?.updated || new Date().toISOString()),
            ...(existing?.attachments?.length ? { attachments: existing.attachments } : {}),
          });
        }
      } catch {
        /* Tài khoản Gmail cá nhân hoặc chưa bật Keep API sẽ tự động dùng Google Drive / lưu cục bộ */
      }
    }

    // 2. Đọc các ghi chú từ Google Drive API v3 (thư mục PVTA Ghi chú)
    try {
      const q = `appProperties has { key='pvtaKind' and value='note' } and trashed = false`;
      const u = new URL('https://www.googleapis.com/drive/v3/files');
      u.searchParams.set('q', q);
      u.searchParams.set('pageSize', '100');
      u.searchParams.set('orderBy', 'modifiedTime desc');
      u.searchParams.set('fields', 'files(id,name,description,modifiedTime,webViewLink,appProperties)');

      const driveRes = await this.apiRequest<{ files?: any[] }>(u.toString());
      for (const f of driveRes?.files ?? []) {
        if (!f || typeof f.id !== 'string') continue;
        const dirty = dirtyNoteMap.get(f.id);
        if (dirty?.action === 'delete') continue;
        const existing = this.data.notes.find(n => n.id === f.id);
        if (dirty?.action === 'update' && existing) {
          merged.set(f.id, existing);
          continue;
        }
        const props = (f.appProperties ?? {}) as Record<string, string>;
        const rawTitle = String(f.name || 'Ghi chú').replace(/\.(md|txt)$/i, '');
        const colorRaw = String(props.pvtaColor || 'yellow') as GoogleNoteColor;
        const validColors: GoogleNoteColor[] = ['default', 'yellow', 'green', 'blue', 'purple', 'pink'];
        const color: GoogleNoteColor = validColors.includes(colorRaw) ? colorRaw : 'yellow';
        const tags = String(props.pvtaTags || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        merged.set(f.id, {
          id: String(f.id),
          title: rawTitle,
          content: typeof f.description === 'string' && f.description ? f.description : existing?.content ?? '',
          color,
          pinned: props.pvtaPinned === 'true',
          tags: tags.length ? tags : existing?.tags ?? [],
          source: 'drive',
          updated: String(f.modifiedTime || new Date().toISOString()),
          webViewLink: typeof f.webViewLink === 'string' ? f.webViewLink : undefined,
          ...(existing?.attachments?.length ? { attachments: existing.attachments } : {}),
        });
      }
    } catch {
      /* Giữ nguyên các ghi chú đã lưu cục bộ nếu chưa bật Drive API hoặc chưa cấp scope Drive */
      for (const n of this.data.notes) {
        if (dirtyNoteMap.get(n.id)?.action === 'delete') continue;
        if (!merged.has(n.id)) merged.set(n.id, n);
      }
    }

    // Luôn giữ lại các ghi chú local hoặc ghi chú đang nằm trong hàng đợi đồng bộ tăng dần
    for (const n of this.data.notes) {
      if (dirtyNoteMap.get(n.id)?.action === 'delete') continue;
      if ((n.source === 'local' || dirtyNoteMap.has(n.id)) && !merged.has(n.id)) {
        merged.set(n.id, n);
      }
    }

    const list = [...merged.values()].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated.localeCompare(a.updated)
    );
    this.data.notes = list;
    return list;
  }

  /**
   * Tạo ghi chú mới: hỗ trợ lưu tức thì vào `notes.json` (kèm tệp/ảnh đính kèm cục bộ)
   * và đồng bộ lên Google Drive (ngay lập tức hoặc sau 30 giây không tương tác).
   */
  async createNote(input: {
    title: string;
    content?: string;
    color?: GoogleNoteColor;
    pinned?: boolean;
    tags?: string[];
    attachments?: WorkspaceLocalAttachment[];
    deferSync?: boolean;
  }): Promise<GoogleNoteItem> {
    const title = S(input.title, 300);
    const content = OPT_S(input.content, 20_000);
    const validColors: GoogleNoteColor[] = ['default', 'yellow', 'green', 'blue', 'purple', 'pink'];
    const color: GoogleNoteColor = input.color && validColors.includes(input.color) ? input.color : 'yellow';
    const pinned = input.pinned === true;
    const tags = Array.isArray(input.tags)
      ? input.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10)
      : [];
    const attachments = sanitizeAttachments(input.attachments);

    let noteId = `local-${uid()}`;
    let source: GoogleNoteItem['source'] = 'local';
    let updated = new Date().toISOString();
    let webViewLink: string | undefined;

    if (input.deferSync === true || !this.isConnected()) {
      const now = Date.now();
      const item: GoogleNoteItem = {
        id: noteId,
        title,
        content,
        color,
        pinned,
        tags,
        source: 'local',
        updated,
        ...(attachments?.length ? { attachments } : {}),
        dirtyAction: 'create',
        localUpdatedAt: now,
      };
      this.data.notes = [item, ...this.data.notes.filter(n => n.id !== noteId)].sort(
        (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated.localeCompare(a.updated)
      );
      this.enqueueDirty({
        kind: 'note',
        action: 'create',
        id: noteId,
        updatedAt: now,
      });
      this.save();
      return item;
    }

    if (this.isConnected()) {
      try {
        const folderId = await this.ensureNotesFolder();
        const metadata = {
          name: `${title}.md`,
          mimeType: 'text/markdown',
          parents: folderId && folderId !== 'root' ? [folderId] : undefined,
          description: truncateUtf8(content, 12_000),
          appProperties: {
            pvtaKind: 'note',
            pvtaColor: color,
            pvtaPinned: pinned ? 'true' : 'false',
            pvtaTags: buildDriveTagsProp(tags),
          },
        };

        const created = await this.apiRequest<any>(
          'https://www.googleapis.com/drive/v3/files?fields=id,name,description,modifiedTime,webViewLink,appProperties',
          {
            method: 'POST',
            body: JSON.stringify(metadata),
          }
        );

        if (created?.id) {
          noteId = String(created.id);
          source = 'drive';
          updated = String(created.modifiedTime || updated);
          webViewLink = typeof created.webViewLink === 'string' ? created.webViewLink : undefined;
          if (content) {
            await this.apiRequest(
              `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(noteId)}?uploadType=media`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
                body: `# ${title}\n\n${content}\n`,
              }
            ).catch(() => {});
          }
        }
      } catch {
        /* Fallback lưu cục bộ trên máy khi chưa bật Google Drive API hoặc token cũ thiếu scope drive.file */
      }
    }

    const item: GoogleNoteItem = {
      id: noteId,
      title,
      content,
      color,
      pinned,
      tags,
      source,
      updated,
      webViewLink,
      ...(attachments?.length ? { attachments } : {}),
    };

    this.data.notes = [item, ...this.data.notes.filter(n => n.id !== noteId)].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated.localeCompare(a.updated)
    );
    this.clearDirty('note', noteId);
    this.save();
    return item;
  }

  /**
   * Cập nhật ghi chú (tiêu đề, nội dung, màu sắc, ghim, nhãn, tệp/ảnh đính kèm cục bộ) trên Google Drive / Keep / Local.
   */
  async updateNote(input: {
    noteId: string;
    title?: string;
    content?: string;
    color?: GoogleNoteColor;
    pinned?: boolean;
    tags?: string[];
    attachments?: WorkspaceLocalAttachment[];
    deferSync?: boolean;
  }): Promise<GoogleNoteItem> {
    const noteId = S(input.noteId, 200);
    const existing = this.data.notes.find(n => n.id === noteId);
    const title = input.title !== undefined ? S(input.title, 300) : existing?.title ?? 'Ghi chú';
    const content = input.content !== undefined ? OPT_S(input.content, 20_000) : existing?.content ?? '';
    const validColors: GoogleNoteColor[] = ['default', 'yellow', 'green', 'blue', 'purple', 'pink'];
    const color: GoogleNoteColor =
      input.color && validColors.includes(input.color) ? input.color : existing?.color ?? 'yellow';
    const pinned = input.pinned !== undefined ? input.pinned === true : Boolean(existing?.pinned);
    const tags = Array.isArray(input.tags)
      ? input.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10)
      : existing?.tags ?? [];
    const attachments =
      input.attachments !== undefined
        ? sanitizeAttachments(input.attachments)
        : existing?.attachments;

    const source = existing?.source ?? (noteId.startsWith('notes/') ? 'keep' : noteId.startsWith('local-') ? 'local' : 'drive');
    let updatedTime = new Date().toISOString();
    let webViewLink = existing?.webViewLink;

    if (input.deferSync === true || !this.isConnected() || noteId.startsWith('local-')) {
      const now = Date.now();
      const isCreate = noteId.startsWith('local-') || existing?.dirtyAction === 'create';
      const item: GoogleNoteItem = {
        id: noteId,
        title,
        content,
        color,
        pinned,
        tags,
        source,
        updated: updatedTime,
        webViewLink,
        ...(attachments?.length ? { attachments } : {}),
        dirtyAction: isCreate ? 'create' : 'update',
        localUpdatedAt: now,
      };
      this.data.notes = [item, ...this.data.notes.filter(n => n.id !== noteId)].sort(
        (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated.localeCompare(a.updated)
      );
      this.enqueueDirty({
        kind: 'note',
        action: isCreate ? 'create' : 'update',
        id: noteId,
        updatedAt: now,
      });
      this.save();
      return item;
    }

    if (source === 'drive' && this.isConnected()) {
      try {
        const metadata = {
          name: `${title}.md`,
          description: truncateUtf8(content, 12_000),
          appProperties: {
            pvtaKind: 'note',
            pvtaColor: color,
            pvtaPinned: pinned ? 'true' : 'false',
            pvtaTags: buildDriveTagsProp(tags),
          },
        };

        const updated = await this.apiRequest<any>(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(noteId)}?fields=id,name,description,modifiedTime,webViewLink,appProperties`,
          {
            method: 'PATCH',
            body: JSON.stringify(metadata),
          }
        );
        if (updated?.modifiedTime) updatedTime = String(updated.modifiedTime);
        if (typeof updated?.webViewLink === 'string') webViewLink = updated.webViewLink;

        if (input.content !== undefined) {
          await this.apiRequest(
            `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(noteId)}?uploadType=media`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
              body: `# ${title}\n\n${content}\n`,
            }
          ).catch(() => {});
        }
      } catch {
        /* Cho phép cập nhật trạng thái ghim, màu sắc, nội dung cục bộ ngay cả khi ngoại tuyến hoặc lỗi Drive API */
      }
    }

    const item: GoogleNoteItem = {
      id: noteId,
      title,
      content,
      color,
      pinned,
      tags,
      source,
      updated: updatedTime,
      webViewLink,
      ...(attachments?.length ? { attachments } : {}),
    };

    this.data.notes = [item, ...this.data.notes.filter(n => n.id !== noteId)].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated.localeCompare(a.updated)
    );
    this.clearDirty('note', noteId);
    this.save();
    return item;
  }

  /**
   * Xóa ghi chú trên Google Keep, Google Drive hoặc Sổ tay cục bộ.
   */
  async deleteNote(noteIdInput: string, options?: { deferSync?: boolean }): Promise<boolean> {
    const noteId = S(noteIdInput, 200);
    const existing = this.data.notes.find(n => n.id === noteId);

    if (noteId.startsWith('local-')) {
      this.data.notes = this.data.notes.filter(n => n.id !== noteId);
      this.clearDirty('note', noteId);
      this.save();
      return true;
    }

    if (options?.deferSync === true || !this.isConnected()) {
      this.data.notes = this.data.notes.filter(n => n.id !== noteId);
      this.enqueueDirty({
        kind: 'note',
        action: 'delete',
        id: noteId,
        updatedAt: Date.now(),
      });
      this.save();
      return true;
    }

    if (existing?.source === 'keep' || noteId.startsWith('notes/')) {
      const keepName = noteId.startsWith('notes/') ? noteId : `notes/${noteId}`;
      await this.apiRequest(`https://keep.googleapis.com/v1/${keepName}`, { method: 'DELETE' }).catch(() => {});
    } else if (existing?.source !== 'local' && !noteId.startsWith('local-')) {
      await this.apiRequest(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(noteId)}`,
        { method: 'DELETE' }
      ).catch(() => {});
    }
    this.data.notes = this.data.notes.filter(n => n.id !== noteId);
    this.clearDirty('note', noteId);
    this.save();
    return true;
  }

  /**
   * Đồng bộ tăng dần (Incremental Delta Sync):
   * Chỉ đẩy các sự kiện, công việc, ghi chú mới thêm, vừa chỉnh sửa hoặc vừa xóa trong `dirtyQueue`
   * lên Google Calendar / Tasks / Drive sau khi người dùng ngừng thao tác 30 giây.
   * Tuyệt đối KHÔNG tải lại toàn bộ lịch sử cũ và KHÔNG gửi `attachments` cục bộ lên Google Calendar/Tasks API.
   */
  /**
   * Adapter REST cho bộ đồng bộ tăng dần (calendar-sync.ts), chỉ dùng cho bản ghi calendar và tasks.
   * - Calendar: đầy đủ lần đầu trong ±180 ngày (showDeleted); sau đó dùng syncToken. Google trả 410 → SyncCursorExpiredError.
   * - Tasks: dùng updatedMin + showDeleted; mốc lùi 60 giây để bù lệch đồng hồ (áp dụng là idempotent).
   * - Payload chỉ lấy các trường đã biết; đính kèm và ghi chú không bao giờ đi qua đây.
   */
  createCalendarSyncRemote(): SyncRemote {
    const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        throw toSyncError(err);
      }
    };
    return {
      insert: (kind, data) =>
        guard(async () => {
          if (kind === 'calendar') {
            const created = await this.apiRequest<any>(this.syncEventsUrl(), {
              method: 'POST',
              body: JSON.stringify(this.syncEventBody(data, false)),
            });
            if (typeof created?.id !== 'string' || !created.id) throw Error('Google không trả mã sự kiện mới');
            return created.id;
          }
          const created = await this.apiRequest<any>(this.syncTasksUrl(), {
            method: 'POST',
            body: JSON.stringify(syncTaskBody(data, true)),
          });
          if (typeof created?.id !== 'string' || !created.id) throw Error('Google không trả mã công việc mới');
          return created.id;
        }),
      patch: (kind, googleId, data) =>
        guard(async () => {
          if (kind === 'calendar') {
            await this.apiRequest(`${this.syncEventsUrl()}/${encodeURIComponent(googleId)}`, {
              method: 'PATCH',
              body: JSON.stringify(this.syncEventBody(data, true)),
            });
            return;
          }
          await this.apiRequest(`${this.syncTasksUrl()}/${encodeURIComponent(googleId)}`, {
            method: 'PATCH',
            body: JSON.stringify(syncTaskBody(data, false)),
          });
        }),
      remove: (kind, googleId) =>
        guard(async () => {
          const base = kind === 'calendar' ? this.syncEventsUrl() : this.syncTasksUrl();
          await this.apiRequest(`${base}/${encodeURIComponent(googleId)}`, { method: 'DELETE' });
        }),
      list: (kind, cursor) =>
        guard(() => (kind === 'calendar' ? this.syncPullEvents(cursor) : this.syncPullTasks(cursor))),
    };
  }

  private syncEventsUrl(): string {
    return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.resolveWritableCalendarId())}/events`;
  }

  private syncTasksUrl(): string {
    return `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.resolveWritableTasklistId())}/tasks`;
  }

  private syncEventBody(data: Record<string, unknown>, isPatch: boolean): Record<string, unknown> {
    if (typeof data.summary !== 'string' || typeof data.start !== 'string' || !data.start) {
      throw Error('Sự kiện thiếu tiêu đề hoặc giờ bắt đầu');
    }
    return this.buildGoogleCalendarEventPayload(
      {
        summary: data.summary,
        start: data.start,
        end: typeof data.end === 'string' ? data.end : undefined,
        allDay: data.allDay === true,
        location: typeof data.location === 'string' ? data.location : undefined,
        description: typeof data.description === 'string' ? data.description : undefined,
        colorId: typeof data.colorId === 'string' ? data.colorId : undefined,
        recurrence: Array.isArray(data.recurrence) ? (data.recurrence as string[]) : undefined,
        remindersMinutes: Array.isArray(data.remindersMinutes) ? (data.remindersMinutes as number[]) : undefined,
        attendees: Array.isArray(data.attendees) ? (data.attendees as string[]) : undefined,
      },
      isPatch
    );
  }

  /** Đọc các trang sự kiện. cursor = null: đầy đủ ±180 ngày; có cursor: lấy thay đổi từ syncToken. */
  private async syncPullEvents(cursor: string | null): Promise<RemotePage> {
    const items: RemoteItem[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const u = new URL(this.syncEventsUrl());
      u.searchParams.set('showDeleted', 'true');
      u.searchParams.set('maxResults', '2500');
      if (cursor) {
        u.searchParams.set('syncToken', cursor);
      } else {
        const now = Date.now();
        u.searchParams.set('timeMin', new Date(now - 180 * 86_400_000).toISOString());
        u.searchParams.set('timeMax', new Date(now + 180 * 86_400_000).toISOString());
      }
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      let res: any;
      try {
        res = await this.apiRequest<any>(u.toString());
      } catch (err) {
        if (cursor && (err as { status?: number }).status === 410) throw new SyncCursorExpiredError();
        throw err;
      }
      for (const ev of res?.items ?? []) {
        if (!ev || typeof ev.id !== 'string') continue;
        items.push({
          id: ev.id,
          updatedAt: Date.parse(ev.updated) || Date.now(),
          deleted: ev.status === 'cancelled',
          data: calendarEventToData(ev),
        });
      }
      pageToken = typeof res?.nextPageToken === 'string' ? res.nextPageToken : undefined;
      if (typeof res?.nextSyncToken === 'string') nextSyncToken = res.nextSyncToken;
    } while (pageToken);
    if (!nextSyncToken) throw Error('Google không trả mốc đồng bộ (nextSyncToken) cho lịch');
    return { items, nextCursor: nextSyncToken };
  }

  /** Đọc các trang công việc theo updatedMin; mốc tiếp theo lùi 60 giây để không sót thay đổi do lệch đồng hồ. */
  private async syncPullTasks(cursor: string | null): Promise<RemotePage> {
    const startedAt = Date.now();
    const items: RemoteItem[] = [];
    let pageToken: string | undefined;
    do {
      const u = new URL(this.syncTasksUrl());
      u.searchParams.set('showDeleted', 'true');
      u.searchParams.set('showHidden', 'true');
      u.searchParams.set('showCompleted', 'true');
      u.searchParams.set('maxResults', '100');
      if (cursor) u.searchParams.set('updatedMin', cursor);
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const res = await this.apiRequest<any>(u.toString());
      for (const t of res?.items ?? []) {
        if (!t || typeof t.id !== 'string') continue;
        items.push({
          id: t.id,
          updatedAt: Date.parse(t.updated) || Date.now(),
          deleted: t.deleted === true,
          data: taskToData(t),
        });
      }
      pageToken = typeof res?.nextPageToken === 'string' ? res.nextPageToken : undefined;
    } while (pageToken);
    return { items, nextCursor: new Date(startedAt - 60_000).toISOString() };
  }

  async syncDirty(): Promise<GoogleWorkspaceView & { syncedCount: number }> {
    const queue = [...(this.data.dirtyQueue ?? [])];
    if (!queue.length || !this.isConnected()) {
      return { ...this.view(), syncedCount: 0 };
    }

    await this.ensureAccessToken();
    let syncedCount = 0;
    const errors: string[] = [];

    for (const record of queue) {
      try {
        if (record.kind === 'event') {
          const ev = this.data.events.find(e => e.id === record.id);
          const calId = this.resolveWritableCalendarId(record.calendarId || ev?.calendarId);
          if (record.action === 'delete') {
            if (!record.id.startsWith('local-')) {
              await this.apiRequest(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(record.id)}`,
                { method: 'DELETE' }
              ).catch(() => {});
            }
            this.clearDirty('event', record.id);
            syncedCount++;
          } else if (ev) {
            const isCreate = record.action === 'create' || ev.id.startsWith('local-');
            const payload = this.buildGoogleCalendarEventPayload(
              {
                summary: ev.summary,
                start: ev.start,
                end: ev.end,
                allDay: ev.allDay,
                location: ev.location,
                description: ev.description,
                colorId: ev.colorId,
                recurrence: ev.recurrence,
                remindersMinutes: ev.remindersMinutes,
                attendees: ev.attendees,
              },
              !isCreate
            );
            if (isCreate) {
              const created = await this.apiRequest<any>(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
                { method: 'POST', body: JSON.stringify(payload) }
              );
              const newId = String(created?.id || ev.id);
              const idx = this.data.events.findIndex(e => e.id === ev.id);
              if (idx >= 0) {
                const updatedEv: GoogleCalendarEvent = {
                  ...ev,
                  id: newId,
                  calendarId: calId,
                  htmlLink: typeof created?.htmlLink === 'string' ? created.htmlLink : ev.htmlLink,
                  status: typeof created?.status === 'string' ? created.status : ev.status,
                };
                delete updatedEv.dirtyAction;
                this.data.events[idx] = updatedEv;
              }
            } else {
              const updated = await this.apiRequest<any>(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(ev.id)}`,
                { method: 'PATCH', body: JSON.stringify(payload) }
              );
              const idx = this.data.events.findIndex(e => e.id === ev.id);
              if (idx >= 0) {
                const updatedEv: GoogleCalendarEvent = {
                  ...ev,
                  htmlLink: typeof updated?.htmlLink === 'string' ? updated.htmlLink : ev.htmlLink,
                  status: typeof updated?.status === 'string' ? updated.status : ev.status,
                };
                delete updatedEv.dirtyAction;
                this.data.events[idx] = updatedEv;
              }
            }
            this.clearDirty('event', record.id);
            syncedCount++;
          } else {
            this.clearDirty('event', record.id);
          }
        } else if (record.kind === 'task') {
          const task = this.data.tasks.find(t => t.id === record.id);
          const listId = this.resolveWritableTasklistId(record.tasklistId || task?.tasklistId);
          if (record.action === 'delete') {
            if (!record.id.startsWith('local-')) {
              await this.apiRequest(
                `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(record.id)}`,
                { method: 'DELETE' }
              ).catch(() => {});
            }
            this.clearDirty('task', record.id);
            syncedCount++;
          } else if (task) {
            const isCreate = record.action === 'create' || task.id.startsWith('local-');
            const payload: Record<string, unknown> = {
              title: task.title,
              notes: task.notes ?? '',
              status: task.status === 'completed' ? 'completed' : 'needsAction',
              completed: task.status === 'completed' ? task.completed || new Date().toISOString() : null,
              due: task.due ?? null,
            };
            if (isCreate) {
              if (!payload.notes) delete payload.notes;
              if (!payload.due) delete payload.due;
              if (payload.status !== 'completed') delete payload.completed;
              const created = await this.apiRequest<any>(
                `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
                { method: 'POST', body: JSON.stringify(payload) }
              );
              const newId = String(created?.id || task.id);
              const idx = this.data.tasks.findIndex(t => t.id === task.id);
              if (idx >= 0) {
                const updatedTask: GoogleTaskItem = {
                  ...task,
                  id: newId,
                  tasklistId: listId,
                  updated: typeof created?.updated === 'string' ? created.updated : task.updated,
                };
                delete updatedTask.dirtyAction;
                this.data.tasks[idx] = updatedTask;
              }
            } else {
              payload.id = task.id;
              const updated = await this.apiRequest<any>(
                `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.id)}`,
                { method: 'PATCH', body: JSON.stringify(payload) }
              );
              const idx = this.data.tasks.findIndex(t => t.id === task.id);
              if (idx >= 0) {
                const updatedTask: GoogleTaskItem = {
                  ...task,
                  updated: typeof updated?.updated === 'string' ? updated.updated : task.updated,
                };
                delete updatedTask.dirtyAction;
                this.data.tasks[idx] = updatedTask;
              }
            }
            this.clearDirty('task', record.id);
            syncedCount++;
          } else {
            this.clearDirty('task', record.id);
          }
        } else if (record.kind === 'note') {
          const note = this.data.notes.find(n => n.id === record.id);
          if (record.action === 'delete') {
            if (!record.id.startsWith('local-')) {
              if (record.id.startsWith('notes/')) {
                await this.apiRequest(`https://keep.googleapis.com/v1/${record.id}`, { method: 'DELETE' }).catch(() => {});
              } else {
                await this.apiRequest(
                  `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(record.id)}`,
                  { method: 'DELETE' }
                ).catch(() => {});
              }
            }
            this.clearDirty('note', record.id);
            syncedCount++;
          } else if (note) {
            const isCreate = record.action === 'create' || note.id.startsWith('local-');
            if (isCreate) {
              const folderId = await this.ensureNotesFolder();
              const metadata = {
                name: `${note.title}.md`,
                mimeType: 'text/markdown',
                parents: folderId && folderId !== 'root' ? [folderId] : undefined,
                description: truncateUtf8(note.content, 12_000),
                appProperties: {
                  pvtaKind: 'note',
                  pvtaColor: note.color,
                  pvtaPinned: note.pinned ? 'true' : 'false',
                  pvtaTags: buildDriveTagsProp(note.tags ?? []),
                },
              };
              const created = await this.apiRequest<any>(
                'https://www.googleapis.com/drive/v3/files?fields=id,name,description,modifiedTime,webViewLink,appProperties',
                { method: 'POST', body: JSON.stringify(metadata) }
              );
              const newId = String(created?.id || note.id);
              if (created?.id && note.content) {
                await this.apiRequest(
                  `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(newId)}?uploadType=media`,
                  {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
                    body: `# ${note.title}\n\n${note.content}\n`,
                  }
                ).catch(() => {});
              }
              const idx = this.data.notes.findIndex(n => n.id === note.id);
              if (idx >= 0) {
                const updatedNote: GoogleNoteItem = {
                  ...note,
                  id: newId,
                  source: created?.id ? 'drive' : note.source,
                  updated: typeof created?.modifiedTime === 'string' ? created.modifiedTime : note.updated,
                  webViewLink: typeof created?.webViewLink === 'string' ? created.webViewLink : note.webViewLink,
                };
                delete updatedNote.dirtyAction;
                this.data.notes[idx] = updatedNote;
              }
            } else if (note.source === 'drive' || !note.id.startsWith('notes/')) {
              const metadata = {
                name: `${note.title}.md`,
                description: truncateUtf8(note.content, 12_000),
                appProperties: {
                  pvtaKind: 'note',
                  pvtaColor: note.color,
                  pvtaPinned: note.pinned ? 'true' : 'false',
                  pvtaTags: buildDriveTagsProp(note.tags ?? []),
                },
              };
              const updated = await this.apiRequest<any>(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(note.id)}?fields=id,name,description,modifiedTime,webViewLink,appProperties`,
                { method: 'PATCH', body: JSON.stringify(metadata) }
              );
              await this.apiRequest(
                `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(note.id)}?uploadType=media`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
                  body: `# ${note.title}\n\n${note.content}\n`,
                }
              ).catch(() => {});
              const idx = this.data.notes.findIndex(n => n.id === note.id);
              if (idx >= 0) {
                const updatedNote: GoogleNoteItem = {
                  ...note,
                  updated: typeof updated?.modifiedTime === 'string' ? updated.modifiedTime : note.updated,
                  webViewLink: typeof updated?.webViewLink === 'string' ? updated.webViewLink : note.webViewLink,
                };
                delete updatedNote.dirtyAction;
                this.data.notes[idx] = updatedNote;
              }
            }
            this.clearDirty('note', record.id);
            syncedCount++;
          } else {
            this.clearDirty('note', record.id);
          }
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (syncedCount > 0) {
      this.data.lastSyncedAt = Date.now();
    }
    if (errors.length) {
      this.data.lastError = errors.join(' | ');
    } else {
      delete this.data.lastError;
    }
    this.save();
    return { ...this.view(), syncedCount };
  }

  async syncAll(options?: { calendarId?: string; tasklistId?: string; timeMin?: string; timeMax?: string }): Promise<GoogleWorkspaceView> {
    await this.ensureAccessToken();

    // Đẩy các thay đổi cục bộ đang chờ trong dirtyQueue lên trước khi đồng bộ
    if (this.data.dirtyQueue?.length) {
      await this.syncDirty().catch(() => {});
    }

    const [calResult, taskResult, noteResult] = await Promise.allSettled([
      (async () => {
        await this.listCalendars();
        await this.listEvents({
          calendarId: options?.calendarId || this.data.selectedCalendarId,
          timeMin: options?.timeMin,
          timeMax: options?.timeMax,
        });
      })(),
      (async () => {
        await this.listTaskLists();
        await this.listTasks({
          tasklistId: options?.tasklistId || this.data.selectedTasklistId,
        });
      })(),
      this.listNotes(),
    ]);

    const errors: string[] = [];
    if (calResult.status === 'rejected') {
      const msg = calResult.reason instanceof Error ? calResult.reason.message : String(calResult.reason);
      errors.push(`Google Calendar: ${msg}`);
    }
    if (taskResult.status === 'rejected') {
      const msg = taskResult.reason instanceof Error ? taskResult.reason.message : String(taskResult.reason);
      errors.push(`Google Tasks: ${msg}`);
    }
    if (noteResult.status === 'rejected') {
      const msg = noteResult.reason instanceof Error ? noteResult.reason.message : String(noteResult.reason);
      errors.push(`Google Notes: ${msg}`);
    }

    if (errors.length === 3 || (calResult.status === 'rejected' && taskResult.status === 'rejected')) {
      const combined = errors.join(' | ');
      this.data.lastError = combined;
      this.save();
      throw Error(combined);
    }

    this.data.lastSyncedAt = Date.now();
    if (errors.length) {
      this.data.lastError = errors.join(' | ');
    } else {
      delete this.data.lastError;
    }
    this.save();
    return this.view();
  }

  async rpc(method: string, p: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'google.status':
        return this.view();
      case 'google.saveConfig':
        return this.saveConfig({ clientId: p.clientId, clientSecret: p.clientSecret });
      case 'google.login':
        return this.loginOAuth(typeof p.timeoutMs === 'number' ? p.timeoutMs : 180_000);
      case 'google.cancelLogin':
        this.cancelLogin();
        return this.view();
      case 'google.logout':
        return this.disconnect();
      case 'google.sync':
        return this.syncAll({
          calendarId: OPT_S(p.calendarId, 200) || (p.syncAllSources === true ? ALL_CALENDARS_ID : undefined),
          tasklistId: OPT_S(p.tasklistId, 200) || (p.syncAllSources === true ? ALL_TASKLISTS_ID : undefined),
          timeMin: OPT_S(p.timeMin, 60) || undefined,
          timeMax: OPT_S(p.timeMax, 60) || undefined,
        });
      case 'google.syncDirty':
        return this.syncDirty();
      case 'google.addAttachment':
        return this.addLocalAttachment({
          filePath: OPT_S(p.filePath, 2000) || undefined,
          name: OPT_S(p.name, 300) || undefined,
          dataUrl: typeof p.dataUrl === 'string' ? p.dataUrl : undefined,
          mimeType: OPT_S(p.mimeType, 120) || undefined,
        });
      case 'google.selectCalendar': {
        const calendarId = S(p.calendarId, 200);
        await this.listEvents({
          calendarId,
          timeMin: OPT_S(p.timeMin, 60) || undefined,
          timeMax: OPT_S(p.timeMax, 60) || undefined,
        });
        this.save();
        return this.view();
      }
      case 'google.selectTasklist': {
        const tasklistId = S(p.tasklistId, 200);
        await this.listTasks({ tasklistId });
        this.save();
        return this.view();
      }
      case 'google.createEvent': {
        const recurrence = Array.isArray(p.recurrence)
          ? p.recurrence.map(r => String(r).trim()).filter(Boolean)
          : undefined;
        const remindersMinutes = Array.isArray(p.remindersMinutes)
          ? p.remindersMinutes.map(Number).filter(m => Number.isFinite(m) && m >= 0)
          : undefined;
        const attendees = Array.isArray(p.attendees)
          ? p.attendees.map(a => String(a).trim()).filter(Boolean)
          : typeof p.attendees === 'string'
          ? p.attendees.split(',').map(a => a.trim()).filter(Boolean)
          : undefined;
        const attachments = sanitizeAttachments(p.attachments);
        await this.createEvent({
          calendarId: OPT_S(p.calendarId, 200) || undefined,
          summary: S(p.summary, 500),
          start: S(p.start, 60),
          end: OPT_S(p.end, 60) || undefined,
          allDay: p.allDay === true,
          location: OPT_S(p.location, 500) || undefined,
          description: OPT_S(p.description, 4000) || undefined,
          colorId: OPT_S(p.colorId, 20) || undefined,
          recurrence,
          remindersMinutes,
          attendees,
          attachments,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.updateEvent': {
        const recurrence = Array.isArray(p.recurrence)
          ? p.recurrence.map(r => String(r).trim()).filter(Boolean)
          : undefined;
        const remindersMinutes = Array.isArray(p.remindersMinutes)
          ? p.remindersMinutes.map(Number).filter(m => Number.isFinite(m) && m >= 0)
          : undefined;
        const attendees = Array.isArray(p.attendees)
          ? p.attendees.map(a => String(a).trim()).filter(Boolean)
          : typeof p.attendees === 'string'
          ? p.attendees.split(',').map(a => a.trim()).filter(Boolean)
          : undefined;
        const attachments = p.attachments !== undefined ? sanitizeAttachments(p.attachments) ?? [] : undefined;
        await this.updateEvent({
          calendarId: OPT_S(p.calendarId, 200) || undefined,
          targetCalendarId: OPT_S(p.targetCalendarId, 200) || undefined,
          eventId: S(p.eventId, 200),
          summary: p.summary !== undefined ? S(p.summary, 500) : undefined,
          start: p.start !== undefined ? S(p.start, 60) : undefined,
          end: p.end !== undefined ? OPT_S(p.end, 60) : undefined,
          allDay: p.allDay !== undefined ? p.allDay === true : undefined,
          location: p.location !== undefined ? OPT_S(p.location, 500) : undefined,
          description: p.description !== undefined ? OPT_S(p.description, 4000) : undefined,
          colorId: p.colorId !== undefined ? OPT_S(p.colorId, 20) : undefined,
          recurrence,
          remindersMinutes,
          attendees,
          attachments,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.deleteEvent': {
        await this.deleteEvent(OPT_S(p.calendarId, 200) || undefined, S(p.eventId, 200), {
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.createTask': {
        const attachments = sanitizeAttachments(p.attachments);
        await this.createTask({
          tasklistId: OPT_S(p.tasklistId, 200) || undefined,
          title: S(p.title, 500),
          notes: OPT_S(p.notes, 4000) || undefined,
          due: OPT_S(p.due, 60) || undefined,
          attachments,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.updateTask': {
        const attachments = p.attachments !== undefined ? sanitizeAttachments(p.attachments) ?? [] : undefined;
        await this.updateTask({
          tasklistId: OPT_S(p.tasklistId, 200) || undefined,
          targetTasklistId: OPT_S(p.targetTasklistId, 200) || undefined,
          taskId: S(p.taskId, 200),
          title: p.title !== undefined ? S(p.title, 500) : undefined,
          notes: p.notes !== undefined ? OPT_S(p.notes, 4000) : undefined,
          due: p.due !== undefined ? OPT_S(p.due, 60) : undefined,
          completed: p.completed !== undefined ? p.completed === true : undefined,
          attachments,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.toggleTask': {
        await this.toggleTask({
          tasklistId: OPT_S(p.tasklistId, 200) || undefined,
          taskId: S(p.taskId, 200),
          completed: p.completed === true,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.deleteTask': {
        await this.deleteTask(OPT_S(p.tasklistId, 200) || undefined, S(p.taskId, 200), {
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.listNotes': {
        await this.listNotes();
        this.save();
        return this.view();
      }
      case 'google.createNote': {
        const tagsRaw = Array.isArray(p.tags)
          ? p.tags.map(t => String(t).trim()).filter(Boolean)
          : typeof p.tags === 'string'
          ? p.tags.split(',').map(t => t.trim()).filter(Boolean)
          : [];
        const attachments = sanitizeAttachments(p.attachments);
        await this.createNote({
          title: S(p.title, 300),
          content: OPT_S(p.content, 20_000) || undefined,
          color: (OPT_S(p.color, 30) || 'yellow') as GoogleNoteColor,
          pinned: p.pinned === true,
          tags: tagsRaw,
          attachments,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.updateNote': {
        const tagsRaw = Array.isArray(p.tags)
          ? p.tags.map(t => String(t).trim()).filter(Boolean)
          : typeof p.tags === 'string'
          ? p.tags.split(',').map(t => t.trim()).filter(Boolean)
          : undefined;
        const attachments = p.attachments !== undefined ? sanitizeAttachments(p.attachments) ?? [] : undefined;
        await this.updateNote({
          noteId: S(p.noteId, 200),
          title: p.title !== undefined ? S(p.title, 300) : undefined,
          content: p.content !== undefined ? OPT_S(p.content, 20_000) : undefined,
          color: p.color !== undefined ? (OPT_S(p.color, 30) as GoogleNoteColor) : undefined,
          pinned: p.pinned !== undefined ? p.pinned === true : undefined,
          tags: tagsRaw,
          attachments,
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      case 'google.deleteNote': {
        await this.deleteNote(S(p.noteId, 200), {
          deferSync: p.deferSync === true,
        });
        return this.view();
      }
      default:
        throw Error('Yêu cầu Google Workspace không được hỗ trợ.');
    }
  }
}
