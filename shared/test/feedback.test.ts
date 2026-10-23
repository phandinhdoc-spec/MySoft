import { describe, expect, it } from "vitest";
import { detectFeedback } from "../src/feedback.js";

describe("detectFeedback", () => {
  it("khen có nói về kết quả", () => {
    for (const s of ["Đẹp quá", "đúng ý thầy rồi", "Chuẩn rồi, cảm ơn", "được rồi", "looks good", "bảng này ổn rồi"]) expect(detectFeedback(s), s).toBe("praise");
  });
  it("chê", () => {
    for (const s of ["sai rồi", "chữ quá nhỏ", "Không đúng ý, làm lại", "dài quá", "too long", "bảng lộn xộn"]) expect(detectFeedback(s), s).toBe("critic");
  });
  it("khen xã giao, câu hỏi, yêu cầu mới và câu dài thì không tính", () => {
    for (const s of ["ok", "Cảm ơn", "cảm ơn nhé!", "vâng", "tại sao sai?", "hãy thêm một bảng điểm vào cuối văn bản", "", "x".repeat(200) + " đẹp"]) expect(detectFeedback(s), s).toBeNull();
  });
  it("vừa khen vừa chê: ưu tiên chê", () => {
    expect(detectFeedback("đẹp nhưng sai số")).toBe("critic");
  });
  it("không bắt nhầm từ chứa 'sai'", () => {
    expect(detectFeedback("Soạn bài Sai phạm và hậu quả")).toBeNull();
  });
});
