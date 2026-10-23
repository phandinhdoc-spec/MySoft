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
const tool = (t: string, args: Record<string, unknown> = {}) => "```office-tool\n" + JSON.stringify({ tool: t, args }) + "\n```";

describe("bridge: bền vững", () => {
  it("sessionId hỏng không làm sập bridge; phiên khác vẫn chạy", async () => {
    const { engine } = stubEngine(() => "ok");
    const { port } = await boot(engine);
    const bad = await Client.connect(port);
    bad.send({ type: "hello", host: "word", sessionId: "///", lang: "vi" });
    const t0 = Date.now();
    while (!bad.closed && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 20));
    expect(bad.closed).toBe(true);
    const c = await Client.connect(port);
    c.send(hello("tot"));
    const ready = await c.until("ready");
    expect(ready.model).toBe("auto");
    expect(ready.busy).toBe(false);
    c.ws.close();
  });

  it("model không hợp lệ bị từ chối; model đã chọn được ghim và trả lại trong ready", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("m"));
    await c.until("ready");
    c.send({ type: "chat", id: "x", text: "a", model: { backend: "hermes", model: "x" } as never });
    expect((await c.until("error")).kind).toBe("model");
    c.send({ type: "chat", id: "y", text: "a", model: { backend: "claude", model: "sonnet; rm -rf ~" } });
    expect((await c.until("error")).kind).toBe("model");
    expect(seen).toHaveLength(0);
    c.send({ type: "chat", id: "z", text: "a", model: SONNET });
    await c.until("done");
    c.ws.close();
    const c2 = await Client.connect(port);
    c2.send(hello("m2"));
    expect((await c2.until("ready")).model).toEqual(SONNET);
    c2.ws.close();
  });

  it("công cụ không có thật hoặc sai ứng dụng: báo lỗi cho model, không gửi tới add-in", async () => {
    const { engine, seen } = stubEngine((_r, n) => (n === 1 ? tool("office_word_get_everything_delete") + tool("office_excel_set_range", { address: "A1" }) : "xong"));
    const { port } = await boot(engine, "full");
    const c = await Client.connect(port);
    c.send(hello("t"));
    await c.until("ready");
    c.send({ type: "chat", id: "m", text: "làm đi", model: SONNET });
    await c.until("done");
    expect(c.msgs.some((m) => m.type === "rpc_request" || m.type === "approval_request")).toBe(false);
    expect(seen[1]?.prompt).toContain("không tồn tại");
    expect(seen[1]?.prompt).toContain("không dùng được trong word");
    c.ws.close();
  });

  it("kết quả add-in giữ đúng tên công cụ khi gửi lại cho model", async () => {
    const { engine, seen } = stubEngine((_r, n) => (n === 1 ? tool("office_word_get_body") : "xong"));
    const { port } = await boot(engine, "ask");
    const c = await Client.connect(port);
    c.send(hello("n"));
    await c.until("ready");
    c.send({ type: "chat", id: "m", text: "đọc", model: SONNET });
    const rpc = await c.until("rpc_request");
    c.send({ type: "rpc_response", id: rpc.id, ok: true, result: "nội dung" });
    await c.until("done");
    expect(seen[1]?.resumed).toBe(true);
    expect(seen[1]?.prompt).toContain("### office_word_get_body → ok");
    c.ws.close();
  });

  it("hủy khi đang chờ đồng ý: kết thúc ngay, không kẹt ở trạng thái bận", async () => {
    const { engine } = stubEngine((_r, n) => (n === 1 ? tool("office_word_insert_text", { text: "x" }) : "xong"));
    const { port } = await boot(engine, "ask");
    const c = await Client.connect(port);
    c.send(hello("h"));
    await c.until("ready");
    c.send({ type: "chat", id: "m1", text: "sửa", model: SONNET });
    await c.until("approval_request");
    const t0 = Date.now();
    c.send({ type: "cancel", id: "m1" });
    const err = await c.until("error", 2000);
    expect(err.message).toContain("hủy");
    expect(Date.now() - t0).toBeLessThan(1500);
    // Gửi được tin tiếp theo ngay.
    c.send({ type: "chat", id: "m2", text: "chào", model: SONNET });
    await c.until("done");
    c.ws.close();
  });

  it("đổi model qua lại: model cũ nhận lại bản đầy đủ vì đã có lượt nó chưa thấy", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("sw"));
    await c.until("ready");
    const HAIKU = { backend: "claude", model: "haiku" } as const;
    for (const [id, model] of [["1", SONNET], ["2", SONNET], ["3", HAIKU], ["4", SONNET]] as const) {
      c.send({ type: "chat", id, text: `lượt ${id}`, model });
      await c.until("done");
    }
    expect(seen.map((s) => s.resumed)).toEqual([false, true, false, false]);
    expect(seen[3]?.prompt).toContain("lượt 3"); // bản đầy đủ có lượt làm với Haiku
    c.ws.close();
  });

  it("bắt đầu lại khi đang chạy: dừng tác vụ, lịch sử sạch", async () => {
    let release: () => void = () => undefined;
    const engine = {
      run: (req: RunRequest) =>
        new Promise((resolve, reject) => {
          req.signal?.addEventListener("abort", () => reject(new Error("Đã hủy.")));
          release = () => resolve({ text: "ok", conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } });
        }),
    } as unknown as Engine;
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("r"));
    await c.until("ready");
    c.send({ type: "chat", id: "m", text: "lâu", model: SONNET });
    await new Promise((r) => setTimeout(r, 50));
    c.send({ type: "reset" });
    await c.until("error");
    release();
    const rec = server!.sessions.get("r")!;
    expect(rec.chat.busy).toBe(false);
    c.ws.close();
  });
});

