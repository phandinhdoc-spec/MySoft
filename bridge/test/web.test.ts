import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startServer, type RunningServer } from "../src/server.js";
import { detectWeb } from "../src/web.js";

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-web-"));
  const certs = path.join(home, "certs");
  fs.mkdirSync(certs);
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(certs, "localhost.key"), "-out", path.join(certs, "localhost.crt"), "-days", "2", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
  const web = path.join(home, "web");
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, "index.html"), "<h1>PVTA</h1>");
  fs.writeFileSync(path.join(home, "secret.txt"), "bí mật");
  return { home, web, ca: fs.readFileSync(path.join(certs, "localhost.crt")) };
}

function get(port: number, p: string, ca: Buffer): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    https.get({ host: "localhost", port, path: p, ca }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => resolve({ status: r.statusCode ?? 0, body: b }));
    }).on("error", reject);
  });
}

describe("máy chủ add-in HTTPS", () => {
  it("không có PVTA_WEB hoặc chứng chỉ thì không bật", () => {
    expect(detectWeb("/nonexistent", {})).toBeUndefined();
  });

  it("phục vụ index.html, chặn thoát thư mục, và nhận wss với Origin đúng", async () => {
    const { home, web, ca } = setup();
    const o = detectWeb(home, { PVTA_WEB: web, PVTA_WEB_PORT: "0" });
    expect(o?.cert).toBeTruthy();
    server = await startServer({ home, port: 0, web: { ...o!, port: 52790 }, idleCheckMs: 3_600_000 });
    expect((await get(52790, "/", ca)).body).toContain("PVTA");
    expect((await get(52790, "/health", ca)).status).toBe(200);
    expect((await get(52790, "/..%2fsecret.txt", ca)).status).not.toBe(200);
    expect((await get(52790, "/nope.js", ca)).status).toBe(404);

    const ok = new WebSocket("wss://localhost:52790/ws", { ca, headers: { Origin: "https://localhost:52730" } });
    await new Promise<void>((res, rej) => {
      ok.once("open", () => res());
      ok.once("error", rej);
    });
    ok.close();
    const bad = new WebSocket("wss://localhost:52790/ws", { ca, headers: { Origin: "https://evil.example" } });
    const code = await new Promise<number>((res) => {
      bad.once("unexpected-response", (_r, resp) => res(resp.statusCode ?? 0));
      bad.once("open", () => res(101));
      bad.once("error", () => res(-1));
    });
    expect(code).toBe(401);
  });
});
