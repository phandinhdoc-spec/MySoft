import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import {
  BUILTIN_COLORS,
  BUILTIN_FONTS,
  parseClrScheme,
  parseFontScheme,
  parseThemeXml,
  type OfficeHost,
  type OfficeTheme,
} from "@pvta/shared";

export interface ThemeCatalog {
  host: OfficeHost;
  themes: OfficeTheme[];
  colors: OfficeTheme[];
  fonts: OfficeTheme[];
  /** office = đọc từ phần mềm trên máy; builtin = danh sách dự phòng. */
  source: "office" | "builtin";
  dirs: string[];
}

const APP: Record<OfficeHost, string> = { word: "Word", excel: "Excel", powerpoint: "PowerPoint" };
const MAX_THMX = 6 * 1024 * 1024;
const MAX_THUMB = 60 * 1024;
const MAX_ITEMS = 120;

/** Thư mục có thể chứa chủ đề của Office trên máy này (theo hệ điều hành và phần mềm). */
export function themeRoots(host: OfficeHost, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string[] {
  // Thư mục chủ đề do người dùng chỉ định thêm (vd Office cài ở chỗ lạ): PVTA_THEME_DIRS, cách nhau bằng dấu phân cách đường dẫn.
  const out: string[] = (env["PVTA_THEME_DIRS"] ?? "").split(path.delimiter).map((x) => x.trim()).filter(Boolean);
  if (platform === "win32") {
    const pf = [env["ProgramFiles"], env["ProgramFiles(x86)"], env["ProgramW6432"], "C:\\Program Files", "C:\\Program Files (x86)"].filter((x): x is string => !!x);
    for (const base of new Set(pf)) {
      for (const sub of ["Microsoft Office\\root\\Document Themes 16", "Microsoft Office\\Document Themes 16", "Microsoft Office\\Office16\\Document Themes 16", "Microsoft Office\\root\\Office16\\Document Themes 16", "Microsoft Office\\Office15\\Document Themes 15"]) out.push(path.join(base, sub));
    }
    if (env["APPDATA"]) out.push(path.join(env["APPDATA"], "Microsoft", "Templates", "Document Themes"));
  } else if (platform === "darwin") {
    const app = `Microsoft ${APP[host]}.app`;
    for (const base of ["/Applications", path.join(home, "Applications")]) {
      out.push(path.join(base, app, "Contents", "Resources", "Office Themes"));
      out.push(path.join(base, app, "Contents", "Resources", "Themes"));
    }
    out.push(path.join(home, "Library", "Group Containers", "UBF8T346G9.Office", "User Content", "Themes"));
  }
  return out;
}

function walk(dir: string, depth: number, out: string[]): void {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0 && !e.name.startsWith(".")) walk(p, depth - 1, out);
    } else out.push(p);
  }
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Đọc một tệp .thmx: tên, màu, phông và ảnh xem trước. */
export function readThmx(file: string): OfficeTheme | undefined {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_THMX) return undefined;
    const files = unzipSync(new Uint8Array(fs.readFileSync(file)), {
      filter: (f) => /^theme\/theme\/theme\d*\.xml$/i.test(f.name) || /^docProps\/thumbnail\.(jpe?g|png)$/i.test(f.name),
    });
    const xmlKey = Object.keys(files).find((k) => /theme\/theme\/theme\d*\.xml$/i.test(k));
    if (!xmlKey) return undefined;
    const parsed = parseThemeXml(strFromU8(files[xmlKey]!));
    if (!parsed) return undefined;
    const name = parsed.name && !/^office theme$/i.test(parsed.name) ? parsed.name : path.basename(file, path.extname(file));
    const tk = Object.keys(files).find((k) => /thumbnail\.(jpe?g|png)$/i.test(k));
    let thumb: string | undefined;
    if (tk && files[tk]!.length <= MAX_THUMB) {
      const mime = /png$/i.test(tk) ? "image/png" : "image/jpeg";
      thumb = `data:${mime};base64,${Buffer.from(files[tk]!).toString("base64")}`;
    }
    return { id: `t-${slug(path.basename(file, path.extname(file)))}`, name, kind: "theme", source: "office", colors: parsed.colors, fonts: parsed.fonts, path: file, ...(thumb ? { thumb } : {}) };
  } catch {
    return undefined;
  }
}

