import { describe, expect, it } from "vitest";
import { cleanModelList, maskKey, normalizeBaseUrl, parseQuickSetup } from "../src/apisetup.js";

describe("điền nhanh API: tách từ đoạn dán", () => {
  it("curl của Anthropic", () => {
    const r = parseQuickSetup(`curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{"model": "claude-sonnet-5-5", "max_tokens": 1024}'`);
    expect(r).toEqual({ provider: "anthropic", key: "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV", model: "claude-sonnet-5-5" });
  });

  it("curl của OpenAI (Bearer), địa chỉ trùng mặc định thì không lưu", () => {
    const r = parseQuickSetup(`curl https://api.openai.com/v1/chat/completions -H "Authorization: Bearer sk-proj-abcdefghijklmnop1234" -d '{"model":"gpt-5.4-mini"}'`);
    expect(r).toEqual({ provider: "openai", key: "sk-proj-abcdefghijklmnop1234", model: "gpt-5.4-mini" });
  });

  it("Gemini: khóa và model nằm trong địa chỉ", () => {
    const r = parseQuickSetup("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=AIzaSyA1234567890abcdefghijklmnopqrstu");
    expect(r.provider).toBe("gemini");
    expect(r.key).toBe("AIzaSyA1234567890abcdefghijklmnopqrstu");
    expect(r.model).toBe("gemini-flash-latest");
    expect(r.baseUrl).toBeUndefined();
  });

  it("dòng .env của máy chủ tương thích (OpenRouter)", () => {
    const r = parseQuickSetup(`export OPENAI_API_KEY="sk-or-v1-0123456789abcdef0123"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL=anthropic/claude-sonnet-5-5`);
    expect(r).toEqual({ provider: "compatible", key: "sk-or-v1-0123456789abcdef0123", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-5-5" });
  });

  it("Ollama cục bộ: chỉ có địa chỉ, tự thêm /v1", () => {
    const r = parseQuickSetup("OLLAMA at http://localhost:11434 --model llama3.2");
    expect(r).toEqual({ provider: "compatible", baseUrl: "http://localhost:11434/v1", model: "llama3.2" });
  });

  it("JSON cấu hình", () => {
    const r = parseQuickSetup(`{"apiKey": "sk-ant-api03-ZZZZZZZZZZZZZZZZZZZZZZZZ", "baseURL": "https://api.anthropic.com", "model": "claude-opus-5-5"}`);
    expect(r.provider).toBe("anthropic");
    expect(r.key).toBe("sk-ant-api03-ZZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(r.model).toBe("claude-opus-5-5");
  });

  it("chỉ dán mỗi khóa: nhận nhà cung cấp theo tiền tố", () => {
    expect(parseQuickSetup("sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV").provider).toBe("anthropic");
    expect(parseQuickSetup("  sk-proj-abcdefghijklmnop1234  ").provider).toBe("openai");
    expect(parseQuickSetup("AIzaSyA1234567890abcdefghijklmnopqrstu").provider).toBe("gemini");
  });

  it("chỗ trống trong ví dụ ($OPENAI_API_KEY, YOUR_API_KEY) không bị nhận là khóa", () => {
    expect(parseQuickSetup(`curl https://api.openai.com/v1/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY"`).key).toBeUndefined();
    expect(parseQuickSetup(`OPENAI_API_KEY=YOUR_API_KEY`).key).toBeUndefined();
    expect(parseQuickSetup("api_key=sk-...").key).toBeUndefined();
  });

  it("đoạn không có gì dùng được thì trả về rỗng", () => {
    expect(parseQuickSetup("xin chào, tôi muốn dùng API")).toEqual({});
  });
});

describe("địa chỉ gốc", () => {
  it.each([
    ["https://api.openai.com/v1/chat/completions", "https://api.openai.com/v1"],
    ["https://api.anthropic.com/v1/messages", "https://api.anthropic.com/v1"],
    ["https://openrouter.ai/api/v1/models", "https://openrouter.ai/api/v1"],
    ["http://127.0.0.1:1234", "http://127.0.0.1:1234/v1"],
    ["https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "https://generativelanguage.googleapis.com/v1beta/openai"],
    ["https://generativelanguage.googleapis.com/v1beta/models/x:generateContent", "https://generativelanguage.googleapis.com/v1beta/openai"],
  ])("%s → %s", (raw, want) => expect(normalizeBaseUrl(raw)).toBe(want));
  it("không phải http(s) thì bỏ", () => {
    expect(normalizeBaseUrl("ftp://x.y/z")).toBeUndefined();
    expect(normalizeBaseUrl("không phải địa chỉ")).toBeUndefined();
  });
});

describe("danh sách model", () => {
  it("bỏ model không trò chuyện, bỏ tiền tố models/, bỏ trùng, mới lên trước", () => {
    const out = cleanModelList("gemini", [
      { id: "models/gemini-flash-latest" },
      { id: "models/gemini-2.5-pro" },
      { id: "models/text-embedding-004" },
      { id: "models/gemini-2.5-flash-image" },
      { id: "models/gemini-flash-latest" },
    ]);
    expect(out.map((m) => m.id)).toEqual(["gemini-flash-latest", "gemini-2.5-pro"]);
  });
  it("Anthropic giữ nguyên thứ tự trả về và tên hiển thị", () => {
    const out = cleanModelList("anthropic", [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    ]);
    expect(out).toEqual([
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    ]);
  });
  it("OpenAI: bỏ nhúng, giọng nói, ảnh; xếp số lớn lên trước", () => {
    const out = cleanModelList("openai", [{ id: "gpt-4o" }, { id: "whisper-1" }, { id: "gpt-5.5" }, { id: "dall-e-3" }, { id: "text-embedding-3-small" }, { id: "gpt-5.4-mini" }]);
    expect(out.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-5.4-mini", "gpt-4o"]);
  });
  it("che khóa khi hiển thị", () => {
    expect(maskKey("sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV")).toBe("sk-ant-…STUV");
    expect(maskKey("abc")).toBe("••••");
  });

  it("nhận ra Command Code theo địa chỉ và bỏ địa chỉ mặc định", () => {
    const q = parseQuickSetup("curl https://api.commandcode.ai/provider/v1/chat/completions -H 'Authorization: Bearer user_abcdefghijklmnop' -d '{\"model\":\"deepseek/deepseek-v4-flash\"}'");
    expect(q.provider).toBe("commandcode");
    expect(q.baseUrl).toBeUndefined();
    expect(q.key).toBe("user_abcdefghijklmnop");
    expect(q.model).toBe("deepseek/deepseek-v4-flash");
  });
});
