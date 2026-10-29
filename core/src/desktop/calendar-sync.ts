import fs from 'node:fs';
import path from 'node:path';
import { atomicJson } from './storage.js';
import {
  applyRemote,
  listPendingSync,
  markClean,
  markError,
  noteSyncError,
  setGoogleId,
  type StoredRecord,
} from './calendar-store.js';

// Bộ đồng bộ tăng dần PVTA Calendar → Google Calendar / Tasks.
// - Đẩy: sau DEBOUNCE_MS không thao tác, chỉ gửi bản ghi dirty/error (không gửi toàn bộ dữ liệu cũ).
// - Kéo: dùng mốc đồng bộ (Calendar: syncToken; Tasks: updatedMin). Mốc hết hạn → đồng bộ đầy đủ lại.
// - Xung đột: mốc updatedAt mới hơn thắng; bản thua được ghi vào thư mục backup/ trước khi ghi đè.
// - Ghi chú (notes) là dữ liệu cục bộ, KHÔNG đồng bộ Google nên không nằm trong SyncKind.
// - Tệp đính kèm (attachments) không bao giờ được đưa vào payload gửi Google.
// Module không tự gọi Google: người gọi truyền `SyncRemote` (adapter REST thật hoặc giả lập trong kiểm thử).

export type SyncKind = 'calendar' | 'tasks';
export const SYNC_KINDS: readonly SyncKind[] = ['calendar', 'tasks'];

export const DEBOUNCE_MS = 30_000;
/** Lịch thử lại lùi dần sau lỗi tạm thời; từ lần thứ năm trở đi dùng mốc cuối. */
export const RETRY_DELAYS_MS: readonly number[] = [30_000, 60_000, 120_000, 300_000, 900_000];

/** Lỗi HTTP từ Google. 429 và 5xx được coi là tạm thời; các mã khác là lỗi cần người xem. */
export class SyncHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'SyncHttpError';
  }
}

/** Lỗi mạng hoặc hết thời gian chờ. Bản ghi giữ dirty và được thử lại. */
export class SyncNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncNetworkError';
  }
}

/** Google từ chối mốc đồng bộ (HTTP 410). Phải đồng bộ đầy đủ lại. */
export class SyncCursorExpiredError extends Error {
  constructor() {
    super('Mốc đồng bộ Google đã hết hạn; PVTA sẽ tải lại đầy đủ.');
    this.name = 'SyncCursorExpiredError';
  }
}

export interface RemoteItem<T = unknown> {
  id: string;
  /** Mốc cập nhật phía Google, mili giây. */
  updatedAt: number;
  deleted: boolean;
  data: T;
}

export interface RemotePage<T = unknown> {
  items: RemoteItem<T>[];
  /** Mốc để lần kéo sau chỉ lấy thay đổi mới. Calendar: syncToken; Tasks: updatedMin. */
  nextCursor: string;
}

/**
 * Hợp đồng với Google. `data` là dữ liệu đã ở dạng nội bộ; adapter chịu trách nhiệm
 * chuyển sang payload Google và ngược lại. `patch` là cập nhật từng phần (PATCH).
 */
export interface SyncRemote {
  insert(kind: SyncKind, data: Record<string, unknown>): Promise<string>;
  patch(kind: SyncKind, googleId: string, data: Record<string, unknown>): Promise<void>;
  remove(kind: SyncKind, googleId: string): Promise<void>;
  /** Ném SyncCursorExpiredError khi mốc đã hết hạn. Adapter tự phân trang và trả về mốc cuối. */
  list(kind: SyncKind, cursor: string | null): Promise<RemotePage>;
}

export interface SyncStatus {
  state: 'idle' | 'waiting' | 'syncing' | 'retrying' | 'error';
  /** Số bản ghi dirty hoặc lỗi đang chờ gửi. */
  pending: number;
  lastError?: string;
  lastSyncedAt?: number;
  nextAttemptAt?: number;
}

export interface FlushReport {
  pushed: number;
  pulled: number;
  failed: number;
}

