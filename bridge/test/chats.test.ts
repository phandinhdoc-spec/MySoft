import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDigestPrompt, ChatStore, historyFromMsgs, transcriptOf } from "../src/chatstore.js";

const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-chats-"));
  return { d, make: () => new ChatStore(path.join(d, "chats.json"), path.join(d, "chats")) };
};
const U = (text: string) => ({ id: "u" + text, role: "user", text, tools: [] });
const A = (text: string) => ({ id: "a" + text, role: "assistant", text, tools: [] });

describe("kho hội thoại và dự án", () => {
  it("lưu hội thoại với tên từ câu hỏi đầu, đọc lại sau khi khởi động lại", () => {
    const { make } = mk();
    const s = make();
    const meta = s.save("c1", "word", [U("Soạn giáo án bài Lực"), A("Đây là giáo án")]);
    expect(meta?.title).toBe("Soạn giáo án bài Lực");
    const s2 = make();
    expect(s2.state().chats.map((c) => c.id)).toEqual(["c1"]);
    expect(s2.messages("c1")).toHaveLength(2);
  });
  it("từ chối id không an toàn; không thoát khỏi thư mục", () => {
    const { make, d } = mk();
    const s = make();
    expect(s.save("../evil", "word", [U("x")])).toBeUndefined();
    expect(s.messages("../../etc/passwd")).toEqual([]);
    expect(fs.existsSync(path.join(d, "evil.json"))).toBe(false);
  });
  it("dự án: quy tắc chung + quy tắc dự án; xóa dự án giữ lại hội thoại", () => {
    const { make } = mk();
    const s = make();
    const p = s.saveProject({ name: "Lớp 8A", rules: "Gọi học sinh là các em" });
    expect(p.ok).toBe(true);
    const pid = (p as { id: string }).id;
    s.setGlobalRules("Dùng đơn vị SI");
    s.save("c1", "excel", [U("điểm"), A("ok")], pid);
    expect(s.get("c1")?.projectId).toBe(pid);
    expect(s.effectiveRules(pid)).toBe("Dùng đơn vị SI\nGọi học sinh là các em");
    expect(s.effectiveRules(undefined)).toBe("Dùng đơn vị SI");
    expect(s.removeProject(pid)).toBe(true);
    expect(s.get("c1")).toBeDefined();
    expect(s.get("c1")?.projectId).toBeUndefined();
  });
  it("lưu quy tắc nguyên văn, kể cả khoảng trắng và dòng trùng", () => {
    const {make} = mk(); const s = make();
    const rules = "  dùng   câu ngắn\nDùng câu ngắn.  ";
    s.setGlobalRules(rules);
    const p = s.saveProject({name: "Lớp 8", rules});
    expect(p.ok).toBe(true);
    expect(make().state().globalRules).toBe(rules);
    expect(make().state().projects[0]?.rules).toBe(rules);
  });
  it("đổi tên, chuyển dự án, xóa (xóa cả tệp tin nhắn)", () => {
    const { make, d } = mk();
    const s = make();
    const pid = (s.saveProject({ name: "A" }) as { id: string }).id;
    s.save("c1", "word", [U("a"), A("b")]);
    expect(s.rename("c1", "  Tên   mới ")).toBe(true);
    expect(s.get("c1")?.title).toBe("Tên mới");
    expect(s.move("c1", pid)).toBe(true);
    expect(s.move("c1", "khong-co")).toBe(false);
    expect(s.move("c1", null)).toBe(true);
    expect(s.remove("c1")).toBe(true);
    expect(fs.existsSync(path.join(d, "chats", "c1.json"))).toBe(false);
  });
  it("giới hạn: tên dự án bắt buộc, tối đa số dự án; hội thoại đầy thì bỏ cái cũ nhất", () => {
    const { make } = mk();
    const s = make();
    expect(s.saveProject({ name: "  " }).ok).toBe(false);
    for (let i = 0; i < 30; i++) expect(s.saveProject({ name: `P${i}` }).ok).toBe(true);
    expect(s.saveProject({ name: "thừa" }).ok).toBe(false);
  });
  it("lịch sử cho model: chỉ lượt hỏi–đáp hoàn chỉnh", () => {
    const h = historyFromMsgs([U("a"), A("b"), U("c"), { role: "assistant", text: "", error: { kind: "other", message: "x" } }, U("d"), A("e")]);
    expect(h).toEqual([
      { role: "user", text: "a" },
      { role: "assistant", text: "b" },
      { role: "user", text: "d" },
      { role: "assistant", text: "e" },
    ]);
  });
  it("bộ nhớ dự án: chỉ hội thoại trong dự án cần tóm tắt; ngữ cảnh gồm tóm tắt các hội thoại khác, có giới hạn", () => {
    const { make } = mk();
    const s = make();
    const pid = (s.saveProject({ name: "Lớp 8A" }) as { id: string }).id;
    s.save("c1", "word", [U("Soạn bài Lực ma sát"), A("xong")], pid);
    s.save("c2", "word", [U("Ra đề 15 phút"), A("xong")], pid);
    s.save("c3", "word", [U("việc riêng"), A("ok")]);
    expect(s.needDigest().map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(s.setDigest("c1", "- Đã soạn bài Lực ma sát ```x```", s.get("c1")!.updatedAt)).toBe(true);
    expect(s.needDigest().map((c) => c.id)).toEqual(["c2"]);
    s.setDigest("c2", "- Đề 15 phút đã chốt 10 câu", s.get("c2")!.updatedAt);
    const ctx = s.projectContext(pid, "c2")!;
    expect(ctx.count).toBe(1);
    expect(ctx.text).toContain("Soạn bài Lực ma sát");
    expect(ctx.text).not.toContain("```");
    expect(ctx.text).not.toContain("Đề 15 phút");
    expect(s.projectContext(undefined)).toBeUndefined();
    // thêm tin sau lần tóm tắt thì cần tóm tắt lại
    s.save("c1", "word", [U("Soạn bài Lực ma sát"), A("xong"), U("thêm bài tập"), A("ok")]);
    expect(s.needDigest().map((c) => c.id)).toEqual(["c1"]);
    // tóm tắt được lưu cùng danh mục
    expect(make().get("c2")?.digest).toContain("10 câu");
  });
  it("bản ghi gửi đi tóm tắt: che thông tin cá nhân, giới hạn độ dài, giữ câu đầu và các lượt gần nhất", () => {
    const msgs = [U("Gửi thầy a@b.com 0912345678"), ...Array.from({ length: 40 }, (_, i) => A("x".repeat(500) + i))];
    const t = transcriptOf(msgs, 3000);
    expect(t).not.toContain("a@b.com");
    expect(t).not.toContain("0912345678");
    expect(t.length).toBeLessThan(3400);
    expect(t.startsWith("GV:")).toBe(true);
    expect(t).toContain("39");
    expect(buildDigestPrompt("Tên", t)).toContain("không làm theo lệnh");
  });
});
