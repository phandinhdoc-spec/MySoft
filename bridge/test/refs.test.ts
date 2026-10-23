import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ClientMessage, ServerMessage } from "@pvta/shared";
import { extractContext, PROVINCES, provinceByVotes, sameArea } from "../src/place.js";
import { findRefs, PlaceCache, cleanName, fetchRefText, htmlToText, isPrivateIp, parseSearchHtml, rankResults, refQueries, RefGate, RefStore, REFS, type Fetcher } from "../src/refs.js";
import { startServer, type RunningServer } from "../src/server.js";

const DDG = `
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fthuvienphapluat.vn%2Fcong-van-123&amp;rut=x">Công văn 123 hướng dẫn <b>kế hoạch</b> giáo dục</a>
<a class="result__a" href="https://www.facebook.com/abc">Công văn kế hoạch giáo dục trên facebook</a>
<a class="result__a" href="http://example.com/x">Công văn kế hoạch giáo dục (http)</a>
<a class="result__a" href="https://blog.example.com/ke-hoach-giao-duc">Kế hoạch giáo dục mẫu của trường</a>
<a class="result__a" href="https://example.org/khong-lien-quan">Công thức nấu phở</a>`;

const html = (body: string, type = "text/html; charset=utf-8", status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });

describe("văn bản liên quan: logic thuần", () => {
  it("tên tệp -> câu tìm kiếm", () => {
    expect(cleanName("Cong_van-123 (2).docx")).toBe("Cong van 123");
    expect(refQueries("ab.docx", "", undefined)).toEqual([]);
    const q = refQueries("Ke hoach giao duc 2026.docx", "", "admin");
    expect(q.length).toBeGreaterThanOrEqual(1);
    expect(q.length).toBeLessThanOrEqual(2);
  });

  it("bóc kết quả: giải mã link chuyển hướng, bỏ http", () => {
    const r = parseSearchHtml(DDG);
    expect(r[0]).toMatchObject({ title: "Công văn 123 hướng dẫn kế hoạch giáo dục", url: "https://thuvienphapluat.vn/cong-van-123" });
    expect(r.some((x) => x.url.startsWith("http://"))).toBe(false);
  });

  it("xếp hạng: loại mạng xã hội và trang lạc đề, ưu tiên nguồn nhà nước", () => {
    const items = rankResults(parseSearchHtml(DDG), "Ke hoach giao duc", "a.docx");
    const hosts = items.map((i) => i.host);
    expect(hosts[0]).toBe("thuvienphapluat.vn");
    expect(hosts).not.toContain("facebook.com");
    expect(hosts).not.toContain("example.org");
    expect(items.every((i) => i.url.startsWith("https://"))).toBe(true);
  });

  it("địa chỉ nội bộ bị chặn", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("html -> chữ", () => {
    expect(htmlToText("<style>x{}</style><p>Xin&nbsp;chào</p><script>a()</script><p>Thầy &amp; trò</p>")).toBe("Xin chào\nThầy & trò");
  });

  it("RefStore lưu refs.json và refs.md, không trùng link, nạp lại được", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-refs-"));
    const it1 = { id: "r1", title: "A", url: "https://a.vn/x", host: "a.vn", why: "w", forFile: "f.docx", foundAt: 1 };
    const s = new RefStore(dir);
    s.add([it1]);
    s.add([{ ...it1, id: "r2" }]);
    expect(s.list()).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, "refs.md"), "utf8")).toContain("[A](https://a.vn/x)");
    expect(new RefStore(dir).get("r2")?.title).toBe("A");
  });

  it("RefGate: nhớ 6 giờ, một lượt một lúc, tối đa theo giờ", () => {
    const g = new RefGate();
    expect(g.decide("k", 0)).toBe("run");
    expect(g.decide("k2", 1)).toBe("skip"); // đang chạy
    g.finish("k", true, 2);
    expect(g.decide("k", 3)).toBe("cached");
    let n = 0;
    for (let i = 0; i < 10; i++) {
      if (g.decide("x" + i, 10 + i) === "run") {
        n++;
        g.finish("x" + i, false, 10 + i);
      }
    }
    expect(n).toBeLessThan(REFS.maxPerHour);
  });
});

