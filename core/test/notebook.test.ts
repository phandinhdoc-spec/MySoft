import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NOT_FOUND, NotebookStore, paragraphs, youtubeId, type NotebookDeps } from "../src/notebook/index.js";

let home: string;
beforeEach(() => (home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-nb-"))));
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const PHOTO = "Quang hợp là quá trình cây xanh dùng năng lượng ánh sáng để tổng hợp chất hữu cơ từ khí carbon dioxide và nước, đồng thời giải phóng khí oxygen.";
const RESP = "Hô hấp tế bào phân giải chất hữu cơ, giải phóng năng lượng cho các hoạt động sống của tế bào.";
function file(name: string, body = "x") {
  const f = path.join(home, name);
  fs.writeFileSync(f, body);
  return f;
}
function deps(extra: Partial<NotebookDeps> = {}): NotebookDeps {
  return {
    extract: async (f) => ({ segments: [{ ref: "Trang 1", text: fs.readFileSync(f, "utf8").includes("#hh#") ? RESP : PHOTO }] }),
    ...extra,
  };
}

describe("nhận link", () => {
  it("YouTube: watch, youtu.be, shorts, embed; link lạ thì không", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
    expect(youtubeId("không phải link")).toBeUndefined();
  });
  it("trang web dài tách thành đoạn có nhãn", () => {
    expect(paragraphs("Mở bài\n\nThân   bài\n- ý 1\n- ý 2")).toEqual([
      { ref: "Đoạn 1", text: "Mở bài" },
      { ref: "Đoạn 2", text: "Thân bài" },
      { ref: "Đoạn 3", text: "- ý 1" },
      { ref: "Đoạn 4", text: "- ý 2" },
    ]);
  });
});

describe("thêm nguồn", () => {
  it("tài liệu: đọc chữ, lưu, mở lại vẫn còn; trùng thì từ chối; định dạng lạ thì từ chối", async () => {
    const s = new NotebookStore(home, deps());
    const nb = s.create("  Sinh học 7 ");
    expect(nb.name).toBe("Sinh học 7");
    const src = await s.addFile(nb.id, file("bai.pdf"));
    expect(src).toMatchObject({ state: "san-sang", kind: "file", title: "bai.pdf", on: true });
    await expect(s.addFile(nb.id, file("bai.pdf"))).rejects.toThrow("đã có");
    await expect(s.addFile(nb.id, file("virus.exe"))).rejects.toThrow("Chưa hỗ trợ");
    const again = new NotebookStore(home, deps());
    expect(again.get(nb.id).sources).toHaveLength(1);
    expect(again.sourceText(nb.id, src.id)).toContain("Quang hợp");
    expect(again.list()).toEqual([expect.objectContaining({ id: nb.id, name: "Sinh học 7", sources: 1 })]);
  });
  it("PDF ảnh scan: OCR; không có OCR thì báo rõ", async () => {
    const empty = { extract: async () => ({ segments: [{ ref: "Trang 1", text: "" }] }) };
    const ok = new NotebookStore(home, { ...empty, ocr: async () => ({ segments: [{ ref: "Trang 1", text: PHOTO }] }) });
    const nb = ok.create("A");
    expect(await ok.addFile(nb.id, file("scan.pdf"))).toMatchObject({ state: "san-sang", note: expect.stringContaining("OCR") });
    const no = new NotebookStore(home, { ...empty, ocr: async () => ({ unavailable: "Máy chưa có tesseract." }) });
    const nb2 = no.create("B");
    expect(await no.addFile(nb2.id, file("scan2.pdf"))).toMatchObject({ state: "loi", error: expect.stringContaining("tesseract") });
  });
  it("âm thanh/video: phiên âm trên máy; thiếu bộ phiên âm thì báo", async () => {
    const s = new NotebookStore(home, deps({ transcribe: async () => ({ segments: [{ ref: "0:00", text: PHOTO }] }) }));
    const nb = s.create("Bài giảng");
    expect(await s.addFile(nb.id, file("tiet1.mp3"))).toMatchObject({ kind: "audio", state: "san-sang" });
    expect(await s.addFile(nb.id, file("tiet2.mp4"))).toMatchObject({ kind: "audio", state: "san-sang" });
    const bare = new NotebookStore(home, deps());
    expect(await bare.addFile(nb.id, file("tiet3.wav"))).toMatchObject({ state: "loi" });
  });
  it("YouTube: lấy tên và phụ đề; video tắt phụ đề thì báo lỗi dễ hiểu", async () => {
    const s = new NotebookStore(
      home,
      deps({
        youtubeTitle: async () => "Quang hợp – KHTN 7",
        youtube: async (id) => (id === "AAAAAAAAAAA" ? { unavailable: "Video đã tắt phụ đề." } : { segments: [{ ref: "1:05", text: PHOTO }], language: "vi" }),
      }),
    );
    const nb = s.create("Video");
    expect(await s.addUrl(nb.id, "https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ kind: "youtube", title: "Quang hợp – KHTN 7", state: "san-sang" });
    expect(await s.addUrl(nb.id, "https://www.youtube.com/watch?v=AAAAAAAAAAA")).toMatchObject({ state: "loi", error: "Video đã tắt phụ đề." });
  });
  it("trang web: chỉ https, lấy tiêu đề; trang lỗi thì báo", async () => {
    const s = new NotebookStore(home, deps({ fetchPage: async (u) => (u.includes("hong") ? { ok: false, error: "Trang trả về lỗi 404." } : { ok: true, text: PHOTO, truncated: false, type: "text/html", title: "Bài quang hợp" }) }));
    const nb = s.create("Web");
    expect(await s.addUrl(nb.id, "https://hoc.example/quang-hop")).toMatchObject({ kind: "web", title: "Bài quang hợp", state: "san-sang" });
    expect(await s.addUrl(nb.id, "https://hoc.example/hong")).toMatchObject({ state: "loi", error: "Trang trả về lỗi 404." });
    await expect(s.addUrl(nb.id, "http://hoc.example/x")).rejects.toThrow("https");
    await expect(s.addUrl(nb.id, "linh tinh")).rejects.toThrow("Link chưa đúng");
  });
});

describe("hỏi đáp chỉ từ nguồn", () => {
  async function setup() {
    const s = new NotebookStore(home, deps());
    const nb = s.create("KHTN");
    const a = await s.addFile(nb.id, file("quang-hop.pdf"));
    const b = await s.addFile(nb.id, file("ho-hap.pdf", "#hh#"));
    return { s, nb, a, b };
  }
  it("có đoạn liên quan: gửi kèm đoạn nguồn đánh số, trả về trích dẫn đúng nguồn", async () => {
    const { s, nb, a } = await setup();
    let seen = { system: "", user: "" };
    const m = await s.ask(nb.id, "Quang hợp giải phóng khí gì?", async (system, user) => ((seen = { system, user }), "Quang hợp giải phóng khí oxygen [1]."));
    expect(seen.system).toContain("CHỈ dựa trên các NGUỒN");
    expect(seen.user).toContain("[1] (quang-hop.pdf · Trang 1)");
    expect(seen.user).not.toContain("Hô hấp tế bào");
    expect(m).toMatchObject({ role: "assistant", grounded: true });
    expect(m.citations).toEqual([expect.objectContaining({ n: 1, sourceId: a.id, title: "quang-hop.pdf", ref: "Trang 1" })]);
    expect(s.get(nb.id).messages.map((x) => x.role)).toEqual(["user", "assistant"]);
  });
  it("không có đoạn nào liên quan: trả lời «không tìm thấy» và KHÔNG gọi AI", async () => {
    const { s, nb } = await setup();
    let called = false;
    const m = await s.ask(nb.id, "Thủ đô của nước Pháp là gì?", async () => ((called = true), "Paris"));
    expect(called).toBe(false);
    expect(m).toMatchObject({ text: NOT_FOUND, grounded: false });
  });
  it("tắt nguồn thì không dùng nguồn đó; tắt hết thì báo", async () => {
    const { s, nb, a, b } = await setup();
    s.toggleSource(nb.id, a.id, false);
    let user = "";
    await s.ask(nb.id, "quang hợp", async (_s, u) => ((user = u), NOT_FOUND));
    expect(user).not.toContain("quang-hop.pdf");
    s.toggleSource(nb.id, b.id, false);
    await expect(s.ask(nb.id, "quang hợp", async () => "x")).rejects.toThrow("Chưa có nguồn nào sẵn sàng");
  });
  it("AI trả lời không trích dẫn hoặc từ chối: đánh dấu không dựa trên nguồn", async () => {
    const { s, nb } = await setup();
    expect(await s.ask(nb.id, "quang hợp là gì", async () => "Là quá trình của cây.")).toMatchObject({ grounded: false, citations: [] });
    expect(await s.ask(nb.id, "quang hợp là gì", async () => `${NOT_FOUND}`)).toMatchObject({ grounded: false });
  });
  it("hỏi tóm tắt: lấy đoạn rải đều từ mọi nguồn đang bật", async () => {
    const { s, nb } = await setup();
    let user = "";
    await s.ask(nb.id, "Tóm tắt các nguồn", async (_s, u) => ((user = u), "Tóm tắt [1][2]"));
    expect(user).toContain("quang-hop.pdf");
    expect(user).toContain("ho-hap.pdf");
  });
  it("AI lỗi: không để lại câu hỏi treo; xóa nguồn, xóa sổ", async () => {
    const { s, nb, a } = await setup();
    await expect(s.ask(nb.id, "quang hợp", async () => { throw new Error("mạng"); })).rejects.toThrow("mạng");
    expect(s.get(nb.id).messages).toEqual([]);
    s.removeSource(nb.id, a.id);
    expect(s.get(nb.id).sources).toHaveLength(1);
    s.remove(nb.id);
    expect(s.list()).toEqual([]);
  });
  it("trích dẫn YouTube có link nhảy đúng mốc thời gian", async () => {
    const s = new NotebookStore(home, deps({ youtube: async () => ({ segments: [{ ref: "1:05", text: PHOTO }] }) }));
    const nb = s.create("V");
    await s.addUrl(nb.id, "https://youtu.be/dQw4w9WgXcQ");
    const m = await s.ask(nb.id, "quang hợp tạo ra khí gì", async () => "Khí oxygen [1].");
    expect(m.citations?.[0]?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s");
  });
});

describe("hai tiến trình dùng chung một thư mục (Chat và add-in)", () => {
  it("sổ sửa ở tiến trình kia hiện ngay; sổ bị xóa thì get báo lỗi và không còn trong danh sách", () => {
    const a = new NotebookStore(home, deps());
    const b = new NotebookStore(home, deps());
    const nb = a.create("Sổ A");
    expect(b.get(nb.id).name).toBe("Sổ A");
    // mtime có độ phân giải thô: ép lệch để chắc chắn phát hiện thay đổi
    a.rename(nb.id, "Sổ A (đổi)");
    const f = path.join(home, "notebooks", nb.id, "notebook.json");
    fs.utimesSync(f, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    expect(b.get(nb.id).name).toBe("Sổ A (đổi)");
    expect(b.list().map((x) => x.name)).toEqual(["Sổ A (đổi)"]);
    a.remove(nb.id);
    expect(() => b.get(nb.id)).toThrow();
    expect(b.list()).toEqual([]);
  });
});
