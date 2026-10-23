import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GroupStore } from "../src/groups/store.js";
import { estimateSummary, SummaryCache, summarize, DISCLAIMER, SUMMARY_LIMITS } from "../src/groups/summary.js";

const NEW_ND = `Số: 115/2020/NĐ-CP
Hà Nội, ngày 25 tháng 9 năm 2020
Điều 1. Phạm vi
Quy định tuyển dụng viên chức.
Điều 12. Điều kiện
1. Từ đủ 18 tuổi trở lên.
Điều 20. Hiệu lực
Nghị định này có hiệu lực thi hành từ ngày 01 tháng 12 năm 2020.
Nghị định này thay thế Nghị định số 29/2012/NĐ-CP.`;
const OLD_ND = `Số: 29/2012/NĐ-CP
Hà Nội, ngày 12 tháng 4 năm 2012
Điều 1. Phạm vi
Quy định tuyển dụng viên chức cũ, nhiều chữ để đủ dài cho việc lập chỉ mục văn bản này.`;

let tmp: string;
beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-lib-"))));
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function makeStore(texts: Record<string, string>) {
  const calls: string[] = [];
  const store = new GroupStore(tmp, {
    memoryIndex: true,
    extract: async (file) => {
      calls.push(file);
      const body = fs.readFileSync(file, "utf8");
      const key = Object.keys(texts).find((k) => k !== "*" && body.includes(`#${k}#`));
      const t = (key ? texts[key] : texts["*"]) ?? "";
      return { segments: t ? t.split("\n").map((text, i) => ({ ref: `Dòng ${i + 1}`, text })) : [] };
    },
    fetcher: (async (u: string) => new Response(Buffer.from("%PDF-1.7\n" + u), { status: 200 })) as never,
    resolve: async () => ["203.0.113.9"],
  });
  return { store, calls };
}
const pdfFile = (name: string) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, `%PDF-1.7\n#${name.replace(/\.pdf$/, "")}#`);
  return f;
};

