import { describe, expect, it } from "vitest";
import { LoopGuard } from "../src/chat.js";

describe("LoopGuard", () => {
  it("bắt thẻ <br> lặp vô hạn", () => {
    const g = new LoopGuard();
    let hit = false;
    for (let i = 0; i < 200 && !hit; i++) hit = g.push("<br>\n");
    expect(hit).toBe(true);
  });
  it("không bắt văn bản bình thường hay đường kẻ ngắn", () => {
    const g = new LoopGuard();
    expect(g.push("Câu 1. Đáp án đúng là C vì " + "-".repeat(40) + "\n| a | b |\n|---|---|\n".repeat(3))).toBe(false);
  });
});
