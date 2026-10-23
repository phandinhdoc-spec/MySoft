import { describe, expect, it } from "vitest";
import { parseCitation, parseRef } from "../src/office/goto";

describe("nhãn nguồn", () => {
  it("nhận đoạn, khoảng đoạn, slide, vùng ô (có và không có nháy)", () => {
    expect(parseRef("Đoạn 12")).toEqual({ kind: "para", from: 12, to: 12 });
    expect(parseRef("Đoạn 12–15")).toEqual({ kind: "para", from: 12, to: 15 });
    expect(parseRef("Đoạn 12-15")).toEqual({ kind: "para", from: 12, to: 15 });
    expect(parseRef("Slide 3")).toEqual({ kind: "slide", n: 3 });
    expect(parseRef("Sheet1!A5:F20")).toEqual({ kind: "range", sheet: "Sheet1", address: "A5:F20" });
    expect(parseRef("'Điểm HK1'!B5:E7")).toEqual({ kind: "range", sheet: "Điểm HK1", address: "B5:E7" });
    expect(parseRef("'O''Neil'!A1")).toEqual({ kind: "range", sheet: "O'Neil", address: "A1" });
  });
  it("từ chối thứ không phải nhãn", () => {
    for (const bad of ["Đoạn 0", "Đoạn 15–12", "Slide 0", "Đoạn", "Điều 5", "SUM(A1:A3)", "Sheet1!A", "javascript:alert(1)", ""]) expect(parseRef(bad)).toBeUndefined();
  });
  it("trích dẫn nhiều nhãn trong một cặp ngoặc", () => {
    expect(parseCitation("Đoạn 3; Đoạn 9")).toEqual(["Đoạn 3", "Đoạn 9"]);
    expect(parseCitation("Slide 2, Slide 5")).toEqual(["Slide 2", "Slide 5"]);
    expect(parseCitation("Đoạn 3; ghi chú")).toBeUndefined();
    expect(parseCitation("1")).toBeUndefined();
  });
});
