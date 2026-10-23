import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractFromBytes, isReadable, skipInFolder } from "../src/files";

const zip = (o: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, strToU8(v)])));

describe("trích chữ từ tệp đính kèm", () => {
  it("văn bản thường và html", () => {
    expect(extractFromBytes("a.md", strToU8("# Tiêu đề\nNội dung"))).toEqual({ ok: true, text: "# Tiêu đề\nNội dung" });
    const h = extractFromBytes("a.html", strToU8("<style>x{}</style><h1>Bài 1</h1><p>Lực &amp; ma sát</p>"));
    expect(h.ok && h.text).toBe("Bài 1\nLực & ma sát");
    expect(extractFromBytes("a.txt", strToU8("  ")).ok).toBe(false);
  });
  it("docx: đoạn văn, bảng, ký tự đặc biệt", () => {
    const d = zip({
      "word/document.xml": '<w:document><w:p><w:r><w:t>Bài 1: Lực &amp; chuyển động</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>',
    });
    const r = extractFromBytes("x.docx", d);
    expect(r.ok && r.text).toContain("Bài 1: Lực & chuyển động");
    expect(r.ok && r.text).toMatch(/A\s+B/);
  });
  it("pptx: theo thứ tự slide, số học đúng (slide2 trước slide10)", () => {
    const d = zip({
      "ppt/slides/slide10.xml": "<p><a:p><a:t>Mười</a:t></a:p></p>",
      "ppt/slides/slide2.xml": "<p><a:p><a:t>Hai</a:t></a:p></p>",
    });
    const r = extractFromBytes("x.pptx", d);
    expect(r.ok && r.text).toBe("# Slide 1\nHai\n\n# Slide 2\nMười");
  });
  it("xlsx: chuỗi dùng chung, số, ô trống giữ cột, tên sheet", () => {
    const d = zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Điểm" sheetId="1"/></sheets></workbook>',
      "xl/sharedStrings.xml": "<sst><si><t>Họ tên</t></si><si><t>Điểm</t></si><si><t>An</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>9.5</v></c></row></sheetData></worksheet>',
    });
    const r = extractFromBytes("x.xlsx", d);
    expect(r.ok && r.text).toBe("# Sheet: Điểm\nHọ tên\t\tĐiểm\nAn\t\t9.5");
  });
  it("PDF, định dạng cũ, tệp hỏng: báo lý do", () => {
    const pdf = extractFromBytes("a.pdf", new Uint8Array([1]));
    expect(!pdf.ok && pdf.reason).toContain("PDF");
    expect(extractFromBytes("a.doc", new Uint8Array([1])).ok).toBe(false);
    const bad = extractFromBytes("a.docx", new Uint8Array([1, 2, 3]));
    expect(!bad.ok && bad.reason).toContain("hỏng");
    expect(isReadable("a.XLSX")).toBe(true);
    expect(isReadable("a.exe")).toBe(false);
  });
  it("thư mục: bỏ tệp ẩn và thư mục công cụ", () => {
    expect(skipInFolder("lop8/.git/config")).toBe(true);
    expect(skipInFolder("lop8/node_modules/x.js")).toBe(true);
    expect(skipInFolder("lop8/~$de.docx")).toBe(true);
    expect(skipInFolder("lop8/de/bai1.docx")).toBe(false);
  });
});
