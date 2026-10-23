import {wordStructureTool} from './wordstructure';
import { LIMITS } from "@pvta/shared";
import { themeArgs } from "./theme";
import { imageToEquation, keepQuestionsTogether, scanWordImages } from "./images";
import { looksMathy } from "@pvta/shared";

type Args = Record<string, unknown>;

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string") throw new Error(`Thiếu tham số '${name}' (chuỗi).`);
  return v;
};

/** Thư viện công thức khá nặng: chỉ tải khi thật sự cần (lần đầu có công thức), không làm chậm lúc mở panel. */
const equation = () => import("./equation");
/** Lọc nhanh trước khi tải thư viện: văn bản thường không có $, dấu gạch chéo ngược hay chỉ số trên dưới. */
const maybeMath = (t: string) => /[$\\]|[A-Za-z)][_^]/.test(t);

/**
 * Chèn văn bản. Văn bản có công thức ($…$, $$…$$, \\(…\\), \\[…\\], \\ce{…} hoặc LaTeX trần) được chèn thành
 * Equation chuẩn của Word (OMML); lỗi thì rơi về văn bản thường, không mất chữ.
 */
export async function put(ctx: Word.RequestContext, range: Word.Range | Word.Body, text: string, loc: "Replace" | "Start" | "End" | "After"): Promise<void> {
  if (maybeMath(text)) {
    try {
      const eq = await equation();
      if (eq.hasMath(text)) {
        // Range.insertOoxml không nhận "After": chèn vào đầu một vùng rỗng ngay sau.
        if (loc === "After") (range as Word.Range).getRange("After").insertOoxml(eq.textToOoxml(text), "Start");
        else range.insertOoxml(eq.textToOoxml(text), loc);
        await ctx.sync();
        return;
      }
    } catch {
      /* không tải được thư viện hoặc Word không nhận OOXML này: chèn như văn bản thường */
    }
  }
  if (loc === "After") (range as Word.Range).insertText(text, "After");
  else range.insertText(text, loc);
  await ctx.sync();
}

/** Giới hạn PDF xem trước gửi cho model (văn bản dài quá thì chỉ báo, không gửi). */
const PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

/** Xuất cả văn bản ra PDF (getFileAsync, đọc theo từng lát) rồi trả về base64. */
function exportPdf(): Promise<string> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(Office.FileType.Pdf, { sliceSize: 4 * 1024 * 1024 }, (res) => {
      if (res.status !== Office.AsyncResultStatus.Succeeded) return reject(new Error(res.error?.message || "Không xuất được PDF."));
      const file = res.value;
      if (file.size > PREVIEW_MAX_BYTES) {
        file.closeAsync();
        return reject(new Error("Văn bản quá dài để xuất PDF xem trước; kiểm tra bằng office_word_get_body."));
      }
      const parts: Uint8Array[] = new Array(file.sliceCount);
      let got = 0;
      const fail = (m: string) => {
        file.closeAsync();
        reject(new Error(m));
      };
      for (let i = 0; i < file.sliceCount; i++) {
        file.getSliceAsync(i, (sr) => {
          if (sr.status !== Office.AsyncResultStatus.Succeeded) return fail(sr.error?.message || "Không đọc được PDF.");
          parts[sr.value.index] = Uint8Array.from(sr.value.data as number[]);
          if (++got === file.sliceCount) {
            file.closeAsync();
            let bin = "";
            for (const p of parts) for (let k = 0; k < p.length; k += 0x8000) bin += String.fromCharCode(...p.subarray(k, k + 0x8000));
            resolve(btoa(bin));
          }
        });
      }
    });
  });
}

