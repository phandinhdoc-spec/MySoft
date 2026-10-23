import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maskPersonal } from "../learner.js";
import { LICENSE_CONFIG, type LicenseConfig } from "./config.js";

/**
 * Giấy phép theo email (không bán phần mềm, nhưng không để ai cũng dùng được).
 *  - Chủ phần mềm cấp cho mỗi email MỘT mã kích hoạt (không phải mật khẩu).
 *  - Người dùng nhập email + mã trên mỗi máy; máy chủ (Google Apps Script của chủ) cho tối đa 3 thiết bị.
 *  - Máy chủ ký giấy phép bằng RSA. Máy người dùng kiểm chữ ký bằng khóa công khai, nên dùng offline vô thời hạn,
 *    cập nhật thoải mái. Chỉ khi máy chủ nói rõ «đã thu hồi» thì mới khóa; mất mạng không bao giờ làm khóa.
 *  - Chữ ký chỉ chống làm giả giấy phép; không phải DRM. Ai sửa mã nguồn để bỏ qua thì không ngăn được (chấp nhận).
 */

export type LicenseError = "khong-co-email" | "sai-ma" | "het-thiet-bi" | "bi-khoa" | "da-thu-hoi" | "khong-hop-le" | "mang";

export const LICENSE_MESSAGES: Record<LicenseError, string> = {
  "khong-co-email": "Email này chưa được cấp quyền dùng PVTA. Hãy nhờ người phát hành cấp mã.",
  "sai-ma": "Mã kích hoạt chưa đúng.",
  "het-thiet-bi": "Email này đã dùng hết số thiết bị cho phép. Gỡ một máy cũ (Cài đặt › Giấy phép) hoặc nhờ người phát hành đặt lại.",
  "bi-khoa": "Email này tạm khóa do nhập sai mã nhiều lần. Hãy liên hệ người phát hành.",
  "da-thu-hoi": "Quyền dùng của email này đã bị thu hồi.",
  "khong-hop-le": "Phản hồi từ máy chủ giấy phép không hợp lệ.",
  mang: "Không kết nối được máy chủ giấy phép. Kiểm tra mạng rồi thử lại.",
};

export class LicenseFailure extends Error {
  constructor(readonly code: LicenseError) {
    super(LICENSE_MESSAGES[code]);
  }
}

export interface LicensePayload {
  role?: "admin" | "user";
  v: 1;
  email: string;
  device: string;
  iat: number;
  max: number;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** token = base64url(JSON payload) + "." + base64(chữ ký RSA-SHA256 của chuỗi phần đầu). */
export function verifyToken(token: string, publicKeyPem: string): LicensePayload | undefined {
  const [head, sig, extra] = token.split(".");
  if (!head || !sig || extra !== undefined) return undefined;
  try {
    const ok = crypto.verify("sha256", Buffer.from(head), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, "base64"));
    if (!ok) return undefined;
    const p = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as LicensePayload;
    return p?.v === 1 && typeof p.email === "string" && typeof p.device === "string" ? p : undefined;
  } catch {
    return undefined;
  }
}

/** Dùng cho kiểm thử và cho tập lệnh mẫu: ký giống hệt máy chủ Apps Script. */
export function signToken(payload: LicensePayload, privateKeyPem: string): string {
  const head = b64url(JSON.stringify(payload));
  const sig = crypto.sign("sha256", Buffer.from(head), crypto.createPrivateKey(privateKeyPem));
  return `${head}.${sig.toString("base64")}`;
}

/** Mã thiết bị ổn định theo máy (tên máy, người dùng, hệ điều hành, địa chỉ MAC đầu tiên). Chỉ gửi bản băm. */
export function machineId(): string {
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && !n.internal && n.mac && n.mac !== "00:00:00:00:00:00")
    .map((n) => n!.mac)
    .sort();
  let user = "";
  try {
    user = os.userInfo().username;
  } catch {
    /* không đọc được */
  }
  return crypto.createHash("sha256").update([os.hostname(), user, os.platform(), os.arch(), macs[0] ?? ""].join("|")).digest("hex").slice(0, 32);
}

