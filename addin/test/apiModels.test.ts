import { describe, expect, it } from "vitest";
import type { ApiStatus } from "@pvta/shared";
import { apiModels } from "../src/models";

const ids = (a: ReturnType<typeof apiModels>) => a.map((o) => o.value.model);

describe("danh sách model API trong bộ chọn", () => {
  it("chưa tải được danh sách: dùng vài model gợi ý có sẵn", () => {
    const api: ApiStatus = { providers: { openai: { configured: true } } };
    expect(ids(apiModels(api))).toEqual(["openai/gpt-5.4-mini", "openai/gpt-5.5"]);
  });

  it("đã tải danh sách từ API: hiện đủ, model đang chọn lên đầu, không trùng", () => {
    const api: ApiStatus = {
      providers: {
        anthropic: {
          configured: true,
          model: "claude-opus-5-5",
          models: [{ id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }, { id: "claude-sonnet-5-5" }, { id: "claude-3-7-sonnet", label: "Claude Sonnet 3.7" }],
        },
      },
    };
    const out = apiModels(api);
    expect(ids(out)).toEqual(["anthropic/claude-opus-5-5", "anthropic/claude-haiku-5-5", "anthropic/claude-sonnet-5-5", "anthropic/claude-3-7-sonnet"]);
    expect(out[3]!.label).toBe("Claude Sonnet 3.7");
  });

  it("nhiều nhà cung cấp: tên model có ghi rõ của ai", () => {
    const api: ApiStatus = {
      providers: {
        openai: { configured: true, models: [{ id: "gpt-5.5" }] },
        compatible: { configured: true, baseUrl: "http://localhost:11434/v1", models: [{ id: "llama3.2:latest" }] },
      },
    };
    const out = apiModels(api);
    expect(out.map((o) => o.label)).toEqual(["OpenAI · GPT-5.5", "Tương thích OpenAI · llama3.2:latest"]);
  });

  it("chưa cấu hình thì không hiện", () => {
    expect(apiModels({ providers: { openai: { configured: false, models: [{ id: "gpt-5.5" }] } } })).toEqual([]);
  });
});
