import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GroupStore } from "../src/groups/store.js";
import { discoverGroup } from "../src/groups/discover.js";
import { toolOfFile } from "../src/groups/catalog.js";
import { computeToolActivity, markToolSeen } from "../src/desktop/tool-activity.js";
import type { Action, Chat } from "../src/desktop/types.js";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-tools-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const store = () => new GroupStore(tmp, { extract: async () => ({ segments: [] }) });

describe("nhóm công cụ", () => {
  it("có PDF, Word, Excel, PowerPoint và xếp ở đầu danh sách", () => {
    const v = store().view();
    expect(v.kinds[0]!.kind).toBe("cong-cu");
    expect(v.kinds[0]!.groups.map((g) => g.id)).toEqual(expect.arrayContaining(["pdf", "word", "excel", "powerpoint"]));
  });
  it("không đếm văn bản dù thư mục cũ còn docs.json", () => {
    const s = store();
    s.library("word").book.add({ title: "Cách định dạng văn bản trong Word", isNew: true, source: "tim-moi", status: "chua-xac-dinh", agency: "" } as never);
    s.setEnabled(["word"]);
    const w = s.view().kinds.flatMap((k) => k.groups).find((g) => g.id === "word")!;
    expect(w).toMatchObject({ enabled: true, docs: 0, newDocs: 0 });
    expect(s.enabledLibraries()).toEqual([]);
  });
  it("không đi tìm văn bản mới cho công cụ", async () => {
    const s = store();
    s.setEnabled(["word"]);
    let called = 0;
    const r = await discoverGroup(s, "word", { fetcher: (async () => { called++; return new Response(""); }) as never }, { force: true });
    expect(r.added).toEqual([]);
    expect(r.skipped).toBe("no-source");
    expect(called).toBe(0);
  });
  it("gói chọn nhanh có PDF; nhóm chuyên môn vẫn tìm văn bản bình thường", () => {
    const s = store();
    s.applyPack("gv-khtn");
    expect(s.enabled()).toContain("pdf");
    expect(s.enabledLibraries().map((l) => l.id)).toEqual(expect.arrayContaining(["khtn", "giao-vien"]));
    expect(s.enabledLibraries().map((l) => l.id)).not.toContain("word");
  });
  it("nhận diện công cụ theo đuôi tệp", () => {
    expect([toolOfFile("a.DOCX"), toolOfFile("b.xlsx"), toolOfFile("c.pptx"), toolOfFile("d.pdf"), toolOfFile("e.md")]).toEqual(["word", "excel", "powerpoint", "pdf", undefined]);
  });
});

const act = (id: string, kind: Action["kind"], p: string, state: Action["state"], extra: Partial<Action> = {}): Action => ({ id, kind, path: p, reason: "", state, ...extra });
const chat = (actions: Action[], at: number, steps: Chat["messages"][number]["plan"] = undefined): Chat => ({ id: "c", title: "t", messages: [{ id: "m", role: "assistant", text: "", at, actions, plan: steps }], summary: "", updatedAt: at });

describe("tệp đang xử lí / chưa xem theo công cụ", () => {
  const now = 1_800_000_000_000;
  it("đếm tệp chờ duyệt là đang xử lí, tệp xong chưa mở là chưa xem", () => {
    const a = computeToolActivity([chat([
      act("1", "create_office", "/x/a.docx", "pending"),
      act("2", "create_office", "/x/b.xlsx", "done", { savedPath: "/x/b.xlsx" }),
      act("3", "create_office", "/x/c.xlsx", "done", { savedPath: "/x/c.xlsx", viewed: true }),
      act("4", "write_text", "/x/n.md", "done"),
      act("5", "open_file", "/x/d.pdf", "done"),
    ], now - 1000)], now);
    expect(a).toEqual({ word: { working: 1, unseen: 0 }, excel: { working: 0, unseen: 1 } });
  });
  it("bỏ kết quả cũ hơn 7 ngày và tính trùng một tệp một lần", () => {
    const old = chat([act("1", "create_office", "/x/a.pptx", "done")], now - 8 * 24 * 3600_000);
    const dup = chat([act("2", "patch_office", "/x/b.docx", "done", { savedPath: "/x/b2.docx" }), act("3", "patch_office", "/x/b.docx", "done", { savedPath: "/x/b2.docx" })], now - 5);
    expect(computeToolActivity([old, dup], now)).toEqual({ word: { working: 0, unseen: 1 } });
  });
  it("bước kế hoạch đang chạy tính là đang xử lí", () => {
    const plan = { id: "p", chatId: "c", title: "", approved: true, steps: [{ id: "s", goal: "", task: "", files: ["/x/de.pdf"], risk: "", status: "running" as const }] };
    expect(computeToolActivity([chat([], now, plan)], now)).toEqual({ pdf: { working: 1, unseen: 0 } });
  });
  it("đánh dấu đã xem theo công cụ", () => {
    const chats = [chat([act("1", "create_office", "/x/a.docx", "done"), act("2", "create_office", "/x/b.xlsx", "done")], now)];
    expect(markToolSeen(chats, "word")).toBe(1);
    expect(computeToolActivity(chats, now)).toEqual({ excel: { working: 0, unseen: 1 } });
  });
});
