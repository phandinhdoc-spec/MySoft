import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fold, tokens } from "./hints.js";
import { extractContext, provinceByVotes, sameArea, PROVINCES, type DocContext, type Province } from "./place.js";

/**
 * Văn bản liên quan tìm trên mạng: chỉ lưu tên, link, lý do (không tải nội dung).
 * Nội dung chỉ được tải khi người dùng bấm xem/dùng, và chỉ với link đã nằm trong chỉ mục.
 * Tìm kiếm do bridge làm (CLI model không có công cụ web), không tốn lượt model.
 */
export const REFS = {
  perQuery: 6,
  maxPerFile: 6,
  maxStored: 200,
  ttlMs: 6 * 60 * 60 * 1000,
  maxPerHour: 6,
  searchTimeoutMs: 8000,
  fetchTimeoutMs: 15_000,
  maxBytes: 2 * 1024 * 1024,
  maxText: 20_000,
  redirects: 3,
} as const;

export interface RefItem {
  id: string;
  title: string;
  url: string;
  host: string;
  why: string;
  /** Tên tệp đang mở lúc tìm ra (để nhóm). */
  forFile: string;
  foundAt: number;
}

export type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string>; redirect?: "manual" | "follow" }) => Promise<Response>;

const STOP = new Set(["tep", "file", "bai", "van", "ban", "mau", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "copy", "ban sao", "moi", "final", "v1", "v2"]);

/** Tên tệp bỏ đuôi, số phiên bản, dấu gạch. */
export function cleanName(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_\-.]+/g, " ").replace(/\(\d+\)|\bv\d+\b/gi, " ").replace(/\s+/g, " ").trim();
}

const DOC_WORDS: Array<[RegExp, string]> = [
  [/cong van|quyet dinh|ke hoach|bien ban|to trinh|thong bao|bao cao|hop dong/, "mẫu văn bản"],
  [/chuong trinh|giao duc|giao an|ke hoach bai day|thcs|thpt|tieu hoc/, "giáo dục"],
  [/thuyet minh|khkt|sang tao|stem/, "thuyết minh"],
];

/**
 * 1–2 câu hỏi tìm kiếm: tên văn bản (dòng tiêu đề nếu có, không thì tên tệp) + đơn vị + địa phương + tỉnh/thành,
 * để kết quả đúng địa bàn thay vì trùng tên với nơi khác.
 */
export function refQueries(fileName: string, profile: string, modeId: string | undefined, ctx: DocContext = {}, province?: string): string[] {
  const name = ctx.title ?? cleanName(fileName);
  if (name.length < 4) return [];
  const f = fold(`${name} ${profile.slice(0, 300)}`);
  const hint = DOC_WORDS.find(([re]) => re.test(f))?.[1];
  const base = hint && !fold(name).includes(fold(hint)) ? `${name} ${hint}` : name;
  const prov = province ?? ctx.province ?? "";
  const qs: string[] = [];
  if (ctx.school) qs.push(`${base} ${ctx.school} ${ctx.place ?? ""} ${prov}`);
  qs.push(ctx.place || prov ? `${base} ${ctx.place ?? ""} ${prov}` : base);
  if (modeId === "admin" || /cong van|quyet dinh|thong tu|nghi dinh/.test(f)) qs.push(`${base} văn bản hướng dẫn ${prov}`);
  return [...new Set(qs.map((q) => q.replace(/\s+/g, " ").trim().slice(0, 140)))].slice(0, 2);
}

const TRUSTED = [/\.gov\.vn$/, /\.edu\.vn$/, /^(www\.)?thuvienphapluat\.vn$/, /^(www\.)?vbpl\.vn$/, /^(www\.)?moet\.gov\.vn$/];
const BLOCKED = [/(^|\.)facebook\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)pinterest\./, /(^|\.)youtube\.com$/];

