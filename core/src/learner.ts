import {guideDigest,normalizeSkill} from "./standardize/skill.js";
import fs from "node:fs";
import path from "node:path";
import type { BackendId, Sentiment, ToolCall } from "@pvta/shared";
import type { Engine } from "./engine.js";
import { findUnsafe, SKILL_NAME_RE } from "./skills.js";

export const LEARN = {
  idleMs: 120_000,
  queueTrigger: 3,
  staleMs: 6 * 60 * 60 * 1000,
  maxRunsPerDay: 6,
  maxSkills: 30,
  /** Số lần khen tối thiểu (khi không có tín hiệu nào khác) mới đáng học. */
  praiseMin: 2,
  requestMaxChars: 200,
  skillBodyMax: 4000,
  /** Hàng đợi tối đa; học lỗi mãi (vd chưa đăng nhập) thì chỉ giữ các bản ghi mới nhất. */
  queueMax: 200,
} as const;

export interface LearnRecord {
  ts: number;
  /** Lời yêu cầu đã che thông tin cá nhân và cắt ngắn. */
  request: string;
  tools: string[];
  /** Chỉ TÊN tham số, không bao giờ có giá trị hay nội dung văn bản. */
  argNames: string[];
  backend: BackendId;
  model: string;
  /** Lời khen / chê của giáo viên về thao tác trước (đã che, cắt ngắn): tín hiệu học chủ động. */
  feedback?: Sentiment;
  /** Việc đã làm mà lời khen/chê nói tới (lời yêu cầu đã che, cắt ngắn). */
  about?: string;
  /** "high": học từ chỉnh sửa của giáo viên sau khi PVTA làm đẹp (không cần chờ đủ số lượng). */
  level?: "high";
  /** Loại văn bản đã làm đẹp (vd "đề kiểm tra / đề thi"). */
  docKind?: string;
  /** Những gì giáo viên sửa lại sau khi PVTA làm đẹp, đã trừu tượng hóa (không có chữ của văn bản). */
  edits?: string[];
}

/** Che thông tin cá nhân: email, URL, số điện thoại, dãy số dài (CCCD, tài khoản...). */
export function maskPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g, "[sđt]")
    .replace(/\b\d{9,}\b/g, "[số]");
}

/** Bản ghi học mức cao từ việc giáo viên chỉnh lại sau "Làm đẹp". Chỉ giữ đặc điểm, che thông tin cá nhân. */
export function beautifyRecord(i: { docKind: string; changes: string[]; backend: BackendId; model: string; now?: number }): LearnRecord {
  const edits = i.changes.map((c) => maskPersonal(c).replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean).slice(0, 20);
  return {
    ts: i.now ?? Date.now(),
    request: `làm đẹp ${i.docKind}`.slice(0, LEARN.requestMaxChars),
    tools: [],
    argNames: [],
    backend: i.backend,
    model: i.model,
    level: "high",
    docKind: i.docKind,
    edits: edits.length ? edits : ["giáo viên giữ nguyên bản PVTA đã làm đẹp"],
  };
}

export function sanitizeRecord(input: {
  request: string;
  calls: ToolCall[];
  backend: BackendId;
  model: string;
  now?: number;
  feedback?: Sentiment;
  about?: string;
}): LearnRecord {
  const request = maskPersonal(input.request).replace(/\s+/g, " ").trim().slice(0, LEARN.requestMaxChars);
  const tools = [...new Set(input.calls.map((c) => c.tool))];
  const argNames = [...new Set(input.calls.flatMap((c) => Object.keys(c.args)))];
  const rec: LearnRecord = { ts: input.now ?? Date.now(), request, tools, argNames, backend: input.backend, model: input.model };
  if (input.feedback) rec.feedback = input.feedback;
  if (input.about) rec.about = maskPersonal(input.about).replace(/\s+/g, " ").trim().slice(0, LEARN.requestMaxChars);
  return rec;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, v: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v, null, 2));
}

export class LearnQueue {
  constructor(private file: string) {}
  all(): LearnRecord[] {
    return readJson<LearnRecord[]>(this.file, []);
  }
  add(rec: LearnRecord): void {
    writeJson(this.file, [...this.all(), rec].slice(-LEARN.queueMax));
  }
  clear(): void {
    writeJson(this.file, []);
  }
  remove(records: LearnRecord[]): void {
    const drop = new Set(records.map((r) => `${r.ts}|${r.request}`));
    writeJson(this.file, this.all().filter((r) => !drop.has(`${r.ts}|${r.request}`)));
  }
}

