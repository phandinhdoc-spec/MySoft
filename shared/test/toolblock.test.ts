import { describe, expect, it } from "vitest";
import { isReadTool, isWriteTool, parseToolBlocks, ToolFenceFilter, truncateResult, TOOL_CATALOG } from "../src/index.js";

const block = (json: string) => "```office-tool\n" + json + "\n```";

describe("parseToolBlocks", () => {
  it("tách một khối và giữ phần chữ còn lại", () => {
    const r = parseToolBlocks(`Mình sẽ chèn.\n${block('{"tool":"office_word_insert_text","args":{"text":"xin chào"}}')}\nXong.`);
    expect(r.calls).toEqual([{ tool: "office_word_insert_text", args: { text: "xin chào" } }]);
    expect(r.text).toBe("Mình sẽ chèn.\n\nXong.");
    expect(r.invalid).toEqual([]);
  });
  it("nhận mảng để gộp nhiều thao tác", () => {
    const r = parseToolBlocks(block('[{"tool":"a_get_x","args":{}},{"tool":"b","args":{"k":1}}]'));
    expect(r.calls.map((c) => c.tool)).toEqual(["a_get_x", "b"]);
  });
  it("ghi nhận khối JSON lỗi", () => {
    const r = parseToolBlocks(block("{không phải json"));
    expect(r.calls).toEqual([]);
    expect(r.invalid).toHaveLength(1);
  });
  it("args thiếu thì thành {}", () => {
    expect(parseToolBlocks(block('{"tool":"x"}')).calls[0]).toEqual({ tool: "x", args: {} });
  });
  it("không có khối nào", () => {
    const r = parseToolBlocks("Chỉ là văn bản.");
    expect(r.calls).toEqual([]);
    expect(r.text).toBe("Chỉ là văn bản.");
  });
});

describe("ToolFenceFilter", () => {
  const feed = (chunks: string[]) => {
    const f = new ToolFenceFilter();
    return chunks.map((c) => f.push(c)).join("") + f.flush();
  };
  it("ẩn khối công cụ trong luồng", () => {
    const text = "Trước.\n" + block('{"tool":"x","args":{}}') + "\nSau.";
    expect(feed([text])).toBe("Trước.\n\nSau.");
  });
  it("đúng khi chunk cắt ngang dấu rào", () => {
    const text = "Trước.\n" + block('{"tool":"x","args":{}}') + "\nSau.";
    for (let size = 1; size <= 7; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
      expect(feed(chunks), `size=${size}`).toBe("Trước.\n\nSau.");
    }
  });
  it("không nuốt khối mã thường", () => {
    const t = "```js\nconsole.log(1)\n```";
    expect(feed([t])).toBe(t);
  });
});

describe("phân loại công cụ", () => {
  it("get/list/cục bộ là công cụ đọc", () => {
    expect(isReadTool("office_word_get_selection")).toBe(true);
    expect(isReadTool("office_excel_list_sheets")).toBe(true);
    expect(isReadTool("office_skill_read")).toBe(true);
    expect(isReadTool("office_palette")).toBe(true);
  });
  it("còn lại là công cụ ghi", () => {
    expect(isWriteTool("office_word_insert_text")).toBe(true);
    expect(isWriteTool("office_excel_set_range")).toBe(true);
  });
  it("danh mục: mọi công cụ get/list đều được xem là đọc, set/insert/... là ghi", () => {
    for (const t of TOOL_CATALOG) {
      const looksRead = t.name.includes("_get_") || t.name.includes("_list_") || t.host === "local";
      expect(isReadTool(t.name), t.name).toBe(looksRead);
    }
  });
  it("tên công cụ trong danh mục là duy nhất", () => {
    const names = TOOL_CATALOG.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("truncateResult", () => {
  it("cắt và ghi chú", () => {
    const r = truncateResult("a".repeat(100), 10);
    expect(r.startsWith("aaaaaaaaaa")).toBe(true);
    expect(r).toContain("đã cắt 90");
  });
  it("giữ nguyên nếu ngắn", () => {
    expect(truncateResult("abc", 10)).toBe("abc");
  });
});
