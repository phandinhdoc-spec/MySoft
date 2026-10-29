import type { Backend, InvokeOptions, Invocation, ParseState } from "./types.js";
import { safeJson } from "./types.js";

/**
 * Backend `claude` (Claude Code CLI, chạy -p).
 * Prompt đi qua stdin: không giới hạn độ dài, không lộ trong danh sách tiến trình.
 * `--tools ""` = không có công cụ gốc, không MCP, không skill.
 * `--include-partial-messages` để nhận chữ theo từng đoạn (token đầu tiên nhanh hơn).
 */
/** Công cụ mở khi người dùng bật quyền chỉnh sửa tự động. */
const FULL_TOOLS = "Read,Edit,Write,Glob,Grep,Bash";

export const claudeBackend: Backend = {
  id: "claude",
  defaultBin: "claude",
  envVar: "PVTA_CLAUDE_BIN",
  // Tắt mọi thứ PVTA không dùng: tự cập nhật, đo đạc, CLAUDE.md và bộ nhớ tự động của máy
  // (vừa chậm, vừa trộn ngữ cảnh lập trình vào câu trả lời cho giáo viên).
  env: {
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: "1",
  },

  invocation(opts: InvokeOptions): Invocation {
    const mcpOn = opts.mcp?.enabled === true;
    const mcpTools = (opts.mcp?.allowedTools ?? []).map((t) => t.trim()).filter((t) => /^mcp__[\w.-]+(__[\w.*-]+)?$/.test(t));
    // Claude Code nạp công cụ MCP qua công cụ gốc ToolSearch; khi có danh sách MCP được phép thì mở thêm ToolSearch.
    const baseTools = [opts.workspaceWrite === true ? FULL_TOOLS : opts.images?.length ? "Read" : "", ...(mcpOn && mcpTools.length ? ["ToolSearch"] : [])].filter(Boolean).join(",");
    const args: Invocation["args"] = [{ flag: "-p", essential: true }];
    if (!opts.plain) {
      args.push(
        { flag: "--output-format", value: "stream-json", essential: true },
        { flag: "--verbose", essential: true },
        { flag: "--include-partial-messages" },
      );
    }
    args.push(
      // Ba cờ an toàn: không bao giờ bị bỏ khi thích ứng phiên bản (thiếu thì báo lỗi, không chạy yếu đi).
      // Có ảnh: chỉ mở công cụ Read (để xem ảnh trong thư mục làm việc), không gì khác.
      { flag: "--tools", value: baseTools, essential: true },
      // Chỉ bỏ khi người dùng bật "Cho phép công cụ kết nối" (mặc định tắt).
      ...(mcpOn ? [] : [{ flag: "--strict-mcp-config", essential: true }]),
      { flag: "--disable-slash-commands", essential: true },
    );
    // Quyền "full" (người dùng chủ động bật chế độ Chỉnh sửa): sửa tệp và chạy lệnh trong thư mục làm việc.
    // Công cụ MCP chỉ được duyệt khi nằm trong danh sách cho phép; quyền ghi tệp không mở rộng sang MCP.
    const allowed = [baseTools, ...(mcpOn ? mcpTools : [])].filter(Boolean).join(",");
    if (allowed) args.push({ flag: "--allowedTools", value: allowed, essential: true });
    // Thay lời nhắc hệ thống mặc định (hướng dẫn lập trình, công cụ: rất dài) bằng quy tắc của PVTA.
    // Không bắt buộc: CLI cũ không có cờ này thì quy tắc đi trong prompt.
    if (opts.system) args.push({ flag: "--system-prompt", value: opts.system });
    // Bỏ qua hook, plugin, skill… của máy (khởi động nhanh, không bị cấu hình lập trình xen vào).
    // --safe-mode cũng tắt MCP nên phải bỏ khi bật kết nối.
    if (!mcpOn) args.push({ flag: "--safe-mode" });
    if (opts.model && opts.model !== "default") args.push({ flag: "--model", value: opts.model, essential: true });
    if (opts.conversationId) args.push({ flag: "--resume", value: opts.conversationId, essential: true });
    // Không bắt buộc: CLI cũ không có cờ này thì bị bỏ và chạy với mức mặc định.
    if (opts.effort) args.push({ flag: "--effort", value: opts.effort === "ultra" ? "max" : opts.effort });
    // Chế độ Nhanh (chỉ Opus; tính phí bằng usage credits): bật cho riêng lượt chạy này, không đổi cấu hình người dùng.
    if (opts.speed === "fast") args.push({ flag: "--settings", value: '{"fastMode":true}' });
    return { bin: "", args, stdin: opts.prompt };
  },

  parseLine(line: string, st: ParseState): string | undefined {
    const ev = safeJson(line);
    if (!ev) return undefined;
    st.gotEvent = true;
    switch (ev.type) {
      case "system": {
        if (ev.subtype === "init" && typeof ev.session_id === "string") st.conversationId = ev.session_id;
        return undefined;
      }
      case "stream_event": {
        const d = ev.event?.delta;
        if (ev.event?.type === "content_block_delta" && d?.type === "text_delta" && typeof d.text === "string") {
          st.sawDelta = true;
          st.text += d.text;
          return d.text;
        }
        return undefined;
      }
      case "assistant": {
        // Bản đầy đủ của tin nhắn; bỏ qua nếu đã nhận chữ theo từng đoạn.
        if (st.sawDelta) return undefined;
        const parts: unknown[] = Array.isArray(ev.message?.content) ? ev.message.content : [];
        let out = "";
        for (const p of parts as Array<{ type?: string; text?: string }>) {
          if (p?.type === "text" && typeof p.text === "string") out += p.text;
        }
        if (out) {
          st.text += out;
          return out;
        }
        return undefined;
      }
      case "result": {
        if (typeof ev.session_id === "string") st.conversationId = ev.session_id;
        if (typeof ev.result === "string") st.resultText = ev.result;
        if (ev.is_error === true || (typeof ev.subtype === "string" && ev.subtype.startsWith("error"))) {
          st.error = { kind: "other", message: typeof ev.result === "string" && ev.result ? ev.result : String(ev.subtype ?? "error") };
        }
        return undefined;
      }
      default:
        return undefined; // rate_limit_event và các sự kiện khác
    }
  },
};
