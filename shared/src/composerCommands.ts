import { foldVi } from "./composerTrigger.js";

/**
 * Lệnh quản lý quy tắc và kỹ năng ngay trong ô soạn (chế độ viết).
 * - Quy tắc: #thêm, #sửa, #xóa, #liệt kê (chỉ nhận ở đầu tin nhắn).
 * - Kỹ năng: /kỹ-năng thêm|sửa|xóa|liệt kê.
 * Hàm thuần: không gọi mạng, không đụng trạng thái; giao diện tự thực thi kết quả.
 */

export type RuleOp = "add" | "edit" | "delete" | "list";
export type SkillOp = "add" | "edit" | "delete" | "list";

export type ComposerCommand =
  | { kind: "rule"; op: "add"; title: string; text: string }
  | { kind: "rule"; op: "edit"; target: string; text: string }
  | { kind: "rule"; op: "delete"; target: string }
  | { kind: "rule"; op: "list" }
  | { kind: "skill"; op: "add"; name: string; description: string }
  | { kind: "skill"; op: "edit"; target: string }
  | { kind: "skill"; op: "delete"; target: string }
  | { kind: "skill"; op: "list" };

/** Kết quả phân tích: lệnh hợp lệ, lỗi cú pháp (đã có câu hướng dẫn), hoặc null nếu là tin nhắn thường. */
export type ParsedCommand = { command: ComposerCommand } | { error: string } | null;

export const RULE_TITLE_MAX = 80;
export const RULE_TEXT_MAX = 2000;
export const SKILL_NAME_MAX = 64;
export const RESERVED_SKILL_PREFIXES = ["pvta-", "office-", "learned-"] as const;

const RULE_VERBS: Record<string, RuleOp> = { "them": "add", "sua": "edit", "xoa": "delete", "liet ke": "list", "danh sach": "list" };
const SKILL_VERBS: Record<string, SkillOp> = { "them": "add", "sua": "edit", "xoa": "delete", "liet ke": "list", "danh sach": "list" };

/** Tách hai từ đầu (nếu có) để nhận diện động từ như "liệt kê" và "danh sách" (không phân biệt dấu). */
function takeVerb(s: string, verbs: Record<string, unknown>): { verb: string; rest: string } | undefined {
  const t = s.trim();
  const one = /^\S+/.exec(t)?.[0] ?? "";
  const afterOne = t.slice(one.length).trimStart();
  const two = /^\S+/.exec(afterOne)?.[0] ?? "";
  const afterTwo = afterOne.slice(two.length).trimStart();
  if (two) {
    const pair = foldVi(`${one} ${two}`);
    if (pair in verbs) return { verb: pair, rest: afterTwo };
  }
  const single = foldVi(one);
  if (one && single in verbs) return { verb: single, rest: afterOne };
  return undefined;
}

/** Lấy mục tiêu: chuỗi trong dấu ngoặc kép hoặc một từ. Trả về phần còn lại sau mục tiêu. */
export function takeTarget(s: string): { target: string; rest: string } {
  const t = s.trim();
  const quoted = /^"([^"]+)"\s*([\s\S]*)$/.exec(t);
  if (quoted) return { target: quoted[1]!.trim(), rest: quoted[2]!.trim() };
  const m = /^(\S+)\s*([\s\S]*)$/.exec(t);
  return m ? { target: m[1]!, rest: m[2]!.trim() } : { target: "", rest: "" };
}

const RULE_USAGE = "Cú pháp: #thêm <nội dung> · #sửa <số hoặc khóa> <nội dung mới> · #xóa <số hoặc khóa> · #liệt kê";
const SKILL_USAGE = "Cú pháp: /kỹ-năng thêm <tên> <mô tả> · /kỹ-năng sửa <tên> · /kỹ-năng xóa <tên> · /kỹ-năng liệt kê";

function parseRule(body: string): ParsedCommand {
  const hit = takeVerb(body, RULE_VERBS);
  if (!hit) return { error: `Không hiểu lệnh quy tắc. ${RULE_USAGE}` };
  const op = RULE_VERBS[hit.verb]!;
  if (op === "list") return { command: { kind: "rule", op: "list" } };
  if (op === "add") {
    const rest = hit.rest.trim();
    if (!rest) return { error: `Thiếu nội dung quy tắc. ${RULE_USAGE}` };
    const colon = rest.indexOf(":");
    let title = "";
    let text = rest;
    if (colon > 0 && colon <= RULE_TITLE_MAX) {
      title = rest.slice(0, colon).trim();
      text = rest.slice(colon + 1).trim();
    }
    if (!title) title = rest.split(/\s+/).slice(0, 8).join(" ").slice(0, RULE_TITLE_MAX);
    if (text.length > RULE_TEXT_MAX) return { error: `Quy tắc quá dài (tối đa ${RULE_TEXT_MAX} ký tự).` };
    return { command: { kind: "rule", op: "add", title, text } };
  }
  const { target, rest } = takeTarget(hit.rest);
  if (!target) return { error: `Thiếu quy tắc cần xử lý. ${RULE_USAGE}` };
  if (op === "delete") return { command: { kind: "rule", op: "delete", target } };
  if (!rest) return { error: `Thiếu nội dung mới cho quy tắc “${target}”. ${RULE_USAGE}` };
  if (rest.length > RULE_TEXT_MAX) return { error: `Quy tắc quá dài (tối đa ${RULE_TEXT_MAX} ký tự).` };
  return { command: { kind: "rule", op: "edit", target, text: rest } };
}

