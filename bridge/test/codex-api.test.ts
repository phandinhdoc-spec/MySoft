import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { resolveAuto, type ClientMessage, type ServerMessage } from "@pvta/shared";
import { ApiClient } from "../src/api.js";
import { codexBackend } from "../src/backends/codex.js";
import { newParseState } from "../src/backends/types.js";
import { Engine, type RunRequest } from "../src/engine.js";
import { EngineError } from "../src/errors.js";
import { ProbeStore } from "../src/probe.js";
import { startServer, type RunningServer } from "../src/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CODEX = path.join(here, "fixtures", "fake-codex.mjs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pvta-cx-"));

describe("backend codex", () => {
  it("lệnh gọi: exec --json, sandbox chỉ đọc, prompt qua stdin, effort qua --config", () => {
    const inv = codexBackend.invocation({ model: "gpt-5.5", prompt: "hi", permission: "full", effort: "max" });
    const flat = inv.args.flatMap((a) => (a.value === undefined ? [a.flag] : [a.flag, a.value]));
    expect(flat).toEqual([
      "--config", 'model_reasoning_effort="max"',
      "exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never",
      "--model", "gpt-5.5", "-",
    ]);
    expect(inv.stdin).toBe("hi");
    // Toàn quyền vẫn không mở sandbox: codex không cần ghi gì lên máy.
    expect(flat).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
  it("chế độ Nhanh: service_tier lấy từ danh mục model, đặt trước exec; không Nhanh thì không có", () => {
    const flat = (speed?: string) =>
      codexBackend.invocation({ model: "gpt-6.1-sol", prompt: "x", permission: "ask", speed }).args.flatMap((a) => (a.value === undefined ? [a.flag] : [a.flag, a.value]));
    const fast = flat("priority");
    expect(fast.slice(0, 4)).toEqual(["--config", 'service_tier="priority"', "--config", "features.fast_mode=true"]);
    expect(fast.indexOf("exec")).toBeGreaterThan(fast.indexOf('service_tier="priority"'));
    expect(flat(undefined).join(" ")).not.toContain("service_tier");
    expect(flat('x"; rm -rf').join(" ")).not.toContain("service_tier"); // mã lạ bị bỏ, không chèn vào cấu hình
  });
  it("tiếp tục hội thoại: tùy chọn đặt trước 'resume <id> -'; model mặc định thì không có --model", () => {
    const inv = codexBackend.invocation({ model: "default", prompt: "x", permission: "ask", conversationId: "t-9" });
    const flat = inv.args.map((a) => a.flag);
    expect(flat.slice(-3)).toEqual(["resume", "t-9", "-"]);
    expect(flat).not.toContain("--model");
  });
  it("phân tích JSONL: chỉ lấy agent_message, truyền phần mới, lấy thread_id, nhận lỗi", () => {
    const st = newParseState();
    const lines = [
      { type: "thread.started", thread_id: "th1" },
      { type: "item.completed", item: { id: "r", type: "reasoning", text: "ẩn" } },
      { type: "item.updated", item: { id: "a", type: "agent_message", text: "Xin" } },
      { type: "item.completed", item: { id: "a", type: "agent_message", text: "Xin chào" } },
      { type: "item.completed", item: { id: "b", type: "agent_message", text: "Đoạn hai" } },
    ];
    const out = lines.map((l) => codexBackend.parseLine(JSON.stringify(l), st) ?? "").join("");
    expect(out).toBe("Xin chào\n\nĐoạn hai");
    expect(st.text).toBe(out);
    expect(st.conversationId).toBe("th1");
    codexBackend.parseLine(JSON.stringify({ type: "turn.failed", error: { message: "hết lượt" } }), st);
    expect(st.error?.message).toBe("hết lượt");
  });
  it("định dạng cũ (msg.agent_message)", () => {
    const st = newParseState();
    codexBackend.parseLine(JSON.stringify({ id: "0", msg: { type: "session_configured", session_id: "s-old" } }), st);
    expect(codexBackend.parseLine(JSON.stringify({ id: "1", msg: { type: "agent_message", message: "Chào" } }), st)).toBe("Chào");
    expect(st.conversationId).toBe("s-old");
  });
  it("engine với codex giả: chạy, nhận thread_id, lượt sau resume chỉ gửi phần mới", async () => {
    const dir = tmp();
    const log = path.join(dir, "calls.log");
    const engine = new Engine({ probe: new ProbeStore(path.join(dir, "p.json")), env: { ...process.env, PVTA_CODEX_BIN: FAKE_CODEX, FAKE_LOG: log } });
    const req = { backend: "codex" as const, model: "default", cwd: dir, permission: "ask" as const, effort: "low" as const };
    const r1 = await engine.run({ ...req, buildPrompt: (resumed) => (resumed ? "mới" : "ĐẦY ĐỦ ĐẦY ĐỦ") });
    expect(r1.text).toBe("Chào (13)");
    expect(r1.conversationId).toBe("thread-1");
    const r2 = await engine.run({ ...req, conversationId: r1.conversationId, buildPrompt: (resumed) => (resumed ? "mới" : "ĐẦY ĐỦ ĐẦY ĐỦ") });
    expect(r2.text).toBe("Chào (3)");
    const calls = fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]).filter((a) => !a.includes("--help") && !a.includes("--version"));
    expect(calls[1]).toContain("resume");
  });
  it("engine với codex giả: lỗi đăng nhập được phân loại 'auth'", async () => {
    const dir = tmp();
    const engine = new Engine({ probe: new ProbeStore(path.join(dir, "p.json")), env: { ...process.env, PVTA_CODEX_BIN: FAKE_CODEX, FAKE_MODE: "auth" } });
    await expect(engine.run({ backend: "codex", model: "default", cwd: dir, permission: "ask", buildPrompt: () => "x" })).rejects.toMatchObject({ kind: "auth" });
  });
  it("lệnh không tồn tại: kind 'missing'", async () => {
    const dir = tmp();
    const engine = new Engine({ probe: new ProbeStore(path.join(dir, "p.json")), env: { ...process.env, PVTA_CODEX_BIN: path.join(dir, "khong-co") } });
    await expect(engine.run({ backend: "codex", model: "default", cwd: dir, permission: "ask", buildPrompt: () => "x" })).rejects.toMatchObject({ kind: "missing" });
  });
});

