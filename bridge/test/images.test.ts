import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage, ImgMeta } from "@pvta/shared";
import type { Engine, RunRequest } from "../src/engine.js";
import { claudeBackend } from "../src/backends/claude.js";
import { codexBackend } from "../src/backends/codex.js";
import { buildVisionPrompt, cleanMeta, imageSection, ImageStore, neededImages, parseVision } from "../src/images.js";
import { startServer, type RunningServer } from "../src/server.js";

// JPEG nhỏ hợp lệ về đầu tệp (FF D8) để kho ảnh nhận.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString("base64");
const flat = (args: Array<{ flag: string; value?: string }>) => args.flatMap((a) => (a.value === undefined ? [a.flag] : [a.flag, a.value]));

const MAP: ImgMeta[] = [
  { id: "H1", hash: "aaaaaaaaaaaa1", question: "Câu 1", context: "Câu 1. Cho mạch điện như hình. Tính cường độ dòng điện.", w: 200, h: 100 },
  { id: "H2", hash: "bbbbbbbbbbbb2", question: "Câu 2", caption: "Hình 2", context: "Câu 2. Dựa vào đồ thị hình 2.", w: 200, h: 100 },
];

describe("truyền ảnh cho CLI", () => {
  it("claude: có ảnh thì chỉ mở công cụ Read; không ảnh thì không công cụ nào", () => {
    const a = flat(claudeBackend.invocation({ model: "haiku", prompt: "x", permission: "ask", images: ["/h/img/a.jpg"] }).args);
    expect(a[a.indexOf("--tools") + 1]).toBe("Read");
    expect(a[a.indexOf("--allowedTools") + 1]).toBe("Read");
    const b = flat(claudeBackend.invocation({ model: "haiku", prompt: "x", permission: "ask" }).args);
    expect(b[b.indexOf("--tools") + 1]).toBe("");
    expect(b).not.toContain("--allowedTools");
  });
  it("codex: mỗi ảnh một cờ --image, đặt trước dấu '-'", () => {
    const a = flat(codexBackend.invocation({ model: "default", prompt: "x", permission: "ask", images: ["/h/a.jpg", "/h/b.jpg"] }).args);
    expect(a.filter((x) => x === "--image")).toHaveLength(2);
    expect(a.indexOf("/h/b.jpg")).toBeLessThan(a.indexOf("-"));
  });
});

describe("kho hình và lời nhắc", () => {
  it("chỉ nhận JPEG, mã băm hợp lệ", () => {
    const st = new ImageStore(fs.mkdtempSync(path.join(os.tmpdir(), "pvta-img-")));
    expect(st.saveImage("aaaaaaaaaaaa1", JPEG)).toBe(true);
    expect(st.saveImage("../../etc/passwd", JPEG)).toBe(false);
    expect(st.saveImage("aaaaaaaaaaaa2", Buffer.from("not an image at all, just text....................................................................................").toString("base64"))).toBe(false);
    expect(st.hasImage("aaaaaaaaaaaa1")).toBe(true);
  });
  it("làm sạch bản đồ hình từ add-in", () => {
    expect(cleanMeta([{ id: "H1", hash: "aaaaaaaaaaaa1", context: "x" }, { id: "evil", hash: "aaaaaaaaaaaa1" }, { id: "H2", hash: "../x" }])).toHaveLength(1);
  });
  it("đọc kết quả model: chỉ giữ hình có thật", () => {
    const got = parseVision('Đây: {"images":[{"id":"H1","what":"Mạch nối tiếp","data":"R1=6Ω, R2=3Ω, U=12V"},{"id":"H9","what":"lạ"}]}', ["H1", "H2"]);
    expect([...got.keys()]).toEqual(["H1"]);
    expect(got.get("H1")?.data).toContain("R1=6Ω");
  });
  it("lời nhắc đọc hình có đường dẫn ảnh và lời câu hỏi", () => {
    const { request } = buildVisionPrompt(MAP.map((m) => ({ ...m, file: `/x/${m.hash}.jpg` })), (f) => f);
    expect(request).toContain("/x/aaaaaaaaaaaa1.jpg");
    expect(request).toContain("Tính cường độ dòng điện");
  });
  it("hình cần cho yêu cầu: theo câu và theo chú thích", () => {
    expect(neededImages("Điền đáp án câu 1", MAP).map((m) => m.id)).toEqual(["H1"]);
    expect(neededImages("giải bài dựa vào hình 2", MAP).map((m) => m.id)).toEqual(["H2"]);
    expect(neededImages("sửa lỗi chính tả", MAP)).toEqual([]);
  });
  it("mục <hinh_anh>: hình đã đọc có số liệu, chưa đọc thì nói rõ", () => {
    const sec = imageSection(MAP, (h) => (h === "aaaaaaaaaaaa1" ? { what: "Mạch nối tiếp", data: "R1=6Ω", at: 1 } : undefined));
    expect(sec).toContain("H1 (Câu 1): Mạch nối tiếp | Số liệu: R1=6Ω");
    expect(sec).toContain("H2 (Câu 2, Hình 2): chưa đọc được");
    expect(sec).toContain("office_word_keep_together");
  });
});