describe("kho văn bản của nhóm", () => {
  it("thêm tệp → lập chỉ mục → tìm được theo số hiệu/Điều, có siêu dữ liệu và trích nguồn", async () => {
    const { store } = makeStore({ "*": NEW_ND });
    store.setEnabled(["hieu-truong"]);
    const lib = store.library("hieu-truong");
    const rec = await lib.addFile(pdfFile("nd115.pdf"), { title: "Nghị định 115" });
    expect(rec).toMatchObject({ state: "da-lap-chi-muc", no: "115/2020/NĐ-CP", issuedAt: "2020-09-25", effectiveAt: "2020-12-01", status: "chua-xac-dinh" });
    expect(rec.hash).toMatch(/^[a-f0-9]{64}$/);
    const hits = store.search("Điều 12 Nghị định 115/2020/NĐ-CP");
    expect(hits[0]).toMatchObject({ dieu: "Điều 12", group: "hieu-truong", no: "115/2020/NĐ-CP" });
    expect(hits[0]!.cite).toMatch(/Điều 12.*115\/2020\/NĐ-CP/);
    // chỉ nhóm đang bật được tra.
    store.setEnabled(["van-thu"]);
    expect(store.search("Điều 12 Nghị định 115/2020/NĐ-CP")).toEqual([]);
  });

  it("PDF ảnh scan: báo 'chưa đọc được', không lập chỉ mục rỗng", async () => {
    const { store } = makeStore({ "*": "" });
    store.setEnabled(["hieu-truong"]);
    const lib = store.library("hieu-truong");
    const rec = await lib.addFile(pdfFile("scan.pdf"));
    expect(rec.state).toBe("chua-doc-duoc");
    expect(rec.note).toContain("scan");
    expect(lib.index().stats().chunks).toBe(0);
  });

  it("OCR (nếu có) cứu được PDF scan", async () => {
    const s = new GroupStore(tmp, { memoryIndex: true, extract: async () => ({ segments: [] }), ocr: async () => ({ segments: [{ ref: "Trang 1", text: OLD_ND }] }) });
    const rec = await s.library("hieu-truong").addFile(pdfFile("scan.pdf"));
    expect(rec.state).toBe("da-lap-chi-muc");
    expect(rec.no).toBe("29/2012/NĐ-CP");
  });

  it("tải từ link: lưu vào kho/, link chết thì giữ bản cũ và đánh dấu 'nguồn không còn'", async () => {
    let dead = false;
    const store = new GroupStore(tmp, {
      memoryIndex: true,
      extract: async () => ({ segments: NEW_ND.split("\n").map((text, i) => ({ ref: `${i}`, text })) }),
      fetcher: (async () => (dead ? new Response("", { status: 404 }) : new Response(Buffer.from("%PDF-1.7\nx")))) as never,
      resolve: async () => ["203.0.113.9"],
    });
    const lib = store.library("hieu-truong");
    const r = lib.addLink("https://vbpl.vn/van-ban/115", { title: "NĐ 115" });
    expect(r.state).toBe("chua-tai");
    const done = await lib.download(r.id);
    expect(done.state).toBe("da-lap-chi-muc");
    expect(fs.existsSync(path.join(lib.dir, done.file!))).toBe(true);
    dead = true;
    const again = await lib.download(r.id);
    expect(again.state).toBe("nguon-khong-con");
    expect(fs.existsSync(path.join(lib.dir, again.file!))).toBe(true); // giữ bản đã tải
    // link nguồn lạ cần xác nhận
    const x = lib.addLink("https://khac.example/a.pdf", { title: "Lạ" });
    await expect(lib.download(x.id)).rejects.toMatchObject({ needConfirm: true });
  });

  it("văn bản mới thay thế văn bản cũ (khác nhóm) → cũ 'hết hiệu lực' và không còn trong kết quả RAG mặc định", async () => {
    const { store } = makeStore({ nd115: NEW_ND, nd29: OLD_ND });
    store.setEnabled(["hieu-truong", "van-thu"]);
    const old = await store.library("van-thu").addFile(pdfFile("nd29.pdf"));
    expect(store.search("Điều 1 Nghị định 29/2012/NĐ-CP")).toHaveLength(1);
    await store.library("hieu-truong").addFile(pdfFile("nd115.pdf"));
    expect(store.registry.refresh()).toBeGreaterThan(0);
    const now = store.library("van-thu").book.get(old.id)!;
    expect(now).toMatchObject({ status: "het-hieu-luc", replacedBy: "115/2020/NĐ-CP", statusSource: "van-ban" });
    expect(store.search("Điều 1 Nghị định 29/2012/NĐ-CP")).toEqual([]);
    expect(store.search("Điều 1 Nghị định 29/2012/NĐ-CP", { includeExpired: true })).toHaveLength(1);
    const f = store.registry.lookup("29/2012/NĐ-CP")!;
    expect(f.effective.replacedBy?.no).toBe("115/2020/NĐ-CP");
    // Gỡ văn bản mới thì tình trạng suy ra được trả về "chưa xác định".
    store.library("hieu-truong").remove(store.library("hieu-truong").book.list()[0]!.id);
    store.registry.refresh();
    expect(store.library("van-thu").book.get(old.id)!.status).toBe("chua-xac-dinh");
  });

  it("tình trạng người dùng tự đặt không bị ghi đè", async () => {
    const { store } = makeStore({ nd115: NEW_ND, nd29: OLD_ND });
    const old = await store.library("van-thu").addFile(pdfFile("nd29.pdf"));
    store.library("van-thu").setStatus(old.id, "con-hieu-luc", "tay");
    await store.library("hieu-truong").addFile(pdfFile("nd115.pdf"));
    store.registry.refresh();
    expect(store.library("van-thu").book.get(old.id)!.status).toBe("con-hieu-luc");
  });

  it("dựng lại chỉ mục từ chữ đã lưu (index.db tạo lại được)", async () => {
    const { store } = makeStore({ "*": NEW_ND });
    const lib = store.library("hieu-truong");
    await lib.addFile(pdfFile("nd115.pdf"));
    lib.close();
    fs.rmSync(path.join(lib.dir, "index.db"), { force: true });
    const lib2 = new (lib.constructor as typeof import("../src/groups/library.js").GroupLibrary)(lib.dir, () => store.manifest("hieu-truong"), { memoryIndex: true, extract: async () => ({ segments: [] }) });
    expect(lib2.rebuildIndex()).toBe(1);
    expect(lib2.search("Điều 12")[0]!.dieu).toBe("Điều 12");
  });

  it("văn bản sắp có hiệu lực được ghi nhận từ ngày hiệu lực trong chữ", async () => {
    const fut = NEW_ND.replace("01 tháng 12 năm 2020", "01 tháng 01 năm 2099");
    const { store } = makeStore({ "*": fut });
    const rec = await store.library("hieu-truong").addFile(pdfFile("a.pdf"));
    expect(rec.status).toBe("sap-co-hieu-luc");
  });
});

