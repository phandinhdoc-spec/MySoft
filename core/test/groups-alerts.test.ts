import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertGate, checkBasis, citedBasis, fixPrompt, localDay, relatedNew, safeKeywords, DISCLAIMER_ORIGINAL } from "../src/groups/alerts.js";
import { buildBriefing, dismissBriefing, markBriefingShown, setBriefingEnabled } from "../src/groups/briefing.js";
import { GroupStore } from "../src/groups/store.js";

const NEW_ND = `Số: 115/2020/NĐ-CP
Hà Nội, ngày 25 tháng 9 năm 2020
Điều 20. Hiệu lực
Nghị định này có hiệu lực thi hành từ ngày 01 tháng 12 năm 2020.
Nghị định này thay thế Nghị định số 29/2012/NĐ-CP.`;
const OLD_ND = `Số: 29/2012/NĐ-CP
Hà Nội, ngày 12 tháng 4 năm 2012
Điều 1. Phạm vi
Quy định tuyển dụng viên chức cũ, nhiều chữ để đủ dài cho việc lập chỉ mục văn bản này.`;
const LUAT = `Số: 43/2019/QH14
Hà Nội, ngày 14 tháng 6 năm 2019
Điều 1. Phạm vi
Luật Giáo dục quy định hệ thống giáo dục quốc dân, nhà trường và các cơ sở giáo dục khác.`;

const DOC = `UBND PHƯỜNG HẠNH THÔNG
TRƯỜNG THCS PHAN VĂN TRỊ
Số: 12/QĐ-THCS
QUYẾT ĐỊNH
Về việc tuyển dụng giáo viên năm học 2026-2027
Căn cứ Luật Giáo dục số 43/2019/QH14;
Căn cứ Nghị định số 29/2012/NĐ-CP ngày 12/4/2012 của Chính phủ;
Căn cứ Thông tư số 99/2099/TT-BGDĐT của Bộ Giáo dục;
Em Nguyễn Văn An, lớp 9A1, số điện thoại 0903123456, được khen thưởng.`;

