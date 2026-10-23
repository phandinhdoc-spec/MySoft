/**
 * Chế độ iPad.
 *
 * iPad không chạy được CLI (agy/claude/codex) và Office cho iPad không nạp add-in từ localhost.
 * Vì vậy máy tính (Mac/Windows) đang cài PVTA làm "máy chủ" trong cùng mạng Wi-Fi:
 *  - Cổng HTTPS 52732 (mọi giao diện mạng): phục vụ add-in và WebSocket /ws cho iPad.
 *    WebSocket bắt buộc mã ghép nối (k=...) nằm trong manifest iPad; thiếu mã thì từ chối.
 *  - Cổng HTTP 52733: trang hướng dẫn + hồ sơ chứng chỉ (.mobileconfig) để iPad tin cậy HTTPS.
 *    Trang này không chứa mã ghép nối (chỉ chứng chỉ công khai).
 * Chứng chỉ do PVTA tự tạo: một CA riêng (cài lên iPad một lần) và chứng chỉ máy chủ
 * (tự tạo lại khi tên/IP trong mạng thay đổi, CA giữ nguyên nên iPad không phải cài lại).
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import forge from "node-forge";

export const IPAD_PORT = 52732;
export const IPAD_SETUP_PORT = 52733;
/** Id riêng của manifest iPad (khác Id bản máy tính để hai bản không đè nhau). */
export const IPAD_MANIFEST_ID = "9b4e2c71-5d3a-4f86-8c19-3e7a0d5b2f64";

/** IPv4 trong mạng nội bộ (10/8, 172.16/12, 192.168/16) của máy này. */
export function lanAddresses(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const out: string[] = [];
  for (const list of Object.values(ifaces)) {
    for (const a of list ?? []) {
      if (a.internal || a.family !== "IPv4") continue;
      if (isPrivateV4(a.address) && !out.includes(a.address)) out.push(a.address);
    }
  }
  return out.sort();
}

export function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return p[0] === 10 || (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) || (p[0] === 192 && p[1] === 168);
}

