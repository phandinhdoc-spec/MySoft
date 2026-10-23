import { strFromU8, unzipSync } from "fflate";
import type { ClientMessage } from "@pvta/shared";
import { pdfText } from "./pdf";

/** Giới hạn phía add-in (bridge còn giới hạn riêng). */
export const FILE_LIMITS = { bytes: 25 * 1024 * 1024, /** PDF (sách giáo khoa) thường nặng hơn tệp văn bản. */ pdfBytes: 120 * 1024 * 1024, folderFiles: 60 };

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "log", "xml", "html", "htm", "tex", "srt", "yaml", "yml"]);
const ZIP_EXT = new Set(["docx", "pptx", "xlsx"]);

export const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
export const isReadable = (name: string) => TEXT_EXT.has(extOf(name)) || ZIP_EXT.has(extOf(name)) || extOf(name) === "pdf";

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unxml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENT[e.toLowerCase()] ?? m;
    });
}
const tidy = (s: string) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

function docxText(files: Record<string, Uint8Array>): string {
  const x = files["word/document.xml"];
  if (!x) return "";
  return tidy(unxml(strFromU8(x).replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:tc>/g, "\t").replace(/<\/w:p>/g, "\n")));
}

function numSort(a: string, b: string) {
  return Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);
}

function pptxText(files: Record<string, Uint8Array>): string {
  const slides = Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(numSort);
  return tidy(
    slides
      .map((n, i) => `# Slide ${i + 1}\n` + unxml(strFromU8(files[n]!).replace(/<\/a:p>/g, "\n")))
      .join("\n\n"),
  );
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function xlsxText(files: Record<string, Uint8Array>): string {
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) for (const m of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unxml(m[1]!.replace(/<rPh[\s\S]*?<\/rPh>/g, "")));
  const names: string[] = [];
  const wb = files["xl/workbook.xml"];
  if (wb) for (const m of strFromU8(wb).matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)) names.push(unxml(m[1]!));
  const sheets = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(numSort);
  const out: string[] = [];
  sheets.forEach((n, si) => {
    const rows: string[] = [];
    for (const rm of strFromU8(files[n]!).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]!;
        const body = cm[2] ?? "";
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "A1";
        const type = /\bt="(\w+)"/.exec(attrs)?.[1];
        let val = "";
        if (type === "s") val = shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? "";
        else if (type === "inlineStr") val = unxml(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
        else val = unxml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        const idx = colIndex(ref);
        while (cells.length < idx) cells.push("");
        cells[idx] = val.replace(/[\t\r\n]+/g, " ");
      }
      if (cells.some((c) => c !== "")) rows.push(cells.join("\t").replace(/\t+$/, ""));
    }
    if (rows.length) out.push(`# Sheet: ${names[si] ?? `Sheet${si + 1}`}\n${rows.join("\n")}`);
  });
  return tidy(out.join("\n\n"));
}

/** Trích chữ từ byte của tệp (txt, md, csv, json, html… hoặc docx, pptx, xlsx). */
export function extractFromBytes(name: string, bytes: Uint8Array): { ok: true; text: string } | { ok: false; reason: string } {
  const ext = extOf(name);
  try {
    if (TEXT_EXT.has(ext)) {
      let t = strFromU8(bytes);
      if (ext === "html" || ext === "htm") t = tidy(unxml(t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<\/(p|div|li|h\d|tr)>|<br\s*\/?>/gi, "\n")));
      return t.trim() ? { ok: true, text: t } : { ok: false, reason: "tệp trống" };
    }
    if (ZIP_EXT.has(ext)) {
      const files = unzipSync(bytes, { filter: (f) => /\.xml$/.test(f.name) && (f.originalSize ?? 0) < 20_000_000 });
      const text = ext === "docx" ? docxText(files) : ext === "pptx" ? pptxText(files) : xlsxText(files);
      return text ? { ok: true, text } : { ok: false, reason: "không thấy chữ trong tệp" };
    }
  } catch {
    return { ok: false, reason: "tệp hỏng hoặc có mật khẩu" };
  }
  if (ext === "pdf") return { ok: false, reason: "PDF được đọc riêng (pdf.js)" };
  if (ext === "doc" || ext === "xls" || ext === "ppt") return { ok: false, reason: "định dạng cũ (hãy lưu lại thành .docx, .xlsx, .pptx)" };
  return { ok: false, reason: "loại tệp chưa hỗ trợ" };
}