describe("tóm tắt văn bản", () => {
  it("cảnh báo văn bản dài; dưới ngưỡng thì chạy một lượt", () => {
    expect(estimateSummary(NEW_ND)).toMatchObject({ long: false, calls: 1 });
    const big = Array.from({ length: 40 }, (_, i) => `Điều ${i + 1}. Mục\n${"nội dung dài ".repeat(150)}`).join("\n");
    const e = estimateSummary(big);
    expect(e.long).toBe(true);
    expect(e.calls).toBe(e.pieces + 1);
  });
  it("cắt khúc rồi gộp, luôn kết thúc bằng dòng cố định", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `Điều ${i + 1}. Mục\n${"nội dung dài ".repeat(150)}`).join("\n");
    let n = 0;
    const out = await summarize(big, async () => `kq ${++n}`);
    expect(n).toBeGreaterThan(2);
    expect(out.trim().endsWith(`_${DISCLAIMER}_`)).toBe(true);
    const twice = await summarize(NEW_ND, async () => `**Hiệu lực**: ...\n${DISCLAIMER}`);
    expect(twice.split(DISCLAIMER)).toHaveLength(2); // không lặp dòng cố định
  });
  it("văn bản quá dài chỉ đọc phần đầu và nói rõ", async () => {
    const huge = "Điều 1. Dài\n" + "a ".repeat(SUMMARY_LIMITS.maxChars);
    expect(await summarize(huge, async () => "x")).toContain("chưa được tóm tắt");
  });
  it("tóm tắt có bộ nhớ đệm theo mã băm: mở lại không gọi AI", async () => {
    const { store } = makeStore({ "*": NEW_ND });
    const lib = store.library("hieu-truong");
    const rec = await lib.addFile(pdfFile("a.pdf"));
    let asks = 0;
    const ask = async () => (asks++, "**Hiệu lực**: 01/12/2020");
    const a = await lib.summarizeDoc(rec.id, ask);
    expect(a.cached).toBe(false);
    const b = await lib.summarizeDoc(rec.id, ask);
    expect(b.cached).toBe(true);
    expect(asks).toBe(1);
    expect(lib.cachedSummary(rec.id)).toContain("Hiệu lực");
  });
  it("chưa tải thì tự tải trước rồi tóm; văn bản dài phải xác nhận", async () => {
    const big = Array.from({ length: 40 }, (_, i) => `Điều ${i + 1}. Mục\n${"nội dung dài ".repeat(150)}`).join("\n");
    const store = new GroupStore(tmp, { memoryIndex: true, extract: async () => ({ segments: big.split("\n").map((t, i) => ({ ref: `${i}`, text: t })) }), fetcher: (async () => new Response(Buffer.from("%PDF-1.7\nx"))) as never, resolve: async () => ["203.0.113.9"] });
    const lib = store.library("hieu-truong");
    const r = lib.addLink("https://vbpl.vn/x", { title: "Dài" });
    await expect(lib.summarizeDoc(r.id, async () => "t")).rejects.toMatchObject({ needConfirmLong: true });
    expect(lib.book.get(r.id)!.state).toBe("da-lap-chi-muc"); // đã tự tải trước
    const ok = await lib.summarizeDoc(r.id, async () => "t", { confirmLong: true });
    expect(ok.text).toContain(DISCLAIMER);
  });
  it("SummaryCache chịu được mã băm lạ", () => {
    const c = new SummaryCache(path.join(tmp, "s"));
    c.set("../../x", "a");
    expect(c.get("../../x")?.text).toBe("a");
    expect(fs.readdirSync(path.join(tmp, "s")).every((f) => /^[a-f0-9]*\.json$/.test(f))).toBe(true);
  });
});
