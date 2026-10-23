import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyUpdate, compareVersions, detectApp, parseLatest } from "../src/updater.js";

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

function appDir(version: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-upd-test-"));
  const dir = path.join(root, "app");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "VERSION"), version);
  fs.writeFileSync(path.join(dir, "pvta-bridge.mjs"), "old");
  return { root, dir };
}

const fakeExtract = (version: string, withIndex = true) => async (_t: string, into: string) => {
  fs.writeFileSync(path.join(into, "pvta-bridge.mjs"), "new");
  fs.writeFileSync(path.join(into, "VERSION"), version);
  if (withIndex) {
    fs.mkdirSync(path.join(into, "web"));
    fs.writeFileSync(path.join(into, "web", "index.html"), "<html>");
  }
};

describe("compareVersions / parseLatest", () => {
  it("so sánh x.y.z theo số, không theo chữ", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
  });
  it("chỉ nhận latest.json hợp lệ", () => {
    const ok = { version: "1.1.0", sha256: "a".repeat(64), notes: "n" };
    expect(parseLatest(JSON.stringify(ok))).toEqual(ok);
    expect(parseLatest(JSON.stringify({ ...ok, version: "1.1" }))).toBeNull();
    expect(parseLatest(JSON.stringify({ ...ok, sha256: "xyz" }))).toBeNull();
    expect(parseLatest("không phải json")).toBeNull();
  });
});

describe("detectApp", () => {
  it("dùng PVTA_APP_DIR khi có VERSION hợp lệ, không thì undefined", () => {
    const { dir } = appDir("1.0.0");
    expect(detectApp({ PVTA_APP_DIR: dir })?.version).toBe("1.0.0");
    fs.writeFileSync(path.join(dir, "VERSION"), "abc123");
    expect(detectApp({ PVTA_APP_DIR: dir })).toBeUndefined();
    expect(detectApp({}, "file:///x/src/server.ts")).toBeUndefined();
  });
});

describe("applyUpdate", () => {
  const body = Buffer.alloc(2000, 7);
  const okFetch = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

  it("thay app bằng bản mới và giữ bản cũ ở .old", async () => {
    const { dir } = appDir("1.0.0");
    await applyUpdate({ app: { appDir: dir, version: "1.0.0" }, latest: { version: "1.1.0", sha256: sha(body), notes: "" }, fetchFn: okFetch, extractFn: fakeExtract("1.1.0") });
    expect(fs.readFileSync(path.join(dir, "VERSION"), "utf8")).toBe("1.1.0");
    expect(fs.readFileSync(path.join(`${dir}.old`, "VERSION"), "utf8")).toBe("1.0.0");
  });

  it("sai sha256: giữ nguyên bản cũ", async () => {
    const { dir } = appDir("1.0.0");
    await expect(
      applyUpdate({ app: { appDir: dir, version: "1.0.0" }, latest: { version: "1.1.0", sha256: "0".repeat(64), notes: "" }, fetchFn: okFetch, extractFn: fakeExtract("1.1.0") }),
    ).rejects.toThrow(/mã kiểm tra/);
    expect(fs.readFileSync(path.join(dir, "VERSION"), "utf8")).toBe("1.0.0");
  });

  it("bản thiếu tệp hoặc sai phiên bản: không đổi", async () => {
    const a = appDir("1.0.0");
    const latest = { version: "1.1.0", sha256: sha(body), notes: "" };
    await expect(applyUpdate({ app: { appDir: a.dir, version: "1.0.0" }, latest, fetchFn: okFetch, extractFn: fakeExtract("1.1.0", false) })).rejects.toThrow(/thiếu/);
    await expect(applyUpdate({ app: { appDir: a.dir, version: "1.0.0" }, latest, fetchFn: okFetch, extractFn: fakeExtract("9.9.9") })).rejects.toThrow(/không phải/);
    expect(fs.readFileSync(path.join(a.dir, "VERSION"), "utf8")).toBe("1.0.0");
    expect(fs.existsSync(`${a.dir}.new`)).toBe(false);
  });

  it("lỗi mạng: báo bằng tiếng Việt", async () => {
    const { dir } = appDir("1.0.0");
    const bad = (async () => { throw new Error("x"); }) as unknown as typeof fetch;
    await expect(applyUpdate({ app: { appDir: dir, version: "1.0.0" }, latest: { version: "1.1.0", sha256: sha(body), notes: "" }, fetchFn: bad })).rejects.toThrow(/Không tải được/);
  });
});