// ---- API ----

let httpSrv: http.Server | undefined;
afterEach(async () => {
  if (httpSrv) await new Promise((r) => httpSrv!.close(() => r(undefined)));
  httpSrv = undefined;
});

async function fakeApi(handler: http.RequestListener): Promise<string> {
  httpSrv = http.createServer(handler);
  await new Promise<void>((r) => httpSrv!.listen(0, "127.0.0.1", () => r()));
  const a = httpSrv.address() as { port: number };
  return `http://127.0.0.1:${a.port}/v1`;
}

const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

describe("backend api", () => {
  const apiReq = (model: string): RunRequest => ({ backend: "api", model, cwd: ".", permission: "ask", buildPrompt: () => "PROMPT" });

  it("OpenAI-compatible: gửi bearer, nhận luồng SSE theo từng đoạn", async () => {
    let seen: { auth?: string; body?: Record<string, unknown> } = {};
    const base = await fakeApi(async (req, res) => {
      seen = { auth: req.headers.authorization, body: JSON.parse(await readBody(req)) as Record<string, unknown> };
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Xin "}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":"chào"}}]}\r\n\r\n');
      res.end("data: [DONE]\n\n");
    });
    const api = new ApiClient({ settings: () => ({ compatible: { baseUrl: base, key: "k1" } }) });
    const deltas: string[] = [];
    const r = await api.run({ ...apiReq("compatible/llama3"), onDelta: (t) => deltas.push(t) });
    expect(r.text).toBe("Xin chào");
    expect(deltas).toEqual(["Xin ", "chào"]);
    expect(r.conversationId).toBeUndefined();
    expect(seen.auth).toBe("Bearer k1");
    expect(seen.body).toMatchObject({ model: "llama3", stream: true, messages: [{ role: "user", content: "PROMPT" }] });
  });

  it("Anthropic: x-api-key, sự kiện content_block_delta", async () => {
    let key: string | undefined;
    const base = await fakeApi((req, res) => {
      key = req.headers["x-api-key"] as string;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Chào"}}\n\n');
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
    const api = new ApiClient({ settings: () => ({ anthropic: { key: "sk-ant-x", baseUrl: base } }) });
    expect((await api.run(apiReq("anthropic/claude-haiku-5-5"))).text).toBe("Chào");
    expect(key).toBe("sk-ant-x");
  });

  it("lỗi HTTP được phân loại; chưa có khóa thì 'missing'", async () => {
    const base = await fakeApi((_q, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid x-api-key" } }));
    });
    const api = new ApiClient({ settings: () => ({ openai: { key: "bad", baseUrl: base } }) });
    await expect(api.run(apiReq("openai/gpt-5.5"))).rejects.toMatchObject({ kind: "auth" });
    const none = new ApiClient({ settings: () => ({}) });
    await expect(none.run(apiReq("gemini/gemini-flash-latest"))).rejects.toBeInstanceOf(EngineError);
    await expect(none.run(apiReq("gemini/gemini-flash-latest"))).rejects.toMatchObject({ kind: "missing" });
  });
});

