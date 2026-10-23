import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fold, tokens } from "../hints.js";
import { extractContext } from "../place.js";
import { extractCitations, noKey, type Citation } from "./legal.js";
import type { Registry } from "./registry.js";
import type { GroupStore } from "./store.js";
import { STATUS_LABEL, type DocRecord, type DocStatus } from "./types.js";

/**
 * Cảnh báo văn bản đang xử lý (đặc tả mục 3).
 * Mức 1 «Căn cứ đã thay đổi»: số hiệu được trích bằng quy tắc, tra trong kho nội bộ, KHÔNG dùng AI và
 * KHÔNG gọi mạng. Mức 2 «Có thể tham khảo»: văn bản mới cùng chủ đề trong các nhóm đang bật, độ tin cậy thấp.
 */

export const DISCLAIMER_ORIGINAL = "Cần đối chiếu văn bản gốc trước khi ban hành.";

export type FindingState = DocStatus | "khong-co-trong-kho";

export interface Finding {
  no: string;
  type?: string;
  state: FindingState;
  title?: string;
  group?: string;
  replacedBy?: { no?: string; title: string; effectiveAt?: string };
  amendedBy?: string[];
}

export interface BasisReport {
  cited: number;
  findings: Finding[];
  /** Các căn cứ đã bị thay thế hoặc sửa đổi: phần cần báo cho người dùng. */
  changed: Finding[];
  /** Số hiệu chưa có trong kho: ghi «Chưa xác định», không suy đoán. */
  unknown: Finding[];
  message: string;
  disclaimer: string;
}

const dateVn = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "");

/** Số hiệu của chính văn bản (dòng «Số: …» ở đầu) không phải căn cứ. */
function ownNumber(text: string): string | undefined {
  const m = /(?:^|\n)\s*Số\s*:?\s*([^\s,;]+)/.exec(text.slice(0, 800));
  return m ? extractCitations(m[1]!)[0]?.key : undefined;
}

export function citedBasis(text: string): Citation[] {
  const own = ownNumber(text);
  return extractCitations(text).filter((c) => c.key !== own);
}

/**
 * Kiểm tra căn cứ của tài liệu đang mở. Chỉ nhận chữ của tài liệu và đọc kho nội bộ.
 * Hàm này không nhận hàm tải mạng, nên không có đường nào gửi nội dung tài liệu ra ngoài.
 */
export function checkBasis(text: string, registry: Registry, o: { groups?: string[] } = {}): BasisReport {
  const cites = citedBasis(text);
  const findings: Finding[] = cites.map((c) => {
    const hit = registry.lookup(c.no, { groups: o.groups });
    if (!hit) return { no: c.no, type: c.type, state: "khong-co-trong-kho" as const };
    const e = hit.effective;
    return {
      no: c.no,
      type: c.type,
      state: e.status,
      title: hit.rec.title,
      group: hit.group,
      replacedBy: e.replacedBy ? { no: e.replacedBy.no, title: e.replacedBy.title, effectiveAt: e.replacedBy.effectiveAt ?? e.replacedBy.issuedAt } : undefined,
      amendedBy: e.amendedBy.map((a) => a.no).filter((n): n is string => !!n),
    };
  });
  const changed = findings.filter((f) => f.state === "het-hieu-luc" || f.state === "da-sua-doi");
  const unknown = findings.filter((f) => f.state === "khong-co-trong-kho");
  return { cited: cites.length, findings, changed, unknown, message: describe(cites.length, changed), disclaimer: DISCLAIMER_ORIGINAL };
}

function label(f: Finding): string {
  return `${f.type ?? "Văn bản"} ${f.no}`;
}

function describe(cited: number, changed: Finding[]): string {
  if (!changed.length) return "";
  const lines = changed.map((f) => {
    if (f.state === "het-hieu-luc") {
      const r = f.replacedBy;
      if (r) return `${label(f)} đã được thay thế bởi ${r.no ?? r.title}${r.effectiveAt ? ` từ ngày ${dateVn(r.effectiveAt)}` : ""}.`;
      return `${label(f)} đã hết hiệu lực.`;
    }
    return `${label(f)} đã được sửa đổi${f.amendedBy?.length ? ` bởi ${f.amendedBy.join(", ")}` : ""}.`;
  });
  return `Văn bản này viện dẫn ${cited} văn bản. ${lines.join(" ")}`;
}

/** Lời nhắc cho nút «Nhờ AI đề xuất sửa». Chỉ gồm số hiệu và tình trạng, không có nội dung tài liệu. */
export function fixPrompt(fileName: string, report: BasisReport): string {
  const rows = report.changed.map((f) => `- ${label(f)}: ${f.state === "het-hieu-luc" ? "đã hết hiệu lực" : "đã được sửa đổi"}${f.replacedBy ? `, thay thế bởi ${f.replacedBy.no ?? f.replacedBy.title}${f.replacedBy.effectiveAt ? ` (hiệu lực ${dateVn(f.replacedBy.effectiveAt)})` : ""}` : ""}`);
  return `Trong tài liệu «${fileName}», phần căn cứ pháp lý có văn bản đã thay đổi:\n${rows.join("\n")}\nHãy đối chiếu với kho văn bản của nhóm, chỉ ra từng chỗ trong tài liệu cần đổi căn cứ và ĐỀ XUẤT câu sửa. Không tự sửa tài liệu; nêu rõ chỗ nào cần người xác nhận. ${DISCLAIMER_ORIGINAL}`;
}

