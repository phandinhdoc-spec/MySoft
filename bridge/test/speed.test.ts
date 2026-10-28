import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import { Engine } from "../src/engine.js";
import { ProbeStore } from "../src/probe.js";
import { startServer, type RunningServer } from "../src/server.js";
import { skillsPrompt, type Skill } from "../src/skills.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, "fixtures", "fake-cli.mjs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pvta-speed-"));
const lines = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean) : []);

function engineWith(mode = "ok", allowPrewarm = false) {
  const dir = tmp();
  const log = path.join(dir, "calls.log");
  const sys = path.join(dir, "sys.log");
  const stdin = path.join(dir, "stdin.log");
  const env = { ...process.env, PVTA_CLAUDE_BIN: FAKE, FAKE_MODE: mode, FAKE_LOG: log, FAKE_SYS_LOG: sys, FAKE_STDIN_LOG: stdin };
  const engine = new Engine({ probe: new ProbeStore(path.join(dir, "p.json")), env, allowPrewarm });
  const calls = () => lines(log).map((l) => JSON.parse(l) as string[]).filter((a) => !a.includes("--version") && !a.includes("--help"));
  return { dir, engine, calls, sysLog: () => (fs.existsSync(sys) ? fs.readFileSync(sys, "utf8") : ""), stdinLog: () => (fs.existsSync(stdin) ? fs.readFileSync(stdin, "utf8") : "") };
}

describe("tốc độ: engine", () => {
  it("quy tắc đi bằng --system-prompt (thay lời nhắc mặc định dài của Claude Code); prompt không lặp lại", async () => {
    const t = engineWith();
    const r = await t.engine.run({
      backend: "claude",
      model: "sonnet",
      cwd: t.dir,
      permission: "ask",
      system: "QUY TẮC PVTA",
      buildPrompt: (_res, sys) => (sys ? "CHỈ YÊU CẦU" : "QUY TẮC PVTA\n\nCHỈ YÊU CẦU"),
    });
    expect(r.text).toBe("Xin chào thầy cô.");
    expect(t.calls()[0]).toContain("--system-prompt");
    expect(t.calls()[0]).toContain("--safe-mode");
    expect(t.sysLog()).toBe("QUY TẮC PVTA");
    expect(t.stdinLog()).toContain("CHỈ YÊU CẦU");
    expect(t.stdinLog()).not.toContain("QUY TẮC PVTA");
  });

  it("CLI cũ không có --system-prompt: bỏ đúng cờ đó, quy tắc chuyển vào prompt; cờ khác giữ nguyên", async () => {
    const t = engineWith("nosys");
    const r = await t.engine.run({
      backend: "claude",
      model: "sonnet",
      cwd: t.dir,
      permission: "ask",
      effort: "low",
      system: "QUY TẮC PVTA",
      buildPrompt: (_res, sys) => (sys ? "YÊU CẦU" : "QUY TẮC PVTA\n\nYÊU CẦU"),
    });
    expect(r.text).toBe("Xin chào thầy cô.");
    const last = t.calls().at(-1)!;
    expect(last).not.toContain("--system-prompt");
    expect(last).toContain("--effort"); // không bị bỏ nhầm chỉ vì --help không liệt kê
    expect(t.stdinLog().split("=====").at(-2)).toContain("QUY TẮC PVTA");
  });

  it("khởi động sẵn: lần gọi dùng tiến trình đã chờ, không khởi động thêm", async () => {
    const t = engineWith('ok',true);
    const base = { backend: "claude" as const, model: "sonnet", cwd: t.dir, permission: "ask" as const, effort: "low" as const, system: "S" };
    expect(await t.engine.prewarm(base)).toBe(true);
    expect(await t.engine.prewarm(base)).toBe(true); // gọi lại: dùng tiến trình cũ, không thêm
    await new Promise((r) => setTimeout(r, 300));
    const r = await t.engine.run({ ...base, buildPrompt: () => "chào" });
    expect(r.timings.warm).toBe(true);
    expect(r.text).toBe("Xin chào thầy cô.");
    expect(t.calls()).toHaveLength(1);
    // Đối số khác (model khác) thì không dùng nhầm tiến trình chờ.
    await t.engine.prewarm(base);
    const r2 = await t.engine.run({ ...base, model: "haiku", buildPrompt: () => "chào" });
    expect(r2.timings.warm).toBe(false);
    t.engine.disposeWarm();
  });
});

