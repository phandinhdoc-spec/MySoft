import {parseProviderUsage} from './provider-usage.js';
import type {ProviderUsage} from '@pvta/shared';
import {toolProgressParser} from './tool-progress.js';
import type {AiProgressEntry} from '@pvta/shared';
import type { BackendId, CliBackendId, Effort, PermissionLevel } from "@pvta/shared";
import { BACKENDS, newParseState, resolveBin, type Arg, type Backend, type ParseState } from "./backends/index.js";
import type { InvokeOptions } from "./backends/types.js";
import { cleanEnv } from "./env.js";
import { classifyError, EngineError, extractBadFlag } from "./errors.js";
import { probeCli, type ProbeStore } from "./probe.js";
import { buildSpawn, launch, resolveWin, WIN_ARG_LIMIT, WinShellNewlineError, type SpawnPlan, type WinTarget } from "./spawn.js";
import type { ChildProcess } from "node:child_process";
import { Stopwatch } from "./timing.js";

export interface EngineDeps {
  probe: ProbeStore;
  /** Backend "api" (gọi thẳng API bằng khóa người dùng). */
  api?: { run(req: RunRequest): Promise<RunResult> };
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Đọc mỗi lần gọi để cờ đặt trong cấu hình có hiệu lực ngay. */
  allowApiKeys?: () => boolean;
}

export interface RunRequest {
  backend: BackendId;
  model: string;
  cwd: string;
  permission: PermissionLevel;
  /** Xem InvokeOptions.workspaceWrite. */
  workspaceWrite?: boolean;
  /** Xem InvokeOptions.mcp. Không truyền = tắt. */
  mcp?: InvokeOptions["mcp"];
  effort?: Effort;
  /** Chế độ Nhanh (mã bậc tốc độ), xem InvokeOptions.speed. */
  speed?: string;
  /** Nhiệt độ (0..1). Chỉ backend API dùng; CLI không có cờ tương ứng. */
  temperature?: number;
  /**
   * Phần cố định (quy tắc, skill, phong cách). Backend nhận được lời nhắc hệ thống riêng
   * (claude --system-prompt, API) thì gửi ở đó: thay lời nhắc mặc định rất dài của Claude Code,
   * ít token hơn và được cache. Không gửi được thì buildPrompt tự gộp vào prompt.
   */
  system?: string;
  conversationId?: string;
  /**
   * resumed = true: chỉ gửi phần mới; false: gửi bản đầy đủ (lượt đầu hoặc sau khi mất phiên).
   * systemSent = true: `system` đã đi riêng, không cần lặp lại trong prompt.
   */
  buildPrompt(resumed: boolean, systemSent: boolean): string;
  onDelta?(text: string): void;
  onProgress?(entry:AiProgressEntry):void;
  onUsage?(usage:ProviderUsage):void;
  /** Ảnh cho model xem (xem InvokeOptions.images). */
  images?: string[];
  signal?: AbortSignal;
  /** 0 disables the local deadline; caller cancellation still applies. */
  timeoutMs?: number;
}

export interface RunResult {
  text: string;
  conversationId?: string;
  /** Lượt gọi này đã chạy với bản đầy đủ (không resume). */
  fullPrompt: boolean;
  attempts: number;
  timings: { spawnMs?: number; firstTokenMs?: number; totalMs: number; warm?: boolean };
  /** Điều chỉnh đã tự làm (báo cho người dùng). */
  notes?: string[];
}

type CliRunRequest = RunRequest & { backend: CliBackendId };

interface AttemptCtx {
  conversationId?: string;
  plain: boolean;
  dropFlags: Set<string>;
}

class StreamUnreadable extends Error {}

const MAX_ATTEMPTS = 3; // lần đầu + tối đa 2 lần thử lại

export class Engine {
  private versionCache = new Map<CliBackendId, string>();
  /** Windows: kết quả tìm lệnh trong PATH (tìm một lần, lỗi ENOENT thì tìm lại). */
  private winTargets = new Map<string, WinTarget>();
  /** CLI đã khởi động sẵn, đang chờ prompt qua stdin (khóa = lệnh + đối số + thư mục). */
  private warm = new Map<string, { child: ChildProcess; timer: NodeJS.Timeout }>();
  constructor(private deps: EngineDeps) {}

