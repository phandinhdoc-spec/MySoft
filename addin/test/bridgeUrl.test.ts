import { describe, expect, it } from "vitest";
import { bridgeUrl, isRemoteHost } from "../src/bridgeClient";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("địa chỉ bridge", () => {
  it("máy tính: localhost giữ nguyên, dev dùng cổng WS thường", () => {
    expect(bridgeUrl({ protocol: "https:", host: "localhost:52730", port: "52730", search: "" })).toBe("wss://localhost:52730/ws");
    expect(bridgeUrl({ protocol: "https:", host: "localhost:3000", port: "3000", search: "" })).toBe("ws://127.0.0.1:52731/ws");
    expect(bridgeUrl(undefined)).toBe("ws://127.0.0.1:52731/ws");
  });

  it("iPad: chuyển mã ghép nối sang WebSocket và nhớ lại khi tải lại mất ?k=", () => {
    const s = mem();
    expect(bridgeUrl({ protocol: "https:", host: "may.local:52732", port: "52732", search: "?k=a+b%2Fc&ipad=1" }, s)).toBe("wss://may.local:52732/ws?k=a%20b%2Fc");
    expect(bridgeUrl({ protocol: "https:", host: "may.local:52732", port: "52732", search: "" }, s)).toBe("wss://may.local:52732/ws?k=a%20b%2Fc");
    // Không gửi mã đã nhớ cho bridge trên chính máy (localhost).
    expect(bridgeUrl({ protocol: "https:", host: "localhost:52730", port: "52730", search: "" }, s)).toBe("wss://localhost:52730/ws");
  });

  it("nhận ra trang do máy khác phục vụ", () => {
    expect(isRemoteHost({ protocol: "https:", host: "192.168.1.9:52732" })).toBe(true);
    expect(isRemoteHost({ protocol: "https:", host: "localhost:52730" })).toBe(false);
    expect(isRemoteHost({ protocol: "https:", host: "127.0.0.1:52730" })).toBe(false);
    expect(isRemoteHost(undefined)).toBe(false);
  });
});
