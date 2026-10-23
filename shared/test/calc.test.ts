import { describe, expect, it } from "vitest";
import { calc, check, CalcError } from "../src/calc.js";

describe("office_calc: số chính xác", () => {
  it("0,1 + 0,2 đúng 0,3 (không sai số nổi)", () => {
    expect(calc("0.1+0.2").value).toBe("0.3");
    expect(calc("1.1*1.1").value).toBe("1.21");
    expect(calc("0.1*3").value).toBe("0.3");
  });
  it("thứ tự phép tính, ngoặc, mũ, âm", () => {
    expect(calc("2+3*4").value).toBe("14");
    expect(calc("(2+3)*4").value).toBe("20");
    expect(calc("2^10").value).toBe("1024");
    expect(calc("2^-2").value).toBe("0.25");
    expect(calc("-2^2").value).toBe("-4");
    expect(calc("10-2-3").value).toBe("5");
    expect(calc("2^3^2").value).toBe("512");
  });
  it("phần trăm: 15% = 0,15", () => {
    expect(calc("200000*15%").value).toBe("30000");
    expect(calc("1500000+1500000*10%").value).toBe("1650000");
  });
  it("chia không hữu hạn: giữ phân số, chỉ làm tròn ở bước cuối", () => {
    const r = calc("10/3");
    expect(r.exact).toBe(false);
    expect(r.fraction).toBe("10/3");
    expect(r.value.startsWith("3.3333333333")).toBe(true);
    expect(calc("10/3*3").value).toBe("10");
    expect(calc("10/3", { round: 2 }).value).toBe("3.33");
    expect(calc("1/3+1/3+1/3").value).toBe("1");
  });
  it("làm tròn: nửa lên, nửa chẵn, cắt, lên; âm; hàng chục", () => {
    expect(calc("2.5", { round: 0 }).value).toBe("3");
    expect(calc("2.5", { round: 0, mode: "half_even" }).value).toBe("2");
    expect(calc("3.5", { round: 0, mode: "half_even" }).value).toBe("4");
    expect(calc("-2.5", { round: 0 }).value).toBe("-3");
    expect(calc("2.99", { round: 0, mode: "down" }).value).toBe("2");
    expect(calc("2.01", { round: 0, mode: "up" }).value).toBe("3");
    expect(calc("1.005", { round: 2 }).value).toBe("1.01"); // số thực dấu phẩy động sẽ cho 1.00
    expect(calc("1234", { round: -1 }).value).toBe("1230");
    expect(calc("round(8.125, 2, half_even)").value).toBe("8.12");
    expect(calc("round(8.125, 2)").value).toBe("8.13");
  });
  it("hàm: sum, avg, min, max, abs, floor, ceil", () => {
    expect(calc("sum(1.5, 2.5, 3)").value).toBe("7");
    expect(calc("avg(7, 8, 9.5)", { round: 2 }).value).toBe("8.17");
    expect(calc("min(3, -1, 2)").value).toBe("-1");
    expect(calc("max(3, -1, 2)").value).toBe("3");
    expect(calc("abs(-4.2)").value).toBe("4.2");
    expect(calc("floor(-1.5)").value).toBe("-2");
    expect(calc("ceil(-1.5)").value).toBe("-1");
    expect(calc("ceil(1.2)").value).toBe("2");
  });
  it("số lớn không mất chữ số", () => {
    expect(calc("123456789012345678*10").value).toBe("1234567890123456780");
    expect(calc("9007199254740993+1").value).toBe("9007199254740994");
  });
  it("kiểu Việt Nam", () => {
    expect(calc("1234567.5").vi).toBe("1.234.567,5");
    expect(calc("-1000").vi).toBe("-1.000");
  });
  it("gạch dưới nhóm số, ký tự × ÷", () => {
    expect(calc("1_000_000*2").value).toBe("2000000");
    expect(calc("6×7").value).toBe("42");
    expect(calc("8÷4").value).toBe("2");
  });
  it("lỗi dễ hiểu; không chạy mã", () => {
    expect(() => calc("1/0")).toThrow(CalcError);
    expect(() => calc("1,5+2")).toThrow(CalcError);
    expect(() => calc("2+")).toThrow(CalcError);
    expect(() => calc("(2+3")).toThrow(CalcError);
    expect(() => calc("foo(1)")).toThrow(/Hàm không có/);
    expect(() => calc("process.exit(1)")).toThrow(CalcError);
    expect(() => calc("1;2")).toThrow(CalcError);
    expect(() => calc("2^0.5")).toThrow(/số mũ nguyên/);
    expect(() => calc("pi")).toThrow(CalcError);
    expect(() => calc("9^9999")).toThrow(CalcError);
    expect(() => calc("x".repeat(3000))).toThrow(/quá dài/);
  });
});

