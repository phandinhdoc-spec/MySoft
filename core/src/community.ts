import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { listLearned, maskPersonal, validateLearned } from "./learner.js";
import { REPO } from "./updater.js";

/**
 * Phản hồi cộng đồng: gói những skill PVTA đã học (learned-*) thành Markdown + JSON, che thông tin cá nhân,
 * rồi gửi lên GitHub dưới dạng một issue. Người phụ trách xem, chọn lọc, gộp vào thư mục skills/ (tiền tố cd-)
 * để bản cập nhật sau mang kiến thức chung đến mọi máy. Không gửi gì khi thầy cô chưa bấm Gửi.
 */

export const FEEDBACK_SCHEMA = "pvta-feedback/1";
/** Dấu hiệu ở đầu thân issue; tiêu đề cũng bắt đầu bằng TITLE_TAG để người phụ trách tìm. */
export const FEEDBACK_MARKER = "<!-- pvta-feedback -->";
export const TITLE_TAG = "[phan-hoi]";
/** GitHub giới hạn thân issue 65.536 ký tự; chừa chỗ cho phần mở đầu. */
export const JSON_BUDGET = 50_000;
export const MAX_FEEDBACK_SKILLS = 30;

export interface FeedbackSkill {
  name: string;
  description: string;
  body: string;
}

export interface FeedbackPackage {
  schema: typeof FEEDBACK_SCHEMA;
  /** Phiên bản PVTA đã gửi. */
  version: string;
  platform: "windows" | "macos" | "other";
  /** Chỉ ngày (YYYY-MM-DD), không có giờ. */
  date: string;
  skills: FeedbackSkill[];
}

export interface BuiltFeedback {
  pkg: FeedbackPackage;
  skipped: Array<{ name: string; reason: string }>;
  json: string;
  markdown: string;
  title: string;
  /** Thân issue đầy đủ (Markdown + khối JSON). */
  body: string;
}

export function platformName(p: NodeJS.Platform = process.platform): FeedbackPackage["platform"] {
  return p === "win32" ? "windows" : p === "darwin" ? "macos" : "other";
}

