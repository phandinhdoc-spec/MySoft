import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LicenseFailure, LicenseStore, signToken, verifyToken, type LicensePayload } from "../src/license/index.js";

let home: string;
beforeEach(() => (home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-lic-"))));
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUB = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIV = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Máy chủ giả có cùng quy tắc với apps-script/license-server/Code.gs. */
function fakeServer(users: Record<string, string>) {
  const rows = new Map<string, { codeHash: string; fails: number; locked: boolean; revoked: boolean; devices: Record<string, string> }>();
  for (const [e, code] of Object.entries(users)) rows.set(e, { codeHash: sha(e + "|" + code), fails: 0, locked: false, revoked: false, devices: {} });
  const feedback: unknown[] = [];
  const fetcher = (async (_url: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    const r = rows.get(String(b.email));
    const out = (o: object) => new Response(JSON.stringify(o));
    if (!r) return out({ ok: false, error: "khong-co-email" });
    if (r.revoked) return out({ ok: false, error: "da-thu-hoi" });
    if (b.action === "activate") {
      if (r.locked) return out({ ok: false, error: "bi-khoa" });
      if (sha(b.email + "|" + b.code) !== r.codeHash) {
        if (++r.fails >= 5) r.locked = true;
        return out({ ok: false, error: "sai-ma" });
      }
      if (!r.devices[b.device] && Object.keys(r.devices).length >= 3) return out({ ok: false, error: "het-thiet-bi" });
      r.fails = 0;
      r.devices[b.device] = b.keyHash;
      return out({ ok: true, token: signToken({ v: 1, email: b.email, device: b.device, iat: 1, max: 3 }, PRIV) });
    }
    if (r.devices[b.device] !== sha(String(b.key))) return out({ ok: false, error: "khong-hop-le" });
    if (b.action === "deactivate") {
      delete r.devices[b.device];
      return out({ ok: true });
    }
    if (b.action === "feedback") {
      feedback.push(b);
      return out({ ok: true });
    }
    return out({ ok: true });
  }) as unknown as typeof fetch;
  return { rows, fetcher, feedback };
}

const store = (dev: string, srv: ReturnType<typeof fakeServer>, h = home) =>
  new LicenseStore(h, { fetch: srv.fetcher, device: () => dev, config: () => ({ endpoint: "https://script.example/exec", publicKeyPem: PUB, maxDevices: 3 }) });

describe("chữ ký giấy phép", () => {
  const p: LicensePayload = { v: 1, email: "a@b.vn", device: "d1", iat: 1, max: 3 };
  it("ký bằng khóa riêng, kiểm bằng khóa công khai; sửa một chữ là hỏng", () => {
    const t = signToken(p, PRIV);
    expect(verifyToken(t, PUB)).toEqual(p);
    const [h, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...p, email: "x@y.vn" })).toString("base64url") + "." + s;
    expect(verifyToken(forged, PUB)).toBeUndefined();
    expect(verifyToken(h + ".AAAA", PUB)).toBeUndefined();
    expect(verifyToken("rac", PUB)).toBeUndefined();
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyToken(t, other)).toBeUndefined();
  });
});

