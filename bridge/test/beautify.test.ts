import { describe, expect, it } from "vitest";
import { beautifyKind, buildBeautifyPrompt } from "../src/beautify.js";
import { beautifyRecord, buildLearnPrompt, shouldRun } from "../src/learner.js";

describe("lời nhắc làm đẹp: một prompt, không mẫu", () => {
  it("Word: nguyên tắc bất biến, khảo sát trước, Equation, giữ câu-hình cùng trang", () => {
    const t = buildBeautifyPrompt({ host: "word", fileName: "de.docx", head: "ĐỀ KIỂM TRA", hasImages: true });
    expect(t).toContain("Không đổi nội dung");
    expect(t).toContain("Khảo sát trước khi sửa");
    expect(t).toContain("office_word_math_scan");
    expect(t).toContain("office_word_image_to_equation");
    expect(t).toContain("office_word_keep_together");
    expect(t).toContain("Hoàn tác");
    expect(t).toContain("<dau_tep>");
  });
  it("không còn mẫu hay công cụ dàn trang dựng sẵn", () => {
    for (const host of ["word", "excel", "powerpoint"] as const) {
      const t = buildBeautifyPrompt({ host });
      expect(t).not.toContain("beautify_layout");
      expect(t).not.toMatch(/LaTeX \(Cambria|Typst \(Georgia|Nghị định 30\/2020\/NĐ-CP: A4/);
    }
  });
  it("Excel: đọc cấu trúc trước, cấm làm dẹt đầu bảng và gộp ô", () => {
    const t = buildBeautifyPrompt({ host: "excel" });
    expect(t).toContain("office_excel_inspect_layout");
    expect(t).toContain("Không gộp hay bỏ gộp ô");
    expect(t).toContain("không bao giờ theo \"hàng đầu của sheet\"");
    expect(t).not.toContain("office_word_");
  });
  it("nhãn học theo phần mềm", () => {
    expect(beautifyKind("excel").label).toBe("bảng tính");
    expect(beautifyKind("word").label).toBe("văn bản");
  });
});

describe("học mức cao", () => {
  const rec = beautifyRecord({ docKind: "đề kiểm tra / đề thi", changes: ["cỡ chữ: 13 → 12 (20 đoạn)", "liên hệ a@b.com"], backend: "claude", model: "m", now: 1 });
  it("che thông tin cá nhân, đánh dấu high", () => {
    expect(rec.level).toBe("high");
    expect(rec.edits!.join(" ")).not.toContain("a@b.com");
  });
  it("lời nhắc học nêu rõ mức cao và quy tắc", () => {
    const p = buildLearnPrompt([rec], []);
    expect(p).toContain("MỨC HỌC CAO");
    expect(p).toContain("cỡ chữ: 13 → 12");
  });
  it("chạy được ngay khi bị ép dù chưa đủ số lượng", () => {
    expect(shouldRun({ queue: [rec], now: 2, lastActivity: 2, runsToday: 99, force: true })).toBe(true);
  });
});

describe("làm đẹp: tự nhìn kết quả", () => {
  it("mỗi phần mềm được dặn đúng công cụ xem trước của mình", () => {
    expect(buildBeautifyPrompt({ host: "word" })).toContain("office_word_get_preview");
    expect(buildBeautifyPrompt({ host: "excel" })).toContain("office_excel_get_preview");
    const p = buildBeautifyPrompt({ host: "powerpoint" });
    expect(p).toContain("office_ppt_get_preview");
    expect(p).toContain("24–28 pt");
    expect(p).not.toContain("office_word_");
  });
});
