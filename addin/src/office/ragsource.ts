import type { OfficeHost, RagSegment } from "@pvta/shared";
import { powerpointTool } from "./powerpoint";

/**
 * Đọc tệp đang mở thành các đoạn có cấu trúc (đề mục, slide, khối hàng của bảng) để bridge dựng chỉ mục RAG.
 * Phần chuyển đổi (…Segments) là hàm thuần, kiểm thử được mà không cần Office; phần đọc (read…) gọi Office.js.
 */

/** Tổng ký tự gửi cho bridge mỗi lần (đủ cho giáo án/sách dài; quá thì bỏ phần cuối). */
export const RAG_SEND_MAX = 2_500_000;
const PATH_DEPTH = 4;

export interface WordPara {
  text: string;
  /** Cấp đề mục (0 = Title, 1–9 = Heading), undefined = đoạn thường. */
  level?: number;
  inTable?: boolean;
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** "Heading2" → 2, "Title" → 0, còn lại undefined. */
export function headingLevel(styleBuiltIn: string | undefined): number | undefined {
  if (!styleBuiltIn) return undefined;
  if (/^title$/i.test(styleBuiltIn)) return 0;
  const m = /^heading\s*([1-9])$/i.exec(styleBuiltIn);
  return m ? Number(m[1]) : undefined;
}

export function wordSegments(paras: WordPara[]): RagSegment[] {
  const out: RagSegment[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  const path = () => stack.slice(-PATH_DEPTH).map((h) => h.text).join(" > ") || undefined;
  let cells: string[] = [];
  let cellsAt = 0;
  const flushTable = () => {
    if (cells.length) out.push({ ref: `Đoạn ${cellsAt}`, text: cells.join(" | "), section: path() });
    cells = [];
  };
  paras.forEach((p, i) => {
    const n = i + 1;
    const text = clean(p.text);
    if (p.inTable) {
      if (!text) return;
      if (!cells.length) cellsAt = n;
      cells.push(text);
      return;
    }
    flushTable();
    if (!text) return;
    if (p.level !== undefined) {
      while (stack.length && stack[stack.length - 1]!.level >= p.level) stack.pop();
      stack.push({ level: p.level, text: text.slice(0, 80) });
    }
    out.push({ ref: `Đoạn ${n}`, text, section: path() });
  });
  flushTable();
  return out;
}

export function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export interface SheetData {
  name: string;
  /** Chỉ số hàng (0) và cột (0) của ô đầu vùng dùng, để nhãn khớp địa chỉ thật trong Excel. */
  row0: number;
  col0: number;
  values: string[][];
}

const BLOCK_ROWS = 25;
const BLOCK_CHARS = 1400;

/** Mỗi hàng thành "Tiêu đề: giá trị; …" để câu hỏi theo tên cột tìm được; gom nhiều hàng thành một khối. */
export function sheetSegments(sheets: SheetData[]): RagSegment[] {
  const out: RagSegment[] = [];
  for (const sh of sheets) {
    const rows = sh.values;
    const ncols = rows.reduce((a, r) => Math.max(a, r.length), 0);
    if (!rows.length || !ncols) continue;
    const lastCol = colLetter(sh.col0 + ncols - 1);
    const filled = (r: string[]) => r.filter((c) => clean(c)).length;
    // Hàng tiêu đề: hàng đầu tiên có từ 2 ô trở lên (bảng một cột thì không có tiêu đề).
    const h = ncols >= 2 ? rows.findIndex((r) => filled(r) >= 2) : -1;
    const header = h >= 0 ? rows[h]!.map((c) => clean(c)) : [];
    const line = (r: string[]) =>
      r
        .map((c, j) => ({ k: header[j] || colLetter(sh.col0 + j), v: clean(c) }))
        .filter((x) => x.v)
        .map((x) => `${x.k}: ${x.v}`)
        .join("; ");
    const sheetRef = /^[\p{L}\p{N}_]+$/u.test(sh.name) ? sh.name : `'${sh.name.replace(/'/g, "''")}'`;
    let block: string[] = [];
    let first = 0;
    let chars = 0;
    const flush = (lastRow: number) => {
      if (block.length) {
        const ref = `${sheetRef}!${colLetter(sh.col0)}${first + 1 + sh.row0}:${lastCol}${lastRow + 1 + sh.row0}`;
        out.push({ ref, text: block.join("\n"), section: sh.name, atomic: true });
      }
      block = [];
      chars = 0;
    };
    rows.forEach((r, i) => {
      const t = i === h ? header.filter(Boolean).join(" | ") : line(r);
      if (!t) return;
      if (block.length && (block.length >= BLOCK_ROWS || chars + t.length > BLOCK_CHARS)) flush(i - 1);
      if (!block.length) first = i;
      block.push(`Hàng ${i + 1 + sh.row0}: ${t}`);
      chars += t.length + 10;
    });
    flush(rows.length - 1);
  }
  return out;
}

export interface SlideData {
  index: number;
  shapes: Array<{ name: string; text?: string }>;
}

export function slideSegments(slides: SlideData[]): RagSegment[] {
  const out: RagSegment[] = [];
  for (const s of slides) {
    const texts = s.shapes.map((sh) => ({ name: sh.name, text: clean(sh.text ?? "") })).filter((x) => x.text);
    if (!texts.length) continue;
    const title = (texts.find((x) => /title|tiêu đề/i.test(x.name)) ?? texts[0])!.text.slice(0, 80);
    const body = texts.map((x) => x.text).join("\n");
    out.push({ ref: `Slide ${s.index + 1}`, text: body, section: `Slide ${s.index + 1}: ${title}`, atomic: true });
  }
  return out;
}

/** Dấu vân tay nội dung (FNV-1a 32 bit): đổi nội dung thì đổi; không cần mật mã. */
export function fingerprint(segs: RagSegment[]): string {
  let h = 0x811c9dc5;
  let total = 0;
  for (const s of segs) {
    const t = s.ref + "\u0001" + s.text;
    total += t.length;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return `${(h >>> 0).toString(16)}-${segs.length}-${total}`;
}

/** Bỏ phần vượt quá giới hạn gửi. */
export function capSegments(segs: RagSegment[], max: number = RAG_SEND_MAX): RagSegment[] {
  let total = 0;
  const out: RagSegment[] = [];
  for (const s of segs) {
    total += s.text.length;
    if (total > max) break;
    out.push(s);
  }
  return out;
}

// ---- Đọc từ Office ----

async function readWord(): Promise<RagSegment[]> {
  return Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs;
    ps.load("items/text,items/styleBuiltIn,items/tableNestingLevel");
    await ctx.sync();
    return wordSegments(ps.items.map((p) => ({ text: p.text, level: headingLevel(String(p.styleBuiltIn)), inTable: (p.tableNestingLevel ?? 0) > 0 })));
  });
}

const MAX_SHEET_ROWS = 20_000;
const MAX_SHEET_COLS = 60;
const READ_ROWS = 1500;

async function readExcel(): Promise<RagSegment[]> {
  return Excel.run(async (ctx) => {
    const sheets = ctx.workbook.worksheets;
    sheets.load("items/name");
    await ctx.sync();
    const data: SheetData[] = [];
    for (const ws of sheets.items) {
      const used = ws.getUsedRangeOrNullObject(true);
      used.load("rowCount,columnCount,rowIndex,columnIndex");
      await ctx.sync();
      if (used.isNullObject) continue;
      const rows = Math.min(used.rowCount, MAX_SHEET_ROWS);
      const cols = Math.min(used.columnCount, MAX_SHEET_COLS);
      const values: string[][] = [];
      for (let r = 0; r < rows; r += READ_ROWS) {
        const part = used.getCell(r, 0).getResizedRange(Math.min(READ_ROWS, rows - r) - 1, cols - 1);
        part.load("text");
        await ctx.sync();
        for (const row of part.text) values.push(row.map((c) => String(c ?? "")));
      }
      data.push({ name: ws.name, row0: used.rowIndex, col0: used.columnIndex, values });
    }
    return sheetSegments(data);
  });
}

async function readPpt(): Promise<RagSegment[]> {
  const slides = (await powerpointTool("office_ppt_get_slides", {})) as SlideData[];
  return slideSegments(slides);
}

export interface RagSource {
  segments: RagSegment[];
  fp: string;
}

/** Đọc cả tệp đang mở thành các đoạn (đã cắt theo giới hạn gửi) kèm dấu vân tay. */
export async function readRagSource(host: OfficeHost): Promise<RagSource> {
  const all = host === "word" ? await readWord() : host === "excel" ? await readExcel() : await readPpt();
  const segments = capSegments(all);
  return { segments, fp: fingerprint(segments) };
}