describe("bridge: công cụ viết", () => {
  it("một lượt, không lịch sử: prompt có nhiệm vụ và văn bản trong thẻ; kết quả được làm sạch", async () => {
    const { engine, seen } = stubEngine(() => "```\nVăn bản đã sửa.\n```");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("w1"));
    await c.until("ready");
    c.send({ type: "write", id: "x", action: "simpler", option: "6", text: "Quang hợp là quá trình…", model: SONNET });
    const r = await c.until("write_result");
    expect(r.text).toBe("Văn bản đã sửa.");
    await c.until("done");
    expect(seen[0]?.conversationId).toBeUndefined();
    expect(seen[0]?.prompt).toContain("học sinh lớp 6");
    expect(seen[0]?.prompt).toContain("<van_ban>\nQuang hợp là quá trình…\n</van_ban>");
    // Lượt chat sau đó không bị ảnh hưởng (lịch sử trò chuyện trống).
    c.send({ type: "chat", id: "c1", text: "chào", model: SONNET });
    await c.until("done");
    expect(seen[1]?.prompt).not.toContain("Quang hợp");
    c.ws.close();
  });

  it("từ chối thao tác lạ, chữ rỗng, chữ quá dài; viết tiếp cho phép chữ rỗng", async () => {
    const { engine, seen } = stubEngine(() => "tiếp");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("w2"));
    await c.until("ready");
    c.send({ type: "write", id: "a", action: "hack" as never, text: "x", model: SONNET });
    await c.until("error");
    c.send({ type: "write", id: "b", action: "fix", text: "  ", model: SONNET });
    expect((await c.until("error")).message).toContain("Chưa chọn");
    c.send({ type: "write", id: "c", action: "fix", text: "a".repeat(40_000), model: SONNET });
    expect((await c.until("error")).message).toContain("quá dài");
    expect(seen).toHaveLength(0);
    c.send({ type: "write", id: "d", action: "continue", text: "", context: "Đoạn trước.", model: SONNET });
    await c.until("done");
    expect(seen[0]?.prompt).toContain("<phan_truoc>\nĐoạn trước.");
    c.ws.close();
  });

  it("dùng kết quả thì xếp vào hàng học nền (không có nội dung văn bản)", async () => {
    const { engine } = stubEngine(() => "ok");
    const { home, port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("w3"));
    await c.until("ready");
    c.send({ type: "write", id: "a", action: "fix", text: "Nội dung bí mật của bài", model: SONNET });
    await c.until("done");
    c.send({ type: "write_feedback", action: "fix", applied: "replace" });
    await new Promise((r) => setTimeout(r, 100));
    const q = JSON.parse(fs.readFileSync(path.join(home, "learn-queue.json"), "utf8")) as Array<{ request: string; tools: string[] }>;
    expect(q).toHaveLength(1);
    expect(q[0]?.tools).toEqual(["writing_fix"]);
    expect(JSON.stringify(q)).not.toContain("bí mật");
    c.ws.close();
  });
});

