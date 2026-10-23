import { findUnsafe, SKILL_NAME_RE } from "../skills.js";
import { findUnsafeImported } from "../skillimport.js";
import { VIET_SKILL_MD, VIET_SKILL_NAME } from "./guide.js";

/**
 * Chuẩn hóa skill theo skill nhân `pvta-viet-skill` (nguồn: SKILL.md ở gốc dự án, nhúng qua guide.ts).
 * Phần này chỉ làm những việc máy kiểm và sửa được chắc chắn: tên, mô tả, dòng load, 7 mục đúng thứ tự,
 * định dạng dòng Quy định / Quy trình / Danh sách kiểm tra, độ dài, bộ lọc an toàn.
 * Việc cần hiểu nội dung (rút gọn, viết thêm quy định có nguồn) để AI làm ở ai.ts, rồi kết quả vẫn qua lại chính hàm này.
 */

/** Giới hạn lấy từ skill nhân; có bài kiểm tra bảo đảm guide vẫn nêu đúng các số này. */
export const GUIDE_LIMITS = { description: 220, name: 40, body: 20000 } as const;
/** Bảy mục của khuôn, đúng thứ tự. */
export const SKILL_TEMPLATE = ["Khi nào dùng", "Khi nào không dùng", "Quy định", "Quy trình", "Danh sách kiểm tra", "Tài liệu tham chiếu", "Kiểm tra bàn giao"] as const;
type Canon = (typeof SKILL_TEMPLATE)[number];

export interface Issue {
  level: "error" | "warn" | "info";
  code: string;
  message: string;
}

export interface NormalizeSkillOptions {
  /** full: đủ 7 mục (skill người dùng viết, skill tự học). light: chỉ đầu tệp, độ dài, an toàn (skill do biên tập nền dựng sẵn cấu trúc riêng). */
  profile?: "full" | "light";
  /** user: tên không được mượn tiền tố pvta-/learned-/cd-. system: tên do PVTA đặt, giữ nguyên. */
  owner?: "user" | "system";
  /** Tên dự phòng khi tệp chưa có name. */
  nameHint?: string;
  /** Nguồn gắn cho dòng Quy định chưa có nguồn. Chỉ dùng khi chính người viết là nguồn ("Thầy cô viết"). */
  defaultSource?: string;
  /** Thêm mục còn thiếu với dòng "(Chưa có…)". Tắt khi bước kiểm tra sau đó cần thấy mục còn thiếu. */
  addMissing?: boolean;
}

export interface SkillNormalization {
  md: string;
  name: string;
  changed: boolean;
  /** Việc đã tự sửa. */
  fixes: string[];
  issues: Issue[];
  /** true khi không còn lỗi chặn (cảnh báo vẫn có thể còn). */
  ok: boolean;
}

// ---------------------------------------------------------------------------------------------
// Đọc skill nhân

/** Phần thân của skill nhân (bỏ phần đầu tệp). */
export function guideBody(): string {
  return VIET_SKILL_MD.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function sectionOf(md: string, title: string): string {
  const m = new RegExp(`^##\\s+${title}\\s*$`, "m").exec(md);
  if (!m) return "";
  const rest = md.slice(m.index + m[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** Các dòng Quy định của skill nhân, bỏ phần "(Nguồn: …)" để đưa vào lời nhắc cho gọn. */
export function guideRules(): string[] {
  return sectionOf(VIET_SKILL_MD, "Quy định")
    .split("\n")
    .filter((l) => /^\s*[-*]\s+\S/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, "").replace(/\s*\(Nguồn:[^)]*\)\s*$/, "").trim());
}

/** Đoạn rút gọn của skill nhân để nối vào lời nhắc hệ thống của bước tự học và biên tập nền. */
export function guideDigest(): string {
  return `QUY ĐỊNH VIẾT SKILL CỦA PVTA (từ skill nhân ${VIET_SKILL_NAME}; là quy định chất lượng, không phải nội dung để chép):\n${guideRules().map((r) => `- ${r}`).join("\n")}\n- Khuôn thân skill gồm 7 mục theo thứ tự: ${SKILL_TEMPLATE.join("; ")}.`;
}

// ---------------------------------------------------------------------------------------------
// Tiện ích

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/** Tên chữ thường không dấu, số, gạch nối; tối đa 40 ký tự; không chứa claude/anthropic. */
export function skillSlug(raw: string): string {
  let s = fold(raw)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/claude|anthropic/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > GUIDE_LIMITS.name) s = s.slice(0, GUIDE_LIMITS.name).replace(/-[^-]*$/, (m, off: number) => (off >= 20 ? "" : m)).replace(/-+$/g, "");
  return s || "skill-moi";
}

const RESERVED = /^(pvta|learned|cd)(-|$)/;
const VAGUE_NAME = /^(helper|helpers|tools?|utils?|misc|data|files?|documents?|skill|ext-skill|skill-moi)$/;

/** Cắt mô tả về tối đa 220 ký tự ở ranh giới câu hoặc từ, không thêm dấu ba chấm. */
export function fitDescription(raw: string, max: number = GUIDE_LIMITS.description): string {
  const one = raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (sentence >= Math.floor(max * 0.6)) return cut.slice(0, sentence + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/g, "").trim();
}

const GENERIC = new Set(["tai", "lieu", "giup", "cho", "viec", "cong", "van", "noi", "dung", "thong", "tin", "mot", "cac", "nhung", "khi", "dung", "lam", "gui", "voi", "cua", "ban", "nay", "trong", "duoc", "can", "skill", "ky", "nang"]);
const distinctive = (desc: string) => [...new Set(fold(desc).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w)))];

