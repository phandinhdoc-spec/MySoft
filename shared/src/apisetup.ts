import { API_PROVIDERS } from "./backends.js";
import type { ApiModelEntry, ApiProvider } from "./protocol.js";

/**
 * Điền nhanh API: thầy cô dán nguyên đoạn lệnh/cấu hình (curl, dòng .env, JSON, hoặc chỉ khóa + địa chỉ)
 * lấy từ trang hướng dẫn của nhà cung cấp, PVTA tự tách ra nhà cung cấp, khóa, địa chỉ, model.
 * Hàm thuần: không gọi mạng, không ghi nhật ký (đoạn dán có khóa bí mật).
 */
export interface QuickSetup {
  provider?: ApiProvider;
  key?: string;
  /** Chỉ có khi khác địa chỉ mặc định của nhà cung cấp. */
  baseUrl?: string;
  model?: string;
}

const MAX_INPUT = 20_000;
const MODEL_RE = /^[A-Za-z0-9][\w.:/@+-]{0,99}$/;

/** Khóa còn là chỗ trống ($OPENAI_API_KEY, <key>, YOUR_API_KEY…) thì bỏ qua. */
function plausibleKey(v: string): boolean {
  if (v.length < 8 || v.length > 500) return false;
  if (/[$<>{}()[\]`\\]/.test(v)) return false;
  if (/^(your|xxx|key|token|api|bearer|null|none|undefined|changeme|example|placeholder|sk-\.\.\.|sk-xxx)/i.test(v)) return false;
  if (/^(sk-)?[x.*]{4,}$/i.test(v)) return false;
  return /^[A-Za-z0-9._~+/=-]+$/.test(v);
}

function stripQuotes(s: string): string {
  return s.replace(/^["'`]+|["'`,;]+$/g, "");
}

export function detectProviderByKey(key: string): ApiProvider | undefined {
  if (/^sk-ant-/i.test(key)) return "anthropic";
  if (/^AIza[\w-]{20,}$/.test(key)) return "gemini";
  if (/^sk-(proj-|svcacct-|admin-)?[\w-]{16,}$/.test(key)) return "openai";
  return undefined;
}

function isLocalHost(host: string): boolean {
  return /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[^.]+\.local)$/i.test(host) || /^(10|192\.168)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export function detectProviderByUrl(url: string): ApiProvider | undefined {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "api.openai.com") return "openai";
  if (host === "generativelanguage.googleapis.com") return "gemini";
  if (host === "api.commandcode.ai") return "commandcode";
  return "compatible";
}

/** Bỏ phần đường dẫn thao tác (/chat/completions, /messages, /models…) để còn địa chỉ gốc API. */
export function normalizeBaseUrl(raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(stripQuotes(raw.trim()));
  } catch {
    return undefined;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  let p = u.pathname.replace(/\/+$/, "");
  // Gemini gốc (…/v1beta/models/<model>:generateContent) → cổng tương thích OpenAI của Gemini.
  if (u.hostname === "generativelanguage.googleapis.com" && !/\/openai(\/|$)/.test(p)) p = "/v1beta/openai";
  p = p.replace(/\/(chat\/completions|completions|responses|messages|embeddings|models)(\/.*)?$/i, "");
  if (p === "" && isLocalHost(u.hostname)) p = "/v1"; // Ollama, LM Studio…
  return `${u.protocol}//${u.host}${p}`;
}

function sameUrl(a: string, b: string): boolean {
  return a.replace(/\/+$/, "").toLowerCase() === b.replace(/\/+$/, "").toLowerCase();
}

/** Tên biến/trường → loại thông tin. */
function fieldKind(name: string): "key" | "url" | "model" | undefined {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/(apikey|authtoken|accesstoken|secret|^token$|^key$)$/.test(n) || /^(apikey|key|token)$/.test(n)) return "key";
  if (/(baseurl|apibase|apiurl|endpoint)$/.test(n) || /^(baseurl|url|host)$/.test(n)) return "url";
  if (/^(model|modelname|modelid)$/.test(n) || /(^|[a-z])model$/.test(n)) return "model";
  return undefined;
}