export interface CalendarSyncOptions {
  /** Đường dẫn calendar.json và tasks.json (lấy từ recordFilePath). */
  files: Record<SyncKind, string>;
  backupDir: string;
  /** Tệp lưu mốc đồng bộ (sync-state.json). */
  stateFile: string;
  remote: SyncRemote;
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
  now?: () => number;
  onStatus?: (status: SyncStatus) => void;
}

interface SyncState {
  cursors: Partial<Record<SyncKind, string>>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof SyncNetworkError) return true;
  if (err instanceof SyncHttpError) return err.status === 429 || err.status >= 500;
  return false;
}

/** Chuyển dữ liệu nội bộ thành thân yêu cầu gửi Google. Luôn loại bỏ attachments. */
export function toRemoteBody(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Dữ liệu bản ghi không hợp lệ');
  }
  const body: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  delete body.attachments;
  return body;
}

export class CalendarSyncEngine {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private running: Promise<FlushReport> | null = null;
  private lastSyncedAt?: number;
  private lastError?: string;
  private nextAttemptAt?: number;
  private readonly debounceMs: number;
  private readonly retryDelays: readonly number[];
  private readonly now: () => number;

  constructor(private readonly opts: CalendarSyncOptions) {
    this.debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
    this.retryDelays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.now = opts.now ?? Date.now;
    if (!this.retryDelays.length) throw new Error('retryDelaysMs không được rỗng');
  }

