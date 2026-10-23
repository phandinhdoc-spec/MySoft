import { describe, expect, it } from "vitest";
import { buildIndex, promptSection, search } from "@pvta/shared";
import { capSegments, colLetter, fingerprint, headingLevel, sheetSegments, slideSegments, wordSegments } from "../src/office/ragsource";

describe("Word → đoạn", () => {
  const paras = [
    { text: "Chương 1. Cơ học", level: 1 },
    { text: "" },
    { text: "Chuyển động đều là chuyển động có vận tốc không đổi." },
    { text: "1.1 Vận tốc", level: 2 },
    { text: "Vận tốc v = s / t." },
    { text: "Đại lượng", inTable: true },
    { text: "Đơn vị", inTable: true },
    { text: "Quãng đường", inTable: true },
    { text: "m", inTable: true },
    { text: "Chương 2. Nhiệt học", level: 1 },
    { text: "Nhiệt lượng Q = m.c.Δt." },
  ];
  it("giữ số đoạn thật, đường dẫn đề mục, gộp bảng, bỏ đoạn rỗng", () => {
    const s = wordSegments(paras);
    expect(s.map((x) => x.ref)).toEqual(["Đoạn 1", "Đoạn 3", "Đoạn 4", "Đoạn 5", "Đoạn 6", "Đoạn 10", "Đoạn 11"]);
    expect(s[1]!.section).toBe("Chương 1. Cơ học");
    expect(s[3]!.section).toBe("Chương 1. Cơ học > 1.1 Vận tốc");
    expect(s[4]).toMatchObject({ ref: "Đoạn 6", text: "Đại lượng | Đơn vị | Quãng đường | m" });
    expect(s[6]!.section).toBe("Chương 2. Nhiệt học"); // đề mục cùng cấp thay đề mục cũ
  });
  it("nhận cấp đề mục từ kiểu dựng sẵn", () => {
    expect(headingLevel("Heading3")).toBe(3);
    expect(headingLevel("Title")).toBe(0);
    expect(headingLevel("Normal")).toBeUndefined();
    expect(headingLevel(undefined)).toBeUndefined();
  });
});

describe("Excel → khối hàng", () => {
  const values = [
    ["Họ tên", "Lớp", "Toán", "Lí"],
    ["Nguyễn An", "8A1", "9", "8.5"],
    ["Trần Bình", "8A2", "7", ""],
  ];
  it("ghi tiêu đề cột vào từng hàng và địa chỉ đúng khi vùng không bắt đầu ở A1", () => {
    const s = sheetSegments([{ name: "Điểm HK1", row0: 4, col0: 1, values }]);
    expect(s).toHaveLength(1);
    expect(s[0]!.ref).toBe("'Điểm HK1'!B5:E7");
    expect(s[0]!.text).toContain("Hàng 6: Họ tên: Nguyễn An; Lớp: 8A1; Toán: 9; Lí: 8.5");
    expect(s[0]!.text).toContain("Hàng 7: Họ tên: Trần Bình; Lớp: 8A2; Toán: 7");
    expect(s[0]!.text).not.toContain("Lí: ;");
    expect(s[0]!.atomic).toBe(true);
  });
  it("chia khối khi nhiều hàng; sheet rỗng bị bỏ; tên sheet đơn giản không có nháy", () => {
    const many = [["A", "B"], ...Array.from({ length: 60 }, (_, i) => [`x${i}`, `y${i}`])];
    const s = sheetSegments([{ name: "S1", row0: 0, col0: 0, values: many }, { name: "Rong", row0: 0, col0: 0, values: [] }]);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s[0]!.ref).toBe("S1!A1:B25");
    expect(s.every((x) => !x.ref.startsWith("Rong"))).toBe(true);
  });
  it("cột chữ cái", () => {
    expect([0, 25, 26, 27, 701, 702].map(colLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

describe("PowerPoint → slide", () => {
  it("một slide một đoạn, lấy tiêu đề; bỏ slide trống", () => {
    const s = slideSegments([
      { index: 0, shapes: [{ name: "Title 1", text: "Quang hợp" }, { name: "Content 2", text: "Lá cây hấp thụ ánh sáng\nTạo ra glucose" }] },
      { index: 1, shapes: [{ name: "Picture 3" }] },
      { index: 2, shapes: [{ name: "TextBox 4", text: "Câu hỏi ôn tập" }] },
    ]);
    expect(s.map((x) => x.ref)).toEqual(["Slide 1", "Slide 3"]);
    expect(s[0]!.section).toBe("Slide 1: Quang hợp");
    expect(s[1]!.section).toBe("Slide 3: Câu hỏi ôn tập");
  });
});

describe("dấu vân tay và giới hạn", () => {
  it("đổi nội dung thì đổi dấu vân tay", () => {
    const a = [{ ref: "Đoạn 1", text: "abc" }];
    expect(fingerprint(a)).toBe(fingerprint([{ ref: "Đoạn 1", text: "abc" }]));
    expect(fingerprint(a)).not.toBe(fingerprint([{ ref: "Đoạn 1", text: "abd" }]));
    expect(fingerprint(a)).not.toBe(fingerprint([{ ref: "Đoạn 2", text: "abc" }]));
  });
  it("cắt phần vượt giới hạn gửi", () => {
    const segs = [{ ref: "a", text: "x".repeat(60) }, { ref: "b", text: "y".repeat(60) }, { ref: "c", text: "z".repeat(60) }];
    expect(capSegments(segs, 130).map((s) => s.ref)).toEqual(["a", "b"]);
  });
});

describe("từ Word đến câu trả lời", () => {
  it("giáo án nhiều chương: hỏi theo nội dung ra đúng đoạn và nhãn nguồn", () => {
    const fill = (n: number) => ({ text: `Ví dụ minh họa số ${n}, học sinh làm bài tập vận dụng ở nhà và ghi vào vở. `.repeat(20) });
    const paras = [
      { text: "Chương 1. Cơ học", level: 1 },
      { text: "Chuyển động đều là chuyển động có vận tốc không đổi theo thời gian." },
      fill(1), fill(2),
      { text: "Chương 2. Nhiệt học", level: 1 },
      { text: "Nhiệt lượng thu vào được tính bằng Q = m.c.Δt, c là nhiệt dung riêng." },
      fill(3), fill(4),
      { text: "Chương 3. Ánh sáng", level: 1 },
      { text: "Định luật phản xạ ánh sáng: góc phản xạ bằng góc tới." },
      fill(5), fill(6),
    ];
    const idx = buildIndex({ name: "Giao-an.docx", host: "word", segments: wordSegments(paras) });
    const hit = search(idx, "công thức nhiệt lượng thu vào", 1)[0]!.chunk;
    expect(hit.text).toContain("Q = m.c.Δt");
    expect(hit.section).toBe("Chương 2. Nhiệt học");
    const p = promptSection(idx, { text: "Nhiệt dung riêng là gì?" });
    expect(p).toMatch(/\[Đoạn \d+[^\]]*Chương 2/);
    expect(p).not.toContain("góc phản xạ bằng góc tới");
  });
});
