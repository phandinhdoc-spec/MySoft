import fs from "node:fs";
import path from "node:path";
import type { BackendId, ToolResult } from "@pvta/shared";

/**
 * Ảnh xem trước (office_*_get_preview): add-in chụp slide / vùng ô (PNG) hoặc xuất văn bản ra PDF,
 * bridge lưu vào thư mục phiên rồi GỬI KÈM lượt gọi model kế tiếp để model tự nhìn kết quả trình bày.
 */

export const PREVIEW_TOOL = /^office_(word|excel|ppt)_get_preview$/;
const MAX_FILES = 12;
const MAX_BYTES = 8 * 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47];
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF

function kind(buf: Buffer): "png" | "pdf" | undefined {
  const starts = (sig: number[]) => sig.every((b, i) => buf[i] === b);
  return starts(PNG) ? "png" : starts(PDF) ? "pdf" : undefined;
}

/** Backend nào xem được loại tệp nào. API chưa gửi được tệp; codex chỉ nhận ảnh. */
export function canView(backend: BackendId, k: "png" | "pdf"): boolean {
  if (backend === "api") return false;
  if (backend === "codex" || backend === "opencode") return k === "png";
  return true;
}

export interface SavedPreview {
  /** Kết quả thay thế để trả cho model (không còn base64). */
  result: ToolResult;
  /** Đường dẫn tệp cần gửi kèm lượt sau. */
  files: string[];
}

/** Lưu tệp xem trước vào <cwd>/preview và đổi kết quả công cụ thành danh sách tệp (không gửi base64 cho model). */
export function savePreview(cwd: string, r: ToolResult, backend: BackendId, round: number): SavedPreview {
  if (!r.ok) return { result: r, files: [] };
  const raw = (r.result ?? {}) as { files?: unknown; note?: unknown; address?: unknown };
  const list = Array.isArray(raw.files) ? raw.files.slice(0, MAX_FILES) : [];
  const dir = path.join(cwd, "preview");
  const files: string[] = [];
  const skipped: string[] = [];
  for (const [i, f] of list.entries()) {
    const o = (f ?? {}) as Record<string, unknown>;
    if (typeof o.b64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(o.b64)) continue;
    const buf = Buffer.from(o.b64, "base64");
    const k = buf.length <= MAX_BYTES ? kind(buf) : undefined;
    if (!k) continue;
    const base = String(o.name ?? `xem-truoc-${i + 1}`).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || `xem-truoc-${i + 1}`;
    if (!canView(backend, k)) {
      skipped.push(`${base}.${k}`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `v${round}-${base}.${k}`);
    fs.writeFileSync(file, buf);
    files.push(file);
  }
  const note = typeof raw.note === "string" && raw.note ? raw.note : undefined;
  if (files.length === 0) {
    const why = skipped.length
      ? backend === "api"
        ? "Model chạy bằng khóa API chưa xem được ảnh: bỏ qua bước nhìn, kiểm tra bằng công cụ đọc."
        : "Model này không mở được tệp PDF xem trước: kiểm tra bằng công cụ đọc."
      : "Không có ảnh xem trước (tài liệu trống hoặc không chụp được).";
    return { result: { tool: r.tool, ok: true, result: { files: [], note: [why, note].filter(Boolean).join(" ") } }, files: [] };
  }
  return {
    result: {
      tool: r.tool,
      ok: true,
      result: {
        files: files.map((f) => path.relative(cwd, f).split(path.sep).join("/")),
        address: typeof raw.address === "string" ? raw.address : undefined,
        note: [
          "Các tệp này được gửi kèm lượt này. MỞ VÀ NHÌN từng tệp như người xem thật: chữ tràn/bị cắt, lệch lề, khoảng trống bất thường, chữ quá nhỏ, màu khó đọc, bảng vỡ, hình tách khỏi câu. Sửa những lỗi thấy được rồi mới báo xong. Không sửa nội dung.",
          note,
        ]
          .filter(Boolean)
          .join(" "),
      },
    },
    files,
  };
}
