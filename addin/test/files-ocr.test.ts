import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@pvta/shared";

vi.mock("../src/pdf", () => ({
  pdfText: async () => ({ ok: false, reason: "PDF này là ảnh chụp/scan, không có lớp chữ để đọc (cần nhận dạng chữ OCR trước, rồi thêm lại)" }),
}));
const { addFiles } = await import("../src/files");

const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], "scan.pdf");

describe("addFiles: PDF scan", () => {
  it("OCR thành công: gửi văn bản OCR lên bridge như tệp đính kèm", async () => {
    const sent: ClientMessage[] = [];
    const r = await addFiles([pdf()], { scope: "chat", id: "c1" }, (m) => (sent.push(m), true), {
      ocr: async () => ({ ok: true, text: "[Trang 1]\nQuang hợp là gì?" }),
    });
    expect(r.added).toEqual(["scan.pdf"]);
    expect(sent[0]).toMatchObject({ type: "file_add", name: "scan.pdf", text: "[Trang 1]\nQuang hợp là gì?" });
  });
  it("OCR không khả dụng: bỏ qua tệp, nêu cả lý do gốc lẫn lý do OCR", async () => {
    const r = await addFiles([pdf()], { scope: "chat", id: "c1" }, () => true, { ocr: async () => ({ ok: false, reason: "Máy chưa có tesseract." }) });
    expect(r.added).toEqual([]);
    expect(r.skipped[0]?.reason).toContain("scan");
    expect(r.skipped[0]?.reason).toContain("Máy chưa có tesseract.");
  });
  it("không truyền ocr: giữ cách cũ (báo cần OCR)", async () => {
    const r = await addFiles([pdf()], { scope: "chat", id: "c1" }, () => true);
    expect(r.skipped[0]?.reason).toContain("OCR");
  });
});
