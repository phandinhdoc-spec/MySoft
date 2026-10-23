import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { findUnsafe, parseSkill, SKILL_NAME_RE } from "../skills.js";
import { recordsFromCsv } from "./book.js";
import type { GroupKind, GroupManifest } from "./types.js";

/**
 * Gói nhóm chia sẻ `.pvtagroup` (đặc tả 1.2): tệp nén gồm group.json, skills/, rules.md, sources.csv
 * và checksums.json. KHÔNG kèm kho/ (dung lượng, bản quyền sách) và index.db.
 * Mã băm chỉ bảo đảm tệp không hỏng hay bị sửa dở, không chứng minh tác giả là ai: gói nhập về luôn
 * ở mức "đồng nghiệp chia sẻ", và chỉ được bật sau khi người dùng xem tác giả và phiên bản.
 */

export const PACK_EXT = ".pvtagroup";
const LIMITS = { files: 300, fileBytes: 200_000, totalBytes: 4_000_000 } as const;
const TEXT_EXT = /\.(md|json|csv|txt)$/i;
const KINDS: GroupKind[] = ["chuyen-mon", "vai-tro", "dang-doan-the", "cong-cu"];
export const GROUP_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const HOST_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

const sha = (b: Uint8Array | string) => crypto.createHash("sha256").update(typeof b === "string" ? b : Buffer.from(b)).digest("hex");

export interface PackSource {
  manifest: GroupManifest;
  /** Đường dẫn trong gói -> nội dung. */
  files: Record<string, string>;
}

function checksums(files: Record<string, Uint8Array>): string {
  const entries = Object.keys(files)
    .filter((k) => k !== "checksums.json")
    .sort()
    .map((k) => [k, sha(files[k]!)] as const);
  const pack = sha(entries.map(([k, h]) => `${k}:${h}`).join("\n"));
  return JSON.stringify({ version: 1, pack, files: Object.fromEntries(entries) }, null, 2);
}

/** Đọc thư mục nhóm thành tệp gói. */
export function exportGroup(groupDir: string, manifest: GroupManifest): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const skillNames: string[] = [];
  const skillsDir = path.join(groupDir, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !SKILL_NAME_RE.test(e.name)) continue;
      const walk = (rel: string) => {
        for (const f of fs.readdirSync(path.join(skillsDir, rel), { withFileTypes: true })) {
          const r = path.posix.join(rel.split(path.sep).join("/"), f.name);
          if (f.isDirectory()) walk(r);
          else if (TEXT_EXT.test(f.name)) {
            const data = fs.readFileSync(path.join(skillsDir, r));
            if (data.length <= LIMITS.fileBytes) files[`skills/${r}`] = new Uint8Array(data);
          }
        }
      };
      walk(e.name);
      if (files[`skills/${e.name}/SKILL.md`]) skillNames.push(e.name);
    }
  }
  const rules = path.join(groupDir, "rules.md");
  if (fs.existsSync(rules)) files["rules.md"] = new Uint8Array(fs.readFileSync(rules));
  const csv = path.join(groupDir, "sources.csv");
  if (fs.existsSync(csv)) files["sources.csv"] = new Uint8Array(fs.readFileSync(csv));
  const m: GroupManifest = { ...manifest, skills: skillNames };
  files["group.json"] = strToU8(JSON.stringify(m, null, 2));
  files["checksums.json"] = strToU8(checksums(files));
  return zipSync(files, { level: 6 });
}

export interface PackPreview {
  ok: boolean;
  /** Lỗi chặn nhập. */
  problems: string[];
  warnings: string[];
  manifest?: GroupManifest;
  skills: string[];
  sourceCount: number;
  hasRules: boolean;
  /** Dữ liệu đã kiểm, dùng để nhập sau khi người dùng xác nhận. */
  files?: Record<string, string>;
  /** Phiên bản đang có trên máy (nếu cùng mã nhóm). */
  installedVersion?: string;
}

