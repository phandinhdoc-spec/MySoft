import { TOOL_CATALOG } from "./catalog.js";
import type { ToolCall } from "./protocol.js";

const FENCE = /```office-tool[ \t]*\r?\n([\s\S]*?)```/g;

export interface ParsedReply {
  /** Văn bản hiển thị cho người dùng (đã bỏ các khối office-tool). */
  text: string;
  calls: ToolCall[];
  /** Khối có JSON lỗi, để báo lại cho model sửa. */
  invalid: string[];
}

/**
 * Tách các khối ```office-tool``` khỏi câu trả lời của model.
 * Mỗi khối là một đối tượng JSON {tool, args} hoặc một mảng các đối tượng
 * (gộp nhiều thao tác trong một khối để giảm số vòng gọi).
 */
export function parseToolBlocks(reply: string): ParsedReply {
  const calls: ToolCall[] = [];
  const invalid: string[] = [];
  const text = reply
    .replace(FENCE, (_m, body: string) => {
      try {
        const parsed: unknown = JSON.parse(body.trim());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if (it && typeof it === "object" && typeof (it as ToolCall).tool === "string") {
            const args = (it as ToolCall).args;
            calls.push({ tool: (it as ToolCall).tool, args: args && typeof args === "object" ? args : {} });
          } else {
            invalid.push(body.trim().slice(0, 200));
          }
        }
      } catch {
        invalid.push(body.trim().slice(0, 200));
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, calls, invalid };
}

const OPEN = "```office-tool";

/**
 * Bộ lọc luồng: ẩn các khối office-tool khỏi chữ hiển thị khi model đang sinh
 * (chunk có thể cắt ngang dấu rào). Gọi push() cho mỗi chunk, flush() ở cuối.
 */
export class ToolFenceFilter {
  private buf = "";
  private inFence = false;

  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    for (;;) {
      if (!this.inFence) {
        const i = this.buf.indexOf(OPEN);
        if (i >= 0) {
          out += this.buf.slice(0, i);
          this.buf = this.buf.slice(i + OPEN.length);
          this.inFence = true;
          continue;
        }
        // giữ lại phần đuôi có thể là đầu của dấu rào
        let keep = 0;
        for (let k = Math.min(OPEN.length - 1, this.buf.length); k > 0; k--) {
          if (OPEN.startsWith(this.buf.slice(this.buf.length - k))) {
            keep = k;
            break;
          }
        }
        out += this.buf.slice(0, this.buf.length - keep);
        this.buf = this.buf.slice(this.buf.length - keep);
        return out;
      }
      const j = this.buf.indexOf("```");
      if (j >= 0) {
        this.buf = this.buf.slice(j + 3);
        this.inFence = false;
        continue;
      }
      this.buf = this.buf.slice(Math.max(0, this.buf.length - 2));
      return out;
    }
  }

  flush(): string {
    const rest = this.inFence ? "" : this.buf;
    this.buf = "";
    this.inFence = false;
    return rest;
  }
}

/** Công cụ cục bộ (chạy trong bridge), lấy từ danh mục để không phải khai báo hai nơi. */
const LOCAL_TOOLS = new Set(TOOL_CATALOG.filter((t) => t.host === "local").map((t) => t.name));

export function isLocalTool(tool: string): boolean {
  return LOCAL_TOOLS.has(tool);
}

/** Công cụ đọc: tên chứa _get_ hoặc _list_, hoặc công cụ cục bộ (đặc tả mục 5). */
export function isReadTool(tool: string): boolean {
  if (LOCAL_TOOLS.has(tool)) return true;
  return tool.includes("_get_") || tool.includes("_list_");
}

export function isWriteTool(tool: string): boolean {
  return !isReadTool(tool);
}