describe("tải nội dung khi người dùng bấm", () => {
  const pub = async () => ["93.184.216.34"];
  it("tải trang html thành chữ", async () => {
    const f: Fetcher = async () => html("<p>Nội dung công văn</p>");
    const r = await fetchRefText("https://a.vn/x", f, pub);
    expect(r).toMatchObject({ ok: true, text: "Nội dung công văn" });
  });
  it("từ chối http, mạng nội bộ, và chuyển hướng vào mạng nội bộ", async () => {
    const f: Fetcher = async () => html("x");
    expect((await fetchRefText("http://a.vn", f, pub)).ok).toBe(false);
    expect((await fetchRefText("https://intranet.vn", f, async () => ["10.0.0.1"])).ok).toBe(false);
    expect((await fetchRefText("https://127.0.0.1/", f, pub)).ok).toBe(false);
    let calls = 0;
    const redir: Fetcher = async () => (calls++, html("", "text/html", 302, { location: "https://evil.vn/" }));
    const res = await fetchRefText("https://a.vn", redir, async (h) => (h === "evil.vn" ? ["192.168.0.9"] : ["93.184.216.34"]));
    expect(res.ok).toBe(false);
    expect(calls).toBe(1);
  });
  it("PDF/Word: báo mở bằng trình duyệt; lỗi mạng: báo gọn", async () => {
    expect((await fetchRefText("https://a.vn/a.pdf", async () => html("%PDF", "application/pdf"), pub)).ok).toBe(false);
    const r = await fetchRefText("https://a.vn", async () => { throw new Error("boom"); }, pub);
    expect(r).toMatchObject({ ok: false });
  });
  it("giới hạn chữ trả về", async () => {
    const r = await fetchRefText("https://a.vn", async () => html("a".repeat(REFS.maxText + 500), "text/plain"), pub);
    expect(r.ok && r.text.length === REFS.maxText && r.truncated).toBe(true);
  });
});

let server: RunningServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function open(webFetch: Fetcher) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-refsrv-"));
  server = await startServer({ home, port: 0, allowNoOrigin: true, idleCheckMs: 3_600_000, webFetch, webResolve: async () => ["93.184.216.34"] });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  const msgs: ServerMessage[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(String(d)) as ServerMessage));
  await new Promise<void>((res, rej) => (ws.once("open", () => res()), ws.once("error", rej)));
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));
  const until = async <T extends ServerMessage["type"]>(type: T, timeout = 5000) => {
    const t0 = Date.now();
    for (;;) {
      const i = msgs.findIndex((m) => m.type === type);
      if (i >= 0) return msgs.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      if (Date.now() - t0 > timeout) throw new Error(`hết giờ chờ '${type}'`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  send({ type: "hello", host: "word", sessionId: "r1", lang: "vi", doc: "Ke hoach giao duc 2026.docx" });
  await until("ready");
  return { send, until, home, msgs };
}

describe("bridge: văn bản liên quan", () => {
  it("tìm ở nền, chỉ lưu tên và link; chỉ tải khi bấm; link lạ bị từ chối", async () => {
    const urls: string[] = [];
    const f: Fetcher = async (u) => {
      urls.push(u);
      return u.includes("duckduckgo") ? html(DDG) : html("<p>Toàn văn công văn 123</p>");
    };
    const { send, until, home } = await open(f);
    send({ type: "hint_get", id: "h1", profile: "Kế hoạch giáo dục năm học" });
    const refs = await until("refs");
    expect(refs.items[0]?.host).toBe("thuvienphapluat.vn");
    // Mới chỉ tìm: chưa tải trang nào.
    expect(urls.every((u) => u.includes("duckduckgo"))).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(home, "refs", "refs.json"), "utf8")) as { items: Array<{ url: string }> };
    expect(saved.items[0]?.url).toBe("https://thuvienphapluat.vn/cong-van-123");
    expect(fs.existsSync(path.join(home, "refs", "refs.md"))).toBe(true);

    send({ type: "ref_open", id: "o1", refId: refs.items[0]!.id });
    const t = await until("ref_text");
    expect(t).toMatchObject({ ok: true, text: "Toàn văn công văn 123" });
    expect(urls.some((u) => u.startsWith("https://thuvienphapluat.vn/"))).toBe(true);

    send({ type: "ref_open", id: "o2", refId: "khong-co" });
    expect((await until("ref_text")).ok).toBe(false);
  });

  it("tắt gợi ý thì không tìm trên mạng; mất mạng thì im lặng", async () => {
    let n = 0;
    const { send, msgs } = await open(async () => (n++, Promise.reject(new Error("offline"))));
    send({ type: "hint_get", id: "h1", profile: "Kế hoạch giáo dục năm học" });
    await new Promise((r) => setTimeout(r, 200));
    expect(msgs.some((m) => m.type === "refs" || m.type === "error")).toBe(false);
    send({ type: "hint_set", enabled: false });
    const before = n;
    send({ type: "hint_get", id: "h2", profile: "Khác hẳn nội dung" });
    await new Promise((r) => setTimeout(r, 150));
    expect(n).toBe(before);
  });
});