  /** Phiên bản CLI đã biết (từ lần dò khi khởi động): khỏi chạy --version trước lần gọi đầu. */
  primeVersion(id: CliBackendId, version: string): void {
    if (version) this.versionCache.set(id, version);
  }

  /**
   * Khởi động sẵn CLI với đúng đối số của lần gọi sắp tới (khi người dùng bắt đầu gõ).
   * Chỉ cho backend nhận prompt qua stdin (claude, codex): tiến trình nạp xong và chờ;
   * lúc gửi chỉ cần ghi prompt vào stdin, bỏ được thời gian khởi động. Chưa dùng thì tự tắt.
   */
  async prewarm(req: Omit<RunRequest, "buildPrompt" | "onDelta" | "signal">, ttlMs = 120_000): Promise<boolean> {
    if (req.backend === "api") return false;
    const r = req as Omit<CliRunRequest, "buildPrompt">;
    const ctx: AttemptCtx = { conversationId: r.conversationId, plain: false, dropFlags: new Set(await this.storedUnsupported(r.backend)) };
    const pre = this.prepare(r, ctx, "");
    if (pre.inv.stdin === undefined) return false; // prompt nằm trong đối số: không chuẩn bị trước được
    let plan: SpawnPlan;
    try {
      plan = buildSpawn(pre.platform, pre.bin, pre.args, pre.platform === "win32" ? { target: pre.target } : undefined);
    } catch {
      return false;
    }
    const key = warmKey(r.cwd, plan);
    const cur = this.warm.get(key);
    if (cur && alive(cur.child)) {
      cur.timer.refresh();
      return true;
    }
    while (this.warm.size >= 3) this.dropWarm(this.warm.keys().next().value!);
    const child = launch(plan, { cwd: r.cwd, env: this.childEnv(pre.backend) });
    child.on("error", () => this.dropWarm(key, child));
    child.on("exit", () => this.dropWarm(key, child));
    child.stdin?.on("error", () => {});
    const timer = setTimeout(() => this.dropWarm(key), ttlMs);
    timer.unref();
    this.warm.set(key, { child, timer });
    return true;
  }

  /** Tắt mọi CLI đang chờ (khi bridge dừng). */
  disposeWarm(): void {
    for (const k of [...this.warm.keys()]) this.dropWarm(k);
  }

  private dropWarm(key: string, only?: ChildProcess): void {
    const w = this.warm.get(key);
    if (!w || (only && w.child !== only)) return;
    this.warm.delete(key);
    clearTimeout(w.timer);
    if (alive(w.child)) w.child.kill("SIGKILL");
  }

  private takeWarm(key: string): ChildProcess | undefined {
    const w = this.warm.get(key);
    if (!w) return undefined;
    this.warm.delete(key);
    clearTimeout(w.timer);
    return alive(w.child) ? w.child : undefined;
  }

  private childEnv(backend: Backend): NodeJS.ProcessEnv {
    const env = cleanEnv(this.deps.env ?? process.env, this.deps.allowApiKeys?.() ?? false);
    return backend.env ? { ...env, ...backend.env } : env;
  }

  /** Dựng đối số cho một lần gọi. prompt chỉ cần thật với backend nhận prompt qua đối số (agy). */
  private prepare(req: Omit<CliRunRequest, "buildPrompt">, ctx: AttemptCtx, prompt: string) {
    const backend = BACKENDS[req.backend];
    const platform = this.deps.platform ?? process.platform;
    const env = this.deps.env ?? process.env;
    const bin = resolveBin(backend, env);
    const target = platform === "win32" ? this.winTarget(bin, env) : undefined;
    const inv = backend.invocation({
      model: req.model,
      prompt,
      conversationId: ctx.conversationId,
      permission: req.permission,
      workspaceWrite: req.workspaceWrite,
      mcp: req.mcp,
      effort: req.effort,
      speed: req.speed,
      plain: ctx.plain,
      system: req.system,
      images: req.images,
    });
    let args: Arg[] = inv.args.filter((a) => a.essential || !ctx.dropFlags.has(a.flag));
    // cmd.exe không truyền được đối số nhiều dòng: khi đó quy tắc đi trong prompt.
    if (target?.kind === "shell") args = args.filter((a) => a.flag !== "--system-prompt");
    const systemSent = args.some((a) => a.flag === "--system-prompt");
    return { backend, inv, args, systemSent, bin, target, platform, env };
  }