// ---------------------------------------------------------------------------------------------
// Giới hạn tần suất: mỗi văn bản nhắc tối đa một lần mỗi ngày; có nút «Không nhắc cho văn bản này».

interface AlertFile {
  version: 1;
  shown: Record<string, string>;
  muted: string[];
  /** Tài liệu đang soạn có căn cứ thay đổi, chờ người dùng xem (dùng cho bản tin khởi động). */
  pending: Record<string, { at: number; count: number }>;
}

export const localDay = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

export class AlertGate {
  private data: AlertFile = { version: 1, shown: {}, muted: [], pending: {} };
  constructor(private file: string) {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AlertFile>;
      this.data = { version: 1, shown: j.shown ?? {}, muted: j.muted ?? [], pending: j.pending ?? {} };
    } catch {
      /* chưa có */
    }
  }

  private key(f: Finding): string {
    return hash(`${noKey(f.no)}>${f.replacedBy?.no ?? f.state}`);
  }

  /** Chỉ giữ các phát hiện chưa nhắc hôm nay và chưa bị tắt; đánh dấu đã nhắc nếu mark. */
  filter(report: BasisReport, now: number, mark = true): BasisReport {
    const today = localDay(now);
    const keep = report.changed.filter((f) => !this.data.muted.includes(this.key(f)) && this.data.shown[this.key(f)] !== today);
    if (mark && keep.length) {
      for (const f of keep) this.data.shown[this.key(f)] = today;
      // gọn: bỏ mốc cũ hơn 30 ngày
      for (const [k, d] of Object.entries(this.data.shown)) if (d < localDay(now - 30 * 86400_000)) delete this.data.shown[k];
      this.save();
    }
    return { ...report, changed: keep, message: describe(report.cited, keep) };
  }

  mute(f: Finding): void {
    const k = this.key(f);
    if (!this.data.muted.includes(k)) this.data.muted.push(k);
    this.save();
  }

  unmuteAll(): void {
    this.data.muted = [];
    this.save();
  }

  setPending(fileName: string, count: number, now: number): void {
    if (count > 0) this.data.pending[fileName] = { at: now, count };
    else delete this.data.pending[fileName];
    this.save();
  }

  clearPending(fileName?: string): void {
    if (fileName) delete this.data.pending[fileName];
    else this.data.pending = {};
    this.save();
  }

  pendingCount(now: number, maxAgeDays = 14): number {
    return Object.values(this.data.pending).filter((p) => now - p.at < maxAgeDays * 86400_000).length;
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {
      /* ghi lỗi không làm hỏng việc chính */
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Mức 2: «Có thể tham khảo» — văn bản mới cùng chủ đề, chỉ dùng từ khóa rút ra, tìm trong kho nội bộ.

export interface Keywords {
  title?: string;
  numbers: string[];
  words: string[];
}

/**
 * Chỉ số hiệu, tiêu đề và vài từ khóa rút ra được dùng để tra (đặc tả 3.4). Không lấy đoạn văn nào của tài liệu,
 * nên tên học sinh/nhân sự trong nội dung không đi vào truy vấn.
 */
export function safeKeywords(head: string, fileName = ""): Keywords {
  const top = head.slice(0, 1500);
  const ctx = extractContext(top);
  const numbers = citedBasis(head).map((c) => c.no).slice(0, 8);
  // Dòng trích yếu "Về việc …" / "V/v …" là chủ đề của văn bản, không phải thông tin cá nhân.
  const subject = /^\s*(?:V\/v|Về việc)\s*[:\-]?\s*(.{6,160})$/imu.exec(top)?.[1]?.trim();
  const title = [ctx.title, subject].filter(Boolean).join(" – ").replace(/\s+/g, " ").slice(0, 200) || undefined;
  const base = title ?? fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ");
  const generic = new Set(["quyet", "dinh", "ke", "hoach", "cong", "van", "thong", "bao", "to", "trinh", "bien", "ban", "ve", "viec"]);
  const words = [...tokens(base, 4)].filter((t) => !t.includes(" ") && !generic.has(t)).slice(0, 10);
  return { title, numbers, words };
}

export interface Related {
  id: string;
  group: string;
  title: string;
  no?: string;
  url?: string;
  isNew: boolean;
  status: DocStatus;
  statusLabel: string;
  why: string;
}

/** Văn bản mới (hoặc thêm trong 30 ngày) của các nhóm đang bật có chung chủ đề với tài liệu đang mở. */
export function relatedNew(store: GroupStore, kw: Keywords, now = Date.now()): Related[] {
  const want = tokens([kw.title ?? "", kw.words.join(" ")].join(" "), 3);
  if (want.size === 0) return [];
  const out: Array<Related & { s: number }> = [];
  for (const { id, lib } of store.enabledLibraries()) {
    if (store.state().alertsOff?.includes(id)) continue;
    for (const d of lib.book.list()) {
      const fresh = d.isNew || now - d.addedAt < 30 * 86400_000;
      if (!fresh || d.status === "het-hieu-luc") continue;
      const have = tokens(`${d.title} ${d.agency}`, 3);
      let overlap = 0;
      for (const t of want) if (have.has(t)) overlap += t.includes(" ") ? 2 : 1;
      if (overlap < 2) continue;
      out.push({ id: d.id, group: id, title: d.title, no: d.no, url: d.url, isNew: !!d.isNew, status: d.status, statusLabel: STATUS_LABEL[d.status], why: `Cùng chủ đề (nhóm ${store.manifest(id).name})`, s: overlap });
    }
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 6).map(({ s: _s, ...r }) => r);
}

export type { DocRecord };
export const _fold = fold;