describe("bridge: nhiều tệp Office", () => {
  const helloDoc = (sessionId: string, host: "word" | "excel", doc: string): ClientMessage => ({ type: "hello", host, sessionId, lang: "vi", doc });

  it("liệt kê tệp đang mở; thao tác trên tệp khác chỉ chạy khi người dùng đồng ý; từ chối thì không gửi tới tệp kia", async () => {
    const a1 = "docs-a1";
    const { engine, seen } = stubEngine((_r, n) =>
      n === 1 ? tool("office_docs_list") : n === 2 ? tool("office_excel_get_range", { address: "A1:B2", target: "docs-b1" }) : "xong",
    );
    const { port } = await boot(engine, "full"); // Toàn quyền vẫn phải hỏi khi đụng tệp khác
    const a = await Client.connect(port);
    const b = await Client.connect(port);
    a.send(helloDoc(a1, "word", "BaiGiang.docx"));
    await a.until("ready");
    b.send(helloDoc("docs-b1", "excel", "Diem.xlsx"));
    await b.until("ready");

    a.send({ type: "chat", id: "1", text: "xem bảng điểm", model: SONNET });
    const ap = await a.until("approval_request");
    expect(ap.call.tool).toBe("office_excel_get_range");
    expect(ap.call.args["tệp"]).toBe("Diem.xlsx");
    expect(ap.call.args.target).toBeUndefined();
    a.send({ type: "approval", id: ap.id, approved: false });
    await a.until("done");
    expect(b.msgs.some((m) => m.type === "rpc_request")).toBe(false);
    expect(seen[1]?.prompt).toContain("BaiGiang.docx");
    expect(seen[1]?.prompt).toContain("Diem.xlsx");
    expect(seen[2]?.prompt).toContain("từ chối");

    // Đồng ý: lời gọi đến cửa sổ Excel với đúng công cụ và không còn target.
    const { engine: e2 } = stubEngine((_r, n) => (n === 1 ? tool("office_excel_get_range", { address: "A1", target: "docs-b2" }) : "xong"));
    const srv2 = await boot(e2, "full");
    const a2 = await Client.connect(srv2.port);
    const b2 = await Client.connect(srv2.port);
    a2.send(helloDoc("docs-a2", "word", "X.docx"));
    await a2.until("ready");
    b2.send(helloDoc("docs-b2", "excel", "Y.xlsx"));
    await b2.until("ready");
    a2.send({ type: "chat", id: "1", text: "đọc ô A1 của Y", model: SONNET });
    const ap2 = await a2.until("approval_request");
    a2.send({ type: "approval", id: ap2.id, approved: true });
    const rpc = await b2.until("rpc_request");
    expect(rpc.call.tool).toBe("office_excel_get_range");
    expect(rpc.call.args).toEqual({ address: "A1" });
    b2.send({ type: "rpc_response", id: rpc.id, ok: true, result: "Điểm: 9" });
    await a2.until("done");
    a.ws.close();
    b.ws.close();
    a2.ws.close();
    b2.ws.close();
  });

  it("target sai: báo lỗi; công cụ khác ứng dụng của tệp đích: báo lỗi; không hỏi người dùng", async () => {
    const { engine, seen } = stubEngine((_r, n) =>
      n === 1 ? tool("office_word_get_body", { target: "khong-co" }) + tool("office_word_get_body", { target: "docs-x2" }) : "xong",
    );
    const { port } = await boot(engine, "full");
    const a = await Client.connect(port);
    const b = await Client.connect(port);
    a.send(helloDoc("docs-x1", "word", "A.docx"));
    await a.until("ready");
    b.send(helloDoc("docs-x2", "excel", "B.xlsx"));
    await b.until("ready");
    a.send({ type: "chat", id: "1", text: "đọc", model: SONNET });
    await a.until("done");
    expect(a.msgs.some((m) => m.type === "approval_request")).toBe(false);
    expect(seen[1]?.prompt).toContain("Không thấy tệp");
    expect(seen[1]?.prompt).toContain("không dùng được trong excel");
    a.ws.close();
    b.ws.close();
  });

  it("chế độ chỉ đọc: không ghi được vào tệp khác dù người dùng đồng ý", async () => {
    const { engine, seen } = stubEngine((_r, n) => (n === 1 ? tool("office_excel_set_range", { address: "A1", values: [[1]], target: "docs-r2" }) : "xong"));
    const { port } = await boot(engine, "read");
    const a = await Client.connect(port);
    const b = await Client.connect(port);
    a.send(helloDoc("docs-r1", "word", "A.docx"));
    await a.until("ready");
    b.send(helloDoc("docs-r2", "excel", "B.xlsx"));
    await b.until("ready");
    a.send({ type: "chat", id: "1", text: "ghi", model: SONNET });
    await a.until("done");
    expect(a.msgs.some((m) => m.type === "approval_request")).toBe(false);
    expect(b.msgs.some((m) => m.type === "rpc_request")).toBe(false);
    expect(seen[1]?.prompt).toContain("chỉ đọc");
    a.ws.close();
    b.ws.close();
  });
});