/** Tên Bonjour của máy (vd. "phan-macbook.local"). iPad tự tìm được tên .local trong cùng Wi-Fi. */
export function localHostname(platform: NodeJS.Platform = process.platform, raw?: string): string {
  let name = raw;
  if (name === undefined && platform === "darwin") {
    try {
      name = execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8", timeout: 2000 }).trim();
    } catch {
      /* dùng os.hostname */
    }
  }
  name = (name || os.hostname()).replace(/\.local\.?$/i, "").split(".")[0]!;
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "pvta"}.local`;
}

/** Mã ghép nối ngẫu nhiên (không đoán được) để iPad được phép nối WebSocket. */
export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** So sánh mã ghép nối không lộ thời gian. */
export function tokenMatches(expected: string | undefined, got: string | null | undefined): boolean {
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface IpadCerts {
  caPem: string;
  certPem: string;
  keyPem: string;
  names: string[];
  ips: string[];
}

const DAY = 86_400_000;

function serial(): string {
  // Số dương, 16 byte.
  return "01" + crypto.randomBytes(15).toString("hex");
}

function makeCa(): { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey; pem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - DAY);
  cert.validity.notAfter = new Date(Date.now() + 3650 * DAY);
  const attrs = [
    { name: "commonName", value: "PVTA iPad CA" },
    { name: "organizationName", value: "PVTA" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert, key: keys.privateKey, pem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

/**
 * Chứng chỉ máy chủ: iOS yêu cầu có SAN, EKU serverAuth, SHA-256, RSA ≥ 2048 và hạn ≤ 825 ngày.
 */
function makeLeaf(ca: forge.pki.Certificate, caKey: forge.pki.rsa.PrivateKey, names: string[], ips: string[]): { pem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - DAY);
  cert.validity.notAfter = new Date(Date.now() + 800 * DAY);
  cert.setSubject([{ name: "commonName", value: names[0] ?? "pvta.local" }]);
  cert.setIssuer(ca.subject.attributes);
  cert.setExtensions([
    { name: "basicConstraints", cA: false, critical: true },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
    { name: "extKeyUsage", serverAuth: true },
    { name: "subjectAltName", altNames: [...names.map((value) => ({ type: 2, value })), ...ips.map((ip) => ({ type: 7, ip }))] },
    { name: "authorityKeyIdentifier", keyIdentifier: ca.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  return { pem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

function writePrivate(file: string, data: string): void {
  fs.writeFileSync(file, data, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows */
  }
}

/**
 * Bảo đảm có CA và chứng chỉ máy chủ khớp tên/IP hiện tại trong thư mục dir.
 * Chỉ tạo lại chứng chỉ máy chủ khi tên/IP đổi hoặc sắp hết hạn; CA giữ nguyên.
 */
export function ensureCerts(dir: string, names: string[], ips: string[]): IpadCerts {
  fs.mkdirSync(dir, { recursive: true });
  const caCrt = path.join(dir, "ca.crt");
  const caKeyF = path.join(dir, "ca.key");
  const crt = path.join(dir, "server.crt");
  const keyF = path.join(dir, "server.key");
  const metaF = path.join(dir, "server.json");

  let caPem: string;
  let ca: forge.pki.Certificate;
  let caKey: forge.pki.rsa.PrivateKey;
  let caNew = false;
  try {
    caPem = fs.readFileSync(caCrt, "utf8");
    ca = forge.pki.certificateFromPem(caPem);
    caKey = forge.pki.privateKeyFromPem(fs.readFileSync(caKeyF, "utf8")) as forge.pki.rsa.PrivateKey;
    if (ca.validity.notAfter.getTime() < Date.now() + 30 * DAY) throw new Error("CA sắp hết hạn");
  } catch {
    const made = makeCa();
    ca = made.cert;
    caKey = made.key;
    caPem = made.pem;
    writePrivate(caKeyF, made.keyPem);
    fs.writeFileSync(caCrt, caPem);
    caNew = true;
  }

  const want = JSON.stringify({ names, ips, ca: ca.serialNumber });
  let fresh = !caNew;
  if (fresh) {
    try {
      fresh = fs.readFileSync(metaF, "utf8") === want;
      const leaf = forge.pki.certificateFromPem(fs.readFileSync(crt, "utf8"));
      if (leaf.validity.notAfter.getTime() < Date.now() + 30 * DAY) fresh = false;
      fs.accessSync(keyF);
    } catch {
      fresh = false;
    }
  }
  if (!fresh) {
    const leaf = makeLeaf(ca, caKey, names, ips);
    writePrivate(keyF, leaf.keyPem);
    fs.writeFileSync(crt, leaf.pem + caPem); // kèm CA để iPad nhận đủ chuỗi
    fs.writeFileSync(metaF, want);
  }
  return { caPem, certPem: fs.readFileSync(crt, "utf8"), keyPem: fs.readFileSync(keyF, "utf8"), names, ips };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Hồ sơ cấu hình iOS cài CA của PVTA (Cài đặt → Đã tải về hồ sơ → Cài đặt). */
export function mobileconfig(caPem: string, hostLabel: string): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(caPem))).getBytes();
  const b64 = forge.util.encode64(der);
  // UUID cố định theo CA: cài lại cùng CA thì iOS thay hồ sơ cũ thay vì thêm bản mới.
  const h = crypto.createHash("sha256").update(caPem).digest("hex");
  const uuid = (o: number) => `${h.slice(o, o + 8)}-${h.slice(o + 8, o + 12)}-4${h.slice(o + 13, o + 16)}-8${h.slice(o + 17, o + 20)}-${h.slice(o + 20, o + 32)}`.toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key><string>pvta-ca.cer</string>
      <key>PayloadContent</key><data>${b64}</data>
      <key>PayloadDescription</key><string>Chứng chỉ để iPad nối an toàn tới PVTA trên máy ${esc(hostLabel)}</string>
      <key>PayloadDisplayName</key><string>PVTA iPad CA</string>
      <key>PayloadIdentifier</key><string>vn.pvta.ipad.ca.cert</string>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadUUID</key><string>${uuid(0)}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key><string>Cho phép Word/Excel trên iPad mở PVTA từ máy tính trong cùng Wi-Fi.</string>
  <key>PayloadDisplayName</key><string>PVTA cho iPad</string>
  <key>PayloadIdentifier</key><string>vn.pvta.ipad</string>
  <key>PayloadOrganization</key><string>PVTA</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid(32)}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
}

/**
 * Manifest XML cho iPad (iPad chỉ nhận manifest XML cổ điển, không nhận localhost).
 * Không có nút trên ribbon: iPad mở qua Trang đầu → Phần bổ trợ → Xem tất cả.
 */
export function ipadManifest(origin: string, token: string, version = "1.0.0.0"): string {
  const v = /^\d+(\.\d+){0,3}$/.test(version) ? version.split(".").concat(["0", "0", "0"]).slice(0, 4).join(".") : "1.0.0.0";
  const o = esc(origin.replace(/\/+$/, ""));
  const src = `${o}/index.html?k=${encodeURIComponent(token)}&amp;ipad=1`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- PVTA cho iPad: chép tệp này vào Word/Excel trên iPad bằng Finder (Mac) hoặc iTunes (Windows). Tệp có mã ghép nối riêng, đừng chia sẻ. -->
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:type="TaskPaneApp">
  <Id>${IPAD_MANIFEST_ID}</Id>
  <Version>${v}</Version>
  <ProviderName>PVTA</ProviderName>
  <DefaultLocale>vi-VN</DefaultLocale>
  <DisplayName DefaultValue="PVTA (iPad)"/>
  <Description DefaultValue="Trợ lý PVTA trên iPad, chạy nhờ máy tính cài PVTA trong cùng Wi-Fi."/>
  <IconUrl DefaultValue="${o}/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="${o}/icon-64.png"/>
  <SupportUrl DefaultValue="https://github.com/phandinhdoc-spec/MySoft"/>
  <AppDomains>
    <AppDomain>${o}</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Document"/>
    <Host Name="Workbook"/>
    <Host Name="Presentation"/>
  </Hosts>
  <DefaultSettings>
    <SourceLocation DefaultValue="${src}"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
</OfficeApp>
`;
}

