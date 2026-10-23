import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startServer, type RunningServer } from "../src/server.js";

let srv: RunningServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
  const opened = new Promise<void>((r) => ws.on("open", () => r()));
  const wait = async (pred: (m: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const m = msgs.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("không thấy tin nhắn");
  };
  return { ws, msgs, opened, wait };
}

describe("cập nhật qua bridge", () => {
  it("báo bản mới, tải, đổi chỗ và yêu cầu khởi động lại", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-us-"));
    const dir = path.join(home, "app");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "VERSION"), "1.0.0");
    const body = Buffer.alloc(2000, 3);
    const latest = { version: "1.1.0", sha256: crypto.createHash("sha256").update(body).digest("hex"), notes: "Có PDF" };
    const fetchFn = (async (u: string) => (String(u).includes("latest.json") ? new Response(JSON.stringify(latest)) : new Response(body))) as unknown as typeof fetch;
    let restarted = false;
    srv = await startServer({
      home,
      port: 0,
      allowNoOrigin: true,
      discover: false,
      web: false,
      update: {
        app: { appDir: dir, version: "1.0.0" },
        fetchFn,
        firstCheckMs: 0,
        restart: () => (restarted = true),
        extractFn: async (_t, into) => {
          fs.writeFileSync(path.join(into, "pvta-bridge.mjs"), "new");
          fs.writeFileSync(path.join(into, "VERSION"), "1.1.0");
          fs.mkdirSync(path.join(into, "web"));
          fs.writeFileSync(path.join(into, "web", "index.html"), "x");
        },
      },
    });
    const c = client(srv.port);
    await c.opened;
    c.ws.send(JSON.stringify({ type: "hello", sessionId: "upd-test-1", host: "word", lang: "vi", doc: "a.docx" }));
    const first = await c.wait((m) => m.type === "update");
    expect(first).toMatchObject({ current: "1.0.0", available: false, canUpdate: true });

    c.ws.send(JSON.stringify({ type: "update_check" }));
    const avail = await c.wait((m) => m.type === "update" && m.available === true);
    expect(avail).toMatchObject({ latest: "1.1.0", notes: "Có PDF" });

    c.ws.send(JSON.stringify({ type: "update_apply" }));
    await c.wait((m) => m.type === "update" && m.state === "restarting");
    expect(fs.readFileSync(path.join(dir, "VERSION"), "utf8")).toBe("1.1.0");
    for (let i = 0; i < 100 && !restarted; i++) await new Promise((r) => setTimeout(r, 20));
    expect(restarted).toBe(true);
    c.ws.close();
  });

  it("chạy từ mã nguồn: canUpdate=false", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-us-"));
    srv = await startServer({ home, port: 0, allowNoOrigin: true, discover: false, web: false, update: { app: false } });
    const c = client(srv.port);
    await c.opened;
    c.ws.send(JSON.stringify({ type: "hello", sessionId: "upd-test-2", host: "word", lang: "vi", doc: "a.docx" }));
    expect(await c.wait((m) => m.type === "update")).toMatchObject({ current: "dev", canUpdate: false, available: false });
    c.ws.close();
  });
});