describe("bridge: học chủ động", () => {
  it("lời khen/chê sau một thao tác thành tín hiệu học; tắt công tắc thì không ghi; xem và xóa được", async () => {
    const { engine } = stubEngine((_r, n) => (n % 2 === 1 ? tool("office_calc", { expr: "1+1" }) : "xong"));
    const { home, port } = await boot(engine, "full");
    const qfile = path.join(home, "learn-queue.json");
    const queue = () => (fs.existsSync(qfile) ? (JSON.parse(fs.readFileSync(qfile, "utf8")) as Array<{ feedback?: string; about?: string; request: string; tools: string[] }>) : []);
    const c = await Client.connect(port);
    c.send(hello("lf"));
    expect((await c.until("learned")).enabled).toBe(true);
    await c.until("ready");
    c.send({ type: "chat", id: "1", text: "tính 1+1 giúp tôi", model: SONNET });
    await c.until("done");
    expect(queue().filter((r) => r.feedback)).toHaveLength(0);
    c.send({ type: "chat", id: "2", text: "đẹp quá", model: SONNET });
    await c.until("done");
    const fb = queue().filter((r) => r.feedback);
    expect(fb).toHaveLength(1);
    expect(fb[0]!.feedback).toBe("praise");
    expect(fb[0]!.about).toContain("tính 1+1");
    expect(fb[0]!.tools).toContain("office_calc");

    c.send({ type: "learn_set", enabled: false });
    expect((await c.until("learned")).enabled).toBe(false);
    const before = queue().length;
    c.send({ type: "chat", id: "3", text: "sai rồi", model: SONNET });
    await c.until("done");
    c.send({ type: "write_feedback", action: "fix", applied: "replace" });
    await new Promise((r) => setTimeout(r, 100));
    expect(queue()).toHaveLength(before);

    fs.mkdirSync(path.join(home, "skills", "learned-demo"), { recursive: true });
    fs.writeFileSync(path.join(home, "skills", "learned-demo", "SKILL.md"), "---\nname: learned-demo\ndescription: Mô tả thử nghiệm dài đủ\nload: demand\n---\nNội dung skill học được để thử.\n");
    c.send({ type: "learn_list" });
    const l = await c.until("learned");
    expect(l.items.map((i) => i.name)).toEqual(["learned-demo"]);
    expect(l.items[0]!.body).toContain("Nội dung skill");
    c.send({ type: "learn_delete", all: true });
    const after = await c.until("learned");
    expect(after.items).toEqual([]);
    expect(queue()).toEqual([]);
    c.ws.close();
  });
});

