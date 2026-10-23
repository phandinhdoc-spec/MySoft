import { isRemoteHost } from "./bridgeClient";

/** Môi trường chạy add-in: iPad (Office cho iOS, hoặc trang do máy tính trong mạng phục vụ) và màn hình cảm ứng. */
export const env = { ipad: false, touch: false };

export function detectEnv(platform?: string): typeof env {
  const loc = typeof location !== "undefined" ? location : undefined;
  env.ipad = platform === "iOS" || isRemoteHost(loc);
  let coarse = false;
  try {
    coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  } catch {
    /* bỏ qua */
  }
  env.touch = env.ipad || coarse;
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("ipad", env.ipad);
    document.documentElement.classList.toggle("touch", env.touch);
  }
  return env;
}
