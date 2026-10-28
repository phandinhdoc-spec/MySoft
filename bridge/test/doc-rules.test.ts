import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import type { Engine, RunRequest } from "../src/engine.js";
import { startServer, type RunningServer } from "../src/server.js";

let server: RunningServer | undefined;
const tmpDirs: string[] = [];

afterEach(async () => {
  await server?.close();
  server = undefined;
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

class TestClient {
  msgs: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  constructor(public ws: WebSocket) {
    ws.on("message", (d) => {
      this.msgs.push(JSON.parse(String(d)) as ServerMessage);
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  static async connect(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((res, rej) => {
      ws.once("open", () => res());
      ws.once("error", rej);
    });
    return new TestClient(ws);
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  async until<T extends ServerMessage["type"]>(
    type: T,
    pred?: (m: Extract<ServerMessage, { type: T }>) => boolean,
    timeout = 5000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const t0 = Date.now();
    for (;;) {
      const i = this.msgs.findIndex((m) => m.type === type && (!pred || pred(m as Extract<ServerMessage, { type: T }>)));
      if (i >= 0) return this.msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${type}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 30);
      });
    }
  }
}

describe("bridge: quy tắc cho văn bản cụ thể trên Office", () => {
  it("thiết lập ws_rules scope='doc' và áp dụng vào cả chat lẫn công cụ viết (write)", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-doc-rules-"));
    tmpDirs.push(home);
    // Tạo dữ liệu quy tắc từ dự án trong PVTA Chat để kiểm tra kết hợp
    fs.mkdirSync(path.join(home, "chatbox"), { recursive: true });
    fs.writeFileSync(
      path.join(home, "chatbox", "state.json"),
      JSON.stringify({
        preferences: { rules: "Quy tắc chung từ PVTA Chat." },
        projects: [
          {
            id: "p1",
            name: "Hóa 10",
            ruleBook: [{ id: "r1", key: "iupac", title: "Danh pháp IUPAC", text: "Dùng Copper(II) sulfate.", always: false }],
          },
        ],
      }),
    );

    const seen: RunRequest[] = [];
    const stub = {
      run: async (req: RunRequest) => {
        seen.push(req);
        return { text: "Kết quả đã soạn", conversationId: "c1", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } };
      },
    } as unknown as Engine;

    server = await startServer({ home, port: 0, engine: stub, allowNoOrigin: true, idleCheckMs: 3_600_000 });
    const c = await TestClient.connect(server.port);
    c.send({ type: "hello", host: "word", sessionId: "doc_s1", lang: "vi", doc: "Giao_an_Bai_5.docx" });
    await c.until("ready");
    const wsInit = await c.until("workspace");
    expect(wsInit.activeDoc).toBe("Giao_an_Bai_5.docx");
    expect(wsInit.chatRules?.rules.some((r) => r.key === "iupac")).toBe(true);

    // Đặt quy tắc riêng cho văn bản Giao_an_Bai_5.docx
    c.send({
      type: "ws_rules",
      scope: "doc",
      id: "chat_b5",
      doc: "Giao_an_Bai_5.docx",
      rules: "Soạn theo Công văn 5512, bảng 2 cột Hoạt động GV-HS và Sản phẩm.",
    });

    const wsUpdated = await c.until("workspace", (m) => Boolean(m.docRules?.includes("Công văn 5512")));
    expect(wsUpdated.docRules).toContain("Công văn 5512");

    // 1. Kiểm tra lượt chat có chứa quy tắc văn bản cụ thể + quy tắc từ PVTA Chat
    c.send({
      type: "chat",
      id: "turn1",
      text: "Soạn hoạt động khởi động #iupac",
      model: { backend: "claude", model: "sonnet" },
    });
    await c.until("done");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.system).toContain("Soạn theo Công văn 5512, bảng 2 cột Hoạt động GV-HS và Sản phẩm.");
    expect(seen[0]?.system).toContain("Quy tắc chung từ PVTA Chat.");
    expect(seen[0]?.buildPrompt(false, false)).toContain("Dùng Copper(II) sulfate.");

    // 2. Kiểm tra công cụ viết (write) cũng nhận được quy tắc của văn bản đang soạn
    c.send({
      type: "write",
      id: "w1",
      action: "formal",
      text: "Nội dung cần viết lại.",
      model: { backend: "claude", model: "sonnet" },
    });
    await c.until("done");
    expect(seen).toHaveLength(2);
    expect(seen[1]?.system).toContain("Soạn theo Công văn 5512, bảng 2 cột Hoạt động GV-HS và Sản phẩm.");

    c.ws.close();
  });
});
