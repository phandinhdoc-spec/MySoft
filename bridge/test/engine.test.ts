import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
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
  it('bounds stderr while retaining the final diagnostic',async()=>{
    const {dir,engine}=setup('noisy-error');
    try{
      const error=await engine.run({...base(dir),buildPrompt:()=>''}).catch(e=>e);
      expect(error).toBeInstanceOf(EngineError);expect(error.detail).toContain('FINAL DIAGNOSTIC');
      expect(error.detail.length).toBeLessThanOrEqual(64*1024);
    }finally{engine.dispose();fs.rmSync(dir,{recursive:true,force:true});}
  });
  it('stops oversized unfinished JSON lines instead of buffering indefinitely',async()=>{
    const {dir,engine}=setup('oversize-line');
    try{await expect(engine.run({...base(dir),buildPrompt:()=>''})).rejects.toThrow('sự kiện CLI quá lớn');}
    finally{engine.dispose();fs.rmSync(dir,{recursive:true,force:true});}
  });
  it.skipIf(process.platform==='win32')('cancels a CLI and its tool child before allowing the next request',async()=>{
    const pidDir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-pids-'));const pidFile=path.join(pidDir,'child');
    const {dir,engine}=setup('process-tree',{FAKE_PID_FILE:pidFile});const ctl=new AbortController();
    const pending=engine.run({...base(dir),buildPrompt:()=>'',signal:ctl.signal});
    const rejected=expect(pending).rejects.toThrow('Đã hủy');let pid:number|undefined;
    try{
      await vi.waitFor(()=>expect(fs.existsSync(pidFile)).toBe(true),{timeout:3000});pid=Number(fs.readFileSync(pidFile,'utf8'));
      ctl.abort();await rejected;
      await vi.waitFor(()=>expect(()=>process.kill(pid!,0)).toThrow(),{timeout:3000});
    }finally{
      ctl.abort();engine.dispose();if(pid){try{process.kill(pid,'SIGKILL');}catch{}}
      await pending.catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(pidDir,{recursive:true,force:true});
    }
  });
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
  it("không khởi động AGY trước khi người dùng bật prewarm", async () => {
    const { dir, engine, calls } = setup("echo-prompt");
    try {
      expect(await engine.prewarm({backend:"agy",model:"m",cwd:dir,permission:"read"})).toBe(false);
      expect(calls()).toHaveLength(0);
    } finally { engine.disposeWarm(); fs.rmSync(dir, {recursive:true,force:true}); }
  });
  it("gửi nguyên prompt tiếng Việt nhiều dòng qua NDJSON, kể cả lượt tiếp nối", async () => {
    const { dir, engine, calls } = setup("echo-prompt");
    const prompt = 'Người dùng: "Soạn bài tiếng Việt"\nGiữ nguyên $HOME, `literal`, dấu \' và 😀.';
    try {
      const first = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "read", buildPrompt: () => prompt });
      expect(first.text).toBe(prompt);
      const next = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "read", conversationId: first.conversationId, buildPrompt: resumed => resumed ? "Bổ sung câu hỏi số 2" : prompt });
      expect(next.text).toBe("Bổ sung câu hỏi số 2");
      expect(calls()[0]).not.toContain("-p");
      expect(calls()[0]).not.toContain(prompt);
      expect(calls()[0]).toContain("--input-format");
      expect(calls()[1]).toContain("--conversation");
    } finally { engine.disposeWarm(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it("agy mặc định tự duyệt công cụ cho mọi mức quyền PVTA", async () => {
    const { dir, engine, calls } = setup("echo-prompt");
    try {
      for (const permission of ["read", "ask", "full"] as const) {
        await engine.run({ backend: "agy", model: "m", cwd: dir, permission, workspaceWrite: false, buildPrompt: () => "Yêu cầu của người dùng" });
      }
      for (const args of calls()) {
        expect(args).toContain("--dangerously-skip-permissions");
        expect(args).not.toContain("--mode");
        expect(args).not.toContain("--sandbox");
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it("khởi chạy ngầm trong dự án mới với cờ chỉnh sửa hợp lệ, không cần mở agy thủ công", async () => {
    const { dir, engine, calls } = setup("cwd");
    const projectDir = path.join(dir, "Dự án mới có dấu");
    fs.mkdirSync(projectDir);
    const r = await engine.run({ backend: "agy", model: "m", cwd: projectDir, permission: "read", workspaceWrite: true, buildPrompt: () => "x" });
    expect(fs.realpathSync(r.text)).toBe(fs.realpathSync(projectDir));
    expect(r.attempts).toBe(1);
    expect(calls()[0]).toEqual(expect.arrayContaining(["--input-format", "stream-json", "--model", "m", "--dangerously-skip-permissions"]));
    expect(calls()[0]).not.toContain("--mode");
    expect(calls()[0]).not.toContain("--yolo");
  });
  it("AGY vẫn tự duyệt công cụ khi không truyền workspaceWrite", async () => {
    const { dir, engine, calls } = setup("ok");
    await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "full", buildPrompt: () => "x" });
    expect(calls()[0]).toContain("--dangerously-skip-permissions");
    expect(calls()[0]).not.toContain("--mode");
    expect(calls()[0]).not.toContain("--sandbox");
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
  it.each(['win32','darwin','linux'] as const)("agy trên %s gửi prompt dài qua stdin mà không vượt giới hạn đối số", async (platform) => {
    const { dir, calls } = setup("ok");
    const probe = new ProbeStore(path.join(dir, "probe.json"));
    const engine = new Engine({ probe, platform, env: { ...process.env, PVTA_AGY_BIN: FAKE_AGY, FAKE_MODE: "echo-prompt", FAKE_LOG: path.join(dir, "calls.log") } });
    const longPrompt = "x".repeat(35_000);
    const result = await engine.run({ backend: "agy", model: "m", cwd: dir, permission: "ask", buildPrompt: () => longPrompt });
    expect(result.text).toBe(longPrompt);
    expect(calls()).toHaveLength(1);
    expect(calls()[0]!.join(' ').length).toBeLessThan(1000);
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
