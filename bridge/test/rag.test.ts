import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, RagSegment, ServerMessage } from "@pvta/shared";
import type { Engine, RunRequest } from "../src/engine.js";
import { startServer, type RunningServer } from "../src/server.js";

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

class Client {
  msgs: ServerMessage[] = [];
  constructor(public ws: WebSocket) {
    ws.on("message", (d) => this.msgs.push(JSON.parse(String(d)) as ServerMessage));
  }
  static async connect(port: number) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((res, rej) => (ws.once("open", () => res()), ws.once("error", rej)));
    return new Client(ws);
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  async until<T extends ServerMessage["type"]>(type: T, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 5000) {
    const t0 = Date.now();
    for (;;) {
      const i = this.msgs.findIndex((m) => m.type === type && pred(m as never));
      if (i >= 0) return this.msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`hết giờ chờ '${type}'; đã nhận: ${JSON.stringify(this.msgs.map((m) => m.type))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

const filler = (k: number) => `Phần mở rộng số ${k} nêu ví dụ và bài tập vận dụng để học sinh luyện tập thêm ở nhà. `.repeat(30);
function lesson(): RagSegment[] {
  const secs: Array<[string, string[]]> = [
    ["Bài 1 > Quang hợp", ["Quang hợp là quá trình lá cây hấp thụ ánh sáng để tổng hợp chất hữu cơ.", "Phương trình: 6CO2 + 6H2O → C6H12O6 + 6O2, diễn ra ở lục lạp.", filler(1)]],
    ["Bài 2 > Điện học", ["Định luật Ôm: cường độ dòng điện tỉ lệ thuận với hiệu điện thế.", "Công thức I = U / R, I đo bằng ampe.", filler(2)]],
    ["Bài 3 > Axit và bazơ", ["Axit làm quỳ tím hóa đỏ.", "Bazơ làm quỳ tím hóa xanh và phenolphtalein hóa hồng.", filler(3)]],
  ];
  let n = 1;
  return secs.flatMap(([section, texts]) => texts.map((text) => ({ ref: `Đoạn ${n++}`, text, section })));
}

async function boot(config: object = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-rag-"));
  fs.writeFileSync(path.join(home, "probe.json"), JSON.stringify({ claude: { fingerprint: "1", flags: [], unsupported: [], installed: true } }));
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify(config));
  const prompts: string[] = [];
  const toolReplies: string[] = [];
  const stub = {
    run: async (req: RunRequest) => {
      prompts.push(req.buildPrompt(false, false));
      return { text: "ok", conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } };
    },
  } as unknown as Engine;
  server = await startServer({ home, port: 0, engine: stub, allowNoOrigin: true, idleCheckMs: 3_600_000, ipad: false, update: { app: false } });
  const c = await Client.connect(server.port);
  c.send({ type: "hello", host: "word", sessionId: "rag000001", lang: "vi", doc: "Bai-hoc.docx" });
  await c.until("ready");
  return { c, prompts, toolReplies, home };
}

const ask = async (c: Client, id: string, text: string, context?: { selection?: string; where?: string }) => {
  c.send({ type: "chat", id, text, model: { backend: "claude", model: "haiku" }, context } as ClientMessage);
  await c.until("done", (m) => m.id === id);
};

describe("bridge: RAG từ tệp đang mở", () => {
  it("báo chưa có chỉ mục; dựng xong thì báo số đoạn; câu hỏi nhận đúng đoạn kèm nhãn nguồn", async () => {
    const { c, prompts } = await boot();
    const s0 = await c.until("rag");
    expect(s0).toMatchObject({ enabled: true, ready: false });

    c.send({ type: "rag_build", name: "Bai-hoc.docx", segments: lesson(), fp: "abc" });
    const s1 = await c.until("rag", (m) => m.ready);
    expect(s1.name).toBe("Bai-hoc.docx");
    expect(s1.chunks).toBeGreaterThanOrEqual(3);
    expect(s1.fp).toBe("abc");
    expect(typeof s1.ms).toBe("number");

    await ask(c, "q1", "Phương trình quang hợp là gì?");
    const p = prompts.at(-1)!;
    expect(p).toContain(`TÀI LIỆU ĐANG MỞ — "Bai-hoc.docx"`);
    expect(p).toContain("6CO2");
    expect(p).toMatch(/\[Đoạn \d+[^\]]*Quang hợp\]/);
    expect(p).not.toContain("phenolphtalein"); // đoạn không liên quan không được đưa vào
    expect(p.indexOf(`TÀI LIỆU ĐANG MỞ — "`)).toBeLessThan(p.indexOf("Phương trình quang hợp là gì?"));
  });

  it("câu nối tiếp dùng câu trước; hỏi cả tài liệu thì nhận dàn ý", async () => {
    const { c, prompts } = await boot();
    c.send({ type: "rag_build", name: "Bai-hoc.docx", segments: lesson() });
    await c.until("rag", (m) => m.ready);
    await ask(c, "q1", "Định luật Ôm nói gì?");
    await ask(c, "q2", "còn đơn vị của nó là gì?", { selection: "Công thức I = U / R" });
    expect(prompts.at(-1)!).toContain("ampe");
    await ask(c, "q3", "Tóm tắt toàn bộ bài");
    const p = prompts.at(-1)!;
    expect(p).toContain("Dàn ý toàn tài liệu");
    for (const m of ["Quang hợp", "Điện học", "Axit và bazơ"]) expect(p).toContain(m);
  });

  it("tắt thì không chèn; xóa thì hết; bật lại thì chèn lại", async () => {
    const { c, prompts } = await boot();
    c.send({ type: "rag_build", name: "Bai-hoc.docx", segments: lesson() });
    await c.until("rag", (m) => m.ready);
    c.send({ type: "rag_set", enabled: false });
    expect((await c.until("rag", (m) => !m.enabled)).ready).toBe(true);
    await ask(c, "q1", "Phương trình quang hợp");
    expect(prompts.at(-1)!).not.toContain(`TÀI LIỆU ĐANG MỞ — "`);
    c.send({ type: "rag_set", enabled: true });
    await c.until("rag", (m) => m.enabled);
    await ask(c, "q2", "Phương trình quang hợp");
    expect(prompts.at(-1)!).toContain("6CO2");
    c.send({ type: "rag_clear" });
    expect((await c.until("rag", (m) => !m.ready)).chunks).toBeUndefined();
    await ask(c, "q3", "Phương trình quang hợp");
    expect(prompts.at(-1)!).not.toContain(`TÀI LIỆU ĐANG MỞ — "`);
  });

  it("đã tắt trong cấu hình thì kết nối mới thấy tắt; tin hỏng không làm sập", async () => {
    const { c } = await boot({ rag: { enabled: false } });
    expect((await c.until("rag")).enabled).toBe(false);
    c.send({ type: "rag_build", name: "x", segments: "không phải mảng" as never });
    c.send({ type: "rag_build", name: "x", segments: [null, { ref: 1 }, { ref: "a", text: "ok" }] as never });
    const s = await c.until("rag", (m) => m.ready);
    expect(s.chunks).toBe(1);
  });
});
