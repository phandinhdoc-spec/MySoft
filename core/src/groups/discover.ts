import { parseSearchHtml, decodeEntities, type Fetcher, type Resolver } from "../refs.js";
import { fold } from "../hints.js";
import { hostOf, isAllowedHost } from "./book.js";
import { isToolKind } from "./catalog.js";
import { extractCitations, noKey } from "./legal.js";
import type { GroupStore } from "./store.js";
import type { DocRecord, GroupManifest, DiscoveryProfile } from "./types.js";

import {cleanProfile,sourceUrl,trackingSources} from "./profile.js";
import {fetchSource} from "./source-fetch.js";

/**
 * Tìm văn bản mới theo nhóm (đặc tả 1.11, giai đoạn 3).
 * Hai nguồn: (1) nguồn tin RSS/Atom mà gói nhóm khai báo — ổn định, không phụ thuộc trang tìm kiếm;
 * (2) trang kết quả DuckDuckGo giới hạn theo tên miền tin cậy — dễ gãy, chỉ là phần thêm.
 * Chỉ ghi tên, link và «Mới» vào bảng văn bản; không tự tải nội dung. Có công tắc «không dùng mạng».
 */

export const DISCOVER = {
  /** Mỗi nhóm chạy tối đa một lần trong khoảng này. */
  minGapMs: 24 * 3600_000,
  /** Tổng số lượt tìm trên mạng mỗi giờ (chung mọi nhóm). */
  maxSearchesPerHour: 60,
  maxQueriesPerGroup: 2,
  maxNewPerGroup: 12,
  feedTimeoutMs: 10_000,
  feedMaxBytes: 1_000_000,
} as const;

export interface Found {
  title: string;
  url: string;
  host: string;
  no?: string;
  via: "feed" | "search" | "page";
}

const hostBlocked = [/(^|\.)facebook\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)youtube\.com$/, /(^|\.)pinterest\./];

/** Đọc RSS 2.0 hoặc Atom: chỉ lấy tiêu đề và link. */
export function parseFeed(xml: string): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const clean = (s: string) => decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(m[0])?.[1];
    const link = /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(m[0])?.[1];
    if (title && link) out.push({ title: clean(title).slice(0, 300), url: clean(link) });
  }
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(m[0])?.[1];
    const link = /<link\b[^>]*href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (title && link) out.push({ title: clean(title).slice(0, 300), url: decodeEntities(link) });
  }
  return out;
}

/** Câu tìm: từ khóa của nhóm × tên miền tin cậy. Không chứa gì ngoài từ khóa do gói nhóm khai báo. */
export function groupQueries(m: GroupManifest, profile?: DiscoveryProfile): string[] {
  const keywords=m.keywords.slice(0,6);if(!keywords.length)return [];
  const topic=keywords.slice(0,3).map(k=>`"${k}"`).join(" OR ");
  const domains=m.domains.slice(0,2).map(d=>`site:${d}`).join(" OR ");
  const national=`(${topic}) (công văn OR thông tư OR hướng dẫn) ${domains?`(${domains})`:''}`;
  if(!profile?.province)return [national,...(keywords.length>3?[`(${keywords.slice(3).map(k=>`"${k}"`).join(' OR ')}) văn bản (${domains})`]:[])];
  const localDomains=trackingSources(profile).filter(s=>s.id!=='moet').map(s=>`site:${new URL(s.url).hostname}`);
  const local=`${profile.province} ${profile.locality} ${profile.level} ${profile.subjects} ${profile.keywords} (${topic}) (công văn OR văn bản OR thông tư) ${localDomains.length?`(${localDomains.join(' OR ')})`:'(site:edu.vn OR site:gov.vn)'}`;
  return [local.replace(/\s+/g,' ').trim(),national];
}

export function parseSourcePage(html:string,base:string):Array<{title:string;url:string}> {
 const rows:Array<{title:string;url:string}>=[];const seen=new Set<string>();
 for(const m of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)){
  const title=decodeEntities(m[4]!.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
  if(title.length<15||!/(cong van|thong tu|quyet dinh|ke hoach|huong dan|trien khai|thong bao|nghi quyet|nghi dinh)/.test(fold(title)))continue;
  try{const url=sourceUrl(new URL(decodeEntities(m[2]!),base).href);if(url===base||seen.has(url))continue;seen.add(url);rows.push({title:title.slice(0,300),url});}catch{/* not a public institutional link */}
 }
 return rows.slice(0,100);
}

async function searchDocuments(query:string,fetcher:Fetcher){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const res=await fetcher('https://html.duckduckgo.com/html/?kl=vn-vi&df=y&q='+encodeURIComponent(query),{signal:ctl.signal,headers:{'user-agent':'Mozilla/5.0 (PVTA)'}});
  if(!res.ok)throw Error(`Tìm kiếm trả HTTP ${res.status}`);
  const html=await res.text();const rows=parseSearchHtml(html);
  if(!rows.length&&!/no.results|no results found|không tìm thấy/i.test(html))throw Error('Trang tìm kiếm bị chặn hoặc đã đổi cấu trúc; chưa thể xác nhận có văn bản mới.');
  return rows;
 }finally{clearTimeout(timer);}
}