function cleanManifest(raw: unknown, problems: string[]): GroupManifest | undefined {
  if (!raw || typeof raw !== "object") {
    problems.push("group.json không hợp lệ.");
    return undefined;
  }
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const id = str(r.id, 41);
  if (!GROUP_ID_RE.test(id)) problems.push("Mã nhóm không hợp lệ (chỉ chữ thường, số, dấu gạch).");
  const name = str(r.name, 80);
  if (!name) problems.push("Thiếu tên nhóm.");
  const kind = KINDS.includes(r.kind as GroupKind) ? (r.kind as GroupKind) : undefined;
  if (!kind) problems.push("Loại nhóm không hợp lệ.");
  const version = str(r.version, 20);
  if (!/^\d+(\.\d+){0,2}$/.test(version)) problems.push("Phiên bản phải có dạng 1.0 hoặc 1.0.0.");
  const author = str(r.author, 80);
  if (!author) problems.push("Thiếu tên tác giả.");
  const list = (v: unknown, max: number, each: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, each)).filter(Boolean).slice(0, max) : []);
  const domains = list(r.domains, 30, 80).map((d) => d.toLowerCase());
  for (const d of domains) if (!HOST_RE.test(d)) problems.push(`Tên miền không hợp lệ: ${d}`);
  const feeds = list(r.feeds, 10, 300);
  for (const f of feeds) if (!/^https:\/\//i.test(f)) problems.push(`Nguồn tin phải là https: ${f}`);
  if (problems.length) return undefined;
  return {
    id,
    name,
    kind: kind!,
    version,
    author,
    // Gói từ bên ngoài không tự nhận "chính thức" được.
    tier: "dong-nghiep",
    description: str(r.description, 400) || undefined,
    skills: list(r.skills, 80, 64).filter((s) => SKILL_NAME_RE.test(s)),
    domains,
    feeds: feeds.length ? feeds : undefined,
    keywords: list(r.keywords, 60, 40),
    related: list(r.related, 20, 41).filter((g) => GROUP_ID_RE.test(g)),
  };
}

