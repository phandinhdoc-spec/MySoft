import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

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

export function openResultFile(p: unknown, opts: { platform?: NodeJS.Platform; opener?: Opener } = {}): { ok: true; file: string } | { ok: false; error: string } {
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
    if (platform === "darwin") open("open", [file]);
    else if (platform === "win32") open("explorer.exe", [file]);
    else open("xdg-open", [file]);
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
