import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LicenseStore } from "../src/license/index.js";

/**
 * Chạy NGUYÊN tệp apps-script/license-server/Code.gs trong một môi trường Apps Script giả,
 * rồi cho LicenseStore thật nói chuyện với nó: bảo đảm máy chủ và ứng dụng khớp giao thức.
 */
const CODE = fs.readFileSync(path.join(__dirname, "../../apps-script/license-server/Code.gs"), "utf8");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUB = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIV = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const signed = (b: Buffer) => Array.from(b, (x) => (x > 127 ? x - 256 : x));
const buf = (a: number[]) => Buffer.from(a.map((x) => x & 0xff));

function makeEnv() {
  const sheets = new Map<string, unknown[][]>();
  const props: Record<string, string> = { PRIVATE_KEY: PRIV };
  const files: Array<{ name: string; body: string }> = [];
  const alerts: string[] = [];
  let promptAnswer = "";
  let active = "Giấy phép";
  let selectedRow = 2;
  const mkSheet = (name: string) => ({
    appendRow: (r: unknown[]) => void sheets.get(name)!.push(r),
    setFrozenRows: () => undefined,
    getName: () => name,
    getDataRange: () => ({ getValues: () => sheets.get(name)!.map((r) => [...r]) }),
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({
      setValue: (v: unknown) => {
        const row = sheets.get(name)![r - 1]!;
        row[c - 1] = v;
      },
      setValues: (vs: unknown[][]) => {
        const row = sheets.get(name)![r - 1]!;
        for (let j = 0; j < nc; j++) row[c - 1 + j] = vs[0]![j];
        void nr;
      },
      getRow: () => r,
    }),
  });
  const ss = {
    getSheetByName: (n: string) => (sheets.has(n) ? mkSheet(n) : null),
    insertSheet: (n: string) => (sheets.set(n, []), mkSheet(n)),
  };
  const ui = {
    ButtonSet: { OK_CANCEL: 1 },
    Button: { OK: "OK" },
    prompt: () => ({ getSelectedButton: () => "OK", getResponseText: () => promptAnswer }),
    alert: (m: string) => void alerts.push(m),
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
  };
  const ctx: Record<string, unknown> = {
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_a: string, s: string) => signed(crypto.createHash("sha256").update(s, "utf8").digest()),
      newBlob: (s: string) => ({ getBytes: () => signed(Buffer.from(s, "utf8")) }),
      base64EncodeWebSafe: (b: number[]) => buf(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      base64Encode: (b: number[]) => buf(b).toString("base64"),
      computeRsaSha256Signature: (v: string, k: string) => signed(crypto.sign("sha256", Buffer.from(v), crypto.createPrivateKey(k))),
      getUuid: () => crypto.randomUUID(),
      formatDate: () => "2026-10-18_180000",
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui, getActiveSheet: () => mkSheet(active), getActiveRange: () => ({ getRow: () => selectedRow }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (s: string) => ({ content: s, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => void (props[k] = v) }) },
    DriveApp: { getFolderById: () => ({ getName: () => "PVTA-phanhoi", createFile: (name: string, body: string) => void files.push({ name, body }) }) },
    MimeType: { PLAIN_TEXT: "text/plain" },
    JSON, Math, Date, Object, String, Number, Error, parseInt, RegExp,
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const call = (fn: string) => (vm.runInContext(fn, ctx) as unknown);
  return {
    sheets, props, files, alerts,
    issue(email: string): string {
      promptAnswer = email;
      call("issueCode()");
      const m = /\n\n([A-Z0-9]{5}-[A-Z0-9]{5})\n\n/.exec(alerts.at(-1) ?? "");
      if (!m) throw new Error("không thấy mã: " + alerts.at(-1));
      return m[1]!;
    },
    menu(fn: string, row = 2) { active = "Giấy phép"; selectedRow = row; call(`${fn}()`); },
    folder(id: string) { promptAnswer = id; call("setFeedbackFolder()"); },
    fetcher: (async (_u: string, init: { body: string }) => {
      const out = vm.runInContext("doPost", ctx) as (e: unknown) => { content: string };
      return new Response(out({ postData: { contents: init.body } }).content);
    }) as unknown as typeof fetch,
  };
}

let dirs: string[] = [];
beforeEach(() => (dirs = []));
afterEach(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const client = (env: ReturnType<typeof makeEnv>, device: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-gas-"));
  dirs.push(d);
  return new LicenseStore(d, { fetch: env.fetcher, device: () => device, config: () => ({ endpoint: "https://script.google.com/x/exec", publicKeyPem: PUB, maxDevices: 3 }) });
};

describe("Code.gs ↔ ứng dụng", () => {
  it("cấp mã bằng menu rồi kích hoạt; sheet chỉ giữ bản băm, không giữ mã", async () => {
    const env = makeEnv();
    const code = env.issue("Co@Gmail.com");
    expect(JSON.stringify([...env.sheets.values()])).not.toContain(code);
    const c = client(env, "m1");
    expect(await c.activate("co@gmail.com", code.toLowerCase())).toMatchObject({ activated: true, email: "co@gmail.com" });
    await expect(client(env, "x").activate("la@gmail.com", code)).rejects.toMatchObject({ code: "khong-co-email" });
  });
  it("3 thiết bị, đặt lại thiết bị, sai 5 lần khóa, mở khóa, thu hồi", async () => {
    const env = makeEnv();
    const code = env.issue("co@gmail.com");
    for (const d of ["m1", "m2", "m3"]) await client(env, d).activate("co@gmail.com", code);
    await expect(client(env, "m4").activate("co@gmail.com", code)).rejects.toMatchObject({ code: "het-thiet-bi" });
    env.menu("resetDevices");
    await expect(client(env, "m4").activate("co@gmail.com", code)).resolves.toMatchObject({ activated: true });
    for (let i = 0; i < 5; i++) await expect(client(env, "m5").activate("co@gmail.com", "SAISA-SAISA")).rejects.toMatchObject({ code: "sai-ma" });
    await expect(client(env, "m5").activate("co@gmail.com", code)).rejects.toMatchObject({ code: "bi-khoa" });
    env.menu("unlockRow");
    await expect(client(env, "m5").activate("co@gmail.com", code)).resolves.toMatchObject({ activated: true });
    env.menu("revokeRow");
    const c = client(env, "m6");
    await expect(c.activate("co@gmail.com", code)).rejects.toMatchObject({ code: "da-thu-hoi" });
  });
  it("gỡ thiết bị trả chỗ; kiểm tra định kỳ thấy thu hồi thì khóa", async () => {
    const env = makeEnv();
    const code = env.issue("co@gmail.com");
    const a = client(env, "m1");
    await a.activate("co@gmail.com", code);
    await a.deactivate();
    expect(a.status().activated).toBe(false);
    const b = client(env, "m2");
    await b.activate("co@gmail.com", code);
    env.menu("revokeRow");
    expect(await b.refresh(true)).toMatchObject({ activated: false, revoked: true });
  });
  it("phản hồi: lưu tệp .md vào thư mục Drive và một dòng trong sheet; công thức bị vô hiệu", async () => {
    const env = makeEnv();
    env.folder("FOLDER123");
    expect(env.props.FEEDBACK_FOLDER_ID).toBe("FOLDER123");
    const code = env.issue("co@gmail.com");
    const c = client(env, "m1");
    await c.activate("co@gmail.com", code);
    const text = "=HYPERLINK(\"http://x\") nút tóm tắt hơi chậm, liên hệ 0903123456";
    const shown = c.previewFeedback(text);
    await c.sendFeedback({ kind: "loi", text, version: "1.3.0", expected: shown });
    expect(env.files).toHaveLength(1);
    expect(env.files[0]!.name).toMatch(/\.md$/);
    expect(env.files[0]!.body).toContain("co@gmail.com");
    expect(env.files[0]!.body).not.toContain("0903123456");
    const row = env.sheets.get("Phản hồi")![1]!;
    expect(String(row[5]).startsWith("'=")).toBe(true);
  });
  it("khóa riêng của thiết bị sai thì không gửi được phản hồi hay gỡ hộ máy khác", async () => {
    const env = makeEnv();
    const code = env.issue("co@gmail.com");
    const a = client(env, "m1");
    await a.activate("co@gmail.com", code);
    const res = (await env.fetcher("x", { method: "POST", body: JSON.stringify({ action: "feedback", email: "co@gmail.com", device: "m1", key: "doan", kind: "loi", text: "xin chao ban", version: "1" }) } as never).then((r) => r.json())) as { ok: boolean };
    expect(res.ok).toBe(false);
  });
});
