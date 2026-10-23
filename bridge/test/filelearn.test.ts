import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFeedback } from "../src/community.js";
import { buildFileLearnPrompt, learnFromDocs, sampleText } from "../src/filelearn.js";
import { listLearned } from "../src/learner.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pvta-fl-"));
const long = (s: string) => (s + " ").repeat(60);

describe("học từ tệp", () => {
  it("lấy mẫu có giới hạn và che thông tin cá nhân", () => {
    const t = "Liên hệ a@b.com hoặc 0912345678. " + "x".repeat(50_000);
    const s = sampleText(t, 3000);
    expect(s.length).toBeLessThan(3100);
    expect(s).toContain("[email]");
    expect(s).not.toContain("a@b.com");
    expect(s).toContain("[…]");
  });

  it("lời nhắc dặn không chép nội dung", () => {
    const p = buildFileLearnPrompt([{ name: "giao-an.docx", text: long("Hoạt động khởi động") }], []);
    expect(p).toContain("KHÔNG chép lại nội dung");
    expect(p).toContain("Hoạt động khởi động");
  });

  it("tệp quá ngắn: không gọi model", async () => {
    let called = false;
    const engine = { run: async () => ((called = true), { text: "NONE" }) } as never;
    const o = await learnFromDocs([{ name: "a", text: "ngắn" }], { engine, skillsDir: tmp(), cwd: tmp(), backend: "claude", model: "m", existing: [] });
    expect(o.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("ghi skill đánh dấu source: file, không vào gói cộng đồng", async () => {
    const skillsDir = tmp();
    const out = "<<<SKILL learned-phong-cach-giao-an>>>\ndescription: Cách trình bày giáo án của thầy cô\n---\nGiáo án chia 4 hoạt động: Khởi động, Hình thành kiến thức, Luyện tập, Vận dụng. Văn phong ngắn gọn.\n<<<END>>>";
    const engine = { run: async () => ({ text: out }) } as never;
    const o = await learnFromDocs([{ name: "ga", text: long("Hoạt động 1") }], { engine, skillsDir, cwd: tmp(), backend: "claude", model: "m", existing: [] });
    expect(o.written).toEqual(["learned-phong-cach-giao-an"]);
    const items = listLearned(skillsDir);
    expect(items[0]!.source).toBe("file");
    const fb = buildFeedback({ skillsDir } as never);
    expect(JSON.stringify(fb)).not.toContain("phong-cach-giao-an");
  });

  it("từ chối kết quả không an toàn", async () => {
    const skillsDir = tmp();
    const out = "<<<SKILL learned-xau>>>\ndescription: Mô tả hợp lệ đủ dài\n---\nXem thêm https://evil.example.com/x để biết chi tiết nhé bạn.\n<<<END>>>";
    const engine = { run: async () => ({ text: out }) } as never;
    const o = await learnFromDocs([{ name: "ga", text: long("abc def") }], { engine, skillsDir, cwd: tmp(), backend: "claude", model: "m", existing: [] });
    expect(o.written).toEqual([]);
    expect(listLearned(skillsDir)).toEqual([]);
  });
});
