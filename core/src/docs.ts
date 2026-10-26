import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/** Các đuôi tệp văn bản thuần — nên mở bằng editor thay vì app mặc định của OS. */
const TEXT_EXTS = new Set([".md", ".txt", ".csv", ".typ"]);

/**
 * Tìm đường dẫn thực thi của Visual Studio Code trên macOS.
 * Trả về lệnh mở phù hợp nếu tìm thấy, ngược lại trả về undefined.
 */
function vscodeAppPath(): string | undefined {
  const home = process.env.HOME ?? "";
  const candidates = [
    "/Applications/Visual Studio Code.app",
    `${home}/Applications/Visual Studio Code.app`,
    "/Applications/Visual Studio Code - Insiders.app",
    `${home}/Applications/Visual Studio Code - Insiders.app`,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Tìm đường dẫn CLI `code` trên macOS/Linux.
 */
function vscodeCli(): string | undefined {
  const candidates = [
    "/usr/local/bin/code",
    "/usr/bin/code",
    `${process.env.HOME ?? ""}/.local/bin/code`,
    "/opt/homebrew/bin/code",
  ];
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p; } catch { /* không có */ }
  }
  return undefined;
}

/**
 * Mở tệp văn bản (.md/.txt/.csv/.typ) bằng VS Code nếu có,
 * fallback sang Antigravity IDE hoặc TextEdit trên macOS.
 */
function openTextFile(file: string, platform: NodeJS.Platform, open: Opener): void {
  if (platform === "darwin") {
    const appPath = vscodeAppPath();
    if (appPath) {
      open("open", ["-a", appPath, file]);
      return;
    }
    // Fallback: Antigravity IDE (nếu đã cài)
    const agy = "/Applications/Antigravity.app";
    if (fs.existsSync(agy)) { open("open", ["-a", agy, file]); return; }
    // Fallback cuối: TextEdit (có sẵn trên macOS)
    open("open", ["-e", file]);
  } else if (platform === "win32") {
    // Thử dùng code.cmd trên Windows
    const codeCmds = ["code.cmd", "code"];
    let opened = false;
    for (const cmd of codeCmds) {
      try {
        const child = spawn(cmd, [file], { detached: true, stdio: "ignore", windowsHide: true, shell: true });
        child.on("error", () => undefined);
        child.unref();
        opened = true;
        break;
      } catch { /* tiếp tục */ }
    }
    if (!opened) open("notepad.exe", [file]);
  } else {
    // Linux: thử code rồi fallback xdg-open
    const cli = vscodeCli();
    if (cli) { open(cli, [file]); return; }
    open("xdg-open", [file]);
  }
}

/** Tệp Office mà PVTA được phép nhờ hệ điều hành mở (chỉ khi người dùng đồng ý từng lần). */
const OPENABLE = new Set([".docx", ".doc", ".docm", ".dotx", ".xlsx", ".xls", ".xlsm", ".xltx", ".pptx", ".ppt", ".pptm", ".potx"]);

export type Opener = (command: string, args: string[]) => void;

const defaultOpener: Opener = (command, args) => {
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
};

/** Kiểm tra đường dẫn: tuyệt đối, là tệp có thật, đúng loại Office. Trả về lý do nếu không mở được. */
export function checkOpenable(p: unknown): { ok: true; file: string } | { ok: false; error: string } {
  if (typeof p !== "string" || !p.trim()) return { ok: false, error: "Thiếu đường dẫn tệp: args {path: '/đường/dẫn/tệp.docx'}." };
  const raw = p.trim();
  if (raw.length > 1000 || /[\u0000-\u001f]/.test(raw)) return { ok: false, error: "Đường dẫn không hợp lệ." };
  if (!path.isAbsolute(raw)) return { ok: false, error: "Cần đường dẫn đầy đủ (tuyệt đối) của tệp." };
  const file = path.normalize(raw);
  const ext = path.extname(file).toLowerCase();
  if (!OPENABLE.has(ext)) return { ok: false, error: `Chỉ mở tệp Word, Excel, PowerPoint (${[...OPENABLE].join(" ")}).` };
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { ok: false, error: "Không thấy tệp này trên máy." };
  }
  if (!st.isFile()) return { ok: false, error: "Đường dẫn này không phải là tệp." };
  return { ok: true, file };
}

/** Nhờ hệ điều hành mở tệp bằng ứng dụng mặc định (Word/Excel/PowerPoint). Không chạy lệnh nào do người khác đặt: chỉ mở tệp. */
export function openOffice(p: unknown, opts: { platform?: NodeJS.Platform; opener?: Opener } = {}): { ok: true; file: string } | { ok: false; error: string } {
  const c = checkOpenable(p);
  if (!c.ok) return c;
  const platform = opts.platform ?? process.platform;
  const open = opts.opener ?? defaultOpener;
  try {
    if (platform === "darwin") open("open", [c.file]);
    else if (platform === "win32") open("explorer.exe", [c.file]);
    else open("xdg-open", [c.file]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, file: c.file };
}

/** Tên hiển thị của tệp đang mở trong Office (chỉ tên tệp, không lộ đường dẫn đầy đủ). */
export function docDisplayName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return s || undefined;
}


