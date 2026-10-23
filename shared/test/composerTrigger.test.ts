import { describe, expect, it } from "vitest";
import { applyPick, detectTrigger, dirOf, foldVi, matchesQuery, nextPlaceholder, pathToken, TRIGGER_HINT, TRIGGERS } from "../src/composerTrigger";

describe("composer triggers", () => {
  it("shows the exact hint text", () => {
    expect(TRIGGER_HINT).toBe("Gõ @ để liệt kê các lệnh mẫu, gõ / để liệt kê các kỹ năng, gõ # để liệt kê các quy tắc, gõ $ để chọn tệp, gõ $$ để chọn thư mục.");
    expect(Object.keys(TRIGGERS)).toEqual(["@", "/", "#", "$", "$$"]);
  });
  it("opens only at the start of a word", () => {
    expect(detectTrigger("@gia", 4)).toEqual({ char: "@", query: "gia", start: 0, end: 4 });
    expect(detectTrigger("Soạn bài /", 10)).toEqual({ char: "/", query: "", start: 9, end: 10 });
    expect(detectTrigger("xem (#quy", 9)).toMatchObject({ char: "#", query: "quy", start: 5 });
    expect(detectTrigger("12/10", 5)).toBeNull();
    expect(detectTrigger("a@b.vn", 6)).toBeNull();
    expect(detectTrigger("và/hoặc", 7)).toBeNull();
    expect(detectTrigger("@gia an", 7)).toBeNull();       // đã có khoảng trắng: đóng
    expect(detectTrigger("abc", 3)).toBeNull();
  });
  it("uses the text before the caret", () => {
    expect(detectTrigger("giữa @gi và sau", 8)).toEqual({ char: "@", query: "gi", start: 5, end: 8 });
  });
  it("inserts a prompt and selects its first placeholder", () => {
    const m = detectTrigger("Làm giúp @gia", 13)!;
    const r = applyPick("Làm giúp @gia", m, { kind: "prompts", value: "Soạn giáo án bài [tên bài] lớp [lớp]." });
    expect(r.text).toBe("Làm giúp Soạn giáo án bài [tên bài] lớp [lớp].");
    expect(r.text.slice(...r.selection!)).toBe("[tên bài]");
    expect(r.caret).toBe(r.selection![1]);
    const plain = applyPick("@x", detectTrigger("@x", 2)!, { kind: "prompts", value: "Không có chỗ trống" });
    expect(plain.selection).toBeUndefined();expect(plain.caret).toBe("Không có chỗ trống".length);
  });
  it("inserts a skill or rule name followed by a space, without doubling it", () => {
    expect(applyPick("/off", detectTrigger("/off", 4)!, { kind: "skills", value: "office-word" })).toEqual({ text: "/office-word ", caret: 13 });
    expect(applyPick("Dùng #qu cho đề", detectTrigger("Dùng #qu", 8)!, { kind: "rules", value: "quy-tac-a" })).toEqual({ text: "Dùng #quy-tac-a cho đề", caret: 16 });
  });
  it("jumps between [placeholders] but ignores plain brackets", () => {
    const t = "Bài [tên bài], lớp [lớp] [1]";
    expect(nextPlaceholder(t, 0)).toEqual([4, 13]);
    expect(nextPlaceholder(t, 13)).toEqual([19, 24]);
    expect(nextPlaceholder(t, 24)).toBeNull();
    expect(nextPlaceholder("[]", 0)).toBeNull();
  });
  it("searches without regard to accents", () => {
    expect(foldVi("Giáo án Đề")).toBe("giao an de");
    expect(matchesQuery("Giáo án theo Công văn 5512", "giao an")).toBe(true);
    expect(matchesQuery("Giáo án", "de thi")).toBe(false);
    expect(matchesQuery("Đề kiểm tra", "")).toBe(true);
  });
  it("opens $ for files and $$ for folders, only at the start of a word", () => {
    expect(detectTrigger("$", 1)).toEqual({ char: "$", query: "", start: 0, end: 1 });
    expect(detectTrigger("Đọc $giao", 9)).toEqual({ char: "$", query: "giao", start: 4, end: 9 });
    expect(detectTrigger("$$", 2)).toEqual({ char: "$$", query: "", start: 0, end: 2 });
    expect(detectTrigger("Xem $$du-an", 11)).toEqual({ char: "$$", query: "du-an", start: 4, end: 11 });
    expect(detectTrigger("US$5", 4)).toBeNull();
    expect(detectTrigger("$$$", 3)).toBeNull();
    expect(TRIGGERS.$.kind).toBe("files");
    expect(TRIGGERS.$$.kind).toBe("folders");
  });
  it("inserts a file or folder as plain text followed by a space", () => {
    const f = applyPick("Tóm tắt $giao", detectTrigger("Tóm tắt $giao", 13)!, { kind: "files", value: "giao-an.docx" });
    expect(f).toEqual({ text: "Tóm tắt giao-an.docx ", caret: 21 });
    const d = applyPick("Quét $$du cho kỹ", detectTrigger("Quét $$du", 9)!, { kind: "folders", value: "/Users/a/Dự án" });
    expect(d.text).toBe("Quét /Users/a/Dự án cho kỹ");
  });
  it("quotes names with spaces and finds parent folders", () => {
    expect(pathToken("a.docx")).toBe("a.docx");
    expect(pathToken("Giáo án 1.docx")).toBe("`Giáo án 1.docx`");
    expect(pathToken("/x/y z")).toBe("`/x/y z`");
    expect(dirOf("/Users/a/b.docx")).toBe("/Users/a");
    expect(dirOf("C:\\Dự án\\b.docx")).toBe("C:\\Dự án");
    expect(dirOf("b.docx")).toBe("");
  });
});
