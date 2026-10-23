import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FILE_LIMITS, FileStore } from "../src/filestore.js";

const mk = () => new FileStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pvta-files-")), "files"));
const C = { kind: "chat", id: "c1" } as const;
const P = { kind: "project", id: "p1" } as const;

describe("kho tệp đính kèm", () => {
  it("thêm, thay cùng tên, liệt kê, xóa", () => {
    const s = mk();
    expect(s.add(C, "de.txt", "Câu 1: Lực là gì?\nCâu 2: Ma sát").ok).toBe(true);
    expect(s.add(C, "de.txt", "Bản mới").ok).toBe(true);
    expect(s.list(C)).toEqual([{ name: "de.txt", chars: 7 }]);
    expect(s.remove(C, "de.txt")).toBe(true);
    expect(s.list(C)).toEqual([]);
  });
  it("giới hạn: tệp rỗng, quá dài bị cắt, đủ tổng thì từ chối, id lạ", () => {
    const s = mk();
    expect(s.add(C, "a", "   ").ok).toBe(false);
    const big = s.add(C, "big", "x".repeat(FILE_LIMITS.chars + 10));
    expect(big.ok && big.info.truncated).toBe(true);
    expect(big.ok && big.info.chars).toBe(FILE_LIMITS.chars);
    for (let i = 0; i < 4; i++) s.add(C, `f${i}`, "y".repeat(FILE_LIMITS.chars));
    expect(s.add(C, "tràn", "y".repeat(FILE_LIMITS.chars)).ok).toBe(false);
    expect(s.add({ kind: "chat", id: "../x" }, "a", "b").ok).toBe(false);
  });
  it("đọc theo đoạn có next; tìm theo từ khóa có vị trí; ưu tiên hội thoại rồi dự án", () => {
    const s = mk();
    s.add(P, "sach.md", "Chương 1\nLực ma sát nghỉ\nChương 2\nÁp suất chất lỏng");
    s.add(C, "de.txt", "Đề 15 phút\nCâu 1 về áp suất");
    const r = s.read([C, P], { name: "sach", start: 0, length: 12 }) as { ok: true; result: { text: string; next: number; total: number } };
    expect(r.ok).toBe(true);
    expect(r.result.text).toBe("Chương 1\nLực");
    expect(r.result.next).toBe(12);
    const rest = s.read([C, P], { name: "sach.md", start: r.result.next, length: 5000 }) as { result: { text: string; next?: number } };
    expect(rest.result.text.endsWith("chất lỏng")).toBe(true);
    expect(rest.result.next).toBeUndefined();
    const f = s.search([C, P], { query: "ÁP SUẤT" }) as { ok: true; result: { matches: Array<{ name: string; start: number; text: string }> } };
    expect(f.result.matches.map((m) => m.name).sort()).toEqual(["de.txt", "sach.md"]);
    expect(s.search([C, P], { query: "ma sát", name: "sach.md" }).ok).toBe(true);
    expect(s.read([C, P], { name: "khong-co" }).ok).toBe(false);
    expect(s.search([C, P], { query: "  " }).ok).toBe(false);
  });
  it("tên mơ hồ thì báo; lời nhắc liệt kê tệp, tệp nhỏ của hội thoại đưa sẵn nội dung, tệp dự án chỉ liệt kê", () => {
    const s = mk();
    s.add(P, "giao an 1.txt", "A".repeat(100));
    s.add(P, "giao an 2.txt", "B".repeat(100));
    const amb = s.read([P], { name: "giao an" });
    expect(!amb.ok && amb.error).toContain("nhiều tệp");
    s.add(C, "nhỏ.txt", "Nội dung nhỏ ```mã```");
    s.add(C, "lớn.txt", "L".repeat(FILE_LIMITS.inlineEach + 1));
    const sec = s.promptSection([C, P]);
    expect(sec).toContain("nhỏ.txt");
    expect(sec).toContain("[Nội dung nhỏ.txt]");
    expect(sec).not.toContain("[Nội dung lớn.txt]");
    expect(sec).not.toContain("[Nội dung giao an 1.txt]");
    expect(sec).not.toContain("```mã```");
    expect(sec).toContain("DỮ LIỆU");
    expect(s.promptSection([{ kind: "chat", id: "trong" }])).toBe("");
  });
  it("dọn tệp của hội thoại không còn và đã cũ", () => {
    const s = mk();
    s.add({ kind: "chat", id: "mo" }, "a", "x");
    s.add({ kind: "chat", id: "giu" }, "a", "x");
    s.prune(new Set(["giu"]), new Set(), 1000, Date.now() + 10_000);
    expect(s.list({ kind: "chat", id: "mo" })).toEqual([]);
    expect(s.list({ kind: "chat", id: "giu" })).toHaveLength(1);
  });
});

describe("đọc PDF theo trang (office_pdf_pages)", () => {
  const PDF = "[Trang 1]\nChương 1: Lực\nLực là tác dụng đẩy hoặc kéo.\n\n[Trang 2]\nMa sát cản trở chuyển động.\n\n[Trang 5]\nÁp suất chất lỏng.";
  it("đọc khoảng trang, có nextPage; tìm từ khóa ra danh sách trang", () => {
    const s = mk();
    s.add(C, "sgk.pdf", PDF);
    const a = s.pages([C], { name: "sgk.pdf", from: 1, to: 2 });
    expect(a.ok && (a.result as { text: string }).text).toContain("Lực là tác dụng đẩy");
    expect(a.ok && (a.result as { text: string }).text).toContain("[Trang 2]");
    expect(a.ok && (a.result as { nextPage?: number }).nextPage).toBe(3);
    const b = s.pages([C], { name: "sgk.pdf", from: 5 });
    expect(b.ok && (b.result as { text: string }).text).toContain("Áp suất");
    expect(b.ok && (b.result as { nextPage?: number }).nextPage).toBeUndefined();
    const q = s.pages([C], { name: "sgk.pdf", query: "ma sát" });
    expect(q.ok && (q.result as { matches: Array<{ page: number }> }).matches.map((m) => m.page)).toEqual([2]);
    const empty = s.pages([C], { name: "sgk.pdf", from: 3, to: 4 });
    expect(empty.ok && (empty.result as { note?: string }).note).toContain("không có chữ");
  });
  it("giới hạn số trang mỗi lần; tệp không có nhãn trang hoặc không tồn tại thì báo lỗi", () => {
    const s = mk();
    s.add(C, "dai.pdf", Array.from({ length: 40 }, (_, i) => `[Trang ${i + 1}]\nnội dung trang ${i + 1}`).join("\n\n"));
    const r = s.pages([C], { name: "dai.pdf", from: 1, to: 40 });
    expect(r.ok && (r.result as { to: number }).to).toBe(15);
    expect(r.ok && (r.result as { nextPage: number }).nextPage).toBe(16);
    s.add(C, "tho.txt", "không có nhãn trang");
    expect(s.pages([C], { name: "tho.txt", from: 1 }).ok).toBe(false);
    expect(s.pages([C], { name: "khong-co.pdf", from: 1 }).ok).toBe(false);
  });
});