// ---- Bridge: model nền đọc hình, phiên chính dùng kết quả ----
let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function boot(run: (req: RunRequest) => Promise<{ text: string }>) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-imgsrv-"));
  fs.writeFileSync(path.join(home, "probe.json"), JSON.stringify({ claude: { fingerprint: "1", flags: [], unsupported: [], installed: true } }));
  fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ permission: "ask" }));
  const seen: RunRequest[] = [];
  const prompts: string[] = [];
  const stub = {
    run: async (req: RunRequest) => {
      seen.push(req);
      prompts.push(req.buildPrompt(false, false));
      const r = await run(req);
      return { ...r, conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } };
    },
    prewarm: async () => false,
  } as unknown as Engine;
  server = await startServer({ home, port: 0, engine: stub, allowNoOrigin: true, idleCheckMs: 3_600_000, webFetch: async () => { throw new Error("offline"); } });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const msgs: ServerMessage[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
  await new Promise<void>((res, rej) => (ws.once("open", () => res()), ws.once("error", rej)));
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const until = async <T extends ServerMessage["type"]>(type: T, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 5000) => {
    const t0 = Date.now();
    for (;;) {
      const i = msgs.findIndex((m) => m.type === type && pred(m as never));
      if (i >= 0) return msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`hết giờ chờ '${type}'; đã nhận: ${JSON.stringify(msgs.map((m) => m.type))}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  send({ type: "hello", host: "word", sessionId: "i1", lang: "vi", doc: "De kiem tra Vat ly.docx" });
  await until("ready");
  return { send, until, seen, prompts, home };
}

const isVision = (r: RunRequest) => !!r.images?.length;
const VISION = JSON.stringify({ images: [{ id: "H1", what: "Mạch điện hai điện trở mắc nối tiếp", text: "R1 = 6 Ω; R2 = 3 Ω; U = 12 V", data: "R1 = 6 Ω nối tiếp R2 = 3 Ω, hiệu điện thế 12 V" }, { id: "H2", what: "Đồ thị vận tốc theo thời gian" }] });

describe("bridge: đọc hình ở nền, phiên chính dùng kết quả", () => {
  it("xin ảnh còn thiếu, đọc trong thư mục ẩn riêng; yêu cầu 'câu 1' nhận số liệu của hình câu 1", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { send, until, seen, prompts, home } = await boot(async (req) => (isVision(req) ? (await gate, { text: VISION }) : { text: "Đáp án câu 1: I = 12/(6+3) = 1,33 A." }));
    send({ type: "img_map", items: MAP });
    const need = await until("img_need");
    expect(need.hashes.sort()).toEqual(["aaaaaaaaaaaa1", "bbbbbbbbbbbb2"]);
    send({ type: "img_data", items: MAP.map((m) => ({ hash: m.hash, data: JPEG })) });
    // Hỏi ngay khi model nền còn đang đọc: phiên chính phải chờ đọc xong hình câu 1.
    await new Promise((r) => setTimeout(r, 100));
    send({ type: "chat", id: "c1", text: "Điền đáp án câu 1", model: { backend: "claude", model: "sonnet" } });
    await new Promise((r) => setTimeout(r, 150));
    expect(seen.filter((r) => !isVision(r))).toHaveLength(0); // còn đang chờ hình
    release();
    await until("done", (m) => m.id === "c1", 8000);
    const vision = seen.find(isVision)!;
    expect(vision.cwd).toBe(path.join(home, "hint"));
    expect(vision.images).toEqual(MAP.map((m) => path.join(home, "hint", "img", `${m.hash}.jpg`)));
    const chatPrompt = prompts[seen.findIndex((r) => !isVision(r))]!;
    expect(chatPrompt).toContain("<hinh_anh>");
    expect(chatPrompt).toContain("H1 (Câu 1): Mạch điện hai điện trở mắc nối tiếp");
    expect(chatPrompt).toContain("R1 = 6 Ω nối tiếp R2 = 3 Ω");
    expect((await until("img_status", (m) => m.read === 2)).total).toBe(2);
    // Lần sau: đã có mô tả, không xin ảnh, không đọc lại.
    send({ type: "img_map", items: MAP });
    await new Promise((r) => setTimeout(r, 150));
    expect(seen.filter(isVision)).toHaveLength(1);
  });

  it("model đọc hình lỗi: im lặng, việc chính vẫn chạy (chờ có giới hạn)", async () => {
    const { send, until, seen } = await boot(async (req) => {
      if (isVision(req)) throw new Error("hết hạn mức");
      return { text: "Không đọc được hình nên chưa điền." };
    });
    send({ type: "img_map", items: MAP });
    await until("img_need");
    send({ type: "img_data", items: MAP.map((m) => ({ hash: m.hash, data: JPEG })) });
    send({ type: "chat", id: "c2", text: "Điền đáp án câu 1", model: { backend: "claude", model: "sonnet" } });
    await until("done", (m) => m.id === "c2", 8000);
    expect(seen.some((r) => !isVision(r))).toBe(true);
  });
});
