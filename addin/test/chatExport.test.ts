import { describe, expect, it } from "vitest";
import { chatFileName, chatToMarkdown } from "../src/chatExport";

const labels = { title: "Hội thoại PVTA", you: "Thầy cô", ai: "PVTA" };
const when = new Date(2026, 9, 16, 1, 5);

describe("chatToMarkdown", () => {
  it("ghi tiêu đề, giờ và từng lượt; bỏ lượt trống", () => {
    const md = chatToMarkdown(
      [
        { role: "user", text: "Tóm tắt giúp" },
        { role: "assistant", text: "Đây là bản tóm tắt." },
        { role: "assistant", text: "  " },
      ],
      labels,
      when,
    );
    expect(md).toBe("# Hội thoại PVTA\n*2026-10-16 01:05*\n\n**Thầy cô:**\n\nTóm tắt giúp\n\n**PVTA:**\n\nĐây là bản tóm tắt.\n");
  });
  it("không có gì để xuất thì trả chuỗi rỗng", () => {
    expect(chatToMarkdown([], labels, when)).toBe("");
    expect(chatToMarkdown([{ role: "assistant", text: "" }], labels, when)).toBe("");
  });
  it("tên tệp có ngày giờ, không có ký tự cấm", () => {
    expect(chatFileName(when)).toBe("pvta-2026-10-16-0105.md");
  });
});
