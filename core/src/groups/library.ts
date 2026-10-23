import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isAllowedHost, DocBook, hostOf } from "./book.js";
import { downloadDoc, sniffDoc, MAX_DOC_BYTES, type DocExt } from "./download.js";
import { openIndex, type Hit, type LegalIndex } from "./index.js";
import { chunkLegal, noKey, readFacts, statusFromDates } from "./legal.js";
import { estimateSummary, summarize, SummaryCache, type Ask, type SummaryEstimate } from "./summary.js";
import type { DocRecord, DocStatus, GroupManifest } from "./types.js";
import type { Fetcher, Resolver } from "../refs.js";

/**
 * Kho văn bản của MỘT nhóm: danh sách, tệp đã tải (kho/), chỉ mục tra cứu (index.db) và bản tóm tắt.
 * kho/ và index.db không đóng gói khi chia sẻ nhóm (dung lượng, bản quyền); index.db tạo lại được.
 */

export interface Segment {
  ref: string;
  text: string;
}

export interface LibraryDeps {
  /** Đọc chữ từ PDF/DOCX (lõi dùng Python). */
  extract(file: string): Promise<{ segments: Segment[]; image?: boolean }>;
  /** OCR cho PDF ảnh scan; trả {unavailable} nếu máy chưa có công cụ. */
  ocr?(file: string): Promise<{ segments: Segment[] } | { unavailable: string }>;
  fetcher?: Fetcher;
  resolve?: Resolver;
  now?: () => number;
  /** Chỉ mục trong bộ nhớ (kiểm thử). */
  memoryIndex?: boolean;
}

const MIN_LETTERS = 80;
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const day = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

