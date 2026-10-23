import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import type { Engine, RunRequest } from "../src/engine.js";
import { startServer, type RunningServer } from "../src/server.js";

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** Engine giả: trả lời theo hàm `reply`, ghi lại mọi lời gọi. */
function stubEngine(reply: (req: RunRequest, n: number) => string) {
  const seen: Array<RunRequest & { prompt: string; resumed: boolean }> = [];
  let conv = 0;
  const engine = {
    run: async (req: RunRequest) => {
      const resumed = req.conversationId !== undefined;
      const prompt = (req.system ? req.system + "\n\n" : "") + req.buildPrompt(resumed, !!req.system);
      seen.push({ ...req, prompt, resumed });
      const text = reply(req, seen.length);
      req.onDelta?.(text);
      return { text, conversationId: req.conversationId ?? `c${++conv}`, fullPrompt: !resumed, attempts: 1, timings: { totalMs: 1 } };
    },
  } as unknown as Engine;
  return { engine, seen };
}

async function boot(engine: Engine, permission?: "read" | "ask" | "full", extra: Partial<Parameters<typeof startServer>[0]> = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-robust-"));
  if (permission) fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ permission }));
  server = await startServer({ ...extra, home, port: 0, engine, allowNoOrigin: true, idleCheckMs: 3_600_000, closeGraceMs: 200, flushLearnMs: 50, web: false });
  return { home, port: server.port };
}