export interface DiscoverDeps {
  fetcher?: Fetcher;
  resolve?: Resolver;
  sourceCache?: Map<string,Promise<string>>;
  now?: () => number;
  /** Ngân sách lượt tìm trong giờ (mặc định dùng bộ đếm trong bộ nhớ). */
  budget?: SearchBudget;
}

export class SearchBudget {
  private runs: number[] = [];
  take(now: number): boolean {
    this.runs = this.runs.filter((t) => now - t < 3_600_000);
    if (this.runs.length >= DISCOVER.maxSearchesPerHour) return false;
    this.runs.push(now);
    return true;
  }
}
const sharedBudget = new SearchBudget();

export interface DiscoverResult {
  group: string;
  added: DocRecord[];
  skipped?: "offline" | "recent" | "budget" | "no-source";
  errors: string[];
  checked?: number;
}

async function readFeed(url: string, fetcher: Fetcher): Promise<Array<{ title: string; url: string }>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DISCOVER.feedTimeoutMs);
  try {
    const res = await fetcher(url, { signal: ac.signal, headers: { "user-agent": "Mozilla/5.0 (PVTA)", accept: "application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.5" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > DISCOVER.feedMaxBytes) throw new Error("nguồn tin quá lớn");
    return parseFeed(buf.toString("utf8"));
  } finally {
    clearTimeout(timer);
  }
}

/** Mối quan tâm của nhóm: kết quả phải trùng ít nhất một từ khóa của nhóm (bỏ dấu) mới giữ. */
function relevant(title: string, m: GroupManifest): boolean {
  if (m.keywords.length === 0) return true;
  const f = fold(title);
  return m.keywords.some((k) => f.includes(fold(k)));
}

export async function discoverGroup(store: GroupStore, groupId: string, d: DiscoverDeps = {}, o: { force?: boolean } = {}): Promise<DiscoverResult> {
  const now = d.now?.() ?? Date.now();
  const res: DiscoverResult = { group: groupId, added: [], errors: [] };
  if (store.state().offline) return { ...res, skipped: "offline" };
  const last = store.state().discover?.lastRun?.[groupId] ?? 0;
  if (!o.force && now - last < DISCOVER.minGapMs) return { ...res, skipped: "recent" };
  const original = store.manifest(groupId);
  const m=groupId==='giao-vien'?{...original,keywords:[...new Set(["giáo viên","giáo dục","giảng dạy",...original.keywords])]}:original;
  if (isToolKind(m.kind)) return { ...res, skipped: "no-source" };
  const profile=store.state().profile;
  const queries = groupQueries(m,profile);
  if (!m.feeds?.length && queries.length === 0) return { ...res, skipped: "no-source" };
  const fetcher = d.fetcher ?? fetch;
  const budget = d.budget ?? sharedBudget;
  const found: Found[] = [];
  let checked=0;
  const sources=profile||store.state().sources?.length?trackingSources(cleanProfile(profile),store.state().sources):[];
  for(const source of sources.filter(s=>s.enabled&&(!s.groups.length||s.groups.includes(groupId)))){
    try{
      let pending=d.sourceCache?.get(source.url);
      if(!pending){pending=fetchSource(source.url,fetcher,d.resolve);d.sourceCache?.set(source.url,pending);}
      const html=await pending;
      if(/captcha|enable JavaScript to view|human visitor|anomaly-modal/i.test(html))throw Error('Nguồn yêu cầu xác minh trình duyệt; mở nguồn để kiểm tra.');
      const rows=source.kind==='feed'?parseFeed(html):parseSourcePage(html,source.url);
      if(!rows.length)throw Error('Chưa đọc được danh sách văn bản từ nguồn; kiểm tra link chuyên mục hoặc RSS.');
      checked++;source.lastError=undefined;source.found=rows.length;
      for(const row of rows){const host=hostOf(row.url);if(host)found.push({...row,host,no:extractCitations(row.title)[0]?.no,via:source.kind});}
    }catch(e){source.lastError=(e as Error).message;source.found=0;res.errors.push(`${source.name}: ${source.lastError}`);}
    source.lastChecked=now;
  }
  if(sources.length){
    const latest=trackingSources(cleanProfile(store.state().profile),store.state().sources);
    store.patchState({sources:latest.map(s=>{const checked=sources.find(x=>x.id===s.id&&x.url===s.url);return checked?.lastChecked?{...s,lastChecked:checked.lastChecked,lastError:checked.lastError,found:checked.found}:s;})});
  }

  for (const feed of m.feeds ?? []) {
    try {
      const rows=await readFeed(feed, fetcher);checked++;
      for (const it of rows) {
        const host = hostOf(it.url);
        if (host && /^https:\/\//i.test(it.url)) found.push({ title: it.title, url: it.url, host, no: extractCitations(it.title)[0]?.no, via: "feed" });
      }
    } catch (e) {
      res.errors.push(`Nguồn tin ${hostOf(feed) ?? feed}: ${(e as Error).message}`);
    }
  }
  if (!found.length || queries.length) {
    for (const q of queries) {
      if (!budget.take(now)) {
        res.skipped = found.length ? undefined : "budget";
        break;
      }
      try {const rows=await searchDocuments(q,fetcher);checked++;
      for (const r of rows) {
        const host = hostOf(r.url);
        if (host && /^https:\/\//i.test(r.url)) found.push({ title: r.title, url: r.url, host, no: extractCitations(r.title)[0]?.no, via: "search" });
      }}catch(e){res.errors.push((e as Error).message);}
    }
  }

  const lib = store.library(groupId);
  const have = lib.book.list({ includeHidden: true });
  const seenUrl = new Set(have.map((x) => x.url).filter(Boolean));
  const seenNo = new Set(have.map((x) => (x.no ? noKey(x.no) : "")).filter(Boolean));
  const seenTitle = new Set(have.map((x) => fold(x.title)));
  for (const f of found) {
    if (res.added.length >= DISCOVER.maxNewPerGroup) break;
    if (hostBlocked.some((re) => re.test(f.host))) continue;
    // Chỉ nhận nguồn tin cậy; nguồn khác không tự vào bảng.
    if (!isAllowedHost(f.host, m.domains)) continue;
    if (!relevant(f.title, m)) continue;
    if (seenUrl.has(f.url) || (f.no && seenNo.has(noKey(f.no))) || seenTitle.has(fold(f.title))) continue;
    seenUrl.add(f.url);
    seenTitle.add(fold(f.title));
    if (f.no) seenNo.add(noKey(f.no));
    res.added.push(lib.book.add({ title: f.title, no: f.no, url: f.url, agency: "", isNew: true, source: "tim-moi", status: "chua-xac-dinh" }, now));
  }
  res.checked=checked;
  const previous=store.state().discover;
  store.patchState({ discover: {lastRun:{...previous?.lastRun,...(checked?{[groupId]:now}:{})},reports:[{group:groupId,at:now,added:res.added.length,checked,skipped:res.skipped,errors:res.errors},...(previous?.reports??[]).filter(r=>r.group!==groupId)].slice(0,50)} });
  return res;
}

/** Chạy cho mọi nhóm đang bật (lần lượt). Dùng khi máy rảnh hoặc khi người dùng bấm «Tìm văn bản mới». */
export async function discoverAll(store: GroupStore, d: DiscoverDeps = {}, o: { force?: boolean; signal?: AbortSignal } = {}): Promise<DiscoverResult[]> {
  const out: DiscoverResult[] = [];
  const cache=d.sourceCache??new Map<string,Promise<string>>();
  const ordered=store.enabledLibraries().sort((a,b)=>(store.state().discover?.lastRun?.[a.id]??0)-(store.state().discover?.lastRun?.[b.id]??0));
  for (const { id } of ordered) {
    if (o.signal?.aborted) break;
    try {
      out.push(await discoverGroup(store, id, {...d,sourceCache:cache}, o));
    } catch (e) {
      out.push({ group: id, added: [], errors: [(e as Error).message] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Kiểm tra mạng trường: phải thử trước khi hứa tính năng (đặc tả 1.11, 5.2).

export interface NetProbe {
  host: string;
  ok: boolean;
  status?: number;
  ms?: number;
  error?: string;
}

export const PROBE_HOSTS = ["vbpl.vn", "chinhphu.vn", "moet.gov.vn", "thuvienphapluat.vn", "html.duckduckgo.com"] as const;

export async function probeNetwork(hosts: readonly string[] = PROBE_HOSTS, fetcher: Fetcher = fetch, timeoutMs = 8000): Promise<NetProbe[]> {
  return Promise.all(
    hosts.map(async (host) => {
      const t0 = Date.now();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await fetcher(`https://${host}/`, { signal: ac.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (PVTA)" } });
        return { host, ok: r.status < 500, status: r.status, ms: Date.now() - t0 };
      } catch (e) {
        return { host, ok: false, error: ac.signal.aborted ? "quá thời gian chờ" : "không kết nối được", ms: Date.now() - t0 };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

export function summarizeProbe(p: NetProbe[]): { usable: boolean; text: string } {
  const portals = p.filter((x) => x.host !== "html.duckduckgo.com");
  const okPortals = portals.filter((x) => x.ok).map((x) => x.host);
  const search = p.find((x) => x.host === "html.duckduckgo.com");
  if (okPortals.length === 0) return { usable: false, text: "Mạng này chưa vào được các cổng văn bản. Tìm văn bản mới sẽ không chạy; vẫn thêm link và chọn tệp bằng tay được." };
  return {
    usable: true,
    text: `Vào được: ${okPortals.join(", ")}.${search?.ok ? "" : " Trang tìm kiếm bị chặn nên chỉ dùng được nguồn tin (RSS) mà nhóm khai báo."}`,
  };
}
