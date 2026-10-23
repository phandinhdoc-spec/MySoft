import { describe, expect, it } from "vitest";
import {
  choiceFromInfo,
  clampEffort,
  effectiveEffort,
  effortsFor,
  findModelInfo,
  isValidModelChoice,
  parseAgyModels,
  parseCodexModels,
  type ModelCatalog,
} from "../src/index.js";

// Đầu ra thật của `agy models` trên máy người dùng (agy 1.3.5).
const AGY_OUT = [
  "Fetching available models...",
  "gemini-3.8-flash-high\tGemini 3.8 Flash (High)",
  "gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)",
  "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)",
  "claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)",
  "claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)",
  "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)",
].join("\n");

// Rút gọn từ `codex debug models` thật (codex 0.160.0).
const CODEX_JSON = {
  models: [
    {
      slug: "gpt-6.1-sol",
      display_name: "GPT-6.1-Sol",
      description: "Latest workhorse model for coding and everyday work.",
      default_reasoning_level: "low",
      supported_reasoning_levels: ["low", "medium", "high", "xhigh", "max", "ultra"].map((effort) => ({ effort, description: "x" })),
      visibility: "list",
      priority: 1,
      additional_speed_tiers: ["fast"],
      service_tiers: [{ id: "priority", name: "Fast", description: "2x speed, increased usage" }],
    },
    { slug: "gpt-old", display_name: "Old", supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }], visibility: "list", priority: 5 },
    { slug: "gpt-hidden", display_name: "Hidden", visibility: "hide", priority: 2 },
  ],
};

describe("đọc danh sách model agy", () => {
  const list = parseAgyModels(AGY_OUT);
  it("gộp các biến thể low/medium/high thành một model có chọn mức; bỏ dòng tiêu đề", () => {
    expect(list.map((m) => m.id)).toEqual(["gemini-3.8-flash", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium"]);
    const g = list[0]!;
    expect(g.label).toBe("Gemini 3.8 Flash");
    expect(g.variants).toEqual({ low: "gemini-3.8-flash-low", medium: "gemini-3.8-flash-medium", high: "gemini-3.8-flash-high" });
  });
  it("model chỉ có một mã (kể cả đuôi -medium lẻ loi) giữ nguyên tên và cố định mức", () => {
    const o = list.find((m) => m.id === "gpt-oss-120b-medium")!;
    expect(o.label).toBe("GPT-OSS 120B (Medium)");
    expect(o.efforts).toEqual([]);
    expect(o.variants).toBeUndefined();
  });
  it("chọn mức → đúng mã model thật gửi cho agy", () => {
    const g = list[0]!;
    expect(choiceFromInfo("agy", g, "low", false)).toEqual({ backend: "agy", model: "gemini-3.8-flash-low" });
    expect(choiceFromInfo("agy", g, "high", false).model).toBe("gemini-3.8-flash-high");
    expect(choiceFromInfo("agy", g, "xhigh", false).model).toBe("gemini-3.8-flash-high"); // mức không có → mức gần nhất không vượt
    expect(findModelInfo(list, "gemini-3.8-flash-low")?.effort).toBe("low");
  });
  it("không có đầu ra hợp lệ thì rỗng", () => {
    expect(parseAgyModels("Error: not logged in")).toEqual([]);
  });
});

describe("đọc danh sách model codex", () => {
  const list = parseCodexModels(CODEX_JSON);
  it("lấy model hiển thị theo thứ tự ưu tiên, bỏ model ẩn, thêm mục Mặc định ở đầu", () => {
    expect(list.map((m) => m.id)).toEqual(["default", "gpt-6.1-sol", "gpt-old"]);
  });
  it("mức suy nghĩ và chế độ Nhanh theo khai báo của từng model", () => {
    const sol = list.find((m) => m.id === "gpt-6.1-sol")!;
    expect(sol.efforts).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"]);
    expect(sol.defaultEffort).toBe("low");
    expect(sol.fast).toBe(true);
    expect(sol.fastTier).toBe("priority");
    const old = list.find((m) => m.id === "gpt-old")!;
    expect(old.efforts).toEqual(["low", "high"]);
    expect(old.fast).toBeUndefined();
    expect(choiceFromInfo("codex", sol, "low", true)).toEqual({ backend: "codex", model: "gpt-6.1-sol", speed: "priority" });
    expect(choiceFromInfo("codex", old, "low", true)).toEqual({ backend: "codex", model: "gpt-old" }); // không hỗ trợ Nhanh thì bỏ
  });
  it("dữ liệu hỏng thì rỗng, không ném lỗi", () => {
    expect(parseCodexModels(undefined)).toEqual([]);
    expect(parseCodexModels({ models: "x" })).toEqual([]);
  });
});

describe("mức suy nghĩ theo model trong danh mục", () => {
  const catalog: ModelCatalog = {
    codex: { live: true, models: parseCodexModels(CODEX_JSON) },
    agy: { live: true, models: parseAgyModels(AGY_OUT) },
  };
  it("effortsFor ưu tiên khai báo của model", () => {
    expect(effortsFor("codex", "gpt-old", undefined, catalog)).toEqual(["low", "high"]);
    expect(effortsFor("agy", "gemini-3.8-flash-low", undefined, catalog)).toEqual(["low", "medium", "high"]);
    expect(effortsFor("agy", "claude-sonnet-4-6", undefined, catalog)).toEqual([]);
  });
  it("effectiveEffort: mã biến thể quyết định mức; còn lại đưa mức đã lưu về mức model cho phép", () => {
    expect(effectiveEffort({ backend: "agy", model: "gemini-3.8-flash-low" }, "high", undefined, catalog)).toBe("low");
    expect(effectiveEffort({ backend: "codex", model: "gpt-old" }, "medium", undefined, catalog)).toBe("low");
    expect(effectiveEffort({ backend: "codex", model: "gpt-6.1-sol" }, "ultra", undefined, catalog)).toBe("ultra");
    expect(effectiveEffort({ backend: "agy", model: "claude-sonnet-4-6" }, "high", undefined, catalog)).toBeUndefined();
  });
  it("clampEffort: mức gần nhất không vượt; không có thì mức thấp nhất", () => {
    expect(clampEffort(["low", "medium", "high"], "max")).toBe("high");
    expect(clampEffort(["medium", "high"], "low")).toBe("medium");
    expect(clampEffort([], "low")).toBeUndefined();
  });
});

describe("kiểm tra lựa chọn model có chế độ Nhanh", () => {
  it("speed hợp lệ hoặc không có; mã lạ bị từ chối", () => {
    expect(isValidModelChoice({ backend: "codex", model: "gpt-6.1-sol", speed: "priority" })).toBe(true);
    expect(isValidModelChoice({ backend: "codex", model: "gpt-6.1-sol" })).toBe(true);
    expect(isValidModelChoice({ backend: "codex", model: "gpt-6.1-sol", speed: 'x"; rm' })).toBe(false);
    expect(isValidModelChoice({ backend: "codex", model: "gpt-6.1-sol", speed: 5 })).toBe(false);
  });
});
