/** Các biến khóa API phải xóa để CLI luôn dùng gói đăng ký (đặc tả mục 3). */
export const API_KEY_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
] as const;

export function cleanEnv(env: NodeJS.ProcessEnv, allowApiKeys = false): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  if (!allowApiKeys) for (const k of API_KEY_VARS) delete out[k];
  return out;
}
