import fs from "node:fs";
import path from "node:path";
import { parseSkill, SKILL_NAME_RE, type GroupLayer, type Skill } from "../skills.js";
import { recordsFromCsv } from "./book.js";
import { BUILTIN_GROUPS, builtinGroup, GROUP_KIND_LABEL, isToolKind, QUICK_PACKS, type QuickPack } from "./catalog.js";
import { GroupLibrary, type LibraryDeps } from "./library.js";
import { exportGroup, GROUP_ID_RE, installPack, previewPack, type PackPreview } from "./pack.js";
import { Registry } from "./registry.js";
import { gateSkills, pickSkills } from "./select.js";
import type { Hit } from "./index.js";
import type { GroupManifest, GroupsState, DiscoveryProfile, DiscoverySource, DiscoveryReport } from "./types.js";

import {cleanProfile,trackingSources} from "./profile.js";

/** Nhóm cá nhân: nơi lưu skill tự học đã được người dùng duyệt (đặc tả 1.9). Luôn nạp khi đã chọn nhóm. */
export const PERSONAL_GROUP = "ca-nhan";

export interface GroupView {
  id: string;
  name: string;
  kind: GroupManifest["kind"];
  enabled: boolean;
  tier: GroupManifest["tier"];
  version: string;
  author: string;
  docs: number;
  newDocs: number;
}

export interface GroupsView {
  /** false = chưa chọn nhóm lần nào: ứng dụng nên hiện màn hình chọn nhóm. */
  configured: boolean;
  profile?: DiscoveryProfile;
  sources?: DiscoverySource[];
  discoveryReports?: DiscoveryReport[];
  kinds: Array<{ kind: GroupManifest["kind"]; label: string; groups: GroupView[] }>;
  packs: QuickPack[];
  offline: boolean;
  briefing: boolean;
  pack?: string;
  totals: { sources: number; docs: number };
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export class GroupStore {
  readonly root: string;
  private stateFile: string;
  private st: GroupsState;
  private libs = new Map<string, GroupLibrary>();
  readonly registry: Registry;

  constructor(
    readonly home: string,
    private deps: LibraryDeps,
  ) {
    this.root = path.join(home, "groups");
    this.stateFile = path.join(home, "groups.json");
    this.st = readJson<GroupsState>(this.stateFile, { version: 1 });
    if (this.st.version !== 1) this.st = { version: 1 };
    this.registry = new Registry(() => this.allLibraries());
  }

  // ---------- trạng thái ----------
  state(): Readonly<GroupsState> {
    return this.st;
  }

  patchState(patch: Partial<GroupsState>): void {
    this.st = { ...this.st, ...patch, version: 1 };
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify(this.st, null, 2));
  }

  enabled(): string[] | undefined {
    return this.st.enabled;
  }

  isEnabled(id: string): boolean {
    return !!this.st.enabled?.includes(id);
  }

  setEnabled(ids: string[], pack?: string): string[] {
    const known = new Set(this.catalog().map((g) => g.id));
    const clean = [...new Set(ids.filter((i) => known.has(i)))];
    this.patchState({ enabled: clean, pack });
    return clean;
  }

  toggle(id: string, on: boolean): string[] {
    const cur = new Set(this.st.enabled ?? []);
    if (on) cur.add(id);
    else cur.delete(id);
    return this.setEnabled([...cur]);
  }

  applyPack(packId: string): string[] {
    const p = QUICK_PACKS.find((x) => x.id === packId);
    if (!p) throw new Error("Không có gói chọn nhanh này.");
    return this.setEnabled(p.groups, p.id);
  }

  // ---------- danh mục ----------
  /** Nhóm có sẵn + nhóm nhập từ gói (thư mục groups/<id>/group.json). */
  catalog(): GroupManifest[] {
    const out = new Map<string, GroupManifest>(BUILTIN_GROUPS.map((g) => [g.id, g]));
    if (fs.existsSync(this.root)) {
      for (const e of fs.readdirSync(this.root, { withFileTypes: true })) {
        if (!e.isDirectory() || !GROUP_ID_RE.test(e.name) || e.name === PERSONAL_GROUP) continue;
        const m = readJson<GroupManifest | undefined>(path.join(this.root, e.name, "group.json"), undefined);
        if (m && m.id === e.name && m.name && m.kind) out.set(m.id, { ...(out.get(m.id) ?? {}), ...m });
      }
    }
    return [...out.values()];
  }

