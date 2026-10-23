import { describe, expect, it } from "vitest";
import { diffSigs, looksMathy, type ParaSig } from "../src/beautify.js";

describe("looksMathy", () => {
  it.each(["Tính x^2 + 3x = 0", "Nước H2O và CO2", "v = s/t", "Fe + O2 -> Fe2O3", "Điện trở R₁ = 6 Ω", "sin(x) + cos(x)"])("nhận %s", (t) => expect(looksMathy(t)).toBe(true));
  it.each(["Họ và tên học sinh", "Hôm nay trời đẹp.", "Đã có $x^2$ rồi", ""])("bỏ qua %s", (t) => expect(looksMathy(t)).toBe(false));
});

const p = (text: string, o: Partial<ParaSig> = {}): ParaSig => ({ text, size: 13, align: "Justified", bold: false, ...o });

describe("diffSigs", () => {
  it("giống nhau → không sửa", () => {
    const a = [p("A"), p("B")];
    expect(diffSigs(a, a.map((x) => ({ ...x }))).edited).toBe(false);
  });
  it("gom thay đổi định dạng theo kiểu, không chứa chữ văn bản", () => {
    const a = [p("Tiêu đề bí mật", { size: 14 }), p("Nội dung một"), p("Nội dung hai")];
    const b = [p("Tiêu đề bí mật", { size: 14, align: "Centered" }), p("Nội dung một", { size: 12 }), p("Nội dung hai", { size: 12 })];
    const d = diffSigs(a, b);
    expect(d.edited).toBe(true);
    expect(d.changes).toContain("cỡ chữ: 13 → 12 (2 đoạn)");
    expect(d.changes.join(" ")).not.toMatch(/bí mật|Nội dung/);
  });
  it("đếm đoạn thêm, xóa, sửa chữ, Equation bị đổi", () => {
    const a = [p("a1", { eq: true }), p("b2"), p("c3")];
    const b = [p("a1", { eq: false }), p("b2 đã sửa"), p("d4"), p("e5")];
    const d = diffSigs(a, b).changes.join("|");
    expect(d).toMatch(/Equation bị đổi lại/);
    expect(d).toMatch(/sửa lại chữ/);
  });
});
