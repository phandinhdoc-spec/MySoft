import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolCall, ToolResult } from "@pvta/shared";
import { NotebookHost } from "@pvta/core/desktop/notebook-host";
import { pythonJob } from "@pvta/core/desktop/documents";
import { MEDIA_EXT, NOTEBOOK_LIMITS, type Ask } from "@pvta/core/notebook/index";

/**
 * Sổ nguồn cho add-in. Dùng CHUNG thư mục `notebooks/` trong dữ liệu PVTA với PVTA Chat:
 * sổ tạo ở bên nào thì bên kia thấy ngay (bộ nhớ đệm tự nạp lại khi tệp đổi).
 * Sổ được liên kết với add-in lưu ở `addin-notebooks.json` (chung cho Word, Excel, PowerPoint).
 */

export const UPLOAD_LIMITS = { chunk: 6 * 1024 * 1024, docBytes: 30 * 1024 * 1024, pendingMs: 10 * 60_000 } as const;
const UPLOAD_EXT = new Set([".pdf", ".docx", ".xlsx", ".pptx", ".md", ".txt", ".csv", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".mov", ".mkv", ".webm"]);
const ID_RE = /^[a-f0-9]{16}$/;

/** Bridge chạy riêng (không phải sidecar của Chat) nên tự tìm tệp documents.py đi kèm. */
export function ensurePythonScript(env: NodeJS.ProcessEnv = process.env): void {
  if (env.PVTA_PYTHON_SCRIPT && fs.existsSync(env.PVTA_PYTHON_SCRIPT)) return;
  const here = (() => {
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  })();
  for (const c of [path.join(here, "documents.py"), path.join(here, "..", "..", "core", "python", "documents.py"), path.join(here, "..", "python", "documents.py")]) {
    if (fs.existsSync(c)) {
      env.PVTA_PYTHON_SCRIPT = c;
      return;
    }
  }
}

interface Pending {
  file: string;
  size: number;
  at: number;
  name: string;
}

export interface AddinNotebooksOptions {
  home: string;
  ask: Ask;
  /** Báo mọi cửa sổ add-in rằng sổ này vừa đổi. */
  changed: (id: string) => void;
  fetcher?: typeof fetch;
}

export class AddinNotebooks {
  readonly host: NotebookHost;
  private linkFile: string;
  private tmp: string;
  private pending = new Map<string, Pending>();

  constructor(private o: AddinNotebooksOptions) {
    ensurePythonScript();
    this.linkFile = path.join(o.home, "addin-notebooks.json");
    this.tmp = path.join(os.tmpdir(), `pvta-upload-${process.pid}`);
    this.host = new NotebookHost({ home: o.home, ask: o.ask, notify: o.changed, fetcher: o.fetcher });
  }

  /** Mã các sổ đang liên kết với add-in (chỉ giữ sổ còn tồn tại). */
  links(): string[] {
    let ids: string[] = [];
    try {
      const raw = JSON.parse(fs.readFileSync(this.linkFile, "utf8")) as { ids?: unknown };
      if (Array.isArray(raw.ids)) ids = raw.ids.filter((x): x is string => typeof x === "string" && ID_RE.test(x));
    } catch {
      /* chưa có tệp */
    }
    const alive = new Set(this.host.store.list().map((b) => b.id));
    return [...new Set(ids)].filter((id) => alive.has(id)).slice(0, 12);
  }