describe("tốc độ: prompt", () => {
  it("chỉ nạp skill nền của ứng dụng đang mở", () => {
    const sk = (name: string): Skill => ({ name, description: "d", load: "always", body: `THÂN ${name}`, dir: "", groups: [] });
    const p = skillsPrompt([sk("pvta-word"), sk("pvta-excel"), sk("pvta-powerpoint"), sk("rieng")], "", "excel");
    expect(p).toContain("THÂN pvta-excel");
    expect(p).toContain("THÂN rieng");
    expect(p).not.toContain("THÂN pvta-word");
    expect(p).not.toContain("THÂN pvta-powerpoint");
  });
});

// ---- Qua server ----

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function boot(permission: "ask" | "full" = "ask") {
  const t = engineWith();
  const home = tmp();
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ permission }));
  server = await startServer({ home, port: 0, engine: t.engine, allowNoOrigin: true, idleCheckMs: 3_600_000, web: false });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const msgs: ServerMessage[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
  await new Promise((r) => ws.once("open", r));
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const until = async <T extends ServerMessage["type"]>(type: T) => {
    const t0 = Date.now();
    for (;;) {
      const i = msgs.findIndex((m) => m.type === type);
      if (i >= 0) return msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > 8000) throw new Error(`hết giờ chờ ${type}: ${msgs.map((m) => m.type)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  send({ type: "hello", host: "word", sessionId: `s${Date.now()}`, lang: "vi" });
  await until("ready");
  return { ...t, ws, msgs, send, until };
}
const SONNET = { backend: "claude", model: "sonnet" } as const;

describe("tốc độ và cách ứng xử: qua server", () => {
  it("gửi kèm phần đang chọn: model có ngay nội dung, không cần vòng đọc", async () => {
    const t = await boot();
    t.send({ type: "chat", id: "1", text: "chào", model: SONNET, context: { selection: "Đoạn văn đang chọn." } });
    await t.until("done");
    expect(t.stdinLog()).toContain('<dang_chon vi_tri="">\nĐoạn văn đang chọn.\n</dang_chon>'); // Claude: thẻ XML
    expect(t.stdinLog()).toContain("<yeu_cau>\nchào\n</yeu_cau>");
    t.ws.close();
  });

  it("đang gõ không giữ CLI chờ; chỉ khởi động khi gửi tin nhắn", async () => {
    const t = await boot();
    t.send({ type: "prewarm", kind: "chat", model: SONNET, effort: "low" });
    await new Promise((r) => setTimeout(r, 400));
    expect(t.calls()).toHaveLength(0);
    t.send({ type: "chat", id: "1", text: "chào", model: SONNET, effort: "low" });
    const done = await t.until("done");
    expect(done.timings.warm).not.toBe(true);
    expect(t.calls()).toHaveLength(1);
    t.ws.close();
  });

  it("câu hỏi: trả lời rồi đề nghị áp dụng (không sửa tài liệu)", async () => {
    const t = await boot("full");
    t.send({ type: "chat", id: "1", text: "HỎI_KIẾN_THỨC quang hợp là gì?", model: SONNET });
    const done = await t.until("done");
    expect(done.offer?.summary).toBe("bổ sung định nghĩa vào đoạn đang chọn");
    expect(t.msgs.some((m) => m.type === "rpc_request" || m.type === "approval_request")).toBe(false);
    t.ws.close();
  });

  it("“Đồng ý tất cả”: các thay đổi còn lại của tin nhắn chạy luôn, không hỏi lại", async () => {
    const t = await boot("ask");
    t.send({ type: "chat", id: "1", text: "HAI_LỆNH in đậm và giãn dòng", model: SONNET });
    const ap = await t.until("approval_request");
    t.send({ type: "approval", id: ap.id, approved: true, all: true });
    const r1 = await t.until("rpc_request");
    t.send({ type: "rpc_response", id: r1.id, ok: true, result: "ok" });
    const r2 = await t.until("rpc_request");
    expect(r2.call.tool).toBe("office_word_format_paragraph");
    t.send({ type: "rpc_response", id: r2.id, ok: true, result: "ok" });
    await t.until("done");
    expect(t.msgs.some((m) => m.type === "approval_request")).toBe(false);
    t.ws.close();
  });
});
