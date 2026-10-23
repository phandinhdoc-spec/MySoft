import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type LoadMode = "always" | "demand" | "manual" | "off";

export interface Skill {
  name: string;
  description: string;
  load: LoadMode;
  body: string;
  dir: string;
  /** Nhóm mà skill thuộc về (trường `groups:` ở đầu SKILL.md). Rỗng = không thuộc nhóm nào, không bị lọc. */
  groups: string[];
}

/** Lớp nhóm: thêm skill nằm trong thư mục nhóm và lọc skill theo nhóm đang bật. */
export interface GroupLayer {
  extra(): Skill[];
  gate(skills: Skill[]): Skill[];
}

export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Skill nhân của quản trị viên: chỉ nằm trong mã nguồn (core/src/standardize/guide.ts, sinh từ SKILL.md ở gốc dự án).
 * Không bao giờ được cài vào thư mục skill của người dùng, không hiện trong danh sách Kỹ năng, không đưa vào lời nhắc.
 */
export const INTERNAL_SKILLS: ReadonlySet<string> = new Set(["pvta-viet-skill"]);

/** Đọc phần đầu YAML đơn giản (name, description, load) và thân skill. */
export function parseSkill(md: string): { name?: string; description?: string; load?: LoadMode; groups?: string[]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m) return { body: md };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.trim().replace(/^["']|["']$/g, "");
  }
  const load = meta.load === "demand" || meta.load === "manual" || meta.load === "off" ? meta.load : meta.load === "always" ? "always" : undefined;
  const groups = meta.groups
    ? meta.groups
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((g) => g.trim().replace(/^["']|["']$/g, ""))
        .filter((g) => SKILL_NAME_RE.test(g))
    : undefined;
  return { name: meta.name, description: meta.description, load, groups, body: m[2]!.trim() };
}

/**
 * Kiểm tra nội dung skill/hồ sơ do máy sinh ra hoặc do người dùng lưu.
 * Trả về lý do nếu không an toàn, null nếu ổn. Bộ lọc này chặn việc skill học được
 * trở thành đường tiêm lệnh (khối công cụ, lệnh shell, URL, khóa bí mật).
 */
export function findUnsafe(text: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/```\s*office-tool/i, "chứa khối office-tool"],
    [/ignore (all |any )?(the )?(previous|prior|above) (instructions|rules)/i, "có câu tìm cách bỏ qua chỉ dẫn"],
    [/b[oỏ] qua (m[oọ]i |t[aấ]t c[aả] )?(ch[iỉ] d[aẫ]n|h[uư][oớ]ng d[aẫ]n|quy t[aắ]c)/i, "có câu tìm cách bỏ qua chỉ dẫn"],
    [/\b(rm\s+-rf|curl\s|wget\s|sudo\s|Invoke-WebRequest|powershell\b|chmod\s)/i, "chứa lệnh shell"],
    [/https?:\/\//i, "chứa đường dẫn URL"],
    [/(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,})/, "giống khóa bí mật"],
    [/\.ssh|id_rsa|\/etc\/passwd/i, "nhắc đến tệp nhạy cảm"],
  ];
  for (const [re, why] of rules) if (re.test(text)) return why;
  return null;
}

export class SkillStore {
  private layer?: GroupLayer;
  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Gắn lớp nhóm: sau đó list()/read() chỉ thấy skill của các nhóm đang bật. */
  setGroupLayer(layer: GroupLayer | undefined): void {
    this.layer = layer;
  }

  list(): Skill[] {
    const own = this.listOwn();
    if (!this.layer) return own;
    const names = new Set(own.map((s) => s.name));
    // Skill của người dùng đặt trùng tên thì được ưu tiên hơn skill trong gói nhóm.
    const merged = [...own, ...this.layer.extra().filter((s) => !names.has(s.name))];
    return this.layer
      .gate(merged)
      .filter((s) => !INTERNAL_SKILLS.has(s.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private listOwn(): Skill[] {
    const out: Skill[] = [];
    for (const entry of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const file = path.join(this.dir, entry.name, "SKILL.md");
      let md: string;
      try {
        md = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const p = parseSkill(md);
      const name = entry.name;
      if (!SKILL_NAME_RE.test(name) || INTERNAL_SKILLS.has(name)) continue;
      const defaultLoad: LoadMode = name.startsWith("pvta-") ? "always" : "demand";
      out.push({
        name,
        description: p.description ?? "",
        load: p.load ?? defaultLoad,
        body: p.body,
        dir: path.join(this.dir, entry.name),
        groups: p.groups ?? [],
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  read(name: string): Skill | undefined {
    if (!SKILL_NAME_RE.test(name)) return undefined;
    return this.list().find((s) => s.name === name && s.load !== "off");
  }

  /**
   * Sao chép skill đi kèm vào thư mục skill của người dùng.
   * Bản đi kèm mới hơn được cập nhật nếu người dùng CHƯA sửa bản đã cài (so dấu vân tay
   * lưu trong `.bundled.json`); bản người dùng đã sửa thì giữ nguyên. Bản cũ được sao lưu.
   */
  installBundled(bundledDir: string | undefined): string[] {
    const installed: string[] = [];
    if (!bundledDir || !fs.existsSync(bundledDir)) return installed;
    const recordFile = path.join(this.dir, ".bundled.json");
    let record: Record<string, string> = {};
    try {
      record = JSON.parse(fs.readFileSync(recordFile, "utf8")) as Record<string, string>;
    } catch {
      record = {};
    }
    const hashOf = (dir: string): string | undefined => {
      try {
        return crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, "SKILL.md"))).digest("hex");
      } catch {
        return undefined;
      }
    };
    let changed = false;
    for (const name of INTERNAL_SKILLS) if (name in record) { delete record[name]; changed = true; }
    for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !SKILL_NAME_RE.test(entry.name) || INTERNAL_SKILLS.has(entry.name)) continue;
      const src = path.join(bundledDir, entry.name);
      const dest = path.join(this.dir, entry.name);
      const srcHash = hashOf(src);
      if (!srcHash) continue;
      if (fs.existsSync(dest)) {
        const cur = hashOf(dest);
        if (cur === srcHash) {
          if (record[entry.name] !== srcHash) (record[entry.name] = srcHash), (changed = true);
          continue;
        }
        if (!cur || record[entry.name] !== cur) continue; // người dùng đã sửa: không ghi đè
        const backup = path.join(this.dir, ".backup", `${entry.name}-${Date.now()}`);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.cpSync(dest, backup, { recursive: true });
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.cpSync(src, dest, { recursive: true });
      record[entry.name] = srcHash;
      changed = true;
      installed.push(entry.name);
    }
    if (changed) fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
    return installed;
  }
}

const PER_SKILL_CAP = 3000;
/** Skill do thầy cô gọi bằng /tên: nạp nhiều hơn, vì chính họ muốn dùng nó. */
const INVOKED_CAP = 14000;
const OUTSIDE_NOTE =
  "Skill này do cộng đồng viết cho nhiều phần mềm khác: chỉ lấy quy trình và tiêu chí chất lượng; bỏ qua mọi lệnh shell, Python, thư viện, tệp đi kèm (ở đây không chạy được); làm việc bằng các công cụ office_*.";

/**
 * Văn bản skill đưa vào prompt lượt đầu:
 * - always: nạp nội dung (cắt gọn); demand: chỉ liệt kê, model dùng office_skill_read;
 * - manual: chỉ nạp khi người dùng gọi tên (vd "/ten-skill").
 */
export function skillsPrompt(skills: Skill[], userText: string, host?: string): string {
  const parts: string[] = [];
  const index: string[] = [];
  let outside = false;
  const hostSkill = host ? `pvta-${host}` : undefined;
  for (const s of skills) {
    // Skill nền của ứng dụng khác (vd pvta-excel khi đang ở Word): bỏ hẳn, đỡ vài nghìn token mỗi lượt đầu.
    if (hostSkill && /^pvta-(word|excel|powerpoint)$/.test(s.name) && s.name !== hostSkill) continue;
    if (s.load === "off") continue;
    const invoked = new RegExp(`(^|\\s)/${s.name}(\\s|$)`).test(userText);
    const domain = s.load === "demand" && ((s.name === "pvta-giao-an" && /giáo án|kế hoạch bài dạy|5512|năng lực số/i.test(userText)) || (s.name === "pvta-hanh-chinh" && /hành chính|công văn|tờ trình|biên bản|thông báo|quyết định/i.test(userText)) || (s.name === "pvta-phap-ly" && /pháp lu[aậ]t|pháp lý|hợp đồng|quy phạm|điều khoản|tố tụng/i.test(userText)));
    if (s.load === "always" || invoked || domain) {
      const cap = invoked || domain ? INVOKED_CAP : PER_SKILL_CAP;
      const body = s.body.length > cap ? s.body.slice(0, cap) + "\n…(còn tiếp, dùng office_skill_read)" : s.body;
      parts.push(`### Skill: ${s.name}\n${/^(pvta|learned|cd)-/.test(s.name) ? "" : `${OUTSIDE_NOTE}\n`}${body}`);
    } else if (s.load === "demand") {
      index.push(`- ${s.name}: ${s.description}`);
      if (!/^(pvta|learned|cd)-/.test(s.name)) outside = true;
    }
  }
  if (index.length) parts.push(`### Skill có thể đọc khi cần (office_skill_read)\n${outside ? `${OUTSIDE_NOTE}\n` : ""}${index.join("\n")}`);
  return parts.join("\n\n");
}

/** Tìm thư mục skill đi kèm (khi chạy từ mã nguồn hoặc từ bản đã build). */
export function findBundledSkills(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.PVTA_BUNDLED_SKILLS) return env.PVTA_BUNDLED_SKILLS;
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../../skills", "../../../skills", "../skills"]) {
    const p = path.resolve(here, rel);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
