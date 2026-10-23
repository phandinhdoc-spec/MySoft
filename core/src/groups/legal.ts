import { fold } from "../hints.js";
import type { DocStatus } from "./types.js";

/**
 * Xử lý chữ của văn bản pháp quy bằng quy tắc (không cần AI):
 * nhận số hiệu, cắt đoạn theo Điều/Khoản, đọc quan hệ thay thế/sửa đổi.
 */

/** Khóa so sánh số hiệu: bỏ dấu, hoa, bỏ khoảng trắng. "115/2020/NĐ-CP" ≡ "115/2020/ND-CP". */
export function noKey(no: string): string {
  return no
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
}

const TYPE = "(?:Nghị định|Nghị quyết|Thông tư liên tịch|Thông tư|Quyết định|Chỉ thị|Công văn|Luật|Pháp lệnh|Kết luận|Hướng dẫn|Thông báo|Kế hoạch|Văn bản hợp nhất|Điều lệ|Quy định|Quy chế)";
/** Có năm: 115/2020/NĐ-CP, 43/2019/QH14. */
const WITH_YEAR = String.raw`\d{1,4}\s*\/\s*(?:19|20)\d{2}\s*\/\s*[A-ZĐ][A-ZĐ0-9]{1,}(?:-[A-ZĐ0-9]{1,12}){0,3}`;
/** Không năm (công văn, quyết định cấp trường): 1234/BGDĐT-GDTrH, 05/QĐ-THCS. */
const NO_YEAR = String.raw`\d{1,5}\s*\/\s*[A-ZĐ]{2,}(?:-[A-Za-zĐđ0-9]{1,12}){1,3}`;
const NO_RE = new RegExp(`(?<![\\p{L}\\p{N}\\/])(${WITH_YEAR}|${NO_YEAR})(?![\\p{L}\\p{N}\\/])`, "gu");
const TYPED_RE = new RegExp(`(${TYPE})\\s+(?:số\\s+)?(${WITH_YEAR}|${NO_YEAR})`, "giu");

export interface Citation {
  /** Số hiệu như viết trong văn bản. */
  no: string;
  key: string;
  /** Loại văn bản đứng trước số hiệu, nếu có ("Nghị định"). */
  type?: string;
  index: number;
}

/** Trích mọi số hiệu văn bản trong một đoạn chữ. Mỗi số hiệu chỉ trả một lần. */
export function extractCitations(text: string): Citation[] {
  const out = new Map<string, Citation>();
  for (const m of text.matchAll(TYPED_RE)) {
    const no = m[2]!.replace(/\s+/g, "");
    const key = noKey(no);
    if (!out.has(key)) out.set(key, { no, key, type: m[1]!.replace(/^\w/u, (c) => c.toUpperCase()), index: m.index ?? 0 });
  }
  for (const m of text.matchAll(NO_RE)) {
    const no = m[1]!.replace(/\s+/g, "");
    const key = noKey(no);
    if (!out.has(key)) out.set(key, { no, key, index: m.index ?? 0 });
  }
  return [...out.values()].sort((a, b) => a.index - b.index);
}

export interface LegalChunk {
  /** "Điều 12", "Phần mở đầu" hoặc "Đoạn 3". */
  dieu: string;
  /** "khoản 3" hoặc rỗng. */
  khoan: string;
  heading: string;
  text: string;
}

const DIEU_RE = /^\s*Điều\s+(\d+[a-zđ]?)\s*[.:]\s*(.*)$/i;
const KHOAN_RE = /^\s*(\d{1,2})\s*[.)]\s+\S/;
export const CHUNK_MAX = 1800;
const PARA_TARGET = 900;

/**
 * Cắt theo Điều rồi theo Khoản nếu Điều dài (không cắt theo số ký tự). Văn bản không có "Điều"
 * (công văn, thông báo) thì cắt theo đoạn, mỗi đoạn khoảng 900 ký tự.
 */
export function chunkLegal(text: string): LegalChunk[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: Array<{ dieu: string; heading: string; lines: string[] }> = [];
  let cur: { dieu: string; heading: string; lines: string[] } = { dieu: "Phần mở đầu", heading: "", lines: [] };
  for (const line of lines) {
    const m = DIEU_RE.exec(line);
    if (m) {
      if (cur.lines.some((l) => l.trim())) sections.push(cur);
      cur = { dieu: `Điều ${m[1]!.toLowerCase()}`, heading: m[2]!.trim(), lines: [line] };
    } else cur.lines.push(line);
  }
  if (cur.lines.some((l) => l.trim())) sections.push(cur);

  if (!sections.some((s) => s.dieu.startsWith("Điều"))) return chunkParagraphs(text);

  const out: LegalChunk[] = [];
  for (const s of sections) {
    const body = s.lines.join("\n").trim();
    if (body.length <= CHUNK_MAX) {
      out.push({ dieu: s.dieu, khoan: "", heading: s.heading, text: body });
      continue;
    }
    // Điều dài: tách theo khoản, các dòng ngoài khoản (điểm a, b…) đi theo khoản đứng trước.
    let khoan = "";
    let buf: string[] = [];
    const flush = () => {
      const t = buf.join("\n").trim();
      if (t) out.push(...splitLong({ dieu: s.dieu, khoan, heading: s.heading, text: t }));
      buf = [];
    };
    for (const line of s.lines) {
      const k = KHOAN_RE.exec(line);
      if (k && buf.length) {
        flush();
        khoan = `khoản ${k[1]}`;
      } else if (k) khoan = `khoản ${k[1]}`;
      buf.push(line);
    }
    flush();
  }
  return out;
}

