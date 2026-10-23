import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine.js";
import { EngineError } from "../src/errors.js";
import { ProbeStore } from "../src/probe.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, "fixtures", "fake-cli.mjs");
const FAKE_AGY = path.join(here, "fixtures", "fake-agy.mjs");

function setup(mode: string, extraEnv: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-eng-"));
  const log = path.join(dir, "calls.log");
  const env = { ...process.env, PVTA_CLAUDE_BIN: FAKE, PVTA_AGY_BIN: FAKE_AGY, FAKE_MODE: mode, FAKE_LOG: log, ...extraEnv };
  const probe = new ProbeStore(path.join(dir, "probe.json"));
  const engine = new Engine({ probe, env });
  const calls = () =>
    fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]) : [];
  return { dir, engine, probe, calls };
}

const base = (dir: string) => ({ backend: "claude" as const, model: "sonnet", cwd: dir, permission: "ask" as const });

describe("engine với claude giả", () => {
  it("truyền chữ theo từng đoạn và đo thời gian", async () => {
    const { dir, engine } = setup("ok");
    const deltas: string[] = [];
    const r = await engine.run({ ...base(dir), buildPrompt: () => "chào", onDelta: (t) => deltas.push(t) });
    expect(r.text).toBe("Xin chào thầy cô.");
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe(r.text);
    expect(r.conversationId).toBe("sess-1");
    expect(r.timings.spawnMs).toBeDefined();
    expect(r.timings.firstTokenMs).toBeDefined();
    expect(r.attempts).toBe(1);
  });

  it("lượt sau dùng --resume và chỉ gửi phần mới", async () => {
    const { dir, engine, calls } = setup("ok");
    const prompts: boolean[] = [];
    await engine.run({ ...base(dir), conversationId: "sess-1", buildPrompt: (resumed) => (prompts.push(resumed), "tiếp") });
    expect(prompts).toEqual([true]);
    expect(calls()[0]).toEqual(expect.arrayContaining(["--resume", "sess-1"]));
  });

  it("gửi đủ bộ cờ an toàn của claude", async () => {
    const { dir, engine, calls } = setup("ok");
    await engine.run({ ...base(dir), buildPrompt: () => "x" });
    const a = calls()[0]!;
    expect(a).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--disable-slash-commands"]));
    expect(a[a.indexOf("--tools") + 1]).toBe("");
  });

  it("xóa biến khóa API khỏi môi trường CLI", async () => {
    const { dir, engine } = setup("echo-env", { ANTHROPIC_API_KEY: "sk-secret" });
    const r = await engine.run({ ...base(dir), buildPrompt: () => "x" });
    expect(r.text).toBe("KEY=unset");
  });

  it("lỗi cờ: bỏ cờ tùy chọn, nhớ lại, thử lại và thành công", async () => {
    const { dir, engine, probe, calls } = setup("flag");
    const r = await engine.run({ ...base(dir), buildPrompt: () => "x" });
    expect(r.text).toBe("Xin chào thầy cô.");
    expect(r.attempts).toBe(2);
    expect(probe.get("claude")?.unsupported).toContain("--include-partial-messages");
    const runs = calls().filter((a) => a.includes("-p"));
    expect(runs.at(-1)).not.toContain("--include-partial-messages");
    // Lần sau nhớ sẵn, không phải thử lại.
    const r2 = await new Engine({ probe, env: { ...process.env, PVTA_CLAUDE_BIN: FAKE, FAKE_MODE: "flag", FAKE_LOG: path.join(dir, "calls.log") } }).run({ ...base(dir), buildPrompt: () => "x" });
    expect(r2.attempts).toBe(1);
  });

  it("lỗi phiên cũ: bỏ mã, gửi lại bản đầy đủ", async () => {
    const { dir, engine } = setup("session");
    const flags: boolean[] = [];
    const r = await engine.run({ ...base(dir), conversationId: "cu", buildPrompt: (resumed) => (flags.push(resumed), "x") });
    expect(flags).toEqual([true, false]);
    expect(r.fullPrompt).toBe(true);
    expect(r.attempts).toBe(2);
  });

  it("không đọc được stream-json: chuyển sang văn bản thuần", async () => {
    const { dir, engine } = setup("plain");
    const r = await engine.run({ ...base(dir), buildPrompt: () => "x" });
    expect(r.text).toBe("Xin chào thầy cô.");
    expect(r.attempts).toBe(2);
  });

  it("lỗi đăng nhập: KHÔNG thử lại, KHÔNG đổi model", async () => {
    const { dir, engine, calls } = setup("auth");
    await expect(engine.run({ ...base(dir), buildPrompt: () => "x" })).rejects.toMatchObject({ kind: "auth" });
    expect(calls().filter((a) => a.includes("-p"))).toHaveLength(1);
  });

  it("lỗi model: KHÔNG thử lại, KHÔNG đổi model", async () => {
    const { dir, engine, calls } = setup("model");
    const err = await engine.run({ ...base(dir), buildPrompt: () => "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err.kind).toBe("model");
    const runs = calls().filter((a) => a.includes("-p"));
    expect(runs).toHaveLength(1);
    expect(runs[0]![runs[0]!.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("hủy giữa chừng", async () => {
    const { dir, engine } = setup("slow");
    const ac = new AbortController();
    const p = engine.run({ ...base(dir), buildPrompt: () => "x", signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    await expect(p).rejects.toThrow(/hủy/);
  });

  it("quá thời gian", async () => {
    const { dir, engine } = setup("slow");
    await expect(engine.run({ ...base(dir), buildPrompt: () => "x", timeoutMs: 200 })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("không tìm thấy lệnh", async () => {
    const { dir } = setup("ok");
    const engine = new Engine({ probe: new ProbeStore(path.join(dir, "p.json")), env: { ...process.env, PVTA_CLAUDE_BIN: "/khong/co/lenh" } });
    await expect(engine.run({ ...base(dir), buildPrompt: () => "x" })).rejects.toThrow(/Không tìm thấy lệnh/);
  });
});

describe("engine: mức suy nghĩ", () => {
  it("truyền --effort cho claude", async () => {
    const { dir, engine, calls } = setup("ok");
    await engine.run({ ...base(dir), effort: "medium", buildPrompt: () => "x" });
    const a = calls().find((c) => c.includes("-p"))!;
    expect(a[a.indexOf("--effort") + 1]).toBe("medium");
  });
  it("CLI không có --effort: bỏ cờ, nhớ lại, vẫn chạy với model đã chọn", async () => {
    const { dir, engine, probe, calls } = setup("noeffort");
    const r = await engine.run({ ...base(dir), effort: "high", buildPrompt: () => "x" });
    expect(r.text).toBe("Xin chào thầy cô.");
    expect(r.attempts).toBe(2);
    expect(probe.get("claude")?.unsupported).toContain("--effort");
    const last = calls().filter((c) => c.includes("-p")).at(-1)!;
    expect(last).not.toContain("--effort");
    expect(last[last.indexOf("--model") + 1]).toBe("sonnet"); // không đổi model
    // Ba cờ an toàn vẫn còn.
    expect(last).toEqual(expect.arrayContaining(["--strict-mcp-config", "--disable-slash-commands", "--tools"]));
  });
});

describe("engine với agy giả", () => {
  it("khởi chạy ngầm trong dự án mới với cờ chỉnh sửa hợp lệ, không cần mở agy thủ công", async () => {
    const { dir, engine, calls } = setup("cwd");
    const projectDir = path.join(dir, "Dự án mới có dấu");
    fs.mkdirSync(projectDir);
    const r = await engine.run({ backend: "agy", model: "m", cwd: projectDir, permission: "read", workspaceWrite: true, buildPrompt: () => "x" });
    expect(fs.realpathSync(r.text)).toBe(fs.realpathSync(projectDir));
    expect(r.attempts).toBe(1);
    expect(calls()[0]).toEqual(expect.arrayContaining(["-p", "x", "--model", "m", "--dangerously-skip-permissions"]));
    expect(calls()[0]).not.toContain("--mode");
    expect(calls()[0]).not.toContain("--yolo");
  });
  it("không tự cấp quyền ghi cho agy khi chưa bật chỉnh sửa workspace", async () => {
    const { dir, engine, calls } = setup("ok");
    await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "full", buildPrompt: () => "x" });
    expect(calls()[0]).toEqual(expect.arrayContaining(["--mode", "plan", "--sandbox"]));
    expect(calls()[0]).not.toContain("--dangerously-skip-permissions");
  });
  it("đọc step_update/result và mã hội thoại", async () => {
    const { dir, engine } = setup("ok");
    const r = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "ask", buildPrompt: () => "x" });
    expect(r.text).toBe("Chào bạn");
    expect(r.conversationId).toBe("conv-9");
  });
  it("đọc định dạng thật của agy (event + step_update lồng)", async () => {
    const { dir, engine } = setup("real");
    const deltas: string[] = [];
    const r = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "ask", buildPrompt: () => "x", onDelta: (t) => deltas.push(t) });
    expect(r.text).toBe("Xin chào thầy cô");
    expect(deltas.join("")).toBe("Xin chào thầy cô");
    expect(r.conversationId).toBe("conv-r");
  });
  it("bị từ chối ghi: báo rõ, không thử lại vô ích", async () => {
    const { dir, engine } = setup("denied");
    const err = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "ask", buildPrompt: () => "x" }).catch((e) => e);
    expect(err.kind).toBe("denied");
  });
  it("chạy xong mà không có chữ nào: báo lỗi kèm đầu ra thô, không trả chuỗi rỗng", async () => {
    const { dir, engine } = setup("empty");
    const err = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "ask", buildPrompt: () => "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err.message).toContain("không trả về nội dung");
    expect(err.message).toContain("something_else");
  });
});

it('zero timeout allows a real CLI process to finish instead of killing it immediately',async()=>{
 const {dir,engine}=setup('ok');try{const r=await engine.run({...base(dir),buildPrompt:()=> 'Plan',timeoutMs:0});expect(r.text).toBe('Xin chào thầy cô.');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

it('streams tool execution separately from response text and private thinking',async()=>{
 const {dir,engine}=setup('progress');const entries:import('@pvta/shared').AiProgressEntry[]=[],deltas:string[]=[];
 const answer=await engine.run({...base(dir),buildPrompt:()=>"chào",onProgress:entry=>entries.push(entry),onDelta:text=>deltas.push(text)});
 expect(entries.map(entry=>entry.state)).toEqual(['running','done']);expect(entries[1]).toMatchObject({title:'Đọc tệp',input:'bai-hoc.md',output:'Read 20 lines'});
 expect(deltas.join('')).toBe(answer.text);expect(JSON.stringify({entries,answer})).not.toContain('private reasoning');
});

it('delivers source quota telemetry separately from model text',async()=>{
 const {dir,engine}=setup('progress'),usage:import('@pvta/shared').ProviderUsage[]=[];
 const result=await engine.run({...base(dir),buildPrompt:()=>"chào",onUsage:value=>usage.push(value)});
 expect(usage).toHaveLength(1);expect(usage[0]?.fiveHour).toMatchObject({usedPercent:25,resetsAt:1800000000000});expect(result.text).not.toContain('rate_limit_info');
});
