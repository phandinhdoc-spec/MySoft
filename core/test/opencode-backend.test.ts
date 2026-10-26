import { describe, expect, it } from "vitest";
import { newParseState, opencodeBackend } from "../src/backends/index.js";
import { parseOpencodeModels } from "../src/modelscan.js";

const textEv = (id: string, text: string) =>
  JSON.stringify({ type: "text", sessionID: "ses_1", part: { id, sessionID: "ses_1", type: "text", text } });

describe("backend opencode", () => {
  it("dựng lệnh: prompt qua stdin, chế độ chỉ đọc dùng agent plan", () => {
    const inv = opencodeBackend.invocation({ model: "opencode/big-pickle", prompt: "xin chào", permission: "read" });
    const flags = inv.args.map((a) => [a.flag, a.value]);
    expect(inv.stdin).toBe("xin chào");
    expect(flags).toContainEqual(["run", undefined]);
    expect(flags).toContainEqual(["--format", "json"]);
    expect(flags).toContainEqual(["--agent", "plan"]);
    expect(flags).toContainEqual(["--model", "opencode/big-pickle"]);
    expect(flags.some(([f]) => f === "--auto")).toBe(true);
  });

  it("chế độ chỉnh sửa dùng --auto; model default và phiên cũ", () => {
    const inv = opencodeBackend.invocation({ model: "default", prompt: "x", permission: "full", workspaceWrite: true, conversationId: "ses_9" });
    const flags = inv.args.map((a) => [a.flag, a.value]);
    expect(flags.some(([f]) => f === "--auto")).toBe(true);
    expect(flags.some(([f]) => f === "--agent")).toBe(false);
    expect(flags.some(([f]) => f === "--model")).toBe(false);
    expect(flags).toContainEqual(["--session", "ses_9"]);
  });

  it("đọc luồng sự kiện: lấy phiên và chữ, chỉ truyền phần mới", () => {
    const st = newParseState();
    expect(opencodeBackend.parseLine(JSON.stringify({ type: "step_start", sessionID: "ses_1", part: {} }), st)).toBeUndefined();
    expect(opencodeBackend.parseLine(textEv("p1", "Xin"), st)).toBe("Xin");
    expect(opencodeBackend.parseLine(textEv("p1", "Xin chào"), st)).toBe(" chào");
    expect(opencodeBackend.parseLine(textEv("p2", "Đoạn hai"), st)).toBe("\n\nĐoạn hai");
    expect(st.text).toBe("Xin chào\n\nĐoạn hai");
    expect(st.conversationId).toBe("ses_1");
    expect(st.gotEvent).toBe(true);
  });

  it("ghi nhận lỗi và bỏ qua dòng không phải JSON", () => {
    const st = newParseState();
    expect(opencodeBackend.parseLine("không phải json", st)).toBeUndefined();
    expect(st.gotEvent).toBe(false);
    opencodeBackend.parseLine(JSON.stringify({ type: "error", error: { name: "APIError", data: { message: "hết hạn mức" } } }), st);
    expect(st.error?.message).toBe("hết hạn mức");
  });

  it("đọc danh sách model từ `opencode models`", () => {
    const list = parseOpencodeModels("opencode/big-pickle\nopencode/flint-40b-free\nrác không hợp lệ\nopencode/big-pickle\n");
    expect(list.map((m) => m.id)).toEqual(["default", "opencode/big-pickle", "opencode/flint-40b-free"]);
    expect(list[2]!.hint).toBe("miễn phí");
    expect(parseOpencodeModels("")).toEqual([]);
  });
});
