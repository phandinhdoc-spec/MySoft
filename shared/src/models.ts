/** Danh sách model: dự phòng có sẵn, và bộ đọc đầu ra `codex debug models` / `agy models`. */
import { EFFORTS, orderEfforts, type CliBackendId, type Effort, type ModelCatalog, type ModelInfo } from "./protocol.js";

const isEffort = (x: unknown): x is Effort => typeof x === "string" && (EFFORTS as readonly string[]).includes(x);

/**
 * Danh sách dự phòng khi chưa dò được CLI (hoặc CLI không có lệnh liệt kê).
 * claude: CLI không có lệnh liệt kê model; "haiku/sonnet/opus" là tên rút gọn CLI tự trỏ tới bản mới nhất.
 */
export const BUILTIN_MODELS: Record<CliBackendId, ModelInfo[]> = {
  claude: [
    { id: "haiku", label: "Haiku", hint: "nhanh nhất", efforts: [] },
    { id: "sonnet", label: "Sonnet", hint: "cân bằng" },
    {
      id: "opus",
      label: "Opus",
      hint: "kỹ nhất",
      fast: true,
      fastTier: "fast",
      fastNote: "Nhanh hơn nhưng tính phí thêm (usage credits) và chỉ dùng được khi tài khoản đã bật.",
    },
  ],
  codex: [{ id: "default", label: "Mặc định của Codex", hint: "khuyên dùng" }],
  agy: [
    {
      id: "gemini-3.8-flash",
      label: "Gemini 3.8 Flash",
      hint: "nhanh nhất",
      defaultEffort: "medium",
      variants: { low: "gemini-3.8-flash-low", medium: "gemini-3.8-flash-medium", high: "gemini-3.8-flash-high" },
    },
  ],
};

export function builtinCatalog(): ModelCatalog {
  return {
    claude: { models: BUILTIN_MODELS.claude, live: false },
    codex: { models: BUILTIN_MODELS.codex, live: false },
    agy: { models: BUILTIN_MODELS.agy, live: false },
  };
}

/** Danh sách model của một CLI: từ CLI nếu có, không thì dự phòng. */
export function modelsOf(catalog: ModelCatalog | undefined, backend: CliBackendId): ModelInfo[] {
  const m = catalog?.[backend]?.models;
  return m && m.length > 0 ? m : BUILTIN_MODELS[backend];
}

/**
 * Đọc danh mục model của Codex (JSON của `codex debug models` hoặc ~/.codex/models_cache.json):
 * { models: [{ slug, display_name, description, default_reasoning_level, supported_reasoning_levels: [{effort}],
 *   visibility, priority, additional_speed_tiers, service_tiers: [{id,name}] }] }
 */
export function parseCodexModels(raw: unknown): ModelInfo[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { models?: unknown }).models) ? ((raw as { models: unknown[] }).models as Record<string, any>[]) : [];
  const shown = list
    .filter((m) => m && typeof m.slug === "string" && /^[A-Za-z0-9][\w.:/@+-]{0,99}$/.test(m.slug) && (m.visibility === undefined || m.visibility === "list"))
    .sort((a, b) => (typeof a.priority === "number" ? a.priority : 1e9) - (typeof b.priority === "number" ? b.priority : 1e9));
  const out: ModelInfo[] = [];
  const seen = new Set<string>();
  for (const m of shown) {
    if (seen.has(m.slug)) continue;
    seen.add(m.slug);
    const levels = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map((l: any) => (typeof l === "string" ? l : l?.effort)).filter(isEffort) : [];
    const tiers = Array.isArray(m.service_tiers) ? (m.service_tiers as any[]).filter((t) => t && typeof t.id === "string") : [];
    const fastTier = tiers.find((t) => /fast/i.test(String(t.name ?? "")) || t.id === "priority") ?? tiers[0];
    const fast = tiers.length > 0 || (Array.isArray(m.additional_speed_tiers) && m.additional_speed_tiers.includes("fast"));
    const info: ModelInfo = { id: m.slug, label: String(m.display_name || m.slug) };
    if (typeof m.description === "string" && m.description.trim()) info.hint = m.description.trim().slice(0, 90);
    if (levels.length > 0) info.efforts = orderEfforts(levels);
    if (isEffort(m.default_reasoning_level)) info.defaultEffort = m.default_reasoning_level;
    if (fast) {
      info.fast = true;
      info.fastTier = fastTier ? String(fastTier.id) : "fast";
    }
    out.push(info);
  }
  return out.length > 0 ? [{ id: "default", label: "Mặc định của Codex", hint: "theo cấu hình Codex của bạn" }, ...out] : [];
}

/**
 * Đọc đầu ra của `agy models`: mỗi dòng "<mã>\t<tên hiển thị>" (dòng đầu "Fetching available models…" bỏ qua).
 * Các mã chỉ khác hậu tố -low/-medium/-high (cùng một model, khác mức suy nghĩ) được gộp thành một model có chọn mức.
 */
export function parseAgyModels(text: string): ModelInfo[] {
  const rows: Array<{ slug: string; label: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("\t");
    if (i <= 0) continue;
    const slug = line.slice(0, i).trim();
    const label = line.slice(i + 1).trim();
    if (!/^[A-Za-z0-9][\w.:/@+-]{0,99}$/.test(slug)) continue;
    rows.push({ slug, label: label || slug });
  }
  const groups = new Map<string, Array<{ slug: string; label: string; effort: Effort }>>();
  const order: string[] = [];
  for (const r of rows) {
    const m = /^(.*)-(low|medium|high)$/i.exec(r.slug);
    const key = m ? m[1]! : r.slug;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    if (m) groups.get(key)!.push({ ...r, effort: m[2]!.toLowerCase() as Effort });
    else groups.get(key)!.push({ ...r, effort: "medium" });
  }
  const out: ModelInfo[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    const withSuffix = g.filter((x) => x.slug !== key);
    if (withSuffix.length >= 2) {
      const variants: Partial<Record<Effort, string>> = {};
      for (const v of withSuffix) variants[v.effort] = v.slug;
      const label = withSuffix[0]!.label.replace(/\s*\((low|medium|high)\)\s*$/i, "").trim();
      out.push({ id: key, label, defaultEffort: variants.medium ? "medium" : undefined, variants });
    } else {
      for (const x of g) out.push({ id: x.slug, label: x.label, efforts: [] });
    }
  }
  return out;
}
