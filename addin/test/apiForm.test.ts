import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MachineInfo } from "@pvta/shared";
import { ApiForm } from "../src/Settings";
import { STRINGS } from "../src/i18n";

const machine = (api: MachineInfo["api"]): MachineInfo => ({ capabilities: {}, api, auto: null, models: undefined as never, platform: "mac", scanning: false });
const render = (api: MachineInfo["api"]) => renderToStaticMarkup(createElement(ApiForm, { t: STRINGS.vi, machine: machine(api), send: () => true, result: null }));

describe("biểu mẫu API", () => {
  it("có ô Dán nhanh, nút tải danh sách model và ô khóa", () => {
    const html = render({ providers: {} });
    expect(html).toContain("Dán nhanh");
    expect(html).toContain("Điền tự động");
    expect(html).toContain("Tải danh sách model");
    expect(html).toContain('type="password"');
  });

  it("đã lưu danh sách model: hiện ô chọn có đủ model, không bắt gõ tên", () => {
    const html = render({
      providers: { anthropic: { configured: true, model: "claude-opus-5-5", models: [{ id: "claude-opus-5-5", label: "Claude Opus 5.5" }, { id: "claude-haiku-5-5" }] } },
    });
    expect(html).toContain("2 model, chọn một cái trong danh sách");
    expect(html).toContain("<select");
    expect(html).toContain("Claude Opus 5.5 (claude-opus-5-5)");
    expect(html).toContain("claude-haiku-5-5");
    expect(html).toContain("Làm mới danh sách");
  });

  it("Command Code đã lưu: địa chỉ hiện sẵn (chỉ đọc) và danh sách model để chọn", () => {
    const html = render({ providers: { commandcode: { configured: true, model: "deepseek/deepseek-v4-flash", models: [{ id: "deepseek/deepseek-v4-flash" }, { id: "moonshot/kimi-k2" }] } } });
    expect(html).toContain("https://api.commandcode.ai/provider/v1");
    expect(html).toContain("readonly");
    expect(html).toContain("moonshot/kimi-k2");
  });
});
