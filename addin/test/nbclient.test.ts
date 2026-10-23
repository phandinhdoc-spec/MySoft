import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import { addFiles } from "../src/files";
import { NbClient, UPLOAD_CHUNK } from "../src/nbClient";

function fake() {
  const sent: ClientMessage[] = [];
  let handler: (m: ServerMessage) => void = () => {};
  return {
    sent,
    emit: (m: ServerMessage) => handler(m),
    tx: {
      send: (m: ClientMessage) => (sent.push(m), true),
      onMessage: (h: (m: ServerMessage) => void) => ((handler = h), () => {}),
    },
  };
}

describe("NbClient", () => {
  it("call: nhận nb_reply đúng req; lỗi từ bridge thành Error", async () => {
    const f = fake();
    const c = new NbClient(f.tx);
    const p = c.call("nb.list");
    const req = (f.sent[0] as { req: string }).req;
    f.emit({ type: "nb_reply", req: "khac", ok: true, data: 1 });
    f.emit({ type: "nb_reply", req, ok: true, data: [{ id: "a" }] });
    expect(await p).toEqual([{ id: "a" }]);
    const q = c.call("nb.get", { id: "x" });
    f.emit({ type: "nb_reply", req: (f.sent[1] as { req: string }).req, ok: false, error: "Không có sổ." });
    await expect(q).rejects.toThrow("Không có sổ.");
  });
  it("call: chưa kết nối thì báo lỗi ngay", async () => {
    const c = new NbClient({ send: () => false, onMessage: () => () => {} });
    await expect(c.call("nb.list")).rejects.toThrow("Chưa kết nối");
  });
  it("upload: chia phần, chờ xác nhận từng phần, phần cuối trả kết quả", async () => {
    const f = fake();
    const c = new NbClient(f.tx);
    const file = new File([new Uint8Array(UPLOAD_CHUNK + 10).fill(65)], "a.pdf");
    const seen: number[] = [];
    const p = c.upload<{ text: string }>(file, { purpose: "ocr", onProgress: (d) => seen.push(d) });
    await new Promise((r) => setTimeout(r, 20));
    const m0 = f.sent[0] as Extract<ClientMessage, { type: "nb_upload" }>;
    expect(m0).toMatchObject({ part: 0, last: false, name: "a.pdf", purpose: "ocr" });
    expect(f.sent).toHaveLength(1); // chưa gửi phần 2 khi chưa có xác nhận
    f.emit({ type: "nb_reply", req: `${m0.req}#0`, ok: true, data: { received: true } });
    await new Promise((r) => setTimeout(r, 20));
    const m1 = f.sent[1] as Extract<ClientMessage, { type: "nb_upload" }>;
    expect(m1).toMatchObject({ part: 1, last: true, req: m0.req });
    expect(atob(m1.data)).toHaveLength(10);
    f.emit({ type: "nb_reply", req: `${m0.req}#1`, ok: true, data: { text: "[Trang 1]\nchữ" } });
    expect(await p).toEqual({ text: "[Trang 1]\nchữ" });
    expect(seen).toEqual([1, 2]);
  });
  it("upload lỗi giữa chừng: hủy phiên tải phía bridge", async () => {
    const f = fake();
    const c = new NbClient(f.tx);
    const p = c.upload(new File(["x"], "a.md"), { purpose: "notebook", nb: "n" });
    await new Promise((r) => setTimeout(r, 20));
    const m = f.sent[0] as Extract<ClientMessage, { type: "nb_upload" }>;
    f.emit({ type: "nb_reply", req: `${m.req}#0`, ok: false, error: "Tệp quá 30 MB." });
    await expect(p).rejects.toThrow("30 MB");
    expect(f.sent.at(-1)).toMatchObject({ type: "nb_cancel", req: m.req });
  });
  it("nb_changed gọi bộ lắng nghe", () => {
    const f = fake();
    const c = new NbClient(f.tx);
    const ids: string[] = [];
    c.onChanged((id) => ids.push(id));
    f.emit({ type: "nb_changed", id: "abc" });
    expect(ids).toEqual(["abc"]);
  });
});

describe("addFiles: PDF scan → OCR qua bridge", () => {
  // PDF tối thiểu không có chữ: pdf.js đọc được nhưng không có lớp chữ, hoặc hỏng; chỉ kiểm tra nhánh không-OCR giữ nguyên lý do.
  it("PDF hỏng thì không gọi OCR", async () => {
    let called = 0;
    const sent: ClientMessage[] = [];
    const r = await addFiles([new File([new Uint8Array([1, 2, 3])], "hong.pdf")], { scope: "chat", id: "c1" }, (m) => (sent.push(m), true), {
      ocr: async () => (called++, { ok: true, text: "x" }),
    });
    expect(called).toBe(0);
    expect(r.added).toEqual([]);
    expect(r.skipped[0]?.reason).toContain("PDF");
  });
});
