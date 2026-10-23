import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CUSTOM_MODE_ID, MODE_LIMITS, parseModesImport, resolveMode, sanitizeCustomMode, type CustomMode, type ModeSpec } from "@pvta/shared";

interface FileData {
  version: 1;
  /** Thứ tự trong mảng là thứ tự hiện trong add-in. */
  modes: CustomMode[];
}

type Result = { ok: true; id?: string } | { ok: false; error: string };

const newId = () => `c-${crypto.randomBytes(6).toString("hex")}`;

/**
 * Chế độ viết người dùng tự tạo. Chế độ có sẵn nằm trong mã (chỉ đọc), không lưu ở đây.
 * Lưu ở bridge nên dùng chung cho Word, Excel, PowerPoint; tệp riêng, tách khỏi cấu hình model.
 */
export class ModeStore {
  private data: FileData;
  constructor(private file: string) {
    this.data = { version: 1, modes: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      const seen = new Set<string>();
      for (const m of parseModesImport(raw).modes) {
        if (!m.id || seen.has(m.id)) m.id = newId();
        seen.add(m.id);
        this.data.modes.push(m);
      }
    } catch {
      /* chưa có tệp hoặc tệp hỏng: bắt đầu trống */
    }
  }

  list(): CustomMode[] {
    return this.data.modes;
  }

  /** Thông số chạy của một chế độ bất kỳ (có sẵn hoặc tự tạo). */
  resolve(id: unknown): ModeSpec | undefined {
    return resolveMode(id, this.data.modes);
  }

  has(id: unknown): id is string {
    return this.resolve(id) !== undefined;
  }

  /** Thêm mới (không có mã) hoặc sửa (có mã đã tồn tại). */
  save(input: unknown): Result {
    const r = sanitizeCustomMode(input);
    if (!r.ok) return r;
    const m = r.mode;
    const i = m.id ? this.data.modes.findIndex((x) => x.id === m.id) : -1;
    if (i >= 0) this.data.modes[i] = m;
    else {
      if (this.data.modes.length >= MODE_LIMITS.count) return { ok: false, error: `Đã đủ ${MODE_LIMITS.count} chế độ tự tạo; hãy xóa bớt.` };
      m.id = newId();
      this.data.modes.push(m);
    }
    this.write();
    return { ok: true, id: m.id };
  }

  remove(id: string): boolean {
    const before = this.data.modes.length;
    this.data.modes = this.data.modes.filter((m) => m.id !== id);
    if (this.data.modes.length === before) return false;
    this.write();
    return true;
  }

  /** Đổi thứ tự theo danh sách mã; mã lạ bỏ qua, chế độ không có trong danh sách giữ ở cuối. */
  reorder(ids: unknown): void {
    if (!Array.isArray(ids)) return;
    const byId = new Map(this.data.modes.map((m) => [m.id, m]));
    const out: CustomMode[] = [];
    for (const id of ids) {
      const m = typeof id === "string" && CUSTOM_MODE_ID.test(id) ? byId.get(id) : undefined;
      if (m) {
        out.push(m);
        byId.delete(id as string);
      }
    }
    out.push(...byId.values());
    this.data.modes = out;
    this.write();
  }

  /** Nhập từ tệp JSON: thêm vào cuối (hoặc thay toàn bộ khi replace). Luôn cấp mã mới. */
  import(raw: unknown, replace = false): { ok: boolean; added: number; errors: string[] } {
    const { modes, errors } = parseModesImport(raw);
    if (modes.length === 0) return { ok: false, added: 0, errors: errors.length ? errors : ["Tệp không có chế độ hợp lệ."] };
    const base = replace ? [] : this.data.modes;
    const room = MODE_LIMITS.count - base.length;
    const take = modes.slice(0, Math.max(0, room)).map((m) => ({ ...m, id: newId() }));
    if (take.length < modes.length) errors.push(`Chỉ nhập được ${take.length}/${modes.length} chế độ (tối đa ${MODE_LIMITS.count}).`);
    if (take.length === 0) return { ok: false, added: 0, errors };
    this.data.modes = [...base, ...take];
    this.write();
    return { ok: true, added: take.length, errors };
  }

  /** Khôi phục mặc định: xóa mọi chế độ tự tạo. */
  reset(): void {
    this.data.modes = [];
    this.write();
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