  /** Gọi mỗi khi thầy thêm, sửa hoặc xóa. Đặt lại bộ đếm 30 giây. */
  touch(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushNow();
    }, this.debounceMs);
    this.emit();
  }

  /** Đẩy ngay (nút "Đồng bộ" hoặc khi hết thời gian chờ). Nếu đang chạy thì trả về cùng lượt đó. */
  flushNow(): Promise<FlushReport> {
    if (this.running) return this.running;
    this.clearTimers();
    this.running = this.run().finally(() => {
      this.running = null;
      this.emit();
    });
    this.emit();
    return this.running;
  }

  getStatus(): SyncStatus {
    let pending = 0;
    try {
      for (const kind of SYNC_KINDS) pending += listPendingSync(this.opts.files[kind]).length;
    } catch (err) {
      this.lastError = errorMessage(err);
    }
    const state: SyncStatus['state'] = this.running
      ? 'syncing'
      : this.retryTimer
        ? 'retrying'
        : this.debounceTimer
          ? 'waiting'
          : this.lastError
            ? 'error'
            : 'idle';
    return {
      state,
      pending,
      lastError: this.lastError,
      lastSyncedAt: this.lastSyncedAt,
      nextAttemptAt: this.nextAttemptAt,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  private async run(): Promise<FlushReport> {
    const report: FlushReport = { pushed: 0, pulled: 0, failed: 0 };
    let retryable = false;
    for (const kind of SYNC_KINDS) {
      const file = this.opts.files[kind];
      let pending: StoredRecord[] = [];
      try {
        pending = listPendingSync(file);
      } catch (err) {
        report.failed++;
        this.lastError = errorMessage(err);
        continue;
      }
      for (const rec of pending) {
        try {
          await this.pushRecord(kind, rec);
          report.pushed++;
        } catch (err) {
          report.failed++;
          const message = errorMessage(err);
          this.lastError = message;
          if (isRetryable(err)) {
            retryable = true;
            this.safely(() => noteSyncError(file, rec.localId, message));
          } else {
            this.safely(() => markError(file, rec.localId, message));
          }
        }
      }
      try {
        report.pulled += await this.pullKind(kind);
      } catch (err) {
        report.failed++;
        this.lastError = errorMessage(err);
        if (isRetryable(err)) retryable = true;
      }
    }
    if (retryable) {
      this.scheduleRetry();
    } else if (report.failed === 0) {
      this.retryAttempt = 0;
      this.lastError = undefined;
      this.lastSyncedAt = this.now();
    }
    return report;
  }

  private async pushRecord(kind: SyncKind, rec: StoredRecord): Promise<void> {
    const file = this.opts.files[kind];
    const sent = rec.updatedAt;
    if (rec.deleted) {
      if (rec.googleId) {
        try {
          await this.opts.remote.remove(kind, rec.googleId);
        } catch (err) {
          // Đã xóa phía Google rồi thì coi như thành công.
          if (!(err instanceof SyncHttpError && (err.status === 404 || err.status === 410))) throw err;
        }
      }
      markClean(file, rec.localId, sent);
      return;
    }
    const body = toRemoteBody(rec.data);
    if (!rec.googleId) {
      const id = await this.opts.remote.insert(kind, body);
      // Lưu mã ngay, kể cả khi thầy vừa sửa bản ghi trong lúc gửi; tránh tạo trùng ở lần sau.
      setGoogleId(file, rec.localId, id);
      markClean(file, rec.localId, sent, id);
      return;
    }
    await this.opts.remote.patch(kind, rec.googleId, body);
    markClean(file, rec.localId, sent);
  }

  private async pullKind(kind: SyncKind): Promise<number> {
    const file = this.opts.files[kind];
    const state = this.readSyncState();
    let page: RemotePage;
    try {
      page = await this.opts.remote.list(kind, state.cursors[kind] ?? null);
    } catch (err) {
      if (!(err instanceof SyncCursorExpiredError)) throw err;
      page = await this.opts.remote.list(kind, null);
    }
    let changed = 0;
    for (const item of page.items) {
      const outcome = applyRemote(
        file,
        { googleId: item.id, updatedAt: item.updatedAt, deleted: item.deleted, data: item.data },
        (loser) => this.writeBackup(kind, loser),
      );
      if (outcome === 'created' || outcome === 'updated' || outcome === 'deleted') changed++;
    }
    // Chỉ lưu mốc sau khi áp hết thay đổi; nếu lỗi giữa chừng thì lần sau kéo lại phần đó.
    this.writeSyncState({ cursors: { ...state.cursors, [kind]: page.nextCursor } });
    return changed;
  }

  /** Ghi bản thua xung đột ra backup/ trước khi ghi đè. Tên tệp không bao giờ trùng. */
  writeBackup(kind: SyncKind, loser: StoredRecord): string {
    const dir = this.opts.backupDir;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    let name = `${kind}-${loser.localId}-${stamp}.json`;
    for (let n = 1; fs.existsSync(path.join(dir, name)); n++) {
      name = `${kind}-${loser.localId}-${stamp}-${n}.json`;
    }
    const full = path.join(dir, name);
    atomicJson(full, {
      version: 1,
      kind,
      reason: 'conflict',
      savedAt: this.now(),
      record: loser,
    });
    return full;
  }

  private readSyncState(): SyncState {
    if (!fs.existsSync(this.opts.stateFile)) return { cursors: {} };
    try {
      const raw = JSON.parse(fs.readFileSync(this.opts.stateFile, 'utf8')) as Partial<SyncState>;
      return { cursors: raw?.cursors && typeof raw.cursors === 'object' ? raw.cursors : {} };
    } catch {
      // Mốc hỏng: bỏ qua, kéo đầy đủ lại. Không ảnh hưởng dữ liệu local đang dirty.
      return { cursors: {} };
    }
  }

  private writeSyncState(state: SyncState): void {
    atomicJson(this.opts.stateFile, { version: 1, ...state });
  }

  private scheduleRetry(): void {
    const idx = Math.min(this.retryAttempt, this.retryDelays.length - 1);
    // Constructor đã chặn mảng rỗng; mốc dự phòng chỉ để thỏa kiểu khi bật noUncheckedIndexedAccess.
    const delay = this.retryDelays[idx] ?? this.retryDelays[this.retryDelays.length - 1] ?? 30_000;
    this.retryAttempt++;
    this.nextAttemptAt = this.now() + delay;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.nextAttemptAt = undefined;
      void this.flushNow();
    }, delay);
    this.emit();
  }

  private clearTimers(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
    this.nextAttemptAt = undefined;
  }

  private safely(fn: () => unknown): void {
    try {
      fn();
    } catch {
      // Bản ghi có thể đã bị xóa trong lúc gửi; không làm hỏng vòng đồng bộ.
    }
  }

  private emit(): void {
    this.opts.onStatus?.(this.getStatus());
  }
}