const RESULT_OPENABLE = new Set([
  ".docx", ".doc", ".docm", ".dotx",
  ".xlsx", ".xls", ".xlsm", ".xltx",
  ".pptx", ".ppt", ".pptm", ".potx",
  ".pdf", ".zip", ".md", ".txt", ".csv", ".typ",
  ".png", ".jpg", ".jpeg", ".webp",
]);

/** Ứng dụng người dùng chọn để mở tệp: mặc định của hệ điều hành, CHITUP OFFICE hoặc Visual Studio Code. */
export type OpenApp = "default" | "chitup" | "vscode";
const CHITUP_EXTS = new Set([".docx", ".doc", ".docm", ".dotx", ".xlsx", ".xls", ".xlsm", ".xltx", ".pptx", ".ppt", ".pptm", ".potx", ".pdf"]);

export function normalizeOpenApp(v: unknown): OpenApp {
  return v === "chitup" || v === "vscode" ? v : "default";
}

function chitupAppPath(): string | undefined {
  const home = process.env.HOME ?? "";
  for (const p of ["/Applications/CHITUP OFFICE.app", `${home}/Applications/CHITUP OFFICE.app`]) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** Mở tệp bằng đúng ứng dụng được chọn; trả về lỗi dễ hiểu nếu ứng dụng chưa cài. */
function openWithApp(app: OpenApp, file: string, ext: string, platform: NodeJS.Platform, open: Opener): void {
  if (app === "chitup") {
    if (!CHITUP_EXTS.has(ext)) throw new Error("CHITUP OFFICE chỉ mở tệp Word, Excel, PowerPoint và PDF.");
    if (platform !== "darwin") throw new Error("Mở bằng CHITUP OFFICE hiện chỉ hỗ trợ trên macOS.");
    const appPath = chitupAppPath();
    if (!appPath) throw new Error("Chưa thấy CHITUP OFFICE trong thư mục Applications.");
    open("open", ["-a", appPath, file]);
    return;
  }
  if (platform === "darwin") {
    const appPath = vscodeAppPath();
    if (!appPath) throw new Error("Chưa thấy Visual Studio Code trong thư mục Applications.");
    open("open", ["-a", appPath, file]);
  } else if (platform === "win32") {
    const child = spawn("code", [file], { detached: true, stdio: "ignore", windowsHide: true, shell: true });
    child.on("error", () => undefined);
    child.unref();
  } else {
    const cli = vscodeCli();
    if (!cli) throw new Error("Chưa thấy lệnh `code` của Visual Studio Code.");
    open(cli, [file]);
  }
}

export function openResultFile(p: unknown, opts: { platform?: NodeJS.Platform; opener?: Opener; app?: OpenApp } = {}): { ok: true; file: string } | { ok: false; error: string } {
  if (typeof p !== "string" || !p.trim()) return { ok: false, error: "Thiếu đường dẫn tệp." };
  const raw = p.trim();
  if (raw.length > 1000 || /[\u0000-\u001f]/.test(raw)) return { ok: false, error: "Đường dẫn không hợp lệ." };
  if (!path.isAbsolute(raw)) return { ok: false, error: "Cần đường dẫn đầy đủ (tuyệt đối) của tệp." };
  const file = path.normalize(raw);
  const ext = path.extname(file).toLowerCase();
  if (!RESULT_OPENABLE.has(ext)) return { ok: false, error: `Định dạng tệp ${ext} không hỗ trợ mở trực tiếp.` };
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { ok: false, error: `Không thấy tệp tại đường dẫn: ${file}` };
  }
  if (!st.isFile()) return { ok: false, error: "Đường dẫn này không phải là tệp." };
  const platform = opts.platform ?? process.platform;
  const open = opts.opener ?? defaultOpener;
  try {
    if (opts.app === "chitup" || opts.app === "vscode") {
      openWithApp(opts.app, file, ext, platform, open);
    } else if (TEXT_EXTS.has(ext)) {
      // Tệp văn bản: mở bằng VS Code / editor thay vì app mặc định OS.
      openTextFile(file, platform, open);
    } else if (platform === "darwin") {
      open("open", [file]);
    } else if (platform === "win32") {
      open("explorer.exe", [file]);
    } else {
      open("xdg-open", [file]);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, file };
}

export function revealInFinder(p: unknown, opts: { platform?: NodeJS.Platform; opener?: Opener } = {}): { ok: true; file: string } | { ok: false; error: string } {
  if (typeof p !== "string" || !p.trim()) return { ok: false, error: "Thiếu đường dẫn tệp." };
  const raw = p.trim();
  if (raw.length > 1000 || /[\u0000-\u001f]/.test(raw) || !path.isAbsolute(raw)) return { ok: false, error: "Đường dẫn không hợp lệ." };
  const file = path.normalize(raw);
  const platform = opts.platform ?? process.platform;
  const open = opts.opener ?? defaultOpener;
  try {
    if (fs.existsSync(file)) {
      if (platform === "darwin") open("open", ["-R", file]);
      else if (platform === "win32") open("explorer.exe", [`/select,${file}`]);
      else open("xdg-open", [path.dirname(file)]);
      return { ok: true, file };
    }
    const dir = path.dirname(file);
    if (fs.existsSync(dir)) {
      if (platform === "darwin") open("open", [dir]);
      else if (platform === "win32") open("explorer.exe", [dir]);
      else open("xdg-open", [dir]);
      return { ok: true, file: dir };
    }
    return { ok: false, error: `Không tìm thấy thư mục chứa tệp: ${dir}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
