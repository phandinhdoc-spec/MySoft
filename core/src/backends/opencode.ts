import type { Backend, InvokeOptions, Invocation, ParseState } from "./types.js";
import { safeJson } from "./types.js";

function errText(e: unknown, fallback: string): string {
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, any>;
    const m = o.data?.message ?? o.message ?? o.name;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/**
 * Backend `opencode` (OpenCode CLI, chạy `opencode run --format json`):
 * - Mỗi dòng là một sự kiện: step_start → text (part.text là toàn văn đoạn đã xong) → tool_use → step_finish / error.
 * - `--auto` luôn bật: tự duyệt mọi quyền chưa bị từ chối, không hỏi người dùng.
 *   Chế độ không phải Chỉnh sửa thêm `--agent plan` (agent chỉ đọc, cấm sửa tệp).
 * - `--standalone`: máy chủ riêng cho mỗi lượt, không đụng dịch vụ nền của người dùng.
 * - Tiếp tục hội thoại bằng `--session <sessionID>`.
 * - Prompt đi qua stdin: opencode nhận nội dung từ stdin khi không có đối số message (tránh ENAMETOOLONG).
 * - Model dạng `nhà-cung-cấp/model`; "default" = để opencode dùng model đã cấu hình.
 */
export const opencodeBackend: Backend = {
  id: "opencode",
  defaultBin: "opencode",
  envVar: "PVTA_OPENCODE_BIN",
  helpArgs: [["run", "--help"]],

  invocation(opts: InvokeOptions): Invocation {
    const args: Invocation["args"] = [{ flag: "run", essential: true }, { flag: "--standalone", essential: true }];
    if (!opts.plain) args.push({ flag: "--format", value: "json", essential: true });
    // Luôn --auto: không bao giờ dừng hỏi quyền (chạy không giao diện nên hộp hỏi sẽ treo lượt).
    args.push({ flag: "--auto", essential: true });
    // Chế độ chỉ đọc vẫn dùng agent plan: nó CẤM sửa tệp (deny), --auto không vượt được lệnh cấm.
    if (opts.workspaceWrite !== true) args.push({ flag: "--agent", value: "plan", essential: true });
    if (opts.model && opts.model !== "default") args.push({ flag: "--model", value: opts.model, essential: true });
    if (opts.conversationId) args.push({ flag: "--session", value: opts.conversationId, essential: true });
    for (const img of opts.images ?? []) args.push({ flag: "--file", value: img, essential: true });
    return { bin: "", args, stdin: opts.prompt };
  },

  parseLine(line: string, st: ParseState): string | undefined {
    const ev = safeJson(line);
    if (!ev) return undefined;
    st.gotEvent = true;
    const sid = ev.sessionID ?? ev.part?.sessionID;
    if (typeof sid === "string" && sid) st.conversationId = sid;
    switch (ev.type) {
      case "text": {
        const t = ev.part?.text;
        if (typeof t !== "string" || !t) return undefined;
        const id = String(ev.part?.id ?? "");
        const prev = st.items?.get(id) ?? "";
        (st.items ??= new Map()).set(id, t);
        // Cùng một đoạn được gửi lại đầy đủ: chỉ truyền phần mới. Đoạn mới: ngăn cách với đoạn trước.
        if (!t.startsWith(prev)) return undefined;
        const add = t.slice(prev.length);
        if (!add) return undefined;
        const sep = prev === "" && st.text ? "\n\n" : "";
        st.text += sep + add;
        return sep + add;
      }
      case "error":
        st.error = { kind: "other", message: errText(ev.error ?? ev.part?.error ?? ev, "opencode báo lỗi") };
        return undefined;
      default:
        return undefined;
    }
  },
};
