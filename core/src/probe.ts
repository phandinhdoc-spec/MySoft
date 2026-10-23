import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { EFFORTS, type CliBackendId as BackendId, type Effort } from "@pvta/shared";
import { paths } from "./paths.js";
import { quoteWinCommand, resolveWin } from "./spawn.js";

export interface ProbeEntry {
  /** Dấu vân tay: phiên bản CLI. */
  fingerprint: string;
  flags: string[];
  /** Cờ đã biết là không dùng được với phiên bản này. */
  unsupported: string[];
  /** Các mức --effort đọc được từ `--help` (rỗng/thiếu = không có cờ hoặc không đọc được). */
  efforts?: Effort[];
  /** Lệnh có chạy được không (tìm thấy trong PATH). */
  installed?: boolean;
}

type ProbeFile = Partial<Record<BackendId, ProbeEntry>>;

export class ProbeStore {
  private data: ProbeFile = {};
  constructor(private file: string = paths.probe()) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf8")) as ProbeFile;
    } catch {
      this.data = {};
    }
  }
  get(id: BackendId): ProbeEntry | undefined {
    return this.data[id];
  }
  set(id: BackendId, entry: ProbeEntry): void {
    this.data[id] = entry;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
  /** Nhớ một cờ không dùng được. */
  markUnsupported(id: BackendId, flag: string, fingerprint: string): void {
    const cur = this.data[id];
    const entry: ProbeEntry =
      cur && cur.fingerprint === fingerprint ? cur : { fingerprint, flags: [], unsupported: [] };
    if (!entry.unsupported.includes(flag)) entry.unsupported.push(flag);
    this.set(id, entry);
  }
}

export function parseHelpFlags(help: string): string[] {
  const set = new Set<string>();
  for (const m of help.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*)/gi)) set.add(m[1]!);
  return [...set];
}

/** Đọc các mức của cờ --effort trong văn bản help, vd "--effort <level> (low, medium, high)". */
export function parseHelpEfforts(help: string): Effort[] | undefined {
  const i = help.search(/--effort\b/);
  if (i < 0) return undefined;
  const chunk = help.slice(i, i + 400);
  // Dừng ở cờ kế tiếp để không lấy nhầm mức của cờ khác.
  const next = chunk.slice(8).search(/\n\s*(-[a-zA-Z],\s*)?--[a-z]/);
  const scope = next >= 0 ? chunk.slice(0, next + 8) : chunk;
  const found = (scope.match(/\b(xhigh|medium|high|low|max)\b/gi) ?? []).map((x) => x.toLowerCase());
  const uniq = EFFORTS.filter((e) => found.includes(e));
  return uniq.length > 0 ? uniq : undefined;
}

export function run(bin: string, args: string[], timeoutMs: number, maxBuffer = 1024 * 1024): Promise<{ out: string; stdout: string; failed: boolean }> {
  let cmd = bin;
  let argv = args;
  let shell = false;
  if (process.platform === "win32") {
    const t = resolveWin(bin, process.env);
    if (t.kind === "shell" && t.path === bin && !/[\\/]/.test(bin)) return Promise.resolve({ out: "", stdout: "", failed: true }); // không có trong PATH
    if (t.kind === "exe") cmd = t.path;
    else if (t.kind === "node") {
      cmd = process.execPath;
      argv = [t.script, ...args];
    } else {
      cmd = quoteWinCommand(t.path);
      shell = true;
    }
  }
  return new Promise((resolve) => {
    execFile(cmd, argv, { timeout: timeoutMs, shell, windowsHide: true, maxBuffer }, (e, stdout, stderr) => {
      const code = (e as NodeJS.ErrnoException | null)?.code;
      const out = `${stdout ?? ""}\n${stderr ?? ""}`;
      resolve({ out, stdout: String(stdout ?? ""), failed: !!e && (code === "ENOENT" || /is not recognized as an internal or external command/i.test(out)) });
    });
  });
}

/** Dò --version / --help để biết CLI hiện tại hỗ trợ cờ nào. */
export async function probeCli(
  bin: string,
  timeoutMs = 8000,
  helpArgs: string[][] = [["--help"]],
): Promise<{ version: string; flags: string[]; efforts?: Effort[]; installed: boolean }> {
  const [ver, ...helps] = await Promise.all([run(bin, ["--version"], timeoutMs), ...helpArgs.map((a) => run(bin, a, timeoutMs))]);
  const helpText = helps.map((h) => h.out).join("\n");
  return {
    version: ver.out.trim().split("\n")[0]?.trim() ?? "",
    flags: parseHelpFlags(helpText),
    efforts: parseHelpEfforts(helpText),
    installed: !(ver.failed && helps.every((h) => h.failed)),
  };
}

/**
 * Lần chạy đầu (hoặc khi phiên bản CLI đổi): chạy --version/--help của từng backend
 * để biết cờ và mức suy nghĩ chính xác, lưu vào probe.json.
 */
export async function discoverBackends(
  store: ProbeStore,
  bins: Partial<Record<BackendId, string>>,
  helpArgs: Partial<Record<BackendId, string[][]>> = {},
): Promise<Record<BackendId, ProbeEntry>> {
  const ids = Object.keys(bins) as BackendId[];
  const out = {} as Record<BackendId, ProbeEntry>;
  await Promise.all(
    ids.map(async (id) => {
      const cur = store.get(id);
      const p = await probeCli(bins[id]!, 8000, helpArgs[id]);
      if (cur && p.installed && cur.fingerprint === p.version && cur.flags.length > 0 && cur.installed) {
        out[id] = cur; // đã dò với đúng phiên bản này
        return;
      }
      const entry: ProbeEntry = {
        fingerprint: p.version,
        flags: p.flags,
        unsupported: cur && cur.fingerprint === p.version ? cur.unsupported : [],
        efforts: p.efforts,
        installed: p.installed,
      };
      if (p.installed) store.set(id, entry);
      out[id] = entry;
    }),
  );
  return out;
}
