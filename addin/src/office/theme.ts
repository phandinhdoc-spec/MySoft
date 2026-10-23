/** Đọc tham số chủ đề từ model hoặc từ thẻ Chủ đề; màu phải là #rrggbb. */
export interface ThemeArgs {
  primary: string;
  secondary?: string;
  accent?: string;
  text?: string;
  headingFont?: string;
  bodyFont?: string;
}

const color = (v: unknown): string | undefined => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
const font = (v: unknown): string | undefined => (typeof v === "string" && /^[\p{L}\p{N} .'-]{1,60}$/u.test(v.trim()) ? v.trim() : undefined);

export function themeArgs(a: Record<string, unknown>): ThemeArgs {
  const primary = color(a.primary);
  if (!primary) throw new Error("Thiếu màu chính 'primary' dạng #rrggbb (lấy từ office_palette).");
  return { primary, secondary: color(a.secondary), accent: color(a.accent), text: color(a.text), headingFont: font(a.headingFont), bodyFont: font(a.bodyFont) };
}