let tmp: string;
let store: GroupStore;
beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-alert-"));
  const texts: Record<string, string> = { luat: LUAT, nd29: OLD_ND, nd115: NEW_ND };
  store = new GroupStore(tmp, {
    memoryIndex: true,
    extract: async (file) => {
      const body = fs.readFileSync(file, "utf8");
      const key = Object.keys(texts).find((k) => body.includes(`#${k}#`))!;
      return { segments: texts[key]!.split("\n").map((text, i) => ({ ref: `${i}`, text })) };
    },
  });
  store.setEnabled(["hieu-truong", "van-thu"]);
  const add = async (grp: string, name: string) => {
    const f = path.join(tmp, name + ".pdf");
    fs.writeFileSync(f, `%PDF-1.7\n#${name}#`);
    return store.library(grp).addFile(f);
  };
  await add("hieu-truong", "luat");
  await add("hieu-truong", "nd29");
  await add("van-thu", "nd115");
  store.registry.refresh();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("Mức 1: căn cứ đã thay đổi", () => {
  it("tệp có 3 căn cứ, 1 đã bị thay thế → cảnh báo đúng văn bản đó, nêu văn bản thay thế và ngày hiệu lực", () => {
    const r = checkBasis(DOC, store.registry);
    expect(r.cited).toBe(3); // không tính số hiệu của chính văn bản (12/QĐ-THCS)
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]).toMatchObject({ no: "29/2012/NĐ-CP", state: "het-hieu-luc", replacedBy: { no: "115/2020/NĐ-CP", effectiveAt: "2020-12-01" } });
    expect(r.message).toBe("Văn bản này viện dẫn 3 văn bản. Nghị định 29/2012/NĐ-CP đã được thay thế bởi 115/2020/NĐ-CP từ ngày 01/12/2020.");
    expect(r.disclaimer).toBe(DISCLAIMER_ORIGINAL);
  });

  it("số hiệu không có trong kho → «chưa xác định», không suy đoán, không báo là đã đổi", () => {
    const r = checkBasis(DOC, store.registry);
    const u = r.unknown.map((f) => f.no);
    expect(u).toEqual(["99/2099/TT-BGDĐT"]);
    expect(r.changed.map((f) => f.no)).not.toContain("99/2099/TT-BGDĐT");
    expect(r.message).not.toContain("99/2099");
  });

  it("luật còn nguyên thì không báo; không có căn cứ nào thay đổi thì không có thông điệp", () => {
    const r = checkBasis("Căn cứ Luật Giáo dục số 43/2019/QH14.", store.registry);
    expect(r.changed).toEqual([]);
    expect(r.message).toBe("");
  });

  it("chỉ tra trong các nhóm được phép (công tắc theo nhóm)", () => {
    const r = checkBasis("Căn cứ Nghị định số 29/2012/NĐ-CP.", store.registry, { groups: ["van-thu"] });
    expect(r.unknown.map((f) => f.no)).toEqual(["29/2012/NĐ-CP"]);
  });

  it("không có dữ liệu nội dung tệp nào bị gửi ra ngoài trong lúc tra cứu", () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("không được gọi mạng"));
    try {
      checkBasis(DOC, store.registry);
      relatedNew(store, safeKeywords(DOC));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    // Từ khóa dùng để tra chỉ gồm số hiệu, tiêu đề, từ khóa; không có tên học sinh hay số điện thoại.
    const kw = JSON.stringify(safeKeywords(DOC)).toLowerCase();
    for (const secret of ["nguyễn văn an", "0903123456", "9a1", "khen thưởng"]) expect(kw).not.toContain(secret);
    expect(kw).toContain("29/2012/nđ-cp");
  });

  it("lời nhắc nhờ AI chỉ gồm số hiệu và tình trạng, không có nội dung tài liệu", () => {
    const r = checkBasis(DOC, store.registry);
    const p = fixPrompt("QD-12.docx", r);
    expect(p).toContain("29/2012/NĐ-CP");
    expect(p).toContain("115/2020/NĐ-CP");
    expect(p).toContain("Không tự sửa");
    expect(p).not.toContain("Nguyễn Văn An");
  });

  it("citedBasis bỏ số hiệu của chính văn bản", () => {
    expect(citedBasis(DOC).map((c) => c.no)).toEqual(["43/2019/QH14", "29/2012/NĐ-CP", "99/2099/TT-BGDĐT"]);
  });
});

describe("giới hạn tần suất cảnh báo", () => {
  it("cùng một văn bản không nhắc quá một lần mỗi ngày; sang ngày sau nhắc lại", () => {
    const gate = new AlertGate(path.join(tmp, "alerts.json"));
    const r = checkBasis(DOC, store.registry);
    const t0 = new Date(2026, 9, 18, 9, 0).getTime();
    expect(gate.filter(r, t0).changed).toHaveLength(1);
    expect(gate.filter(r, t0 + 3600_000).changed).toHaveLength(0);
    expect(gate.filter(r, t0 + 86400_000).changed).toHaveLength(1);
    // bền qua lần mở lại ứng dụng
    const again = new AlertGate(path.join(tmp, "alerts.json"));
    expect(again.filter(r, t0 + 86400_000 + 1000).changed).toHaveLength(0);
  });
  it("«Không nhắc cho văn bản này»", () => {
    const gate = new AlertGate(path.join(tmp, "alerts.json"));
    const r = checkBasis(DOC, store.registry);
    gate.mute(r.changed[0]!);
    expect(gate.filter(r, Date.now()).changed).toHaveLength(0);
    expect(gate.filter(r, Date.now() + 5 * 86400_000).changed).toHaveLength(0);
    gate.unmuteAll();
    expect(gate.filter(r, Date.now()).changed).toHaveLength(1);
  });
  it("xem thử (mark=false) không tiêu hao lượt nhắc trong ngày", () => {
    const gate = new AlertGate(path.join(tmp, "alerts.json"));
    const r = checkBasis(DOC, store.registry);
    expect(gate.filter(r, Date.now(), false).changed).toHaveLength(1);
    expect(gate.filter(r, Date.now()).changed).toHaveLength(1);
  });
});

