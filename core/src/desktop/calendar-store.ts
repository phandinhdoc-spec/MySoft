import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, uid } from './storage.js';

// Kho bản ghi cục bộ cho PVTA Calendar: calendar.json, tasks.json, notes.json.
// Thư mục gốc do người gọi truyền vào; module không tự chọn đường dẫn dữ liệu.

export type CalendarRecordKind = 'calendar' | 'tasks' | 'notes';
export type SyncState = 'clean' | 'dirty' | 'error';

/**
 * Tệp đính kèm chỉ lưu trên máy. Nằm NGOÀI `data` nên không đi theo payload gửi Google.
 * `localPath` là đường dẫn tương đối theo thư mục gốc, dạng `attachments/<localId>/<tên>`.
 */
export interface CalendarAttachment {
  id: string;
  name: string;
  localPath: string;
  originalPath?: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'file';
  addedAt: string;
  localOnly: true;
}

export interface StoredRecord<T = unknown> {
  localId: string;
  googleId: string | null;
  syncState: SyncState;
  /** Mốc sửa cuối, mili giây theo Unix epoch (không phụ thuộc múi giờ). Hiển thị bằng formatUpdatedAt (+07:00). */
  updatedAt: number;
  deleted: boolean;
  syncError?: string;
  /** Đính kèm cục bộ. Thay đổi đính kèm KHÔNG đặt dirty và KHÔNG đổi updatedAt. */
  attachments?: CalendarAttachment[];
  data: T;
}

interface RecordFile<T> {
  version: 1;
  records: StoredRecord<T>[];
}

export interface SaveRecordInput<T> {
  /** Có thì sửa bản ghi cũ; không có thì tạo mới. */
  localId?: string;
  googleId?: string | null;
  data: T;
}

const SYNC_STATES: readonly SyncState[] = ['clean', 'dirty', 'error'];

function isAttachmentLike(a: unknown): boolean {
  const x = a as Partial<CalendarAttachment> | null;
  return (
    !!x &&
    typeof x === 'object' &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.localPath === 'string' &&
    typeof x.size === 'number' &&
    (x.kind === 'image' || x.kind === 'file')
  );
}
const LOCK_STALE_MS = 60_000;
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

export function recordFilePath(root: string, kind: CalendarRecordKind): string {
  return path.join(root, `${kind}.json`);
}

/** Hiển thị mốc thời gian theo giờ Việt Nam, chính xác đến giây: 2026-10-29T10:00:00+07:00. */
export function formatUpdatedAt(ms: number): string {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 19) + '+07:00';
}

function validate<T>(value: unknown, file: string): StoredRecord<T>[] {
  const obj = value as Partial<RecordFile<T>> | null;
  if (!obj || typeof obj !== 'object' || obj.version !== 1 || !Array.isArray(obj.records)) {
    throw new Error(`Sai định dạng ${file}`);
  }
  const seen = new Set<string>();
  for (const r of obj.records) {
    const ok =
      !!r &&
      typeof r.localId === 'string' &&
      r.localId.length > 0 &&
      !seen.has(r.localId) &&
      (r.googleId === null || typeof r.googleId === 'string') &&
      SYNC_STATES.includes(r.syncState) &&
      typeof r.updatedAt === 'number' &&
      Number.isFinite(r.updatedAt) &&
      typeof r.deleted === 'boolean' &&
      (r.attachments === undefined || (Array.isArray(r.attachments) && r.attachments.every(isAttachmentLike))) &&
      'data' in r;
    if (!ok) throw new Error(`Bản ghi lỗi trong ${file}`);
    seen.add(r.localId);
  }
  return obj.records;
}

