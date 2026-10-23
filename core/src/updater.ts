import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cập nhật PVTA tại chỗ: so phiên bản với install/latest.json trên GitHub, tải install/pvta.tar.gz,
 * kiểm tra sha256, giải nén ra thư mục tạm, rồi đổi chỗ với thư mục app (giữ bản cũ ở app.old).
 * Chỉ chạy khi thầy cô bấm "Cập nhật". Dữ liệu (cấu hình, hội thoại, skill) nằm ngoài thư mục app nên không mất.
 */

// One official release repository for Chat and Office.
export const REPO = "phandinhdoc-spec/MySoft";
export const LATEST_URL = `https://github.com/${REPO}/releases/latest/download/office-latest.json`;
export const TARBALL_URL = `https://github.com/${REPO}/releases/latest/download/pvta-office.tar.gz`;
const MAX_TARBALL = 120 * 1024 * 1024;
const VER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export interface LatestInfo {
  version: string;
  sha256: string;
  notes: string;
}

/** So sánh x.y.z: âm nếu a < b, 0 nếu bằng, dương nếu a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function parseLatest(text: string): LatestInfo | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.version !== "string" || !VER_RE.test(j.version)) return null;
    if (typeof j.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(j.sha256)) return null;
    return { version: j.version, sha256: j.sha256, notes: typeof j.notes === "string" ? j.notes.slice(0, 600) : "" };
  } catch {
    return null;
  }
}

export interface AppInfo {
  appDir: string;
  version: string;
}

/**
 * Thư mục app và phiên bản đang chạy. Chỉ có khi chạy từ bản đã cài (có pvta-bridge.mjs và VERSION cạnh nhau);
 * chạy từ mã nguồn (npm run bridge) thì không tự cập nhật.
 */
export function detectApp(env: NodeJS.ProcessEnv = process.env, metaUrl: string = import.meta.url): AppInfo | undefined {
  let dir = env.PVTA_APP_DIR;
  if (!dir) {
    try {
      const file = fileURLToPath(metaUrl);
      if (path.basename(file) === "pvta-bridge.mjs") dir = path.dirname(file);
    } catch {
      /* không xác định được */
    }
  }
  if (!dir) return undefined;
  try {
    const version = fs.readFileSync(path.join(dir, "VERSION"), "utf8").trim();
    return VER_RE.test(version) ? { appDir: dir, version } : undefined;
  } catch {
    return undefined;
  }
}

type Fetch = typeof fetch;

export async function fetchLatest(fetchFn: Fetch = fetch, url = LATEST_URL): Promise<LatestInfo> {
  let res: Response;
  try {
    res = await fetchFn(`${url}?t=${Date.now()}`, { headers: { "User-Agent": "PVTA-Office", "Cache-Control": "no-cache" } });
  } catch {
    throw new Error("Không kết nối được tới GitHub để kiểm tra bản mới.");
  }
  if (!res.ok) throw new Error(`Chưa lấy được thông tin bản mới (mã ${res.status}).`);
  const info = parseLatest(await res.text());
  if (!info) throw new Error("Thông tin bản mới không hợp lệ.");
  return info;
}

