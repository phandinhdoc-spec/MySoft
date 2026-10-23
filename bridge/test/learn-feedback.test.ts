import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLearnPrompt, deleteLearned, listLearned, sanitizeRecord, shouldRun, writeLearned, LEARN, type LearnRecord } from "../src/learner.js";

const rec = (over: Partial<LearnRecord> = {}): LearnRecord => ({ ts: 1_000, request: "in đậm tiêu đề", tools: ["office_word_apply_format"], argNames: ["bold"], backend: "claude", model: "sonnet", ...over });

describe("học chủ động từ lời khen/chê", () => {
  it("bản ghi phản hồi chỉ có lời nhận xét đã che + tên công cụ/tham số", () => {
    const r = sanitizeRecord({
      request: "đẹp quá, gửi thầy ab@x.vn",
      calls: [{ tool: "office_word_apply_format", args: { size: 14, text: "NỘI DUNG BÍ MẬT" } }],
      backend: "claude",
      model: "sonnet",
      feedback: "praise",
      about: "đổi tiêu đề cỡ 14 gọi 0912345678",
    });
    expect(r.feedback).toBe("praise");
    expect(JSON.stringify(r)).not.toMatch(/ab@x\.vn|0912345678|BÍ MẬT/);
    expect(r.argNames).toEqual(["size", "text"]);
    expect(r.about).toContain("[sđt]");
  });
  it("khen một lần chưa đủ để học; khen hai lần hoặc có tín hiệu khác thì học", () => {
    const base = { now: 10_000_000, lastActivity: 0, runsToday: 0 };
    expect(shouldRun({ ...base, queue: [rec({ feedback: "praise" })], force: true })).toBe(false);
    expect(shouldRun({ ...base, queue: [rec({ feedback: "praise" }), rec({ feedback: "praise", ts: 2 }), rec({ ts: 3 })] })).toBe(true);
    expect(shouldRun({ ...base, queue: [rec({ feedback: "critic" })], force: true })).toBe(true);
    expect(LEARN.praiseMin).toBe(2);
  });
  it("lời nhắc học nêu rõ cách dùng khen/chê và cấm ghi nội dung", () => {
    const p = buildLearnPrompt([rec({ feedback: "critic", request: "chữ nhỏ quá", about: "đổi cỡ chữ" })], []);
    expect(p).toContain("PHẢN HỒI CHÊ");
    expect(p).toContain("điều nên TRÁNH");
    expect(p).toContain("TUYỆT ĐỐI không ghi nội dung văn bản");
    expect(buildLearnPrompt([rec()], [])).not.toContain("PHẢN HỒI");
  });
  it("xem và xóa skill đã học; không đụng skill khác", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-learn-"));
    expect(writeLearned(dir, { name: "learned-tieu-de", description: "Tiêu đề cỡ 14 đậm, căn giữa", body: "Tiêu đề: cỡ 14, đậm, căn giữa; không quá một dòng." }).written).toBe(true);
    writeLearned(dir, { name: "learned-tieu-de", description: "Tiêu đề cỡ 14 đậm, căn giữa", body: "Tiêu đề: cỡ 14, đậm, căn giữa; không quá một dòng (bản 2)." });
    fs.mkdirSync(path.join(dir, "pvta-word"));
    fs.writeFileSync(path.join(dir, "pvta-word", "SKILL.md"), "---\nname: pvta-word\ndescription: x\n---\nbody");
    const list = listLearned(dir);
    expect(list.map((x) => x.name)).toEqual(["learned-tieu-de"]);
    expect(list[0]!.body).toContain("bản 2");
    expect(deleteLearned(dir, "pvta-word")).toBe(false);
    expect(deleteLearned(dir, "../pvta-word")).toBe(false);
    expect(fs.existsSync(path.join(dir, "pvta-word"))).toBe(true);
    expect(deleteLearned(dir, "learned-tieu-de")).toBe(true);
    expect(listLearned(dir)).toEqual([]);
    expect(fs.readdirSync(path.join(dir, ".backup"))).toEqual([]); // bản sao lưu cũng xóa
  });
  it("quy tắc giáo viên tự viết được đưa vào lời nhắc để không học trùng", () => {
    expect(buildLearnPrompt([rec()], [], "Tiêu đề cỡ 16")).toContain("KHÔNG học lại");
    expect(buildLearnPrompt([rec()], [], "Tiêu đề cỡ 16")).toContain("Tiêu đề cỡ 16");
    expect(buildLearnPrompt([rec()], [], "  ")).not.toContain("KHÔNG học lại");
  });
});
