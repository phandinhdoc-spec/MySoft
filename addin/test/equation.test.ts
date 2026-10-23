import { describe, expect, it } from "vitest";
import { equationToOoxml, hasMath, latexToOmml, splitMath, textToParagraphsXml } from "../src/office/equation.js";

describe("công thức -> Equation của Word", () => {
  it("nhận ra công thức trong văn bản; giá tiền và chữ thường thì không", () => {
    expect(hasMath("Ta có $x^2 + 1$ nên")).toBe(true);
    expect(hasMath("$$\\frac{a}{b}$$")).toBe(true);
    expect(hasMath("\\ce{H2SO4}")).toBe(true);
    expect(hasMath("Mua $5 và $10 hôm nay")).toBe(false);
    expect(hasMath("Soạn giáo án bài 3")).toBe(false);
  });
  it("tách văn bản và công thức, giữ đúng thứ tự", () => {
    const segs = splitMath("Vận tốc $v = s/t$ đo bằng m/s");
    expect(segs.map((s) => s.kind)).toEqual(["text", "math", "text"]);
    expect(segs[1]).toMatchObject({ kind: "math", latex: "v = s/t", display: false });
  });
  it("LaTeX toán lý ra OMML", () => {
    const x = latexToOmml("\\frac{a}{b} + x^2");
    expect(x).toContain("<m:oMath");
    expect(x).toContain("<m:f>");
    expect(x).toContain("<m:sSup>");
  });
  it("công thức hóa học \\ce{} ra OMML, có chỉ số dưới; viết thiếu dấu gạch chéo vẫn được", () => {
    const x = latexToOmml("\\ce{CaCO3 -> CaO + CO2 ^}");
    expect(x).toContain("<m:oMath");
    expect(x).toContain("<m:sSub>");
    expect(latexToOmml("ce{H2SO4}")).toContain("<m:sSub>");
  });
  it("LaTeX sai cú pháp: latexToOmml báo lỗi (để công cụ báo lại cho model sửa)", () => {
    expect(() => latexToOmml("\\frac{a")).toThrow();
  });
  it("văn bản có công thức giữa dòng thành đoạn chứa oMath; công thức sai vẫn giữ nguyên chữ, không mất", () => {
    const ok = textToParagraphsXml("Ta có $E = mc^2$.\nHết.");
    expect(ok).toContain("<m:oMath");
    expect(ok.match(/<w:p>/g)).toHaveLength(2);
    const bad = textToParagraphsXml("Lỗi $\\frac{a$ rồi");
    expect(bad).toContain("\\frac{a");
  });
  it("gói OOXML của một công thức: bỏ dấu $ thừa, là công thức đứng riêng, có đủ phần tử gói", () => {
    const pkg = equationToOoxml("$$x^2$$");
    expect(pkg).toContain("<m:oMathPara>");
    expect(pkg).toContain("/word/document.xml");
    expect(pkg).not.toContain("$$");
  });
});
