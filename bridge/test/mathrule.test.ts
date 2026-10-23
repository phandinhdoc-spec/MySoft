import { describe, expect, it } from "vitest";
import { mathRule, rulesText } from "../src/prompts.js";
import { writeSystem } from "../src/writing.js";

describe("dặn model cách viết công thức", () => {
  it("Word: LaTeX giữa dấu $, tự thành Equation, có \\ce{}, đơn vị trong \\text{}", () => {
    const r = mathRule("word");
    expect(r).toContain("$…$");
    expect(r).toContain("Equation chuẩn của Word");
    expect(r).toContain("\\ce{");
    expect(r).toContain("\\text{A}");
    expect(r).toContain("office_word_insert_equation");
  });
  it("Excel/PowerPoint: không LaTeX trong ô/slide", () => {
    for (const h of ["excel", "powerpoint"] as const) {
      expect(mathRule(h)).toContain("KHÔNG dùng LaTeX");
      expect(mathRule(h)).not.toContain("Equation chuẩn của Word");
    }
  });
  it("có mặt trong lời nhắc hệ thống của chat và của công cụ viết", () => {
    expect(rulesText("word", "vi", "")).toContain("CÔNG THỨC (toán, lý, hóa)");
    expect(writeSystem({ host: "word", lang: "vi", style: "" })).toContain("Equation của Word");
    expect(writeSystem({ host: "excel", lang: "vi", style: "" })).toContain("không dùng LaTeX");
  });
});