describe("kích hoạt theo email", () => {
  it("chưa cấu hình máy chủ: không đòi kích hoạt", () => {
    const s = new LicenseStore(home, { config: () => ({ endpoint: "", publicKeyPem: "", maxDevices: 3 }) });
    expect(s.status()).toMatchObject({ required: false, activated: true });
  });
  it("đúng email + mã: dùng được, lưu lại, mở lại vẫn còn; không lưu mã", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const s = store("m1", srv);
    expect(s.status()).toMatchObject({ required: true, activated: false });
    expect(await s.activate("  Co@Gmail.com ", "ABCD-2345")).toMatchObject({ activated: true, email: "co@gmail.com" });
    expect(store("m1", srv).status().activated).toBe(true);
    expect(fs.readFileSync(path.join(home, "license.json"), "utf8")).not.toContain("ABCD-2345");
  });
  it("sai mã, email lạ, định dạng sai", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const s = store("m1", srv);
    await expect(s.activate("co@gmail.com", "SAI-MA-XX")).rejects.toMatchObject({ code: "sai-ma" });
    await expect(s.activate("la@gmail.com", "ABCD-2345")).rejects.toMatchObject({ code: "khong-co-email" });
    await expect(s.activate("khong-phai-email", "ABCD-2345")).rejects.toThrow("định dạng");
    expect(s.status().activated).toBe(false);
  });
  it("nhập sai 5 lần thì khóa email, kể cả khi sau đó nhập đúng", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const s = store("m1", srv);
    for (let i = 0; i < 5; i++) await expect(s.activate("co@gmail.com", "SAI-MA-XX")).rejects.toBeInstanceOf(LicenseFailure);
    await expect(s.activate("co@gmail.com", "ABCD-2345")).rejects.toMatchObject({ code: "bi-khoa" });
  });
  it("tối đa 3 thiết bị; máy thứ 4 bị từ chối; gỡ một máy thì có chỗ; kích hoạt lại cùng máy không tốn chỗ", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const dirs = [1, 2, 3, 4].map(() => fs.mkdtempSync(path.join(os.tmpdir(), "pvta-lic-d-")));
    try {
      const m = ["m1", "m2", "m3", "m4"].map((d, i) => store(d, srv, dirs[i]));
      for (const x of m.slice(0, 3)) await x.activate("co@gmail.com", "ABCD-2345");
      await expect(m[3]!.activate("co@gmail.com", "ABCD-2345")).rejects.toMatchObject({ code: "het-thiet-bi" });
      await m[0]!.activate("co@gmail.com", "ABCD-2345"); // cùng máy: không tốn thêm chỗ
      await m[1]!.deactivate();
      expect(m[1]!.status().activated).toBe(false);
      await expect(m[3]!.activate("co@gmail.com", "ABCD-2345")).resolves.toMatchObject({ activated: true });
    } finally {
      for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
    }
  });
  it("sao chép tệp giấy phép sang máy khác thì không dùng được (khóa theo thiết bị)", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    await store("m1", srv).activate("co@gmail.com", "ABCD-2345");
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-lic-copy-"));
    try {
      fs.copyFileSync(path.join(home, "license.json"), path.join(copy, "license.json"));
      expect(store("m2", srv, copy).status().activated).toBe(false);
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe("dùng offline và thu hồi", () => {
  it("mất mạng khi kiểm tra: vẫn dùng bình thường, không bao giờ hết hạn", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const s = store("m1", srv);
    await s.activate("co@gmail.com", "ABCD-2345");
    const off = new LicenseStore(home, { fetch: (async () => { throw new TypeError("fetch failed"); }) as never, device: () => "m1", now: () => Date.now() + 400 * 86400_000, config: () => ({ endpoint: "https://script.example/exec", publicKeyPem: PUB, maxDevices: 3 }) });
    expect((await off.refresh(true)).activated).toBe(true);
  });
  it("máy chủ báo đã thu hồi thì khóa; cấp lại bằng cách kích hoạt mới", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const s = store("m1", srv);
    await s.activate("co@gmail.com", "ABCD-2345");
    srv.rows.get("co@gmail.com")!.revoked = true;
    expect(await s.refresh(true)).toMatchObject({ activated: false, revoked: true });
    srv.rows.get("co@gmail.com")!.revoked = false;
    expect((await s.activate("co@gmail.com", "ABCD-2345")).activated).toBe(true);
  });
  it("chỉ hỏi máy chủ tối đa một lần mỗi 24 giờ", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    let calls = 0;
    const counting = (async (u: string, i: never) => (calls++, srv.fetcher(u, i))) as never;
    const s = new LicenseStore(home, { fetch: counting, device: () => "m1", config: () => ({ endpoint: "https://x/exec", publicKeyPem: PUB, maxDevices: 3 }) });
    await s.activate("co@gmail.com", "ABCD-2345");
    const n = calls;
    await s.refresh();
    expect(calls).toBe(n);
  });
});

describe("phản hồi người dùng", () => {
  it("che thông tin cá nhân, phải xem trước đúng nội dung mới gửi được", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    const s = store("m1", srv);
    await s.activate("co@gmail.com", "ABCD-2345");
    const raw = "Nút tóm tắt chậm. Liên hệ 0903123456 hoặc hs@truong.vn nhé";
    const shown = s.previewFeedback(raw);
    expect(shown).not.toMatch(/0903123456|hs@truong\.vn/);
    await expect(s.sendFeedback({ kind: "loi", text: raw, version: "1.2.0", expected: "nội dung khác" })).rejects.toThrow("xem lại");
    await s.sendFeedback({ kind: "loi", text: raw, version: "1.2.0", expected: shown });
    expect(srv.feedback).toHaveLength(1);
    expect(JSON.stringify(srv.feedback[0])).not.toContain("0903123456");
    await expect(s.sendFeedback({ kind: "xau" as never, text: raw, version: "1", expected: shown })).rejects.toThrow("không hợp lệ");
  });
  it("chưa kích hoạt thì không gửi được", async () => {
    const srv = fakeServer({ "co@gmail.com": "ABCD-2345" });
    await expect(store("m1", srv).sendFeedback({ kind: "y-kien", text: "Rất tốt nhé thầy", version: "1", expected: "Rất tốt nhé thầy" })).rejects.toThrow("kích hoạt");
  });
});


it("admin access requires a signed admin role bound to this device", () => {
 const config=()=>({endpoint:"https://script.example/exec",publicKeyPem:PUB,maxDevices:3});
 const payload:LicensePayload={v:1,email:"admin@example.com",device:"device-a",iat:1,max:3,role:"admin"};
 const write=(token:string,revoked=false)=>fs.writeFileSync(path.join(home,"license.json"),JSON.stringify({version:1,key:"key",email:payload.email,token,revoked}));
 const read=(device="device-a")=>new LicenseStore(home,{config,device:()=>device});
 write(signToken(payload,PRIV));expect(read().isAdmin()).toBe(true);expect(read("device-b").isAdmin()).toBe(false);
 write(signToken({...payload,role:"user"},PRIV));expect(read().isAdmin()).toBe(false);
 const signed=signToken({...payload,role:"user"},PRIV).split(".");write(Buffer.from(JSON.stringify(payload)).toString("base64url")+"."+signed[1]);expect(read().isAdmin()).toBe(false);
 write(signToken(payload,PRIV),true);expect(read().isAdmin()).toBe(false);
 expect(new LicenseStore(home,{config:()=>({endpoint:"",publicKeyPem:"",maxDevices:3})}).isAdmin()).toBe(false);
});