// ---- Chọn backend theo máy ----

describe("Auto và backend chưa cài", () => {
  it("resolveAuto theo thứ tự agy → claude → codex → API", () => {
    expect(resolveAuto({ agy: { installed: false, version: "" }, claude: { installed: true, version: "1" } }, undefined)).toEqual({ backend: "claude", model: "sonnet" });
    expect(resolveAuto({ codex: { installed: true, version: "1" } }, undefined)).toEqual({ backend: "codex", model: "default" });
    expect(resolveAuto({}, { providers: { openai: { configured: true } } })).toEqual({ backend: "api", model: "openai/gpt-5.4-mini" });
    expect(resolveAuto({}, { providers: {} })).toBeUndefined();
  });

  let server: RunningServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function bootWithBins(bins: Record<string, string>) {
    const home = tmp();
    const seen: RunRequest[] = [];
    const engine = { run: async (req: RunRequest) => (seen.push(req), { text: "ok", conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } }) } as unknown as Engine;
    const old = { ...process.env };
    Object.assign(process.env, bins);
    try {
      const apiFetch = (async () => new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.4-mini" }, { id: "whisper-1" }] }), { status: 200 })) as unknown as typeof fetch;
      server = await startServer({ home, port: 0, engine, discover: true, allowNoOrigin: true, idleCheckMs: 3_600_000, web: false, apiFetch });
    } finally {
      for (const k of Object.keys(bins)) {
        if (old[k] === undefined) delete process.env[k];
        else process.env[k] = old[k];
      }
    }
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    const msgs: ServerMessage[] = [];
    ws.on("message", (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
    await new Promise((r) => ws.once("open", r));
    const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
    const until = async <T extends ServerMessage["type"]>(t: T) => {
      const t0 = Date.now();
      for (;;) {
        const i = msgs.findIndex((m) => m.type === t);
        if (i >= 0) return msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
        if (Date.now() - t0 > 10_000) throw new Error(`hết giờ chờ ${t}: ${msgs.map((m) => m.type)}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    return { home, seen, send, until, ws };
  }

  it("chỉ có codex: Auto chạy codex; chọn claude (chưa cài) thì nhận gợi ý, không chạy", async () => {
    const dir = tmp();
    const t = await bootWithBins({ PVTA_CODEX_BIN: FAKE_CODEX, PVTA_CLAUDE_BIN: path.join(dir, "khong"), PVTA_AGY_BIN: path.join(dir, "khong") });
    t.send({ type: "hello", host: "word", sessionId: "a1", lang: "vi" });
    await t.until("ready");
    t.send({ type: "chat", id: "1", text: "x", model: "auto" });
    expect((await t.until("model_used")).model).toEqual({ backend: "codex", model: "default" });
    await t.until("done");
    expect(t.seen[0]?.backend).toBe("codex");
    t.send({ type: "chat", id: "2", text: "x", model: { backend: "claude", model: "sonnet" } });
    const e = await t.until("error");
    expect(e.kind).toBe("missing");
    expect(e.message).toContain("Codex");
    expect(t.seen).toHaveLength(1);
    t.ws.close();
  });

  it("không có backend nào: báo lỗi kèm hướng dẫn; thêm khóa API thì Auto chạy được", async () => {
    const dir = tmp();
    const nope = path.join(dir, "khong");
    const t = await bootWithBins({ PVTA_CODEX_BIN: nope, PVTA_CLAUDE_BIN: nope, PVTA_AGY_BIN: nope });
    t.send({ type: "hello", host: "word", sessionId: "a2", lang: "vi" });
    await t.until("ready");
    t.send({ type: "chat", id: "1", text: "x", model: "auto" });
    const e = await t.until("error");
    expect(e.kind).toBe("missing");
    expect(e.message).toContain("chưa có backend");
    t.send({ type: "set_api", provider: "openai", key: "sk-test" });
    const after = await t.until("capabilities");
    expect(after.api.providers.openai?.configured).toBe(true);
    expect(JSON.stringify(after)).not.toContain("sk-test"); // khóa không bao giờ gửi về add-in
    // Lưu khóa xong, PVTA tự tải danh sách model (bỏ model không trò chuyện được) và lưu lại cho bộ chọn model.
    const am = await t.until("api_models");
    expect(am.ok).toBe(true);
    expect(am.saved).toBe(true);
    expect(am.models?.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-5.4-mini"]);
    const withModels = await t.until("capabilities");
    expect(withModels.api.providers.openai?.models?.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-5.4-mini"]);
    expect(JSON.stringify(withModels)).not.toContain("sk-test");
    expect(after.auto).toEqual({ backend: "api", model: "openai/gpt-5.4-mini" });
    const cfg = path.join(t.home, "config.json");
    if (process.platform !== "win32") expect(fs.statSync(cfg).mode & 0o077).toBe(0);
    t.send({ type: "chat", id: "2", text: "x", model: "auto" });
    await t.until("done");
    expect(t.seen[0]?.model).toBe("openai/gpt-5.4-mini");
    t.ws.close();
  });
});

describe("backend api: nhiệt độ và mức suy nghĩ", () => {
  const apiReq = (model: string, extra: Partial<RunRequest> = {}): RunRequest => ({ backend: "api", model, cwd: ".", permission: "ask", buildPrompt: () => "P", ...extra });
  const sse = (res: http.ServerResponse) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
  };

  it("Anthropic: gửi temperature + output_config.effort; model từ chối nhiệt độ thì bỏ, gửi lại, ghi chú và nhớ", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const base = await fakeApi(async (req, res) => {
      const b = JSON.parse(await readBody(req)) as Record<string, unknown>;
      bodies.push(b);
      if ("temperature" in b) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "temperature: non-default values are not supported for this model" } }));
        return;
      }
      sse(res);
    });
    const api = new ApiClient({ settings: () => ({ anthropic: { key: "k", baseUrl: base } }) });
    const r = await api.run(apiReq("anthropic/claude-sonnet-5-5", { temperature: 0, effort: "low" }));
    expect(r.text).toBe("ok");
    expect(bodies[0]).toMatchObject({ temperature: 0, output_config: { effort: "low" } });
    expect(bodies[1]).not.toHaveProperty("temperature");
    expect(bodies[1]).toMatchObject({ output_config: { effort: "low" } });
    expect(r.notes?.[0]).toContain("không nhận nhiệt độ");
    await api.run(apiReq("anthropic/claude-sonnet-5-5", { temperature: 0 }));
    expect(bodies).toHaveLength(3); // lần sau không thử lại nhiệt độ
    expect(bodies[2]).not.toHaveProperty("temperature");
  });

  it("OpenAI GPT-5: không gửi nhiệt độ (model không nhận) và báo lại; Gemini/Ollama: gửi nhiệt độ", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const base = await fakeApi(async (req, res) => {
      bodies.push(JSON.parse(await readBody(req)) as Record<string, unknown>);
      sse(res);
    });
    const api = new ApiClient({ settings: () => ({ openai: { key: "k", baseUrl: base }, compatible: { baseUrl: base } }) });
    const r1 = await api.run(apiReq("openai/gpt-5.5", { temperature: 1 }));
    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(r1.notes).toBeDefined();
    const r2 = await api.run(apiReq("compatible/llama3.2", { temperature: 0.3 }));
    expect(bodies[1]).toMatchObject({ temperature: 0.3 });
    expect(r2.notes).toBeUndefined();
  });
});
