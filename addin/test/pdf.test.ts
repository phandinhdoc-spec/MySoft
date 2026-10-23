import { beforeAll, describe, expect, it } from "vitest";
import { addFiles, isReadable } from "../src/files";
import { joinPieces, pdfText } from "../src/pdf";

/** Tạo PDF tối thiểu, mỗi phần tử là chữ của một trang (có xref đúng để pdf.js không phải "sửa" tệp). */
function makePdf(pages: string[]): Uint8Array {
  const objs: string[] = [];
  const n = pages.length;
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`;
  pages.forEach((text, i) => {
    const page = 3 + i * 2;
    const content = text ? `BT /F1 14 Tf 72 700 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET` : "";
    objs[page] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${page + 1} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`;
    objs[page + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offs[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

beforeAll(async () => {
  // Trong Node không có Worker của trình duyệt: đưa sẵn bộ xử lý vào để pdf.js chạy cùng luồng.
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
});

describe("đọc PDF", () => {
  it("lấy chữ từng trang, đánh dấu số trang", async () => {
    const r = await pdfText(makePdf(["Bai 1. Mo dau ve the gioi song nhieu mau", "Bai 2. Cac the loai tu nhien khac nhau"]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pages).toBe(2);
    expect(r.text).toContain("[Trang 1]\nBai 1. Mo dau");
    expect(r.text).toContain("[Trang 2]\nBai 2.");
  });
  it("PDF không có chữ (ảnh scan) thì báo rõ cần OCR", async () => {
    const r = await pdfText(makePdf(["", "", ""]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/OCR/);
  });
  it("tệp hỏng không làm sập", async () => {
    const r = await pdfText(new TextEncoder().encode("không phải pdf"));
    expect(r.ok).toBe(false);
  });
  it("addFiles nhận .pdf và gửi cho bridge", async () => {
    expect(isReadable("SGK-KHTN-8.pdf")).toBe(true);
    const sent: unknown[] = [];
    const file = new File([makePdf(["Chuong 1: Phan tu va nguyen tu trong hoa hoc co ban"]).slice().buffer as ArrayBuffer], "SGK KHTN 8.pdf");
    const r = await addFiles([file], { scope: "project", id: "p1" }, (m) => (sent.push(m), true));
    expect(r.added).toEqual(["SGK KHTN 8.pdf"]);
    expect(r.skipped).toEqual([]);
    expect(JSON.stringify(sent[0])).toContain("Chuong 1");
  });
  it("joinPieces xuống dòng theo hasEOL và gộp khoảng trắng", () => {
    expect(joinPieces([{ str: "Xin", hasEOL: false }, { str: "chào", hasEOL: true }, { str: "  các   em", hasEOL: false }])).toBe("Xin chào\ncác em");
  });
});