  manifest(id: string): GroupManifest {
    const m = this.catalog().find((g) => g.id === id);
    if (!m) {
      if (id === PERSONAL_GROUP) return { id, name: "Cá nhân (tự học)", kind: "vai-tro", version: "1.0.0", author: "Bạn", tier: "ca-nhan", skills: [], domains: [], keywords: [], related: [] };
      throw new Error("Không có nhóm này.");
    }
    return m;
  }

  groupDir(id: string): string {
    if (!GROUP_ID_RE.test(id)) throw new Error("Mã nhóm không hợp lệ.");
    return path.join(this.root, id);
  }

  /** Tạo thư mục nhóm (và group.json cho nhóm có sẵn) khi lần đầu cần dùng. */
  ensure(id: string): string {
    const dir = this.groupDir(id);
    fs.mkdirSync(path.join(dir, "skills"), { recursive: true });
    const f = path.join(dir, "group.json");
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(this.manifest(id), null, 2));
    return dir;
  }

  library(id: string): GroupLibrary {
    let lib = this.libs.get(id);
    if (!lib) {
      this.ensure(id);
      lib = new GroupLibrary(this.groupDir(id), () => this.manifest(id), this.deps);
      this.libs.set(id, lib);
    }
    return lib;
  }

  /** Mọi nhóm đã có thư mục (kể cả chưa bật): cần cho việc tra tình trạng hiệu lực xuyên nhóm. */
  allLibraries(): Array<{ id: string; lib: GroupLibrary }> {
    const ids = new Set<string>(this.libs.keys());
    if (fs.existsSync(this.root)) for (const e of fs.readdirSync(this.root, { withFileTypes: true })) if (e.isDirectory() && GROUP_ID_RE.test(e.name) && fs.existsSync(path.join(this.root, e.name, "docs.json"))) ids.add(e.name);
    return [...ids].map((id) => ({ id, lib: this.library(id) }));
  }

  /** Nhóm đang bật có kho văn bản. Nhóm công cụ (Word, Excel, PDF…) không có kho nên không nằm ở đây. */
  enabledLibraries(): Array<{ id: string; lib: GroupLibrary }> {
    const cat = this.catalog();
    return (this.st.enabled ?? []).filter((id) => cat.some((g) => g.id === id && !isToolKind(g.kind))).map((id) => ({ id, lib: this.library(id) }));
  }

  // ---------- skill ----------
  /** Skill nằm trong thư mục nhóm; luôn gắn nhãn đúng nhóm, và không được tự đòi nạp «luôn» nếu không phải gói chính thức. */
  groupSkills(id: string): Skill[] {
    const dir = path.join(this.groupDir(id), "skills");
    if (!fs.existsSync(dir)) return [];
    const trusted = this.manifest(id).tier === "chinh-thuc";
    const out: Skill[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || !SKILL_NAME_RE.test(e.name)) continue;
      let md: string;
      try {
        md = fs.readFileSync(path.join(dir, e.name, "SKILL.md"), "utf8");
      } catch {
        continue;
      }
      const p = parseSkill(md);
      let load = p.load ?? "demand";
      if (load === "always" && !trusted) load = "demand";
      out.push({ name: e.name, description: p.description ?? "", load, body: p.body, dir: path.join(dir, e.name), groups: [id] });
    }
    return out;
  }

  /** Lớp nhóm gắn vào SkillStore: thêm skill của nhóm đang bật và ẩn skill của nhóm đang tắt. */
  layer(): GroupLayer {
    return {
      extra: () => {
        const en = this.st.enabled;
        if (!en) return [];
        return [...new Set([...en, PERSONAL_GROUP])].flatMap((id) => {
          try {
            return this.groupSkills(id);
          } catch {
            return [];
          }
        });
      },
      gate: (skills) => {
        const en = this.st.enabled;
        return gateSkills(skills, en ? [...en, PERSONAL_GROUP] : undefined);
      },
    };
  }

  /** Skill chọn cho một yêu cầu. enabled chưa đặt thì trả null để nơi gọi dùng cách chọn cũ. */
  pick(text: string, skills: Skill[], max = 3): Skill[] | null {
    const en = this.st.enabled;
    if (!en) return null;
    const groups = en.map((id) => this.catalog().find((g) => g.id === id)).filter((g): g is GroupManifest => !!g);
    return pickSkills(text, skills, { max, groups });
  }

  /** Quy tắc ngắn (cỡ chữ, xưng hô, thể thức) của các nhóm đang bật. */
  rulesText(maxChars = 2500): string {
    const parts: string[] = [];
    for (const id of this.st.enabled ? [...this.st.enabled, PERSONAL_GROUP] : []) {
      try {
        const f = path.join(this.groupDir(id), "rules.md");
        if (fs.existsSync(f)) parts.push(`# ${this.manifest(id).name}\n${fs.readFileSync(f, "utf8").trim()}`);
      } catch {
        /* nhóm đã bị gỡ */
      }
    }
    return parts.join("\n\n").slice(0, maxChars);
  }

  // ---------- tra cứu ----------
  /** Tra trong kho của các nhóm đang bật; kết quả bỏ văn bản hết hiệu lực (trừ khi xin xem). */
  search(query: string, o: { k?: number; includeExpired?: boolean; groups?: string[] } = {}): Array<Hit & { group: string }> {
    const cat = this.catalog();
    const ids = (o.groups ?? this.st.enabled ?? []).filter((id) => this.isEnabled(id) && !cat.some((g) => g.id === id && isToolKind(g.kind)));
    const hits: Array<Hit & { group: string }> = [];
    for (const id of ids) for (const h of this.library(id).search(query, { k: o.k, includeExpired: o.includeExpired })) hits.push({ ...h, group: id });
    return hits.sort((a, b) => b.score - a.score).slice(0, o.k ?? 6);
  }

  // ---------- gói chia sẻ ----------
  exportPack(id: string, dest: string): string {
    const dir = this.ensure(id);
    this.library(id).book.save();
    const data = exportGroup(dir, this.manifest(id));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    return dest;
  }

  previewPackFile(file: string): PackPreview {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 8_000_000) return { ok: false, problems: ["Tệp gói không hợp lệ hoặc quá lớn."], warnings: [], skills: [], sourceCount: 0, hasRules: false };
    return previewPack(fs.readFileSync(file), (id) => this.catalog().find((g) => g.id === id));
  }

  /** Nhập gói đã xem trước. Không tự bật nhóm: người dùng bật sau khi đã thấy tác giả và phiên bản. */
  installPreview(preview: PackPreview): GroupManifest {
    if (!preview.ok || !preview.manifest) throw new Error("Gói chưa qua kiểm tra.");
    const id = preview.manifest.id;
    // Gói chia sẻ không được ghi đè nhóm chính thức bằng mức tin cậy cao hơn: tier luôn là «đồng nghiệp».
    const dir = this.groupDir(id);
    const manifest = installPack(dir, preview);
    this.libs.get(id)?.close();
    this.libs.delete(id);
    const lib = this.library(id);
    const csv = preview.files?.["sources.csv"];
    if (csv) for (const r of recordsFromCsv(csv).records) lib.book.add({ ...r, source: "goi" });
    return manifest;
  }

  // ---------- hiển thị ----------
  view(): GroupsView {
    const enabled = new Set(this.st.enabled ?? []);
    const groups = this.catalog().map<GroupView>((g) => {
      let docs = 0;
      let newDocs = 0;
      if (!isToolKind(g.kind) && fs.existsSync(path.join(this.groupDir(g.id), "docs.json"))) {
        const list = this.library(g.id).book.list();
        docs = list.length;
        newDocs = list.filter((d) => d.isNew).length;
      }
      return { id: g.id, name: g.name, kind: g.kind, enabled: enabled.has(g.id), tier: g.tier, version: g.version, author: g.author, docs, newDocs };
    });
    const kinds = (["cong-cu", "chuyen-mon", "vai-tro", "dang-doan-the"] as const).map((kind) => ({ kind, label: GROUP_KIND_LABEL[kind], groups: groups.filter((g) => g.kind === kind) }));
    const totals = { sources: 0, docs: 0 };
    for (const g of groups) if (g.enabled) totals.docs += g.docs;
    for (const { lib } of this.enabledLibraries()) totals.sources += lib.book.list().filter((d) => !!d.url).length;
    return { profile:cleanProfile(this.st.profile), sources:trackingSources(cleanProfile(this.st.profile),this.st.sources), discoveryReports:this.st.discover?.reports??[], configured: !!this.st.enabled, kinds, packs: QUICK_PACKS, offline: !!this.st.offline, briefing: this.st.briefing?.enabled !== false, pack: this.st.pack, totals };
  }

  close(): void {
    for (const l of this.libs.values()) l.close();
    this.libs.clear();
  }
}

export { builtinGroup };