function oneLine(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Hàng rào Markdown dài hơn mọi chuỗi dấu huyền trong nội dung, để khối JSON không bị đứt. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

export function renderMarkdown(pkg: FeedbackPackage): string {
  const head = `# Phản hồi từ PVTA ${pkg.version} (${pkg.platform}, ${pkg.date})\n\n${pkg.skills.length} mục PVTA đã học, đã che thông tin cá nhân.\n`;
  const parts = pkg.skills.map((s) => `## ${s.name}\n\n> ${s.description}\n\n${s.body}\n`);
  return [head, ...parts].join("\n");
}

export interface BuildInput {
  skillsDir: string;
  version: string;
  platform?: NodeJS.Platform;
  now?: number;
  /** Chỉ gói các skill có tên trong danh sách này (thầy cô tích chọn). Bỏ trống = tất cả. */
  only?: string[];
}

/**
 * Gói skill đã học. Mỗi skill được che lại thông tin cá nhân và kiểm tra lại bằng đúng bộ lọc lúc học;
 * skill không qua được bị bỏ và nêu lý do. Không bao giờ gói skill đi kèm, skill tự viết, tệp phong cách,
 * hàng đợi học hay hội thoại.
 */
export function buildFeedback(i: BuildInput): BuiltFeedback {
  const want = i.only ? new Set(i.only) : undefined;
  const skipped: BuiltFeedback["skipped"] = [];
  const kept: FeedbackSkill[] = [];
  let size = 0;
  for (const it of listLearned(i.skillsDir)) {
    if (want && !want.has(it.name)) continue;
    // Skill học từ tệp của giáo viên ở lại máy: không bao giờ vào gói gửi cộng đồng.
    if (it.source === "file") continue;
    // Kiểm tra bản gốc trước, rồi mới che: che trước sẽ biến URL thành "[url]" và lọt qua bộ lọc.
    const v = validateLearned(it);
    if (!v.ok) {
      skipped.push({ name: it.name, reason: v.reason });
      continue;
    }
    const s: FeedbackSkill = { name: it.name, description: oneLine(maskPersonal(it.description), 300), body: maskPersonal(it.body).trim() };
    const cost = JSON.stringify(s).length + 2;
    if (kept.length >= MAX_FEEDBACK_SKILLS || size + cost > JSON_BUDGET) {
      skipped.push({ name: it.name, reason: "vượt giới hạn dung lượng một lần gửi" });
      continue;
    }
    size += cost;
    kept.push(s);
  }
  const date = new Date(i.now ?? Date.now()).toISOString().slice(0, 10);
  const pkg: FeedbackPackage = { schema: FEEDBACK_SCHEMA, version: i.version, platform: platformName(i.platform), date, skills: kept };
  const json = JSON.stringify(pkg, null, 2);
  const fence = fenceFor(json);
  const title = `${TITLE_TAG} PVTA ${i.version}: ${kept.length} mục học được`;
  const body = [
    FEEDBACK_MARKER,
    `Phản hồi tự động từ PVTA ${i.version} (${pkg.platform}): ${kept.length} mục đã học, đã che thông tin cá nhân. Thầy cô gửi chủ động bằng nút Gửi trong Cài đặt.`,
    "",
    `${fence}json`,
    json,
    fence,
    "",
  ].join("\n");
  return { pkg, skipped, json, markdown: renderMarkdown(pkg), title, body };
}

export interface ParsedFeedback {
  skills: FeedbackSkill[];
  rejected: Array<{ name: string; reason: string }>;
}

/**
 * Đọc lại gói từ thân một issue (dùng ở phía người phụ trách). Kiểm tra từng skill như lúc học:
 * issue có thể do bất kỳ ai viết, nên không tin nội dung. Trả về undefined nếu không phải gói phản hồi.
 */
export function parseFeedbackIssue(body: string): ParsedFeedback | undefined {
  if (!body.includes(FEEDBACK_MARKER)) return undefined;
  const m = /(`{3,})json\r?\n([\s\S]*?)\r?\n\1(?!`)/.exec(body);
  if (!m) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(m[2]!);
  } catch {
    return undefined;
  }
  const o = raw as Partial<FeedbackPackage> | null;
  if (!o || (o.schema as string) !== FEEDBACK_SCHEMA && (o.schema as string) !== "pvta-feedback/1" || !Array.isArray(o.skills)) return undefined;
  const skills: FeedbackSkill[] = [];
  const rejected: ParsedFeedback["rejected"] = [];
  const seen = new Set<string>();
  for (const x of o.skills.slice(0, MAX_FEEDBACK_SKILLS)) {
    const s = x as Partial<FeedbackSkill>;
    const name = typeof s?.name === "string" ? s.name : "(không tên)";
    if (typeof s?.name !== "string" || typeof s.description !== "string" || typeof s.body !== "string") {
      rejected.push({ name, reason: "thiếu trường" });
      continue;
    }
    // Nội dung do người ngoài gửi: kiểm tra bản gốc (không che trước), rồi mới che lại thông tin cá nhân.
    const raw: FeedbackSkill = { name: s.name, description: s.description.trim(), body: s.body.trim() };
    const v = validateLearned(raw);
    if (!v.ok) {
      rejected.push({ name, reason: v.reason });
      continue;
    }
    const clean: FeedbackSkill = { name: raw.name, description: oneLine(maskPersonal(raw.description), 300), body: maskPersonal(raw.body).trim() };
    if (seen.has(clean.name)) rejected.push({ name, reason: "trùng tên trong cùng gói" });
    else (seen.add(clean.name), skills.push(clean));
  }
  return { skills, rejected };
}