describe("bridge: chế độ viết", () => {
  it("chế độ Chính xác: chỉ dẫn vào prompt, nhiệt độ 0, được lưu và trả lại; nhiệt độ tự chỉnh thắng chế độ", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { home, port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("m1"));
    expect((await c.until("ready")).mode).toBe("standard");
    c.send({ type: "chat", id: "1", text: "tính", model: SONNET, mode: "exact" });
    await c.until("done");
    expect(seen[0]?.prompt).toContain("CHẾ ĐỘ CHÍNH XÁC");
    expect(seen[0]?.temperature).toBe(0);
    // Đổi chế độ thì gửi lại bản đầy đủ (quy tắc đổi).
    c.send({ type: "chat", id: "2", text: "viết", model: SONNET, mode: "creative", temperature: 0.7 });
    await c.until("done");
    expect(seen[1]?.resumed).toBe(false);
    expect(seen[1]?.prompt).toContain("CHẾ ĐỘ SÁNG TẠO");
    expect(seen[1]?.temperature).toBe(0.7);
    c.send({ type: "chat", id: "3", text: "tiếp", model: SONNET, temperature: null });
    await c.until("done");
    expect(seen[2]?.temperature).toBe(1); // về nhiệt độ của chế độ Sáng tạo
    const cfg = JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8"));
    expect(cfg.mode).toBe("creative");
    c.ws.close();
    const c2 = await Client.connect(port);
    c2.send(hello("m2"));
    expect((await c2.until("ready")).mode).toBe("creative");
    c2.ws.close();
  });

  it("công cụ viết: chế độ nằm ở phần cố định (khởi động sẵn được), kèm dặn bỏ qua khi sửa chính tả / dịch", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("m3"));
    await c.until("ready");
    c.send({ type: "write", id: "a", action: "fix", text: "x", model: SONNET, mode: "academic" });
    await c.until("done");
    c.send({ type: "write", id: "b", action: "longer", text: "x", model: SONNET, mode: "academic" });
    await c.until("done");
    expect(seen[0]?.system).toBe(seen[1]?.system); // giống nhau giữa các thao tác
    expect(seen[0]?.system).toContain("bỏ qua chế độ này");
    expect(seen[1]?.prompt).toContain("CHẾ ĐỘ HỌC THUẬT");
    expect(seen[0]?.prompt).toContain("Nhiệm vụ: Sửa lỗi chính tả");
    expect(seen[1]?.temperature).toBe(0.3);
    c.ws.close();
  });

  it("chế độ tự tạo: lưu tệp modes.json riêng, vào prompt, chọn được; xóa thì về Sư phạm", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { home, port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("m4"));
    await c.until("ready");
    expect((await c.until("modes")).custom).toEqual([]);
    c.send({ type: "modes_save", mode: { name: "Kiểm tra 15 phút", icon: "📝", instructions: "SOẠN ĐỀ 15 PHÚT: 10 câu trắc nghiệm.", effort: "low", temperature: 0.2 } });
    const saved = await c.until("modes");
    const id = saved.saved!;
    expect(id).toMatch(/^c-[a-z0-9]+$/);
    expect(saved.custom[0]).toMatchObject({ id, name: "Kiểm tra 15 phút", effort: "low", temperature: 0.2 });
    // Tách khỏi cấu hình model.
    expect(JSON.parse(fs.readFileSync(path.join(home, "modes.json"), "utf8")).modes[0].name).toBe("Kiểm tra 15 phút");
    c.send({ type: "chat", id: "1", text: "soạn", model: SONNET, mode: id });
    await c.until("done");
    expect(seen[0]?.prompt).toContain("SOẠN ĐỀ 15 PHÚT");
    expect(seen[0]?.temperature).toBe(0.2);
    c.send({ type: "modes_delete", id });
    expect((await c.until("modes")).custom).toEqual([]);
    c.send({ type: "chat", id: "2", text: "tiếp", model: SONNET });
    await c.until("done");
    expect(seen[1]?.prompt).not.toContain("SOẠN ĐỀ 15 PHÚT");
    c.ws.close();
    const c2 = await Client.connect(port);
    c2.send(hello("m5"));
    expect((await c2.until("ready")).mode).toBe("standard");
    c2.ws.close();
  });

  it("chế độ tự tạo: từ chối dữ liệu xấu, nhập/xuất JSON, đổi thứ tự, khôi phục mặc định", async () => {
    const { engine } = stubEngine(() => "ok");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hello("m6"));
    await c.until("ready");
    await c.until("modes");
    c.send({ type: "modes_save", mode: { name: "  ", instructions: "x" } });
    expect((await c.until("error")).message).toContain("đặt tên");
    c.send({ type: "modes_save", mode: { name: "Dài", instructions: "a".repeat(5000) } });
    expect((await c.until("error")).message).toContain("quá dài");
    // Mã do bridge cấp; không ghi đè được chế độ có sẵn.
    c.send({ type: "modes_import", data: { pvta: "writing-modes", version: 1, modes: [{ id: "academic", name: "A", instructions: "AAA" }, { name: "B", instructions: "BBB", effort: "nope" }, { name: "" }] } });
    const imp = await c.until("modes");
    expect(imp.custom.map((m) => m.name)).toEqual(["A", "B"]);
    expect(imp.custom.every((m) => /^c-/.test(m.id))).toBe(true);
    expect(imp.custom[1]?.effort).toBeUndefined();
    expect(imp.notice).toContain("Đã nhập 2");
    const [a, b] = imp.custom;
    c.send({ type: "modes_order", ids: [b!.id, a!.id, "lạ"] });
    expect((await c.until("modes")).custom.map((m) => m.name)).toEqual(["B", "A"]);
    c.send({ type: "modes_import", data: "không phải JSON" });
    expect((await c.until("error")).message).toContain("không có chế độ");
    c.send({ type: "modes_reset" });
    expect((await c.until("modes")).custom).toEqual([]);
    c.ws.close();
  });
});

