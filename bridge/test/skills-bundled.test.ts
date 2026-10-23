import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "@pvta/shared";
import { findUnsafe, parseSkill, SKILL_NAME_RE } from "../src/skills.js";
import { rulesText } from "../src/prompts.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills");
const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

describe("skill đi kèm", () => {
  it("có đủ ba skill nền và skill giới thiệu PVTA", () => {
    expect(names).toEqual(expect.arrayContaining(["pvta-word", "pvta-excel", "pvta-powerpoint", "pvta-gioi-thieu"]));
  });
  it("quy tắc chỉ model tới đúng skill giới thiệu PVTA, ở cả ba ứng dụng", () => {
    for (const host of ["word", "excel", "powerpoint"] as const) expect(rulesText(host, "vi")).toContain('office_skill_read với name "pvta-gioi-thieu"');
  });
  for (const n of names) {
    it(`${n}: hợp lệ, an toàn, chỉ nhắc công cụ có thật`, () => {
      const md = fs.readFileSync(path.join(dir, n, "SKILL.md"), "utf8");
      const s = parseSkill(md);
      expect(SKILL_NAME_RE.test(n)).toBe(true);
      expect(s.name).toBe(n);
      expect(s.description && s.description.length).toBeGreaterThan(10);
      // Skill giới thiệu PVTA chỉ liệt kê, đọc khi người dùng hỏi về PVTA (đỡ tốn token mỗi lượt đầu).
      const demand = ["pvta-gioi-thieu", "pvta-giao-an", "pvta-hanh-chinh", "pvta-phap-ly", "pvta-pdf"].includes(n);
      expect(s.load).toBe(demand ? "demand" : "always");
      expect(findUnsafe(md)).toBeNull();
      expect(s.body.length).toBeLessThan(demand ? 10000 : 3000); // nạp lượt đầu có hạn mức; skill đọc theo yêu cầu thì rộng hơn
      const catalog = new Set(TOOL_CATALOG.map((t) => t.name));
      for (const m of md.matchAll(/\boffice_[a-z_]+\b/g)) expect(catalog.has(m[0]), m[0]).toBe(true);
    });
  }
});
