import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chỉ cho phép tên phiên an toàn, tránh thoát khỏi workspace/. */
export function safeSessionId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!cleaned) throw new Error("sessionId không hợp lệ");
  return cleaned;
}

export class Workspace {
  readonly root: string;
  constructor(home?: string) {
    this.root = paths.workspace(home);
    fs.mkdirSync(this.root, { recursive: true });
  }

  /** Tạo (hoặc dùng lại) thư mục ẩn của một phiên. */
  create(sessionId: string): string {
    const dir = path.join(this.root, safeSessionId(sessionId));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Xóa thư mục phiên. Chỉ xóa bên trong workspace/. */
  remove(sessionId: string): boolean {
    const dir = path.join(this.root, safeSessionId(sessionId));
    if (path.dirname(dir) !== this.root) return false;
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /** Khi khởi động: dọn thư mục phiên cũ hơn 24 giờ (máy tắt đột ngột). */
  sweepStale(now = Date.now(), maxAgeMs = DAY_MS): string[] {
    const removed: string[] = [];
    for (const name of fs.readdirSync(this.root)) {
      const dir = path.join(this.root, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(dir);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (now - st.mtimeMs > maxAgeMs) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed.push(name);
      }
    }
    return removed;
  }
}
