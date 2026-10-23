import { findOfficeTheme, themeApplyArgs, type OfficeHost, type OfficeTheme, type ThemeColors } from "@pvta/shared";
import { getThemeCatalog } from "../themeStore";
import { excelTool } from "./excel";
import { powerpointTool } from "./powerpoint";
import { wordTool } from "./word";

export interface ThemeSelection {
  /** Chủ đề có sẵn của Office (kèm màu, phông, và tệp .thmx nếu có). */
  theme?: OfficeTheme;
  /** Ghi đè bảng màu / bộ phông (chọn riêng như Thiết kế → Màu, Phông). */
  colors?: OfficeTheme;
  fonts?: OfficeTheme;
}

const APPLY: Record<OfficeHost, string> = { word: "office_word_apply_theme", excel: "office_excel_apply_theme", powerpoint: "office_ppt_apply_theme" };

const PPT_KEYS: Array<[keyof ThemeColors, string]> = [
  ["dk1", "Dark1"], ["lt1", "Light1"], ["dk2", "Dark2"], ["lt2", "Light2"],
  ["accent1", "Accent1"], ["accent2", "Accent2"], ["accent3", "Accent3"], ["accent4", "Accent4"], ["accent5", "Accent5"], ["accent6", "Accent6"],
  ["hlink", "Hyperlink"], ["folHlink", "FollowedHyperlink"],
];

const isSet = (api: string, v: string): boolean => {
  try {
    return Office.context.requirements.isSetSupported(api, v);
  } catch {
    return false;
  }
};

/** Word bản desktop: áp chủ đề gốc (.thmx) của Office, y như Thiết kế → Chủ đề. */
async function wordNative(path: string): Promise<boolean> {
  if (!isSet("WordApiDesktop", "1.4")) return false;
  try {
    await Word.run(async (ctx) => {
      (ctx.document as unknown as { applyTheme(name: string): void }).applyTheme(path);
      await ctx.sync();
    });
    return true;
  } catch {
    return false;
  }
}

/** PowerPoint: đổi bảng màu chủ đề của slide master (mọi hình dùng màu chủ đề tự đổi theo). */
async function pptMasterColors(colors: ThemeColors): Promise<boolean> {
  if (!isSet("PowerPointApi", "1.10")) return false;
  try {
    await PowerPoint.run(async (ctx) => {
      const masters = ctx.presentation.slideMasters;
      masters.load("items");
      await ctx.sync();
      for (const m of masters.items) {
        const scheme = (m as unknown as { themeColorScheme: { setThemeColor(k: string, v: string): void } }).themeColorScheme;
        for (const [key, name] of PPT_KEYS) scheme.setThemeColor(name, colors[key]);
      }
      await ctx.sync();
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Áp chủ đề có sẵn. Ưu tiên cách "thật" của từng phần mềm (Word: chủ đề gốc; PowerPoint: màu chủ đề của master),
 * rồi luôn áp thêm màu và phông qua kiểu/định dạng để cho kết quả nhìn thấy được ở mọi phiên bản Office.
 */
export async function applySelection(host: OfficeHost, sel: ThemeSelection): Promise<string> {
  const colorsSrc = sel.colors ?? sel.theme;
  const colors = colorsSrc?.colors;
  const fonts = (sel.fonts ?? sel.theme)?.fonts;
  if (!colors && !fonts) throw new Error("Chưa chọn chủ đề, bảng màu hay bộ phông.");
  const notes: string[] = [];
  let native = false;
  if (host === "word" && sel.theme?.path && !sel.colors && !sel.fonts) {
    native = await wordNative(sel.theme.path);
    if (native) notes.push(`chủ đề gốc “${sel.theme.name}” của Word`);
  }
  if (host === "powerpoint" && colors) {
    native = await pptMasterColors(colors);
    if (native) notes.push("màu chủ đề của slide master");
  }
  const args = themeApplyArgs(colors, fonts);
  const fn = host === "word" ? wordTool : host === "excel" ? excelTool : powerpointTool;
  // Word đã áp chủ đề gốc thì kiểu đề mục đã theo chủ đề: không ghi đè thêm.
  if (!(host === "word" && native)) {
    const r = await fn(APPLY[host], { ...args });
    notes.push(String(r));
  }
  return notes.join("; ");
}

/** Công cụ của model: {theme, colors?, fonts?} theo mã hoặc tên trong danh mục có sẵn. */
export async function applyFromCatalog(host: OfficeHost, a: Record<string, unknown>): Promise<string> {
  const cat = getThemeCatalog();
  if (!cat) throw new Error("Chưa đọc được danh mục chủ đề. Gọi office_theme_list trước.");
  const theme = a.theme !== undefined ? findOfficeTheme([...cat.themes, ...cat.colors], a.theme) : undefined;
  const colors = a.colors !== undefined ? findOfficeTheme(cat.colors, a.colors) : undefined;
  const fonts = a.fonts !== undefined ? findOfficeTheme(cat.fonts, a.fonts) : undefined;
  if (a.theme !== undefined && !theme) throw new Error(`Không có chủ đề “${String(a.theme)}” trong danh mục. Gọi office_theme_list để xem.`);
  if (a.fonts !== undefined && !fonts) throw new Error(`Không có bộ phông “${String(a.fonts)}” trong danh mục.`);
  // Mục lấy từ danh sách bảng màu chỉ mang màu: coi như bảng màu.
  const sel: ThemeSelection = theme && theme.kind === "colors" ? { colors: theme, fonts, ...(colors ? { colors } : {}) } : { theme, colors, fonts };
  return applySelection(host, sel);
}