interface DayState {
  date: string;
  runs: number;
}

function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class LearnState {
  constructor(private file: string) {}
  runsToday(now: number): number {
    const s = readJson<DayState>(this.file, { date: "", runs: 0 });
    return s.date === dayKey(now) ? s.runs : 0;
  }
  bump(now: number): void {
    writeJson(this.file, { date: dayKey(now), runs: this.runsToday(now) + 1 } satisfies DayState);
  }
}

/** Khi nào chạy học nền (đặc tả mục 6). */
export function shouldRun(i: {
  queue: LearnRecord[];
  now: number;
  lastActivity: number;
  runsToday: number;
  force?: boolean;
}): boolean {
  if (i.queue.length === 0) return false;
  // Khen đúng một lần chỉ là ghi chú tạm: chưa đủ để học. Cần thêm tín hiệu khác (hoặc khen lần hai).
  const praise = i.queue.filter((r) => r.feedback === "praise").length;
  if (i.queue.length === praise && praise < LEARN.praiseMin) return false;
  if (i.runsToday >= LEARN.maxRunsPerDay && !i.force) return false;
  if (i.force) return true;
  if (i.now - i.lastActivity < LEARN.idleMs) return false;
  const oldest = Math.min(...i.queue.map((r) => r.ts));
  return i.queue.length >= LEARN.queueTrigger || i.now - oldest > LEARN.staleMs;
}

export function buildLearnPrompt(records: LearnRecord[], existing: string[], rules = ""): string {
  const lines = records.map((r, i) => {
    if (r.level === "high") return `${i + 1}. LÀM ĐẸP "${r.docKind ?? ""}" – SAU ĐÓ GIÁO VIÊN SỬA: ${(r.edits ?? []).join("; ")}`;
    const base = `${i + 1}. yêu cầu: "${r.request}" | công cụ: ${r.tools.join(", ") || "(không)"} | tham số: ${r.argNames.join(", ") || "(không)"}`;
    if (!r.feedback) return base;
    return `${i + 1}. PHẢN HỒI ${r.feedback === "praise" ? "KHEN" : "CHÊ"}: "${r.request}" | về việc: "${r.about ?? ""}" | công cụ: ${r.tools.join(", ") || "(không)"} | tham số: ${r.argNames.join(", ") || "(không)"}`;
  });
  const hasFeedback = records.some((r) => r.feedback);
  const hasBeautify = records.some((r) => r.level === "high");
  return [
    "Bạn tạo skill ngắn từ thói quen làm việc của một giáo viên dùng Word/Excel/PowerPoint.",
    "Dưới đây là lịch sử đã làm sạch (không có nội dung văn bản). Chỉ rút ra quy trình/thói quen lặp lại, không bịa chi tiết cá nhân.",
    lines.join("\n"),
    ...(hasBeautify
      ? [
          [
            "MỨC HỌC CAO – các dòng LÀM ĐẸP: PVTA đã trình bày lại văn bản, rồi giáo viên tự sửa. Mỗi chỗ giáo viên sửa là SỬA LẠI CÁI PVTA LÀM (định dạng PVTA chọn là sai ý thầy cô).",
            "- Đặc điểm giáo viên chỉnh về (A → B): ghi thành quy tắc ngắn cho đúng loại văn bản đó (vd 'đề kiểm tra: cỡ chữ 13, căn đều hai bên'), lấy B làm chuẩn.",
            "- 'giữ nguyên' nghĩa là giáo viên chấp nhận cách trình bày PVTA chọn cho loại văn bản đó: ghi nhận như mặc định tốt, chỉ khi có đặc điểm cụ thể.",
            "- Đặt tên skill theo loại văn bản (vd learned-trinh-bay-de-kiem-tra); nếu đã có skill cùng loại thì dùng lại đúng tên để cập nhật. TUYỆT ĐỐI không ghi nội dung văn bản.",
          ].join("\n"),
        ]
      : []),
    ...(hasFeedback
      ? [
          [
            "Các dòng PHẢN HỒI là lời khen/chê của giáo viên về thao tác ngay trước đó. Cách dùng:",
            "- Khen: chỉ rút ra khi cùng một đặc điểm (định dạng, bố cục, giọng văn, cách làm) được khen từ hai lần trở lên; khen một lần thì BỎ QUA.",
            "- Chê: ghi thành điều nên TRÁNH hoặc cách làm đúng hơn, viết như quy tắc ngắn (vd 'tiêu đề không quá cỡ 16').",
            "- Chỉ ghi ĐẶC ĐIỂM đã trừu tượng hóa (cỡ chữ, màu, bố cục, độ dài, giọng văn, thứ tự các bước). TUYỆT ĐỐI không ghi nội dung văn bản, đề thi, tên người, tên trường hay số liệu cụ thể.",
          ].join("\n"),
        ]
      : []),
    `Skill đã có (không trùng tên): ${existing.join(", ") || "(chưa có)"}`,
    ...(rules.trim()
      ? [`Giáo viên ĐÃ tự viết các quy tắc sau (quy tắc chung và của dự án). KHÔNG học lại điều đã có ở đây, chỉ học thêm điều khác:\n${rules.trim().slice(0, 1500)}`]
      : []),
    guideDigest(),
    "Trả về tối đa 3 skill, mỗi skill đúng định dạng sau, không thêm chữ nào khác:",
    "<<<SKILL learned-ten-ngan-gon>>>\ndescription: một dòng, nêu khi nào nên dùng\n---\nHướng dẫn bằng Markdown, ngắn gọn (dưới 3000 ký tự), không chứa đường dẫn URL, lệnh shell hay khối mã công cụ.\n<<<END>>>",
    "Nếu chưa có thói quen đáng học, trả về đúng một dòng: NONE",
  ].join("\n\n");
}

