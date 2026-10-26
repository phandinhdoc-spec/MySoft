import type { ApiProvider, ApiStatus, BackendId, Capabilities, CliBackendId, ModelChoice } from "./protocol.js";

/** Thông tin hiển thị và cách cài cho từng backend (dùng cho cả bridge và add-in). */
export interface BackendInfo {
  id: BackendId;
  /** Tên ngắn hiện trong danh sách model. */
  label: string;
  /** Tên đầy đủ của sản phẩm. */
  product: string;
  /** Gói đăng ký cần có. */
  plan: string;
  /** Lệnh cài (mac = macOS/Linux, win = Windows PowerShell). Rỗng với API. */
  install?: { mac: string; win: string; npm?: string };
  /** Việc làm sau khi cài (đăng nhập). */
  login?: string;
  docs?: string;
}

export const BACKEND_INFO: Record<BackendId, BackendInfo> = {
  claude: {
    id: "claude",
    label: "Claude",
    product: "Claude Code",
    plan: "Claude Pro/Max/Team/Enterprise (gói Claude miễn phí không dùng được)",
    install: {
      mac: "curl -fsSL https://claude.ai/install.sh | bash",
      win: "irm https://claude.ai/install.ps1 | iex",
      npm: "npm install -g @anthropic-ai/claude-code",
    },
    login: "Chạy lệnh claude một lần và đăng nhập trong trình duyệt.",
    docs: "https://code.claude.com/docs/en/setup",
  },
  codex: {
    id: "codex",
    label: "Codex",
    product: "OpenAI Codex CLI",
    plan: "Tài khoản ChatGPT: gói Free dùng được (hạn mức thấp), Plus/Pro/Business cao hơn",
    install: {
      mac: "npm install -g @openai/codex",
      win: "npm install -g @openai/codex",
    },
    login: "Chạy codex login và chọn Sign in with ChatGPT.",
    docs: "https://developers.openai.com/codex/cli",
  },
  agy: {
    id: "agy",
    label: "Gemini (agy)",
    product: "Google Antigravity CLI",
    plan: "Tài khoản Google (hạn mức miễn phí theo tuần khá thấp; Google AI Pro thoải mái hơn)",
    install: {
      mac: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      win: "irm https://antigravity.google/cli/install.ps1 | iex",
    },
    login: "Chạy agy một lần và đăng nhập tài khoản Google.",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    product: "OpenCode CLI",
    plan: "Tự chọn nhà cung cấp: có model miễn phí của OpenCode Zen, hoặc đăng nhập/khóa của nhà cung cấp khác",
    install: {
      mac: "brew install sst/tap/opencode",
      win: "npm install -g opencode-ai",
      npm: "npm install -g opencode-ai",
    },
    login: "Chạy opencode auth login để thêm nhà cung cấp (model miễn phí dùng được ngay).",
    docs: "https://opencode.ai/docs",
  },
  api: {
    id: "api",
    label: "API",
    product: "Khóa API (trả theo lượt dùng)",
    plan: "Khóa API của Anthropic, OpenAI, Google hoặc máy chủ tương thích OpenAI (vd Ollama)",
  },
};

/** Thứ tự ưu tiên khi chọn Auto: nhanh và rẻ trước. */
export const AUTO_ORDER: readonly CliBackendId[] = ["agy", "claude", "codex", "opencode"];

/** Model mặc định của từng backend (dùng cho Auto). */
export const DEFAULT_MODEL: Record<CliBackendId, string> = {
  agy: "gemini-3.8-flash-medium",
  claude: "sonnet",
  codex: "default",
  opencode: "default",
};

export interface ApiProviderInfo {
  id: ApiProvider;
  label: string;
  /** Địa chỉ gốc mặc định (giao thức OpenAI) hoặc của Anthropic. */
  baseUrl: string;
  protocol: "anthropic" | "openai";
  needsKey: boolean;
  defaultModel: string;
  models: Array<{ id: string; label: string }>;
  keyHint: string;
  /** Địa chỉ cố định của nhà cung cấp: hiện sẵn (chỉ đọc), thầy cô không phải nhập. */
  fixedUrl?: boolean;
  /** Danh sách model tải được ngay khi chọn nhà cung cấp, chưa cần khóa. */
  publicModels?: boolean;
}