/** Bóc kết quả (tiêu đề, link, đoạn trích) từ trang html.duckduckgo.com (không cần khóa API). */
export function parseSearchHtml(html: string): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const hits: Array<{ m: RegExpExecArray; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) hits.push({ m, end: re.lastIndex });
  hits.forEach(({ m, end }, i) => {
    let href = m[1]!.replace(/&amp;/g, "&");
    try {
      if (href.startsWith("//")) href = "https:" + href;
      const u = new URL(href, "https://duckduckgo.com");
      const real = u.searchParams.get("uddg");
      if (real) href = decodeURIComponent(real);
    } catch {
      return;
    }
    const title = decodeEntities(m[2]!.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const next = hits[i + 1]?.m.index ?? html.length;
    const sn = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/i.exec(html.slice(end, next));
    const snippet = sn ? decodeEntities(sn[1]!.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().slice(0, 300) : "";
    if (title && /^https:\/\//i.test(href)) out.push({ title: title.slice(0, 140), url: href, snippet });
  });
  return out;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}

export interface RankContext {
  ctx?: DocContext;
  province?: Province;
}

/** Chấm điểm: trùng từ với tên văn bản + đúng đơn vị/địa phương + nguồn nhà nước/giáo dục; loại mạng xã hội và trang của địa phương khác. */
export function rankResults(results: Array<{ title: string; url: string; snippet?: string }>, name: string, forFile: string, rc: RankContext = {}, now = Date.now()): RefItem[] {
  const want = tokens(name);
  const placeWords = rc.ctx?.place ? [...tokens(rc.ctx.place.replace(/^\S+\s+/, ""), 3)] : [];
  const schoolWords = rc.ctx?.school ? [...tokens(rc.ctx.school, 3)] : [];
  const seen = new Set<string>();
  const scored: Array<{ s: number; it: RefItem }> = [];
  for (const r of results) {
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || BLOCKED.some((re) => re.test(u.hostname))) continue;
    const host = u.hostname.replace(/^www\./, "");
    const area = sameArea(host, rc.province);
    if (area === false) continue; // trang của tỉnh/thành khác (hoặc chưa biết địa bàn)
    const key = u.hostname + u.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    const have = tokens(`${r.title} ${r.snippet ?? ""}`);
    let overlap = 0;
    for (const t of want) if (have.has(t)) overlap++;
    const placeHit = placeWords.length > 0 && placeWords.every((w) => have.has(w) || fold(`${r.title} ${r.snippet ?? ""} ${u.hostname}`).includes(w));
    const schoolHit = schoolWords.length > 1 && schoolWords.filter((w) => have.has(w)).length >= Math.min(2, schoolWords.length);
    const trusted = TRUSTED.some((re) => re.test(host));
    const s = overlap + (trusted ? 2 : 0) + (area === true ? 3 : 0) + (placeHit ? 3 : 0) + (schoolHit ? 3 : 0);
    if (overlap === 0 && !trusted) continue;
    const why = schoolHit ? "Cùng đơn vị" : placeHit ? "Cùng địa phương" : area === true ? `Cùng địa bàn: ${rc.province?.name}` : trusted ? "Nguồn nhà nước/giáo dục, trùng chủ đề" : "Trùng chủ đề với tệp đang mở";
    scored.push({
      s,
      it: { id: "r" + Buffer.from(r.url).toString("base64url").slice(-12) + scored.length, title: r.title, url: r.url, host, why, forFile, foundAt: now },
    });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, REFS.maxPerFile).map((x) => x.it);
}

export async function ddg(q: string, fetcher: Fetcher, signal?: AbortSignal): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REFS.searchTimeoutMs);
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetcher("https://html.duckduckgo.com/html/?kl=vn-vi&q=" + encodeURIComponent(q), {
      signal: ac.signal,
      headers: { "user-agent": "Mozilla/5.0 (PVTA)", "accept-language": "vi,en;q=0.8" },
    });
    return res.ok ? parseSearchHtml(await res.text()) : [];
  } catch {
    return []; // lỗi mạng: bỏ qua, gợi ý chỉ là phần thêm
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Địa phương nhớ lại để lần sau không phải tra: "phường Hạnh Thông" -> "Hồ Chí Minh". */
export class PlaceCache {
  private map: Record<string, string> = {};
  constructor(private file: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") this.map[k] = v;
    } catch {
      /* chưa có */
    }
  }
  get(place: string): Province | undefined {
    return PROVINCES.find((p) => p.name === this.map[fold(place)]);
  }
  set(place: string, p: Province): void {
    this.map[fold(place)] = p.name;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.map, null, 2));
    } catch {
      /* ghi lỗi không làm hỏng việc chính */
    }
  }
}

/** Tra xem địa phương thuộc tỉnh/thành nào: tìm tên nơi đó rồi xem tỉnh nào được nhắc nhiều nhất. */
export async function resolveProvince(ctx: DocContext, fetcher: Fetcher, cache?: PlaceCache, signal?: AbortSignal): Promise<Province | undefined> {
  if (ctx.province) return PROVINCES.find((p) => p.name === ctx.province);
  if (!ctx.place) return undefined;
  const hit = cache?.get(ctx.place);
  if (hit) return hit;
  const results = await ddg(`${ctx.place} ${ctx.school ?? ""}`.trim(), fetcher, signal);
  const p = provinceByVotes(results.slice(0, 8).map((r) => `${r.title}. ${r.snippet}`).join(" . "), 2);
  if (p) cache?.set(ctx.place, p);
  return p;
}

export interface FindInput {
  fileName: string;
  profile: string;
  /** Vài dòng đầu của tệp: chỉ dùng cục bộ để biết đơn vị và địa phương, không gửi cho model. */
  head?: string;
  modeId?: string;
}

export async function findRefs(inp: FindInput, fetcher: Fetcher = fetch, cache?: PlaceCache, signal?: AbortSignal): Promise<RefItem[]> {
  const ctx = extractContext(inp.head ?? "");
  const province = await resolveProvince(ctx, fetcher, cache, signal);
  const queries = refQueries(inp.fileName, inp.profile, inp.modeId, ctx, province?.name);
  if (queries.length === 0) return [];
  const all: Array<{ title: string; url: string; snippet: string }> = [];
  for (const q of queries) all.push(...(await ddg(q, fetcher, signal)).slice(0, REFS.perQuery));
  return rankResults(all, ctx.title ?? cleanName(inp.fileName), inp.fileName, { ctx, province });
}

