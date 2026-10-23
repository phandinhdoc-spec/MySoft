import { describe, expect, it } from "vitest";
import { profileExcel, profilePpt, profileWord } from "../src/office/analyze";

const p = (style: string, chars: number, o: Partial<{ list: boolean; font: string; size: number; text: string }> = {}) => ({
  style, list: o.list ?? false, inTable: false, chars, font: o.font ?? "Times New Roman", size: o.size ?? 13, text: o.text ?? "x".repeat(chars),
});

describe("tóm tắt cấu trúc tệp để chọn hướng làm đẹp", () => {
  it("Word: đề mục, danh sách, phông nhiều nhất, dàn ý; không gửi cả nội dung", () => {
    const s = profileWord({
      paragraphs: [p("Heading 1", 20, { text: "I. Mục tiêu" }), p("Normal", 400), p("List Paragraph", 50, { list: true }), p("Heading 2", 15, { text: "1. Kiến thức" }), p("Normal", 0)],
      tables: 2,
      pictures: 1,
      activeTheme: "Office Theme",
    });
    expect(s).toContain("Word");
    expect(s).toContain("Heading 1 ×1");
    expect(s).toContain("Bảng: 2");
    expect(s).toContain("Times New Roman 13");
    expect(s).toContain("Office Theme");
    expect(s).toContain("- I. Mục tiêu");
    expect(s).not.toContain("xxxxxxxxxx");
  });
  it("Word: chưa dùng kiểu đề mục thì nói rõ và lấy câu mở đầu", () => {
    const s = profileWord({ paragraphs: [p("Normal", 30, { text: "BÀI 1. LỰC MA SÁT" })], tables: 0, pictures: 0 });
    expect(s).toContain("chưa dùng kiểu đề mục");
    expect(s).toContain("BÀI 1. LỰC MA SÁT");
  });
  it("Excel: nhận ra hàng tiêu đề và thiên về số liệu", () => {
    const s = profileExcel({
      sheets: ["Điểm", "Tổng hợp"], address: "Điểm!A1:D40", rows: 40, cols: 4, tables: 0,
      sample: [["STT", "Họ tên", "Toán", "Lý"], [1, "An", 8, 7.5], [2, "Bình", 9, 6]],
    });
    expect(s).toContain("giống hàng tiêu đề");
    expect(s).toContain("40 hàng × 4 cột");
    expect(s).toContain("bảng điểm");
    expect(profileExcel({ sheets: ["A"], address: null, rows: 0, cols: 0, sample: [], tables: 0 })).toContain("trống");
  });
  it("PowerPoint: lượng chữ và ảnh", () => {
    const s = profilePpt({ slides: [{ title: "Bài 1", texts: 2, pictures: 1, tables: 0, charts: 0, chars: 500 }, { title: "", texts: 1, pictures: 0, tables: 1, charts: 0, chars: 100 }] });
    expect(s).toContain("2 slide");
    expect(s).toContain("Slide có ảnh: 1/2");
    expect(s).toContain("(không tiêu đề)");
    expect(profilePpt({ slides: [] })).toContain("Chưa có slide");
  });
});