  setLinks(ids: unknown): string[] {
    const want = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && ID_RE.test(x)) : [];
    const alive = new Set(this.host.store.list().map((b) => b.id));
    const out = [...new Set(want)].filter((id) => alive.has(id)).slice(0, 12);
    const tmp = `${this.linkFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ids: out }), { mode: 0o600 });
    fs.renameSync(tmp, this.linkFile);
    return out;
  }

  /** Đoạn trích + danh mục tệp từ các sổ liên kết, thêm vào đầu mỗi lượt chat. */
  section(text: string): string {
    return this.host.grounding(this.links(), text);
  }

  tool(call: ToolCall): ToolResult {
    try {
      return { tool: call.tool, ok: true, result: this.host.read(this.links(), call.args) };
    } catch (e) {
      return { tool: call.tool, ok: false, error: (e as Error).message };
    }
  }

  /** RPC từ add-in. Ngoài các lệnh nb.* còn có nb.links / nb.setLinks. */
  async rpc(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (method === "nb.links") return this.links();
    if (method === "nb.setLinks") return this.setLinks(params.ids);
    // Add-in không có đường dẫn tệp trên máy: chỉ nhận tệp qua upload, không nhận paths tùy ý.
    if (method === "nb.addFiles") throw Error("Hãy dùng nút Thêm tệp trong add-in.");
    return this.host.rpc(method, params, signal);
  }

  private sweep(now = Date.now()): void {
    for (const [k, p] of this.pending) {
      if (now - p.at > UPLOAD_LIMITS.pendingMs) {
        fs.rmSync(p.file, { force: true });
        this.pending.delete(k);
      }
    }
  }

  /**
   * Nhận tệp từng phần (base64). Phần cuối xong thì trả đường dẫn tệp tạm (đặt tên gốc để Sổ nguồn lấy làm tiêu đề).
   * Gọi `done` khi không còn cần tệp tạm.
   */
  async receive(m: { req: string; name: unknown; part: unknown; last: unknown; data: unknown }): Promise<{ done: false } | { done: true; file: string; dir: string }> {
    this.sweep();
    const req = String(m.req ?? "");
    if (!/^[\w-]{1,64}$/.test(req)) throw Error("Mã tải tệp không hợp lệ.");
    const name = path.basename(String(m.name ?? "").replace(/[\u0000-\u001f]/g, "")).slice(-150);
    const ext = path.extname(name).toLowerCase();
    if (!name || !UPLOAD_EXT.has(ext)) throw Error(`Chưa hỗ trợ loại tệp ${ext || "này"}.`);
    const data = typeof m.data === "string" ? m.data : "";
    if (data.length > UPLOAD_LIMITS.chunk * 1.4) throw Error("Phần dữ liệu quá lớn.");
    const buf = Buffer.from(data, "base64");
    let p = this.pending.get(req);
    if (Number(m.part) === 0 || !p) {
      if (Number(m.part) !== 0) throw Error("Phiên tải tệp đã hết hạn, hãy thử lại.");
      const dir = path.join(this.tmp, crypto.randomBytes(8).toString("hex"));
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      p = { file: path.join(dir, name), size: 0, at: Date.now(), name };
      this.pending.set(req, p);
    }
    p.size += buf.length;
    p.at = Date.now();
    if (p.size > (MEDIA_EXT.has(ext) ? NOTEBOOK_LIMITS.mediaBytes : UPLOAD_LIMITS.docBytes)) {
      this.cancel(req);
      throw Error(MEDIA_EXT.has(ext) ? "Tệp âm thanh/video quá 1 GB." : "Tệp quá 30 MB.");
    }
    fs.appendFileSync(p.file, buf, { mode: 0o600 });
    if (m.last !== true) return { done: false };
    this.pending.delete(req);
    return { done: true, file: p.file, dir: path.dirname(p.file) };
  }

  cancel(req: string): void {
    const p = this.pending.get(req);
    if (!p) return;
    fs.rmSync(path.dirname(p.file), { recursive: true, force: true });
    this.pending.delete(req);
  }

  /** Thêm tệp đã tải lên vào sổ (đọc nền, tuần tự). Xóa tệp tạm khi xong. */
  async addUploaded(nb: string, file: string, dir: string): Promise<{ queued: number; errors: string[] }> {
    try {
      this.host.store.checkFile(nb, file);
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      return { queued: 0, errors: [`${path.basename(file)}: ${(e as Error).message}`] };
    }
    const r = (await this.host.rpc("nb.addFiles", { id: nb, paths: [file] })) as { queued: number; errors: string[] };
    // Tệp được đọc ngầm theo hàng đợi; chờ trạng thái rời «đang đọc» rồi mới xóa tệp tạm.
    void this.whenSettled(nb, file).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
    return r;
  }

  private async whenSettled(nb: string, file: string): Promise<void> {
    const title = path.basename(file);
    for (let i = 0; i < 4 * 3600 * 2; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const book = this.host.store.get(nb);
        const s = book.sources.filter((x) => x.title === title || x.origin === file);
        if (!s.length || s.every((x) => x.state !== "dang-doc")) return;
      } catch {
        return;
      }
    }
  }

  /** OCR một PDF scan: trả văn bản có nhãn «[Trang N]», hoặc lý do chưa đọc được. */
  async ocrPdf(file: string, signal?: AbortSignal): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
    try {
      const r = await pythonJob({ op: "ocr", path: file }, signal, 30 * 60_000);
      if (r?.unavailable) return { ok: false, reason: String(r.unavailable) };
      const segs = (r?.segments ?? []) as Array<{ ref: string; text: string }>;
      const parts = segs
        .filter((s) => s.text && s.text.trim().length > 3)
        .map((s, i) => {
          const m = /(\d+)/.exec(String(s.ref ?? ""));
          return `[Trang ${m ? m[1] : i + 1}]\n${s.text.trim()}`;
        });
      if (!parts.length) return { ok: false, reason: "OCR không nhận ra chữ nào trong PDF này." };
      return { ok: true, text: parts.join("\n\n") };
    } catch (e) {
      return { ok: false, reason: `Chưa OCR được: ${(e as Error).message}` };
    }
  }
}
