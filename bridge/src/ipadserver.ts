import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import type { Duplex } from "node:stream";
import type { IpadStatus } from "@pvta/shared";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ensureCerts,
  IPAD_PORT,
  IPAD_SETUP_PORT,
  ipadManifest,
  lanAddresses,
  localHostname,
  mobileconfig,
  newToken,
  setupPage,
  tokenMatches,
} from "./ipad.js";
import { staticHandler } from "./web.js";

export interface IpadHostOptions {
  home: string;
  /** Thư mục add-in đã build; không có (chạy từ mã nguồn) thì không bật được. */
  webDir?: string;
  version?: string;
  port?: number;
  setupPort?: number;
  /** Đọc/ghi cấu hình iPad (bật/tắt, mã ghép nối). */
  load(): { enabled?: boolean; token?: string };
  save(patch: { enabled?: boolean; token?: string }): void;
  /** Giao kết nối iPad đã qua kiểm tra cho bộ xử lý WebSocket chung. */
  accept(ws: WebSocket, req: http.IncomingMessage): void;
  /** Thay cách lấy tên/IP (kiểm thử). */
  hostname?: () => string;
  addresses?: () => string[];
  reveal?: (dir: string) => void;
  /** Chu kỳ dò lại tên/IP khi đang chạy (mặc định 60 giây). */
  refreshMs?: number;
  /** Địa chỉ lắng nghe (mặc định mọi giao diện; kiểm thử dùng 127.0.0.1). */
  listenHost?: string;
}

/** Mở thư mục bằng Finder / Explorer. */
function revealDir(dir: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    const p = spawn(cmd, [dir], { detached: true, stdio: "ignore" });
    p.on("error", () => undefined);
    p.unref();
  } catch {
    /* bỏ qua */
  }
}

const listen = (s: http.Server, port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    const onErr = (e: Error) => reject(e);
    s.once("error", onErr);
    s.listen(port, host, () => {
      s.off("error", onErr);
      resolve();
    });
  });

const closeServer = (s?: http.Server) => new Promise<void>((r) => (s?.listening ? s.close(() => r()) : r()));

export class IpadHost {
  private tls?: https.Server;
  private setup?: http.Server;
  private wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  private names: string[] = [];
  private ips: string[] = [];
  private error?: string;
  private timer?: NodeJS.Timeout;
  /** Kết nối đến từ iPad (để add-in biết mình đang chạy trên iPad). */
  readonly remote = new WeakSet<WebSocket>();
  readonly dir: string;

  constructor(private o: IpadHostOptions) {
    this.dir = path.join(o.home, "ipad");
  }

  get port(): number {
    return this.tls?.address() && typeof this.tls.address() === "object" ? (this.tls.address() as { port: number }).port : (this.o.port ?? IPAD_PORT);
  }
  get setupPort(): number {
    return this.setup?.address() && typeof this.setup.address() === "object" ? (this.setup.address() as { port: number }).port : (this.o.setupPort ?? IPAD_SETUP_PORT);
  }

  private token(): string {
    let t = this.o.load().token;
    if (!t) {
      t = newToken();
      this.o.save({ token: t });
    }
    return t;
  }

  private origins(): Set<string> {
    const p = this.port;
    return new Set([...this.names, ...this.ips].map((h) => `https://${h}:${p}`));
  }

  /** Ghi hai manifest: theo tên máy (.local, không đổi khi đổi IP) và theo IP (khi Wi-Fi không hỗ trợ tên .local). */
  private writeManifests(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const t = this.token();
    for (const f of fs.readdirSync(this.dir)) if (/^PVTA-iPad.*\.xml$/.test(f)) fs.rmSync(path.join(this.dir, f), { force: true });
    fs.writeFileSync(path.join(this.dir, "PVTA-iPad.xml"), ipadManifest(`https://${this.names[0]}:${this.port}`, t, this.o.version));
    if (this.ips[0]) fs.writeFileSync(path.join(this.dir, "PVTA-iPad-theo-IP.xml"), ipadManifest(`https://${this.ips[0]}:${this.port}`, t, this.o.version));
    fs.writeFileSync(
      path.join(this.dir, "DOC-TOI.txt"),
      [
        "PVTA cho iPad",
        "",
        "1. Tren iPad mo Safari, vao http://" + this.names[0] + ":" + this.setupPort + " va lam theo huong dan (cai chung chi).",
        "2. Cam cap iPad vao may tinh. Mac: Finder -> iPad -> Tep. Windows: iTunes -> iPad -> Chia se tep.",
        "3. Keo PVTA-iPad.xml vao Word va Excel (PowerPoint co the chua ho tro).",
        "   Neu iPad bao khong mo duoc, thay bang PVTA-iPad-theo-IP.xml.",
        "4. Tren iPad: mo Word -> Trang dau -> Phan bo tro -> Xem tat ca -> PVTA (iPad).",
        "",
        "Cac tep .xml chua ma ghep noi rieng: dung gui cho nguoi khac.",
      ].join("\r\n"),
    );
  }

  private refreshNames(): boolean {
    const names = [(this.o.hostname ?? localHostname)()];
    const ips = (this.o.addresses ?? lanAddresses)();
    const changed = names.join() !== this.names.join() || ips.join() !== this.ips.join();
    this.names = names;
    this.ips = ips;
    return changed;
  }

