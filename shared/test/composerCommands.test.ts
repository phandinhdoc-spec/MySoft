import { describe, expect, it } from "vitest";
import {
  parseComposerCommand,
  resolveTarget,
  skillMarkdownFor,
  skillSlugFromInput,
  takeTarget,
  type ComposerCommand,
} from "../src/composerCommands";

const cmd = (input: string): ComposerCommand => {
  const r = parseComposerCommand(input);
  if (!r || !("command" in r)) throw new Error(`không phải lệnh hợp lệ: ${input} → ${JSON.stringify(r)}`);
  return r.command;
};

describe("lệnh quy tắc bằng #", () => {
  it("thêm quy tắc, tách tiêu đề khi có dấu hai chấm", () => {
    expect(cmd("#thêm Giọng gần gũi: Xưng “thầy cô”, câu ngắn")).toEqual({
      kind: "rule",
      op: "add",
      title: "Giọng gần gũi",
      text: "Xưng “thầy cô”, câu ngắn",
    });
  });

  it("thêm quy tắc không có tiêu đề thì lấy 8 từ đầu làm tên", () => {
    const c = cmd("#them Luôn dùng câu ngắn và rõ ràng cho học sinh lớp sáu đọc");
    expect(c).toMatchObject({ kind: "rule", op: "add" });
    expect((c as { title: string }).title).toBe("Luôn dùng câu ngắn và rõ ràng cho");
  });

  it("nhận không dấu và không phân biệt hoa thường", () => {
    expect(cmd("#SUA 2 nội dung mới")).toEqual({ kind: "rule", op: "edit", target: "2", text: "nội dung mới" });
    expect(cmd("#xoa giong-gan-gui")).toEqual({ kind: "rule", op: "delete", target: "giong-gan-gui" });
  });

  it("sửa: mục tiêu có thể nằm trong ngoặc kép", () => {
    expect(cmd('#sửa "Giọng gần gũi" Xưng “con”')).toEqual({
      kind: "rule",
      op: "edit",
      target: "Giọng gần gũi",
      text: "Xưng “con”",
    });
  });

  it("liệt kê bằng #liệt kê hoặc #danh sách", () => {
    expect(cmd("#liệt kê")).toEqual({ kind: "rule", op: "list" });
    expect(cmd("#danh sách")).toEqual({ kind: "rule", op: "list" });
  });

  it("báo lỗi khi thiếu nội dung", () => {
    expect(parseComposerCommand("#thêm")).toMatchObject({ error: expect.stringContaining("Thiếu nội dung") });
    expect(parseComposerCommand("#sửa 1")).toMatchObject({ error: expect.stringContaining("Thiếu nội dung mới") });
  });

  it("từ khóa không phải lệnh thì coi như tin nhắn thường", () => {
    expect(parseComposerCommand("#giọng-gần-gũi viết giúp tôi bài này")).toBeNull();
  });
});

describe("lệnh kỹ năng bằng /kỹ-năng", () => {
  it("thêm kỹ năng và chuẩn hóa tên", () => {
    expect(cmd("/kỹ-năng thêm Soạn-đề-KHTN-lớp-8 Ma trận và đặc tả")).toEqual({
      kind: "skill",
      op: "add",
      name: "soan-de-khtn-lop-8",
      description: "Ma trận và đặc tả",
    });
  });

  it("chấp nhận cách viết kỹ năng có khoảng trắng", () => {
    expect(cmd("/ky nang liệt kê")).toEqual({ kind: "skill", op: "list" });
  });

  it("sửa và xóa theo tên", () => {
    expect(cmd("/kỹ-năng sửa soan-de-khtn")).toEqual({ kind: "skill", op: "edit", target: "soan-de-khtn" });
    expect(cmd("/kỹ-năng xóa soan-de-khtn")).toEqual({ kind: "skill", op: "delete", target: "soan-de-khtn" });
  });

  it("từ chối tiền tố dành cho PVTA", () => {
    expect(parseComposerCommand("/kỹ-năng thêm pvta-moi Mô tả")).toMatchObject({
      error: expect.stringContaining("pvta-"),
    });
  });

  it("thiếu mô tả thì báo lỗi", () => {
    expect(parseComposerCommand("/kỹ-năng thêm ten-moi")).toMatchObject({ error: expect.stringContaining("Thiếu tên hoặc mô tả") });
  });

  it("đường dẫn hoặc lệnh khác dấu / thì không phải lệnh kỹ năng", () => {
    expect(parseComposerCommand("/office-giao-an Soạn giáo án")).toBeNull();
    expect(parseComposerCommand("12/10 là ngày gì")).toBeNull();
  });
});

describe("phạm vi nhận lệnh", () => {
  it("không nhận tin nhiều dòng hoặc tin nhắn thường", () => {
    expect(parseComposerCommand("#thêm dòng một\ndòng hai")).toBeNull();
    expect(parseComposerCommand("Soạn bài cho tôi")).toBeNull();
    expect(parseComposerCommand("   ")).toBeNull();
  });

  it("bỏ khoảng trắng đầu và cuối", () => {
    expect(cmd("   #liệt kê   ")).toEqual({ kind: "rule", op: "list" });
  });
});

describe("tìm mục để sửa hoặc xóa", () => {
  const items = [
    { key: "giong-gan-gui", title: "Giọng gần gũi" },
    { key: "trinh-bay-de", title: "Trình bày đề kiểm tra" },
    { key: "de-ngan", title: "Đề ngắn" },
  ];

  it("số thứ tự bắt đầu từ 1", () => {
    expect(resolveTarget(items, "2")).toEqual({ ok: true, index: 1 });
  });

  it("số ngoài danh sách thì báo lỗi", () => {
    expect(resolveTarget(items, "9")).toMatchObject({ ok: false, error: expect.stringContaining("số 9") });
  });

  it("khóa hoặc tên chính xác, không phân biệt dấu", () => {
    expect(resolveTarget(items, "#giong-gan-gui")).toEqual({ ok: true, index: 0 });
    expect(resolveTarget(items, "trinh bay de kiem tra")).toEqual({ ok: true, index: 1 });
  });

  it("chuỗi con khớp duy nhất thì chọn", () => {
    expect(resolveTarget(items, "gần gũi")).toEqual({ ok: true, index: 0 });
  });

  it("nhiều mục khớp thì không tự chọn", () => {
    const r = resolveTarget(items, "de");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("khớp");
  });

  it("không tìm thấy thì báo lỗi", () => {
    expect(resolveTarget(items, "không-có")).toMatchObject({ ok: false });
  });
});

describe("tiện ích", () => {
  it("takeTarget tách mục tiêu và phần còn lại", () => {
    expect(takeTarget('"Giọng gần gũi" nội dung')).toEqual({ target: "Giọng gần gũi", rest: "nội dung" });
    expect(takeTarget("abc def ghi")).toEqual({ target: "abc", rest: "def ghi" });
  });

  it("skillSlugFromInput bỏ dấu và thay ký tự lạ", () => {
    expect(skillSlugFromInput("Kiểm tra & Đánh giá!")).toBe("kiem-tra-danh-gia");
  });

  it("skillMarkdownFor sinh frontmatter hợp lệ, mô tả được bọc JSON", () => {
    const md = skillMarkdownFor("soan-de", 'Mô tả: có "dấu" và dấu hai chấm');
    expect(md.startsWith("---\nname: soan-de\n")).toBe(true);
    expect(md).toContain('description: "Mô tả: có \\"dấu\\" và dấu hai chấm"');
    expect(md).toContain("load: demand");
  });
});
