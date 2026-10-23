import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseCsv, toCsv } from "./csv.js";
import { noKey } from "./legal.js";
import { DOC_STATUS, STATUS_LABEL, type DocRecord, type DocStatus } from "./types.js";

/**
 * Danh sách văn bản của một nhóm: docs.json (đầy đủ, máy đọc) và sources.csv (gọn, dùng để chia sẻ:
 * STT, tên văn bản, cơ quan, ngày ban hành, tình trạng, link nguồn).
 */

export const CSV_HEADER = ["STT", "Tên văn bản", "Cơ quan", "Ngày ban hành", "Tình trạng", "Link nguồn", "Số hiệu"];

/** Tên miền được tải tự do (đặc tả 1.10); nguồn khác phải được người dùng xác nhận. */
const BASE_ALLOWED = [/\.gov\.vn$/, /^vbpl\.vn$/, /^(www\.)?thuvienphapluat\.vn$/, /\.edu\.vn$/];

export function hostOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

export function isAllowedHost(host: string, extra: string[] = []): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (BASE_ALLOWED.some((re) => re.test(h))) return true;
  return extra.some((d) => {
    const x = d.replace(/^www\./, "").toLowerCase();
    return h === x || h.endsWith("." + x);
  });
}

export function statusFromLabel(s: string): DocStatus {
  const t = s.trim().toLowerCase();
  for (const id of DOC_STATUS) if (STATUS_LABEL[id].toLowerCase() === t || id === t) return id;
  return "chua-xac-dinh";
}

export class DocBook {
  private items: DocRecord[] = [];
  constructor(
    private dir: string,
    private groupId: string,
  ) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, "docs.json"), "utf8")) as { items?: DocRecord[] };
      if (Array.isArray(raw.items)) this.items = raw.items.filter((d) => d && typeof d.id === "string" && typeof d.title === "string");
    } catch {
      /* chưa có */
    }
    // Trạng thái "đang tải" không thể còn nguyên sau khi mở lại ứng dụng.
    for (const d of this.items) if (d.state === "dang-tai") d.state = d.file ? "da-tai" : "chua-tai";
  }

  get group(): string {
    return this.groupId;
  }

  list(opts: { includeHidden?: boolean } = {}): DocRecord[] {
    return this.items.filter((d) => opts.includeHidden || !d.hidden).map((d) => ({ ...d }));
  }

  get(id: string): DocRecord | undefined {
    const d = this.items.find((x) => x.id === id);
    return d ? { ...d } : undefined;
  }

  byNo(no: string): DocRecord | undefined {
    const k = noKey(no);
    const d = this.items.find((x) => x.no && noKey(x.no) === k);
    return d ? { ...d } : undefined;
  }

  /** Thêm văn bản; trùng số hiệu hoặc trùng link thì gộp vào bản đã có. */
  add(input: Partial<DocRecord> & { title: string }, now = Date.now()): DocRecord {
    const url = input.url?.trim() || undefined;
    const dup = this.items.find((d) => (input.no && d.no && noKey(d.no) === noKey(input.no)) || (url && d.url === url));
    if (dup) {
      for (const k of ["no", "agency", "issuedAt", "url"] as const) if (input[k] && !dup[k]) (dup as unknown as Record<string, unknown>)[k] = k === "url" ? url : input[k];
      if (dup.url && !dup.host) dup.host = hostOf(dup.url);
      this.save();
      return { ...dup };
    }
    const rec: DocRecord = {
      id: input.id ?? "d" + crypto.randomBytes(5).toString("hex"),
      no: input.no?.trim() || undefined,
      title: input.title.trim().slice(0, 300),
      agency: (input.agency ?? "").trim().slice(0, 200),
      issuedAt: input.issuedAt,
      effectiveAt: input.effectiveAt,
      status: input.status && DOC_STATUS.includes(input.status) ? input.status : "chua-xac-dinh",
      url,
      host: url ? hostOf(url) : undefined,
      state: input.state ?? "chua-tai",
      isNew: input.isNew,
      addedAt: now,
      source: input.source ?? "tay",
    };
    this.items.push(rec);
    this.save();
    return { ...rec };
  }

  update(id: string, patch: Partial<DocRecord>): DocRecord | undefined {
    const d = this.items.find((x) => x.id === id);
    if (!d) return undefined;
    const { id: _id, addedAt: _a, ...rest } = patch;
    Object.assign(d, rest);
    if (patch.url !== undefined) d.host = patch.url ? hostOf(patch.url) : undefined;
    this.save();
    return { ...d };
  }

  remove(id: string): DocRecord | undefined {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return undefined;
    const [d] = this.items.splice(i, 1);
    this.save();
    return d;
  }

  markSeen(): void {
    let changed = false;
    for (const d of this.items) if (d.isNew) (d.isNew = false), (changed = true);
    if (changed) this.save();
  }

  save(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, "docs.json"), JSON.stringify({ version: 1, items: this.items }, null, 2));
    fs.writeFileSync(path.join(this.dir, "sources.csv"), this.toSourcesCsv());
  }

  toSourcesCsv(): string {
    const rows = [CSV_HEADER, ...this.items.map((d, i) => [String(i + 1), d.title, d.agency, d.issuedAt ?? "", STATUS_LABEL[d.status], d.url ?? "", d.no ?? ""])];
    return toCsv(rows);
  }
}

/** Đọc sources.csv của gói nhóm thành bản ghi chưa tải. Link phải là https. */
export function recordsFromCsv(text: string): { records: Array<Partial<DocRecord> & { title: string }>; skipped: string[] } {
  const rows = parseCsv(text);
  const records: Array<Partial<DocRecord> & { title: string }> = [];
  const skipped: string[] = [];
  const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (name: string) => head.findIndex((h) => h === name.toLowerCase());
  const iTitle = col("Tên văn bản");
  if (iTitle < 0) return { records, skipped: ["Thiếu cột «Tên văn bản»."] };
  const iAgency = col("Cơ quan");
  const iDate = col("Ngày ban hành");
  const iStatus = col("Tình trạng");
  const iUrl = col("Link nguồn");
  const iNo = col("Số hiệu");
  for (const r of rows.slice(1)) {
    const title = (r[iTitle] ?? "").trim();
    if (!title) continue;
    const url = iUrl >= 0 ? (r[iUrl] ?? "").trim() : "";
    if (url && !/^https:\/\//i.test(url)) {
      skipped.push(`${title}: link không phải https, đã bỏ link.`);
    }
    records.push({
      title,
      agency: iAgency >= 0 ? (r[iAgency] ?? "").trim() : "",
      issuedAt: iDate >= 0 && /^\d{4}-\d{2}-\d{2}$/.test((r[iDate] ?? "").trim()) ? r[iDate]!.trim() : undefined,
      status: iStatus >= 0 ? statusFromLabel(r[iStatus] ?? "") : "chua-xac-dinh",
      url: /^https:\/\//i.test(url) ? url : undefined,
      no: iNo >= 0 ? (r[iNo] ?? "").trim() || undefined : undefined,
      source: "goi",
    });
  }
  return { records, skipped };
}
