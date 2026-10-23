import {
  API_PROVIDER_IDS,
  API_PROVIDERS,
  BACKEND_INFO,
  findModelInfo,
  modelsOf,
  splitApiModel,
  type ApiStatus,
  type BackendId,
  type CliBackendId,
  type ModelCatalog,
  type ModelChoice,
} from "@pvta/shared";

export interface ModelOption {
  label: string;
  value: ModelChoice;
  hint?: string;
}

/** Thứ tự nhóm trong danh sách model. */
export const GROUP_ORDER: readonly BackendId[] = ["claude", "codex", "agy", "api"];

/**
 * Model API của các nhà cung cấp đã có khóa. Đã tải được danh sách từ chính API thì hiện đủ danh sách đó
 * (thầy cô khỏi phải nhớ tên); chưa tải được thì dùng vài model gợi ý có sẵn.
 */
export function apiModels(api: ApiStatus | undefined): ModelOption[] {
  const out: ModelOption[] = [];
  const many = API_PROVIDER_IDS.filter((p) => api?.providers?.[p]?.configured).length > 1;
  for (const p of API_PROVIDER_IDS) {
    const st = api?.providers?.[p];
    if (!st?.configured) continue;
    const info = API_PROVIDERS[p];
    const prefix = many ? `${info.label.replace(/ \(.*\)$/, "")} · ` : ""; // nhiều nhà cung cấp: ghi rõ model của ai
    const builtin = new Map(info.models.map((m) => [m.id, m.label]));
    const live = st.models && st.models.length > 0 ? st.models : undefined;
    const seen = new Set<string>();
    const add = (id: string, label: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ label: `${prefix}${label}`, hint: info.label, value: { backend: "api", model: `${p}/${id}` } });
    };
    if (st.model) add(st.model, builtin.get(st.model) ?? live?.find((m) => m.id === st.model)?.label ?? st.model); // model đang chọn lên đầu nhóm
    if (live) for (const m of live) add(m.id, builtin.get(m.id) ?? m.label ?? m.id);
    else for (const m of info.models) add(m.id, m.label);
  }
  return out;
}

export function modelKey(v: ModelChoice | "auto"): string {
  return v === "auto" ? "auto" : `${v.backend}:${v.model}${v.speed ? `:${v.speed}` : ""}`;
}

/** Tên ngắn để hiện trên nút chọn model và dưới mỗi câu trả lời (tên lấy từ danh sách của chính CLI). */
export function modelLabel(v: ModelChoice, catalog?: ModelCatalog): string {
  if (v.backend === "api") {
    const p = splitApiModel(v.model);
    if (!p) return v.model;
    const known = API_PROVIDERS[p.provider].models.find((m) => m.id === p.model);
    return known ? known.label.replace(/ \(.*\)$/, "") : p.model;
  }
  const info = findModelInfo(modelsOf(catalog, v.backend as CliBackendId), v.model)?.info;
  const name = info ? info.label : v.model;
  const bolt = v.speed ? " ⚡" : "";
  if (v.backend === "claude" || v.backend === "codex") return `${BACKEND_INFO[v.backend].label} ${name}${bolt}`.replace("Codex Mặc định của Codex", "Codex");
  return `${name}${bolt}`;
}