interface Parsed {
  meta: Array<[string, string]>;
  body: string;
  hadFrontMatter: boolean;
}

function parseHead(md: string): Parsed {
  const text = md.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: [], body: text, hadFrontMatter: false };
  const meta: Array<[string, string]> = [];
  const lines = m[1]!.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    let v = kv[2]!.trim();
    if (/^[>|][+-]?$/.test(v)) {
      const parts: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim());
      v = parts.filter(Boolean).join(" ");
    }
    if (v.startsWith('"') && v.endsWith('"')) {
      try { const decoded: unknown = JSON.parse(v); if (typeof decoded === "string") v = decoded; }
      catch { v = v.slice(1, -1); }
    } else v = v.replace(/^'([\s\S]*)'$/, "$1");
    meta.push([kv[1]!.toLowerCase(), v.trim()]);
  }
  return { meta, body: m[2]!, hadFrontMatter: true };
}
const metaGet = (p: Parsed, k: string) => p.meta.find(([key]) => key === k)?.[1];

interface Sect {
  title: string;
  lines: string[];
}
/** Tách thân thành phần mở đầu và các mục `## `; bỏ qua dòng `##` nằm trong khối mã. */
function splitBody(body: string): { pre: string[]; sections: Sect[] } {
  const pre: string[] = [];
  const sections: Sect[] = [];
  let fence = false;
  let cur: Sect | undefined;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const h = !fence ? /^##\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (h && !/^###/.test(line)) {
      cur = { title: h[1]!.trim(), lines: [] };
      sections.push(cur);
    } else (cur ? cur.lines : pre).push(line);
  }
  return { pre, sections };
}

const SYNONYMS: Array<[RegExp, Canon]> = [
  [/^khi nao khong dung|^khong dung khi|^khong ap dung/, "Khi nào không dùng"],
  [/^khi nao dung|^dung khi|^pham vi|^khi dung|^tinh huong dung/, "Khi nào dùng"],
  [/^quy dinh|^quy tac|^nguyen tac|^luat|^yeu cau chat luong/, "Quy định"],
  [/^quy trinh|^cac buoc|^buoc thuc hien|^cach lam|^thu tu|^cac buoc thuc hien/, "Quy trình"],
  [/^danh sach kiem tra|^checklist|^tieu chi|^kiem tra chat luong/, "Danh sách kiểm tra"],
  [/^tai lieu tham chieu|^tham chieu|^nguon$|^tai lieu$|^nguon tham khao/, "Tài liệu tham chiếu"],
  [/^kiem tra ban giao|^ban giao/, "Kiểm tra bàn giao"],
];
const canonOf = (title: string): Canon | undefined => {
  const f = fold(title).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, c] of SYNONYMS) if (re.test(f)) return c;
  return undefined;
};

const BULLET = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*\S.*)$/;
const trimLines = (lines: string[]) => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a]!.trim()) a++;
  while (b > a && !lines[b - 1]!.trim()) b--;
  return lines.slice(a, b).map((l) => l.replace(/[ \t]+$/g, ""));
};

/** Chuẩn hóa nhãn nguồn ở cuối dòng về "(Nguồn: nhãn)". */
function tidySource(line: string): string {
  return line.replace(/\s*[(\[（]\s*(?:nguồn|nguon|source)\s*[:：]\s*([^)\]）]+?)\s*[)\]）]\s*$/i, " (Nguồn: $1)");
}