/** Lưu bản Markdown và JSON trên máy để thầy cô giữ hoặc gửi bằng cách khác. */
export function saveFeedbackFiles(dir: string, built: BuiltFeedback, now = Date.now()): { json: string; md: string } {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const base = path.join(dir, `pvta-phan-hoi-${stamp}`);
  fs.writeFileSync(`${base}.json`, built.json);
  fs.writeFileSync(`${base}.md`, built.markdown);
  return { json: `${base}.json`, md: `${base}.md` };
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Không tìm thấy lệnh. */
  missing?: boolean;
}
export type RunFn = (file: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>;

/** Chạy một lệnh (không qua shell, nên không có chuyện chèn lệnh từ tên hay nội dung). */
export const runCommand: RunFn = (file, args, opts = {}) =>
  new Promise((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    const finish = (r: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const p = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const timer = setTimeout(() => {
      p.kill();
      finish({ code: null, stdout: out, stderr: `${err}\nhết thời gian chờ` });
    }, opts.timeoutMs ?? 60_000);
    p.stdout.on("data", (d) => (out += String(d)));
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", (e) => finish({ code: null, stdout: out, stderr: String(e), missing: (e as NodeJS.ErrnoException).code === "ENOENT" }));
    p.on("close", (code) => finish({ code, stdout: out, stderr: err }));
  });

export type SendResult =
  | { ok: true; url: string }
  | { ok: false; reason: "no-gh" | "not-logged-in" | "failed"; message: string };

/**
 * Gửi bằng GitHub CLI (gh) nếu máy có và đã đăng nhập. Không bao giờ lưu hay nhúng khóa truy cập trong PVTA.
 * Máy không có gh: nơi gọi chuyển sang cách thủ công (dán vào trang tạo issue).
 */
export async function sendViaGh(i: { title: string; body: string; tmpDir: string; run?: RunFn }): Promise<SendResult> {
  const run = i.run ?? runCommand;
  const v = await run("gh", ["--version"], { timeoutMs: 15_000 });
  if (v.missing || v.code !== 0) return { ok: false, reason: "no-gh", message: "Máy chưa cài GitHub CLI (gh)." };
  const a = await run("gh", ["auth", "status"], { timeoutMs: 20_000 });
  if (a.code !== 0) return { ok: false, reason: "not-logged-in", message: "gh chưa đăng nhập GitHub." };
  fs.mkdirSync(i.tmpDir, { recursive: true });
  const file = path.join(i.tmpDir, ".issue-body.md");
  fs.writeFileSync(file, i.body);
  try {
    const r = await run("gh", ["issue", "create", "--repo", REPO, "--title", i.title, "--body-file", file], { timeoutMs: 60_000 });
    if (r.code !== 0) return { ok: false, reason: "failed", message: oneLine(r.stderr || r.stdout, 200) || "gh không tạo được issue." };
    const url = /https:\/\/github\.com\/\S+/.exec(r.stdout)?.[0];
    return url ? { ok: true, url } : { ok: false, reason: "failed", message: "gh không trả về địa chỉ issue." };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/**
 * Địa chỉ trang tạo issue có sẵn tiêu đề. Thân chỉ là lời nhắc dán: nội dung đầy đủ có thể dài hơn giới hạn của địa chỉ,
 * nên add-in chép vào bộ nhớ tạm để thầy cô dán.
 */
export function manualIssueUrl(title: string): string {
  const note = "Dán nội dung phản hồi vào đây (Ctrl+V trên Windows, Cmd+V trên Mac), rồi bấm Submit new issue.";
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(note)}`;
}

export interface IssueLike {
  number: number;
  title?: string;
  body: string;
}

export interface MergeCandidate {
  /** Tên skill sẽ lưu trong skills/ (tiền tố cd-). */
  name: string;
  description: string;
  body: string;
  /** Các issue có cùng nội dung (cùng ý được nhiều máy gửi lên). */
  issues: number[];
}

export interface MergePlan {
  candidates: MergeCandidate[];
  rejected: Array<{ issue: number; name: string; reason: string }>;
  /** Issue không phải gói phản hồi hợp lệ. */
  ignored: number[];
}

function slugOf(learnedName: string): string {
  return learnedName.replace(/^learned-/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56).replace(/-+$/g, "") || "muc";
}

/**
 * Lập kế hoạch gộp kiến thức cộng đồng (phía người phụ trách). Không ghi gì: chỉ liệt kê skill đạt kiểm tra để người
 * phụ trách đọc rồi mới duyệt. Cùng nội dung từ nhiều issue gộp làm một; cùng tên khác nội dung thì thêm hậu tố -2, -3…;
 * tên đã có trong `existing` (skill cd-* đã duyệt) được giữ nguyên, không ghi đè.
 */
export function planMerge(issues: IssueLike[], existing: Iterable<string>): MergePlan {
  const taken = new Set(existing);
  const byContent = new Map<string, MergeCandidate>();
  const plan: MergePlan = { candidates: [], rejected: [], ignored: [] };
  for (const it of [...issues].sort((a, b) => a.number - b.number)) {
    const parsed = parseFeedbackIssue(it.body ?? "");
    if (!parsed) {
      plan.ignored.push(it.number);
      continue;
    }
    for (const r of parsed.rejected) plan.rejected.push({ issue: it.number, name: r.name, reason: r.reason });
    for (const s of parsed.skills) {
      const key = `${s.description}\n${s.body}`;
      const same = byContent.get(key);
      if (same) {
        if (!same.issues.includes(it.number)) same.issues.push(it.number);
        continue;
      }
      const base = `cd-${slugOf(s.name)}`;
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
      taken.add(name);
      const c: MergeCandidate = { name, description: s.description, body: s.body, issues: [it.number] };
      byContent.set(key, c);
      plan.candidates.push(c);
    }
  }
  return plan;
}

/** Nội dung SKILL.md của một mục đã duyệt: nạp theo nhu cầu (demand) để không tốn token mỗi lượt. */
export function renderCommunitySkill(c: Pick<MergeCandidate, "name" | "description" | "body">): string {
  return `---\nname: ${c.name}\ndescription: ${oneLine(c.description, 300)}\nload: demand\n---\n${c.body}\n`;
}
