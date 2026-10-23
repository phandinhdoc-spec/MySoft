import fs from "node:fs";
import path from "node:path";
import type { Effort, ModelChoice, PermissionLevel, WritingMode } from "@pvta/shared";
import type { ApiSettings } from "./api.js";
import { paths } from "./paths.js";

/** Cấu hình lưu theo người dùng (đặc tả mục 5: lựa chọn quyền được lưu). */
export interface Config {
  permission?: PermissionLevel;
  model?: ModelChoice | "auto";
  effort?: Effort;
  /** Chế độ viết và nhiệt độ tự chỉnh (null = theo chế độ). */
  mode?: WritingMode;
  temperature?: number | null;
  /** Học nền từ thói quen và lời khen chê (mặc định bật). */
  learn?: { enabled?: boolean };
  /** Gợi ý thông minh cho tệp đang mở (mặc định bật; chỉ chạy khi mở khung hoặc đổi tệp, không chạy liên tục). */
  hints?: { enabled?: boolean };
  /** Chỉ bật lại biến khóa API khi người dùng đặt cờ rõ ràng. */
  allowApiKeys?: boolean;
  port?: number;
  /** Origin được phép kết nối WebSocket (add-in). */
  allowedOrigins?: string[];
  /** RAG từ tệp đang mở (mặc định bật). */
  rag?: { enabled?: boolean };
  /** Chế độ iPad: bật máy chủ trong mạng nội bộ và mã ghép nối của manifest iPad. */
  ipad?: { enabled?: boolean; token?: string };
  /** Khóa API người dùng tự nhập (tệp config.json chỉ chủ máy đọc được). */
  api?: ApiSettings;
}

export const DEFAULT_PORT = 52731;
export const DEFAULT_ORIGINS = ["https://localhost:3000", "https://localhost:52730"];

export class ConfigStore {
  private data: Config = {};
  constructor(private file: string = paths.config()) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf8")) as Config;
    } catch {
      this.data = {};
    }
  }
  get(): Readonly<Config> {
    return this.data;
  }
  set(patch: Partial<Config>): void {
    this.data = { ...this.data, ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Có thể chứa khóa API: chỉ chủ tài khoản đọc/ghi được.
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      /* Windows: quyền theo thư mục người dùng */
    }
  }
}