/** Chỉ mục trên đĩa: refs.json (máy đọc) và refs.md (người đọc). */
export class RefStore {
  private items: RefItem[] = [];
  constructor(private dir: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, "refs.json"), "utf8")) as { items?: RefItem[] };
      if (Array.isArray(raw.items)) this.items = raw.items.filter((i) => i && typeof i.url === "string" && /^https:\/\//.test(i.url));
    } catch {
      /* chưa có */
    }
  }
  list(forFile?: string): RefItem[] {
    return forFile === undefined ? [...this.items] : this.items.filter((i) => i.forFile === forFile);
  }
  get(id: string): RefItem | undefined {
    return this.items.find((i) => i.id === id);
  }
  add(items: RefItem[]): void {
    const urls = new Set(items.map((i) => i.url));
    this.items = [...items, ...this.items.filter((i) => !urls.has(i.url))].slice(0, REFS.maxStored);
    this.save();
  }
  clear(): void {
    this.items = [];
    this.save();
  }
  private save(): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, "refs.json"), JSON.stringify({ items: this.items }, null, 2));
      const md = ["# Văn bản liên quan (chỉ lưu tên và link, chưa tải nội dung)", ""];
      for (const i of this.items) md.push(`- [${i.title}](${i.url}) (${i.host}) – ${i.why}; tệp: ${i.forFile}`);
      fs.writeFileSync(path.join(this.dir, "refs.md"), md.join("\n") + "\n");
    } catch {
      /* ghi lỗi không làm hỏng việc chính */
    }
  }
}

/** Địa chỉ nội bộ/riêng không được tải (chống SSRF). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

export function htmlToText(html: string): string {
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  return decodeEntities(body.replace(/<\/(p|div|li|tr|h[1-6]|br)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type FetchResult = { ok: true; text: string; truncated: boolean; type: string; title?: string } | { ok: false; error: string };

/** Tải một link đã có trong chỉ mục: chỉ https, không vào mạng nội bộ, tối đa vài lần chuyển hướng, giới hạn dung lượng. */
export async function fetchRefText(url: string, fetcher: Fetcher = fetch, resolve: Resolver = defaultResolver, signal?: AbortSignal, maxText: number = REFS.maxText): Promise<FetchResult> {
  let cur = url;
  for (let hop = 0; hop <= REFS.redirects; hop++) {
    let u: URL;
    try {
      u = new URL(cur);
    } catch {
      return { ok: false, error: "Link không hợp lệ." };
    }
    if (u.protocol !== "https:") return { ok: false, error: "Chỉ tải được link https." };
    try {
      const ips = net.isIP(u.hostname) ? [u.hostname] : await resolve(u.hostname);
      if (ips.length === 0 || ips.some(isPrivateIp)) return { ok: false, error: "Link trỏ về mạng nội bộ, PVTA không tải." };
    } catch {
      return { ok: false, error: "Không tìm thấy trang này." };
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REFS.fetchTimeoutMs);
    const onAbort = () => ac.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetcher(cur, { signal: ac.signal, redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (PVTA)", "accept-language": "vi,en;q=0.8" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "Trang chuyển hướng không hợp lệ." };
        cur = new URL(loc, cur).toString();
        continue;
      }
      if (!res.ok) return { ok: false, error: `Trang trả về lỗi ${res.status}.` };
      const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!/^(text\/|application\/xhtml)/.test(type)) return { ok: false, error: "Đây là tệp (PDF, Word…): hãy mở link bằng trình duyệt để tải." };
      const buf = Buffer.from(await res.arrayBuffer());
      const truncatedBytes = buf.length > REFS.maxBytes;
      const raw = buf.subarray(0, REFS.maxBytes).toString("utf8");
      const text = (type === "text/plain" ? raw : htmlToText(raw)).trim();
      if (!text) return { ok: false, error: "Trang không có chữ đọc được." };
      const title = type === "text/plain" ? undefined : decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || undefined;
      return { ok: true, text: text.slice(0, maxText), truncated: truncatedBytes || text.length > maxText, type, title };
    } catch {
      return { ok: false, error: "Không tải được trang (hết thời gian hoặc lỗi mạng)." };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  return { ok: false, error: "Trang chuyển hướng quá nhiều lần." };
}

export class RefGate {
  private cache = new Map<string, number>();
  private runs: number[] = [];
  private busy = false;
  decide(key: string, now = Date.now()): "cached" | "run" | "skip" {
    const at = this.cache.get(key);
    if (at !== undefined && now - at < REFS.ttlMs) return "cached";
    this.runs = this.runs.filter((t) => now - t < 3_600_000);
    if (this.busy || this.runs.length >= REFS.maxPerHour) return "skip";
    this.busy = true;
    this.runs.push(now);
    return "run";
  }
  finish(key: string, ok: boolean, now = Date.now()): void {
    this.busy = false;
    if (ok) this.cache.set(key, now);
  }
}
