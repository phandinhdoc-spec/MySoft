import { describe, expect, it } from "vitest";
import { splitMath } from "@pvta/shared";
import { mathToHtml } from "../src/mathRender.js";
import { textToParagraphsXml } from "../src/office/equation.js";

// Các dòng lời giải của đề HSG Vật lí viết theo quy ước mới: chữ ngoài dấu $, công thức trong $…$.
const LINES = [
  "Khi tăng hiệu điện thế 1,5 lần: $I' = 1{,}5 \\cdot I = 1{,}5 \\cdot 2 = 3\\ \\text{A}$.",
  "Phần trăm khối lượng carbon: $\\%m_{C} = \\frac{12 \\cdot 4}{58} \\cdot 100\\% \\approx 82{,}76\\%$",
  "$$T = \\frac{F}{\\sin\\alpha} = \\frac{100}{\\sin 30^\\circ} = 200\\ \\text{N}$$",
  "Phương trình: $\\ce{(C17H35COO)3C3H5 + 3NaOH -> 3C17H35COONa + C3H5(OH)3}$",
  "Khối lượng riêng $D = \\frac{m}{V} = \\frac{4000}{0{,}5} = 8000\\ \\text{kg/m}^3$.",
  "Điện trở $R_{34} = \\frac{R_3 \\cdot R_4}{R_3 + R_4} = 3\\ \\Omega$ nên $R_{234} = 12\\ \\Omega$.",
];

describe("công thức trong khung chat", () => {
  it("LaTeX hợp lệ ra phần tử <math> sạch", () => {
    const h = mathToHtml("\\frac{U}{R}", false)!;
    expect(h.startsWith("<math")).toBe(true);
    expect(h).toContain("<mfrac>");
    expect(mathToHtml("\\frac{U}{R}", true)).toContain('display="block"');
  });
  it("công thức sai thì trả undefined (giữ nguyên chữ gốc), không ném lỗi", () => {
    expect(mathToHtml("\\frac{a", false)).toBeUndefined();
    expect(mathToHtml("\\unknowncommand{x}", false)).toBeUndefined();
  });
  it("hóa học \\ce{} vẽ được, kể cả viết thiếu dấu gạch chéo", () => {
    expect(mathToHtml("\\ce{CaCO3 -> CaO + CO2 ^}", false)).toContain("<math");
    expect(mathToHtml("ce{H2SO4}", false)).toContain("<math");
  });
  it("không để lọt mã chạy được: chữ trong công thức bị thoát", () => {
    const h = mathToHtml("\\text{<script>alert(1)</script>}", false);
    expect(h === undefined || !/<script/i.test(h)).toBe(true);
    expect(mathToHtml("\\href{javascript:alert(1)}{x}", false) === undefined || !/javascript:/i.test(mathToHtml("\\href{javascript:alert(1)}{x}", false)!)).toBe(true);
  });
  it("mọi dòng lời giải mẫu: tách được công thức và vẽ được hết", () => {
    for (const line of LINES) {
      const maths = splitMath(line).filter((s) => s.kind === "math");
      expect(maths.length).toBeGreaterThan(0);
      for (const m of maths) expect(m.kind === "math" && mathToHtml(m.latex, m.display), line).toBeTruthy();
    }
  });
});

describe("công thức khi chèn vào Word", () => {
  it("mọi dòng lời giải mẫu thành Equation (oMath), không còn mã LaTeX", () => {
    for (const line of LINES) {
      const xml = textToParagraphsXml(line);
      expect(xml, line).toContain("<m:oMath");
      expect(xml, line).not.toContain("\\frac");
      expect(xml, line).not.toContain("\\text");
    }
  });
  it("công thức đứng riêng $$…$$ là đoạn căn giữa (oMathPara)", () => {
    expect(textToParagraphsXml(LINES[2]!)).toContain("<m:oMathPara>");
  });
});