export interface LearnedSkill {
  name: string;
  description: string;
  body: string;
}

export function parseLearnOutput(text: string): LearnedSkill[] {
  const out: LearnedSkill[] = [];
  const re = /<<<SKILL\s+([^\s>]+)\s*>>>([\s\S]*?)<<<END>>>/g;
  for (const m of text.matchAll(re)) {
    const name = m[1]!;
    const inner = m[2]!.trim();
    const sep = inner.indexOf("\n---");
    const head = sep >= 0 ? inner.slice(0, sep) : inner;
    const body = sep >= 0 ? inner.slice(sep + 4).trim() : "";
    const d = /^description:\s*(.+)$/im.exec(head);
    out.push({ name, description: (d?.[1] ?? "").trim(), body });
  }
  return out;
}

export function validateLearned(s: LearnedSkill): { ok: true } | { ok: false; reason: string } {
  if ((!/^learned-[a-z0-9-]{1,40}$/.test(s.name) && s.name !== "choice-model") || !SKILL_NAME_RE.test(s.name)) return { ok: false, reason: "tên skill không hợp lệ" };
  if (s.description.length < 10 || s.description.length > 300) return { ok: false, reason: "mô tả phải dài 10-300 ký tự" };
  if (s.body.length < 20 || s.body.length > LEARN.skillBodyMax) return { ok: false, reason: "nội dung quá ngắn hoặc quá dài" };
  const bad = findUnsafe(`${s.description}\n${s.body}`);
  if (bad) return { ok: false, reason: bad };
  return { ok: true };
}

