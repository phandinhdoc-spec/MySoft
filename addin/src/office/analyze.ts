import type { OfficeHost } from "@pvta/shared";
import { excelTool } from "./excel";
import { powerpointTool } from "./powerpoint";

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);

export interface WordFacts {
  paragraphs: Array<{ style: string; list: boolean; inTable: boolean; chars: number; font: string; size: number; text?: string }>;
  tables: number;
  pictures: number;
  activeTheme?: string;
}

/** Cấu trúc văn bản Word dưới dạng chữ gọn, để model chọn hướng làm đẹp (không gửi cả nội dung). */
export function profileWord(f: WordFacts): string {
  const ps = f.paragraphs;
  const body = ps.filter((p) => p.chars > 0);
  const heads = ps.filter((p) => /^(heading|đầu đề|tiêu đề|title)/i.test(p.style) && p.chars > 0);
  const byStyle = new Map<string, number>();
  for (const h of heads) byStyle.set(h.style, (byStyle.get(h.style) ?? 0) + 1);
  const fonts = new Map<string, number>();
  for (const p of body) {
    const k = `${p.font || "?"} ${p.size || ""}`.trim();
    fonts.set(k, (fonts.get(k) ?? 0) + p.chars);
  }
  const totalChars = body.reduce((a, p) => a + p.chars, 0);
  const topFonts = [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${pct(n, totalChars)}%)`);
  const lines = [
    `Loại tệp: Word. ${ps.length} đoạn (${body.length} đoạn có chữ), khoảng ${Math.round(totalChars / 5).toLocaleString("en-US")} từ.`,
    `Đề mục: ${heads.length ? [...byStyle.entries()].map(([s, n]) => `${s} ×${n}`).join(", ") : "chưa dùng kiểu đề mục (tiêu đề có thể chỉ là chữ thường)"}.`,
    `Danh sách: ${ps.filter((p) => p.list).length} mục. Bảng: ${f.tables}. Ảnh: ${f.pictures}.`,
    `Phông đang dùng nhiều nhất: ${topFonts.join("; ") || "(chưa rõ)"}.`,
  ];
  if (f.activeTheme) lines.push(`Chủ đề hiện tại: ${f.activeTheme}.`);
  const outline = heads.slice(0, 12).map((h) => `- ${clip(h.text, 70)}`);
  if (outline.length) lines.push("Dàn ý (đề mục đầu tiên):", ...outline);
  const first = body.find((p) => p.text);
  if (first && !outline.length) lines.push(`Mở đầu: “${clip(first.text, 160)}”`);
  return lines.join("\n");
}

export interface ExcelFacts {
  sheets: string[];
  address: string | null;
  rows: number;
  cols: number;
  sample: unknown[][];
  tables: number;
}

export function profileExcel(f: ExcelFacts): string {
  const lines = [`Loại tệp: Excel. ${f.sheets.length} sheet: ${f.sheets.slice(0, 8).join(", ")}.`];
  if (!f.address) return [...lines, "Sheet đang mở trống."].join("\n");
  const head = (f.sample[0] ?? []) as unknown[];
  const nonEmpty = head.filter((c) => String(c ?? "").trim() !== "");
  const headerLike = nonEmpty.length > 0 && nonEmpty.every((c) => typeof c === "string");
  const numericCols = new Set<number>();
  for (const row of f.sample.slice(1)) row.forEach((c, i) => typeof c === "number" && numericCols.add(i));
  lines.push(
    `Sheet đang mở: vùng dữ liệu ${f.address}, ${f.rows} hàng × ${f.cols} cột. Bảng Excel (Table): ${f.tables}.`,
    `Hàng đầu ${headerLike ? "giống hàng tiêu đề" : "chưa rõ là tiêu đề"}: ${nonEmpty.slice(0, 10).map((c) => clip(c, 20)).join(" | ") || "(trống)"}.`,
    `Cột số: ${numericCols.size}/${f.cols} (${numericCols.size > f.cols / 2 ? "thiên về số liệu, bảng điểm hay thống kê" : "thiên về chữ, danh sách"}).`,
  );
  const rows = f.sample.slice(1, 4).map((r) => `- ${r.slice(0, 8).map((c) => clip(c, 16)).join(" | ")}`);
  if (rows.length) lines.push("Vài hàng dữ liệu đầu:", ...rows);
  return lines.join("\n");
}

export interface PptFacts {
  slides: Array<{ title: string; texts: number; pictures: number; tables: number; charts: number; chars: number }>;
}

export function profilePpt(f: PptFacts): string {
  const n = f.slides.length;
  const lines = [`Loại tệp: PowerPoint. ${n} slide.`];
  if (!n) return [...lines, "Chưa có slide nào."].join("\n");
  const pics = f.slides.filter((s) => s.pictures > 0).length;
  const avg = Math.round(f.slides.reduce((a, s) => a + s.chars, 0) / n);
  lines.push(
    `Slide có ảnh: ${pics}/${n}. Có bảng: ${f.slides.filter((s) => s.tables).length}. Có biểu đồ: ${f.slides.filter((s) => s.charts).length}.`,
    `Lượng chữ trung bình mỗi slide: ${avg} ký tự (${avg > 450 ? "nhiều chữ" : avg > 150 ? "vừa phải" : "ít chữ"}).`,
    "Tiêu đề các slide đầu:",
    ...f.slides.slice(0, 12).map((s, i) => `- ${i + 1}. ${clip(s.title, 70) || "(không tiêu đề)"}`),
  );
  return lines.join("\n");
}

async function collectWord(): Promise<string> {
  return Word.run(async (ctx) => {
    const body = ctx.document.body;
    const ps = body.paragraphs;
    ps.load("items/style,items/isListItem,items/tableNestingLevel,items/text,items/font/name,items/font/size");
    body.tables.load("items");
    body.inlinePictures.load("items");
    await ctx.sync();
    let activeTheme: string | undefined;
    try {
      if (Office.context.requirements.isSetSupported("WordApiDesktop", "1.4")) {
        const d = ctx.document as unknown as { activeThemeDisplayName?: string; load(p: string): void };
        d.load("activeThemeDisplayName");
        await ctx.sync();
        activeTheme = d.activeThemeDisplayName;
      }
    } catch {
      /* không đọc được chủ đề hiện tại */
    }
    return profileWord({
      paragraphs: ps.items.map((p) => ({ style: p.style, list: p.isListItem, inTable: p.tableNestingLevel > 0, chars: p.text.trim().length, font: p.font.name, size: p.font.size, text: p.text })),
      tables: body.tables.items.length,
      pictures: body.inlinePictures.items.length,
      activeTheme,
    });
  });
}

async function collectExcel(): Promise<string> {
  const sheets = (await excelTool("office_excel_list_sheets", {})) as string[];
  const s = (await excelTool("office_excel_get_sheet", {})) as { address: string | null; values: unknown[][]; totalRows: number; totalColumns: number };
  let tables = 0;
  try {
    tables = ((await excelTool("office_excel_list_tables", {})) as unknown[]).length;
  } catch {
    /* không đọc được danh sách bảng */
  }
  return profileExcel({ sheets, address: s.address, rows: s.totalRows, cols: s.totalColumns, sample: s.values.slice(0, 12), tables });
}

async function collectPpt(): Promise<string> {
  const slides = (await powerpointTool("office_ppt_get_slides", {})) as Array<{ shapes: Array<{ name: string; type: string; text?: string }> }>;
  return profilePpt({
    slides: slides.map((sl) => {
      const texts = sl.shapes.filter((s) => s.text !== undefined);
      const title = texts.find((s) => /title|tiêu đề/i.test(s.name)) ?? texts[0];
      return {
        title: title?.text ?? "",
        texts: texts.length,
        pictures: sl.shapes.filter((s) => /image|picture/i.test(String(s.type))).length,
        tables: sl.shapes.filter((s) => /table/i.test(String(s.type))).length,
        charts: sl.shapes.filter((s) => /chart/i.test(String(s.type))).length,
        chars: texts.reduce((a, s) => a + (s.text?.length ?? 0), 0),
      };
    }),
  });
}

/** Đọc cấu trúc tệp đang mở (không gửi nội dung đầy đủ) để PVTA chọn hướng làm đẹp. */
export async function analyzeDocument(host: OfficeHost): Promise<string> {
  return host === "word" ? collectWord() : host === "excel" ? collectExcel() : collectPpt();
}

/**
 * Vài dòng đầu của văn bản Word (quốc hiệu, đơn vị, tiêu đề, nơi và ngày) để PVTA biết văn bản của đơn vị nào, ở đâu.
 * Chỉ bridge dùng cục bộ để tìm văn bản liên quan đúng địa bàn; không đưa vào lời nhắc gửi model.
 */
export async function documentHead(host: OfficeHost): Promise<string> {
  if (host === "excel") {
    // Vài dòng đầu của sheet (chỉ để nhận loại bảng, ở lại trong máy và bridge).
    return Excel.run(async (ctx) => {
      const used = ctx.workbook.worksheets.getActiveWorksheet().getUsedRangeOrNullObject(true);
      used.load("rowCount,columnCount");
      await ctx.sync();
      if (used.isNullObject) return "";
      const top = used.getCell(0, 0).getResizedRange(Math.min(used.rowCount, 12) - 1, Math.min(used.columnCount, 16) - 1);
      top.load("values");
      await ctx.sync();
      return top.values
        .map((r) => r.map((v) => String(v ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join("\t").slice(0, 120))
        .filter(Boolean)
        .join("\n");
    });
  }
  if (host !== "word") return "";
  return Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs;
    ps.load("items/text");
    await ctx.sync();
    const lines: string[] = [];
    let total = 0;
    for (const p of ps.items) {
      const t = p.text.replace(/\s+/g, " ").trim();
      if (!t) continue;
      lines.push(t.slice(0, 120));
      total += Math.min(t.length, 120);
      if (lines.length >= 16 || total > 800) break;
    }
    return lines.join("\n");
  });
}

/** Phần đầu văn bản Word (tối đa ~6000 ký tự) để dò số hiệu ở phần căn cứ. Chỉ gửi cho bridge trên cùng máy, không gửi cho model. */
export async function documentBasisText(host: OfficeHost): Promise<string> {
  if (host !== "word") return "";
  return Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs;
    ps.load("items/text");
    await ctx.sync();
    let out = "";
    for (const p of ps.items) {
      const t = p.text.replace(/\s+/g, " ").trim();
      if (!t) continue;
      out += t + "\n";
      if (out.length > 6000) break;
    }
    return out;
  });
}
