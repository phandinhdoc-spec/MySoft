import {skillTier} from './skill-policy.js';
import {normalizeSkill,skillSlug} from "./standardize/skill.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FoundSkill, SkillInfo, SkillLoad } from "@pvta/shared";
import { INTERNAL_SKILLS, SKILL_NAME_RE, parseSkill, type SkillStore } from "./skills.js";

/**
 * Nhập skill cộng đồng (định dạng SKILL.md: thư mục có SKILL.md với phần đầu name/description).
 * Chỉ lấy chữ hướng dẫn: PVTA không chạy script đi kèm (model ở đây không có shell/Python), nên chỉ SKILL.md được giữ lại.
 * Skill nhập về mặc định ở chế độ "manual" (chỉ nạp khi thầy cô gõ /tên-skill), vì đây là chỉ dẫn do người lạ viết.
 */

export const MAX_SKILL_BYTES = 60_000;
const MAX_CANDIDATES = 40;
const FETCH_TIMEOUT_MS = 15_000;

export interface GithubRef {
  owner: string;
  repo: string;
  ref?: string;
  /** Đường dẫn trong repo, không có "/" ở hai đầu ("" = gốc). */
  path: string;
}

const SEG = /^[A-Za-z0-9._-]+$/;

function cleanPath(segments: string[]): string | null {
  const out: string[] = [];
  for (const s of segments) {
    if (!s) continue;
    let d: string;
    try {
      d = decodeURIComponent(s);
    } catch {
      return null;
    }
    if (d === ".." || d === "." || /[\\?#\0]/.test(d)) return null;
    out.push(d);
  }
  return out.join("/");
}

/** Nhận link GitHub (repo, thư mục /tree/…, tệp /blob/…, raw) hoặc dạng ngắn "chủ/repo[/đường/dẫn]". */
export function parseGithubRef(input: string): GithubRef | null {
  let s = input.trim();
  if (!s || s.length > 400) return null;
  s = s.replace(/^git\+/, "").replace(/\.git(?=$|[/?#])/, "");
  let host = "";
  const m = /^(?:https?:\/\/)?((?:www\.)?github\.com|raw\.githubusercontent\.com)\/(.+)$/i.exec(s);
  let rest: string;
  if (m) {
    host = m[1]!.toLowerCase().replace(/^www\./, "");
    rest = m[2]!;
  } else if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(\/[^\s]*)?$/.test(s) && !/^(https?:|\/)/i.test(s)) {
    rest = s;
  } else return null;
  const parts = rest.split(/[?#]/)[0]!.split("/").filter(Boolean);
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo || !SEG.test(owner) || !SEG.test(repo)) return null;
  const tail = parts.slice(2);
  let ref: string | undefined;
  let rel = tail;
  if (host === "raw.githubusercontent.com") {
    ref = tail[0];
    rel = tail.slice(1);
    if (!ref) return null;
  } else if ((tail[0] === "tree" || tail[0] === "blob") && tail[1]) {
    ref = decodeURIComponent(tail[1]);
    rel = tail.slice(2);
  }
  if (ref && !/^[A-Za-z0-9._-]+$/.test(ref)) return null;
  const p = cleanPath(rel);
  if (p === null) return null;
  return { owner, repo, ...(ref ? { ref } : {}), path: p };
}

type Fetch = typeof fetch;

class HttpFail extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

async function get(fetchFn: Fetch, url: string, accept?: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctl.signal, headers: { "User-Agent": "PVTA-Office", ...(accept ? { Accept: accept } : {}) } });
    if (!res.ok) {
      if (res.status === 403 || res.status === 429) throw new HttpFail(res.status, "GitHub đang giới hạn số lần tải (khoảng 60 lần mỗi giờ khi chưa đăng nhập). Thử lại sau ít phút.");
      throw new HttpFail(res.status, `GitHub trả lỗi ${res.status}.`);
    }
    const text = await res.text();
    if (text.length > 400_000) throw new HttpFail(413, "Tệp quá lớn.");
    return text;
  } catch (e) {
    if (e instanceof HttpFail) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new HttpFail(0, "GitHub không phản hồi (quá 15 giây).");
    throw new HttpFail(0, "Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.");
  } finally {
    clearTimeout(timer);
  }
}

const rawUrl = (r: GithubRef, rel: string) =>
  `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${encodeURIComponent(r.ref ?? "HEAD")}/${rel.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
const apiUrl = (r: GithubRef, rel: string) =>
  `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${rel.split("/").filter(Boolean).map(encodeURIComponent).join("/")}${r.ref ? `?ref=${encodeURIComponent(r.ref)}` : ""}`;

async function rawSkill(fetchFn: Fetch, r: GithubRef, dir: string): Promise<string | null> {
  try {
    return await get(fetchFn, rawUrl(r, dir ? `${dir}/SKILL.md` : "SKILL.md"));
  } catch (e) {
    if (e instanceof HttpFail && e.status === 404) return null;
    throw e;
  }
}

async function listDirs(fetchFn: Fetch, r: GithubRef, dir: string): Promise<string[]> {
  let body: string;
  try {
    body = await get(fetchFn, apiUrl(r, dir), "application/vnd.github+json");
  } catch (e) {
    if (e instanceof HttpFail && e.status === 404) return [];
    throw e;
  }
  let arr: unknown;
  try {
    arr = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is { type: string; name: string } => !!x && typeof x === "object" && (x as { type?: unknown }).type === "dir" && typeof (x as { name?: unknown }).name === "string")
    .map((x) => x.name)
    .filter((n) => !n.startsWith(".") && SEG.test(n));
}

export interface Candidate {
  key: string;
  dirName: string;
  md: string;
}

/**
 * Tìm các skill ở một nguồn GitHub: một thư mục skill, hoặc kho chứa nhiều skill
 * (tìm trong thư mục gốc và trong thư mục con "skills").
 */
export async function scanGithub(source: string, fetchFn: Fetch = fetch): Promise<{ ref: GithubRef; items: Candidate[] }> {
  const ref = parseGithubRef(source);
  if (!ref) throw new Error("Link chưa đúng. Dán link GitHub của kho hoặc thư mục skill, ví dụ github.com/chủ/kho hoặc github.com/chủ/kho/tree/main/skills/ten-skill.");
  let dir = ref.path;
  if (/(^|\/)SKILL\.md$/i.test(dir)) dir = dir.replace(/\/?SKILL\.md$/i, "");
  const baseName = (d: string) => d.split("/").filter(Boolean).pop() ?? ref.repo;

  const single = await rawSkill(fetchFn, ref, dir);
  if (single !== null) return { ref, items: [{ key: dir || ".", dirName: baseName(dir), md: single }] };

  // Kho nhiều skill thường để trong thư mục con "skills": dò đó trước, rồi mới đến chính thư mục này.
  const skillsDir = dir ? `${dir}/skills` : "skills";
  const bases = /(^|\/)skills$/.test(dir) ? [dir] : [skillsDir, dir];
  const dirs: string[] = [];
  for (const b of bases) {
    for (const n of await listDirs(fetchFn, ref, b)) {
      const d = b ? `${b}/${n}` : n;
      if (d !== skillsDir && !dirs.includes(d)) dirs.push(d);
    }
  }
  const items: Candidate[] = [];
  const queue = dirs.slice(0, MAX_CANDIDATES);
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const d = queue[next++]!;
      const md = await rawSkill(fetchFn, ref, d);
      if (md !== null) items.push({ key: d, dirName: baseName(d), md });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  items.sort((a, b) => a.key.localeCompare(b.key));
  return { ref, items };
}

// ---- Đọc và kiểm tra SKILL.md của người khác ----

export interface LooseSkill {
  name?: string;
  description: string;
  body: string;
}

/** Đọc phần đầu YAML dễ dãi: chuỗi có/không nháy, khối > và |, bỏ qua các khóa lạ (license, allowed-tools, metadata…). */
export function parseLoose(md: string): LooseSkill {
  const text = md.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { description: "", body: text.trim() };
  const lines = m[1]!.split(/\r?\n/);
  const meta: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    let val = kv[2]!.trim();
    if (/^[>|][+-]?$/.test(val)) {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim());
      val = parts.filter(Boolean).join(" ");
    }
    meta[key] = val.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
  }
  return { name: meta.name, description: meta.description ?? "", body: m[2]!.trim() };
}

/**
 * Bộ lọc cho skill người lạ viết. Nhẹ hơn findUnsafe (chấp nhận đường dẫn và lệnh trong chữ hướng dẫn vì chúng không bao giờ được chạy),
 * nhưng chặn khối công cụ giả, câu bảo bỏ qua chỉ dẫn, khóa bí mật và tên tệp nhạy cảm.
 */
export function findUnsafeImported(text: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/```\s*office-tool/i, "chứa khối office-tool giả"],
    [/ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i, "có câu bảo model bỏ qua chỉ dẫn"],
    [/disregard (all |any )?(the )?(previous|prior|above|system) /i, "có câu bảo model bỏ qua chỉ dẫn"],
    [/b[oỏ] qua (m[oọ]i |t[aấ]t c[aả] )?(ch[iỉ] d[aẫ]n|h[uư][oớ]ng d[aẫ]n|quy t[aắ]c)/i, "có câu bảo model bỏ qua chỉ dẫn"],
    [/(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, "giống khóa bí mật"],
    [/\.ssh\/|id_rsa|\/etc\/passwd/i, "nhắc đến tệp nhạy cảm"],
  ];
  for (const [re, why] of rules) if (re.test(text)) return why;
  return null;
}

