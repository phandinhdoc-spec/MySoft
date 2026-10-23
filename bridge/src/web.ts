import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

export interface WebOptions {
  /** Thư mục add-in đã build (index.html, assets…). */
  dir: string;
  port: number;
  cert?: string;
  key?: string;
  pfx?: string;
  passphrase?: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/** Phục vụ tệp tĩnh của add-in; không cho thoát khỏi thư mục gốc. */
export function staticHandler(dir: string): http.RequestListener {
  const root = path.resolve(dir);
  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    let rel = "/";
    try {
      rel = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    } catch {
      /* giữ "/" */
    }
    if (rel === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "pvta-bridge" }));
      return;
    }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  };
}

/** Đọc cấu hình web từ biến môi trường / thư mục chứng chỉ. Trả về undefined nếu thiếu. */
export function detectWeb(home: string, env: NodeJS.ProcessEnv = process.env): WebOptions | undefined {
  const dir = env.PVTA_WEB;
  if (!dir || !fs.existsSync(path.join(dir, "index.html"))) return undefined;
  const certs = path.join(home, "certs");
  const port = Number(env.PVTA_WEB_PORT) || 52730;
  const crt = path.join(certs, "localhost.crt");
  const key = path.join(certs, "localhost.key");
  const pfx = path.join(certs, "localhost.pfx");
  if (fs.existsSync(crt) && fs.existsSync(key)) return { dir, port, cert: crt, key };
  if (fs.existsSync(pfx)) return { dir, port, pfx, passphrase: "pvta" };
  return undefined;
}

export function createWebServer(o: WebOptions): https.Server {
  const tls = o.pfx
    ? { pfx: fs.readFileSync(o.pfx), passphrase: o.passphrase }
    : { cert: fs.readFileSync(o.cert!), key: fs.readFileSync(o.key!) };
  return https.createServer(tls, staticHandler(o.dir));
}
