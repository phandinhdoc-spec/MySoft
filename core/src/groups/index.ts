import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fold } from "../hints.js";
import { noKey, parseLegalQuery, type LegalChunk } from "./legal.js";
import type { DocStatus } from "./types.js";

/**
 * Chỉ mục tra cứu nhanh cho một nhóm (đặc tả 1.7): SQLite FTS5, tìm theo từ khóa, không cần mô hình nhúng.
 * Văn bản pháp luật hay được hỏi đúng chữ ("Điều 12", "khoản 3", số hiệu) nên có đường tra thẳng theo
 * số hiệu/Điều/Khoản trước khi dùng xếp hạng BM25.
 * Nếu máy không có node:sqlite (Node cũ), dùng bản dự phòng trong bộ nhớ: chậm hơn nhưng cùng kết quả.
 */

export interface IndexDoc {
  docId: string;
  no?: string;
  title: string;
  effectiveAt?: string;
  status: DocStatus;
}

export interface Hit {
  docId: string;
  no?: string;
  title: string;
  dieu: string;
  khoan: string;
  text: string;
  status: DocStatus;
  effectiveAt?: string;
  score: number;
  /** Chuỗi trích nguồn sẵn dùng: "Điều 12, khoản 3, Nghị định 115/2020/NĐ-CP". */
  cite: string;
}

export interface SearchOptions {
  k?: number;
  /** Mặc định false: bỏ văn bản hết hiệu lực (đặc tả 1.6). */
  includeExpired?: boolean;
}

export interface LegalIndex {
  readonly engine: "fts5" | "memory";
  addDoc(doc: IndexDoc, chunks: LegalChunk[]): void;
  removeDoc(docId: string): void;
  setStatus(docId: string, status: DocStatus, effectiveAt?: string): void;
  has(docId: string): boolean;
  search(query: string, opts?: SearchOptions): Hit[];
  stats(): { docs: number; chunks: number };
  close(): void;
}

export function citeOf(d: { dieu: string; khoan: string; no?: string; title: string }): string {
  const where = [d.dieu, d.khoan].filter(Boolean).join(", ");
  return `${where}, ${d.no ? `văn bản ${d.no}` : d.title}`.replace(/^, /, "");
}

const STOP = new Set(["va", "la", "cua", "cho", "cac", "mot", "nhung", "khi", "trong", "voi", "duoc", "de", "co", "nay", "do", "tu", "den", "ve", "theo", "thi", "hay", "nhu", "da", "se", "gi", "nao", "the", "nao"]);

function terms(q: string): string[] {
  return [...new Set(fold(q).split(" ").filter((w) => w.length > 1 && !STOP.has(w)))].slice(0, 24);
}

type SqliteMod = { DatabaseSync: new (file: string) => { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown }; close(): void } };

function loadSqlite(): SqliteMod | undefined {
  try {
    const require = createRequire(import.meta.url);
    const prevEmit = process.emitWarning;
    // node:sqlite còn ghi cảnh báo "experimental" ra stderr: bỏ riêng cảnh báo này.
    process.emitWarning = ((w: unknown, ...rest: unknown[]) => {
      if (typeof w === "string" && /SQLite/i.test(w)) return;
      return (prevEmit as (...a: unknown[]) => void).call(process, w, ...rest);
    }) as typeof process.emitWarning;
    try {
      return require("node:sqlite") as SqliteMod;
    } finally {
      process.emitWarning = prevEmit;
    }
  } catch {
    return undefined;
  }
}

/** Mở chỉ mục của nhóm; file === ":memory:" hoặc máy thiếu SQLite thì dùng bản trong bộ nhớ. */
export function openIndex(file: string, opts: { forceMemory?: boolean } = {}): LegalIndex {
  const sqlite = opts.forceMemory ? undefined : loadSqlite();
  if (sqlite) {
    try {
      if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
      return new Fts5Index(sqlite, file);
    } catch {
      /* hỏng tệp chỉ mục: dùng bản trong bộ nhớ, người dùng lập lại chỉ mục sau */
    }
  }
  return new MemoryIndex();
}

