import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import forge from "node-forge";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ensureCerts, ipadManifest, isPrivateV4, lanAddresses, localHostname, mobileconfig, tokenMatches } from "../src/ipad.js";
import { startServer, type RunningServer } from "../src/server.js";

let srv: RunningServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p));

describe("chế độ iPad: phần tĩnh", () => {
  it("chỉ lấy IPv4 nội bộ", () => {
    expect(isPrivateV4("192.168.1.5")).toBe(true);
    expect(isPrivateV4("172.20.0.1")).toBe(true);
    expect(isPrivateV4("172.40.0.1")).toBe(false);
    expect(isPrivateV4("8.8.8.8")).toBe(false);
    expect(isPrivateV4("10.0.0")).toBe(false);
    const ifs = {
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      en0: [
        { address: "192.168.1.9", family: "IPv4", internal: false },
        { address: "fe80::1", family: "IPv6", internal: false },
      ],
      utun: [{ address: "100.64.1.2", family: "IPv4", internal: false }],
    } as unknown as NodeJS.Dict<os.NetworkInterfaceInfo[]>;
    expect(lanAddresses(ifs)).toEqual(["192.168.1.9"]);
  });

  it("tên máy thành tên .local hợp lệ (bỏ dấu tiếng Việt)", () => {
    expect(localHostname("linux", "Máy của Phan Đình")).toBe("may-cua-phan-dinh.local");
    expect(localHostname("linux", "Phans-MacBook-Air.local")).toBe("phans-macbook-air.local");
    expect(localHostname("linux", "!!!")).toBe("pvta.local");
  });

  it("so mã ghép nối", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abd")).toBe(false);
    expect(tokenMatches("abc", "ab")).toBe(false);
    expect(tokenMatches(undefined, "abc")).toBe(false);
    expect(tokenMatches("abc", null)).toBe(false);
  });

  it("tạo CA + chứng chỉ máy chủ đúng yêu cầu iOS; đổi IP chỉ tạo lại chứng chỉ máy chủ", () => {
    const dir = tmp("pvta-ipcert-");
    const a = ensureCerts(dir, ["may.local"], ["192.168.1.9"]);
    const ca = forge.pki.certificateFromPem(a.caPem);
    const leaf = forge.pki.certificateFromPem(a.certPem);
    expect(ca.verify(leaf)).toBe(true);
    const san = leaf.getExtension("subjectAltName") as { altNames: Array<{ type: number; value?: string; ip?: string }> };
    expect(san.altNames.map((x) => (x.type === 7 ? (forge.util as unknown as { bytesToIP(b: string): string }).bytesToIP(x.value!) : x.value))).toEqual(["may.local", "192.168.1.9"]);
    expect((leaf.getExtension("extKeyUsage") as { serverAuth?: boolean }).serverAuth).toBe(true);
    const days = (leaf.validity.notAfter.getTime() - leaf.validity.notBefore.getTime()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(825);
    expect((ca.getExtension("basicConstraints") as { cA?: boolean }).cA).toBe(true);
    // Khóa riêng không cho người khác đọc.
    if (process.platform !== "win32") expect(fs.statSync(path.join(dir, "ca.key")).mode & 0o077).toBe(0);

    const same = ensureCerts(dir, ["may.local"], ["192.168.1.9"]);
    expect(same.certPem).toBe(a.certPem);
    const moved = ensureCerts(dir, ["may.local"], ["10.0.0.4"]);
    expect(moved.caPem).toBe(a.caPem);
    expect(moved.certPem).not.toBe(a.certPem);
    expect(ca.verify(forge.pki.certificateFromPem(moved.certPem))).toBe(true);
  });

  it("hồ sơ iOS chứa đúng CA, manifest iPad không dùng localhost và có mã", () => {
    const { caPem } = ensureCerts(tmp("pvta-ipmc-"), ["may.local"], []);
    const mc = mobileconfig(caPem, "may.local");
    const b64 = /<data>([A-Za-z0-9+/=]+)<\/data>/.exec(mc)![1]!;
    const back = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(b64)));
    expect(forge.pki.certificateToPem(back)).toBe(caPem);
    expect(mc).toContain("com.apple.security.root");
    expect(mobileconfig(caPem, "may.local")).toBe(mc); // UUID ổn định

    const xml = ipadManifest("https://may.local:52732", "a+b/c", "1.0.21");
    expect(xml).toContain('SourceLocation DefaultValue="https://may.local:52732/index.html?k=a%2Bb%2Fc&amp;ipad=1"');
    expect(xml).toContain("<Version>1.0.21.0</Version>");
    expect(xml).not.toContain("localhost");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  });
});

