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

/** opencode: `opencode models` (mỗi dòng "<nhà-cung-cấp>/<model>"). Giới hạn 60 mục đầu cho gọn danh sách. */
export function parseOpencodeModels(text: string): ModelInfo[] {
  const seen = new Set<string>();
  const out: ModelInfo[] = [{ id: "default", label: "Mặc định của OpenCode", hint: "theo cấu hình opencode" }];
  for (const raw of text.split(/\r?\n/)) {
    const id = raw.trim();
    if (!/^[A-Za-z0-9][\w.:@+-]*\/[\w.:/@+-]{1,99}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id, hint: id.endsWith("-free") ? "miễn phí" : undefined });
    if (out.length > 60) break;
  }
  return out.length > 1 ? out : [];
}

export async function scanOpencode(bin: string): Promise<ModelInfo[]> {
  const r = await run(bin, ["models"], 25_000);
  return parseOpencodeModels(r.stdout);
}

/**
 * Hỏi từng CLI đã cài xem có những model nào. claude không có lệnh liệt kê model
 * nên dùng danh sách dự phòng (tên rút gọn haiku/sonnet/opus, CLI tự trỏ tới bản mới nhất).
 */
export async function discoverModels(
  bins: Partial<Record<CliBackendId, string>>,
  installed: Partial<Record<CliBackendId, boolean>>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ModelCatalog> {
  const out = builtinCatalog();
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
    return v && typeof v === "object" ? v : undefined;
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
