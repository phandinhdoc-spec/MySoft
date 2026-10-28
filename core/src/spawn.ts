import { spawn, execFile, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Arg } from "./backends/types.js";

export interface SpawnPlan {
  command: string;
  args: string[];
  shell: boolean;
}

/** Ký tự đặc biệt của cmd.exe cần thoát bằng dấu ^ (giống thư viện cross-spawn). */
const META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Trích dẫn một đối số cho cmd.exe khi gọi shim .cmd/.bat qua shell (Windows).
 * Bước 1 theo quy tắc của CommandLineToArgvW (nhân đôi \ trước ", thoát " bằng \),
 * bước 2 thoát ký tự đặc biệt của cmd bằng ^; với shim .cmd phải thoát hai lần
 * vì cmd đọc lại dòng lệnh khi chạy %* bên trong shim.
 */
export function quoteWinArg(a: string, doubleEscape = true): string {
  let s = a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  s = `"${s}"`;
  s = s.replace(META, "^$1");
  if (doubleEscape) s = s.replace(META, "^$1");
  return s;
}

/** Thoát tên lệnh (đường dẫn) cho cmd.exe. */
export function quoteWinCommand(bin: string): string {
  const q = /[\s"]/.test(bin) ? `"${bin.replace(/"/g, "")}"` : bin;
  return q.replace(/([()\][%!^`<>&|;,*?])/g, "^$1");
}

/** Cách chạy một lệnh trên Windows sau khi tìm trong PATH. */
export type WinTarget =
  | { kind: "exe"; path: string }
  /** Shim npm (.cmd) trỏ tới một tệp JavaScript: chạy thẳng bằng node, không qua cmd.exe. */
  | { kind: "node"; script: string }
  | { kind: "shell"; path: string };

export interface FsLike {
  isFile(p: string): boolean;
  read(p: string): string;
}

const realFs: FsLike = {
  isFile: (p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  },
  read: (p) => fs.readFileSync(p, "utf8"),
};

/** Tìm tệp thật của lệnh theo PATH và PATHEXT (Windows). */
export function whichWin(bin: string, env: NodeJS.ProcessEnv, f: FsLike = realFs): string | undefined {
  const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const hasExt = /\.[a-z0-9]+$/i.test(path.win32.basename(bin));
  const names = hasExt ? [bin] : [...exts.map((e) => bin + e.toLowerCase()), bin];
  const isPath = /[\\/]/.test(bin);
  const dirs = isPath ? [""] : (env.PATH ?? env.Path ?? "").split(";").filter(Boolean);
  for (const d of dirs) {
    for (const n of names) {
      const p = d ? path.win32.join(d, n) : n;
      if (f.isFile(p)) return p;
    }
  }
  return undefined;
}

/** Đọc shim .cmd do npm sinh ra để lấy tệp JavaScript thật. */
export function npmShimScript(cmdFile: string, f: FsLike = realFs): string | undefined {
  let text: string;
  try {
    text = f.read(cmdFile);
  } catch {
    return undefined;
  }
  // Dạng npm: "%dp0%\node_modules\pkg\cli.js" %*   (hoặc "%~dp0\...")
  const m = /"%~?dp0%?\\([^"]+?\.(?:c|m)?js)"/i.exec(text);
  if (!m) return undefined;
  return path.win32.join(path.win32.dirname(cmdFile), m[1]!);
}

export function resolveWin(bin: string, env: NodeJS.ProcessEnv, f: FsLike = realFs): WinTarget {
  const found = whichWin(bin, env, f);
  if (!found) return { kind: "shell", path: bin }; // để cmd.exe tự báo "không nhận ra lệnh"
  if (/\.(exe|com)$/i.test(found)) return { kind: "exe", path: found };
  if (/\.(cmd|bat)$/i.test(found)) {
    const script = npmShimScript(found, f);
    if (script && f.isFile(script)) return { kind: "node", script };
    return { kind: "shell", path: found };
  }
  return { kind: "exe", path: found };
}

function flatten(args: Arg[]): string[] {
  const flat: string[] = [];
  for (const a of args) {
    flat.push(a.flag);
    if (a.value !== undefined) flat.push(a.value);
  }
  return flat;
}

/**
 * Lập kế hoạch spawn. macOS/Linux: chạy trực tiếp, không qua shell.
 * Windows: tìm lệnh trong PATH; .exe chạy trực tiếp; shim npm chạy bằng node
 * (không qua cmd.exe, nên prompt nhiều dòng và ký tự đặc biệt đi nguyên vẹn);
 * còn lại mới đi qua cmd.exe với trích dẫn đầy đủ.
 */
export function buildSpawn(
  platform: NodeJS.Platform,
  bin: string,
  args: Arg[],
  win?: { target?: WinTarget; nodePath?: string },
): SpawnPlan {
  const flat = flatten(args);
  if (platform !== "win32") return { command: bin, args: flat, shell: false };
  const target = win?.target ?? (/\.(exe|com)$/i.test(bin) ? { kind: "exe" as const, path: bin } : { kind: "shell" as const, path: bin });
  if (target.kind === "exe") return { command: target.path, args: flat, shell: false };
  if (target.kind === "node") return { command: win?.nodePath ?? process.execPath, args: [target.script, ...flat], shell: false };
  // cmd.exe cắt dòng lệnh ở ký tự xuống dòng: không thể truyền nguyên vẹn, báo lỗi rõ thay vì gửi prompt bị cụt.
  if (flat.some((a) => /[\r\n]/.test(a))) throw new WinShellNewlineError();
  return { command: quoteWinCommand(target.path), args: flat.map((a) => quoteWinArg(a)), shell: true };
}

export class WinShellNewlineError extends Error {
  constructor() {
    super("Không truyền được prompt nhiều dòng qua cmd.exe tới lệnh này trên Windows.");
  }
}

/**
 * Giới hạn độ dài dòng lệnh khi prompt đi qua tham số trên Windows.
 * Win32 CreateProcessW tối đa 32.767 ký tự (~28.000 để dư).
 * cmd.exe (khi gọi qua shell) tối đa 8.191 ký tự (~6.500 để trừ cờ và trích dẫn/escape).
 */
export const WIN_ARG_LIMIT = 28_000;
export const WIN_SHELL_ARG_LIMIT = 6_500;

export function launch(plan: SpawnPlan, opts: { cwd: string; env: NodeJS.ProcessEnv }): ChildProcess {
  return spawn(plan.command, plan.args, {
    cwd: opts.cwd,
    env: opts.env,
    shell: plan.shell,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    // Own process group: cancelling a CLI also stops tools it launched.
    detached: process.platform !== 'win32',
  });
}

export function stopProcessTree(child:ChildProcess):void {
  if(!child.pid)return;
  if(process.platform==='win32'){
    execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000},()=>{
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
    });
  }else{
    try{process.kill(-child.pid,'SIGKILL');}
    catch{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
  }
}