describe("office_calc_check", () => {
  it("báo đúng mục lệch và số đúng", () => {
    const r = check([
      { label: "Tổng cột B", expr: "sum(120000, 85000, 40000)", expected: 245000 },
      { label: "VAT 10%", expr: "245000*10%", expected: "24500" },
      { label: "Tổng thanh toán", expr: "245000+24500", expected: 270000 },
    ]);
    expect(r.checked).toBe(3);
    expect(r.mismatches).toBe(1);
    const bad = r.results.find((x) => !x.match)!;
    expect(bad.label).toBe("Tổng thanh toán");
    expect(bad.computed).toBe("269500");
    expect(bad.diff).toBe("-500");
  });
  it("so theo chữ số làm tròn của tài liệu", () => {
    expect(check([{ expr: "10/3", expected: "3.33" }], { round: 2 }).mismatches).toBe(0);
    expect(check([{ expr: "10/3", expected: "3.3" }], { round: 2 }).mismatches).toBe(1);
  });
  it("biểu thức hỏng không làm cả đợt hỏng", () => {
    const r = check([{ expr: "1/0", expected: 1 }, { expr: "1+1", expected: 2 }]);
    expect(r.mismatches).toBe(1);
    expect(r.results[0]!.error).toBeTruthy();
    expect(r.results[1]!.match).toBe(true);
  });
});

describe("hàm thống kê cho chế độ Kế toán", () => {
  const v = (e: string, round?: number) => calc(e, { round }).value;
  it("median, count", () => {
    expect(v("median(7, 9, 5)")).toBe("7");
    expect(v("median(4, 8, 6, 10)")).toBe("7");
    expect(v("count(1, 2, 3, 4)")).toBe("4");
  });
  it("phương sai, độ lệch chuẩn như Excel", () => {
    expect(v("var_p(2, 4, 4, 4, 5, 5, 7, 9)")).toBe("4");
    expect(v("stdev_p(2, 4, 4, 4, 5, 5, 7, 9)")).toBe("2");
    expect(v("var_s(1, 2, 3, 4)", 4)).toBe("1.6667");
    expect(v("stdev_s(1, 2, 3, 4)", 6)).toBe("1.290994");
    expect(v("sqrt(2.25)")).toBe("1.5");
    expect(v("sqrt(2)", 10)).toBe("1.4142135624");
    expect(() => calc("sqrt(-1)")).toThrow();
  });
  it("trung bình có hệ số, phần trăm, xếp hạng, đếm theo ngưỡng", () => {
    // ĐTB môn: thường xuyên 8, 7 (hệ số 1), giữa kỳ 6.5 (hệ số 2), cuối kỳ 9 (hệ số 3)
    expect(v("wavg(8, 1, 7, 1, 6.5, 2, 9, 3)", 1)).toBe("7.9");
    expect(v("percent(27, 40)")).toBe("67.5");
    expect(v("rank(8, 9, 8, 8, 6)")).toBe("2");
    expect(v("rank(6, 9, 8, 8, 6)")).toBe("4");
    expect(v("count_ge(5, 4.5, 5, 7, 3, 8)")).toBe("3");
    expect(v("count_lt(5, 4.5, 5, 7, 3, 8)")).toBe("2");
    expect(() => calc("wavg(8, 1, 7)")).toThrow();
    expect(() => calc("rank(10, 9, 8)")).toThrow();
  });
});