function readXmlTheme(file: string, kind: "colors" | "fonts"): OfficeTheme | undefined {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 200_000) return undefined;
    const xml = fs.readFileSync(file, "utf8");
    const base = path.basename(file, ".xml");
    if (kind === "colors") {
      const c = parseClrScheme(xml);
      return c ? { id: `c-${slug(base)}`, name: base, kind, source: "office", colors: c.colors } : undefined;
    }
    const f = parseFontScheme(xml);
    return f ? { id: `f-${slug(base)}`, name: base, kind, source: "office", fonts: f.fonts } : undefined;
  } catch {
    return undefined;
  }
}

/** Quét các thư mục chủ đề và dựng danh mục (có sẵn của Office, không phải do PVTA tự nghĩ ra). */
export function scanThemes(host: OfficeHost, roots = themeRoots(host)): ThemeCatalog {
  const found = new Map<string, OfficeTheme>();
  const dirs: string[] = [];
  const seenFiles = new Set<string>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    dirs.push(root);
    const files: string[] = [];
    walk(root, 3, files);
    for (const f of files) {
      if (seenFiles.has(f)) continue;
      seenFiles.add(f);
      const ext = path.extname(f).toLowerCase();
      const parent = path.basename(path.dirname(f)).toLowerCase();
      let t: OfficeTheme | undefined;
      if (ext === ".thmx") t = readThmx(f);
      else if (ext === ".xml" && /theme colors/.test(parent)) t = readXmlTheme(f, "colors");
      else if (ext === ".xml" && /theme fonts/.test(parent)) t = readXmlTheme(f, "fonts");
      if (!t) continue;
      const key = `${t.kind}:${t.name.toLowerCase()}`;
      if (!found.has(key)) found.set(key, t);
      if (found.size >= MAX_ITEMS * 3) break;
    }
  }
  const all = [...found.values()];
  const by = (k: OfficeTheme["kind"]) => all.filter((t) => t.kind === k).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ITEMS);
  // Mã trùng (hai tên khác nhau cùng rút gọn): thêm số thứ tự.
  const ids = new Set<string>();
  for (const t of all) {
    let id = t.id;
    for (let i = 2; ids.has(id); i++) id = `${t.id}-${i}`;
    t.id = id;
    ids.add(id);
  }
  const themes = by("theme");
  let colors = by("colors");
  let fonts = by("fonts");
  // Chủ đề (.thmx) cũng mang bảng màu và bộ phông: bổ sung khi thư mục Theme Colors / Theme Fonts không có.
  const fromThemes = (k: "colors" | "fonts") =>
    themes.map((t) => ({ id: `${k[0]}-${t.id}`, name: t.name, kind: k, source: "office" as const, ...(k === "colors" ? { colors: t.colors } : { fonts: t.fonts }) }) as OfficeTheme);
  if (colors.length === 0) colors = fromThemes("colors");
  if (fonts.length === 0) {
    const seen = new Set<string>();
    fonts = fromThemes("fonts").filter((f) => {
      const k = `${f.fonts!.major}|${f.fonts!.minor}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  if (themes.length === 0 && colors.length === 0 && fonts.length === 0) {
    return { host, themes: [], colors: BUILTIN_COLORS, fonts: BUILTIN_FONTS, source: "builtin", dirs };
  }
  return { host, themes, colors, fonts, source: "office", dirs };
}

/** Danh mục được nhớ trong bộ nhớ một lúc (quét ổ đĩa mỗi lần mở thẻ là phí). */
export class ThemeCache {
  private cache = new Map<OfficeHost, { at: number; cat: ThemeCatalog }>();
  constructor(private scan: (host: OfficeHost) => ThemeCatalog = (h) => scanThemes(h), private ttlMs = 10 * 60_000) {}
  get(host: OfficeHost, now = Date.now()): ThemeCatalog {
    const c = this.cache.get(host);
    if (c && now - c.at < this.ttlMs) return c.cat;
    const cat = this.scan(host);
    this.cache.set(host, { at: now, cat });
    return cat;
  }
}