describe("bridge: hội thoại và dự án", () => {
  const hi = (sessionId: string, host: "word" | "excel"): ClientMessage => ({ type: "hello", host, sessionId, lang: "vi" });

  it("lưu hội thoại ở Word, mở lại ở Excel: có lịch sử cũ và quy tắc dự án trong lời nhắc", async () => {
    const { engine, seen } = stubEngine(() => "ok");
    const { port } = await boot(engine, "ask");
    const w = await Client.connect(port);
    const x = await Client.connect(port);
    w.send(hi("ws-w", "word"));
    await w.until("ready");
    x.send(hi("ws-x", "excel"));
    await x.until("ready");

    w.send({ type: "ws_project", project: { name: "Lớp 8A", rules: "Luôn gọi học sinh là các em" } });
    await new Promise((r) => setTimeout(r, 150));
    const st = [...w.msgs].reverse().find((m) => m.type === "workspace");
    const pid = (st?.type === "workspace" && st.projects[0]?.id) || "";
    expect(pid).toBeTruthy();
    w.send({ type: "ws_rules", rules: "Dùng đơn vị SI" });
    w.send({ type: "ws_open", projectId: pid });
    await w.until("ws_chat");
    w.send({ type: "chat", id: "1", text: "Soạn bài Lực ma sát", model: SONNET });
    await w.until("done");
    expect(seen[0]?.prompt).toContain("Luôn gọi học sinh là các em");
    expect(seen[0]?.prompt).toContain("Dùng đơn vị SI");

    const msgs = [{ id: "u1", role: "user", text: "Soạn bài Lực ma sát", tools: [] }, { id: "1", role: "assistant", text: "ok", tools: [] }];
    w.send({ type: "ws_save", id: "chat1", msgs });
    await new Promise((r) => setTimeout(r, 150));
    x.send({ type: "ws_get" });
    await new Promise((r) => setTimeout(r, 100));
    const lastWs = [...x.msgs].reverse().find((m) => m.type === "workspace");
    expect(lastWs?.type === "workspace" && lastWs.chats[0]).toMatchObject({ id: "chat1", host: "word", projectId: pid, title: "Soạn bài Lực ma sát" });
    expect(lastWs?.type === "workspace" && lastWs.link).toBe(true);

    // Excel mở hội thoại đó: nhận tin cũ, lượt sau mang theo ngữ cảnh và không có quy tắc dự án? (chat thuộc dự án => có)
    x.send({ type: "ws_open", id: "chat1" });
    const opened = await x.until("ws_chat");
    expect(opened.msgs).toHaveLength(2);
    x.send({ type: "chat", id: "2", text: "Làm tiếp", model: SONNET });
    await x.until("done");
    const p = seen.at(-1)!.prompt;
    expect(p).toContain("Soạn bài Lực ma sát");
    expect(p).toContain("Luôn gọi học sinh là các em");

    // Hội thoại mới không dự án: chỉ quy tắc chung.
    x.send({ type: "ws_open" });
    await x.until("ws_chat");
    x.send({ type: "chat", id: "3", text: "Câu khác", model: SONNET });
    await x.until("done");
    const p3 = seen.at(-1)!.prompt;
    expect(p3).toContain("Dùng đơn vị SI");
    expect(p3).not.toContain("Luôn gọi học sinh là các em");
    expect(p3).not.toContain("Soạn bài Lực ma sát");

    // Xóa hội thoại: cửa sổ đang mở nó được đặt lại.
    w.send({ type: "ws_delete", id: "chat1" });
    await new Promise((r) => setTimeout(r, 150));
    w.send({ type: "ws_get" });
    await new Promise((r) => setTimeout(r, 100));
    const after = [...w.msgs].reverse().find((m) => m.type === "workspace");
    expect(after?.type === "workspace" && after.chats).toHaveLength(0);
    w.ws.close();
    x.ws.close();
  });

  it("id hội thoại lạ bị từ chối, không đọc tệp ngoài thư mục", async () => {
    const { engine } = stubEngine(() => "ok");
    const { port } = await boot(engine);
    const c = await Client.connect(port);
    c.send(hi("ws-bad", "word"));
    await c.until("ready");
    c.send({ type: "ws_open", id: "../../etc/passwd" });
    expect((await c.until("error")).message).toContain("Không tìm thấy");
    c.send({ type: "ws_save", id: "../x", msgs: [{ role: "user", text: "a" }] });
    c.ws.close();
  });

  it("bộ nhớ dự án: hội thoại mới trong dự án mang tóm tắt các hội thoại cũ, không mang nguyên lịch sử", async () => {
    const { engine, seen } = stubEngine((req) =>
      req.buildPrompt(false, false).includes("Tóm tắt hội thoại sau") ? "- Đã chốt đề 15 phút lớp 8A gồm 10 câu" : "ok",
    );
    const { port } = await boot(engine, "ask");
    const w = await Client.connect(port);
    w.send(hi("mem-w", "word"));
    await w.until("ready");
    w.send({ type: "ws_project", project: { name: "Lớp 8A" } });
    await new Promise((r) => setTimeout(r, 150));
    const st = [...w.msgs].reverse().find((m) => m.type === "workspace");
    const pid = (st?.type === "workspace" && st.projects[0]?.id) || "";
    expect(pid).toBeTruthy();

    // Hội thoại 1 trong dự án, có nội dung dài riêng.
    w.send({ type: "ws_open", projectId: pid });
    await w.until("ws_chat");
    const long = "NOIDUNGRIENGCUAHOITHOAI1";
    w.send({ type: "chat", id: "first", text: "Ra đề", model: SONNET }); // ghi nhớ model đang dùng cho việc nền
    await w.until("done");
    w.send({ type: "ws_save", id: "mem1", msgs: [{ id: "u", role: "user", text: "Ra đề 15 phút", tools: [] }, { id: "a", role: "assistant", text: `Đã ra đề ${long}`, tools: [] }] });
    await new Promise((r) => setTimeout(r, 100));

    // Mở hội thoại mới trong dự án rồi hỏi: phải có tóm tắt, không có nguyên văn.
    w.send({ type: "ws_open", projectId: pid });
    await w.until("ws_chat");
    w.send({ type: "chat", id: "n1", text: "Soạn tiếp đáp án", model: SONNET });
    await w.until("done");
    const digestCalls = seen.filter((r) => r.prompt.includes("Tóm tắt hội thoại sau"));
    expect(digestCalls).toHaveLength(1);
    expect(digestCalls[0]!.effort).toBe("low");
    const chatCall = seen.find((r) => r.prompt.includes("Soạn tiếp đáp án"))!;
    expect(chatCall.prompt).toContain("BỐI CẢNH DỰ ÁN");
    expect(chatCall.prompt).toContain("Đã chốt đề 15 phút lớp 8A gồm 10 câu");
    expect(chatCall.prompt).not.toContain(long);
    w.ws.close();
  });
});