/** Tên kỹ năng: chữ thường không dấu, nối bằng gạch ngang. */
export function skillSlugFromInput(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, "");
}

function parseSkill(body: string): ParsedCommand {
  const hit = takeVerb(body, SKILL_VERBS);
  if (!hit) return { error: `Không hiểu lệnh kỹ năng. ${SKILL_USAGE}` };
  const op = SKILL_VERBS[hit.verb]!;
  if (op === "list") return { command: { kind: "skill", op: "list" } };
  if (op === "add") {
    const { target: rawName, rest: description } = takeTarget(hit.rest);
    if (!rawName || !description) return { error: `Thiếu tên hoặc mô tả kỹ năng. ${SKILL_USAGE}` };
    const name = skillSlugFromInput(rawName);
    if (!name) return { error: "Tên kỹ năng chỉ gồm chữ và số, ví dụ: soan-de-khtn." };
    if (RESERVED_SKILL_PREFIXES.some((p) => name.startsWith(p)))
      return { error: `Tên không được bắt đầu bằng ${RESERVED_SKILL_PREFIXES.join(", ")} (dành cho PVTA).` };
    return { command: { kind: "skill", op: "add", name, description } };
  }
  const { target } = takeTarget(hit.rest);
  if (!target) return { error: `Thiếu tên kỹ năng. ${SKILL_USAGE}` };
  if (op === "delete") return { command: { kind: "skill", op: "delete", target } };
  return { command: { kind: "skill", op: "edit", target } };
}

/**
 * Phân tích một tin nhắn. Chỉ nhận khi tin nhắn một dòng bắt đầu bằng # (quy tắc) hoặc / + "kỹ-năng".
 * Trả về null với mọi tin nhắn thường, để gửi đi như bình thường.
 */
export function parseComposerCommand(input: string): ParsedCommand {
  const text = input.trim();
  if (!text || text.includes("\n")) return null;
  if (text.startsWith("#")) {
    const body = text.slice(1);
    // Chỉ coi là lệnh khi động từ đầu tiên là từ khóa đã biết; "#khóa-quy-tắc" thường vẫn gửi như cũ.
    return takeVerb(body, RULE_VERBS) ? parseRule(body) : null;
  }
  if (text.startsWith("/")) {
    const first = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
    if (!first) return null;
    const head = foldVi(first[1]!);
    const afterHead = first[2]!;
    if (head === "ky-nang") return parseSkill(afterHead);
    if (head === "ky") {
      const second = /^(\S+)\s*([\s\S]*)$/.exec(afterHead);
      if (second && foldVi(second[1]!) === "nang") return parseSkill(second[2]!);
    }
    return null;
  }
  return null;
}

export interface TargetItem {
  key: string;
  title: string;
}
export type TargetResult = { ok: true; index: number } | { ok: false; error: string };

/**
 * Tìm mục cần sửa/xóa: số thứ tự (từ 1) theo danh sách hiện hiển thị, hoặc khóa chính xác,
 * hoặc tên chính xác, hoặc chuỗi con duy nhất. Nhiều mục khớp thì không tự chọn.
 */
export function resolveTarget(items: readonly TargetItem[], target: string): TargetResult {
  const raw = target.trim().replace(/^[#/]/, "");
  if (!raw) return { ok: false, error: "Thiếu mục cần chọn." };
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= items.length) return { ok: true, index: n - 1 };
    return { ok: false, error: `Không có mục số ${raw}. Hãy dùng #liệt kê để xem số thứ tự.` };
  }
  const f = foldVi(raw);
  const byKey = items.findIndex((i) => foldVi(i.key) === f);
  if (byKey >= 0) return { ok: true, index: byKey };
  const byTitle = items.findIndex((i) => foldVi(i.title) === f);
  if (byTitle >= 0) return { ok: true, index: byTitle };
  const partial = items.map((i, index) => ({ i, index })).filter(({ i }) => foldVi(`${i.key} ${i.title}`).includes(f));
  if (partial.length === 1) return { ok: true, index: partial[0]!.index };
  if (partial.length > 1) {
    const names = partial.slice(0, 6).map(({ i }) => i.key).join(", ");
    return { ok: false, error: `“${raw}” khớp ${partial.length} mục (${names}). Hãy chọn bằng số hoặc khóa đầy đủ.` };
  }
  return { ok: false, error: `Không tìm thấy “${raw}”. Hãy dùng #liệt kê hoặc /kỹ-năng liệt kê.` };
}

/** Nội dung SKILL.md tối thiểu cho kỹ năng tạo bằng lệnh; thầy cô bổ sung các bước trong mục Kỹ năng. */
export function skillMarkdownFor(name: string, description: string): string {
  const desc = description.replace(/\s+/g, " ").trim().slice(0, 300);
  return ["---", `name: ${name}`, `description: ${JSON.stringify(desc)}`, "load: demand", "---", "", desc, ""].join("\n");
}
