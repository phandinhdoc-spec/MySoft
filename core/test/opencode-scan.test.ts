import { describe, expect, it } from "vitest";
import { parseOpencodeModels, scanOpencode, discoverModels } from "../src/modelscan.js";
import { BUILTIN_MODELS } from "@pvta/shared";

describe("parseOpencodeModels", () => {
  it("đọc đủ các dòng nhà-cung-cấp/model và định dạng nhãn cùng gợi ý miễn phí", () => {
    const m = parseOpencodeModels("opencode/beam-free\nopencode/big-pickle\nrác không hợp lệ\n");
    expect(m.map((x) => x.id)).toEqual(["default", "opencode/beam-free", "opencode/big-pickle"]);
    expect(m[1]!.label).toBe("Beam Free");
    expect(m[1]!.hint).toBe("miễn phí");
    expect(m[2]!.label).toBe("Big Pickle");
    expect(m[2]!.hint).toBe("miễn phí");
  });

  it("đầu ra rỗng trả về mảng rỗng", () => {
    expect(parseOpencodeModels("")).toEqual([]);
  });

  it("BUILTIN_MODELS chứa các model miễn phí của OpenCode", () => {
    const ids = BUILTIN_MODELS.opencode.map((x) => x.id);
    expect(ids).toContain("default");
    expect(ids).toContain("opencode/beam-free");
    expect(ids).toContain("opencode/big-pickle");
    expect(ids).toContain("opencode/deepseek-v4.1-flash-free");
  });

  it("thử scanOpencode thực tế", async () => {
    const res = await scanOpencode("opencode");
    expect(res.length).toBeGreaterThan(1);
    const cat = await discoverModels({ opencode: "opencode" }, { opencode: true });
    expect(cat.opencode?.live).toBe(true);
    expect(cat.opencode?.models.length).toBeGreaterThan(1);
  });
});
