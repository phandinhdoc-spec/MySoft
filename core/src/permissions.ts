import { isReadTool, type PermissionLevel, type ToolCall } from "@pvta/shared";

export type Decision = "allow" | "deny" | "ask";

export interface DecideOptions {
  /** Lời gọi đến từ bên ngoài qua HTTP: chỉ chạy được ở mức toàn quyền (không có chỗ để hỏi). */
  external?: boolean;
}

/**
 * Quyết định cho một lời gọi công cụ (đặc tả mục 5).
 * level = null nghĩa là người dùng chưa trả lời hộp thoại: xử lý như "ask".
 */
export function decide(level: PermissionLevel | null, call: ToolCall, opts: DecideOptions = {}): Decision {
  const effective: PermissionLevel = level ?? "ask";
  if (opts.external) {
    return effective === "full" ? "allow" : "deny";
  }
  if (isReadTool(call.tool)) return "allow";
  switch (effective) {
    case "read":
      return "deny";
    case "ask":
      return "ask";
    case "full":
      return "allow";
  }
}

export const DENY_MESSAGES = {
  read: "Chế độ chỉ đọc: không được phép thay đổi văn bản.",
  declined: "Người dùng đã từ chối thay đổi này.",
  timeout: "Hết thời gian chờ người dùng đồng ý (300 giây), đã bỏ qua thay đổi này.",
  external: "Lời gọi từ bên ngoài chỉ được chạy ở mức Toàn quyền.",
} as const;