describe("bridge: tệp đính kèm", () => {
  const hi = (sessionId: string): ClientMessage => ({ type: "hello", host: "word", sessionId, lang: "vi" });

  it("tệp của hội thoại và của dự án vào lời nhắc; model đọc/tìm bằng công cụ; xóa hội thoại thì xóa tệp", async () => {
    const { engine, seen } = stubEngine((_r, n) =>
      n === 1 ? tool("office_file_search", { query: "ma sát" }) : n === 2 ? tool("office_file_read", { name: "sach", start: 9, length: 20 }) : "xong",
    );
    const { port, home } = await boot(engine, "ask");
    const w = await Client.connect(port);
    w.send(hi("fl-w"));
    await w.until("ready");
    w.send({ type: "ws_project", project: { name: "Lớp 8A" } });
    await new Promise((r) => setTimeout(r, 120));
    const st = [...w.msgs].reverse().find((m) => m.type === "workspace");
    const pid = (st?.type === "workspace" && st.projects[0]?.id) || "";
    w.send({ type: "ws_open", projectId: pid });
    await w.until("ws_chat");
    w.send({ type: "file_add", scope: "project", id: pid, name: "sach.md", text: "Chương 1\nLực ma sát nghỉ\nChương 2" });
    w.send({ type: "file_add", scope: "chat", id: "chatfile1", name: "de.txt", text: "Đề riêng của hội thoại" });
    w.send({ type: "file_add", scope: "project", id: "p-khong-co", name: "x", text: "y" });
    await new Promise((r) => setTimeout(r, 150));
    const ws1 = [...w.msgs].reverse().find((m) => m.type === "workspace");
    expect(ws1?.type === "workspace" && ws1.projectFiles[pid]?.[0]?.name).toBe("sach.md");
    expect(ws1?.type === "workspace" && ws1.chatFiles[0]?.name).toBe("de.txt");
    expect(ws1?.type === "workspace" && ws1.activeProject).toBe(pid);

    w.send({ type: "chat", id: "1", text: "tìm ma sát", model: SONNET });
    const done = await w.until("done", 8000);
    expect(done.id).toBe("1");
    expect(seen[0]?.prompt).toContain("TỆP ĐÍNH KÈM");
    expect(seen[0]?.prompt).toContain("sach.md");
    expect(seen[0]?.prompt).toContain("[Nội dung de.txt]");
    expect(seen[0]?.prompt).not.toContain("Lực ma sát nghỉ"); // tệp dự án chỉ liệt kê
    expect(seen[1]?.prompt).toContain("Lực ma sát nghỉ"); // kết quả tìm
    expect(seen[2]?.prompt).toContain("ma sát nghỉ"); // kết quả đọc đoạn

    // Lưu rồi xóa hội thoại: tệp của nó biến mất.
    w.send({ type: "ws_save", id: "chatfile1", msgs: [{ id: "u", role: "user", text: "tìm ma sát", tools: [] }, { id: "a", role: "assistant", text: "xong", tools: [] }] });
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(path.join(home, "files", "c-chatfile1.json"))).toBe(true);
    w.send({ type: "ws_delete", id: "chatfile1" });
    await new Promise((r) => setTimeout(r, 120));
    expect(fs.existsSync(path.join(home, "files", "c-chatfile1.json"))).toBe(false);
    w.send({ type: "ws_project_delete", id: pid });
    await new Promise((r) => setTimeout(r, 120));
    expect(fs.existsSync(path.join(home, "files", `p-${pid}.json`))).toBe(false);
    w.ws.close();
  });
});

