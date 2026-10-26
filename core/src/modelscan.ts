import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { builtinCatalog, parseAgyModels, parseCodexModels, type CliBackendId, type ModelCatalog, type ModelInfo } from "@pvta/shared";
import { run } from "./probe.js";

/** Lấy JSON từ đầu ra có thể kèm dòng cảnh báo trước/sau. */
function jsonFrom(text: string): unknown {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return undefined;
  try {
    return JSON.parse(text.slice(i, j + 1));
  } catch {
    return undefined;
  }
}

/** Codex: `codex debug models`; không chạy được thì đọc bộ nhớ đệm của chính codex. */
export async function scanCodex(bin: string, env: NodeJS.ProcessEnv = process.env): Promise<ModelInfo[]> {
  const r = await run(bin, ["debug", "models"], 20_000, 64 * 1024 * 1024);
  const fromCli = parseCodexModels(jsonFrom(r.stdout));
  if (fromCli.length > 0) return fromCli;
  try {
    const dir = env.CODEX_HOME || path.join(os.homedir(), ".codex");
    return parseCodexModels(JSON.parse(fs.readFileSync(path.join(dir, "models_cache.json"), "utf8")));
  } catch {
    return [];
  }
}

/** agy: `agy models` (mỗi dòng "<mã>\t<tên hiển thị>"). */
export async function scanAgy(bin: string): Promise<ModelInfo[]> {
  const r = await run(bin, ["models"], 25_000);
  return parseAgyModels(r.stdout);
}

/** Tên hiển thị thân thiện cho model OpenCode. */
function formatOpencodeLabel(id: string): string {
  if (id === "default") return "Mặc định của OpenCode";
  const name = id.startsWith("opencode/") ? id.slice("opencode/".length) : id;
  const known: Record<string, string> = {
    "beam-free": "Beam Free",
    "big-pickle": "Big Pickle",
    "deepseek-v4.1-flash-free": "DeepSeek V4.1 Flash Free",
    "flint-40b-free": "Flint 40B Free",
    "glm-5.3-flash-free": "GLM 5.3 Flash Free",
    "mimo-v2.6-flash-free": "MiMo V2.6 Flash Free",
    "nemotron-3-ultra-free": "Nemotron 3 Ultra Free",
    "nemotron-3.5-lightning-free": "Nemotron 3.5 Lightning Free",
    "nemotron-3.5-super-vl-free": "Nemotron 3.5 Super VL Free",
  };
  if (known[name]) return known[name];
  return name.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isOpencodeFree(id: string): boolean {
  return id.endsWith("-free") || id === "opencode/big-pickle" || id.includes("free");
}

/** opencode: `opencode models` (mỗi dòng "<nhà-cung-cấp>/<model>"). Giới hạn 60 mục đầu cho gọn danh sách. */
export function parseOpencodeModels(text: string): ModelInfo[] {
  const seen = new Set<string>();
  const out: ModelInfo[] = [{ id: "default", label: "Mặc định của OpenCode", hint: "theo cấu hình opencode" }];
  for (const raw of text.split(/\r?\n/)) {
    const id = raw.trim();
    if (!/^[A-Za-z0-9][\w.:@+-]*\/[\w.:/@+-]{1,99}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: formatOpencodeLabel(id), hint: isOpencodeFree(id) ? "miễn phí" : undefined });
    if (out.length > 60) break;
  }
  return out.length > 1 ? out : [];
}

/** Thử tối đa 3 lần: opencode đôi khi in rỗng khi đang làm mới bộ nhớ đệm model hoặc có tiến trình opencode khác chạy cùng lúc. */
export async function scanOpencode(bin: string, attempts = 3, waitMs = 600): Promise<ModelInfo[]> {
  for (let i = 0; i < attempts; i++) {
    const r = await run(bin, ["models"], 25_000);
    const m = parseOpencodeModels(r.stdout) || [];
    if (m.length > 0) return m;
    const alt = parseOpencodeModels(r.out);
    if (alt.length > 0) return alt;
    if (r.failed) return [];
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, waitMs));
  }
  return [];
}

/**
 * Hỏi từng CLI đã cài xem có những model nào. claude không có lệnh liệt kê model
 * nên dùng danh sách dự phòng (tên rút gọn haiku/sonnet/opus, CLI tự trỏ tới bản mới nhất).
 */
export async function discoverModels(
  bins: Partial<Record<CliBackendId, string>>,
  installed: Partial<Record<CliBackendId, boolean>>,
  env: NodeJS.ProcessEnv = process.env,
  previous?: ModelCatalog,
): Promise<ModelCatalog> {
  const out = builtinCatalog();
  // Quét hỏng một lần không được xóa danh sách trực tiếp đã có từ lần trước.
  for (const id of ["codex", "agy", "opencode"] as const) {
    const old = previous?.[id];
    if (installed[id] && old?.live && old.models.length > 1) out[id] = old;
  }
  const jobs: Array<Promise<void>> = [];
  if (installed.codex && bins.codex) {
    jobs.push(scanCodex(bins.codex, env).then((m) => void (m.length > 0 && (out.codex = { models: m, live: true }))).catch(() => undefined));
  }
  if (installed.agy && bins.agy) {
    jobs.push(scanAgy(bins.agy).then((m) => void (m.length > 0 && (out.agy = { models: m, live: true }))).catch(() => undefined));
  }
  if (installed.opencode && bins.opencode) {
    jobs.push(scanOpencode(bins.opencode).then((m) => void (m.length > 0 && (out.opencode = { models: m, live: true }))).catch(() => undefined));
  }
  await Promise.all(jobs);
  return out;
}

/** Nhớ danh sách lần trước để mở panel là có ngay, không đợi dò lại. */
export function loadCatalog(file: string): ModelCatalog | undefined {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as ModelCatalog;
    if (!v || typeof v !== "object") return undefined;
    const base = builtinCatalog();
    return {
      ...base,
      ...v,
      opencode: v.opencode && v.opencode.models?.length > 0 ? v.opencode : base.opencode,
    };
  } catch {
    return undefined;
  }
}

export function saveCatalog(file: string, c: ModelCatalog): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(c), { mode: 0o600 });
  } catch {
    /* chỉ là bộ nhớ đệm */
  }
}
