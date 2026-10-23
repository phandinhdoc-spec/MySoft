import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import { Engine, type RunRequest } from "../src/engine.js";
import { ProbeStore } from "../src/probe.js";
import { startServer, type RunningServer } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, "fixtures", "fake-cli.mjs");

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function boot(opts: { permission?: "read" | "ask" | "full"; closeGraceMs?: number; flushLearnMs?: number } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-e2e-"));
  if (opts.permission) fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ permission: opts.permission }));
  const env = { ...process.env, PVTA_CLAUDE_BIN: FAKE, FAKE_MODE: "ok" };
  const engine = new Engine({ probe: new ProbeStore(path.join(home, "probe.json")), env });
  server = await startServer({ home, port: 0, engine, closeGraceMs: opts.closeGraceMs ?? 30_000, flushLearnMs: opts.flushLearnMs ?? 50, allowNoOrigin: true, idleCheckMs: 3_600_000 });
  return { home, port: server.port };
}

class Client {
  msgs: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  constructor(public ws: WebSocket) {
    ws.on("message", (d) => {
      this.msgs.push(JSON.parse(String(d)) as ServerMessage);
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  static async connect(port: number, headers: Record<string, string> = {}): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
    await new Promise<void>((res, rej) => {
      ws.once("open", () => res());
      ws.once("error", rej);
      ws.once("unexpected-response", (_r, resp) => rej(new Error(`HTTP ${resp.statusCode}`)));
    });
    return new Client(ws);
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  async until<T extends ServerMessage["type"]>(type: T, timeout = 8000): Promise<Extract<ServerMessage, { type: T }>> {
    const t0 = Date.now();
    for (;;) {
      const i = this.msgs.findIndex((m) => m.type === type);
      if (i >= 0) return this.msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`hết giờ chờ '${type}'; đã nhận: ${JSON.stringify(this.msgs.map((m) => m.type))}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
}

const hello = (sessionId: string): ClientMessage => ({ type: "hello", host: "word", sessionId, lang: "vi" });
const MODEL = { backend: "claude", model: "sonnet" } as const;

describe("bridge: mức suy nghĩ", () => {
  async function bootStub() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-e2e-eff-"));
    const seen: RunRequest[] = [];
    const stub = { run: async (req: RunRequest) => (seen.push(req), { text: "ok", conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } }) } as unknown as Engine;
    server = await startServer({ home, port: 0, engine: stub, allowNoOrigin: true, idleCheckMs: 3_600_000 });
    return { home, seen, port: server.port };
  }
  it("mặc định thấp; claude nhận effort, được lưu và trả lại trong ready", async () => {
    const { home, seen, port } = await bootStub();
    const c = await Client.connect(port);
    c.send(hello("e1"));
    expect((await c.until("ready")).effort).toBe("low");
    c.send({ type: "chat", id: "m1", text: "x", model: MODEL, effort: "high" });
    await c.until("done");
    expect(seen[0]?.effort).toBe("high");
    expect(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).effort).toBe("high");
    // Không gửi effort thì dùng mức đã lưu.
    c.send({ type: "chat", id: "m2", text: "y", model: MODEL });
    await c.until("done");
    expect(seen[1]?.effort).toBe("high");
    c.ws.close();
    const c2 = await Client.connect(port);
    c2.send(hello("e2"));
    expect((await c2.until("ready")).effort).toBe("high");
    c2.ws.close();
  });
  it("agy cũng nhận effort; giá trị lạ bị bỏ qua", async () => {
    const { seen, port } = await bootStub();
    const c = await Client.connect(port);
    c.send(hello("e3"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "x", model: { backend: "agy", model: "m" }, effort: "max" });
    await c.until("done");
    expect(seen[0]?.effort).toBe("max");
    c.send({ type: "chat", id: "m2", text: "y", model: MODEL, effort: "banana" as never });
    await c.until("done");
    expect(seen[1]?.effort).toBe("max"); // giá trị lạ bị bỏ, dùng mức đã lưu ở lượt trước (không phải 'banana')
    c.ws.close();
  });
});

describe("bridge end-to-end (CLI giả)", () => {
  it("chat thường: ready → chữ truyền về → done kèm thời gian", async () => {
    const { port } = await boot();
    const c = await Client.connect(port);
    c.send(hello("s1"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "chào", model: MODEL });
    const done = await c.until("done");
    const text = c.msgs.filter((m) => m.type === "text_delta").map((m) => (m as { text: string }).text).join("");
    expect(text).toBe("Xin chào thầy cô.");
    expect(done.timings.rounds).toBe(1);
    expect(done.timings.firstTokenMs).toBeDefined();
    c.ws.close();
  });

  it("chế độ toàn quyền: model gọi công cụ → rpc_request → kết quả → vòng sau → done", async () => {
    const { port } = await boot({ permission: "full" });
    const c = await Client.connect(port);
    c.send(hello("s2"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "SỬA_VĂN_BẢN", model: MODEL });
    const rpc = await c.until("rpc_request");
    expect(rpc.call).toEqual({ tool: "office_word_insert_text", args: { text: "xin chào" } });
    c.send({ type: "rpc_response", id: rpc.id, ok: true, result: "đã chèn" });
    const done = await c.until("done");
    expect(done.timings.rounds).toBe(2);
    expect(done.timings.rpcMs).toHaveLength(1);
    // Khối công cụ không lọt ra giao diện.
    const shown = c.msgs.filter((m) => m.type === "text_delta").map((m) => (m as { text: string }).text).join("");
    expect(shown).not.toContain("office-tool");
    expect(shown).toContain("Đã xong.");
    c.ws.close();
  });

  it("mức Hỏi: phải được đồng ý mới chạy; từ chối thì model nhận lỗi", async () => {
    const { port } = await boot({ permission: "ask" });
    const c = await Client.connect(port);
    c.send(hello("s3"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "SỬA_VĂN_BẢN", model: MODEL });
    const ap = await c.until("approval_request");
    expect(ap.call.tool).toBe("office_word_insert_text");
    c.send({ type: "approval", id: ap.id, approved: false });
    await c.until("done");
    expect(c.msgs.some((m) => m.type === "rpc_request")).toBe(false); // không chạm vào văn bản
    expect(c.msgs.some((m) => m.type === "tool_status" && m.status === "denied")).toBe(true);
    c.ws.close();
  });

  it("mức Hỏi: đồng ý thì chạy", async () => {
    const { port } = await boot({ permission: "ask" });
    const c = await Client.connect(port);
    c.send(hello("s4"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "SỬA_VĂN_BẢN", model: MODEL });
    const ap = await c.until("approval_request");
    c.send({ type: "approval", id: ap.id, approved: true });
    const rpc = await c.until("rpc_request");
    c.send({ type: "rpc_response", id: rpc.id, ok: true, result: "ok" });
    await c.until("done");
    c.ws.close();
  });

  it("chỉ đọc: chặn công cụ ghi, vẫn cho đọc", async () => {
    const { port } = await boot({ permission: "read" });
    const c = await Client.connect(port);
    c.send(hello("s5"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "SỬA_VĂN_BẢN", model: MODEL });
    await c.until("done");
    expect(c.msgs.some((m) => m.type === "rpc_request" || m.type === "approval_request")).toBe(false);
    c.send({ type: "chat", id: "m2", text: "ĐỌC_VĂN_BẢN", model: MODEL });
    const rpc = await c.until("rpc_request");
    expect(rpc.call.tool).toBe("office_word_get_body");
    c.send({ type: "rpc_response", id: rpc.id, ok: true, result: "nội dung" });
    await c.until("done");
    c.ws.close();
  });

  it("lỗi CLI được báo rõ cho add-in", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-e2e-"));
    const engine = new Engine({ probe: new ProbeStore(path.join(home, "p.json")), env: { ...process.env, PVTA_CLAUDE_BIN: FAKE, FAKE_MODE: "auth" } });
    server = await startServer({ home, port: 0, engine, allowNoOrigin: true, idleCheckMs: 3_600_000 });
    const c = await Client.connect(server.port);
    c.send(hello("s6"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "chào", model: MODEL });
    const err = await c.until("error");
    expect(err.kind).toBe("auth");
    c.ws.close();
  });

  it("chặn kết nối từ Origin lạ (trang web bất kỳ)", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-e2e-"));
    server = await startServer({ home, port: 0, idleCheckMs: 3_600_000 }); // không allowNoOrigin
    await expect(Client.connect(server.port, { Origin: "https://evil.example" })).rejects.toThrow(/401|403|HTTP/);
    await expect(Client.connect(server.port)).rejects.toThrow(/HTTP/); // thiếu Origin
    const ok = await Client.connect(server.port, { Origin: "https://localhost:3000" });
    ok.ws.close();
  });

  it("đóng panel: chờ rồi xóa thư mục ẩn; tải lại panel thì giữ phiên", async () => {
    const { port } = await boot({ closeGraceMs: 300 });
    const c1 = await Client.connect(port);
    c1.send(hello("phien-x"));
    await c1.until("ready");
    const dir = path.join(server!.workspace.root, "phien-x");
    expect(fs.existsSync(dir)).toBe(true);

    // Tải lại trong thời gian chờ: không bị xóa.
    c1.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    const c2 = await Client.connect(port);
    c2.send(hello("phien-x"));
    await c2.until("ready");
    await new Promise((r) => setTimeout(r, 500));
    expect(fs.existsSync(dir)).toBe(true);

    // Đóng hẳn: sau thời gian chờ thì bị xóa.
    c2.ws.close();
    const t0 = Date.now();
    while (fs.existsSync(dir) && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("lưu lựa chọn quyền theo người dùng", async () => {
    const { port, home } = await boot();
    const c = await Client.connect(port);
    c.send(hello("s7"));
    const first = await c.until("ready");
    expect(first.permission).toBeNull();
    c.send({ type: "set_permission", level: "ask" });
    await new Promise((r) => setTimeout(r, 100));
    expect(JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).permission).toBe("ask");
    c.ws.close();
  });
});
