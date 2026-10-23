/**
 * Chủ đề có sẵn của Office: bảng màu (12 màu) và bộ phông. Bridge đọc từ chính các tệp
 * của Word / Excel / PowerPoint trên máy (.thmx, Theme Colors, Theme Fonts); add-in chỉ áp dụng.
 */

export const THEME_COLOR_KEYS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export type ThemeColors = Record<ThemeColorKey, string>;
export interface ThemeFonts {
  major: string;
  minor: string;
}

export type OfficeThemeKind = "theme" | "colors" | "fonts";
export interface OfficeTheme {
  id: string;
  /** Tên hiển thị đúng như trong Office (vd "Facet", "Blue Warm"). */
  name: string;
  kind: OfficeThemeKind;
  colors?: ThemeColors;
  fonts?: ThemeFonts;
  /** Ảnh xem trước thật của Office (data URL), nếu tệp có. */
  thumb?: string;
  /** Đường dẫn tệp .thmx trên máy (để Word áp chủ đề gốc). */
  path?: string;
  /** office = đọc từ phần mềm trên máy; builtin = danh sách dự phòng của PVTA. */
  source: "office" | "builtin";
}

const HEX = /^[0-9a-f]{6}$/i;

/** Lấy màu của một phần tử như <a:dk1> (srgbClr val, hoặc sysClr lastClr). */
function colorOf(block: string): string | undefined {
  const s = /<a:srgbClr\b[^>]*\bval="([0-9a-fA-F]{6})"/.exec(block)?.[1];
  if (s) return `#${s.toUpperCase()}`;
  const sys = /<a:sysClr\b[^>]*\blastClr="([0-9a-fA-F]{6})"/.exec(block)?.[1];
  if (sys) return `#${sys.toUpperCase()}`;
  return undefined;
}

export function parseClrScheme(xml: string): { name: string; colors: ThemeColors } | undefined {
  const m = /<a:clrScheme\b([^>]*)>([\s\S]*?)<\/a:clrScheme>/.exec(xml);
  if (!m) return undefined;
  const name = /\bname="([^"]*)"/.exec(m[1]!)?.[1] ?? "";
  const colors = {} as ThemeColors;
  for (const key of THEME_COLOR_KEYS) {
    const b = new RegExp(`<a:${key}\\b[^>]*>([\\s\\S]*?)</a:${key}>`).exec(m[2]!)?.[1];
    const c = b ? colorOf(b) : undefined;
    if (!c || !HEX.test(c.slice(1))) return undefined;
    colors[key] = c;
  }
  return { name: decodeXml(name), colors };
}

export function parseFontScheme(xml: string): { name: string; fonts: ThemeFonts } | undefined {
  const m = /<a:fontScheme\b([^>]*)>([\s\S]*?)<\/a:fontScheme>/.exec(xml);
  if (!m) return undefined;
  const name = /\bname="([^"]*)"/.exec(m[1]!)?.[1] ?? "";
  const major = /<a:majorFont>\s*<a:latin\b[^>]*\btypeface="([^"]*)"/.exec(m[2]!)?.[1];
  const minor = /<a:minorFont>\s*<a:latin\b[^>]*\btypeface="([^"]*)"/.exec(m[2]!)?.[1];
  if (!major || !minor || major.startsWith("+") || minor.startsWith("+")) return undefined;
  return { name: decodeXml(name), fonts: { major: decodeXml(major), minor: decodeXml(minor) } };
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** theme1.xml của một chủ đề: tên, màu, phông. */
export function parseThemeXml(xml: string): { name: string; colors: ThemeColors; fonts: ThemeFonts } | undefined {
  const c = parseClrScheme(xml);
  const f = parseFontScheme(xml);
  if (!c || !f) return undefined;
  const name = decodeXml(/<a:theme\b[^>]*\bname="([^"]*)"/.exec(xml)?.[1] ?? "") || c.name;
  return { name, colors: c.colors, fonts: f.fonts };
}

/** Độ sáng tương đối (0–1) của màu #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ThemeApplyArgs {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  headingFont: string;
  bodyFont: string;
}

/**
 * Đổi chủ đề Office sang tham số áp dụng của PVTA: màu chính phải đọc được trên nền trắng
 * (tiêu đề) và chữ trắng trên nền màu chính (hàng tiêu đề), nên chọn trong dk2, accent1…accent6 màu đủ tương phản.
 */
export function themeApplyArgs(colors: ThemeColors | undefined, fonts: ThemeFonts | undefined, base?: Partial<ThemeApplyArgs>): ThemeApplyArgs {
  const white = "#FFFFFF";
  const pool = colors ? [colors.accent1, colors.dk2, colors.accent2, colors.accent3, colors.accent4, colors.accent5, colors.accent6] : [];
  const readable = pool.filter((c) => contrast(c, white) >= 4.5);
  const primary = readable[0] ?? pool.sort((a, b) => contrast(b, white) - contrast(a, white))[0] ?? base?.primary ?? "#1F4E79";
  const rest = (readable.length ? readable : pool).filter((c) => c !== primary);
  const secondary = rest[0] ?? base?.secondary ?? primary;
  const accent = colors?.accent2 && colors.accent2 !== primary ? colors.accent2 : (rest[1] ?? base?.accent ?? secondary);
  const text = colors ? (luminance(colors.dk1) < 0.25 ? colors.dk1 : "#1D2330") : (base?.text ?? "#1D2330");
  return {
    primary,
    secondary,
    accent,
    text,
    headingFont: fonts?.major ?? base?.headingFont ?? "Cambria",
    bodyFont: fonts?.minor ?? base?.bodyFont ?? "Cambria",
  };
}

