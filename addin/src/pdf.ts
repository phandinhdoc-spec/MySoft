/**
 * Trích chữ từ PDF (sách giáo khoa, đề cương…) ngay trong add-in, bằng pdf.js (bản "legacy" chạy được trên WebView cũ của Office).
 * Chỉ đọc được PDF có lớp chữ. PDF chụp/scan chỉ là ảnh thì không có chữ để đọc: báo rõ để thầy cô biết cần OCR trước.
 * pdf.js chỉ nạp khi thật sự có tệp PDF (không làm nặng lúc mở PVTA).
 */

export const PDF_MAX_PAGES = 1500;

export type PdfResult = { ok: true; text: string; pages: number; read: number } | { ok: false; reason: string };

type PdfLib = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let lib: Promise<PdfLib> | undefined;

async function loadLib(): Promise<PdfLib> {
  lib ??= (async () => {
    const m = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Có sẵn worker (kiểm thử, hoặc trang đã nạp) thì dùng luôn; không thì nạp tệp worker đi kèm bản build.
    if (!(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) {
      const url = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
      m.GlobalWorkerOptions.workerSrc = url;
    }
    return m;
  })();
  return lib;
}

interface TextPiece {
  str?: string;
  hasEOL?: boolean;
}

/** Ghép các mẩu chữ của một trang thành đoạn văn: xuống dòng theo hasEOL, gộp khoảng trắng thừa. */
export function joinPieces(items: TextPiece[]): string {
  let out = "";
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    out += it.str;
    out += it.hasEOL ? "\n" : it.str && !/\s$/.test(it.str) ? " " : "";
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function pdfText(bytes: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<PdfResult> {
  let pdfjs: PdfLib;
  try {
    pdfjs = await loadLib();
  } catch {
    return { ok: false, reason: "không nạp được bộ đọc PDF" };
  }
  let doc: Awaited<ReturnType<PdfLib["getDocument"]>["promise"]> | undefined;
  try {
    // pdf.js lấy quyền sở hữu bộ đệm: đưa bản sao để mảng gốc không bị "detached".
    doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
    const total = doc.numPages;
    const read = Math.min(total, PDF_MAX_PAGES);
    const parts: string[] = [];
    let withText = 0;
    for (let i = 1; i <= read; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const t = joinPieces(tc.items as TextPiece[]);
      page.cleanup();
      if (t.length > 15) {
        withText++;
        parts.push(`[Trang ${i}]\n${t}`);
      }
      if (onProgress && (i % 10 === 0 || i === read)) onProgress(i, read);
    }
    // Hầu như không có trang nào có chữ: PDF dạng ảnh.
    if (withText === 0 || withText < read * 0.1) {
      return { ok: false, reason: "PDF này là ảnh chụp/scan, không có lớp chữ để đọc (cần nhận dạng chữ OCR trước, rồi thêm lại)" };
    }
    return { ok: true, text: parts.join("\n\n"), pages: total, read };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "PasswordException") return { ok: false, reason: "PDF có mật khẩu" };
    return { ok: false, reason: "PDF hỏng hoặc không đọc được" };
  } finally {
    void doc?.destroy();
  }
}