  private onUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "https://x");
    const origin = req.headers.origin;
    const deny = (code: number) => {
      socket.write(`HTTP/1.1 ${code} ${code === 401 ? "Unauthorized" : "Forbidden"}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (url.pathname !== "/ws") return deny(403);
    if (!tokenMatches(this.o.load().token, url.searchParams.get("k"))) return deny(401);
    // Có Origin thì phải là chính trang add-in của máy chủ này.
    if (origin && !this.origins().has(origin)) return deny(403);
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.remote.add(ws);
      this.o.accept(ws, req);
    });
  };

  async start(): Promise<void> {
    this.error = undefined;
    if (!this.o.webDir || !fs.existsSync(path.join(this.o.webDir, "index.html"))) {
      this.error = "Chế độ iPad chỉ có ở bản cài đặt (chưa thấy thư mục add-in đã build).";
      return;
    }
    if (this.tls) return;
    this.refreshNames();
    try {
      const c = ensureCerts(path.join(this.dir, "certs"), this.names, this.ips);
      const host = this.o.listenHost ?? "0.0.0.0";
      const statics = staticHandler(this.o.webDir);
      const tls = https.createServer({ cert: c.certPem, key: c.keyPem }, statics);
      tls.on("upgrade", this.onUpgrade);
      const mc = mobileconfig(c.caPem, this.names[0]!);
      const setup = http.createServer((req, res) => {
        const p = (req.url ?? "/").split("?")[0];
        if (p === "/pvta-ipad.mobileconfig") {
          res.writeHead(200, { "content-type": "application/x-apple-aspen-config", "content-disposition": 'attachment; filename="pvta-ipad.mobileconfig"' });
          return void res.end(mc);
        }
        if (p === "/pvta-ca.crt") {
          res.writeHead(200, { "content-type": "application/x-x509-ca-cert" });
          return void res.end(c.caPem);
        }
        if (p === "/" || p === "/index.html") {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
          return void res.end(setupPage(this.names[0]!, this.ips));
        }
        res.writeHead(404);
        res.end();
      });
      await listen(tls, this.o.port ?? IPAD_PORT, host);
      try {
        await listen(setup, this.o.setupPort ?? IPAD_SETUP_PORT, host);
      } catch (e) {
        await closeServer(tls);
        throw e;
      }
      this.tls = tls;
      this.setup = setup;
      this.writeManifests();
      // Đổi Wi-Fi / đổi IP khi đang chạy: tự làm mới chứng chỉ và manifest theo IP (mỗi phút, rất nhẹ).
      this.timer = setInterval(() => this.refresh(), this.o.refreshMs ?? 60_000);
      this.timer.unref();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.error = /EADDRINUSE/.test(m) ? `Cổng ${this.o.port ?? IPAD_PORT} hoặc ${this.o.setupPort ?? IPAD_SETUP_PORT} đang bận.` : `Không mở được máy chủ iPad: ${m}`;
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const c of this.wss.clients) c.terminate();
    const t = this.tls;
    const s = this.setup;
    this.tls = undefined;
    this.setup = undefined;
    // Ngắt kết nối iPad đang mở (WebSocket nâng cấp từ máy chủ này) để tắt là tắt ngay.
    t?.closeAllConnections?.();
    await Promise.all([closeServer(t), closeServer(s)]);
  }

  async setEnabled(on: boolean): Promise<void> {
    this.o.save({ enabled: on });
    if (on) await this.start();
    else await this.stop();
  }

  /** Đổi mã ghép nối: iPad cũ bị ngắt, phải chép manifest mới. */
  async resetToken(): Promise<void> {
    this.o.save({ token: newToken() });
    if (this.tls) {
      for (const c of this.wss.clients) c.close(4001, "Mã ghép nối đã đổi");
      this.writeManifests();
    }
  }

  /** Tên/IP trong mạng đổi (đổi Wi-Fi): tạo lại chứng chỉ máy chủ và manifest theo IP. */
  refresh(): void {
    if (!this.tls || !this.refreshNames()) return;
    try {
      const c = ensureCerts(path.join(this.dir, "certs"), this.names, this.ips);
      this.tls.setSecureContext({ cert: c.certPem, key: c.keyPem });
      this.writeManifests();
    } catch (e) {
      this.error = `Không làm mới được chứng chỉ: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  revealManifests(): void {
    if (!this.tls) return;
    this.writeManifests();
    (this.o.reveal ?? revealDir)(this.dir);
  }

  status(remote: boolean): IpadStatus {
    const running = !!this.tls;
    return {
      enabled: this.o.load().enabled === true,
      running,
      remote,
      host: this.names[0] ?? (this.o.hostname ?? localHostname)(),
      ips: this.ips,
      port: this.port,
      setupUrl: running ? `http://${this.names[0]}:${this.setupPort}` : undefined,
      setupUrlIp: running && this.ips[0] ? `http://${this.ips[0]}:${this.setupPort}` : undefined,
      manifestDir: running ? this.dir : undefined,
      clients: this.wss.clients.size,
      error: this.error,
    };
  }

  async close(): Promise<void> {
    await this.stop();
    await new Promise<void>((r) => this.wss.close(() => r()));
  }
}
