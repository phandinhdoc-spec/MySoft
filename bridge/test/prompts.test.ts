import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  BUILTIN_PROMPTS,
  fillPrompt,
  formatRequest,
  modelFamily,
  optimizerSystem,
  PROMPT_CATEGORIES,
  promptFields,
  TOOL_CATALOG,
  type ClientMessage,
  type ServerMessage,
} from "@pvta/shared";
import type { Engine, RunRequest } from "../src/engine.js";
import { startServer, type RunningServer } from "../src/server.js";

describe("tự chỉnh đề theo họ model", () => {
  it("nhận đúng họ model", () => {
    expect(modelFamily({ backend: "claude", model: "sonnet" })).toBe("claude");
    expect(modelFamily({ backend: "codex", model: "default" })).toBe("gpt");
    expect(modelFamily({ backend: "agy", model: "gemini-3.8-flash-low" })).toBe("gemini");
    expect(modelFamily({ backend: "agy", model: "claude-sonnet-4-6" })).toBe("claude");
    expect(modelFamily({ backend: "api", model: "anthropic/claude-haiku-5-5" })).toBe("claude");
    expect(modelFamily({ backend: "api", model: "gemini/gemini-flash-latest" })).toBe("gemini");
    expect(modelFamily({ backend: "api", model: "compatible/llama3.2" })).toBe("local");
  });
  it("cùng nội dung, khác cách trình bày", () => {
    const p = { userText: "In đậm đoạn này", selection: "Lá cây xanh.", where: "trang 2" };
    expect(formatRequest(p, "claude")).toMatch(/<dang_chon vi_tri="trang 2">\nLá cây xanh.\n<\/dang_chon>[\s\S]*<yeu_cau>\nIn đậm đoạn này\n<\/yeu_cau>/);
    expect(formatRequest(p, "gemini").startsWith("Yêu cầu: In đậm đoạn này")).toBe(true); // yêu cầu đứng trước
    expect(formatRequest(p, "gpt")).toContain("## Yêu cầu hiện tại\nIn đậm đoạn này");
    const local = formatRequest(p, "local");
    expect(local.startsWith("NHIỆM VỤ: In đậm đoạn này")).toBe(true);
    expect(local).toContain("Nhắc lại:");
    for (const f of ["claude", "gpt", "gemini", "local"] as const) expect(formatRequest(p, f)).toContain("Lá cây xanh.");
  });
  it("lời nhắc tối ưu dặn giữ ý định, dùng ô trống thay vì bịa", () => {
    const s = optimizerSystem("claude", "word", "vi");
    expect(s).toContain("GIỮ NGUYÊN ý định");
    expect(s).toContain("[mô tả ngắn]");
    expect(s).toContain("<muc_tieu>");
    expect(optimizerSystem("local", "excel", "vi")).toContain("120 từ");
  });
});