class Fts5Index implements LegalIndex {
  readonly engine = "fts5" as const;
  private db: InstanceType<SqliteMod["DatabaseSync"]>;
  constructor(mod: SqliteMod, file: string) {
    this.db = new mod.DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS docs(doc_id TEXT PRIMARY KEY, no TEXT, no_key TEXT, title TEXT, effective TEXT, status TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
        fold, text UNINDEXED, doc_id UNINDEXED, dieu UNINDEXED, dieu_key UNINDEXED, khoan UNINDEXED,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
  }
  addDoc(doc: IndexDoc, chunks: LegalChunk[]): void {
    this.removeDoc(doc.docId);
    this.db.prepare("INSERT INTO docs(doc_id,no,no_key,title,effective,status) VALUES(?,?,?,?,?,?)").run(doc.docId, doc.no ?? "", doc.no ? noKey(doc.no) : "", doc.title, doc.effectiveAt ?? "", doc.status);
    const ins = this.db.prepare("INSERT INTO chunks(fold,text,doc_id,dieu,dieu_key,khoan) VALUES(?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    try {
      for (const c of chunks) ins.run(fold(`${doc.title} ${doc.no ?? ""} ${c.dieu} ${c.heading} ${c.text}`), c.text, doc.docId, c.dieu, fold(c.dieu), c.khoan);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  removeDoc(docId: string): void {
    this.db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(docId);
    this.db.prepare("DELETE FROM docs WHERE doc_id = ?").run(docId);
  }
  setStatus(docId: string, status: DocStatus, effectiveAt?: string): void {
    if (effectiveAt !== undefined) this.db.prepare("UPDATE docs SET status = ?, effective = ? WHERE doc_id = ?").run(status, effectiveAt, docId);
    else this.db.prepare("UPDATE docs SET status = ? WHERE doc_id = ?").run(status, docId);
  }
  has(docId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM docs WHERE doc_id = ?").get(docId);
  }
  search(query: string, opts: SearchOptions = {}): Hit[] {
    const k = Math.max(1, Math.min(20, opts.k ?? 6));
    const lq = parseLegalQuery(query);
    const expired = opts.includeExpired ? "" : "AND d.status <> 'het-hieu-luc'";
    const toHit = (r: any, score: number): Hit => ({
      docId: r.doc_id,
      no: r.no || undefined,
      title: r.title,
      dieu: r.dieu,
      khoan: r.khoan,
      text: r.text,
      status: r.status,
      effectiveAt: r.effective || undefined,
      score,
      cite: citeOf({ dieu: r.dieu, khoan: r.khoan, no: r.no || undefined, title: r.title }),
    });
    const out: Hit[] = [];
    const seen = new Set<string>();
    // 1) Tra thẳng theo số hiệu / Điều / Khoản.
    if (lq.no || lq.dieu) {
      const where: string[] = [];
      const args: unknown[] = [];
      if (lq.no) (where.push("d.no_key = ?"), args.push(noKey(lq.no)));
      if (lq.dieu) (where.push("c.dieu_key = ?"), args.push(fold(lq.dieu)));
      const rows = this.db
        .prepare(`SELECT c.rowid AS rid, c.text, c.dieu, c.khoan, c.doc_id, d.no, d.title, d.effective, d.status FROM chunks c JOIN docs d ON d.doc_id = c.doc_id WHERE ${where.join(" AND ")} ${expired} ORDER BY c.rowid LIMIT 60`)
        .all(...args) as any[];
      for (const r of rows) {
        if (lq.khoan && r.khoan && r.khoan !== lq.khoan) continue;
        seen.add(String(r.rid));
        out.push(toHit(r, 1000 - out.length));
      }
      if (out.length >= k || (lq.no && lq.dieu && out.length)) return out.slice(0, k);
    }
    // 2) Từ khóa, xếp hạng BM25.
    const ts = terms(lq.rest || query);
    if (ts.length) {
      const match = ts.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
      let rows: any[] = [];
      try {
        rows = this.db
          .prepare(`SELECT chunks.rowid AS rid, chunks.text, chunks.dieu, chunks.khoan, chunks.doc_id, d.no, d.title, d.effective, d.status, bm25(chunks) AS rank FROM chunks JOIN docs d ON d.doc_id = chunks.doc_id WHERE chunks MATCH ? ${expired} ORDER BY rank LIMIT ?`)
          .all(match, k * 3) as any[];
      } catch {
        rows = [];
      }
      for (const r of rows) {
        if (seen.has(String(r.rid))) continue;
        if (lq.no && r.no && noKey(r.no) !== noKey(lq.no)) continue;
        out.push(toHit(r, -Number(r.rank)));
      }
    }
    return out.slice(0, k);
  }
  stats() {
    const d = this.db.prepare("SELECT COUNT(*) AS n FROM docs").get() as { n: number };
    const c = this.db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number };
    return { docs: d.n, chunks: c.n };
  }
  close(): void {
    try {
      this.db.close();
    } catch {
      /* đã đóng */
    }
  }
}

interface MemChunk extends LegalChunk {
  docId: string;
  words: Map<string, number>;
}

/** Bản dự phòng: tính điểm kiểu TF-IDF đơn giản trên bộ nhớ. */
class MemoryIndex implements LegalIndex {
  readonly engine = "memory" as const;
  private docs = new Map<string, IndexDoc>();
  private chunks: MemChunk[] = [];
  addDoc(doc: IndexDoc, chunks: LegalChunk[]): void {
    this.removeDoc(doc.docId);
    this.docs.set(doc.docId, { ...doc });
    for (const c of chunks) {
      const words = new Map<string, number>();
      for (const w of fold(`${doc.title} ${doc.no ?? ""} ${c.dieu} ${c.heading} ${c.text}`).split(" ")) if (w) words.set(w, (words.get(w) ?? 0) + 1);
      this.chunks.push({ ...c, docId: doc.docId, words });
    }
  }
  removeDoc(docId: string): void {
    this.docs.delete(docId);
    this.chunks = this.chunks.filter((c) => c.docId !== docId);
  }
  setStatus(docId: string, status: DocStatus, effectiveAt?: string): void {
    const d = this.docs.get(docId);
    if (d) (d.status = status), effectiveAt !== undefined && (d.effectiveAt = effectiveAt);
  }
  has(docId: string): boolean {
    return this.docs.has(docId);
  }
  search(query: string, opts: SearchOptions = {}): Hit[] {
    const k = Math.max(1, Math.min(20, opts.k ?? 6));
    const lq = parseLegalQuery(query);
    const live = this.chunks.filter((c) => {
      const d = this.docs.get(c.docId)!;
      return opts.includeExpired || d.status !== "het-hieu-luc";
    });
    const toHit = (c: MemChunk, score: number): Hit => {
      const d = this.docs.get(c.docId)!;
      return { docId: c.docId, no: d.no, title: d.title, dieu: c.dieu, khoan: c.khoan, text: c.text, status: d.status, effectiveAt: d.effectiveAt, score, cite: citeOf({ dieu: c.dieu, khoan: c.khoan, no: d.no, title: d.title }) };
    };
    const out: Hit[] = [];
    const seen = new Set<MemChunk>();
    if (lq.no || lq.dieu) {
      for (const c of live) {
        const d = this.docs.get(c.docId)!;
        if (lq.no && (!d.no || noKey(d.no) !== noKey(lq.no))) continue;
        if (lq.dieu && fold(c.dieu) !== fold(lq.dieu)) continue;
        if (lq.khoan && c.khoan && c.khoan !== lq.khoan) continue;
        seen.add(c);
        out.push(toHit(c, 1000 - out.length));
      }
      if (out.length >= k || (lq.no && lq.dieu && out.length)) return out.slice(0, k);
    }
    const ts = terms(lq.rest || query);
    if (ts.length) {
      const n = live.length || 1;
      const df = new Map<string, number>();
      for (const t of ts) df.set(t, live.filter((c) => c.words.has(t)).length);
      const scored: Array<{ c: MemChunk; s: number }> = [];
      for (const c of live) {
        if (seen.has(c)) continue;
        const d = this.docs.get(c.docId)!;
        if (lq.no && d.no && noKey(d.no) !== noKey(lq.no)) continue;
        let s = 0;
        for (const t of ts) {
          const tf = c.words.get(t);
          if (tf) s += (1 + Math.log(tf)) * Math.log(1 + n / (1 + (df.get(t) ?? 0)));
        }
        if (s > 0) scored.push({ c, s });
      }
      scored.sort((a, b) => b.s - a.s);
      for (const x of scored.slice(0, k)) out.push(toHit(x.c, x.s));
    }
    return out.slice(0, k);
  }
  stats() {
    return { docs: this.docs.size, chunks: this.chunks.length };
  }
  close(): void {}
}