function splitLong(c: LegalChunk): LegalChunk[] {
  if (c.text.length <= CHUNK_MAX) return [c];
  const out: LegalChunk[] = [];
  let buf = "";
  for (const line of c.text.split("\n")) {
    if (buf && buf.length + line.length > CHUNK_MAX) {
      out.push({ ...c, text: buf.trim() });
      buf = "";
    }
    buf += (buf ? "\n" : "") + line.slice(0, CHUNK_MAX);
  }
  if (buf.trim()) out.push({ ...c, text: buf.trim() });
  return out;
}

function chunkParagraphs(text: string): LegalChunk[] {
  const out: LegalChunk[] = [];
  let buf = "";
  const push = () => {
    const t = buf.trim();
    if (t) out.push({ dieu: `Đoạn ${out.length + 1}`, khoan: "", heading: "", text: t });
    buf = "";
  };
  for (const para of text.replace(/\r/g, "").split(/\n{1,}/)) {
    if (buf && buf.length + para.length > PARA_TARGET) push();
    buf += (buf ? "\n" : "") + para.slice(0, CHUNK_MAX);
  }
  push();
  return out;
}

/** Hiểu câu hỏi kiểu "Điều 12 khoản 3 Nghị định 115/2020/NĐ-CP". */
export interface LegalQuery {
  no?: string;
  dieu?: string;
  khoan?: string;
  rest: string;
}

export function parseLegalQuery(q: string): LegalQuery {
  let rest = q;
  const res: LegalQuery = { rest: "" };
  const cites = extractCitations(q);
  if (cites[0]) {
    res.no = cites[0].no;
    rest = rest.replace(new RegExp(cites[0].no.split("").map((c) => c.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")).join("\\s*"), "i"), " ");
  }
  const d = /điều\s+(\d+[a-zđ]?)/i.exec(rest);
  if (d) {
    res.dieu = `Điều ${d[1]!.toLowerCase()}`;
    rest = rest.replace(d[0], " ");
  }
  const k = /khoản\s+(\d{1,2})/i.exec(rest);
  if (k) {
    res.khoan = `khoản ${k[1]}`;
    rest = rest.replace(k[0], " ");
  }
  res.rest = rest.replace(/\s+/g, " ").trim();
  return res;
}

/** Ngày dạng "15 tháng 6 năm 2020" hoặc "15/06/2020" -> "2020-06-15". */
export function parseVnDate(s: string): string | undefined {
  const a = /(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+((?:19|20)\d{2})/i.exec(s);
  const b = /(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})/.exec(s);
  const m = a ?? b;
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface DocFacts {
  no?: string;
  issuedAt?: string;
  effectiveAt?: string;
  replaces: string[];
  repeals: string[];
  amends: string[];
}

/**
 * Đọc dữ kiện rõ ràng ngay trong chữ của văn bản: số hiệu, ngày ban hành, ngày hiệu lực và các văn bản
 * bị thay thế / bãi bỏ / sửa đổi. Chỉ ghi điều văn bản nói thẳng, không suy đoán.
 */
export function readFacts(text: string): DocFacts {
  const head = text.slice(0, 4000);
  const facts: DocFacts = { replaces: [], repeals: [], amends: [] };
  const first = extractCitations(head.slice(0, 1200))[0];
  if (first) facts.no = first.no;
  const issued = /(?:ngày|Hà Nội,|Hồ Chí Minh,|TP\.?\s*[^,\n]{2,20},)\s*(?:ngày\s*)?(\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+(?:19|20)\d{2})/i.exec(head);
  if (issued) facts.issuedAt = parseVnDate(issued[1]!);
  const eff = /(?:có\s+hiệu\s+lực(?:\s+thi\s+hành)?\s+(?:kể\s+)?từ\s+ngày|có\s+hiệu\s+lực\s+từ\s+ngày)\s+([^.;\n]{4,40})/i.exec(text);
  if (eff) facts.effectiveAt = parseVnDate(eff[1]!);
  // Chỉ coi là thay thế/bãi bỏ TOÀN BỘ khi động từ đứng ngay trước loại văn bản + số hiệu.
  // "thay thế khoản 2 Điều 5 của Nghị định X" chỉ là sửa đổi một phần: X vẫn còn hiệu lực.
  const PARTIAL = /(điều|khoản|điểm|mục|chương|phụ lục|một số|quy định)/i;
  const scan = (verb: RegExp, whole: string[], part: string[]) => {
    const re = new RegExp(`(?:${verb.source})([^.;\\n]{0,160})`, "giu");
    for (const m of text.matchAll(re)) {
      const rest = m[1] ?? "";
      const c = extractCitations(rest)[0];
      if (!c) continue;
      const between = rest.slice(0, c.index);
      const into = PARTIAL.test(between) ? part : whole;
      if (!into.includes(c.no)) into.push(c.no);
    }
  };
  scan(/thay\s+thế/, facts.replaces, facts.amends);
  scan(/bãi\s+bỏ/, facts.repeals, facts.amends);
  scan(/sửa\s+đổi(?:,\s*bổ\s+sung)?|bổ\s+sung/, facts.amends, facts.amends);
  // Một văn bản không tự thay thế chính nó.
  if (facts.no) {
    const k = noKey(facts.no);
    for (const list of [facts.replaces, facts.repeals, facts.amends]) {
      for (let i = list.length - 1; i >= 0; i--) if (noKey(list[i]!) === k) list.splice(i, 1);
    }
  }
  return facts;
}

/** Trạng thái chỉ suy ra khi chữ văn bản nói rõ ngày hiệu lực còn ở tương lai. */
export function statusFromDates(effectiveAt: string | undefined, today: string, current: DocStatus): DocStatus {
  if (current !== "chua-xac-dinh") return current;
  if (effectiveAt && effectiveAt > today) return "sap-co-hieu-luc";
  return current;
}

export const foldText = fold;