/** Đọc toàn bộ bản ghi. Tệp chưa có thì trả về mảng rỗng. Tệp hỏng thì ném lỗi, không ghi đè. */
export function readRecords<T = unknown>(file: string): StoredRecord<T>[] {
  if (!fs.existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Không đọc được ${file}. PVTA giữ nguyên tệp; hãy khôi phục từ bản sao lưu.`);
  }
  return validate<T>(parsed, file);
}

export function getRecord<T = unknown>(file: string, localId: string): StoredRecord<T> | undefined {
  return readRecords<T>(file).find((r) => r.localId === localId);
}

/** Các bản ghi chưa đồng bộ thành công: dirty (đã sửa/thêm/xóa) hoặc error (lần gửi trước thất bại). */
export function listPendingSync<T = unknown>(file: string): StoredRecord<T>[] {
  return readRecords<T>(file).filter((r) => r.syncState === 'dirty' || r.syncState === 'error');
}

function isStaleLock(lock: string): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(lock, 'utf8');
  } catch {
    return true; // khóa đã biến mất, thử lại được
  }
  const pid = Number(raw.trim().split(/\s+/)[0]);
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return false; // tiến trình còn sống
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'ESRCH';
    }
  }
  try {
    return Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS;
  } catch {
    return true;
  }
}

function withLock<R>(file: string, fn: () => R): R {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  let acquired = false;
  for (let attempt = 0; attempt < 2 && !acquired; attempt++) {
    try {
      const fd = fs.openSync(lock, 'wx', 0o600);
      try {
        fs.writeSync(fd, `${process.pid} ${Date.now()}`);
      } catch (err) {
        fs.closeSync(fd);
        fs.rmSync(lock, { force: true });
        throw err;
      }
      fs.closeSync(fd);
      acquired = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (attempt === 0 && isStaleLock(lock)) {
        fs.rmSync(lock, { force: true });
        continue;
      }
      throw new Error(`Tệp ${path.basename(file)} đang được khóa bởi tiến trình khác. PVTA giữ nguyên dữ liệu; thử lại sau.`);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/** Đọc-sửa-ghi trong khóa. Nếu fn ném lỗi thì không ghi gì. Ghi qua tệp tạm rồi đổi tên. */
function mutate<T, R>(file: string, fn: (records: StoredRecord<T>[]) => R): R {
  return withLock(file, () => {
    const records = readRecords<T>(file);
    const result = fn(records);
    atomicJson(file, { version: 1, records } satisfies RecordFile<T>);
    return result;
  });
}

/** Mốc sửa tăng nghiêm ngặt cho cùng một bản ghi, kể cả khi sửa nhiều lần trong một mili giây. */
function stamp(prev: number, now: number): number {
  return Math.max(now, prev + 1);
}

function requireRecord<T>(records: StoredRecord<T>[], localId: string): StoredRecord<T> {
  const rec = records.find((r) => r.localId === localId);
  if (!rec) throw new Error(`Không tìm thấy bản ghi ${localId}`);
  return rec;
}

/** Tạo mới (không có localId) hoặc sửa bản ghi cũ. Bản ghi sau khi lưu luôn ở trạng thái dirty. */
export function saveRecord<T>(file: string, input: SaveRecordInput<T>, now: number = Date.now()): StoredRecord<T> {
  return mutate<T, StoredRecord<T>>(file, (records) => {
    if (input.localId === undefined) {
      const rec: StoredRecord<T> = {
        localId: uid(),
        googleId: input.googleId ?? null,
        syncState: 'dirty',
        updatedAt: now,
        deleted: false,
        data: input.data,
      };
      records.push(rec);
      return rec;
    }
    const rec = requireRecord(records, input.localId);
    if (rec.deleted) throw new Error(`Bản ghi ${input.localId} đã xóa, không thể sửa`);
    rec.data = input.data;
    if (input.googleId !== undefined) rec.googleId = input.googleId;
    rec.syncState = 'dirty';
    rec.syncError = undefined;
    rec.updatedAt = stamp(rec.updatedAt, now);
    return rec;
  });
}

/** Đánh dấu cần gửi lại lên Google. */
export function markDirty<T>(file: string, localId: string, now: number = Date.now()): StoredRecord<T> {
  return mutate<T, StoredRecord<T>>(file, (records) => {
    const rec = requireRecord(records, localId);
    rec.syncState = 'dirty';
    rec.syncError = undefined;
    rec.updatedAt = stamp(rec.updatedAt, now);
    return rec;
  });
}

/** Đánh dấu xóa mềm: giữ bản ghi và đặt deleted = true để gửi lệnh xóa lên Google. Không xóa vĩnh viễn. */
export function markDeleted<T>(file: string, localId: string, now: number = Date.now()): StoredRecord<T> {
  return mutate<T, StoredRecord<T>>(file, (records) => {
    const rec = requireRecord(records, localId);
    rec.deleted = true;
    rec.syncState = 'dirty';
    rec.syncError = undefined;
    rec.updatedAt = stamp(rec.updatedAt, now);
    return rec;
  });
}

/**
 * Đánh dấu đã đồng bộ. Chỉ thành công khi updatedAt còn bằng mốc đã gửi;
 * nếu thầy sửa trong lúc gửi thì giữ dirty để lần sau gửi tiếp. Trả về false trong trường hợp đó.
 */
export function markClean<T>(
  file: string,
  localId: string,
  sentUpdatedAt: number,
  googleId?: string | null,
): boolean {
  return mutate<T, boolean>(file, (records) => {
    const rec = requireRecord(records, localId);
    if (rec.updatedAt !== sentUpdatedAt) return false;
    rec.syncState = 'clean';
    rec.syncError = undefined;
    if (googleId !== undefined) rec.googleId = googleId;
    return true;
  });
}

/**
 * Đổi danh sách đính kèm trong khóa. Không đổi syncState, updatedAt hay data,
 * nên thêm/gỡ tệp không làm bản ghi bị gửi lại lên Google.
 */
export function updateAttachments<T>(
  file: string,
  localId: string,
  fn: (current: CalendarAttachment[]) => CalendarAttachment[],
): CalendarAttachment[] {
  return mutate<T, CalendarAttachment[]>(file, (records) => {
    const rec = requireRecord(records, localId);
    if (rec.deleted) throw new Error(`Bản ghi ${localId} đã xóa, không thể đổi đính kèm`);
    const next = fn([...(rec.attachments ?? [])]);
    if (next.length) rec.attachments = next;
    else delete rec.attachments;
    return next;
  });
}

/** Ghi lỗi đồng bộ. Giữ nguyên dữ liệu; bản ghi sẽ được gửi lại ở lần sau. */
export function markError<T>(file: string, localId: string, message: string): StoredRecord<T> {
  return mutate<T, StoredRecord<T>>(file, (records) => {
    const rec = requireRecord(records, localId);
    rec.syncState = 'error';
    rec.syncError = message;
    return rec;
  });
}

/** Ghi lỗi tạm thời (mạng, 429, 5xx) nhưng GIỮ trạng thái dirty, để lịch thử lại lùi dần vẫn gửi đúng bản này. */
export function noteSyncError<T>(file: string, localId: string, message: string): StoredRecord<T> {
  return mutate<T, StoredRecord<T>>(file, (records) => {
    const rec = requireRecord(records, localId);
    rec.syncError = message;
    return rec;
  });
}

/** Gắn mã Google ngay sau khi tạo mới thành công, không đổi trạng thái hay mốc sửa. */
export function setGoogleId<T>(file: string, localId: string, googleId: string): void {
  mutate<T, void>(file, (records) => {
    requireRecord(records, localId).googleId = googleId;
  });
}

export interface RemoteRecord<T> {
  googleId: string;
  /** Mốc cập nhật phía Google, mili giây. */
  updatedAt: number;
  deleted: boolean;
  data: T;
}

export type ApplyRemoteOutcome = 'created' | 'updated' | 'deleted' | 'kept-local' | 'unchanged';

/**
 * Áp một bản ghi kéo từ Google theo quy tắc "mốc mới hơn thắng":
 * - Bản local đang dirty/error và mới hơn hoặc bằng remote: giữ local (kept-local), lần đẩy sau sẽ gửi lên.
 * - Bản local đang dirty/error nhưng remote mới hơn: `onOverwrite` nhận bản thua để lưu sao lưu TRƯỚC khi ghi đè.
 * - Bản local clean: áp remote nếu remote mới hơn; ngược lại bỏ qua.
 * Đính kèm (attachments) không bị đụng tới.
 */
export function applyRemote<T>(
  file: string,
  remote: RemoteRecord<T>,
  onOverwrite?: (loser: StoredRecord<T>) => void,
): ApplyRemoteOutcome {
  return mutate<T, ApplyRemoteOutcome>(file, (records) => {
    const rec = records.find((r) => r.googleId === remote.googleId);
    if (!rec) {
      if (remote.deleted) return 'unchanged';
      records.push({
        localId: uid(),
        googleId: remote.googleId,
        syncState: 'clean',
        updatedAt: remote.updatedAt,
        deleted: false,
        data: remote.data,
      });
      return 'created';
    }
    const localPending = rec.syncState !== 'clean';
    if (localPending && rec.updatedAt >= remote.updatedAt) return 'kept-local';
    if (!localPending && remote.updatedAt <= rec.updatedAt) return 'unchanged';
    if (localPending) onOverwrite?.(structuredClone(rec));
    rec.deleted = remote.deleted;
    if (!remote.deleted) rec.data = remote.data;
    rec.syncState = 'clean';
    rec.syncError = undefined;
    rec.updatedAt = remote.updatedAt;
    return remote.deleted ? 'deleted' : 'updated';
  });
}
