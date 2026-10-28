import type { Backend, InvokeOptions, Invocation, ParseState } from "./types.js";
import { safeJson } from "./types.js";

/** agy --effort nhận low|medium|high|xhigh|max (theo `agy --help`); "ultra" của codex quy về max. */
export function agyEffort(effort: string | undefined): "low" | "medium" | "high" | "xhigh" | "max" | undefined {
  if (!effort) return undefined;
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max") return effort;
  return "max";
}

/** Mã model đã mang sẵn mức suy nghĩ (vd gemini-3.8-flash-high): không thêm --effort nữa. */
export function slugHasEffort(model: string): boolean {
  return /-(low|medium|high)$/i.test(model);
}

function errText(e: unknown, fallback: string): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as Record<string, unknown>).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(e);
    } catch {
      /* bỏ qua */
    }
  }
  return fallback;
}

/**
 * Backend `agy` (Antigravity CLI, stream-json qua stdin), theo tài liệu chính thức:
 * - `--output-format stream-json`: init → step_update… → result.
 * - `--effort low|medium|high`; mã model có hậu tố -low/-medium/-high thì đã gồm mức suy nghĩ.
 * - Luôn dùng `--dangerously-skip-permissions` theo cấu hình AGY của PVTA:
 *   AGY tự duyệt mọi công cụ; hỏi đáp/duyệt Plan và Plan Pro do PVTA quản lý.
 * - Mỗi dòng stdin là một sự kiện user; đóng stdin sau lượt cuối để CLI thoát.
 *   Không truyền -p trong chế độ này: AGY sẽ bỏ qua prompt trong đối số.
 */
export const agyBackend: Backend = {
  id: "agy",
  defaultBin: "agy",
  envVar: "PVTA_AGY_BIN",

  invocation(opts: InvokeOptions): Invocation {
    const args: Invocation["args"] = [
      { flag: "--input-format", value: "stream-json", essential: true },
      { flag: "--output-format", value: "stream-json", essential: true },
      { flag: "--dangerously-skip-permissions", essential: true },
    ];
    if (opts.model) args.push({ flag: "--model", value: opts.model, essential: true });
    for (const dir of opts.workspaceDirs ?? []) args.push({ flag: "--add-dir", value: dir, essential: true });
    if (opts.conversationId) args.push({ flag: "--conversation", value: opts.conversationId, essential: true });
    const eff = agyEffort(opts.effort);
    if (eff && !slugHasEffort(opts.model)) args.push({ flag: "--effort", value: eff });
    args.push({ flag: "--print-timeout", value: "15m" });
    args.push({ flag: "--disable-slash-commands" });
    return { bin: "", args, stdin: JSON.stringify({ event: "user", message: { content: opts.prompt } }) + "\n" };
  },

  parseLine(line: string, st: ParseState): string | undefined {
    const ev = safeJson(line);
    if (!ev) return undefined;
    st.gotEvent = true;
    // Định dạng thật của agy 1.3.x: {"event":"step_update","step_update":{…}} (tên sự kiện ở `event`,
    // dữ liệu lồng trong khóa cùng tên). Vẫn đọc dạng phẳng {"type":…} của bản cũ / tài liệu.
    const kind = typeof ev.event === "string" ? ev.event : typeof ev.type === "string" ? ev.type : "";
    const nested = ev[kind];
    const p: Record<string, any> = nested && typeof nested === "object" ? nested : ev;
    const cid = p.conversation_id ?? p.conversationId ?? ev.conversation_id ?? ev.conversationId;
    if (typeof cid === "string" && cid) st.conversationId = cid;
    switch (kind) {
      case "step_update": {
        // Chỉ lấy lời của trợ lý; bỏ qua bước gọi công cụ, suy nghĩ…
        const stepType = p.step_type ?? p.step?.step_type;
        if (typeof stepType === "string" && stepType.toLowerCase() !== "agent_response") return undefined;
        const delta = p.text_delta ?? p.agent_response?.text_delta ?? p.step?.agent_response?.text_delta;
        if (typeof delta === "string" && delta) {
          st.sawDelta = true;
          st.text += delta;
          return delta;
        }
        return undefined;
      }
      case "result": {
        const resp = p.response ?? p.text ?? p.final_response;
        if (typeof resp === "string") st.resultText = resp;
        const denied = p.denied_actions ?? ev.denied_actions;
        if (Array.isArray(denied) && denied.length > 0) st.denied = denied;
        const rawStatus = p.status ?? p.state;
        const status = typeof rawStatus === "string" ? rawStatus.toUpperCase() : undefined;
        if (status) st.status = status;
        if (status === "ERROR" || status === "INVALID" || status === "CANCELED" || status === "CANCELLED" || status === "INTERRUPTED" || status === "FAILED") {
          st.error = { kind: "other", message: errText(p.error ?? ev.error, String(resp || status)) };
        } else if (status === "WAITING" && !resp && st.denied.length === 0) {
          // Đang chờ cấp quyền mà không có lời nào: coi như bị từ chối.
          st.denied = [{ reason: "waiting_for_permission" }];
        }
        return undefined;
      }
      case "error": {
        st.error = { kind: "other", message: errText(p.error ?? p.message ?? ev.error ?? ev.message, "agy báo lỗi") };
        return undefined;
      }
      default:
        return undefined;
    }
  },
};
