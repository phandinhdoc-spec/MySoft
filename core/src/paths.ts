import os from "node:os";
import path from "node:path";

/** Thư mục gốc dữ liệu của PVTA. Ghi đè bằng PVTA_HOME (dùng cho kiểm thử). */
export function pvtaHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.PVTA_HOME ?? path.join(os.homedir(), ".phananh-office");
}

export const paths = {
  workspace: (home = pvtaHome()) => path.join(home, "workspace"),
  skills: (home = pvtaHome()) => path.join(home, "skills"),
  config: (home = pvtaHome()) => path.join(home, "config.json"),
  probe: (home = pvtaHome()) => path.join(home, "probe.json"),
  learnQueue: (home = pvtaHome()) => path.join(home, "learn-queue.json"),
  learnState: (home = pvtaHome()) => path.join(home, "learn-state.json"),
  style: (home = pvtaHome()) => path.join(home, "style.md"),
  /** Thư viện lời nhắc riêng của người dùng và mục yêu thích. */
  prompts: (home = pvtaHome()) => path.join(home, "prompts.json"),
  /** Chế độ viết người dùng tự tạo (tách khỏi config.json của model). */
  modes: (home = pvtaHome()) => path.join(home, "modes.json"),
  /** Hội thoại, dự án và quy tắc chung: chats.json (danh mục) và chats/<id>.json (tin nhắn). */
  chats: (home = pvtaHome()) => path.join(home, "chats.json"),
  /** Tệp thầy cô đính kèm vào hội thoại (c-<id>.json) hoặc dự án (p-<id>.json): đã trích chữ. */
  files: (home = pvtaHome()) => path.join(home, "files"),
  chatDir: (home = pvtaHome()) => path.join(home, "chats"),
  /** Thư mục làm việc riêng cho học nền (tách khỏi workspace/ của các phiên). */
  learnCwd: (home = pvtaHome()) => path.join(home, "learn"),
  /** Thư mục làm việc riêng cho gợi ý thông minh chạy nền: tách khỏi workspace/ của phiên chính và khỏi learn/, để hai tiến trình CLI không dùng chung thư mục. */
  hintCwd: (home = pvtaHome()) => path.join(home, "hint"),
};

/**
 * Thêm các thư mục cài CLI thường gặp vào PATH. Bridge chạy nền khi đăng nhập (launchd / Startup)
 * nên không có PATH của shell: thiếu bước này thì claude/codex/agy đã cài vẫn bị coi là "chưa cài".
 */
export function augmentPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): void {
  const home = os.homedir();
  const sep = platform === "win32" ? ";" : ":";
  const key = platform === "win32" ? (Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "Path") : "PATH";
  const cur = (env[key] ?? "").split(sep).filter(Boolean);
  const extra =
    platform === "win32"
      ? [
          env.APPDATA && path.win32.join(env.APPDATA, "npm"),
          env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "agy", "bin"),
          path.win32.join(home, ".local", "bin"),
          env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Programs", "antigravity", "bin"),
        ]
      : [
          path.join(home, ".local", "bin"),
          path.join(home, ".claude", "local"),
          path.join(home, ".npm-global", "bin"),
          path.join(home, ".antigravity", "bin"),
          path.join(home, ".bun", "bin"),
          path.join(home, ".volta", "bin"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
        ];
  const add = extra.filter((d): d is string => !!d && !cur.includes(d));
  if (add.length) env[key] = [...cur, ...add].join(sep);
}