function get(url: string, ca?: string): Promise<{ status: number; body: string; type?: string }> {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    mod
      .get(url, { ca }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => resolve({ status: r.statusCode ?? 0, body: b, type: r.headers["content-type"] }));
      })
      .on("error", reject);
  });
}

function client(url: string, opts: WebSocket.ClientOptions = {}) {
  const ws = new WebSocket(url, opts);
  const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
  const opened = new Promise<number>((res) => {
    ws.once("open", () => res(101));
    ws.once("unexpected-response", (_r, resp) => res(resp.statusCode ?? 0));
    ws.once("error", () => res(-1));
  });
  const wait = async (pred: (m: any) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const m = [...msgs].reverse().find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("không thấy tin nhắn");
  };
  const closed = new Promise<number>((r) => ws.once("close", (c) => r(c)));
  return { ws, msgs, opened, wait, closed };
}

describe("chế độ iPad: máy chủ trong mạng", () => {
  it("bật từ máy tính, iPad nối bằng mã ghép nối, đổi mã thì iPad cũ bị ngắt, tắt là đóng cổng", async () => {
    const home = tmp("pvta-ipad-");
    const web = path.join(home, "web");
    fs.mkdirSync(web);
    fs.writeFileSync(path.join(web, "index.html"), "<h1>PVTA</h1>");
    let revealed = "";
    srv = await startServer({
      home,
      port: 0,
      allowNoOrigin: true,
      discover: false,
      web: false,
      update: { app: false },
      ipad: {
        webDir: web,
        port: 52792,
        setupPort: 52793,
        listenHost: "127.0.0.1",
        hostname: () => "localhost",
        addresses: () => ["127.0.0.1"],
        reveal: (d) => (revealed = d),
      },
    });
    const pc = client(`ws://127.0.0.1:${srv.port}/ws`);
    await pc.opened;
    pc.ws.send(JSON.stringify({ type: "hello", host: "word", sessionId: "pc0000001", lang: "vi" }));
    const off = await pc.wait((m) => m.type === "ipad");
    expect(off.enabled).toBe(false);
    expect(off.running).toBe(false);
    expect(off.remote).toBe(false);

    pc.ws.send(JSON.stringify({ type: "ipad_set", enabled: true }));
    const on = await pc.wait((m) => m.type === "ipad" && m.running);
    expect(on.setupUrl).toBe("http://localhost:52793");
    expect(on.manifestDir).toBe(path.join(home, "ipad"));

    // Trang hướng dẫn + hồ sơ chứng chỉ qua HTTP (không lộ mã ghép nối).
    const page = await get("http://127.0.0.1:52793/");
    expect(page.status).toBe(200);
    const token = JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).ipad.token as string;
    expect(token.length).toBeGreaterThan(20);
    expect(page.body).not.toContain(token);
    const mc = await get("http://127.0.0.1:52793/pvta-ipad.mobileconfig");
    expect(mc.type).toBe("application/x-apple-aspen-config");
    expect(mc.body).not.toContain(token);

    const ca = fs.readFileSync(path.join(home, "ipad", "certs", "ca.crt"), "utf8");
    expect((await get("https://localhost:52792/health", ca)).status).toBe(200);
    expect((await get("https://localhost:52792/", ca)).body).toContain("PVTA");

    const manifest = fs.readFileSync(path.join(home, "ipad", "PVTA-iPad.xml"), "utf8");
    expect(manifest).toContain(`https://localhost:52792/index.html?k=${encodeURIComponent(token)}`);
    expect(fs.existsSync(path.join(home, "ipad", "PVTA-iPad-theo-IP.xml"))).toBe(true);

    // Thiếu mã / sai mã / sai Origin: từ chối.
    const origin = "https://localhost:52792";
    expect(await client("wss://localhost:52792/ws", { ca, headers: { Origin: origin } }).opened).toBe(401);
    expect(await client("wss://localhost:52792/ws?k=sai", { ca, headers: { Origin: origin } }).opened).toBe(401);
    expect(await client(`wss://localhost:52792/ws?k=${encodeURIComponent(token)}`, { ca, headers: { Origin: "https://evil.example" } }).opened).toBe(403);

    // Đúng mã: dùng như add-in bình thường, biết mình đang ở iPad.
    const pad = client(`wss://localhost:52792/ws?k=${encodeURIComponent(token)}`, { ca, headers: { Origin: origin } });
    expect(await pad.opened).toBe(101);
    pad.ws.send(JSON.stringify({ type: "hello", host: "excel", sessionId: "ipad00001", lang: "vi" }));
    expect((await pad.wait((m) => m.type === "ready")).type).toBe("ready");
    const st = await pad.wait((m) => m.type === "ipad");
    expect(st.remote).toBe(true);
    expect(st.clients).toBe(1);

    // iPad không tự tắt được, không mở thư mục trên máy tính.
    pad.ws.send(JSON.stringify({ type: "ipad_set", enabled: false }));
    pad.ws.send(JSON.stringify({ type: "ipad_reveal" }));
    await new Promise((r) => setTimeout(r, 150));
    expect(revealed).toBe("");
    expect((await get("https://localhost:52792/health", ca)).status).toBe(200);

    pc.ws.send(JSON.stringify({ type: "ipad_reveal" }));
    await new Promise((r) => setTimeout(r, 100));
    expect(revealed).toBe(path.join(home, "ipad"));

    // Đổi mã: iPad cũ bị ngắt, manifest mới mang mã mới.
    pc.ws.send(JSON.stringify({ type: "ipad_reset" }));
    expect(await pad.closed).toBe(4001);
    const token2 = JSON.parse(fs.readFileSync(path.join(home, "config.json"), "utf8")).ipad.token as string;
    expect(token2).not.toBe(token);
    expect(fs.readFileSync(path.join(home, "ipad", "PVTA-iPad.xml"), "utf8")).toContain(encodeURIComponent(token2));
    expect(await client(`wss://localhost:52792/ws?k=${encodeURIComponent(token)}`, { ca, headers: { Origin: origin } }).opened).toBe(401);

    // Tắt: đóng cổng.
    pc.ws.send(JSON.stringify({ type: "ipad_set", enabled: false }));
    await pc.wait((m) => m.type === "ipad" && !m.running && !m.enabled);
    await expect(get("http://127.0.0.1:52793/")).rejects.toThrow();
    pc.ws.close();
  }, 60_000);

  it("đã bật thì khởi động cùng bridge; chạy từ mã nguồn (không có web) thì báo lỗi rõ", async () => {
    const home = tmp("pvta-ipad2-");
    fs.writeFileSync(path.join(home, "config.json"), JSON.stringify({ ipad: { enabled: true } }));
    srv = await startServer({
      home,
      port: 0,
      allowNoOrigin: true,
      discover: false,
      web: false,
      update: { app: false },
      ipad: { port: 52794, setupPort: 52795, listenHost: "127.0.0.1", hostname: () => "localhost", addresses: () => [] },
    });
    const pc = client(`ws://127.0.0.1:${srv.port}/ws`);
    await pc.opened;
    pc.ws.send(JSON.stringify({ type: "hello", host: "word", sessionId: "pc0000002", lang: "vi" }));
    const st = await pc.wait((m) => m.type === "ipad");
    expect(st.enabled).toBe(true);
    expect(st.running).toBe(false);
    expect(st.error).toMatch(/bản cài đặt/);
    pc.ws.close();
  }, 30_000);
});
