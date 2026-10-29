import fs from 'node:fs';
import path from 'node:path';
import { uid } from './storage.js';
import {
  type CalendarAttachment,
  getRecord,
  recordFilePath,
  type CalendarRecordKind,
  updateAttachments,
} from './calendar-store.js';

// Đính kèm cục bộ cho bản ghi lịch/công việc/ghi chú.
// Bản sao nằm ở <root>/attachments/<localId>/. Không có giới hạn dung lượng (theo xác nhận của thầy).
// Không có hàm nào trong module này gọi Google; danh sách đính kèm không nằm trong `data`.

const LOCAL_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const ATTACHMENTS_DIR = 'attachments';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
};

export interface AddAttachmentInput {
  /** Đường dẫn tệp gốc trên máy thầy. Tệp gốc không bị thay đổi hay xóa. */
  sourcePath: string;
  kind: CalendarRecordKind;
  root: string;
  localId: string;
  now?: Date;
}

function assertLocalId(localId: string): void {
  if (!LOCAL_ID_RE.test(localId)) throw new Error(`Mã bản ghi không hợp lệ: ${localId}`);
}

/** Thư mục đính kèm của một bản ghi: <root>/attachments/<localId>. */
export function attachmentDir(root: string, localId: string): string {
  assertLocalId(localId);
  return path.join(root, ATTACHMENTS_DIR, localId);
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return cleaned.length ? cleaned.slice(0, 180) : 'tep-dinh-kem';
}

function guessMime(name: string): string {
  return MIME_BY_EXT[path.extname(name).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Sao chép tệp vào attachments/<localId>/ và gắn vào bản ghi.
 * Lỗi nêu đúng tệp gây lỗi. Tệp gốc giữ nguyên. Nếu gắn vào bản ghi thất bại, bản sao vừa tạo bị xóa.
 */
export function addAttachment(input: AddAttachmentInput): CalendarAttachment {
  assertLocalId(input.localId);
  const file = recordFilePath(input.root, input.kind);
  const rec = getRecord(file, input.localId);
  if (!rec) throw new Error(`Không tìm thấy bản ghi ${input.localId}`);
  if (rec.deleted) throw new Error(`Bản ghi ${input.localId} đã xóa, không thể đính kèm`);

  const src = path.resolve(input.sourcePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(src);
  } catch {
    throw new Error(`Không tìm thấy tệp để đính kèm: ${src}`);
  }
  if (!stat.isFile()) throw new Error(`Không phải tệp, không thể đính kèm: ${src}`);

  const id = `att-${uid()}`;
  const baseName = path.basename(src);
  const dir = attachmentDir(input.root, input.localId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const storedName = `${id}-${safeFileName(baseName)}`;
  const dest = path.join(dir, storedName);
  try {
    // COPYFILE_EXCL: không bao giờ ghi đè tệp đã có.
    fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(dest, 0o600);
  } catch (err) {
    throw new Error(`Không sao chép được tệp ${src}: ${(err as Error).message}`);
  }

  const mimeType = guessMime(baseName);
  const attachment: CalendarAttachment = {
    id,
    name: baseName,
    localPath: path.posix.join(ATTACHMENTS_DIR, input.localId, storedName),
    originalPath: src,
    mimeType,
    size: stat.size,
    kind: mimeType.startsWith('image/') ? 'image' : 'file',
    addedAt: (input.now ?? new Date()).toISOString(),
    localOnly: true,
  };

  try {
    updateAttachments(file, input.localId, (list) => [...list, attachment]);
  } catch (err) {
    fs.rmSync(dest, { force: true }); // chỉ xóa bản sao vừa tạo, không đụng tệp gốc
    throw err;
  }
  return attachment;
}

/** Trả về đường dẫn tuyệt đối của một đính kèm để mở. Từ chối đường dẫn nằm ngoài thư mục đính kèm. */
export function resolveAttachmentPath(root: string, localId: string, attachment: CalendarAttachment): string {
  const dir = attachmentDir(root, localId);
  const abs = path.resolve(root, attachment.localPath);
  if (!abs.startsWith(dir + path.sep)) {
    throw new Error(`Đường dẫn đính kèm nằm ngoài thư mục cho phép: ${attachment.name}`);
  }
  if (!fs.existsSync(abs)) {
    throw new Error(`Bản sao của tệp không còn trên máy: ${attachment.name} (${abs})`);
  }
  return abs;
}

/** Tìm đính kèm theo id, trả về đường dẫn mở được. Việc mở tệp do lớp giao diện thực hiện. */
export function openAttachment(input: { kind: CalendarRecordKind; root: string; localId: string; attachmentId: string }): string {
  const file = recordFilePath(input.root, input.kind);
  const rec = getRecord(file, input.localId);
  const att = rec?.attachments?.find((a) => a.id === input.attachmentId);
  if (!att) throw new Error(`Không tìm thấy đính kèm ${input.attachmentId} trong bản ghi ${input.localId}`);
  return resolveAttachmentPath(input.root, input.localId, att);
}

/**
 * Gỡ đính kèm khỏi bản ghi. CHỈ bỏ liên kết; bản sao trong attachments/ được giữ nguyên.
 * Trả về đính kèm đã gỡ, hoặc undefined nếu không có.
 */
export function detachAttachment(input: {
  kind: CalendarRecordKind;
  root: string;
  localId: string;
  attachmentId: string;
}): CalendarAttachment | undefined {
  const file = recordFilePath(input.root, input.kind);
  let removed: CalendarAttachment | undefined;
  updateAttachments(file, input.localId, (list) => {
    removed = list.find((a) => a.id === input.attachmentId);
    return list.filter((a) => a.id !== input.attachmentId);
  });
  return removed;
}

/** Danh sách đính kèm hiện gắn với bản ghi. */
export function listAttachments(input: { kind: CalendarRecordKind; root: string; localId: string }): CalendarAttachment[] {
  const rec = getRecord(recordFilePath(input.root, input.kind), input.localId);
  return rec?.attachments ? [...rec.attachments] : [];
}