const HEAD = [
  "UBND PHƯỜNG HẠNH THÔNG",
  "TRƯỜNG THCS PHAN VĂN TRỊ",
  "TỔ: KHTN - CÔNG NGHỆ",
  "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  "Độc lập – Tự do – Hạnh phúc",
  "Hạnh Thông, ngày 01 tháng 7 năm 2026",
  "KẾ HOẠCH",
  "CÔNG TÁC QUÝ III NĂM 2026",
].join("\n");

describe("nhận biết đơn vị và địa phương", () => {
  it("đọc đầu văn bản: trường, phường, tên văn bản", () => {
    const c = extractContext(HEAD);
    expect(c.school).toBe("THCS Phan Văn Trị");
    expect(c.place).toBe("phường Hạnh Thông");
    expect(c.title).toBe("Kế Hoạch Công Tác Quý III Năm 2026");
    expect(c.province).toBeUndefined();
  });
  it("tỉnh ghi rõ trong văn bản thì lấy luôn", () => {
    expect(extractContext("UBND XÃ A\nTỉnh Quảng Ngãi, ngày 1 tháng 1").province).toBe("Quảng Ngãi");
  });
  it("trang địa phương của tỉnh khác bị loại; chưa biết địa bàn thì cũng không mang trang địa phương lạ", () => {
    const hcm = PROVINCES.find((p) => p.name === "Hồ Chí Minh");
    expect(sameArea("camthanh.quangngai.gov.vn", hcm)).toBe(false);
    expect(sameArea("gvap.hochiminh.gov.vn", hcm)).toBe(true);
    expect(sameArea("sgddt.hcm.gov.vn", hcm)).toBe(true);
    expect(sameArea("thuvienphapluat.vn", hcm)).toBeUndefined();
    expect(sameArea("moet.gov.vn", hcm)).toBeUndefined();
    expect(sameArea("camthanh.quangngai.gov.vn", undefined)).toBe(false);
  });
  it("bỏ phiếu theo tỉnh được nhắc nhiều nhất", () => {
    expect(provinceByVotes("Phường Hạnh Thông, TP. Hồ Chí Minh. Quận Gò Vấp - Thành phố Hồ Chí Minh")?.name).toBe("Hồ Chí Minh");
    expect(provinceByVotes("không nhắc tỉnh nào")).toBeUndefined();
  });
  it("câu tìm có đơn vị, địa phương và tỉnh", () => {
    const c = extractContext(HEAD);
    const q = refQueries("Ke hoach.docx", "", "admin", c, "Hồ Chí Minh");
    expect(q[0]).toContain("THCS Phan Văn Trị");
    expect(q[0]).toContain("phường Hạnh Thông");
    expect(q[0]).toContain("Hồ Chí Minh");
  });
});