  private winTarget(bin: string, env: NodeJS.ProcessEnv): WinTarget {
    let t = this.winTargets.get(bin);
    if (!t) {
      t = resolveWin(bin, env);
      if (t.kind !== "shell" || t.path !== bin) this.winTargets.set(bin, t); // chỉ nhớ khi đã tìm thấy
    }
    return t;
  }

  async run(request: RunRequest): Promise<RunResult> {
    if (request.backend === "api") {
      if (!this.deps.api) throw new EngineError("missing", "Chưa cấu hình API.");
      return this.deps.api.run(request);
    }
    const req = request as CliRunRequest;
    const ctx: AttemptCtx = {
      conversationId: req.conversationId,
      plain: false,
      dropFlags: new Set(await this.storedUnsupported(req.backend)),
    };
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const out = await this.attempt(req, ctx);
        return { ...out, attempts: attempt };
      } catch (e) {
        lastErr = e;
        if (attempt === MAX_ATTEMPTS) break;
        if (e instanceof StreamUnreadable) {
          if (ctx.plain) break;
          ctx.plain = true; // 4. chuyển sang đầu ra văn bản thuần
          continue;
        }
        if (!(e instanceof EngineError)) break;
        if (e.kind === "session" && ctx.conversationId) {
          ctx.conversationId = undefined; // 3. bỏ mã cũ, gửi lại bản đầy đủ
          continue;
        }
        if (e.kind === "flag" && (await this.adaptFlags(req, ctx, e))) continue; // 1-2
        break; // auth / model / denied / timeout / other: KHÔNG thử lại, KHÔNG đổi model
      }
    }
    if (lastErr instanceof StreamUnreadable) throw new EngineError("other", "Không đọc được đầu ra của CLI.");
    throw lastErr;
  }

  private async storedUnsupported(id: CliBackendId): Promise<string[]> {
    const entry = this.deps.probe.get(id);
    if (!entry || entry.unsupported.length === 0) return [];
    const ver = await this.version(id);
    return ver && ver === entry.fingerprint ? entry.unsupported : [];
  }

  private async version(id: CliBackendId): Promise<string> {
    const cached = this.versionCache.get(id);
    if (cached !== undefined) return cached;
    const bin = resolveBin(BACKENDS[id], this.deps.env ?? process.env);
    const { version } = await probeCli(bin, 8000, BACKENDS[id].helpArgs);
    this.versionCache.set(id, version);
    return version;
  }

  /** Bỏ cờ không nhận ra, nhớ lại. Trả về true nếu có gì thay đổi để thử lại. */
  private async adaptFlags(req: CliRunRequest, ctx: AttemptCtx, err: EngineError): Promise<boolean> {
    const backend = BACKENDS[req.backend];
    const inv = backend.invocation({ model: req.model, prompt: "", permission: req.permission, workspaceWrite: req.workspaceWrite, mcp: req.mcp, effort: req.effort, speed: req.speed, plain: ctx.plain, system: req.system });
    const optional = new Set(inv.args.filter((a) => !a.essential).map((a) => a.flag));
    const bin = resolveBin(backend, this.deps.env ?? process.env);
    const probe = await probeCli(bin, 8000, backend.helpArgs);
    this.versionCache.set(req.backend, probe.version);

    const toDrop = new Set<string>();
    const bad = extractBadFlag(`${err.message}\n${err.detail ?? ""}`);
    if (bad && optional.has(bad)) toDrop.add(bad);
    // `--help` không liệt kê mọi cờ (claude ghi rõ điều này): chỉ đối chiếu help khi
    // không đọc được tên cờ lỗi, để không bỏ nhầm cờ vẫn dùng được.
    else if (probe.flags.length > 0) {
      for (const f of optional) if (!probe.flags.includes(f)) toDrop.add(f);
    }
    let changed = false;
    for (const f of toDrop) {
      if (!ctx.dropFlags.has(f)) {
        ctx.dropFlags.add(f);
        this.deps.probe.markUnsupported(req.backend, f, probe.version);
        changed = true;
      }
    }
    if (probe.flags.length > 0) {
      const cur = this.deps.probe.get(req.backend);
      this.deps.probe.set(req.backend, {
        efforts: probe.efforts,
        installed: probe.installed,
        fingerprint: probe.version,
        flags: probe.flags,
        unsupported: cur?.fingerprint === probe.version ? cur.unsupported : [...toDrop],
      });
    }
    return changed;
  }

  private async attempt(req: CliRunRequest, ctx: AttemptCtx): Promise<Omit<RunResult, "attempts">> {
    const resumed = ctx.conversationId !== undefined;
    let pre = this.prepare(req, ctx, "");
    const prompt = req.buildPrompt(resumed, pre.systemSent);
    if (pre.inv.stdin === undefined) pre = this.prepare(req, ctx, prompt); // prompt nằm trong đối số
    const { backend, args, platform, bin, systemSent } = pre;
    const inv = { ...pre.inv, stdin: pre.inv.stdin === undefined ? undefined : prompt };

    if (inv.stdin === undefined && platform === "win32" && prompt.length > WIN_ARG_LIMIT) {
      throw new EngineError(
        "other",
        `Prompt dài ${prompt.length} ký tự, vượt giới hạn dòng lệnh của ${req.backend} trên Windows. Hãy chọn model của claude hoặc rút ngắn yêu cầu.`,
      );
    }

    let plan: SpawnPlan;
    try {
      plan = buildSpawn(platform, bin, args, platform === "win32" ? { target: pre.target } : undefined);
    } catch (e) {
      if (e instanceof WinShellNewlineError) {
        throw new EngineError("other", `${e.message} Hãy cài ${req.backend} bản .exe hoặc chọn model của claude.`);
      }
      throw e;
    }
    void systemSent;
    const sw = new Stopwatch();
    const state: ParseState = newParseState();
    let stderr = "";
    let plainOut = "";
    let streamed = false;

    // Có CLI đã khởi động sẵn đúng đối số này thì dùng luôn (chỉ backend nhận prompt qua stdin).
    const warmChild = inv.stdin !== undefined ? this.takeWarm(warmKey(req.cwd, plan)) : undefined;
    const child = warmChild ?? launch(plan, { cwd: req.cwd, env: this.childEnv(backend) });
    if (warmChild) sw.mark("spawn");
    else child.once("spawn", () => sw.mark("spawn"));

    return await new Promise<Omit<RunResult, "attempts">>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
        fn();
      };
      const onAbort = () => {
        child.kill("SIGKILL");
        finish(() => reject(new EngineError("other", "Đã hủy.")));
      };
      const timer = req.timeoutMs === 0 ? undefined : setTimeout(() => {
        child.kill("SIGKILL");
        finish(() => reject(new EngineError("timeout", "CLI chạy quá thời gian cho phép.")));
      }, req.timeoutMs ?? 900_000);
      if (req.signal?.aborted) return onAbort();
      req.signal?.addEventListener("abort", onAbort, { once: true });

      const emit = (t: string) => {
        if (!t) return;
        sw.mark("firstToken");
        streamed = true;
        req.onDelta?.(t);
      };

      const progress=req.onProgress?toolProgressParser(req.backend,req.onProgress):undefined;
      const observe=(line:string)=>{progress?.(line);if(req.onUsage){const usage=parseProviderUsage(req.backend,line);if(usage)req.onUsage(usage);}};
      let buf = "";
      let rawHead = ""; // đầu ra thô (cắt ngắn) để báo lỗi khi CLI không trả chữ nào
      child.stdout!.setEncoding("utf8");
      child.stdout!.on("data", (chunk: string) => {
        if (rawHead.length < 1500) rawHead += chunk.replace(/^\{"event":"init".*$/m, "[init…]").slice(0, 1500 - rawHead.length);
        if (ctx.plain) {
          plainOut += chunk;
          emit(chunk);
          return;
        }
        buf += chunk;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          observe(line);
          const t = backend.parseLine(line, state);
          if (t) emit(t);
          else if (!state.gotEvent && line.trim()) plainOut += line + "\n";
        }
      });
      child.stderr!.setEncoding("utf8");
      child.stderr!.on("data", (c: string) => (stderr += c));

      child.once("error", (e) => {
        this.winTargets.delete(bin);
        finish(() =>
          reject(
            new EngineError(
              (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "other",
              (e as NodeJS.ErrnoException).code === "ENOENT"
                ? `Không tìm thấy lệnh '${bin}'. Hãy cài CLI và đăng nhập gói đăng ký.`
                : `Không chạy được CLI: ${e.message}`,
            ),
          ),
        );
      });

      child.once("close", (code) => {
        if (buf.trim() && !ctx.plain) {
          observe(buf);
          const t = backend.parseLine(buf, state);
          if (t) emit(t);
          else if (!state.gotEvent) plainOut += buf;
        }
        finish(() => {
          const timings = {
            spawnMs: sw.get("spawn"),
            firstTokenMs: sw.get("firstToken"),
            totalMs: sw.elapsed(),
            warm: warmChild !== undefined,
          };
          const errText = `${state.error?.message ?? ""}\n${stderr}`.trim();
          if (code !== 0 || state.error) {
            // Qua shell (Windows cmd.exe / sh) thì lệnh không có trả mã 9009 / 127 thay vì ENOENT.
            if (!state.gotEvent && (code === 9009 || code === 127 || /is not recognized as an internal or external command|command not found/i.test(stderr))) {
              this.winTargets.delete(bin);
              return reject(new EngineError("missing", `Không tìm thấy lệnh '${bin}'. Hãy cài CLI và đăng nhập gói đăng ký.`, errText));
            }
            const kind = classifyError(errText);
            const shown = (state.error?.message || stderr || `CLI thoát với mã ${code}`).trim().slice(0, 500);
            return reject(new EngineError(kind, shown, errText));
          }
          if (ctx.plain) {
            return resolve({ text: plainOut.trim(), conversationId: ctx.conversationId, fullPrompt: !resumed, timings });
          }
          if (!state.gotEvent && plainOut.trim()) return reject(new StreamUnreadable());
          const text = state.text || state.resultText || "";
          if (!state.text && state.resultText && !streamed) req.onDelta?.(state.resultText);
          if (!text && state.denied.length > 0) {
            return reject(
              new EngineError("denied", deniedMessage(backend.id, state.denied), JSON.stringify(state.denied)),
            );
          }
          if (!text.trim()) {
            const detail = `trạng thái=${state.status ?? "?"}\nstdout: ${rawHead.trim().slice(0, 1200) || "(trống)"}\nstderr: ${stderr.trim().slice(0, 600) || "(trống)"}`;
            return reject(new EngineError("other", `${backend.id} chạy xong nhưng không trả về nội dung nào. Hãy thử model khác, hoặc gửi chi tiết này cho người hỗ trợ.\n${detail}`, detail));
          }
          resolve({ text, conversationId: state.conversationId ?? ctx.conversationId, fullPrompt: !resumed, timings });
        });
      });

      child.stdin!.on("error", () => {}); // EPIPE nếu CLI thoát sớm
      if (inv.stdin !== undefined) child.stdin!.end(inv.stdin);
      else child.stdin!.end();
    });
  }
}

/** Thông báo khi CLI tự từ chối thao tác (headless không hỏi được). Nêu tên thao tác để người dùng biết chặn cái gì. */
function deniedMessage(backend: string, denied: unknown[]): string {
  const names = denied
    .map((d) => (d && typeof d === "object" ? ((d as Record<string, unknown>).display_name ?? (d as Record<string, unknown>).action ?? (d as Record<string, unknown>).reason) : d))
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, 5);
  const what = names.length ? ` (${names.join(", ")})` : "";
  return `${backend} đã tự từ chối một thao tác${what} vì chạy nền không hỏi lại được quyền. Hãy kiểm tra thư mục làm việc của bước và quyền của CLI, rồi chạy lại từ khâu lỗi.`;
}

function warmKey(cwd: string, plan: SpawnPlan): string {
  return [cwd, plan.command, ...plan.args].join("\u0000");
}

function alive(c: ChildProcess): boolean {
  return c.pid !== undefined && c.exitCode === null && c.signalCode === null && !c.killed;
}
