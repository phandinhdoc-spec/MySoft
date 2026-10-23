import type { CliBackendId, Effort, ErrorKind, PermissionLevel } from "@pvta/shared";

/** Một đối số dòng lệnh; `value` đi kèm cờ và bị bỏ theo khi cờ bị bỏ. */
export interface Arg {
  flag: string;
  value?: string;
  /** Cờ bắt buộc: không bao giờ bị bỏ khi thích ứng phiên bản. */
  essential?: boolean;
}

export interface InvokeOptions {
  model: string;
  prompt: string;
  conversationId?: string;
  permission: PermissionLevel;
  /**
   * Chỉ chế độ Chỉnh sửa của PVTA desktop và nút quy trình được bật: cho CLI ghi tệp/chạy lệnh trong cwd.
   * Tách khỏi `permission` (mức "full" của add-in Office vẫn chỉ đọc ở phía CLI).
   */
  workspaceWrite?: boolean;
  /** Mức suy nghĩ (chỉ truyền mức model hỗ trợ: add-in đã chọn theo danh sách của model). */
  effort?: Effort;
  /** Chế độ Nhanh: mã bậc tốc độ từ danh mục model (codex "priority"/"fast", claude "fast"). */
  speed?: string;
  /** Đầu ra văn bản thuần (khi không đọc được stream-json). */
  plain?: boolean;
  /** Lời nhắc hệ thống riêng (quy tắc cố định), nếu backend nhận được. */
  system?: string;
  /**
   * Ảnh cho model xem (đường dẫn tuyệt đối, nằm trong thư mục làm việc). claude: bật riêng công cụ Read;
   * codex: cờ --image; agy: tự mở tệp bằng công cụ đọc của nó (prompt ghi đường dẫn).
   */
  images?: string[];
  /**
   * Kết nối MCP của chính CLI (Google, Canva…). Mặc định tắt: không truyền = hành vi cũ.
   * Hiện chỉ claude dùng; PVTA không tự làm MCP client, chỉ quyết định có mở đường hay không.
   */
  mcp?: {
    enabled: boolean;
    /** Công cụ MCP được phép (claude: dạng `mcp__<server>__<tool>`). Rỗng = không công cụ nào được duyệt. */
    allowedTools?: string[];
  };
}

export interface Invocation {
  bin: string;
  args: Arg[];
  /** Nội dung gửi qua stdin (claude). */
  stdin?: string;
}

/** Trạng thái phân tích luồng sự kiện của một lượt gọi. */
export interface ParseState {
  text: string;
  conversationId?: string;
  sawDelta: boolean;
  resultText?: string;
  denied: unknown[];
  error?: { kind: ErrorKind; message: string };
  gotEvent: boolean;
  status?: string;
  /** codex: chữ đã nhận của từng mục, để chỉ truyền phần mới. */
  items?: Map<string, string>;
}

export function newParseState(): ParseState {
  return { text: "", sawDelta: false, denied: [], gotEvent: false };
}

export interface Backend {
  id: CliBackendId;
  /** Biến môi trường thêm cho tiến trình CLI (tắt việc phụ để khởi động nhanh). */
  env?: Record<string, string>;
  /** Các lệnh help để dò cờ (mặc định [["--help"]]). */
  helpArgs?: string[][];
  /** Tên lệnh mặc định, có thể ghi đè bằng biến môi trường. */
  defaultBin: string;
  envVar: string;
  invocation(opts: InvokeOptions): Invocation;
  /** Phân tích một dòng JSON; trả về đoạn chữ mới (nếu có) để truyền ra giao diện. */
  parseLine(line: string, state: ParseState): string | undefined;
}

export function resolveBin(backend: Backend, env: NodeJS.ProcessEnv = process.env): string {
  return env[backend.envVar] || backend.defaultBin;
}

export function safeJson(line: string): Record<string, any> | undefined {
  const t = line.trim();
  if (!t.startsWith("{")) return undefined;
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" ? (v as Record<string, any>) : undefined;
  } catch {
    return undefined;
  }
}
