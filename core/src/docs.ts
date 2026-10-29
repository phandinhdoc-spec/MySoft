import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/** Các đuôi tệp văn bản thuần, Markdown và công cụ lập trình — mở bằng VS Code / editor theo quy tắc của PVTA. */
const TEXT_EXTS = new Set([
  ".md", ".markdown", ".txt", ".csv", ".tsv", ".typ", ".tex", ".log",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".json", ".yaml", ".yml", ".toml", ".xml", ".ini", ".conf",
  ".css", ".scss", ".less", ".sql", ".rs", ".go", ".c", ".cpp", ".h", ".hpp",
  ".java", ".swift", ".kt", ".rb", ".php", ".lua", ".r",
]);

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

/** Nhờ hệ điều hành mở tệp bằng Microsoft Office (trên macOS nếu đã cài) hoặc ứng dụng mặc định. Không chạy lệnh nào do người khác đặt: chỉ mở tệp. */
export function openOffice(p: unknown, opts: { platform?: NodeJS.Platform; opener?: Opener } = {}): { ok: true; file: string } | { ok: false; error: string } {
  const c = checkOpenable(p);
  if (!c.ok) return c;
  const platform = opts.platform ?? process.platform;
  const open = opts.opener ?? defaultOpener;
  try {
    if (platform === "darwin") {
      const appPath = officeAppPath(path.extname(c.file).toLowerCase());
      if (appPath) open("open", ["-a", appPath, c.file]);
      else open("open", [c.file]);
    }
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
  ".odt", ".ods", ".odp", ".rtf",
  ".pdf", ".zip", ".html", ".htm",
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".mp3", ".mp4", ".wav", ".m4a", ".mov",
  ...TEXT_EXTS,
]);

/** Tệp có thể tự chạy mã khi mở: lệnh «Mở» chung không mở trực tiếp. */
const SYSTEM_OPEN_BLOCKED = new Set([".app", ".command", ".sh", ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".vbs", ".jar", ".scpt", ".workflow", ".pkg", ".dmg", ".desktop", ".appimage"]);

/** Ứng dụng người dùng chọn để mở tệp: mặc định của hệ điều hành, Microsoft Office hoặc Visual Studio Code. */
export type OpenApp = "default" | "office" | "vscode" | "system";
const WORD_EXTS = new Set([".docx", ".doc", ".docm", ".dotx"]);
const EXCEL_EXTS = new Set([".xlsx", ".xls", ".xlsm", ".xltx"]);
const PPT_EXTS = new Set([".pptx", ".ppt", ".pptm", ".potx"]);

export function normalizeOpenApp(v: unknown): OpenApp {
  return v === "office" || v === "vscode" || v === "system" ? v : "default";
}

function officeAppName(ext: string): "Microsoft Word" | "Microsoft Excel" | "Microsoft PowerPoint" | undefined {
  if (WORD_EXTS.has(ext)) return "Microsoft Word";
  if (EXCEL_EXTS.has(ext)) return "Microsoft Excel";
  if (PPT_EXTS.has(ext)) return "Microsoft PowerPoint";
  return undefined;
}

function officeAppPath(ext: string): string | undefined {
  const appName = officeAppName(ext);
  if (!appName) return undefined;
  const home = process.env.HOME ?? "";
  for (const p of [`/Applications/${appName}.app`, `${home}/Applications/${appName}.app`]) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** Mở tệp bằng đúng ứng dụng được chọn; trả về lỗi dễ hiểu nếu ứng dụng chưa cài. */
function openWithApp(app: OpenApp, file: string, ext: string, platform: NodeJS.Platform, open: Opener): void {
  if (app === "office") {
    const appName = officeAppName(ext);
    if (!appName) throw new Error("Microsoft Office chỉ mở tệp Word, Excel và PowerPoint.");
    if (platform !== "darwin") throw new Error("Mở bằng Microsoft Office hiện chỉ hỗ trợ trên macOS.");
    const appPath = officeAppPath(ext);
    if (!appPath) throw new Error(`Chưa thấy ${appName} trong thư mục Applications.`);
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

export function openResultFile(p: unknown, opts: { platform?: NodeJS.Platform; opener?: Opener; app?: OpenApp; fallbackSystem?: boolean } = {}): { ok: true; file: string } | { ok: false; error: string } {
  if (typeof p !== "string" || !p.trim()) return { ok: false, error: "Thiếu đường dẫn tệp." };
  const raw = p.trim();
  if (raw.length > 1000 || /[\u0000-\u001f]/.test(raw)) return { ok: false, error: "Đường dẫn không hợp lệ." };
  if (!path.isAbsolute(raw)) return { ok: false, error: "Cần đường dẫn đầy đủ (tuyệt đối) của tệp." };
  const file = path.normalize(raw);
  const ext = path.extname(file).toLowerCase();
  // «Mở» bằng lệnh hệ thống (open / explorer / xdg-open) áp dụng cho mọi loại tệp, trừ tệp có thể tự chạy.
  if ((opts.app === "system" || opts.fallbackSystem) && SYSTEM_OPEN_BLOCKED.has(ext)) return { ok: false, error: `Không mở trực tiếp tệp thực thi ${ext}.` };
  if (opts.app !== "system" && !opts.fallbackSystem && !RESULT_OPENABLE.has(ext)) return { ok: false, error: `Định dạng tệp ${ext} không hỗ trợ mở trực tiếp.` };
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { ok: false, error: `Không thấy tệp tại đường dẫn: ${file}` };
  }
  const platform = opts.platform ?? process.platform;
  const open = opts.opener ?? defaultOpener;
  if (st.isDirectory()) {
    if (opts.app === "system" || opts.fallbackSystem) {
      try {
        if (platform === "darwin") open("open", [file]);
        else if (platform === "win32") open("explorer.exe", [file]);
        else open("xdg-open", [file]);
        return { ok: true, file };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { ok: false, error: "Đường dẫn này không phải là tệp." };
  }
  if (!st.isFile()) return { ok: false, error: "Đường dẫn này không phải là tệp." };
  try {
    if (opts.app === "system") {
      // Tương đương gõ `open <đường dẫn đầy đủ>` trong terminal.
      if (platform === "darwin") open("open", [file]);
      else if (platform === "win32") open("explorer.exe", [file]);
      else open("xdg-open", [file]);
    } else if (opts.app === "office" || opts.app === "vscode") {
      openWithApp(opts.app, file, ext, platform, open);
    } else if (TEXT_EXTS.has(ext)) {
      // Tệp văn bản, Markdown, mã nguồn: mở bằng VS Code / editor theo quy tắc của PVTA.
      openTextFile(file, platform, open);
    } else if (platform === "darwin") {
      const appPath = officeAppPath(ext);
      if (appPath) open("open", ["-a", appPath, file]);
      else open("open", [file]);
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