const C = (dk2: string, lt2: string, a: [string, string, string, string, string, string], hl = "#0563C1", fh = "#954F72"): ThemeColors => ({
  dk1: "#000000", lt1: "#FFFFFF", dk2, lt2, accent1: a[0], accent2: a[1], accent3: a[2], accent4: a[3], accent5: a[4], accent6: a[5], hlink: hl, folHlink: fh,
});

/** Dự phòng khi không đọc được tệp chủ đề của Office trên máy: vài bảng màu và bộ phông chuẩn của Office. */
export const BUILTIN_COLORS: OfficeTheme[] = [
  { id: "b-office", name: "Office", kind: "colors", source: "builtin", colors: C("#44546A", "#E7E6E6", ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"]) },
  { id: "b-office2007", name: "Office 2007 – 2010", kind: "colors", source: "builtin", colors: C("#1F497D", "#EEECE1", ["#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"], "#0000FF", "#800080") },
  { id: "b-blue", name: "Blue", kind: "colors", source: "builtin", colors: C("#17406D", "#DBEFF9", ["#0F6FC6", "#009DD9", "#0BD0D9", "#10CF9B", "#7CCA62", "#A5C249"], "#F49100", "#85DFD0") },
  { id: "b-bluewarm", name: "Blue Warm", kind: "colors", source: "builtin", colors: C("#242852", "#ACCBF9", ["#4A66AC", "#629DD1", "#297FD5", "#7F8FA9", "#5AA2AE", "#9D90A0"], "#9454C3", "#3EBBF0") },
  { id: "b-blue2", name: "Blue II", kind: "colors", source: "builtin", colors: C("#335B74", "#DFE3E5", ["#1CADE4", "#2683C6", "#27CED7", "#42BA97", "#3E8853", "#62A39F"], "#6B9F25", "#B26B02") },
  { id: "b-bluegreen", name: "Blue Green", kind: "colors", source: "builtin", colors: C("#373545", "#CEDBE6", ["#3494BA", "#58B6C0", "#75BDA7", "#7A8C8E", "#84ACB6", "#2683C6"], "#6B9F25", "#9F6715") },
  { id: "b-green", name: "Green", kind: "colors", source: "builtin", colors: C("#455F51", "#E3DED1", ["#549E39", "#8AB833", "#C0CF3A", "#029676", "#4AB5C4", "#0989B1"], "#6B9F25", "#BA6906") },
  { id: "b-orange", name: "Orange", kind: "colors", source: "builtin", colors: C("#637052", "#CCDDEA", ["#E48312", "#BD582C", "#865640", "#9B8357", "#C2BC80", "#94A088"], "#2998E3", "#8C8C8C") },
  { id: "b-grayscale", name: "Grayscale", kind: "colors", source: "builtin", colors: C("#000000", "#F7F7F7", ["#DDDDDD", "#B2B2B2", "#969696", "#808080", "#5F5F5F", "#4D4D4D"], "#5F5F5F", "#919191") },
];

export const BUILTIN_FONTS: OfficeTheme[] = [
  { id: "f-office", name: "Office (Calibri Light / Calibri)", kind: "fonts", source: "builtin", fonts: { major: "Calibri Light", minor: "Calibri" } },
  { id: "f-office2007", name: "Office 2007 – 2010 (Cambria / Calibri)", kind: "fonts", source: "builtin", fonts: { major: "Cambria", minor: "Calibri" } },
  { id: "f-arial", name: "Arial", kind: "fonts", source: "builtin", fonts: { major: "Arial", minor: "Arial" } },
  { id: "f-times", name: "Times New Roman", kind: "fonts", source: "builtin", fonts: { major: "Times New Roman", minor: "Times New Roman" } },
  { id: "f-georgia", name: "Georgia (Georgia / Georgia)", kind: "fonts", source: "builtin", fonts: { major: "Georgia", minor: "Georgia" } },
  { id: "f-century", name: "Century Gothic", kind: "fonts", source: "builtin", fonts: { major: "Century Gothic", minor: "Century Gothic" } },
  { id: "f-tahoma", name: "Tahoma", kind: "fonts", source: "builtin", fonts: { major: "Tahoma", minor: "Tahoma" } },
];

/** Nhận diện lựa chọn từ tên (model gọi theo tên hoặc mã). */
export function findOfficeTheme(list: OfficeTheme[], key: unknown): OfficeTheme | undefined {
  const k = String(key ?? "").trim().toLowerCase();
  if (!k) return undefined;
  return list.find((t) => t.id.toLowerCase() === k) ?? list.find((t) => t.name.toLowerCase() === k) ?? list.find((t) => t.name.toLowerCase().includes(k));
}