/** Trang hướng dẫn mở bằng Safari trên iPad (HTTP, không chứa mã ghép nối). */
export function setupPage(host: string, ips: string[]): string {
  const alt = ips.length ? ` (hoặc ${ips.map((ip) => `<code>http://${esc(ip)}:${IPAD_SETUP_PORT}</code>`).join(", ")})` : "";
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PVTA cho iPad</title>
<style>
:root{color-scheme:light dark;--ink:#1d1b2e;--bg:#fff;--violet:#5b3fd1;--muted:#6b6880;--line:#e6e3f2}
@media (prefers-color-scheme:dark){:root{--ink:#eceaf6;--bg:#16151d;--violet:#a796ff;--muted:#a9a6bb;--line:#2c2a3a}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 -apple-system,system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;margin:0 0 4px}h1 i{color:var(--violet)}p.sub{color:var(--muted);margin:0 0 20px}
ol{padding-left:22px}li{margin:0 0 14px}
a.btn{display:inline-block;background:var(--violet);color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:12px;margin:6px 0}
code{background:var(--line);padding:1px 6px;border-radius:6px;font-size:15px}
.note{border-left:3px solid var(--violet);padding:6px 12px;color:var(--muted)}
</style></head><body><main>
<h1><i>PVTA</i> cho iPad</h1>
<p class="sub">Máy tính đang làm máy chủ: <code>${esc(host)}</code>${alt}</p>
<ol>
<li><b>Cài chứng chỉ.</b> Bấm nút dưới, chọn <b>Cho phép</b>.<br><a class="btn" href="/pvta-ipad.mobileconfig">Tải hồ sơ PVTA</a></li>
<li>Mở <b>Cài đặt</b> → <b>Đã tải về hồ sơ</b> → <b>Cài đặt</b> (nhập mật mã iPad).</li>
<li>Vào <b>Cài đặt → Cài đặt chung → Giới thiệu → Cài đặt tin cậy chứng nhận</b>, bật <b>PVTA iPad CA</b>.</li>
<li>Kiểm tra: mở <a href="https://${esc(host)}:${IPAD_PORT}/health">liên kết này</a>. Thấy chữ <code>"ok":true</code> là xong.</li>
<li>Trên máy tính, ở PVTA → <b>Cài đặt → iPad</b>, bấm <b>Mở thư mục manifest</b>. Cắm cáp iPad, kéo tệp <code>PVTA-iPad.xml</code> vào <b>Word</b> và <b>Excel</b> (Finder → iPad → Tệp; trên Windows dùng iTunes → Chia sẻ tệp).</li>
<li>Trên iPad mở Word/Excel → mở một tệp → <b>Trang đầu → Phần bổ trợ → Xem tất cả</b> → <b>PVTA (iPad)</b>.</li>
</ol>
<p class="note">Máy tính phải bật, chưa ngủ, cùng Wi-Fi với iPad. Wi-Fi trường có thể chặn các máy nhìn thấy nhau; khi đó dùng điểm phát Wi-Fi của điện thoại.</p>
</main></body></html>`;
}