export async function wordTool(tool: string, a: Args): Promise<unknown> {
  if (["office_word_get_structure", "office_word_apply_outline", "office_word_insert_index"].includes(tool)) return wordStructureTool(tool, a);
  if (tool === "office_word_get_preview") return { files: [{ name: "van-ban.pdf", mime: "application/pdf", b64: await exportPdf() }] };
  return Word.run(async (ctx) => {
    const doc = ctx.document;
    switch (tool) {
      case "office_word_list_images": {
        const { images, blocks } = await scanWordImages(false);
        return {
          questions: blocks.map((b) => b.label),
          images: images.map(({ id, question, caption, hash, w, h, by }) => ({ id, question, caption, hash, size: `${w}x${h}pt`, by })),
        };
      }
      case "office_word_image_to_equation":
        return imageToEquation(str(a.id, "id"), str(a.latex, "latex"));
      case "office_word_format_find": {
        const items = (Array.isArray(a.items) ? a.items : [a]).slice(0, 80) as Args[];
        const report: string[] = [];
        const ps = doc.body.paragraphs;
        ps.load("items/text");
        await ctx.sync();
        const apply = (f: Word.Font, it: Args) => {
          if (typeof it.bold === "boolean") f.bold = it.bold;
          if (typeof it.italic === "boolean") f.italic = it.italic;
          if (typeof it.underline === "boolean") f.underline = it.underline ? "Single" : "None";
          if (typeof it.size === "number") f.size = it.size;
          if (typeof it.font === "string") f.name = it.font;
          if (typeof it.color === "string") f.color = it.color;
          if (it.highlight === "none") f.highlightColor = null as unknown as string;
          else if (typeof it.highlight === "string") f.highlightColor = it.highlight;
        };
        const norm = (t: string) => t.replace(/\s+/g, " ").trim();
        const pending: Array<{ it: Args; res: Word.RangeCollection | null; hits: number }> = [];
        for (const it of items) {
          const find = norm(String(it.find ?? ""));
          if (!find) {
            report.push("bỏ qua mục không có 'find'");
            continue;
          }
          if (it.paragraphStart === true) {
            // Tìm theo ĐẦU ĐOẠN (vd đáp án "A. Bạn An…"): định dạng cả đoạn, không đụng chỗ khác có cùng chữ.
            let n = 0;
            ps.items.forEach((p) => {
              if (norm(p.text).startsWith(find)) {
                apply(p.font, it);
                n++;
              }
            });
            report.push(`${find.slice(0, 40)}: ${n} đoạn`);
          } else {
            const r = doc.body.search(find.slice(0, 250), { matchCase: it.matchCase === true });
            r.load("items");
            pending.push({ it, res: r, hits: 0 });
          }
        }
        await ctx.sync();
        for (const { it, res } of pending) {
          const list = res?.items ?? [];
          const only = typeof it.occurrence === "number" && it.occurrence >= 1 ? [list[it.occurrence - 1]].filter(Boolean) : list;
          only.forEach((r) => apply(r!.font, it));
          report.push(`${norm(String(it.find)).slice(0, 40)}: ${only.length} chỗ`);
        }
        await ctx.sync();
        return report.join("; ");
      }
      case "office_word_math_scan": {
        const ps = doc.body.paragraphs;
        ps.load("items/text");
        await ctx.sync();
        const out: Array<{ index: number; text: string }> = [];
        ps.items.forEach((p, index) => {
          if (looksMathy(p.text)) out.push({ index, text: p.text });
        });
        return { count: out.length, paragraphs: out.slice(0, 120) };
      }
      case "office_word_replace_paragraph": {
        const index = Number(a.index);
        const text = str(a.text, "text");
        const ps = doc.body.paragraphs;
        ps.load("items");
        await ctx.sync();
        const p = ps.items[index];
        if (!Number.isInteger(index) || !p) throw new Error("index đoạn không hợp lệ.");
        await put(ctx, p.getRange("Content"), text, "Replace");
        return "đã thay đoạn";
      }
      case "office_word_keep_together": {
        const qs = Array.isArray(a.questions) ? a.questions.map(Number).filter((n) => Number.isInteger(n) && n > 0) : undefined;
        const r = await keepQuestionsTogether(qs);
        return r.blocks.length ? `đã giữ cùng trang: ${r.blocks.join(", ")}` : "không có câu nào cần giữ";
      }
      case "office_word_get_selection": {
        const sel = doc.getSelection();
        sel.load("text");
        await ctx.sync();
        return sel.text;
      }
      case "office_word_get_body": {
        doc.body.load("text");
        await ctx.sync();
        const text = doc.body.text;
        if (text.length <= LIMITS.wordMaxChars) return { text, truncated: false, totalChars: text.length };
        return {
          text: text.slice(0, LIMITS.wordMaxChars),
          truncated: true,
          totalChars: text.length,
          note: `Đã cắt ở ${LIMITS.wordMaxChars} ký tự.`,
        };
      }
      case "office_word_replace_selection": {
        await put(ctx, doc.getSelection(), str(a.text, "text"), "Replace");
        return "đã thay vùng chọn";
      }
      case "office_word_set_body": {
        await put(ctx, doc.body, str(a.text, "text"), "Replace");
        return "đã đặt lại nội dung";
      }
      case "office_word_insert_text": {
        const text = str(a.text, "text");
        const where = a.where === "start" ? "start" : a.where === "cursor" ? "cursor" : "end";
        if (where === "cursor") await put(ctx, doc.getSelection(), text, "After");
        else await put(ctx, doc.body, text, where === "start" ? "Start" : "End");
        return "đã chèn";
      }
      case "office_word_insert_equation": {
        const latex = str(a.latex, "latex").replace(/^\s*\$+|\$+\s*$/g, "").trim();
        if (!latex) throw new Error("'latex' đang trống.");
        const eq = await equation();
        try {
          eq.latexToOmml(latex); // kiểm tra trước để báo lỗi cú pháp cho model sửa, không chèn chữ thô
        } catch (e) {
          throw new Error(`LaTeX chưa đúng cú pháp: ${e instanceof Error ? e.message : String(e)}. Công thức hóa học viết \\ce{H2O}, \\ce{CaCO3 -> CaO + CO2 ^}.`);
        }
        const where = a.where === "start" ? "start" : a.where === "end" ? "end" : a.where === "replace" ? "replace" : "cursor";
        const xml = eq.equationToOoxml(latex);
        if (where === "replace") doc.getSelection().insertOoxml(xml, "Replace");
        else if (where === "cursor") doc.getSelection().getRange("After").insertOoxml(xml, "Start");
        else doc.body.insertOoxml(xml, where === "start" ? "Start" : "End");
        await ctx.sync();
        return "đã chèn công thức";
      }
      case "office_word_insert_table": {
        const values = a.values;
        if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) throw new Error("'values' phải là mảng hai chiều không rỗng.");
        const rows = values.length;
        const cols = Math.max(...values.map((r: unknown) => (Array.isArray(r) ? r.length : 0)));
        const grid = values.map((r: unknown[]) => Array.from({ length: cols }, (_, i) => String(r[i] ?? "")));
        const table = doc.getSelection().insertTable(rows, cols, "After", grid);
        if (a.header !== false) table.headerRowCount = 1;
        await ctx.sync();
        return `đã chèn bảng ${rows}x${cols}`;
      }
      case "office_word_apply_style": {
        doc.getSelection().style = str(a.style, "style");
        await ctx.sync();
        return "đã áp style";
      }
      case "office_word_get_format": {
        const f = doc.getSelection().font;
        f.load("name,size,bold,italic,color");
        await ctx.sync();
        return { font: f.name, size: f.size, bold: f.bold, italic: f.italic, color: f.color };
      }
      case "office_word_apply_format": {
        const target = a.scope === "document" ? doc.body.getRange("Whole") : doc.getSelection();
        const f = target.font;
        if (typeof a.font === "string") f.name = a.font;
        if (typeof a.size === "number") f.size = a.size;
        if (typeof a.bold === "boolean") f.bold = a.bold;
        if (typeof a.italic === "boolean") f.italic = a.italic;
        if (typeof a.underline === "boolean") f.underline = a.underline ? "Single" : "None";
        if (typeof a.color === "string") f.color = a.color;
        if (a.highlight === "none") f.highlightColor = null as unknown as string;
        else if (typeof a.highlight === "string") f.highlightColor = a.highlight;
        await ctx.sync();
        return a.scope === "document" ? "đã định dạng chữ toàn văn bản" : "đã định dạng chữ vùng chọn";
      }
      case "office_word_format_paragraph": {
        const paras = a.scope === "document" ? doc.body.paragraphs : doc.getSelection().paragraphs;
        paras.load("items");
        await ctx.sync();
        const CM = 28.3465; // điểm (pt) trong 1 cm
        const align: Record<string, Word.Alignment> = { left: "Left", center: "Centered", right: "Right", justify: "Justified" } as never;
        for (const p of paras.items) {
          // Word: lineSpacing tính bằng điểm, giao diện Word lấy giá trị này chia 12 (12 = dòng đơn).
          if (typeof a.lineSpacing === "number" && a.lineSpacing > 0) p.lineSpacing = Math.round(a.lineSpacing * 12 * 100) / 100;
          if (typeof a.spaceBefore === "number") p.spaceBefore = a.spaceBefore;
          if (typeof a.spaceAfter === "number") p.spaceAfter = a.spaceAfter;
          if (typeof a.alignment === "string" && align[a.alignment]) p.alignment = align[a.alignment]!;
          if (typeof a.firstLineIndent === "number") p.firstLineIndent = a.firstLineIndent * CM;
          if (typeof a.leftIndent === "number") p.leftIndent = a.leftIndent * CM;
        }
        await ctx.sync();
        return `đã định dạng ${paras.items.length} đoạn`;
      }
      case "office_word_apply_theme": {
        const t = themeArgs(a);
        // Đề mục: phông tiêu đề + màu chính (cấp 1) / màu phụ (cấp dưới). Thân bài: phông nội dung,
        // giữ màu chữ đang có (thường là đen) để in rõ.
        const paras = doc.body.paragraphs;
        paras.load("items/styleBuiltIn");
        await ctx.sync();
        let headings = 0;
        for (const p of paras.items) {
          const sb = String(p.styleBuiltIn);
          if (sb === "Title" || sb === "Heading1") {
            if (t.headingFont) p.font.name = t.headingFont;
            p.font.color = t.primary;
            headings++;
          } else if (/^Heading[2-9]$/.test(sb) || sb === "Subtitle") {
            if (t.headingFont) p.font.name = t.headingFont;
            p.font.color = t.secondary ?? t.primary;
            headings++;
          } else if (t.bodyFont) p.font.name = t.bodyFont;
        }
        await ctx.sync();
        return `đã áp chủ đề cho ${paras.items.length} đoạn (${headings} đề mục)`;
      }
      default:
        throw new Error(`Công cụ Word không tồn tại: ${tool}`);
    }
  });
}
