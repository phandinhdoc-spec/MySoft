import { fold, tokens } from "../hints.js";
import type { Skill } from "../skills.js";
import type { GroupManifest } from "./types.js";

/** Chọn skill theo nhóm đang bật (đặc tả 1.4). Mô hình không phải đọc cả danh sách mô tả. */

/**
 * Lọc theo nhóm: skill có `groups:` mà không nhóm nào đang bật → coi như load: off.
 * Skill không khai báo nhóm (skill riêng của người dùng, khung chung) giữ nguyên.
 * enabled === undefined: chưa chọn nhóm lần nào, giữ cách nạp cũ.
 */
export function gateSkills(skills: Skill[], enabled: string[] | undefined): Skill[] {
  if (!enabled) return skills;
  const on = new Set(enabled);
  return skills.map((s) => (s.groups.length === 0 || s.groups.some((g) => on.has(g)) ? s : { ...s, load: "off" as const }));
}

export interface PickOptions {
  max?: number;
  /** Nhóm đang bật kèm từ khóa: từ khóa trùng yêu cầu thì nâng điểm cho skill của nhóm. */
  groups?: GroupManifest[];
}

/**
 * Bộ chọn luật cục bộ: skill gọi bằng /tên luôn được nạp; skill "always" được nạp; còn lại chọn tối đa
 * `max` (mặc định 3) theo từ khóa trong yêu cầu, mô tả skill và từ khóa của nhóm.
 */
export function pickSkills(text: string, skills: Skill[], o: PickOptions = {}): Skill[] {
  const max = o.max ?? 3;
  const eligible = skills.filter((s) => s.load !== "off");
  const lower = text.toLocaleLowerCase("vi");
  const want = tokens(text);
  const folded = fold(text);
  const kw = new Map<string, string[]>();
  for (const g of o.groups ?? []) kw.set(g.id, g.keywords.map((k) => fold(k)).filter(Boolean));
  const score = (s: Skill): number => {
    if (lower.includes("/" + s.name)) return 1000;
    const have = tokens(`${s.name.replace(/-/g, " ")} ${s.description}`);
    let n = 0;
    for (const t of want) if (have.has(t)) n += t.includes(" ") ? 2 : 1;
    for (const g of s.groups) for (const k of kw.get(g) ?? []) if (k && folded.includes(k)) n += 2;
    return n;
  };
  const always = eligible.filter((s) => s.load === "always");
  const rest = eligible
    .filter((s) => s.load !== "always" && (s.load !== "manual" || lower.includes("/" + s.name)))
    .map((s) => ({ s, n: score(s) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.s.name.localeCompare(b.s.name))
    .slice(0, max)
    .map((x) => x.s);
  return [...always, ...rest];
}