export const API_PROVIDERS: Record<ApiProvider, ApiProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    protocol: "anthropic",
    needsKey: true,
    defaultModel: "claude-sonnet-5-5",
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (nhanh)" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
    ],
    keyHint: "Khóa bắt đầu bằng sk-ant-, lấy ở console.anthropic.com",
  },
  openai: {
    id: "openai",
    label: "OpenAI (GPT)",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai",
    needsKey: true,
    defaultModel: "gpt-5.4-mini",
    models: [
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini (nhanh)" },
      { id: "gpt-5.5", label: "GPT-5.5" },
    ],
    keyHint: "Khóa bắt đầu bằng sk-, lấy ở platform.openai.com",
  },
  gemini: {
    id: "gemini",
    label: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    protocol: "openai",
    needsKey: true,
    defaultModel: "gemini-flash-latest",
    models: [
      { id: "gemini-flash-latest", label: "Gemini Flash (nhanh)" },
      { id: "gemini-pro-latest", label: "Gemini Pro" },
    ],
    keyHint: "Khóa lấy ở aistudio.google.com",
  },
  commandcode: {
    id: "commandcode",
    label: "Command Code (Provider API)",
    baseUrl: "https://api.commandcode.ai/provider/v1",
    protocol: "openai",
    needsKey: true,
    defaultModel: "deepseek/deepseek-v4-flash",
    models: [{ id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" }],
    keyHint: "Tạo khóa ở commandcode.ai/settings/keys",
    fixedUrl: true,
    publicModels: true,
  },
  compatible: {
    id: "compatible",
    label: "Tương thích OpenAI (Ollama, LM Studio…)",
    baseUrl: "http://127.0.0.1:11434/v1",
    protocol: "openai",
    needsKey: false,
    defaultModel: "",
    models: [],
    keyHint: "Máy chủ cục bộ thường không cần khóa",
  },
};

export const API_PROVIDER_IDS = Object.keys(API_PROVIDERS) as ApiProvider[];

/** Mã model của backend api có dạng "<nhà cung cấp>/<model>". */
export function splitApiModel(model: string): { provider: ApiProvider; model: string } | undefined {
  const i = model.indexOf("/");
  if (i <= 0) return undefined;
  const p = model.slice(0, i) as ApiProvider;
  if (!API_PROVIDER_IDS.includes(p)) return undefined;
  const m = model.slice(i + 1);
  return m ? { provider: p, model: m } : undefined;
}

export function isBackendReady(id: BackendId, caps: Capabilities | undefined, api: ApiStatus | undefined): boolean {
  if (id === "api") return API_PROVIDER_IDS.some((p) => api?.providers?.[p]?.configured);
  return caps?.[id]?.installed === true;
}

/** Danh sách backend dùng được trên máy này. */
export function readyBackends(caps: Capabilities | undefined, api: ApiStatus | undefined): BackendId[] {
  return ([...AUTO_ORDER, "api"] as BackendId[]).filter((b) => isBackendReady(b, caps, api));
}

/**
 * Auto: model mặc định của backend đầu tiên có trên máy (agy → claude → codex → API).
 * undefined = máy chưa có backend nào.
 */
export function resolveAuto(caps: Capabilities | undefined, api: ApiStatus | undefined): ModelChoice | undefined {
  for (const b of AUTO_ORDER) if (caps?.[b]?.installed === true) return { backend: b, model: DEFAULT_MODEL[b] };
  for (const p of API_PROVIDER_IDS) {
    const st = api?.providers?.[p];
    if (!st?.configured) continue;
    const model = st.model || API_PROVIDERS[p].defaultModel;
    if (model) return { backend: "api", model: `${p}/${model}` };
  }
  return undefined;
}
