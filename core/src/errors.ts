import type { ErrorKind } from "@pvta/shared";

export class EngineError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/** Phân loại lỗi CLI: cờ, phiên, model, đăng nhập, bị từ chối, khác (đặc tả mục 3). */
export function classifyError(text: string): ErrorKind {
  const t = text.toLowerCase();
  if (/unknown (option|flag|argument)|unrecognized (option|argument|flag)|invalid option|unexpected argument|flag provided but not defined/.test(t))
    return "flag";
  if (/(session|conversation)[^\n]{0,60}(not found|expired|invalid|no such|does not exist|could not be)|no (session|conversation) found/.test(t))
    return "session";
  if (/issue with the selected model|available models|(unknown|invalid|unsupported|unavailable)[^\n]{0,20}model|model[^\n]{0,60}(not found|unavailable|not supported|does not exist|invalid)/.test(t))
    return "model";
  if (/not logged in|please (run )?.*log ?in|authenticat|unauthori[sz]ed|\b401\b|invalid api key|credentials|sign in/.test(t))
    return "auth";
  return "other";
}

/** Trích tên cờ không nhận ra từ thông báo lỗi. */
export function extractBadFlag(text: string): string | undefined {
  const m = /(--[a-z][a-z0-9-]*)/i.exec(text);
  return m?.[1];
}

/** Có nên đổi sang model khác khi lỗi này không? Luôn là KHÔNG (đặc tả mục 3). */
export const NEVER_SWITCH_MODEL = true;