export function slugify(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (!s) s = "skill";
  // pvta-*, learned-* và cd-* là của PVTA (nạp sẵn / tự học / kiến thức cộng đồng đã duyệt): skill nhập về không được mượn tên.
  if (/^(pvta|learned|cd)-/.test(s) || s === "pvta") s = `ext-${s}`;
  return s;
}

function oneLine(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Mô tả cho thầy cô duyệt: tên, mô tả, dung lượng, và lý do nếu bị chặn. */
export function describeCandidate(c: Candidate): FoundSkill {
  const p = parseLoose(c.md);
  let problem: string | undefined;
  if (INTERNAL_SKILLS.has(p.name ?? "") || INTERNAL_SKILLS.has(c.dirName)) problem = "Skill nhân chỉ dùng nội bộ, không cài vào thư viện người dùng";
  else if (Buffer.byteLength(c.md, "utf8") > MAX_SKILL_BYTES) problem = "Quá dài (trên 60 KB)";
  else if (!p.body) problem = "Không có nội dung hướng dẫn";
  else problem = findUnsafeImported(c.md) ?? undefined;
  return {
    key: c.key,
    name: skillSlug(slugify(skillSlug(p.name || c.dirName))),
    description: oneLine(p.description || p.body.split(/\n/).find((l) => l.trim() && !l.startsWith("#")) || "", 220),
    chars: p.body.length,
    ...(problem ? { problem } : {}),
  };
}

// ---- Sổ skill đã nhập (.imported.json) ----

interface ImportRec {
  source: string;
  at: number;
  sha1: string;
}

function registryFile(store: SkillStore): string {
  return path.join(store.dir, ".imported.json");
}

export function readRegistry(store: SkillStore): Record<string, ImportRec> {
  try {
    const j = JSON.parse(fs.readFileSync(registryFile(store), "utf8")) as Record<string, ImportRec>;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

function writeRegistry(store: SkillStore, r: Record<string, ImportRec>): void {
  fs.writeFileSync(registryFile(store), JSON.stringify(r, null, 2));
}

export interface InstallResult {
  installed: Array<{ name: string; renamedFrom?: string }>;
  skipped: Array<{ name: string; reason: string }>;
}

/** Ghi các skill đã chọn vào thư mục skill của người dùng (mặc định chế độ manual). */
export function installCandidates(store: SkillStore, source: string, picks: Candidate[]): InstallResult {
  const out: InstallResult = { installed: [], skipped: [] };
  const reg = readRegistry(store);
  const existing = new Set(store.list().map((s) => s.name));
  for (const c of picks) {
    const info = describeCandidate(c);
    if (info.problem) {
      out.skipped.push({ name: info.name, reason: info.problem });
      continue;
    }
    const p = parseLoose(c.md);
    let name = info.name;
    const wanted = name;
    // Trùng tên với skill không phải do chính nguồn này nhập: thêm số đuôi; cùng nguồn thì cập nhật.
    for (let n = 2; existing.has(name) && (skillTier(store,name)===1 || reg[name]?.source !== source); n++) name = `${wanted.slice(0, 35)}-${n}`;
    if (!SKILL_NAME_RE.test(name)) {
      out.skipped.push({ name, reason: "Tên không hợp lệ" });
      continue;
    }
    const desc = info.description || `Skill ${name}`;
    const rawFile = [
      "---",
      `name: ${name}`,
      `description: ${JSON.stringify(desc)}`,
      "load: manual",
      `source: ${oneLine(source, 200)}`,
      "---",
      "",
      p.body,
      "",
    ].join("\n");
    const normalized = normalizeSkill(rawFile, {profile: "full", owner: "user", addMissing: false});
    const errors = normalized.issues.filter(i => i.level === "error");
    if (errors.length) { out.skipped.push({name, reason: errors.map(i => i.message).join(" ")}); continue; }
    const file = normalized.md;
    const dir = path.join(store.dir, name);
    fs.mkdirSync(dir, { recursive: true });
    // Giữ lựa chọn bật/tắt nếu đây là lần cập nhật.
    let load: SkillLoad = "manual";
    if (reg[name]) {
      try { load = parseSkill(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")).load ?? "manual"; }
      catch { /* Chưa có bản cũ: giữ manual. */ }
    }
    fs.writeFileSync(path.join(dir, "SKILL.md"), load === "manual" ? file : file.replace("load: manual", `load: ${load}`));
    reg[name] = { source, at: Date.now(), sha1: crypto.createHash("sha1").update(file).digest("hex") };
    existing.add(name);
    out.installed.push({ name, ...(name !== wanted ? { renamedFrom: wanted } : {}) });
  }
  writeRegistry(store, reg);
  return out;
}

/** Dán thẳng nội dung một SKILL.md. */
export function installPasted(store: SkillStore, text: string, nameHint?: string): InstallResult {
  const p = parseLoose(text);
  const dirName = nameHint && nameHint.trim() ? nameHint : p.name || "skill-dan-tay";
  return installCandidates(store, "dán tay", [{ key: "paste", dirName, md: text }]);
}

/** Đổi chế độ nạp của skill không phải của PVTA (nhập về hoặc tự viết). */
export function setSkillLoad(store: SkillStore, name: string, load: SkillLoad, reviewedLearned = false): boolean {
  if (skillTier(store,name)===1 || !SKILL_NAME_RE.test(name) || /^pvta-/.test(name) || (!reviewedLearned && /^learned-/.test(name))) return false;
  const file = path.join(store.dir, name, "SKILL.md");
  let md: string;
  try {
    md = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n?)([\s\S]*)$/.exec(md);
  let next: string;
  if (m) {
    const head = m[1]!.split(/\r?\n/);
    const i = head.findIndex((l) => /^load:/i.test(l));
    if (i >= 0) head[i] = `load: ${load}`;
    else head.push(`load: ${load}`);
    next = `---\n${head.join("\n")}\n---\n${m[3]}`;
  } else {
    next = `---\nname: ${name}\ndescription: ${name}\nload: ${load}\n---\n${md}`;
  }
  fs.writeFileSync(file, next);
  return true;
}

/** Xóa skill (chỉ skill nhập từ ngoài hoặc tự viết; không đụng pvta-* và learned-*). */
export function deleteSkill(store: SkillStore, name: string): boolean {
  if (skillTier(store,name)===1 || !SKILL_NAME_RE.test(name) || /^(pvta|learned)-/.test(name)) return false;
  const dir = path.join(store.dir, name);
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  const reg = readRegistry(store);
  if (reg[name]) {
    delete reg[name];
    writeRegistry(store, reg);
  }
  return true;
}

/** Danh sách cho bảng Skills ở add-in. */
export function skillInfos(store: SkillStore): SkillInfo[] {
  const reg = readRegistry(store);
  return store.list().filter(s=>skillTier(store,s.name)!==1).map((s) => ({
    name: s.name,
    description: s.description,
    load: s.load,
    kind: s.name.startsWith("pvta-") ? "builtin" : s.name.startsWith("learned-") ? "learned" : s.name.startsWith("cd-") || reg[s.name] ? "community" : "own",
    ...(reg[s.name] ? { source: reg[s.name]!.source } : {}),
    chars: s.body.length,
  }));
}