describe("Mức 2: có thể tham khảo", () => {
  it("văn bản mới cùng chủ đề, ghi rõ lý do; không gọi là «cần xem»", () => {
    store.library("hieu-truong").book.add({ title: "Hướng dẫn tuyển dụng giáo viên năm học 2026-2027", agency: "Sở GD&ĐT", isNew: true, source: "tim-moi" });
    store.library("hieu-truong").book.add({ title: "Kế hoạch tổ chức hội thao", agency: "Sở", isNew: true, source: "tim-moi" });
    const r = relatedNew(store, safeKeywords(DOC));
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toContain("tuyển dụng giáo viên");
    expect(r[0]!.why).toContain("Cùng chủ đề");
  });
  it("nhóm bị tắt cảnh báo thì không có kết quả từ nhóm đó", () => {
    store.library("hieu-truong").book.add({ title: "Hướng dẫn tuyển dụng giáo viên", isNew: true });
    store.patchState({ alertsOff: ["hieu-truong"] });
    expect(relatedNew(store, safeKeywords(DOC))).toEqual([]);
  });
});

describe("Bản tin khởi động", () => {
  const t = new Date(2026, 9, 18, 8, 0).getTime();
  it("không có mục nào → không hiện cửa sổ", () => {
    const b = buildBriefing({ store, now: t });
    expect(b.items).toEqual([]);
    expect(b.show).toBe(false);
  });
  it("mục nào không có thì ẩn; có thì chỉ ghi số lượng thật", () => {
    store.library("hieu-truong").book.add({ title: "VB mới 1", isNew: true });
    store.library("van-thu").book.add({ title: "VB mới 2", isNew: true });
    const b = buildBriefing({ store, name: "thầy Phan", proposals: 2, needLogin: ["Codex"], now: t });
    expect(b.greeting).toBe("Chào thầy Phan. Hôm nay có:");
    expect(b.items.map((i) => i.id)).toEqual(["docs", "proposals", "login-Codex"]);
    expect(b.items[0]!.text).toMatch(/^2 văn bản mới cho nhóm /);
    expect(b.items[1]).toMatchObject({ text: "2 đề xuất skill chờ duyệt", action: "Duyệt", target: "proposals" });
    expect(b.show).toBe(true);
    expect(buildBriefing({ store, proposals: 0, now: t }).items.map((i) => i.id)).toEqual(["docs"]);
  });
  it("tối đa một lần mỗi ngày; «Không hiện lại hôm nay» đến hết ngày; sang ngày sau hiện lại", () => {
    store.library("hieu-truong").book.add({ title: "VB mới", isNew: true });
    expect(buildBriefing({ store, now: t }).show).toBe(true);
    markBriefingShown(store, t);
    expect(buildBriefing({ store, now: t + 3600_000 }).show).toBe(false);
    expect(buildBriefing({ store, now: t + 86400_000 }).show).toBe(true);
    store.patchState({ briefing: {} });
    dismissBriefing(store, t);
    expect(buildBriefing({ store, now: t + 2 * 3600_000 }).show).toBe(false);
    expect(buildBriefing({ store, now: t + 86400_000 }).show).toBe(true);
    expect(localDay(t)).toBe("2026-10-18");
  });
  it("công tắc tắt toàn bộ trong Cài đặt", () => {
    store.library("hieu-truong").book.add({ title: "VB mới", isNew: true });
    setBriefingEnabled(store, false);
    expect(buildBriefing({ store, now: t }).show).toBe(false);
    setBriefingEnabled(store, true);
    expect(buildBriefing({ store, now: t }).show).toBe(true);
  });
  it("căn cứ đã thay đổi ở tài liệu đang soạn hiện thành một mục", () => {
    const alerts = new AlertGate(path.join(tmp, "alerts.json"));
    alerts.setPending("qd12.docx", 1, t);
    const b = buildBriefing({ store, alerts, now: t });
    expect(b.items).toMatchObject([{ id: "basis", text: "1 văn bản đang soạn có căn cứ đã thay đổi", target: "basis" }]);
    alerts.clearPending("qd12.docx");
    expect(buildBriefing({ store, alerts, now: t }).items).toEqual([]);
  });
});
