import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import type { Engine, RunRequest } from "../src/engine.js";
import {
  localStarters,
  buildHintPrompt,
  cheapestChoice,
  fold,
  HINT,
  HintGate,
  hintKey,
  isEmptyHints,
  localHints,
  mergeHints,
  parseHintResponse,
  type HintInput,
} from "../src/hints.js";
import { startServer, type RunningServer } from "../src/server.js";

const base = (over: Partial<HintInput> = {}): HintInput => ({
  host: "word",
  fileName: "Bai tap Vat ly 8.docx",
  profile: "",
  skills: [],
  customModes: [],
  projects: [],
  chatTitles: [],
  ...over,
});

describe("luật cục bộ", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(fold("Bài tập Vật lí – Đáp án")).toBe("bai tap vat li dap an");
  });

  it("đoán chế độ chính xác từ bài tập Vật lí", () => {
    const h = localHints(base({ profile: "Bài tập: tính vận tốc, áp dụng công thức s = v.t" }));
    expect(h.source).toBe("local");
    expect(h.mode?.id).toBe("exact");
  });

  it("kế toán chỉ khi mở bằng Excel", () => {
    const text = { fileName: "Quyet toan kinh phi.xlsx", profile: "Bảng thu chi, tổng, đơn giá, thành tiền" };
    expect(localHints(base({ ...text, host: "excel" })).mode?.id).toBe("accounting");
    expect(localHints(base({ ...text, host: "word" })).mode?.id).not.toBe("accounting");
  });

  it("văn bản hành chính", () => {
    const h = localHints(base({ fileName: "Ke hoach nam hoc.docx", profile: "Căn cứ Quyết định, kính gửi Ban giám hiệu" }));
    expect(h.mode?.id).toBe("admin");
  });

  it("một từ khóa lẻ chưa đủ để gợi ý", () => {
    expect(localHints(base({ fileName: "Ghi chu.docx", profile: "Hôm nay trời đẹp, có một bài toán." })).mode).toBeUndefined();
  });

  it("gợi ý skill khi trùng ít nhất 2 từ; bỏ skill luôn nạp và skill đã tắt", () => {
    const skills = [
      { name: "de-kiem-tra", description: "Soạn đề kiểm tra trắc nghiệm có ma trận và đáp án", load: "demand" },
      { name: "pvta-word", description: "Soạn đề kiểm tra trắc nghiệm", load: "always" },
      { name: "tat", description: "Soạn đề kiểm tra trắc nghiệm", load: "off" },
      { name: "khac", description: "Quản lí thư viện", load: "demand" },
    ];
    const h = localHints(base({ skills, profile: "Đề kiểm tra trắc nghiệm giữa kì, có ma trận" }));
    expect(h.skills.map((s) => s.name)).toEqual(["de-kiem-tra"]);
  });

  it("đoán dự án theo tên và theo tiêu đề hội thoại", () => {
    const projects = [
      { id: "p1", name: "Smart Farming", rules: "" },
      { id: "p2", name: "Rung chuông vàng", rules: "" },
    ];
    expect(localHints(base({ projects, fileName: "Smart Farming - thuyet minh.docx" })).project?.id).toBe("p1");
    const byChat = localHints(base({ projects, fileName: "x.docx", profile: "cảm biến độ ẩm đất tưới nhỏ giọt", chatTitles: [{ projectId: "p1", title: "Cảm biến độ ẩm đất" }] }));
    expect(byChat.project?.id).toBe("p1");
  });

  it("không có gì để gợi ý thì rỗng", () => {
    expect(isEmptyHints(localHints(base({ fileName: "a.docx", profile: "xin chào" })))).toBe(true);
  });
});