describe("ô trống [ ] kiểu Monica", () => {
  it("tìm và điền ô trống; ô chưa điền giữ nguyên", () => {
    const t = "Soạn bài [tên bài] lớp [lớp], nhắc lại [tên bài].";
    expect(promptFields(t)).toEqual(["tên bài", "lớp"]);
    expect(fillPrompt(t, { "tên bài": "Quang hợp", lớp: " " })).toBe("Soạn bài Quang hợp lớp [lớp], nhắc lại Quang hợp.");
  });
  it("mẫu dựng sẵn: mã không trùng, nhóm hợp lệ, có ô trống hoặc dùng phần đang chọn; không nhắc công cụ không có thật", () => {
    const ids = new Set(BUILTIN_PROMPTS.map((p) => p.id));
    expect(ids.size).toBe(BUILTIN_PROMPTS.length);
    const cats = new Set(PROMPT_CATEGORIES.map((c) => c.id));
    const tools = new Set(TOOL_CATALOG.map((t) => t.name));
    for (const p of BUILTIN_PROMPTS) {
      expect(cats.has(p.category), p.id).toBe(true);
      expect(promptFields(p.text).length > 0 || /đang chọn|sheet hiện tại/.test(p.text), p.id).toBe(true);
      for (const m of p.text.matchAll(/\boffice_[a-z_]+\b/g)) expect(tools.has(m[0])).toBe(true);
    }
  });
});

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function boot() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-prompts-"));
  const seen: RunRequest[] = [];
  const engine = {
    run: async (req: RunRequest) => {
      seen.push(req);
      const text = "```\n<muc_tieu>Soạn giáo án bài [tên bài]</muc_tieu>\n```";
      req.onDelta?.(text);
      return { text, fullPrompt: true, attempts: 1, timings: { totalMs: 1 } };
    },
  } as unknown as Engine;
  server = await startServer({ home, port: 0, engine, allowNoOrigin: true, idleCheckMs: 3_600_000, web: false });
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
      if (Date.now() - t0 > 5000) throw new Error(`hết giờ chờ ${t}: ${msgs.map((m) => m.type)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  /** Trạng thái thư viện mới nhất sau khi các thay đổi đã xử lý xong. */
  const latest = async () => {
    await new Promise((r) => setTimeout(r, 150));
    const all = msgs.filter((m) => m.type === "prompts");
    for (const m of all) msgs.splice(msgs.indexOf(m), 1);
    return all.at(-1) as Extract<ServerMessage, { type: "prompts" }>;
  };
  send({ type: "hello", host: "word", sessionId: `p${Date.now()}`, lang: "vi" });
  await until("ready");
  return { home, seen, send, until, latest, ws };
}

describe("tối ưu lời nhắc và thư viện qua server", () => {
  it("Tối ưu: viết lại theo họ model đích, mức suy nghĩ thấp, kết quả làm sạch", async () => {
    const t = await boot();
    t.send({ type: "optimize", id: "o1", text: "soạn giáo án quang hợp", model: { backend: "claude", model: "sonnet" }, hasSelection: true });
    const r = await t.until("write_result");
    expect(r.text).toBe("<muc_tieu>Soạn giáo án bài [tên bài]</muc_tieu>");
    await t.until("done");
    expect(t.seen[0]?.effort).toBe("low");
    expect(t.seen[0]?.system).toContain("họ: claude");
    expect(t.seen[0]?.buildPrompt(false, true)).toContain("<yeu_cau_goc>\nsoạn giáo án quang hợp\n</yeu_cau_goc>");
    expect(t.seen[0]?.buildPrompt(false, true)).toContain("đang chọn");
    t.ws.close();
  });

  it("chuẩn hóa chỉ trả bản xem trước, giữ nguyên quy tắc đã lưu và không cài skill", async () => {
    const t = await boot();
    const raw = " dùng   câu ngắn ";
    t.send({type: "ws_rules", rules: raw});
    t.send({type: "standardize", id: "rule-preview", kind: "rule", text: raw});
    const rule = await t.until("standardized");
    expect(rule.id).toBe("rule-preview");
    expect(rule.result).toMatchObject({text: "Dùng câu ngắn.", ok: true});
    expect(JSON.parse(fs.readFileSync(path.join(t.home, "chats.json"), "utf8")).globalRules).toBe(raw);
    t.send({type: "standardize", id: "skill-preview", kind: "skill", text: "---\nname: thu-nghiem\ndescription: Soạn đề khi cần kiểm tra KHTN\n---\n## Các bước\n- Hỏi tên bài và lớp.\n"});
    const skill = await t.until("standardized");
    expect(skill.result?.text).toContain("## Quy trình");
    expect(fs.existsSync(path.join(t.home, "skills", "thu-nghiem"))).toBe(false);
    t.send({type: "standardize", id: "too-long", kind: "rule", text: "x".repeat(60001)});
    expect((await t.until("standardized")).error).toMatch(/60.000/);
    expect(t.seen).toHaveLength(0);
    t.ws.close();
  });

  it("lưu, sửa, yêu thích, xóa lời nhắc riêng; lưu xuống tệp", async () => {
    const t = await boot();
    expect((await t.latest()).own).toEqual([]);
    t.send({ type: "prompts_save", prompt: { title: "Đề 15 phút", text: "Soạn đề 15 phút bài [tên bài]", category: "kiem-tra" } });
    const a = await t.latest();
    expect(a.own).toHaveLength(1);
    const id = a.own[0]!.id;
    t.send({ type: "prompts_save", prompt: { id, title: "Đề 15 phút (sửa)", text: "Soạn đề 15 phút lớp [lớp]" } });
    expect((await t.latest()).own[0]?.title).toBe("Đề 15 phút (sửa)");
    t.send({ type: "prompts_fav", id, fav: true });
    t.send({ type: "prompts_fav", id: "b-trac-nghiem", fav: true });
    t.send({ type: "prompts_fav", id: "khong-co", fav: true });
    expect((await t.latest()).favorites).toEqual(["b-trac-nghiem", id]);
    const disk = JSON.parse(fs.readFileSync(path.join(t.home, "prompts.json"), "utf8"));
    expect(disk.prompts[0].title).toBe("Đề 15 phút (sửa)");
    t.send({ type: "prompts_save", prompt: { title: "", text: "x" } });
    expect((await t.until("error")).message).toContain("đặt tên");
    t.send({ type: "prompts_delete", id });
    const d = await t.latest();
    expect(d.own).toEqual([]);
    expect(d.favorites).toEqual(["b-trac-nghiem"]);
    t.ws.close();
  });
});