describe("bridge: AI tự thiết kế", () => {
  it("trả ba ý tưởng mới, không đưa danh mục Office vào prompt", async () => {
    const ideas=[1,2,3].map(n=>({name:`Ý tưởng ${n}`,reason:"Dễ đọc",layout:`Bố cục riêng ${n}`,hierarchy:"Phân cấp ba tầng",tables:"Nhấn hàng tổng",fonts:{heading:"Arial",body:"Arial"},colors:{accent:"#234567",text:"#111111",background:"#ffffff"},bodySize:12,headingSizes:[18,16,14]}));
    const {engine,seen}=stubEngine(()=>JSON.stringify({direction:"Bảng tính dễ đọc",ideas}));
    const {port}=await boot(engine,"full");const c=await Client.connect(port);
    c.send({type:"hello",host:"excel",sessionId:"design-1",lang:"vi"});await c.until("ready");
    c.send({type:"theme_suggest",id:"s1",profile:"Bảng tính 1 sheet, 40 hàng, có hàng tiêu đề",wish:"xanh dịu",model:SONNET});
    const res=await c.until("write_result");const got=JSON.parse(res.text);
    expect(got.ideas).toHaveLength(3);expect(got.ideas[0].name).toBe("Ý tưởng 1");
    expect(seen[0]?.prompt).toContain("xanh dịu");expect(seen[0]?.prompt).toContain("ĐÚNG 3 phương án");
    expect(seen[0]?.prompt).not.toContain("<danh_muc_chu_de>");
    await c.until("done");c.ws.close();
  });
});
