import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopRuntime } from "../src/desktop/runtime";
import { LICENSE_CONFIG } from "../src/license/config";
import { signToken } from "../src/license/index";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIV = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const saved = { ...LICENSE_CONFIG };
const runtimes: DesktopRuntime[] = [];
const roots: string[] = [];
beforeEach(() => Object.assign(LICENSE_CONFIG, { endpoint: "https://script.google.com/macros/s/x/exec", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString() }));
afterEach(() => {
  Object.assign(LICENSE_CONFIG, saved);
  vi.unstubAllGlobals();
  runtimes.splice(0).forEach((r) => r.dispose());
  roots.splice(0).forEach((p) => fs.rmSync(p, { recursive: true, force: true }));
});
const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-dl-"));
  roots.push(dir);
  const r = new DesktopRuntime(() => {}, dir);
  runtimes.push(r);
  return r;
};
const req = (r: DesktopRuntime, method: string, params: Record<string, unknown> = {}) => r.dispatch({ id: crypto.randomUUID(), method, params });

describe("desktop: giấy phép", () => {
  it("chưa kích hoạt: chỉ init và license.* chạy; view báo cần kích hoạt", async () => {
    const r = setup();
    expect(r.view().license).toMatchObject({ required: true, activated: false });
    await expect(req(r, "newChat")).rejects.toThrow("chưa được kích hoạt");
    await expect(req(r, "groups.view")).rejects.toThrow("chưa được kích hoạt");
    expect(await req(r, "init")).toBeTruthy();
  });
  it("kích hoạt đúng thì mọi thao tác mở ra; mã sai thì báo lỗi dễ hiểu", async () => {
    const r = setup();
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.code !== "ABCDE-FGHJK") return new Response(JSON.stringify({ ok: false, error: "sai-ma" }));
      return new Response(JSON.stringify({ ok: true, token: signToken({ v: 1, email: b.email, device: b.device, iat: 1, max: 3 }, PRIV) }));
    });
    await expect(req(r, "license.activate", { email: "co@gmail.com", code: "SAISAI-SAI" })).rejects.toThrow("Mã kích hoạt chưa đúng");
    const view: any = await req(r, "license.activate", { email: "co@gmail.com", code: "ABCDE-FGHJK" });
    expect(view.license).toMatchObject({ activated: true, email: "co@gmail.com" });
    await expect(req(r, "newChat")).resolves.toBeTruthy();
    const second = setup(); // máy khác (thư mục khác nhưng cùng thiết bị vật lý): vẫn phải kích hoạt riêng
    expect(second.view().license?.activated).toBe(false);
  });
  it("phản hồi: xem trước đã che thông tin cá nhân", async () => {
    const r = setup();
    const out: any = await req(r, "license.feedbackPreview", { text: "Gọi 0903123456 giúp" });
    expect(out.text).not.toContain("0903123456");
  });
});
