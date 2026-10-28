import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkOpenable, docDisplayName, openOffice } from "../src/docs.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-docs-"));
const doc = path.join(dir, "Bài giảng.docx");
fs.writeFileSync(doc, "x");
fs.writeFileSync(path.join(dir, "run.sh"), "x");

describe("mở tệp Office", () => {
  it("mở đúng bằng ứng dụng mặc định theo hệ điều hành (ưu tiên Microsoft Office trên macOS nếu có); không qua shell", () => {
    const calls: Array<[string, string[]]> = [];
    const opener = (c: string, a: string[]) => void calls.push([c, a]);
    const orig = fs.existsSync;
    (fs as any).existsSync = (p: string) => (p.includes("Microsoft Word.app") ? false : orig(p));
    try {
      expect(openOffice(doc, { platform: "darwin", opener }).ok).toBe(true);
      expect(openOffice(doc, { platform: "win32", opener }).ok).toBe(true);
      expect(openOffice(doc, { platform: "linux", opener }).ok).toBe(true);
      expect(calls).toEqual([["open", [doc]], ["explorer.exe", [doc]], ["xdg-open", [doc]]]);
    } finally {
      (fs as any).existsSync = orig;
    }

    const macCalls: Array<[string, string[]]> = [];
    (fs as any).existsSync = (p: string) => p.includes("Microsoft Word.app") || orig(p);
    try {
      expect(openOffice(doc, { platform: "darwin", opener: (c, a) => void macCalls.push([c, a]) }).ok).toBe(true);
      expect(macCalls).toEqual([["open", ["-a", "/Applications/Microsoft Word.app", doc]]]);
    } finally {
      (fs as any).existsSync = orig;
    }
  });
  it("từ chối: không phải tệp Office, không tồn tại, thư mục, đường dẫn tương đối, ký tự lạ", () => {
    expect(checkOpenable(path.join(dir, "run.sh")).ok).toBe(false);
    expect(checkOpenable(path.join(dir, "khong-co.docx")).ok).toBe(false);
    expect(checkOpenable(dir).ok).toBe(false);
    expect(checkOpenable("Bài giảng.docx").ok).toBe(false);
    expect(checkOpenable(doc + "\n; rm -rf ~").ok).toBe(false);
    expect(checkOpenable(undefined).ok).toBe(false);
    expect(checkOpenable("x".repeat(2000)).ok).toBe(false);
  });
  it("tên tệp hiển thị được làm sạch và cắt ngắn", () => {
    expect(docDisplayName("  Bài\ngiảng.docx ")).toBe("Bài giảng.docx");
    expect(docDisplayName(5)).toBeUndefined();
    expect(docDisplayName("a".repeat(500))!.length).toBe(120);
  });
});