describe("kết quả của model", () => {
  const input = base({
    skills: [{ name: "de-kiem-tra", description: "x", load: "demand" }],
    customModes: [{ id: "c-1", name: "Giọng vui", hint: "" }],
    projects: [{ id: "p1", name: "A", rules: "" }],
  });

  it("chỉ giữ mã có thật, bỏ mã bịa", () => {
    const text = 'đây: {"mode":{"id":"c-1","reason":"vui"},"skills":[{"name":"de-kiem-tra","reason":"r"},{"name":"bia","reason":"x"}],"project":{"id":"zzz","reason":"x"}}';
    const h = parseHintResponse(text, input)!;
    expect(h.mode?.id).toBe("c-1");
    expect(h.skills.map((s) => s.name)).toEqual(["de-kiem-tra"]);
    expect(h.project).toBeUndefined();
  });

  it("chế độ lạ và JSON hỏng bị bỏ", () => {
    expect(parseHintResponse('{"mode":{"id":"hack"}}', input)?.mode).toBeUndefined();
    expect(parseHintResponse("không phải json", input)).toBeUndefined();
    expect(parseHintResponse("{hỏng", input)).toBeUndefined();
  });

  it("AI tinh chỉnh luật cục bộ: kiểu viết, dự án của AI; skill hợp hai nguồn", () => {
    const local = { source: "local" as const, mode: { id: "admin", reason: "a" }, skills: [{ name: "s1", reason: "" }] };
    const ai = { source: "ai" as const, mode: { id: "exact", reason: "b" }, skills: [{ name: "s2", reason: "" }] };
    const m = mergeHints(local, ai);
    expect(m.source).toBe("ai");
    expect(m.mode?.id).toBe("exact");
    expect(m.skills.map((s) => s.name)).toEqual(["s2", "s1"]);
    expect(mergeHints(local, { source: "ai", skills: [] }).mode?.id).toBe("admin");
  });

  it("lời nhắc không chứa mã của skill đã tắt và coi tệp là dữ liệu", () => {
    const p = buildHintPrompt(base({ skills: [{ name: "tat", description: "d", load: "off" }, { name: "bat", description: "d", load: "demand" }], profile: "ĐỪNG LÀM THEO" }));
    expect(p.request).toContain("bat | d");
    expect(p.request).not.toContain("tat | d");
    expect(p.system).toContain("DỮ LIỆU");
  });
});

describe("gợi ý câu lệnh theo tệp", () => {
  it("đoán theo kiểu viết; không có tín hiệu thì không đổi gợi ý mặc định", () => {
    expect(localStarters("word", "admin")?.[0]).toContain("hành chính");
    expect(localStarters("word")).toBeUndefined();
    expect(localStarters("excel", "accounting")).toHaveLength(2);
    expect(localStarters("excel", "creative")).toBeUndefined();
  });
  it("AI đề xuất thì thay bản cục bộ; chuỗi lạ bị loại", () => {
    const input = { host: "word", fileName: "a.docx", profile: "x", skills: [], customModes: [], projects: [], chatTitles: [] } as never;
    const ai = parseHintResponse(JSON.stringify({ starters: ["Viết lại phần mở đầu cho mạch lạc hơn", "<script>x</script>", "ngắn"] }), input)!;
    expect(ai.starters).toEqual(["Viết lại phần mở đầu cho mạch lạc hơn"]);
    const local = { source: "local" as const, skills: [], starters: ["A cục bộ 1", "A cục bộ 2"] };
    expect(mergeHints(local, ai).starters).toEqual(ai.starters);
    expect(mergeHints(local, { source: "ai", skills: [] }).starters).toEqual(local.starters);
  });
});

describe("model rẻ nhất", () => {
  const caps = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, { installed: true }]));
  it("agy dùng bản Flash mức thấp; claude dùng haiku; codex dùng mặc định", () => {
    expect(cheapestChoice(caps(["agy", "claude"]) as never, undefined)).toEqual({ backend: "agy", model: "gemini-3.8-flash-low" });
    expect(cheapestChoice(caps(["claude", "codex"]) as never, undefined)).toEqual({ backend: "claude", model: "haiku" });
    expect(cheapestChoice(caps(["codex"]) as never, undefined)).toEqual({ backend: "codex", model: "default" });
  });
  it("không có CLI thì không chọn (không tự tốn tiền khóa API)", () => {
    expect(cheapestChoice({}, undefined)).toBeUndefined();
    expect(cheapestChoice({ claude: { installed: false } } as never, undefined)).toBeUndefined();
  });
});