/** Kiểm tra gói (chưa ghi gì ra đĩa): đường dẫn, dung lượng, mã băm, findUnsafe, cấu trúc skill. */
export function previewPack(data: Uint8Array, installed?: (id: string) => GroupManifest | undefined): PackPreview {
  const res: PackPreview = { ok: false, problems: [], warnings: [], skills: [], sourceCount: 0, hasRules: false };
  let raw: Record<string, Uint8Array>;
  try {
    if (data.length > LIMITS.totalBytes) throw new Error("Tệp gói quá lớn.");
    raw = unzipSync(data, { filter: (f) => f.originalSize <= LIMITS.fileBytes });
  } catch (e) {
    res.problems.push(`Không mở được gói: ${(e as Error).message}`);
    return res;
  }
  const names = Object.keys(raw).filter((n) => !n.endsWith("/"));
  if (names.length > LIMITS.files) res.problems.push("Gói có quá nhiều tệp.");
  let total = 0;
  for (const n of names) {
    total += raw[n]!.length;
    if (n.startsWith("/") || n.includes("..") || n.includes("\\") || /^[A-Za-z]:/.test(n)) res.problems.push(`Đường dẫn không an toàn: ${n}`);
    else if (!TEXT_EXT.test(n)) res.problems.push(`Loại tệp không được phép trong gói: ${n}`);
    else if (!/^(group\.json|rules\.md|sources\.csv|checksums\.json|skills\/.+)$/.test(n)) res.problems.push(`Tệp nằm ngoài cấu trúc gói: ${n}`);
  }
  if (total > LIMITS.totalBytes) res.problems.push("Gói giải nén quá lớn.");
  if (!raw["group.json"]) res.problems.push("Thiếu group.json.");
  // Mã băm.
  const sums = raw["checksums.json"];
  if (!sums) res.problems.push("Thiếu checksums.json: không kiểm tra được mã băm.");
  else {
    try {
      const j = JSON.parse(strFromU8(sums)) as { pack?: string; files?: Record<string, string> };
      const want = JSON.parse(checksums(raw)) as { pack: string; files: Record<string, string> };
      if (j.pack !== want.pack) res.problems.push("Mã băm không khớp: tệp gói bị hỏng hoặc đã bị sửa.");
      else for (const [k, h] of Object.entries(want.files)) if (j.files?.[k] !== h) res.problems.push(`Mã băm tệp không khớp: ${k}`);
    } catch {
      res.problems.push("checksums.json không đọc được.");
    }
  }
  if (res.problems.length) return res;

  let manifest: GroupManifest | undefined;
  try {
    manifest = cleanManifest(JSON.parse(strFromU8(raw["group.json"]!)), res.problems);
  } catch {
    res.problems.push("group.json không đọc được.");
  }
  if (!manifest) return res;

  const files: Record<string, string> = {};
  const skillDirs = new Set<string>();
  for (const n of names) {
    if (n === "checksums.json") continue;
    const text = strFromU8(raw[n]!);
    files[n] = text;
    const sm = /^skills\/([^/]+)\//.exec(n);
    if (sm) skillDirs.add(sm[1]!);
    // sources.csv và group.json có link/tên miền vì bản chất; chữ hướng dẫn thì phải qua bộ lọc an toàn.
    if (/\.md$/i.test(n) || /\.txt$/i.test(n)) {
      const bad = findUnsafe(text);
      if (bad) res.problems.push(`${n}: ${bad}.`);
    }
  }
  for (const d of skillDirs) {
    if (!SKILL_NAME_RE.test(d)) {
      res.problems.push(`Tên skill không hợp lệ: ${d}`);
      continue;
    }
    const md = files[`skills/${d}/SKILL.md`];
    if (!md) {
      res.problems.push(`Skill ${d} thiếu SKILL.md.`);
      continue;
    }
    const p = parseSkill(md);
    if (!p.description) res.warnings.push(`Skill ${d} chưa có mô tả (description).`);
    if (p.load === "always") res.warnings.push(`Skill ${d} đòi nạp «luôn»: sẽ được hạ xuống «khi cần».`);
    res.skills.push(d);
  }
  if (files["sources.csv"]) {
    const r = recordsFromCsv(files["sources.csv"]);
    res.sourceCount = r.records.length;
    res.warnings.push(...r.skipped);
  }
  res.hasRules = !!files["rules.md"];
  res.manifest = { ...manifest, skills: res.skills.sort() };
  res.installedVersion = installed?.(manifest.id)?.version;
  res.files = files;
  res.ok = res.problems.length === 0;
  return res;
}

/** Ghi gói đã kiểm vào thư mục nhóm. Giữ nguyên kho/, chỉ mục và danh sách văn bản đã có. */
export function installPack(groupDir: string, preview: PackPreview): GroupManifest {
  if (!preview.ok || !preview.manifest || !preview.files) throw new Error("Gói chưa qua kiểm tra.");
  fs.mkdirSync(groupDir, { recursive: true });
  fs.rmSync(path.join(groupDir, "skills"), { recursive: true, force: true });
  for (const [rel, text] of Object.entries(preview.files)) {
    if (rel === "group.json" || rel === "sources.csv") continue;
    const dest = path.join(groupDir, rel);
    if (!path.resolve(dest).startsWith(path.resolve(groupDir) + path.sep)) throw new Error("Đường dẫn không an toàn.");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let out = text;
    if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) out = text.replace(/^(load:\s*)always\s*$/im, "$1demand");
    fs.writeFileSync(dest, out);
  }
  fs.writeFileSync(path.join(groupDir, "group.json"), JSON.stringify(preview.manifest, null, 2));
  return preview.manifest;
}