export function parseQuickSetup(input: string): QuickSetup {
  const text = input.slice(0, MAX_INPUT).replace(/\\\r?\n/g, " "); // nối dòng của lệnh curl (\)
  let key: string | undefined;
  let url: string | undefined;
  let model: string | undefined;
  let hint: ApiProvider | undefined; // gợi ý từ tên biến (ANTHROPIC_*, OPENAI_*, GEMINI_*)

  // 1) Tiêu đề HTTP: Authorization: Bearer …, x-api-key: …
  for (const m of text.matchAll(/(?:authorization|x-api-key|x-goog-api-key|api-key)["']?\s*[:=]\s*["']?(?:bearer\s+)?([^\s"'\\]+)/gi)) {
    const v = stripQuotes(m[1]!);
    if (plausibleKey(v)) {
      key = v;
      break;
    }
  }

  // 2) Địa chỉ: ưu tiên địa chỉ có dạng đường dẫn API.
  const urls = [...text.matchAll(/https?:\/\/[^\s"'`<>\\)]+/gi)].map((m) => stripQuotes(m[0]));
  const apiLike = urls.find((u) => /\/(v\d|chat\/completions|messages|models|openai|api)\b/i.test(u));
  const chosen = apiLike ?? urls[0];
  if (chosen) {
    // Gemini: ?key=… nằm ngay trong địa chỉ.
    const q = chosen.match(/[?&]key=([^&\s]+)/i);
    if (q && !key && plausibleKey(q[1]!)) key = q[1]!;
    const g = chosen.match(/\/models\/([^/:?\s]+)(?::\w+)?/i);
    if (g && !model && MODEL_RE.test(g[1]!)) model = g[1]!;
    url = chosen;
  }

  // 3) Dòng KEY=value, "key": "value" (biến môi trường, JSON, YAML).
  for (const m of text.matchAll(/(?:^|[\s,{;(])["']?([A-Za-z_][\w.-]*)["']?\s*[:=]\s*["']?([^\s"',;}]+)/g)) {
    const name = m[1]!;
    const val = stripQuotes(m[2]!);
    const kind = fieldKind(name);
    if (!kind) continue;
    if (kind === "key" && !key && plausibleKey(val)) {
      key = val;
      if (/^anthropic|claude/i.test(name)) hint = "anthropic";
      else if (/^openai/i.test(name)) hint = "openai";
      else if (/^(gemini|google)/i.test(name)) hint = "gemini";
    } else if (kind === "url" && !url && /^https?:\/\//i.test(val)) {
      url = val;
      if (/^anthropic/i.test(name)) hint = hint ?? "anthropic";
    } else if (kind === "model" && !model && MODEL_RE.test(val) && !/^https?:/i.test(val)) {
      model = val;
    }
  }

  // 4) Cờ dòng lệnh: --model x, -m x
  if (!model) {
    const f = text.match(/(?:--model|\s-m)[\s=]+["']?([A-Za-z0-9][\w.:/@+-]{0,99})/);
    if (f && MODEL_RE.test(f[1]!)) model = f[1]!;
  }

  // 5) Khóa rời (dán mỗi khóa): theo tiền tố đã biết.
  if (!key) {
    const bare = text.match(/\b(sk-ant-[\w-]{20,}|sk-(?:proj-|svcacct-|admin-)?[\w-]{20,}|AIza[\w-]{30,})\b/);
    if (bare && plausibleKey(bare[1]!)) key = bare[1]!;
  }
  // Chỉ dán đúng một chuỗi dài không dấu cách, không phải địa chỉ: coi là khóa.
  if (!key && !url && /^[A-Za-z0-9._~+/-]{24,}={0,2}$/.test(text.trim()) && plausibleKey(text.trim())) key = text.trim();

  let baseUrl = url ? normalizeBaseUrl(url) : undefined;
  let provider: ApiProvider | undefined = (key && detectProviderByKey(key)) || undefined;
  const byUrl = baseUrl ? detectProviderByUrl(baseUrl) : undefined;
  if (byUrl && byUrl !== "compatible") provider = byUrl;
  else if (byUrl === "compatible") {
    // Địa chỉ riêng: khóa sk-ant-… hoặc biến ANTHROPIC_* nghĩa là máy chủ nói giao thức Anthropic.
    provider = provider === "anthropic" || hint === "anthropic" ? "anthropic" : "compatible";
  }
  provider ??= hint;

  // Địa chỉ trùng mặc định của nhà cung cấp thì không cần lưu.
  if (provider && baseUrl && provider !== "compatible" && sameUrl(baseUrl, API_PROVIDERS[provider].baseUrl)) baseUrl = undefined;
  if (provider === "compatible" && !baseUrl) baseUrl = undefined;

  const out: QuickSetup = {};
  if (provider) out.provider = provider;
  if (key) out.key = key;
  if (baseUrl) out.baseUrl = baseUrl;
  if (model) out.model = model;
  return out;
}

/** Che khóa khi hiển thị: sk-ant-…a1b2 */
export function maskKey(key: string): string {
  if (key.length <= 10) return "••••";
  const head = /^sk-ant-/i.test(key) ? "sk-ant-" : key.slice(0, 3);
  return `${head}…${key.slice(-4)}`;
}

// ---- Danh sách model lấy từ API ----

/** Model không dùng để trò chuyện (nhúng, giọng nói, ảnh, kiểm duyệt…). */
const NON_CHAT = /(embed|rerank|whisper|tts|transcribe|moderation|speech|realtime|audio|dall-e|gpt-image|imagen|veo|aqa|davinci|babbage)/i;
const NON_CHAT_STRICT = /(image|vision-preview|search-preview|computer-use|live|robotics)/i;

/**
 * Làm sạch danh sách model: bỏ tiền tố "models/" (Gemini), bỏ model không trò chuyện được,
 * bỏ trùng, xếp bản mới lên trước (Anthropic đã trả theo thứ tự mới nhất nên giữ nguyên).
 */
export function cleanModelList(provider: ApiProvider, raw: ApiModelEntry[], limit = 300): ApiModelEntry[] {
  const seen = new Set<string>();
  const out: ApiModelEntry[] = [];
  for (const e of raw) {
    const id = String(e.id ?? "").replace(/^models\//, "").trim();
    if (!id || !MODEL_RE.test(id) || seen.has(id)) continue;
    if (NON_CHAT.test(id)) continue;
    if ((provider === "openai" || provider === "gemini") && NON_CHAT_STRICT.test(id)) continue;
    seen.add(id);
    out.push({ id, label: e.label && e.label !== id ? e.label : undefined });
  }
  if (provider !== "anthropic") out.sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
  return out.slice(0, limit);
}