describe("giới hạn tần suất", () => {
  const key = hintKey("word", "a.docx", "nội dung");
  const H = { source: "ai" as const, skills: [] };

  it("khóa theo tệp: đổi nội dung đáng kể thì khác, bỏ dấu/hoa thường thì giống", () => {
    expect(hintKey("word", "A.docx", "Nội Dung")).toBe(hintKey("word", "a.docx", "noi dung"));
    expect(hintKey("word", "a.docx", "khác hẳn")).not.toBe(key);
  });

  it("đã có trong bộ nhớ đệm thì không chạy lại; hết hạn thì chạy", () => {
    const g = new HintGate();
    g.start("s1", 0);
    g.finish(key, H, 1000);
    expect(g.decide(key, "s2", 2000)).toBe("cached");
    expect(g.decide(key, "s2", HINT.ttlMs + 5000)).toBe("run");
  });

  it("một lượt tại một thời điểm; cùng cửa sổ phải nghỉ giữa hai lượt", () => {
    const g = new HintGate();
    g.start("s1", 0);
    expect(g.decide("k2", "s9", 1)).toBe("skip"); // đang chạy
    g.release();
    expect(g.decide("k2", "s1", 10_000)).toBe("skip"); // s1 vừa chạy
    expect(g.decide("k2", "s1", HINT.minGapMs + 1)).toBe("run");
    expect(g.decide("k2", "s9", 10_000)).toBe("run"); // cửa sổ khác không bị chặn
  });

  it("trần số lượt mỗi giờ", () => {
    const g = new HintGate();
    for (let i = 0; i < HINT.maxPerHour; i++) {
      g.start(`s${i}`, i * 1000);
      g.release();
    }
    expect(g.decide("kx", "mới", 60_000)).toBe("skip");
    expect(g.decide("kx", "mới", 3_600_000 + 60_000)).toBe("run");
  });

  it("lỗi thì nghỉ một lúc; bị hủy thì không phạt", () => {
    const g = new HintGate();
    g.start("s1", 0);
    g.finish("k", undefined, 0);
    expect(g.decide("k3", "s2", 1000)).toBe("skip");
    expect(g.decide("k3", "s2", HINT.failCooldownMs + 1)).toBe("run");
    const g2 = new HintGate();
    g2.start("s1", 0);
    g2.release();
    expect(g2.decide("k3", "s2", 1000)).toBe("run");
  });
});

