import { describe, expect, it } from "vitest";
import { duplicateMode, exportModes, parseModesImport, resolveMode, sanitizeCustomMode, WRITING_MODES } from "../src/modes.js";

describe("chế độ viết tự tạo", () => {
  it("làm sạch: gọn khoảng trắng ở tên, bỏ mức suy nghĩ lạ, kẹp nhiệt độ, giữ xuống dòng trong chỉ dẫn", () => {
    const r = sanitizeCustomMode({ id: "c-abc123", name: "  Đề\n 15  phút ", instructions: "Dòng 1\r\nDòng 2", effort: "turbo", temperature: 7 });
    expect(r.ok && r.mode).toEqual({ id: "c-abc123", name: "Đề 15 phút", instructions: "Dòng 1\nDòng 2", temperature: 1 });
  });
  it("mã không đúng dạng (kể cả trùng chế độ có sẵn) bị bỏ, nơi lưu cấp mã mới", () => {
    const r = sanitizeCustomMode({ id: "academic", name: "A", instructions: "x" });
    expect(r.ok && r.mode.id).toBe("");
  });
  it("báo lỗi dễ hiểu khi thiếu tên, thiếu chỉ dẫn, chỉ dẫn quá dài", () => {
    expect(sanitizeCustomMode({ instructions: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("đặt tên") });
    expect(sanitizeCustomMode({ name: "A" })).toMatchObject({ ok: false, error: expect.stringContaining("chưa có chỉ dẫn") });
    expect(sanitizeCustomMode({ name: "A", instructions: "a".repeat(4001) })).toMatchObject({ ok: false, error: expect.stringContaining("quá dài") });
  });
  it("xuất rồi nhập lại được (không kèm mã)", () => {
    const json = exportModes([{ id: "c-abc123", name: "A", instructions: "AAA", effort: "low" }]);
    expect(json).not.toContain("c-abc123");
    expect(parseModesImport(JSON.parse(json)).modes).toEqual([{ id: "", name: "A", instructions: "AAA", effort: "low" }]);
    expect(parseModesImport([{ name: "B", instructions: "B" }]).modes).toHaveLength(1);
    expect(parseModesImport(42).errors[0]).toContain("không có chế độ");
  });
  it("tra chế độ có sẵn và tự tạo; nhân bản giữ chỉ dẫn, mức suy nghĩ, nhiệt độ", () => {
    const custom = [{ id: "c-zzz999", name: "Z", instructions: "ZZZ", temperature: 0.4 }];
    expect(resolveMode("exact", custom)).toBe(WRITING_MODES.exact);
    expect(resolveMode("c-zzz999", custom)?.instructions).toBe("ZZZ");
    expect(resolveMode("c-none00", custom)).toBeUndefined();
    const d = duplicateMode("exact", "Chính xác (bản sao)");
    expect(d).toMatchObject({ id: "", name: "Chính xác (bản sao)", effort: "medium", temperature: 0, from: "exact", instructions: WRITING_MODES.exact.instructions });
    expect(duplicateMode("standard", "S")?.instructions.length).toBeGreaterThan(0);
  });
});