export interface AddResult {
  added: string[];
  skipped: Array<{ name: string; reason: string }>;
}

/** Đường dẫn trong thư mục: bỏ qua tệp ẩn và thư mục công cụ. */
export function skipInFolder(rel: string): boolean {
  return rel.split("/").some((seg) => seg.startsWith(".") || seg === "node_modules" || seg === "__MACOSX" || seg === "~$" || seg.startsWith("~$"));
}

/**
 * Đọc các tệp người dùng chọn và gửi cho bridge (mỗi tệp một tin). Thư mục: tên tệp là đường dẫn tương đối.
 */
/** Lý do pdfText trả về khi PDF chỉ là ảnh (không có chữ). */
export const isScanReason = (reason: string): boolean => reason.startsWith("PDF này là ảnh");

export async function addFiles(
  files: File[],
  target: { scope: "chat" | "project"; id: string },
  send: (m: ClientMessage) => boolean,
  opts: {
    folder?: boolean;
    onProgress?: (msg: string) => void;
    /** Đọc chữ PDF scan qua bridge (OCR). Không truyền = báo «cần OCR» như trước. */
    ocr?: (file: File) => Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
  } = {},
): Promise<AddResult> {
  const res: AddResult = { added: [], skipped: [] };
  let n = 0;
  for (const f of files) {
    const name = opts.folder ? ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name) : f.name;
    if (opts.folder && skipInFolder(name)) continue; // ẩn / công cụ: không tính là bị bỏ qua
    if (opts.folder && !isReadable(name)) {
      res.skipped.push({ name, reason: "loại tệp chưa hỗ trợ" });
      continue;
    }
    if (opts.folder && ++n > FILE_LIMITS.folderFiles) {
      res.skipped.push({ name, reason: `thư mục có quá ${FILE_LIMITS.folderFiles} tệp` });
      continue;
    }
    const isPdf = extOf(name) === "pdf";
    if (f.size > (isPdf ? FILE_LIMITS.pdfBytes : FILE_LIMITS.bytes)) {
      res.skipped.push({ name, reason: `tệp quá lớn (tối đa ${Math.round((isPdf ? FILE_LIMITS.pdfBytes : FILE_LIMITS.bytes) / 1048576)} MB)` });
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    let r: ReturnType<typeof extractFromBytes>;
    if (isPdf) {
      const p = await pdfText(bytes, (d, t) => opts.onProgress?.(`${name}: đang đọc trang ${d}/${t}…`));
      r = p.ok ? { ok: true, text: p.read < p.pages ? `${p.text}\n\n(Chỉ đọc ${p.read}/${p.pages} trang đầu.)` : p.text } : p;
      // PDF scan không có lớp chữ: nhờ bridge OCR (cần tesseract trên máy); không được thì giữ lý do gốc kèm lý do OCR.
      if (!p.ok && opts.ocr && isScanReason(p.reason)) {
        opts.onProgress?.(`${name}: PDF scan, đang nhận dạng chữ (OCR)…`);
        const o = await opts.ocr(f).catch((e: Error) => ({ ok: false as const, reason: e.message }));
        r = o.ok ? { ok: true, text: o.text } : { ok: false, reason: `${p.reason}. OCR: ${o.reason}` };
      }
    } else r = extractFromBytes(name, bytes);
    if (!r.ok) {
      res.skipped.push({ name, reason: r.reason });
      continue;
    }
    // Bridge giữ tối đa 1,2 triệu ký tự mỗi tệp; gửi dư một ký tự để bridge biết tệp đã bị cắt, không gửi cả tệp quá lớn.
    if (send({ type: "file_add", scope: target.scope, id: target.id, name, text: r.text.slice(0, 1_200_001) })) res.added.push(name);
    else res.skipped.push({ name, reason: "chưa kết nối PVTA" });
  }
  return res;
}