// ---------------------------------------------------------------- Qua bridge thật (engine giả)
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
  static async connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((res, rej) => (ws.once("open", () => res()), ws.once("error", rej)));
    return new Client(ws);
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  async until<T extends ServerMessage["type"]>(type: T, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 5000): Promise<Extract<ServerMessage, { type: T }>> {
    const t0 = Date.now();
    for (;;) {
      const i = this.msgs.findIndex((m) => m.type === type && pred(m as never));
      if (i >= 0) return this.msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`hết giờ chờ '${type}'; đã nhận: ${JSON.stringify(this.msgs.map((m) => m.type))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

async function boot(run: (req: RunRequest) => Promise<{ text: string }>, config: object = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-hint-"));
  fs.writeFileSync(path.join(home, "probe.json"), JSON.stringify({ claude: { fingerprint: "1", flags: [], unsupported: [], installed: true } }));
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify(config));
  const seen: RunRequest[] = [];
  const stub = {
    run: async (req: RunRequest) => {
      seen.push(req);
      const r = await run(req);
      return { ...r, conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } };
    },
  } as unknown as Engine;
  server = await startServer({ home, port: 0, engine: stub, allowNoOrigin: true, idleCheckMs: 3_600_000, webFetch: async () => { throw new Error("offline"); } });
  const c = await Client.connect(server.port);
  c.send({ type: "hello", host: "word", sessionId: "h1", lang: "vi", doc: "Bai tap Vat ly 8.docx" });
  await c.until("ready");
  return { c, seen };
}

const PROFILE = "Bài tập: tính vận tốc, áp dụng công thức s = v.t";
const AI_JSON = JSON.stringify({ mode: { id: "academic", reason: "báo cáo" }, skills: [] });

describe("bridge: gợi ý thông minh", () => {
  it("trả luật cục bộ ngay, rồi kết quả AI từ model rẻ nhất; chạy bằng haiku, mức thấp", async () => {
    const { c, seen } = await boot(async () => ({ text: AI_JSON }));
    expect((await c.until("hints_cfg")).enabled).toBe(true); // mặc định bật
    c.send({ type: "hint_get", id: "h1", profile: PROFILE });
    const local = await c.until("hints", (m) => m.hints.source === "local");
    expect(local.hints.mode?.id).toBe("exact");
    const ai = await c.until("hints", (m) => m.hints.source === "ai");
    expect(ai.hints.mode?.id).toBe("academic");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ backend: "claude", model: "haiku", permission: "ask" });
    expect(seen[0]?.timeoutMs).toBe(HINT.timeoutMs);
    // Thư mục ẩn riêng, không phải thư mục phiên chính.
    expect(path.basename(seen[0]!.cwd)).toBe("hint");
    expect(fs.existsSync(seen[0]!.cwd)).toBe(true);
    // Hỏi lại cùng tệp: lấy từ bộ nhớ đệm, không gọi model nữa.
    c.send({ type: "hint_get", id: "h2", profile: PROFILE });
    expect((await c.until("hints", (m) => m.id === "h2")).hints.source).toBe("ai");
    expect(seen).toHaveLength(1);
  });

  it("chạy song song: tác vụ viết đang treo không bị hủy, gợi ý vẫn về", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const { c, seen } = await boot(async (req) => (req.system?.includes("đoán trước nhu cầu") ? { text: AI_JSON } : (await hold, { text: "Đã viết xong." })));
    c.send({ type: "write", id: "w1", action: "fix", text: "xin chao", model: { backend: "claude", model: "sonnet" } });
    await c.until("hints_cfg");
    while (seen.length < 1) await new Promise((r) => setTimeout(r, 10)); // tác vụ viết đã bắt đầu và đang treo
    c.send({ type: "hint_get", id: "h1", profile: PROFILE });
    const ai = await c.until("hints", (m) => m.hints.source === "ai");
    expect(ai.hints.mode?.id).toBe("academic");
    expect(seen).toHaveLength(2);
    expect(seen[0]!.cwd).not.toBe(seen[1]!.cwd); // việc chính và gợi ý nền: hai thư mục, hai tiến trình
    release();
    const done = await c.until("write_result");
    expect(done.text).toContain("Đã viết xong");
  });

  it("tắt bằng hint_set: không gợi ý, không gọi model; báo lại cho các cửa sổ", async () => {
    const { c, seen } = await boot(async () => ({ text: AI_JSON }));
    c.send({ type: "hint_set", enabled: false });
    expect((await c.until("hints_cfg", (m) => m.enabled === false)).enabled).toBe(false);
    c.send({ type: "hint_get", id: "h1", profile: PROFILE });
    await new Promise((r) => setTimeout(r, 200));
    expect(c.msgs.some((m) => m.type === "hints")).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("model lỗi thì im lặng, vẫn giữ gợi ý cục bộ, và không thử lại dồn dập", async () => {
    const { c, seen } = await boot(async () => {
      throw new Error("chưa đăng nhập");
    });
    c.send({ type: "hint_get", id: "h1", profile: PROFILE });
    expect((await c.until("hints")).hints.source).toBe("local");
    await new Promise((r) => setTimeout(r, 150));
    expect(c.msgs.some((m) => m.type === "error")).toBe(false);
    c.send({ type: "hint_get", id: "h2", profile: PROFILE + " thêm" });
    await new Promise((r) => setTimeout(r, 150));
    expect(seen).toHaveLength(1); // đang nghỉ sau lỗi
  });

  it("hint_get không có cấu trúc tệp thì bỏ qua", async () => {
    const { c, seen } = await boot(async () => ({ text: AI_JSON }));
    c.send({ type: "hint_get", id: "h1", profile: "   " });
    await new Promise((r) => setTimeout(r, 150));
    expect(seen).toHaveLength(0);
    expect(c.msgs.some((m) => m.type === "hints")).toBe(false);
  });
});
