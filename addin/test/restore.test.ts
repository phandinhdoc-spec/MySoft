import { describe, expect, it } from "vitest";
import { sameTexts } from "../src/office/restore";

describe("so khớp chữ sau khi hoàn tác", () => {
  it("bỏ qua đoạn trống ở cuối và khoảng trắng cuối đoạn", () => {
    expect(sameTexts(["A", "B"], ["A", "B", ""])).toBe(true);
    expect(sameTexts(["A ", "B"], ["A", "B"])).toBe(true);
  });
  it("khác chữ hoặc khác số đoạn thì báo không khớp", () => {
    expect(sameTexts(["A", "B"], ["A", "C"])).toBe(false);
    expect(sameTexts(["A", "B"], ["A"])).toBe(false);
    expect(sameTexts(["A", "", "B"], ["A", "B"])).toBe(false);
  });
});