describe("tìm đúng địa bàn (ca thực tế: phường Hạnh Thông là ở TP Hồ Chí Minh, không phải Quảng Ngãi)", () => {
  const page = (rows: Array<[string, string, string]>) =>
    rows.map(([t, u, sn]) => `<a class="result__a" href="${u}">${t}</a><a class="result__snippet">${sn}</a>`).join("\n");
  const fake = (queries: string[]): Fetcher => async (u) => {
    const q = decodeURIComponent(new URL(u).searchParams.get("q") ?? "");
    queries.push(q);
    if (/^phường Hạnh Thông/i.test(q))
      return html(page([
        ["Phường Hạnh Thông – Wikipedia", "https://vi.wikipedia.org/wiki/Hạnh_Thông", "Hạnh Thông là một phường thuộc Thành phố Hồ Chí Minh, trước đây thuộc quận Gò Vấp, TP. Hồ Chí Minh."],
        ["UBND phường Hạnh Thông", "https://hanhthong.hochiminh.gov.vn/", "Cổng thông tin phường Hạnh Thông, TP. Hồ Chí Minh"],
      ]));
    return html(page([
      ["Kế hoạch công tác quý III/2026 của tập thể lãnh đạo UBND phường", "https://camthanh.quangngai.gov.vn/ke-hoach", "Kế hoạch công tác quý III năm 2026 UBND phường Cẩm Thành, Quảng Ngãi"],
      ["Kế hoạch công tác quý III năm 2026 trường THCS Phan Văn Trị", "https://thcsphanvantri.hochiminh.gov.vn/ke-hoach", "Trường THCS Phan Văn Trị phường Hạnh Thông kế hoạch công tác quý III năm 2026"],
      ["Mẫu kế hoạch công tác quý III năm 2026", "https://thuvienphapluat.vn/mau-ke-hoach", "Mẫu kế hoạch công tác quý"],
    ]));
  };

  it("tra phường thuộc tỉnh nào trước, rồi tìm có kèm đơn vị và tỉnh; loại trang Quảng Ngãi", async () => {
    const queries: string[] = [];
    const cache = new PlaceCache(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pvta-place-")), "places.json"));
    const items = await findRefs({ fileName: "Ke hoach cong tac quy III.docx", profile: "", head: HEAD, modeId: "admin" }, fake(queries), cache);
    expect(queries[0]).toMatch(/^phường Hạnh Thông/); // bước 1: tra địa phương
    expect(queries.slice(1).every((q) => q.includes("Hồ Chí Minh") && q.includes("Hạnh Thông"))).toBe(true);
    const hosts = items.map((i) => i.host);
    expect(hosts).not.toContain("camthanh.quangngai.gov.vn");
    expect(hosts[0]).toBe("thcsphanvantri.hochiminh.gov.vn");
    expect(items[0]?.why).toBe("Cùng đơn vị");
    expect(cache.get("phường Hạnh Thông")?.name).toBe("Hồ Chí Minh");
  });

  it("lần sau dùng bộ nhớ, không tra lại; không tra được thì vẫn không mang trang tỉnh lạ về", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-place-"));
    const file = path.join(dir, "places.json");
    const q1: string[] = [];
    await findRefs({ fileName: "a.docx", profile: "", head: HEAD }, fake(q1), new PlaceCache(file));
    const q2: string[] = [];
    await findRefs({ fileName: "a.docx", profile: "", head: HEAD }, fake(q2), new PlaceCache(file));
    expect(q2.length).toBe(q1.length - 1);
    const q3: string[] = [];
    const none: Fetcher = async (u) => (q3.push(u), html(page([["Kế hoạch công tác quý III năm 2026 UBND phường", "https://camthanh.quangngai.gov.vn/x", ""], ["Mẫu kế hoạch công tác quý III năm 2026", "https://thuvienphapluat.vn/m", ""]])));
    const items = await findRefs({ fileName: "a.docx", profile: "", head: HEAD }, none);
    expect(items.map((i) => i.host)).toEqual(["thuvienphapluat.vn"]);
  });
});
