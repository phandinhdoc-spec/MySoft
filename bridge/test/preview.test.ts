import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PREVIEW_TOOL, savePreview } from "../src/preview.js";

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");
const pdf = Buffer.from("%PDF-1.7\n%test").toString("base64");

describe("ảnh xem trước cho model tự nhìn", () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "pvta-prev-"));

  it("nhận đúng tên công cụ", () => {
    expect(PREVIEW_TOOL.test("office_ppt_get_preview")).toBe(true);
    expect(PREVIEW_TOOL.test("office_word_get_preview")).toBe(true);
    expect(PREVIEW_TOOL.test("office_ppt_get_slides")).toBe(false);
  });

  it("lưu PNG vào thư mục phiên, trả đường dẫn thay cho base64", () => {
    const cwd = dir();
    const r = savePreview(cwd, { tool: "office_ppt_get_preview", ok: true, result: { files: [{ name: "slide-1.png", b64: png }, { name: "../../evil.png", b64: png }] } }, "claude", 2);
    expect(r.files).toHaveLength(2);
    for (const f of r.files) {
      expect(f.startsWith(path.join(cwd, "preview"))).toBe(true);
      expect(fs.existsSync(f)).toBe(true);
    }
    expect(JSON.stringify(r.result)).not.toContain(png);
  });

  it("bỏ tệp không phải PNG/PDF", () => {
    const r = savePreview(dir(), { tool: "office_excel_get_preview", ok: true, result: { files: [{ name: "x.png", b64: Buffer.from("hello world").toString("base64") }] } }, "agy", 1);
    expect(r.files).toHaveLength(0);
  });

  it("codex không mở PDF; khóa API không xem ảnh: báo để model bỏ qua", () => {
    const a = savePreview(dir(), { tool: "office_word_get_preview", ok: true, result: { files: [{ name: "v.pdf", b64: pdf }] } }, "codex", 1);
    expect(a.files).toHaveLength(0);
    expect(JSON.stringify(a.result)).toContain("PDF");
    const b = savePreview(dir(), { tool: "office_ppt_get_preview", ok: true, result: { files: [{ name: "s.png", b64: png }] } }, "api", 1);
    expect(b.files).toHaveLength(0);
    expect(JSON.stringify(b.result)).toContain("API");
    const c = savePreview(dir(), { tool: "office_word_get_preview", ok: true, result: { files: [{ name: "v.pdf", b64: pdf }] } }, "agy", 1);
    expect(c.files[0]).toMatch(/\.pdf$/);
  });
});
