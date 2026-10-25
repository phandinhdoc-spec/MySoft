import type { Backend, InvokeOptions, Invocation, ParseState } from "./types.js";
import { safeJson } from "./types.js";

/** Mức suy nghĩ của codex: truyền nguyên (add-in chỉ cho chọn mức mà model khai báo trong danh mục của codex). */
export function codexEffort(effort: string | undefined): string | undefined {
  return effort || undefined;
}

function errMessage(e: unknown, fallback: string): string {
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const m = (e as Record<string, unknown>).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/** Chữ của một mục agent_message (mọi đời định dạng đã biết). */
function agentText(item: Record<string, any> | undefined): string | undefined {
  if (!item) return undefined;
  const t = item.type ?? item.item_type;
  if (t !== "agent_message" && t !== "assistant_message") return undefined;
  return typeof item.text === "string" ? item.text : undefined;
}

/** MCP image content is output, not an assistant text item. Keep it in the saved reply. */
function toolImages(item: Record<string, any> | undefined): string | undefined {
  if (item?.type !== 'mcp_tool_call' || item.error || item.result?.isError ||
      ['failed', 'declined', 'cancelled'].includes(item.status) || !Array.isArray(item.result?.content)) return undefined;
  const images: string[] = [];
  let total = 0;
  for (const block of item.result.content) {
    if (block?.type !== 'image' || !/^image\/(png|jpeg|webp|gif)$/.test(block.mimeType) || typeof block.data !== 'string') continue;
    // Bound output size and accept only raster base64, never URLs/HTML supplied by a tool.
    if (!block.data.length || block.data.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(block.data)) continue;
    total += block.data.length;
    if (total > 16 * 1024 * 1024) break;
    images.push(`![Ảnh từ công cụ AI](data:${block.mimeType};base64,${block.data})`);
  }
  return images.length ? images.join('\n\n') : undefined;
}

/**
 * Backend `codex` (OpenAI Codex CLI, chạy `codex exec`):
 * - `--json`: thread.started (thread_id) → item.* (agent_message có `text`) → turn.completed / turn.failed / error.
 * - Tiếp tục hội thoại: `codex exec [tùy chọn] resume <thread_id> -`.
 * - Prompt đi qua stdin (`-`): không giới hạn độ dài, không lộ trong danh sách tiến trình.
 * - Luôn `--sandbox read-only`: PVTA sửa văn bản qua Office.js, codex không cần ghi gì lên máy.
 *   (Codex vẫn chạy được lệnh đọc như agy; dùng claude cho văn bản không tin cậy.)
 */
export const codexBackend: Backend = {
  id: "codex",
  defaultBin: "codex",
  envVar: "PVTA_CODEX_BIN",
  // Cờ của lệnh gốc (--config) và của "exec" nằm ở hai trang help khác nhau.
  helpArgs: [["--help"], ["exec", "--help"]],

  invocation(opts: InvokeOptions): Invocation {
    const args: Invocation["args"] = [];
    const eff = codexEffort(opts.effort);
    // --config thuộc lệnh gốc nên đặt trước "exec"; không bắt buộc (CLI không nhận thì bỏ).
    if (eff) args.push({ flag: "--config", value: `model_reasoning_effort="${eff}"` });
    // Chế độ Nhanh: bậc dịch vụ (service tier) lấy từ danh mục model của codex. Cờ bật tính năng đi kèm
    // (bản codex mới có thể không cần; khóa lạ bị codex bỏ qua).
    if (opts.speed && /^[a-z][a-z0-9_-]{0,19}$/i.test(opts.speed)) {
      args.push({ flag: "--config", value: `service_tier="${opts.speed}"` });
      args.push({ flag: "--config", value: "features.fast_mode=true" });
    }
    // Quyền "full": cho ghi trong thư mục làm việc và dùng mạng (npm, git…). Các mức khác giữ read-only.
    if (opts.workspaceWrite===true) args.push({ flag: "--config", value: "sandbox_workspace_write.network_access=true" });
    args.push({ flag: "exec", essential: true });
    if (!opts.plain) args.push({ flag: "--json", essential: true });
    args.push(
      { flag: "--sandbox", value: opts.workspaceWrite===true ? "workspace-write" : "read-only", essential: true },
      { flag: "--skip-git-repo-check", essential: true },
      { flag: "--color", value: "never" },
    );
    if (opts.model && opts.model !== "default") args.push({ flag: "--model", value: opts.model, essential: true });
    for (const img of opts.images ?? []) args.push({ flag: "--image", value: img, essential: true });
    if (opts.conversationId) args.push({ flag: "resume", essential: true }, { flag: opts.conversationId, essential: true });
    args.push({ flag: "-", essential: true });
    return { bin: "", args, stdin: opts.prompt };
  },

  parseLine(line: string, st: ParseState): string | undefined {
    const ev = safeJson(line);
    if (!ev) return undefined;
    st.gotEvent = true;
    const tid = ev.thread_id ?? ev.session_id ?? ev.msg?.session_id;
    if (typeof tid === "string" && tid) st.conversationId = tid;

    // Định dạng cũ (trước v0.44): {"id":..,"msg":{"type":"agent_message","message":"…"}}
    if (ev.msg && typeof ev.msg === "object" && !ev.type) {
      const m = ev.msg as Record<string, any>;
      if (m.type === "agent_message" && typeof m.message === "string") return appendText(st, m.message, true);
      if (m.type === "agent_message_delta" && typeof m.delta === "string") return appendText(st, m.delta, false);
      if (m.type === "error" && !isReconnectNotice(m)) st.error = { kind: "other", message: errMessage(m, "codex báo lỗi") };
      return undefined;
    }

    switch (ev.type) {
      case "item.updated":
      case "item.completed": {
        const text = agentText(ev.item) ?? (ev.type === 'item.completed' ? toolImages(ev.item) : undefined);
        if (text === undefined) return undefined;
        const id = String(ev.item.id ?? "");
        const prev = st.items?.get(id) ?? "";
        (st.items ??= new Map()).set(id, text);
        // Mục được cập nhật dần: chỉ truyền phần mới. Mục mới: ngăn cách với đoạn trước.
        if (text.startsWith(prev)) {
          const add = text.slice(prev.length);
          if (!add) return undefined;
          const sep = prev === "" && st.text ? "\n\n" : "";
          st.text += sep + add;
          return sep + add;
        }
        return undefined;
      }
      case "turn.failed":
        st.error = { kind: "other", message: errMessage(ev.error, "codex không hoàn thành lượt này") };
        return undefined;
      case "turn.completed":
        // Lượt đã hoàn tất: mọi lỗi tạm thời trước đó (đã tự nối lại) không còn ý nghĩa.
        st.error = undefined;
        return undefined;
      case "error":
        // "Reconnecting... n/5" chỉ là thông báo thử lại của codex, không phải kết quả cuối.
        // Lỗi thật (hết lượt thử) sẽ đến qua turn.failed hoặc mã thoát khác 0.
        if (!isReconnectNotice(ev)) st.error = { kind: "other", message: errMessage(ev, "codex báo lỗi") };
        return undefined;
      default:
        return undefined;
    }
  },
};

function isReconnectNotice(ev: Record<string, any>): boolean {
  const t = typeof ev.message === "string" ? ev.message : typeof ev.error?.message === "string" ? ev.error.message : "";
  return /^\s*Reconnecting\.{3}\s*\d+\s*\/\s*\d+/i.test(t);
}

function appendText(st: ParseState, t: string, whole: boolean): string | undefined {
  if (whole && st.sawDelta) return undefined; // đã nhận từng đoạn
  if (!whole) st.sawDelta = true;
  st.text += t;
  return t;
}