export class GroupLibrary {
  readonly book: DocBook;
  private idx?: LegalIndex;
  private summaries: SummaryCache;
  constructor(
    readonly dir: string,
    private manifest: () => GroupManifest,
    private deps: LibraryDeps,
  ) {
    fs.mkdirSync(path.join(dir, "kho"), { recursive: true });
    this.book = new DocBook(dir, manifest().id);
    this.summaries = new SummaryCache(path.join(dir, "summaries"));
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  index(): LegalIndex {
    return (this.idx ??= openIndex(path.join(this.dir, "index.db"), { forceMemory: this.deps.memoryIndex }));
  }

  close(): void {
    this.idx?.close();
    this.idx = undefined;
  }

  private abs(rec: DocRecord): string | undefined {
    return rec.file ? path.join(this.dir, rec.file) : undefined;
  }

  /** Người dùng dán link: chỉ ghi vào danh sách, chưa tải. */
  addLink(url: string, meta: { title?: string; agency?: string; no?: string } = {}): DocRecord {
    const host = hostOf(url);
    if (!host || !/^https:\/\//i.test(url.trim())) throw new Error("Chỉ nhận link https hợp lệ.");
    const title = (meta.title ?? "").trim() || `${host}${new URL(url).pathname.replace(/\/$/, "").slice(0, 60)}`;
    return this.book.add({ title, agency: meta.agency, no: meta.no, url: url.trim(), source: "tay" });
  }

  /** Người dùng chọn tệp: chép vào kho/ rồi lập chỉ mục. */
  async addFile(src: string, meta: { title?: string; agency?: string; no?: string } = {}): Promise<DocRecord> {
    const st = fs.statSync(src);
    if (!st.isFile() || st.size > MAX_DOC_BYTES) throw new Error(`Chỉ nhận tệp không quá ${Math.round(MAX_DOC_BYTES / 1048576)} MB.`);
    const data = fs.readFileSync(src);
    const ext = sniffDoc(data);
    if (!ext) throw new Error("Chỉ nhận PDF, DOC, DOCX.");
    const title = (meta.title ?? path.basename(src, path.extname(src))).trim();
    const rec = this.book.add({ title, agency: meta.agency, no: meta.no, source: "tay" });
    this.saveFile(rec.id, data, ext);
    return this.ingest(rec.id);
  }

  private saveFile(id: string, data: Buffer, ext: DocExt): DocRecord {
    const rel = path.join("kho", `${id}${ext}`);
    fs.writeFileSync(path.join(this.dir, rel), data);
    return this.book.update(id, { file: rel, hash: sha256(data), state: "da-tai", note: undefined })!;
  }

  /** Tải về kho/ rồi lập chỉ mục. Link chết: giữ bản đã tải (nếu có) và đánh dấu "nguồn không còn". */
  async download(id: string, o: { confirmed?: boolean; signal?: AbortSignal } = {}): Promise<DocRecord> {
    const rec = this.book.get(id);
    if (!rec) throw new Error("Không tìm thấy văn bản.");
    if (!rec.url) throw new Error("Văn bản này chưa có link nguồn; hãy chọn tệp từ máy.");
    this.book.update(id, { state: "dang-tai" });
    const r = await downloadDoc(rec.url, { fetcher: this.deps.fetcher, resolve: this.deps.resolve, domains: this.manifest().domains, confirmed: o.confirmed, signal: o.signal });
    if (!r.ok) {
      const had = !!rec.file && fs.existsSync(path.join(this.dir, rec.file));
      this.book.update(id, { state: r.gone ? "nguon-khong-con" : had ? "da-tai" : "chua-tai", note: r.error });
      if (r.needConfirm) {
        const e = new Error(r.error) as Error & { needConfirm?: boolean };
        e.needConfirm = true;
        throw e;
      }
      if (had && r.gone) return this.book.get(id)!;
      throw new Error(r.error);
    }
    this.saveFile(id, r.data, r.ext);
    return this.ingest(id);
  }

  /** Đọc chữ, rút dữ kiện rõ ràng, cắt theo Điều/Khoản và đưa vào chỉ mục. */
  async ingest(id: string): Promise<DocRecord> {
    const rec = this.book.get(id);
    const file = rec && this.abs(rec);
    if (!rec || !file || !fs.existsSync(file)) throw new Error("Chưa có tệp trong kho.");
    if (path.extname(file) === ".doc") {
      return this.book.update(id, { state: "chua-doc-duoc", note: "Định dạng .doc cũ chưa đọc được. Hãy mở bằng Word, lưu thành .docx rồi thêm lại." })!;
    }
    let segments: Segment[];
    try {
      segments = (await this.deps.extract(file)).segments;
    } catch (e) {
      return this.book.update(id, { state: "chua-doc-duoc", note: `Không đọc được tệp: ${(e as Error).message}`.slice(0, 300) })!;
    }
    let text = segments.map((s) => s.text).join("\n");
    if (letters(text) < MIN_LETTERS) {
      // PDF ảnh scan: không lập chỉ mục rỗng. Thử OCR nếu máy có công cụ.
      const o = this.deps.ocr ? await this.deps.ocr(file).catch((e: Error) => ({ unavailable: e.message })) : { unavailable: "Chưa bật OCR." };
      if ("segments" in o && letters(o.segments.map((s) => s.text).join("\n")) >= MIN_LETTERS) text = o.segments.map((s) => s.text).join("\n");
      else {
        const why = "unavailable" in o ? o.unavailable : "OCR không nhận ra chữ.";
        return this.book.update(id, { state: "chua-doc-duoc", note: `PDF ảnh scan, chưa có chữ để tra. ${why}`.slice(0, 300) })!;
      }
    }
    const facts = readFacts(text);
    const hash = rec.hash ?? sha256(fs.readFileSync(file));
    fs.mkdirSync(path.join(this.dir, "kho", ".text"), { recursive: true });
    fs.writeFileSync(path.join(this.dir, "kho", ".text", `${hash}.txt`), text);
    const no = rec.no ?? facts.no;
    const effectiveAt = rec.effectiveAt ?? facts.effectiveAt;
    const status: DocStatus = rec.statusSource === "tay" ? rec.status : statusFromDates(effectiveAt, day(this.now()), rec.status);
    const updated = this.book.update(id, {
      hash,
      no,
      issuedAt: rec.issuedAt ?? facts.issuedAt,
      effectiveAt,
      status,
      replaces: [...facts.replaces, ...facts.repeals],
      amends: facts.amends,
      state: "da-lap-chi-muc",
      note: undefined,
    })!;
    this.index().addDoc({ docId: id, no: updated.no, title: updated.title, effectiveAt: updated.effectiveAt, status: updated.status }, chunkLegal(text));
    return updated;
  }

  /** Dựng lại chỉ mục từ chữ đã lưu (không cần Python). */
  rebuildIndex(): number {
    this.index();
    let n = 0;
    for (const d of this.book.list({ includeHidden: true })) {
      if (!d.hash || d.state !== "da-lap-chi-muc") continue;
      const f = path.join(this.dir, "kho", ".text", `${d.hash}.txt`);
      if (!fs.existsSync(f)) continue;
      this.index().addDoc({ docId: d.id, no: d.no, title: d.title, effectiveAt: d.effectiveAt, status: d.status }, chunkLegal(fs.readFileSync(f, "utf8")));
      n++;
    }
    return n;
  }

  setStatus(id: string, status: DocStatus, source: "tay" | "van-ban" = "tay"): DocRecord | undefined {
    const r = this.book.update(id, { status, statusSource: source });
    if (r && this.idx?.has(id)) this.idx.setStatus(id, status);
    return r;
  }

  remove(id: string): void {
    const rec = this.book.get(id);
    if (!rec) return;
    this.idx?.removeDoc(id);
    if (rec.file) fs.rmSync(path.join(this.dir, rec.file), { force: true });
    this.book.remove(id);
  }

  search(query: string, o: { k?: number; includeExpired?: boolean } = {}): Hit[] {
    return this.index().search(query, o);
  }

  text(id: string): string | undefined {
    const rec = this.book.get(id);
    if (!rec?.hash) return undefined;
    try {
      return fs.readFileSync(path.join(this.dir, "kho", ".text", `${rec.hash}.txt`), "utf8");
    } catch {
      return undefined;
    }
  }

  cachedSummary(id: string): string | undefined {
    const rec = this.book.get(id);
    return rec?.hash ? this.summaries.get(rec.hash)?.text : undefined;
  }

  /** Ước lượng trước khi tóm tắt để cảnh báo văn bản dài. */
  estimate(id: string): SummaryEstimate | undefined {
    const t = this.text(id);
    return t ? estimateSummary(t) : undefined;
  }

  /**
   * Tóm tắt: chưa tải thì tải trước; chưa lập chỉ mục thì đọc trước. Văn bản dài phải được xác nhận.
   * Có bản đã lưu theo mã băm thì trả lại ngay.
   */
  async summarizeDoc(id: string, ask: Ask, o: { confirmLong?: boolean; confirmedSource?: boolean; signal?: AbortSignal } = {}): Promise<{ text: string; cached: boolean }> {
    let rec = this.book.get(id);
    if (!rec) throw new Error("Không tìm thấy văn bản.");
    if (rec.hash) {
      const hit = this.summaries.get(rec.hash);
      if (hit) return { text: hit.text, cached: true };
    }
    if (rec.state !== "da-lap-chi-muc") {
      rec = rec.file ? await this.ingest(id) : await this.download(id, { confirmed: o.confirmedSource, signal: o.signal });
    }
    const text = this.text(id);
    if (!text || rec.state !== "da-lap-chi-muc") throw new Error(rec.note ?? "Chưa đọc được văn bản này nên chưa tóm tắt được.");
    const est = estimateSummary(text);
    if (est.long && !o.confirmLong) {
      const e = new Error(`Văn bản dài (khoảng ${Math.round(est.chars / 2000)} trang), cần ${est.calls} lượt AI. Xác nhận để tiếp tục.`) as Error & { needConfirmLong?: boolean; estimate?: SummaryEstimate };
      e.needConfirmLong = true;
      e.estimate = est;
      throw e;
    }
    const out = await summarize(text, ask);
    if (rec.hash) this.summaries.set(rec.hash, out, this.now());
    return { text: out, cached: false };
  }
}

export { noKey, isAllowedHost };
