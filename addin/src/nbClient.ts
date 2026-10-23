import type { ClientMessage, ServerMessage } from "@pvta/shared";

/** Kết nối tối thiểu cần dùng (BridgeClient thỏa mãn). */
export interface NbTransport {
  send(m: ClientMessage): boolean;
  onMessage(h: (m: ServerMessage) => void): () => void;
}

export interface NbSourceInfo {
  id: string;
  title: string;
  kind: "file" | "audio" | "youtube" | "web";
  origin: string;
  state: "dang-doc" | "san-sang" | "loi";
  error?: string;
  note?: string;
  chars: number;
  on: boolean;
}
export interface NbCitation {
  n: number;
  sourceId: string;
  title: string;
  ref: string;
  quote: string;
  url?: string;
}
export interface NbMessageInfo {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: NbCitation[];
  grounded?: boolean;
}
export interface NotebookFull {
  id: string;
  name: string;
  sources: NbSourceInfo[];
  messages: NbMessageInfo[];
}
export interface NotebookBrief {
  id: string;
  name: string;
  updatedAt: number;
  sources: number;
}

export const UPLOAD_CHUNK = 3 * 1024 * 1024;

export async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Gọi Sổ nguồn của bridge (dùng chung dữ liệu với PVTA Chat). */
export class NbClient {
  private waiting = new Map<string, { ok(v: unknown): void; fail(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private changed = new Set<(id: string) => void>();
  private off: () => void;

  constructor(private tx: NbTransport) {
    this.off = tx.onMessage((m) => {
      if (m.type === "nb_changed") this.changed.forEach((h) => h(m.id));
      else if (m.type === "nb_reply") {
        const w = this.waiting.get(m.req);
        if (!w) return;
        this.waiting.delete(m.req);
        clearTimeout(w.timer);
        if (m.ok) w.ok(m.data);
        else w.fail(new Error(m.error || "Có lỗi khi xử lý Sổ nguồn."));
      }
    });
  }

  dispose(): void {
    this.off();
    for (const w of this.waiting.values()) {
      clearTimeout(w.timer);
      w.fail(new Error("Đã đóng."));
    }
    this.waiting.clear();
  }

  onChanged(h: (id: string) => void): () => void {
    this.changed.add(h);
    return () => this.changed.delete(h);
  }

  private expect<T>(key: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((ok, fail) => {
      const timer = setTimeout(() => {
        this.waiting.delete(key);
        fail(new Error("Hết thời gian chờ PVTA."));
      }, timeoutMs);
      this.waiting.set(key, { ok: ok as (v: unknown) => void, fail, timer });
    });
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15 * 60_000): Promise<T> {
    const req = rid();
    const p = this.expect<T>(req, timeoutMs);
    if (!this.tx.send({ type: "nb", req, method, params })) {
      const w = this.waiting.get(req);
      if (w) {
        clearTimeout(w.timer);
        this.waiting.delete(req);
      }
      return Promise.reject(new Error("Chưa kết nối PVTA."));
    }
    return p;
  }

  cancel(req: string): void {
    this.tx.send({ type: "nb_cancel", req });
  }

  /** Tải một tệp lên bridge từng phần. purpose "notebook": thêm vào sổ nb; "ocr": trả {text}. */
  async upload<T = unknown>(file: File, opts: { purpose: "notebook" | "ocr"; nb?: string; onProgress?: (done: number, total: number) => void }): Promise<T> {
    const req = rid();
    const parts = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK));
    let last: unknown;
    for (let part = 0; part < parts; part++) {
      const data = await toBase64(file.slice(part * UPLOAD_CHUNK, (part + 1) * UPLOAD_CHUNK));
      const isLast = part === parts - 1;
      // OCR phần cuối có thể rất lâu; các phần giữa chỉ chờ xác nhận.
      const p = this.expect<unknown>(`${req}#${part}`, isLast ? 40 * 60_000 : 60_000);
      if (!this.tx.send({ type: "nb_upload", req, purpose: opts.purpose, nb: opts.nb, name: file.name, part, last: isLast, data })) {
        const w = this.waiting.get(`${req}#${part}`);
        if (w) {
          clearTimeout(w.timer);
          this.waiting.delete(`${req}#${part}`);
        }
        throw new Error("Chưa kết nối PVTA.");
      }
      try {
        last = await p;
      } catch (e) {
        this.tx.send({ type: "nb_cancel", req });
        throw e;
      }
      opts.onProgress?.(part + 1, parts);
    }
    return last as T;
  }
}
