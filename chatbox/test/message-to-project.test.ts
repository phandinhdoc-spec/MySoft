// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MessageContent } from "../src/MessageContent";
import { messageDraft, messageFileName, messageMarkdown, messageTitle, MESSAGE_DRAG_TYPE } from "../src/message-to-project";

vi.mock("../src/ipc", () => ({ rpc: vi.fn(), subscribe: vi.fn(async () => () => {}), pickFiles: vi.fn(), savePath: vi.fn() }));

const at = new Date(2026, 9, 22, 14, 5).getTime();

it("builds a safe Markdown file name and title from the message", () => {
  expect(messageFileName('Hỏi: "a/b"?\nTiếp', at)).toBe("Đoạn chat 2026-10-22 14.05 - Hỏi a b.md");
  expect(messageTitle("## **Tiêu đề** `x`")).toBe("Tiêu đề x");
  expect(messageTitle("..")).toBe("Đoạn chat");
  expect(messageTitle("")).toBe("Đoạn chat");
  const long = messageTitle("a".repeat(100));
  expect(long.endsWith("…")).toBe(true);
  expect(long.length).toBe(61);
  expect(messageFileName("x".repeat(300), at).length).toBeLessThanOrEqual(120);
});

it("keeps message text intact in the Markdown body and produces a draft for drag and menu", () => {
  const text = "Đề kiểm tra:\n\n- Câu 1\n- Câu 2";
  const md = messageMarkdown(text, at);
  expect(md.startsWith("# Đề kiểm tra:\n")).toBe(true);
  expect(md).toContain(text);
  const draft = messageDraft(text, at);
  expect(draft.name.endsWith(".md")).toBe(true);
  expect(draft.title).toBe("Đề kiểm tra:");
  expect(MESSAGE_DRAG_TYPE).toBe("application/x-pvta-message");
});

let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
const notice = vi.fn(), report = vi.fn();
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = (node: React.ReactElement) => act(async () => root.render(node));
const openMenu = () => act(async () => {
  host.querySelector(".message-content")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
});
const item = (prefix: string) => [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((x) => x.textContent?.startsWith(prefix));

const userMessage = { id: "u1", role: "user" as const, text: "Câu hỏi của thầy cô", at };

it("gives a teacher's message a context menu with 'Thêm vào dự án' that saves a draft", async () => {
  const onProjectSave = vi.fn();
  await render(React.createElement(MessageContent, { message: userMessage, chatId: "c1", notice, report, projectName: "Lớp 6A", onProjectSave }, "Câu hỏi của thầy cô"));
  await openMenu();
  expect(item("Sao chép")).toBeTruthy();
  expect(item("Góp ý")).toBeUndefined();
  expect(item("Thêm vào dự án")?.getAttribute("aria-disabled")).toBe("false");
  await act(async () => item("Thêm vào dự án")!.click());
  expect(onProjectSave).toHaveBeenCalledTimes(1);
  expect(onProjectSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Câu hỏi của thầy cô", name: expect.stringMatching(/\.md$/), content: expect.stringContaining("Câu hỏi của thầy cô") }));
  expect(report).not.toHaveBeenCalled();
});

it("disables 'Thêm vào dự án' when no project is open", async () => {
  const onProjectSave = vi.fn();
  await render(React.createElement(MessageContent, { message: userMessage, chatId: "c1", notice, report, onProjectSave }, "Câu hỏi"));
  await openMenu();
  expect(item("Thêm vào dự án")?.getAttribute("aria-disabled")).toBe("true");
  await act(async () => item("Thêm vào dự án")!.click());
  expect(onProjectSave).not.toHaveBeenCalled();
});

it("keeps the feedback command only for AI answers and hides the menu for failed answers", async () => {
  await render(React.createElement(MessageContent, { message: { id: "a1", role: "assistant", text: "Trả lời", at }, chatId: "c1", notice, report }, "Trả lời"));
  await openMenu();
  expect(item("Góp ý")).toBeTruthy();
  expect(item("Thêm vào dự án")).toBeUndefined();
  await render(React.createElement(MessageContent, { message: { id: "a2", role: "assistant", text: "Lỗi", at, error: true }, chatId: "c1", notice, report }, "Lỗi"));
  expect(host.querySelector(".message-tools")).toBeNull();
});
