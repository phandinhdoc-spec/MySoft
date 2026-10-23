import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import { LICENSE_CONFIG } from "@pvta/core/license/config";
import { machineId, signToken } from "@pvta/core/license/index";
import { startServer, type RunningServer } from "../src/server.js";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const saved = { ...LICENSE_CONFIG };
let server: RunningServer | undefined;
let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-gate-"));
  Object.assign(LICENSE_CONFIG, { endpoint: "https://script.google.com/macros/s/x/exec", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() });
});
afterEach(async () => {
  Object.assign(LICENSE_CONFIG, saved);
  await server?.close();
  server = undefined;
  fs.rmSync(home, { recursive: true, force: true });
});

async function talk(msgs: ClientMessage[]): Promise<ServerMessage[]> {
  const stub = { run: async () => ({ text: "ok", conversationId: "c", fullPrompt: true, attempts: 1, timings: { totalMs: 1 } }) } as never;
  server = await startServer({ home, port: 0, engine: stub, allowNoOrigin: true, idleCheckMs: 3_600_000 });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const got: ServerMessage[] = [];
  ws.on("message", (d) => got.push(JSON.parse(String(d))));
  await new Promise<void>((r) => ws.once("open", () => r()));
  for (const m of msgs) ws.send(JSON.stringify(m));
  await new Promise((r) => setTimeout(r, 400));
  ws.close();
  return got;
}
const hello: ClientMessage = { type: "hello", host: "word", sessionId: "g1", lang: "vi" };
const chat = { type: "chat", id: "c1", text: "xin chào", model: { backend: "claude", model: "sonnet" } } as unknown as ClientMessage;

describe("bridge: giấy phép", () => {
  it("chưa kích hoạt: thao tác AI bị từ chối kèm hướng dẫn, kết nối vẫn mở", async () => {
    const got = await talk([hello, chat]);
    expect(got.some((m) => m.type === "ready")).toBe(true);
    const err = got.find((m) => m.type === "error") as Extract<ServerMessage, { type: "error" }>;
    expect(err).toMatchObject({ id: "c1", kind: "denied" });
    expect(err.message).toContain("kích hoạt");
  });
  it("đã kích hoạt (token đúng chữ ký, đúng máy): không bị chặn", async () => {
    const token = signToken({ v: 1, email: "co@gmail.com", device: machineId(), iat: 1, max: 3 }, privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    fs.writeFileSync(path.join(home, "license.json"), JSON.stringify({ version: 1, key: "k", token, email: "co@gmail.com" }));
    const got = await talk([hello, chat]);
    expect(got.find((m) => m.type === "error" && (m as { kind: string }).kind === "denied")).toBeUndefined();
  });
});
