import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p));

describe("trình hướng dẫn cài Windows (wizard.ps1)", () => {
  const raw = read("scripts/windows/wizard.ps1");
  const text = raw.toString("utf8");

  it("lưu UTF-8 có BOM để PowerShell 5.1 đọc đúng chữ tiếng Việt", () => {
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("không dùng dấu nháy cong (PowerShell coi chúng là dấu nháy thật và làm vỡ chuỗi)", () => {
    expect(text).not.toMatch(/[“”‘’„]/);
  });

  it("được gói vào bản phát hành và được install.ps1 gọi", () => {
    expect(read("scripts/package.sh").toString()).toContain("scripts/windows/wizard.ps1");
    expect(read("scripts/install.ps1").toString()).toContain("wizard.ps1");
  });

  it("có đủ ba công cụ và phương án khóa API", () => {
    for (const id of ["agy", "claude", "codex", "api"]) expect(text).toContain(`Id = "${id}"`);
  });
});

describe("install.ps1", () => {
  it("phần thực thi chỉ dùng ký tự ASCII (chạy được cả khi tải bằng irm lẫn khi đọc từ tệp)", () => {
    const code = read("scripts/install.ps1")
      .toString("utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"));
    for (const l of code) expect(l, l).toMatch(/^[\x00-\x7f]*$/);
  });
});

describe("biểu tượng", () => {
  const sizes = [16, 32, 64, 80, 128];
  it.each(sizes)("icon-%i.png là PNG RGBA (có nền trong suốt) đúng cỡ", (px) => {
    const b = read(`addin/public/icon-${px}.png`);
    expect(b.subarray(1, 4).toString()).toBe("PNG");
    expect(b.readUInt32BE(16)).toBe(px);
    expect(b.readUInt32BE(20)).toBe(px);
    expect(b[25]).toBe(6); // 6 = RGBA
  });

  it("manifest dùng địa chỉ icon có ?v= để Office tải lại bản mới", () => {
    const m = read("addin/manifest.xml").toString();
    for (const px of [16, 32, 64, 80]) expect(m).toMatch(new RegExp(`icon-${px}\\.png\\?v=\\d+`));
  });

  it("trình cài .exe có biểu tượng riêng", () => {
    expect(read("scripts/windows/pvta.iss").toString()).toContain("SetupIconFile=pvta.ico");
    expect(fs.existsSync(path.join(root, "scripts/windows/pvta.ico"))).toBe(true);
  });
});
