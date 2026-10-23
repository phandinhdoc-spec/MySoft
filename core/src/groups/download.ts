import dns from "node:dns/promises";
import net from "node:net";
import { isPrivateIp, type Fetcher, type Resolver } from "../refs.js";
import { hostOf, isAllowedHost } from "./book.js";

/** Tải tệp văn bản về kho: chỉ PDF/DOC/DOCX, giới hạn dung lượng, không vào mạng nội bộ, không chạy nội dung. */

export const MAX_DOC_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

export type DocExt = ".pdf" | ".doc" | ".docx";

/** Nhận dạng định dạng theo phần đầu tệp, không tin phần mở rộng hay Content-Type. */
export function sniffDoc(buf: Uint8Array): DocExt | undefined {
  const b = buf.subarray(0, 8);
  if (b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-") return ".pdf";
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return ".docx";
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return ".doc";
  return undefined;
}

export type DownloadResult = { ok: true; data: Buffer; ext: DocExt; finalUrl: string } | { ok: false; error: string; gone?: boolean; needConfirm?: boolean };

const defaultResolver: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

export interface DownloadOptions {
  fetcher?: Fetcher;
  resolve?: Resolver;
  /** Tên miền tin cậy thêm của nhóm. */
  domains?: string[];
  /** Người dùng đã xác nhận cho nguồn ngoài danh sách. */
  confirmed?: boolean;
  signal?: AbortSignal;
  maxBytes?: number;
}

export async function downloadDoc(url: string, o: DownloadOptions = {}): Promise<DownloadResult> {
  const fetcher = o.fetcher ?? fetch;
  const resolve = o.resolve ?? defaultResolver;
  const max = o.maxBytes ?? MAX_DOC_BYTES;
  let cur = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(cur);
    } catch {
      return { ok: false, error: "Link không hợp lệ." };
    }
    if (u.protocol !== "https:") return { ok: false, error: "Chỉ tải được link https." };
    const host = hostOf(cur) ?? "";
    if (!o.confirmed && !isAllowedHost(host, o.domains)) {
      return { ok: false, needConfirm: true, error: `Nguồn ${host} không nằm trong danh sách tin cậy. Hãy xác nhận nếu thầy cô tin nguồn này.` };
    }
    try {
      const ips = net.isIP(u.hostname) ? [u.hostname] : await resolve(u.hostname);
      if (ips.length === 0 || ips.some(isPrivateIp)) return { ok: false, error: "Link trỏ về mạng nội bộ, PVTA không tải." };
    } catch {
      return { ok: false, error: "Không tìm thấy trang này (kiểm tra mạng).", gone: false };
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const onAbort = () => ac.abort();
    o.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetcher(cur, { signal: ac.signal, redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (PVTA)", "accept-language": "vi,en;q=0.8" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "Trang chuyển hướng không hợp lệ." };
        cur = new URL(loc, cur).toString();
        continue;
      }
      if (res.status === 404 || res.status === 410) return { ok: false, gone: true, error: "Nguồn không còn (lỗi 404)." };
      if (!res.ok) return { ok: false, error: `Trang trả về lỗi ${res.status}.` };
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > max) return { ok: false, error: `Tệp quá lớn (giới hạn ${Math.round(max / 1048576)} MB).` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > max) return { ok: false, error: `Tệp quá lớn (giới hạn ${Math.round(max / 1048576)} MB).` };
      const ext = sniffDoc(buf);
      if (!ext) return { ok: false, error: "Đây không phải tệp PDF hoặc Word (có thể là trang web). Hãy mở link bằng trình duyệt, tải tệp về rồi chọn tệp." };
      return { ok: true, data: buf, ext, finalUrl: cur };
    } catch {
      return { ok: false, error: "Không tải được (hết thời gian hoặc lỗi mạng)." };
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
    }
  }
  return { ok: false, error: "Trang chuyển hướng quá nhiều lần." };
}

export type { Fetcher, Resolver };