async function download(fetchFn: Fetch, url: string, dest: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchFn(`${url}?t=${Date.now()}`, { headers: { "User-Agent": "PVTA-Office", "Cache-Control": "no-cache" } });
  } catch {
    throw new Error("Không tải được bản mới. Kiểm tra mạng rồi thử lại.");
  }
  if (!res.ok) throw new Error(`Không tải được bản mới (mã ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_TARBALL || buf.length < 1000) throw new Error("Tệp bản mới có kích thước bất thường.");
  fs.writeFileSync(dest, buf);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function extract(tgz: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("tar", ["-xzf", tgz, "-C", into, "--strip-components=1"], { stdio: "ignore", windowsHide: true });
    p.on("error", () => reject(new Error("Máy không có lệnh tar để giải nén bản mới.")));
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Giải nén bản mới không thành công."))));
  });
}

export interface ApplyOptions {
  app: AppInfo;
  latest: LatestInfo;
  fetchFn?: Fetch;
  tarballUrl?: string;
  /** Thay bước giải nén (kiểm thử). */
  extractFn?: (tgz: string, into: string) => Promise<void>;
}

/**
 * Tải, kiểm tra và đổi chỗ thư mục app. Lỗi ở bất kỳ bước nào đều để nguyên bản đang chạy.
 * Sau khi xong, nơi gọi phải khởi động lại bridge để chạy mã mới.
 */
export async function applyUpdate(o: ApplyOptions): Promise<void> {
  const { appDir } = o.app;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-update-"));
  const stage = `${appDir}.new`;
  const backup = `${appDir}.old`;
  try {
    const tgz = path.join(tmp, "pvta.tar.gz");
    const sum = await download(o.fetchFn ?? fetch, o.tarballUrl ?? TARBALL_URL, tgz);
    if (sum !== o.latest.sha256) {
      // Thường do GitHub còn lưu đệm bản cũ vài phút sau khi phát hành.
      throw new Error("Bản tải về chưa khớp mã kiểm tra (GitHub có thể còn lưu đệm). Thử lại sau vài phút.");
    }
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    await (o.extractFn ?? extract)(tgz, stage);
    if (!fs.existsSync(path.join(stage, "pvta-bridge.mjs")) || !fs.existsSync(path.join(stage, "web", "index.html"))) {
      throw new Error("Bản mới thiếu tệp cần thiết.");
    }
    const v = fs.readFileSync(path.join(stage, "VERSION"), "utf8").trim();
    if (v !== o.latest.version) throw new Error(`Bản tải về là ${v}, không phải ${o.latest.version}.`);
    fs.rmSync(backup, { recursive: true, force: true });
    try {
      fs.renameSync(appDir, backup);
    } catch {
      throw new Error("Không thay được thư mục PVTA đang chạy. Hãy chạy lại lệnh cài PVTA.");
    }
    try {
      fs.renameSync(stage, appDir);
    } catch {
      fs.renameSync(backup, appDir); // hoàn lại bản cũ
      throw new Error("Không đặt được bản mới. Đã giữ nguyên bản cũ.");
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Chạy lại bridge để dùng mã mới. macOS: launchd (KeepAlive) tự chạy lại khi tiến trình thoát.
 * Windows: không có trình giám sát, nên bật sẵn một bản mới tách rời rồi mới thoát.
 */
export function relaunch(app: AppInfo, env: NodeJS.ProcessEnv = process.env, exit: () => void = () => process.exit(0)): void {
  if (process.platform === "win32") {
    const child = spawn(process.execPath, [path.join(app.appDir, "pvta-bridge.mjs")], { detached: true, stdio: "ignore", env, windowsHide: true });
    child.unref();
  }
  exit();
}

export interface InstallerCommand {
  /** Lệnh hiển thị cho thầy cô (cũng là lệnh có thể tự dán vào Terminal / PowerShell). */
  display: string;
  file: string;
  args: string[];
}

/**
 * Lệnh cài đặt từ GitHub, khác nhau theo hệ điều hành: macOS chạy install.sh bằng bash, Windows chạy install.ps1 bằng PowerShell.
 * Địa chỉ cố định vào kho của PVTA (nhánh main), không nhận giá trị từ tin nhắn hay từ nội dung bên ngoài.
 */
export function installerCommand(platform: NodeJS.Platform = process.platform): InstallerCommand | undefined {
  if (platform === "win32") {
    const display = `irm https://raw.githubusercontent.com/${REPO}/main/installers/studio.ps1 | iex`;
    return { display, file: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", display] };
  }
  if (platform === "darwin") {
    const display = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/installers/studio.sh | bash`;
    return { display, file: "/bin/bash", args: ["-c", display] };
  }
  return undefined;
}

export type SpawnFn = typeof spawn;

/**
 * Chạy lệnh cài đặt tách rời khỏi bridge: script sẽ tự dừng bridge đang chạy, thay bản mới rồi bật lại.
 * Không hỏi gì giữa chừng (không cửa sổ chọn công cụ AI, không menu): PVTA_INSTALL_CLI=none, PVTA_NO_GUI=1.
 * Ghi nhật ký vào logFile. Gọi onFail nếu lệnh không chạy được hoặc kết thúc với mã lỗi.
 */
export function runInstaller(o: { logFile: string; platform?: NodeJS.Platform; spawnFn?: SpawnFn; onFail: (msg: string) => void }): boolean {
  const cmd = installerCommand(o.platform);
  if (!cmd) return false;
  let fd: number | "ignore" = "ignore";
  try {
    fs.mkdirSync(path.dirname(o.logFile), { recursive: true });
    fd = fs.openSync(o.logFile, "a");
  } catch {
    /* không ghi được nhật ký thì vẫn chạy */
  }
  const env = { ...process.env, PVTA_INSTALL_CLI: "none", PVTA_NO_GUI: "1" };
  try {
    const child = (o.spawnFn ?? spawn)(cmd.file, cmd.args, { detached: true, stdio: ["ignore", fd, fd], env, windowsHide: true });
    child.on("error", () => o.onFail("Không chạy được lệnh cài đặt. Hãy dán lệnh vào Terminal (macOS) hoặc PowerShell (Windows)."));
    child.on("exit", (code) => {
      if (code !== 0 && code !== null) o.onFail(`Lệnh cài đặt báo lỗi (mã ${code}). Xem tệp update.log trong thư mục dữ liệu của PVTA.`);
    });
    child.unref();
    return true;
  } catch {
    o.onFail("Không chạy được lệnh cài đặt.");
    return false;
  } finally {
    if (typeof fd === "number") {
      try {
        fs.closeSync(fd);
      } catch {
        /* đã đóng */
      }
    }
  }
}
