import type { ClientMessage, ServerMessage } from "@pvta/shared";

const KEY_STORE = "pvta.ipadKey";

/**
 * Địa chỉ WebSocket của bridge.
 * - Bản cài đặt: add-in do chính bridge phục vụ qua HTTPS (mặc định cổng 52730), nên nối wss
 *   cùng địa chỉ (Safari trong Office cho Mac chặn ws:// từ trang HTTPS).
 * - Chế độ iPad: add-in do máy tính trong cùng Wi-Fi phục vụ (cổng 52732); manifest iPad gắn
 *   mã ghép nối ?k=… vào địa chỉ trang, add-in chuyển mã đó sang WebSocket. Mã được nhớ lại
 *   phòng khi Office tải lại panel mà mất phần ?k=.
 * - Chế độ phát triển (vite, cổng 3000): nối cổng WebSocket thường của bridge.
 */
export function bridgeUrl(loc: { protocol: string; host: string; port: string; search: string } | undefined, store?: Pick<Storage, "getItem" | "setItem">): string {
  if (!loc || loc.protocol !== "https:" || loc.port === "3000") return "ws://127.0.0.1:52731/ws";
  let key = new URLSearchParams(loc.search).get("k");
  try {
    if (key) store?.setItem(KEY_STORE, key);
    else if (!isLoopback(loc.host)) key = store?.getItem(KEY_STORE) ?? null;
  } catch {
    /* bộ nhớ trình duyệt bị chặn */
  }
  return `wss://${loc.host}/ws${key ? `?k=${encodeURIComponent(key)}` : ""}`;
}

function isLoopback(host: string): boolean {
  const h = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

/** Add-in đang chạy trên iPad (do máy tính trong mạng phục vụ, không phải localhost). */
export function isRemoteHost(loc: { host: string; protocol: string } | undefined): boolean {
  return !!loc && loc.protocol === "https:" && !isLoopback(loc.host);
}

const safeStore = (): Storage | undefined => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
};

export const BRIDGE_URL = bridgeUrl(typeof location !== "undefined" ? location : undefined, safeStore());

type Handler = (m: ServerMessage) => void;

/** Kết nối WebSocket tới bridge, tự nối lại, gửi lại hello mỗi lần nối. */
export class BridgeClient {
  private ws?: WebSocket;
  private handlers = new Set<Handler>();
  private statusHandlers = new Set<(online: boolean) => void>();
  private retry = 500;
  private closed = false;

  constructor(
    private url: string,
    private hello: () => ClientMessage,
  ) {}

  connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 500;
      ws.send(JSON.stringify(this.hello()));
      this.statusHandlers.forEach((h) => h(true));
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data)) as ServerMessage;
        this.handlers.forEach((h) => h(m));
      } catch {
        /* bỏ qua tin hỏng */
      }
    };
    ws.onclose = () => {
      this.statusHandlers.forEach((h) => h(false));
      if (this.closed) return;
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 5000);
    };
    ws.onerror = () => ws.close();
  }

  send(m: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m));
      return true;
    }
    return false;
  }

  onMessage(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  onStatus(h: (online: boolean) => void): () => void {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