const TIME_BOUND = /(trước|sau|từ)\s+(tháng|ngày|năm)\s*\d|hiện nay|hiện hành|mới nhất|năm nay|gần đây/i;

// ---------------------------------------------------------------------------------------------

export function normalizeSkill(input: string, opts: NormalizeSkillOptions = {}): SkillNormalization {
  const profile = opts.profile ?? "full";
  const owner = opts.owner ?? "user";
  const fixes: string[] = [];
  const issues: Issue[] = [];
  const parsed = parseHead(input);
  if (!parsed.hadFrontMatter) fixes.push("Thêm phần đầu tệp (name, description, load).");

  // --- Tên
  const titleFromBody = /^#\s+(.+)$/m.exec(parsed.body)?.[1]?.trim();
  const rawName = metaGet(parsed, "name") || opts.nameHint || titleFromBody || "";
  let name = rawName;
  const nameOk = (n: string) => SKILL_NAME_RE.test(n) && n.length <= GUIDE_LIMITS.name && !/claude|anthropic/.test(n) && (owner === "system" || !RESERVED.test(n));
  if (!nameOk(name)) {
    let slug = skillSlug(name);
    if (owner === "user" && RESERVED.test(slug)) slug = `ext-${slug}`.slice(0, GUIDE_LIMITS.name).replace(/-+$/g, "");
    name = slug;
    if (rawName) fixes.push(`Đổi tên «${rawName.slice(0, 50)}» thành «${name}» (chữ thường không dấu, gạch nối, tối đa ${GUIDE_LIMITS.name} ký tự${owner === "user" ? ", không mượn tiền tố của PVTA" : ""}).`);
    else issues.push({ level: "warn", code: "name-missing", message: `Chưa có tên; tạm đặt «${name}». Hãy đặt tên mô tả đúng việc skill làm.` });
  }
  if (VAGUE_NAME.test(name)) issues.push({ level: "warn", code: "name-vague", message: `Tên «${name}» mơ hồ; đặt theo việc cụ thể, ví dụ soan-de-khtn.` });

  // --- Phần thân (cần trước để dựng mô tả dự phòng)
  let bodyLines = parsed.body.split("\n");
  let body = "";
  if (profile === "full") {
    const { pre, sections } = splitBody(parsed.body);
    const byCanon = new Map<Canon, string[]>();
    const extras: Sect[] = [];
    let renamed = 0;
    for (const s of sections) {
      const c = canonOf(s.title);
      if (c && !byCanon.has(c)) {
        if (c !== s.title) renamed++;
        byCanon.set(c, trimLines(s.lines));
      } else if (c && byCanon.has(c)) {
        byCanon.set(c, [...byCanon.get(c)!, "", ...trimLines(s.lines)]);
        fixes.push(`Gộp hai mục «${c}» thành một.`);
      } else extras.push({ title: s.title, lines: trimLines(s.lines) });
    }
    if (renamed) fixes.push(`Đổi tên ${renamed} mục về đúng tên của khuôn (ví dụ «Các bước» → «Quy trình»).`);
    for (const e of extras) issues.push({ level: "info", code: "extra-section", message: `Mục «${e.title}» không thuộc khuôn 7 mục; để ở cuối. Nên gộp vào mục phù hợp.` });

    // Định dạng từng mục.
    const quy = byCanon.get("Quy định");
    if (quy) {
      let sourced = 0;
      let unsourced = 0;
      byCanon.set(
        "Quy định",
        quy.map((l) => {
          const m = BULLET.exec(l);
          if (!m || m[1]!.length > 0) return l;
          let text = tidySource(m[2]!.trim());
          if (!/\(Nguồn:\s*[^)]+\)\s*$/.test(text)) {
            if (opts.defaultSource) {
              text = `${text.replace(/[.;]\s*$/, "")} (Nguồn: ${opts.defaultSource})`;
              sourced++;
            } else unsourced++;
          }
          return `- ${text}`;
        }),
      );
      if (sourced) fixes.push(`Gắn nguồn «${opts.defaultSource}» cho ${sourced} dòng Quy định chưa có nguồn (người viết là nguồn); kiểm lại nếu có dòng lấy từ văn bản khác.`);
      if (unsourced) issues.push({ level: "warn", code: "rule-no-source", message: `${unsourced} dòng Quy định chưa có «(Nguồn: …)». Không có nguồn thì không nên viết quy định đó.` });
    }
    const steps = byCanon.get("Quy trình");
    if (steps) {
      const top = steps.filter((l) => BULLET.test(l) && BULLET.exec(l)![1]!.length === 0);
      const numbered = top.some((l) => /^\s*\d+[.)]\s/.test(l));
      if (top.length && !numbered) {
        let n = 0;
        byCanon.set(
          "Quy trình",
          steps.map((l) => {
            const m = BULLET.exec(l);
            return m && m[1]!.length === 0 ? `${++n}. ${m[2]!.trim()}` : l;
          }),
        );
        fixes.push("Đánh số lại các bước ở mục Quy trình.");
      }
    }
    const check = byCanon.get("Danh sách kiểm tra");
    if (check) {
      let fixed = 0;
      byCanon.set(
        "Danh sách kiểm tra",
        check.map((l) => {
          const m = BULLET.exec(l);
          if (!m || m[1]!.length > 0) return l;
          const box = /^\[[ xX]?\]\s*(.*)$/.exec(m[2]!);
          const next = `- [ ] ${(box ? box[1]! : m[2]!).trim()}`;
          if (next !== l) fixed++;
          return next;
        }),
      );
      if (fixed) fixes.push(`Đưa ${fixed} dòng Danh sách kiểm tra về dạng «- [ ] …».`);
    }

    // Mục còn thiếu.
    const missing = SKILL_TEMPLATE.filter((t) => !byCanon.has(t));
    if (missing.length) {
      if (opts.addMissing === false) issues.push({ level: "warn", code: "missing-section", message: `Thiếu mục: ${missing.join("; ")}.` });
      else {
        for (const t of missing) byCanon.set(t, [t === "Danh sách kiểm tra" ? "(Chưa có. Thêm các dòng «- [ ] …» kiểm được bằng mắt hoặc bằng máy.)" : t === "Quy định" ? "(Chưa có. Mỗi quy định phải kết thúc bằng «(Nguồn: …)»; không có nguồn thì không viết.)" : `(Chưa có. Bổ sung mục ${t}.)`]);
        fixes.push(`Thêm ${missing.length} mục còn thiếu để đủ khuôn: ${missing.join("; ")}.`);
        issues.push({ level: "warn", code: "missing-section", message: `Các mục ${missing.join("; ")} mới có dòng giữ chỗ «(Chưa có…)»; cần viết nội dung thật.` });
      }
    }
    // Thứ tự đúng khuôn?
    const wasOrder = sections.map((s) => canonOf(s.title)).filter((c): c is Canon => !!c);
    const sorted = [...wasOrder].sort((a, b) => SKILL_TEMPLATE.indexOf(a) - SKILL_TEMPLATE.indexOf(b));
    if (wasOrder.some((c, i) => c !== sorted[i])) fixes.push("Xếp lại các mục theo đúng thứ tự của khuôn.");

    const title = titleFromBody ?? (name ? name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Skill");
    const preLines = trimLines(pre.filter((l) => !/^#\s+/.test(l) || l.replace(/^#\s+/, "").trim() !== titleFromBody));
    const out: string[] = [`# ${title}`];
    if (!titleFromBody) fixes.push("Thêm tiêu đề cấp một cho skill.");
    if (preLines.length) out.push("", ...preLines);
    for (const t of SKILL_TEMPLATE) {
      const lines = byCanon.get(t);
      if (lines) out.push("", `## ${t}`, ...lines);
    }
    for (const e of extras) out.push("", `## ${e.title}`, ...e.lines);
    body = out.join("\n");
  } else {
    bodyLines = trimLines(bodyLines);
    body = bodyLines.join("\n");
  }
  body = body.replace(/\n{3,}/g, "\n\n").trim();

  // --- Mô tả
  let desc = metaGet(parsed, "description") ?? "";
  const original = desc;
  if (!desc.trim()) {
    const fromBody = (sectionOf(`\n${body}`, "Khi nào dùng").split("\n").find((l) => BULLET.test(l)) ?? body.split("\n").find((l) => l.trim() && !/^#/.test(l)) ?? "").replace(BULLET, "$2");
    desc = fromBody;
    issues.push({ level: "warn", code: "description-missing", message: "Chưa có mô tả; PVTA lấy tạm từ nội dung. Viết lại một dòng nêu làm gì và khi nào dùng, kèm từ đặc trưng thầy cô hay gõ." });
  }
  desc = fitDescription(desc);
  if (original.trim() && desc !== original.trim()) {
    if (/\n/.test(original) || /\s{2,}/.test(original.trim())) fixes.push("Gộp mô tả về một dòng.");
    if (original.replace(/\s+/g, " ").trim().length > GUIDE_LIMITS.description) fixes.push(`Rút mô tả từ ${original.replace(/\s+/g, " ").trim().length} xuống ${desc.length} ký tự (giới hạn ${GUIDE_LIMITS.description}, vì giao diện dán skill cắt phần sau).`);
  }
  if (desc) {
    if (desc.length < 40) issues.push({ level: "warn", code: "description-short", message: "Mô tả quá ngắn; nêu làm gì và khi nào dùng." });
    if (/^(tôi|bạn|mình|hãy|em)\b/i.test(desc)) issues.push({ level: "warn", code: "description-person", message: "Mô tả nên viết ngôi thứ ba (ví dụ «Soạn đề…», «Dùng khi…»), không dùng «tôi/bạn/hãy»." });
    if (!/dùng khi|khi |lúc |nếu /i.test(desc)) issues.push({ level: "info", code: "description-when", message: "Mô tả chưa nêu khi nào dùng; thêm «Dùng khi…» để PVTA chọn đúng lúc." });
    if (distinctive(desc).length < 3) issues.push({ level: "warn", code: "description-generic", message: "Mô tả toàn từ chung (tài liệu, giúp, cho…). PVTA chọn skill bằng cách so từ với câu thầy cô gõ; thêm từ đặc trưng như «ma trận», «đặc tả», «nhận xét học bạ»." });
  }

  // --- load
  const loadRaw = metaGet(parsed, "load");
  const load = loadRaw && ["demand", "manual", "always", "off"].includes(loadRaw) ? loadRaw : "demand";
  if (!loadRaw) fixes.push("Thêm dòng «load: demand».");
  else if (load !== loadRaw) fixes.push(`Đổi «load: ${loadRaw}» thành «load: demand» (chỉ nhận demand, manual, always, off).`);
  if (load === "always" && body.length > 1500) issues.push({ level: "warn", code: "load-always", message: "«load: always» nạp skill vào mọi lượt; chỉ nên cho quy tắc rất ngắn. Skill dài nên dùng «load: demand»." });

  // --- Kiểm tra thân
  if (body.length > GUIDE_LIMITS.body) issues.push({ level: "error", code: "too-long", message: `Thân skill dài ${body.length} ký tự, vượt ${GUIDE_LIMITS.body}: PVTA Chat và nút Thử chỉ dùng ${GUIDE_LIMITS.body} ký tự đầu. Rút gọn hoặc tách thành hai skill.` });
  else if (body.length > GUIDE_LIMITS.body - 600) issues.push({ level: "info", code: "near-limit", message: `Thân dài ${body.length}/${GUIDE_LIMITS.body} ký tự; sắp chạm giới hạn.` });
  if (!body.replace(/^#.*$/gm, "").trim()) issues.push({ level: "error", code: "body-empty", message: "Skill chưa có nội dung hướng dẫn." });
  const unsafeStrict = findUnsafe(`${desc}\n${body}`);
  const unsafeImported = findUnsafeImported(`${desc}\n${body}`);
  if (owner === "system" && unsafeStrict) issues.push({ level: "error", code: "unsafe", message: `Nội dung không an toàn: ${unsafeStrict}.` });
  else if (unsafeImported) issues.push({ level: "error", code: "unsafe", message: `Nội dung không an toàn: ${unsafeImported}.` });
  else if (unsafeStrict) issues.push({ level: "warn", code: "unsafe-strict", message: `Có ${unsafeStrict}. PVTA không chạy lệnh trong skill và bộ lọc skill tự học sẽ từ chối; bỏ đi nếu không thật cần.` });
  if (/```\s*(?:python|bash|sh|shell|powershell|js|javascript)\b/i.test(body)) issues.push({ level: "warn", code: "code-block", message: "Skill có khối mã; PVTA không chạy mã trong skill. Mô tả bằng lời thay vì dán mã." });
  if (TIME_BOUND.test(`${desc}\n${body}`)) issues.push({ level: "info", code: "time-bound", message: "Có cách nói theo mốc thời gian dễ lỗi thời («hiện hành», «từ tháng…»). Quy định hay đổi thì ghi tên văn bản." });

  // --- Dựng lại tệp
  const head: Array<[string, string]> = [
    ["name", name],
    ["description", /^[\s"'\[{>|*&!%@`#-]/.test(desc) ? JSON.stringify(desc) : desc],
    ["load", load],
  ];
  for (const [k, v] of parsed.meta) if (!["name", "description", "load"].includes(k)) head.push([k, v]);
  const md = `---\n${head.map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${body}\n`;
  const ok = !issues.some((i) => i.level === "error");
  return { md, name, changed: md.trim() !== input.replace(/\r\n?/g, "\n").trim(), fixes, issues, ok };
}
