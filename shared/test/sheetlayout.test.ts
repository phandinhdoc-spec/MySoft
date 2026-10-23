import { describe, expect, it } from "vitest";
import { diffRoleSigs } from "../src/beautify.js";
import { planSheet, type MergeArea } from "../src/sheetlayout.js";

// Sổ điểm như ảnh: 5 dòng tiêu đề, 1 dòng trống, đầu bảng hai tầng (ĐĐGtx gộp 5 cột, STT gộp dọc), dữ liệu từ hàng 9.
const empty = (n: number) => Array.from({ length: n }, () => "");
const row = (cells: Record<number, unknown>, n = 16) => Object.assign(empty(n), cells) as unknown[];
const values: unknown[][] = [
  row({ 0: "UBND  PHƯỜNG HẠNH THÔNG" }),
  row({ 0: "TRƯỜNG THCS PHAN VĂN TRỊ" }),
  row({ 0: "BẢNG ĐIỂM HỌC KỲ" }),
  row({ 0: "Năm học: 2026-2027 - Học kỳ: I" }),
  row({ 0: "Môn học: KHOA HỌC TỰ NHIÊN - GV: Phan Anh" }),
  row({}),
  row({ 0: "STT", 1: "Mã định danh Bộ GD&ĐT", 2: "Họ và tên", 3: "Ngày sinh", 4: "Giới tính", 5: "ĐĐGtx", 10: "ĐĐGgk", 11: "ĐĐGck", 12: "ĐTBmhk1", 13: "ĐTBmhk2", 14: "ĐTBmcn" }),
  row({ 5: 1, 6: 2, 7: 3, 8: 4, 9: 5 }),
  row({ 0: 1, 1: "7924028325", 2: "Võ Minh A", 3: "17/09/2012", 4: "Nam", 5: 8, 6: 9, 7: 7.5, 10: 8.5, 11: 9, 12: 8.7, 13: 8.9, 14: 8.8 }),
  row({ 0: 2, 1: "7924028326", 2: "Lê Thị B", 3: "02/03/2012", 4: "Nữ", 5: 7, 6: 8, 10: 7.5, 11: 8, 12: 7.6, 13: 7.8, 14: 7.7 }),
  row({ 0: 3, 1: "7924028327", 2: "Trần C", 3: "11/11/2012", 4: "Nam", 5: 6, 10: 6.5, 11: 7, 12: 6.6, 13: 6.9, 14: 6.8 }),
];
const merges: MergeArea[] = [
  { r1: 6, c1: 0, r2: 7, c2: 0 },
  { r1: 6, c1: 1, r2: 7, c2: 1 },
  { r1: 6, c1: 2, r2: 7, c2: 2 },
  { r1: 6, c1: 5, r2: 6, c2: 9 },
];

describe("planSheet: sổ điểm hai tầng đầu bảng", () => {
  const p = planSheet(values, merges);
  it("khối tiêu đề và đầu bảng hai tầng", () => {
    expect(p.titleRows).toEqual([0, 4]);
    expect(p.titleRoles).toEqual(["org", "org", "title", "sub", "sub"]);
    expect(p.headerRows).toEqual([6, 7]);
  });
  it("dữ liệu bắt đầu sau tầng đầu bảng thứ hai", () => {
    expect(p.dataStart).toBe(8);
    expect(p.dataEnd).toBe(10);
    expect(p.totalRow).toBeNull();
  });
  it("loại cột", () => {
    expect(p.colKinds[0]).toBe("stt");
    expect(p.colKinds[2]).toBe("text");
    expect(p.colKinds[3]).toBe("date");
    expect(p.colKinds[5]).toBe("score");
    expect(p.colKinds[12]).toBe("score");
    expect(p.nameCol).toBe(2);
  });
  it("không có ô gộp (bản bị dẹt) vẫn nhận tầng đánh số 1..5", () => {
    const flat = planSheet(values, []);
    expect(flat.headerRows).toEqual([6, 7]);
  });
});

describe("planSheet: bảng không có tiêu đề, có dòng tổng", () => {
  const v: unknown[][] = [
    ["Lớp", "Sĩ số", "Giỏi", "Khá"],
    ["9A", 40, 20, 15],
    ["9B", 38, 18, 16],
    ["Tổng", 78, 38, 31],
  ];
  const p = planSheet(v);
  it("đầu bảng ở hàng 0, tổng ở cuối", () => {
    expect(p.titleRows).toBeNull();
    expect(p.headerRows).toEqual([0, 0]);
    expect(p.dataStart).toBe(1);
    expect(p.dataEnd).toBe(2);
    expect(p.totalRow).toBe(3);
  });
});

describe("diffRoleSigs", () => {
  it("nêu rõ vai trò và thuộc tính đổi", () => {
    const d = diffRoleSigs([{ role: "đầu bảng", font: "Cambria", bold: true }, { role: "dữ liệu", align: "Center" }], [{ role: "đầu bảng", font: "Arial", bold: true }, { role: "dữ liệu", align: "Left" }]);
    expect(d.changes).toEqual(["đầu bảng: phông chữ Cambria → Arial", "dữ liệu: căn lề Center → Left"]);
    expect(d.edited).toBe(true);
  });
});