interface LicenseFile {
  version: 1;
  /** Khóa riêng của thiết bị này: chỉ bản băm được gửi lên máy chủ khi kích hoạt. */
  key: string;
  token?: string;
  email?: string;
  revoked?: boolean;
  lastCheck?: number;
}

export interface LicenseStatus {
  admin?: boolean;
  /** Bản này có đòi kích hoạt không (đã điền cấu hình máy chủ). */
  required: boolean;
  activated: boolean;
  email?: string;
  max: number;
  revoked?: boolean;
  /** Có thể gửi phản hồi được (có máy chủ). */
  feedback: boolean;
}

export interface LicenseDeps {
  fetch?: typeof fetch;
  config?: () => LicenseConfig;
  device?: () => string;
  now?: () => number;
}

export type FeedbackKind = "loi" | "y-kien" | "khen";
const KINDS: FeedbackKind[] = ["loi", "y-kien", "khen"];

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const normEmail = (s: string) => s.trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export class LicenseStore {
  private file: string;
  private st: LicenseFile;

  constructor(
    home: string,
    private deps: LicenseDeps = {},
  ) {
    this.file = path.join(home, "license.json");
    let st: LicenseFile | undefined;
    try {
      const j = JSON.parse(fs.readFileSync(this.file, "utf8")) as LicenseFile;
      if (j?.version === 1 && typeof j.key === "string") st = j;
    } catch {
      /* chưa có */
    }
    this.st = st ?? { version: 1, key: crypto.randomBytes(24).toString("hex") };
  }

  private cfg(): LicenseConfig {
    return this.deps.config?.() ?? LICENSE_CONFIG;
  }
  private device(): string {
    return this.deps.device?.() ?? machineId();
  }
  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.st), { mode: 0o600 });
  }

  required(): boolean {
    const c = this.cfg();
    return !!c.endpoint && !!c.publicKeyPem;
  }

  /** Giấy phép hợp lệ nếu: không đòi kích hoạt, hoặc có token ký đúng, đúng máy này, chưa bị thu hồi. */
  activated(): boolean {
    if (!this.required()) return true;
    if (!this.st.token || this.st.revoked) return false;
    const p = verifyToken(this.st.token, this.cfg().publicKeyPem);
    return !!p && p.device === this.device() && (!this.st.email || p.email === this.st.email);
  }

  isAdmin(): boolean {
    if(!this.st.token||this.st.revoked)return false;
    const p=verifyToken(this.st.token,this.cfg().publicKeyPem);
    return !!p&&p.role==='admin'&&p.device===this.device()&&p.email===this.st.email;
  }

  status(): LicenseStatus {
    const c = this.cfg();
    return { admin:this.isAdmin(), required: this.required(), activated: this.activated(), email: this.st.email, max: c.maxDevices, revoked: this.st.revoked || undefined, feedback: !!c.endpoint };
  }

  private async call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const c = this.cfg();
    if (!c.endpoint) throw new LicenseFailure("mang");
    const f = this.deps.fetch ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);
    try {
      const res = await f(c.endpoint, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: ac.signal, redirect: "follow" });
      if (!res.ok) throw new LicenseFailure("mang");
      const j = (await res.json()) as Record<string, unknown>;
      if (!j || typeof j !== "object") throw new LicenseFailure("khong-hop-le");
      return j;
    } catch (e) {
      if (e instanceof LicenseFailure) throw e;
      throw new LicenseFailure(e instanceof SyntaxError ? "khong-hop-le" : "mang");
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(j: Record<string, unknown>): never {
    const code = String(j.error ?? "");
    throw new LicenseFailure((Object.keys(LICENSE_MESSAGES) as LicenseError[]).includes(code as LicenseError) ? (code as LicenseError) : "khong-hop-le");
  }

  /** Nhập email + mã chủ phần mềm đã cấp. Mã chỉ đi qua HTTPS tới máy chủ của chủ, không lưu trên máy. */
  async activate(emailRaw: string, code: string): Promise<LicenseStatus> {
    const email = normEmail(emailRaw);
    if (!EMAIL_RE.test(email)) throw new Error("Email chưa đúng định dạng.");
    const c = code.trim();
    if (c.length < 6 || c.length > 64) throw new LicenseFailure("sai-ma");
    const device = this.device();
    const j = await this.call({ action: "activate", email, code: c, device, keyHash: sha256(this.st.key), name: os.hostname().slice(0, 40), platform: os.platform() });
    if (j.ok !== true) this.fail(j);
    const token = String(j.token ?? "");
    const p = verifyToken(token, this.cfg().publicKeyPem);
    if (!p || p.device !== device || p.email !== email) throw new LicenseFailure("khong-hop-le");
    this.st = { ...this.st, token, email, revoked: false, lastCheck: this.deps.now?.() ?? Date.now() };
    this.save();
    return this.status();
  }

  /** Gỡ máy này khỏi email để nhường chỗ cho máy khác. Xóa giấy phép cục bộ dù máy chủ không trả lời. */
  async deactivate(): Promise<LicenseStatus> {
    const email = this.st.email;
    if (email && this.required()) {
      try {
        await this.call({ action: "deactivate", email, device: this.device(), key: this.st.key });
      } catch {
        /* chủ phần mềm có thể gỡ hộ trong bảng */
      }
    }
    this.st = { version: 1, key: this.st.key };
    this.save();
    return this.status();
  }

  /**
   * Hỏi máy chủ xem giấy phép còn hiệu lực không (tối đa mỗi 24 giờ). Mất mạng hay lỗi gì cũng bỏ qua;
   * chỉ khi máy chủ nói rõ «đã thu hồi» mới khóa.
   */
  async refresh(force = false): Promise<LicenseStatus> {
    const now = this.deps.now?.() ?? Date.now();
    if (!this.required() || !this.st.token || !this.st.email) return this.status();
    if (!force && this.st.lastCheck && now - this.st.lastCheck < 24 * 3600_000) return this.status();
    try {
      const j = await this.call({ action: "check", email: this.st.email, device: this.device(), key: this.st.key });
      this.st.lastCheck = now;
      if (j.ok === true) this.st.revoked = false;
      else if (j.error === "da-thu-hoi" || j.error === "khong-co-email") this.st.revoked = true;
      this.save();
    } catch {
      /* im lặng */
    }
    return this.status();
  }

  /** Che thông tin cá nhân trước khi người dùng xem lại và bấm gửi. */
  previewFeedback(text: string): string {
    return maskPersonal(text).replace(/\r\n/g, "\n").trim().slice(0, 2000);
  }

  /** Gửi phản hồi về thư mục Drive của chủ phần mềm. Chỉ gửi nội dung đã xem trước, không kèm hội thoại hay tệp. */
  async sendFeedback(o: { kind: FeedbackKind; text: string; version: string; expected: string }): Promise<void> {
    if (!this.cfg().endpoint) throw new Error("Chưa cấu hình máy chủ phản hồi.");
    if (!this.st.email || !this.st.token) throw new Error("Cần kích hoạt trước khi gửi phản hồi.");
    if (!KINDS.includes(o.kind)) throw new Error("Loại phản hồi không hợp lệ.");
    const text = this.previewFeedback(o.text);
    if (text.length < 5) throw new Error("Phản hồi quá ngắn.");
    if (text !== o.expected) throw new Error("Hãy xem lại nội dung đã che thông tin cá nhân trước khi gửi.");
    const j = await this.call({ action: "feedback", email: this.st.email, device: this.device(), key: this.st.key, kind: o.kind, text, version: o.version.slice(0, 20), platform: os.platform() });
    if (j.ok !== true) this.fail(j);
  }
}
