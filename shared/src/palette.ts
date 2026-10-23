/** Bảng màu và cặp phông dùng chung cho bridge (công cụ của model) và add-in (thẻ Chủ đề). */


function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const [r1, g1, b1] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

export const MOODS: Record<string, { h: number; s: number }> = {
  calm: { h: 205, s: 55 },
  energetic: { h: 18, s: 85 },
  nature: { h: 140, s: 50 },
  serious: { h: 222, s: 35 },
  warm: { h: 32, s: 75 },
};

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
}

export function makePalette(args: { base?: string; mood?: string; dark?: boolean }): Palette {
  const fromBase = args.base ? hexToHsl(args.base) : null;
  const mood = MOODS[args.mood ?? "calm"] ?? MOODS.calm!;
  const h = fromBase?.h ?? mood.h;
  const s = clamp(fromBase?.s ?? mood.s, 25, 90);
  const dark = args.dark === true;
  return {
    primary: hslToHex(h, s, dark ? 62 : 38),
    secondary: hslToHex(h + 30, s * 0.8, dark ? 68 : 45),
    accent: hslToHex(h + 180, clamp(s + 10, 40, 90), dark ? 65 : 50),
    background: dark ? hslToHex(h, 20, 10) : hslToHex(h, 25, 98),
    surface: dark ? hslToHex(h, 18, 16) : hslToHex(h, 25, 93),
    text: dark ? hslToHex(h, 15, 94) : hslToHex(h, 30, 14),
    mutedText: dark ? hslToHex(h, 10, 70) : hslToHex(h, 15, 38),
  };
}

// ---- Cặp font ----

export const FONT_PAIRS = [
  { heading: "Cambria", body: "Cambria", note: "Kiểu LaTeX: chữ có chân, hợp công thức (Cambria Math), có sẵn trong Office" },
  { heading: "Georgia", body: "Georgia", note: "Kiểu Typst: chữ có chân hiện đại, thoáng, dễ đọc trên màn hình lớp học" },
  { heading: "Times New Roman", body: "Times New Roman", note: "Cổ điển, đề thi và văn bản hành chính" },
  { heading: "Arial", body: "Georgia", note: "Đề mục không chân, thân bài có chân (sách hiện đại)" },
  { heading: "Be Vietnam Pro", body: "Noto Sans", note: "Hỗ trợ tiếng Việt tốt, cần cài thêm font" },
] as const;


// ---- Chủ đề (bảng màu + cặp phông) ----

/** Chữ trắng hay đen dễ đọc hơn trên một nền (theo độ chói tương đối, WCAG). */
export function onColor(hex: string): "#ffffff" | "#1d2330" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // So độ tương phản với trắng và với chữ tối, chọn bên cao hơn.
  const white = 1.05 / (L + 0.05);
  const dark = (L + 0.05) / (0.0184 + 0.05);
  return white >= dark ? "#ffffff" : "#1d2330";
}

/** Một chủ đề để áp vào tài liệu: màu (đã tính sẵn) và cặp phông. */
export interface Theme extends Palette {
  headingFont: string;
  bodyFont: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  /** Dùng cho môn / loại tài liệu nào. */
  hint: string;
  mood: keyof typeof MOODS;
  base?: string;
  fonts: number;
  /** Màu đặt thẳng (kiểu LaTeX/Typst: đề mục đen, không tô màu); không có thì tính từ mood/base. */
  palette?: Partial<Palette>;
}

const INK: Palette = { primary: "#000000", secondary: "#262626", accent: "#444444", background: "#ffffff", surface: "#f4f4f4", text: "#000000", mutedText: "#555555" };

/**
 * Mẫu chủ đề: hai kiểu trình bày lấy từ LaTeX và Typst (chữ đen, đề mục đậm không màu) đứng đầu,
 * rồi các bản có một màu nhấn nhẹ cho bài giảng chiếu màn hình. Không dùng màu và phông mặc định của Office.
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "latex", name: "Kiểu LaTeX", hint: "Giáo trình, đề thi, tài liệu in: chữ có chân, đề mục đen", mood: "serious", fonts: 0, palette: INK },
  { id: "typst", name: "Kiểu Typst", hint: "Tài liệu thoáng, hiện đại: Georgia, đề mục đen gọn", mood: "serious", fonts: 1, palette: { ...INK, primary: "#111111", secondary: "#333333", text: "#1a1a1a" } },
  { id: "latex-xanh", name: "LaTeX nhấn xanh", hint: "Bài giảng, báo cáo: như LaTeX, đề mục xanh than", mood: "serious", fonts: 0, palette: { ...INK, primary: "#1b2f55", secondary: "#2f4a7a", accent: "#7a1f2b" } },
  { id: "typst-nhan", name: "Typst nhấn màu", hint: "Slide, phiếu bài tập: như Typst, một màu nhấn xanh ngọc", mood: "calm", fonts: 1, palette: { ...INK, primary: "#0b5c63", secondary: "#2a7a80", accent: "#b4472b", text: "#1a1a1a" } },
  { id: "co-dien", name: "Cổ điển", hint: "Văn bản hành chính, báo cáo trang trọng", mood: "serious", fonts: 2, palette: INK },
];

export function buildTheme(o: { base?: string; mood?: string; dark?: boolean; fonts?: number }): Theme {
  const p = makePalette(o);
  const f = FONT_PAIRS[Math.min(Math.max(o.fonts ?? 0, 0), FONT_PAIRS.length - 1)]!;
  return { ...p, headingFont: f.heading, bodyFont: f.body };
}

export function presetTheme(id: string, dark = false): Theme | undefined {
  const p = THEME_PRESETS.find((x) => x.id === id);
  if (!p) return undefined;
  const t = buildTheme({ base: p.base, mood: p.mood, dark, fonts: p.fonts });
  return p.palette && !dark ? { ...t, ...p.palette } : t;
}