class Client {
  msgs: ServerMessage[] = [];
  closed = false;
  constructor(public ws: WebSocket) {
    ws.on("message", (d) => this.msgs.push(JSON.parse(String(d)) as ServerMessage));
    ws.on("close", () => (this.closed = true));
  }
  static async connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((res, rej) => {
      ws.once("open", () => res());
      ws.once("error", rej);
    });
    return new Client(ws);
  }
  send(m: ClientMessage | Record<string, unknown>) {
    this.ws.send(JSON.stringify(m));
  }
  async until<T extends ServerMessage["type"]>(type: T, timeout = 5000): Promise<Extract<ServerMessage, { type: T }>> {
    const t0 = Date.now();
    for (;;) {
      const i = this.msgs.findIndex((m) => m.type === type);
      if (i >= 0) return this.msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`hết giờ chờ '${type}'; đã nhận: ${JSON.stringify(this.msgs.map((m) => m.type))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

const hello = (sessionId: string): ClientMessage => ({ type: "hello", host: "word", sessionId, lang: "vi" });
const SONNET = { backend: "claude", model: "sonnet" } as const;
const PHOTO = "Quang hợp là quá trình cây xanh dùng năng lượng ánh sáng để tổng hợp chất hữu cơ từ khí carbon dioxide và nước, đồng thời giải phóng khí oxygen.";

type Reply = Extract<ServerMessage, { type: "nb_reply" }>;
async function nb(c: Client, method: string, params: Record<string, unknown> = {}): Promise<Reply> {
  const req = `r${Math.random().toString(36).slice(2, 8)}`;
  c.send({ type: "nb", req, method, params });
  for (let i = 0; i < 250; i++) {
    const j = c.msgs.findIndex((m) => m.type === "nb_reply" && m.req === req);
    if (j >= 0) return c.msgs.splice(j, 1)[0] as Reply;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("hết giờ chờ nb_reply " + method);
}
async function upload(c: Client, name: string, text: string, nbId: string, chunk = 40): Promise<Reply> {
  const buf = Buffer.from(text, "utf8");
  const req = `u${Math.random().toString(36).slice(2, 8)}`;
  const parts = Math.ceil(buf.length / chunk);
  let last!: Reply;
  for (let part = 0; part < parts; part++) {
    c.send({ type: "nb_upload", req, purpose: "notebook", nb: nbId, name, part, last: part === parts - 1, data: buf.subarray(part * chunk, (part + 1) * chunk).toString("base64") });
    for (let i = 0; i < 250; i++) {
      const j = c.msgs.findIndex((m) => m.type === "nb_reply" && m.req === `${req}#${part}`);
      if (j >= 0) {
        last = c.msgs.splice(j, 1)[0] as Reply;
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(last?.ok).toBe(true);
  }
  return last;
}
async function ready(c: Client, id: string) {
  for (let i = 0; i < 250; i++) {
    const r = await nb(c, "nb.get", { id });
    const nbk = r.data as { sources: Array<{ state: string }> };
    if (nbk.sources.length && nbk.sources.every((s) => s.state !== "dang-doc")) return nbk;
    await new Promise((r2) => setTimeout(r2, 40));
  }
  throw new Error("nguồn chưa đọc xong");
}

describe("bridge: Sổ nguồn dùng chung với Chat", () => {
  it("tạo sổ, tải tệp từng phần, liên kết → chat được nạp đoạn trích; hỏi sổ; PVTA Chat (cùng thư mục) thấy sổ", async () => {
    const { engine, seen } = stubEngine((req) => (req.system?.includes("nguồn") || req.buildPrompt(false, false).includes("NGUỒN") ? "Quang hợp dùng ánh sáng [1]." : "ok"));
    const { port, home } = await boot(engine, "ask");
    const c = await Client.connect(port);
    c.send(hello("nb1"));
    await c.until("ready");

    const created = await nb(c, "nb.create", { name: "Sinh 7" });
    expect(created.ok).toBe(true);
    const id = (created.data as { id: string }).id;
    const up = await upload(c, "quang-hop.md", PHOTO, id);
    expect((up.data as { queued: number }).queued).toBe(1);
    const book = await ready(c, id);
    expect(book.sources[0]).toMatchObject({ state: "san-sang", title: "quang-hop.md" });

    // Chưa liên kết: chat không thấy sổ.
    c.send({ type: "chat", id: "a", text: "quang hợp là gì", model: SONNET });
    await c.until("done");
    expect(seen[seen.length - 1]!.prompt).not.toContain("DANH MỤC TỆP CỦA SỔ NGUỒN LIÊN KẾT");

    expect((await nb(c, "nb.setLinks", { ids: [id, "0123456789abcdef"] })).data).toEqual([id]);
    c.send({ type: "chat", id: "b", text: "quang hợp là quá trình gì", model: SONNET });
    await c.until("done");
    const prompt = seen[seen.length - 1]!.prompt;
    expect(prompt).toContain("DANH MỤC TỆP CỦA SỔ NGUỒN LIÊN KẾT");
    expect(prompt).toContain("quang-hop.md");
    expect(prompt).toContain("năng lượng ánh sáng");

    const asked = await nb(c, "nb.ask", { id, question: "quang hợp dùng năng lượng gì" });
    expect(asked.ok).toBe(true);
    expect((asked.data as { grounded?: boolean }).grounded).toBe(true);

    // Chat (tiến trình khác) mở cùng thư mục dữ liệu: thấy sổ và nguồn.
    const { NotebookStore } = await import("@pvta/core/notebook/index");
    const other = new NotebookStore(home, { extract: async () => ({ segments: [] }) });
    expect(other.list().map((b) => b.name)).toContain("Sinh 7");
    other.rename(id, "Sinh 7 (đổi từ Chat)");
    expect(((await nb(c, "nb.get", { id })).data as { name: string }).name).toBe("Sinh 7 (đổi từ Chat)");

    // Xóa sổ: liên kết tự bỏ.
    await nb(c, "nb.remove", { id });
    expect((await nb(c, "nb.links")).data).toEqual([]);
    c.ws.close();
  });

  it("không nhận đường dẫn tùy ý, loại tệp lạ, và tệp tải thiếu phần đầu", async () => {
    const { engine } = stubEngine(() => "ok");
    const { port } = await boot(engine, "ask");
    const c = await Client.connect(port);
    c.send(hello("nb2"));
    await c.until("ready");
    const id = ((await nb(c, "nb.create", { name: "S" })).data as { id: string }).id;
    const r = await nb(c, "nb.addFiles", { id, paths: ["/etc/passwd"] });
    expect(r.ok).toBe(false);
    c.send({ type: "nb_upload", req: "x1", purpose: "notebook", nb: id, name: "virus.exe", part: 0, last: true, data: "AA==" });
    const bad = await c.until("nb_reply");
    expect(bad).toMatchObject({ req: "x1#0", ok: false });
    c.send({ type: "nb_upload", req: "x2", purpose: "notebook", nb: id, name: "a.md", part: 3, last: true, data: "AA==" });
    expect(await c.until("nb_reply")).toMatchObject({ req: "x2#3", ok: false });
    c.ws.close();
  });

  it("quy tắc của PVTA Chat: luôn áp dụng vào lời nhắc, #khóa chỉ khi được gọi, và hiện trong workspace", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { port, home } = await boot(engine, "ask");
    fs.mkdirSync(path.join(home, "chatbox"), { recursive: true });
    fs.writeFileSync(
      path.join(home, "chatbox", "state.json"),
      JSON.stringify({
        version: 1,
        preferences: { rules: "Luôn xưng hô thầy cô." },
        ruleBook: [
          { id: "1", key: "ngan", title: "Ngắn gọn", text: "Trả lời tối đa ba câu.", always: false, at: 0 },
          { id: "2", key: "chuan", title: "Chuẩn", text: "Dùng thuật ngữ CT 2018.", always: true, at: 0 },
        ],
      }),
    );
    const c = await Client.connect(port);
    c.send(hello("nb3"));
    await c.until("ready");
    const w = await c.until("workspace");
    expect(w.chatRules?.rules.map((r) => r.key)).toEqual(["ngan", "chuan"]);

    c.send({ type: "chat", id: "a", text: "giải thích quang hợp", model: SONNET });
    await c.until("done");
    let prompt = seen[seen.length - 1]!.prompt;
    expect(prompt).toContain("Luôn xưng hô thầy cô.");
    expect(prompt).toContain("Dùng thuật ngữ CT 2018.");
    expect(prompt).not.toContain("Trả lời tối đa ba câu.");
    c.send({ type: "chat", id: "b", text: "giải thích quang hợp #ngan", model: SONNET });
    await c.until("done");
    prompt = seen[seen.length - 1]!.prompt;
    expect(prompt).toContain("Trả lời tối đa ba câu.");
    c.ws.close();
  });
});