export function writeLearned(
  skillsDir: string,
  s: LearnedSkill,
  now = Date.now(),
  opts: { source?: "file"; preserveExisting?: boolean } = {},
): { written: boolean; reason?: string } {
  const v = validateLearned(s);
  if (!v.ok) return { written: false, reason: v.reason };
  const md = `---\nname: ${s.name}\ndescription: ${s.description}\nload: demand\n${opts.source ? `source: ${opts.source}\n` : ""}---\n${s.body}\n`;
  const normalized = normalizeSkill(md, {profile: "full", owner: "system", addMissing: false});
  if (!normalized.ok) return {written: false, reason: normalized.issues.filter(i => i.level === "error").map(i => i.message).join(" ")};
  if (normalized.name !== s.name) return {written: false, reason: "tên skill không đúng khuôn; cần tạo lại tên"};
  const learned = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("learned-"))
    : [];
  const dir = path.join(skillsDir, s.name);
  const exists = fs.existsSync(dir);
  if (!exists && learned.length >= LEARN.maxSkills) return { written: false, reason: `đã đủ ${LEARN.maxSkills} skill học được` };
  if (exists && opts.preserveExisting) return { written: false, reason: "skill đã tồn tại; giữ nguyên nội dung người dùng" };
  if (exists) {
    const backup = path.join(skillsDir, ".backup", `${s.name}-${now}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.cpSync(dir, backup, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), normalized.md);
  return { written: true };
}

export interface LearnerDeps {
  engine: Engine;
  queue: LearnQueue;
  state: LearnState;
  skillsDir: string;
  cwd: string;
  now?: () => number;
  /** Học nền đang bật (mặc định bật). */
  enabled?: () => boolean;
  /** Quy tắc giáo viên tự viết (chung + dự án): để không học trùng. */
  rules?: () => string;
}

export interface LearnOutcome {
  ran: boolean;
  written: string[];
  rejected: Array<{ name: string; reason: string }>;
  error?: string;
}

export class Learner {
  lastActivity = Date.now();
  private running = false;
  constructor(private d: LearnerDeps) {}

  touch(): void {
    this.lastActivity = (this.d.now ?? Date.now)();
  }

  async maybeRun(opts: { force?: boolean } = {}): Promise<LearnOutcome> {
    const now = (this.d.now ?? Date.now)();
    const none: LearnOutcome = { ran: false, written: [], rejected: [] };
    if (this.running || this.d.enabled?.() === false) return none;
    const queue = this.d.queue.all();
    if (!shouldRun({ queue, now, lastActivity: this.lastActivity, runsToday: this.d.state.runsToday(now), force: opts.force })) return none;

    // Học bằng đúng backend và model đã làm việc: lấy nhóm của bản ghi đầu tiên.
    const first = queue[0]!;
    const group = queue.filter((r) => r.backend === first.backend && r.model === first.model);
    this.running = true;
    this.d.state.bump(now);
    try {
      const existing = fs.existsSync(this.d.skillsDir)
        ? fs.readdirSync(this.d.skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name)
        : [];
      const prompt = buildLearnPrompt(group, existing, this.d.rules?.() ?? "");
      fs.mkdirSync(this.d.cwd, { recursive: true });
      const res = await this.d.engine.run({
        backend: first.backend,
        model: first.model,
        cwd: this.d.cwd,
        effort: "low", // việc nền: nhanh và tiết kiệm lượt dùng của gói đăng ký
        permission: "ask", // không bật cờ yolo khi học
        buildPrompt: () => prompt,
        timeoutMs: 120_000,
      });
      const outcome: LearnOutcome = { ran: true, written: [], rejected: [] };
      for (const s of parseLearnOutput(res.text)) {
        const w = writeLearned(this.d.skillsDir, s, now);
        if (w.written) outcome.written.push(s.name);
        else outcome.rejected.push({ name: s.name, reason: w.reason ?? "" });
      }
      this.d.queue.remove(group);
      return outcome;
    } catch (e) {
      return { ran: true, written: [], rejected: [], error: e instanceof Error ? e.message : String(e) };
    } finally {
      this.running = false;
    }
  }
}

export interface LearnedInfo {
  name: string;
  description: string;
  body: string;
  /** "file": học từ tệp của giáo viên; ở lại máy, không bao giờ gửi cộng đồng. */
  source?: "file";
}

/** Các skill do PVTA tự học (learned-*), để giáo viên xem. */
export function listLearned(skillsDir: string): LearnedInfo[] {
  if (!fs.existsSync(skillsDir)) return [];
  const out: LearnedInfo[] = [];
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!e.isDirectory() || !e.name.startsWith("learned-") || !SKILL_NAME_RE.test(e.name)) continue;
    try {
      const md = fs.readFileSync(path.join(skillsDir, e.name, "SKILL.md"), "utf8");
      const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(md);
      const head = m?.[1] ?? "";
      const d = /^description:\s*(.+)$/im.exec(head);
      const fromFile = /^source:\s*file\s*$/im.test(head);
      out.push({ name: e.name, description: (d?.[1] ?? "").trim(), body: (m?.[2] ?? md).trim(), ...(fromFile ? { source: "file" as const } : {}) });
    } catch {
      /* bỏ qua thư mục hỏng */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Xóa hẳn một skill đã học (chỉ learned-*, không bao giờ đụng skill đi kèm hay skill của người dùng). Không để lại bản sao lưu. */
export function deleteLearned(skillsDir: string, name: string): boolean {
  if (!/^learned-[a-z0-9-]{1,40}$/.test(name) || !SKILL_NAME_RE.test(name)) return false;
  const dir = path.join(skillsDir, name);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  for (const b of fs.existsSync(path.join(skillsDir, ".backup")) ? fs.readdirSync(path.join(skillsDir, ".backup")) : []) {
    if (b.startsWith(`${name}-`)) fs.rmSync(path.join(skillsDir, ".backup", b), { recursive: true, force: true });
  }
  return true;
}
