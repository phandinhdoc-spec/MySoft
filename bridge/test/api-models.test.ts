import { describe, expect, it } from "vitest";
import { ApiClient, type ApiSettings } from "../src/api.js";

type Call = { url: string; headers: Record<string, string> };

function stub(handler: (url: string, n: number) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: { headers?: Record<string, string> }) => {
    const r = handler(String(url), calls.length);
    calls.push({ url: String(url), headers: { ...(init?.headers ?? {}) } });
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const client = (settings: ApiSettings, fetchFn: typeof fetch) => new ApiClient({ settings: () => settings, fetch: fetchFn });

describe("tải danh sách model từ API", () => {
  it("Anthropic: gửi x-api-key, đọc nhiều trang, giữ tên hiển thị", async () => {
    const s = stub((url) =>
      url.includes("after_id=b")
        ? { body: { data: [{ id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5" }], has_more: false } }
        : { body: { data: [{ id: "claude-opus-5-5", display_name: "Claude Opus 5.5" }, { id: "b", display_name: "B" }], has_more: true, last_id: "b" } },
    );
    const out = await client({ anthropic: { key: "sk-ant-KEY" } }, s.fetchFn).listModels("anthropic");
    expect(out.map((m) => m.id)).toEqual(["claude-opus-5-5", "b", "claude-haiku-5-5"]);
    expect(out[0]?.label).toBe("Claude Opus 5.5");
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0]!.url).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect(s.calls[0]!.headers["x-api-key"]).toBe("sk-ant-KEY");
  });

  it("OpenAI: Bearer, bỏ model không trò chuyện được", async () => {
    const s = stub(() => ({ body: { data: [{ id: "gpt-4o" }, { id: "whisper-1" }, { id: "gpt-5.5" }, { id: "text-embedding-3-small" }] } }));
    const out = await client({ openai: { key: "sk-abc" } }, s.fetchFn).listModels("openai");
    expect(out.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-4o"]);
    expect(s.calls[0]!.headers.authorization).toBe("Bearer sk-abc");
  });

  it("máy chủ cục bộ (Ollama): không cần khóa, dùng địa chỉ đã lưu", async () => {
    const s = stub(() => ({ body: { data: [{ id: "llama3.2:latest" }, { id: "qwen3:8b" }] } }));
    const out = await client({ compatible: { baseUrl: "http://localhost:11434/v1" } }, s.fetchFn).listModels("compatible");
    expect(out.map((m) => m.id).sort()).toEqual(["llama3.2:latest", "qwen3:8b"]);
    expect(s.calls[0]!.url).toBe("http://localhost:11434/v1/models");
    expect(s.calls[0]!.headers.authorization).toBeUndefined();
  });

  it("khóa đã lưu KHÔNG được gửi tới địa chỉ lạ mới gõ", async () => {
    const s = stub(() => ({ body: { data: [{ id: "m1" }] } }));
    await client({ openai: { key: "sk-saved" } }, s.fetchFn).listModels("openai", { baseUrl: "https://ke-xau.example/v1" }).catch(() => undefined);
    expect(s.calls).toHaveLength(0); // OpenAI cần khóa; không có khóa mới gõ nên không gọi, càng không dùng khóa cũ
    const c2 = stub(() => ({ body: { data: [{ id: "m1" }] } }));
    await client({ compatible: { key: "sk-saved", baseUrl: "http://localhost:11434/v1" } }, c2.fetchFn).listModels("compatible", { baseUrl: "https://ke-xau.example/v1" });
    expect(c2.calls[0]!.url).toBe("https://ke-xau.example/v1/models");
    expect(c2.calls[0]!.headers.authorization).toBeUndefined();
  });

  it("khóa mới gõ được dùng ngay, kể cả chưa lưu", async () => {
    const s = stub(() => ({ body: { data: [{ id: "gpt-5.5" }] } }));
    await client({}, s.fetchFn).listModels("openai", { key: "sk-moi" });
    expect(s.calls[0]!.headers.authorization).toBe("Bearer sk-moi");
  });

  it.each([
    [401, /không hợp lệ/],
    [404, /không có danh sách model/],
    [429, /hạn mức/],
    [500, /API báo lỗi \(500\)/],
  ])("lỗi HTTP %i báo rõ bằng tiếng Việt", async (status, re) => {
    const s = stub(() => ({ status, body: { error: { message: "x" } } }));
    await expect(client({ openai: { key: "sk-abc" } }, s.fetchFn).listModels("openai")).rejects.toThrow(re);
  });

  it("thiếu khóa hoặc địa chỉ thì báo ngay, không gọi mạng", async () => {
    const s = stub(() => ({ body: {} }));
    await expect(client({}, s.fetchFn).listModels("anthropic")).rejects.toThrow(/Chưa có khóa API/);
    await expect(client({}, s.fetchFn).listModels("compatible")).rejects.toThrow(/Chưa có địa chỉ/);
    expect(s.calls).toHaveLength(0);
  });

  it("danh sách rỗng hoặc không phải JSON: báo lỗi dễ hiểu", async () => {
    await expect(client({ openai: { key: "sk-abc" } }, stub(() => ({ body: { data: [{ id: "whisper-1" }] } })).fetchFn).listModels("openai")).rejects.toThrow(/không trả về model nào/);
    await expect(client({ openai: { key: "sk-abc" } }, stub(() => ({ body: "<html>" })).fetchFn).listModels("openai")).rejects.toThrow(/không phải JSON/);
  });

  it("Command Code: tải danh sách model không cần khóa, gửi tới địa chỉ cố định", async () => {
    const s = stub(() => ({ body: { data: [{ id: "deepseek/deepseek-v4-flash" }, { id: "anthropic/claude-sonnet-5-5" }] } }));
    const out = await client({}, s.fetchFn).listModels("commandcode");
    expect(s.calls[0]!.url).toBe("https://api.commandcode.ai/provider/v1/models");
    expect(s.calls[0]!.headers.authorization).toBeUndefined();
    expect(out.map((m) => m.id)).toContain("deepseek/deepseek-v4-flash");
  });

  it("Command Code: có khóa thì gửi Bearer; máy chủ đòi khóa mà chưa có thì báo rõ", async () => {
    const s = stub(() => ({ body: { data: [{ id: "a/b" }] } }));
    await client({ commandcode: { key: "user_abc" } }, s.fetchFn).listModels("commandcode");
    expect(s.calls[0]!.headers.authorization).toBe("Bearer user_abc");
    const denied = stub(() => ({ status: 401, body: {} }));
    await expect(client({}, denied.fetchFn).listModels("commandcode")).rejects.toThrow(/cần khóa/);
  });
});
