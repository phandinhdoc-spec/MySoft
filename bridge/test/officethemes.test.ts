import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { contrast, findOfficeTheme, parseClrScheme, parseFontScheme, themeApplyArgs } from "@pvta/shared";
import { readThmx, scanThemes, themeRoots, ThemeCache } from "../src/officethemes.js";

const clr = (name: string, a1 = "4472C4") =>
  `<a:clrScheme name="${name}"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="${a1}"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>`;
const fnt = (name: string, major = "Trebuchet MS", minor = "Trebuchet MS") =>
  `<a:fontScheme name="${name}"><a:majorFont><a:latin typeface="${major}"/><a:ea typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${minor}"/><a:ea typeface=""/></a:minorFont></a:fontScheme>`;
const themeXml = (name: string) => `<a:theme xmlns:a="x" name="${name}"><a:themeElements>${clr(name, "90C226")}${fnt(name)}</a:themeElements></a:theme>`;

function mk() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvta-themes-"));
  const thmx = (file: string, name: string, thumb = true) => {
    const files: Record<string, Uint8Array> = { "theme/theme/theme1.xml": strToU8(themeXml(name)), "[Content_Types].xml": strToU8("<x/>") };
    if (thumb) files["docProps/thumbnail.jpeg"] = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    fs.writeFileSync(path.join(root, file), zipSync(files));
  };
  fs.mkdirSync(path.join(root, "Theme Colors"));
  fs.mkdirSync(path.join(root, "Theme Fonts"));
  thmx("Facet.thmx", "Facet");
  thmx("Office Theme.thmx", "Office Theme", false);
  fs.writeFileSync(path.join(root, "bad.thmx"), "không phải zip");
  fs.writeFileSync(path.join(root, "Theme Colors", "Blue Warm.xml"), clr("Blue Warm", "4A66AC"));
  fs.writeFileSync(path.join(root, "Theme Fonts", "Arial.xml"), fnt("Arial", "Arial", "Arial"));
  fs.writeFileSync(path.join(root, "Theme Fonts", "hỏng.xml"), "<x/>");
  return root;
}

describe("chủ đề có sẵn của Office", () => {
  it("đọc bảng màu (kể cả sysClr) và bộ phông; từ chối thiếu màu", () => {
    const c = parseClrScheme(clr("X"))!;
    expect(c.colors.dk1).toBe("#000000");
    expect(c.colors.accent1).toBe("#4472C4");
    expect(parseClrScheme("<a:clrScheme name='x'><a:dk1><a:srgbClr val='000000'/></a:dk1></a:clrScheme>")).toBeUndefined();
    expect(parseFontScheme(fnt("A", "Georgia", "Calibri"))!.fonts).toEqual({ major: "Georgia", minor: "Calibri" });
    expect(parseFontScheme(fnt("A", "+mj-lt", "Calibri"))).toBeUndefined();
  });
  it("quét thư mục: chủ đề .thmx kèm ảnh xem trước, bảng màu, bộ phông; bỏ tệp hỏng", () => {
    const root = mk();
    const cat = scanThemes("word", [root, path.join(root, "khong-co")]);
    expect(cat.source).toBe("office");
    expect(cat.themes.map((t) => t.name).sort()).toEqual(["Facet", "Office Theme"]);
    const facet = cat.themes.find((t) => t.name === "Facet")!;
    expect(facet.thumb).toMatch(/^data:image\/jpeg;base64,/);
    expect(facet.colors?.accent1).toBe("#90C226");
    expect(facet.fonts?.major).toBe("Trebuchet MS");
    expect(facet.path).toBe(path.join(root, "Facet.thmx"));
    expect(cat.colors.map((c) => c.name)).toEqual(["Blue Warm"]);
    expect(cat.fonts.map((c) => c.name)).toEqual(["Arial"]);
    expect(new Set([...cat.themes, ...cat.colors, ...cat.fonts].map((x) => x.id)).size).toBe(4);
    expect(readThmx(path.join(root, "bad.thmx"))).toBeUndefined();
  });
  it("không có thư mục nào: danh sách dự phòng, đánh dấu rõ", () => {
    const cat = scanThemes("excel", ["/khong/co/gi"]);
    expect(cat.source).toBe("builtin");
    expect(cat.themes).toEqual([]);
    expect(cat.colors.length).toBeGreaterThan(5);
    expect(cat.fonts.length).toBeGreaterThan(3);
  });
  it("thư mục theo hệ điều hành và theo phần mềm (Mac: mỗi phần mềm một bộ)", () => {
    const mac = themeRoots("powerpoint", "darwin", {}, "/Users/gv");
    expect(mac.some((p) => p.includes("Microsoft PowerPoint.app"))).toBe(true);
    expect(mac.some((p) => p.includes("Microsoft Word.app"))).toBe(false);
    const win = themeRoots("word", "win32", { ProgramFiles: "C:\\Program Files", APPDATA: "C:\\Users\\gv\\AppData\\Roaming" }, "");
    expect(win.some((p) => p.includes("Document Themes 16"))).toBe(true);
    expect(win.some((p) => p.includes("AppData"))).toBe(true);
    expect(themeRoots("word", "linux")).toEqual([]);
  });
  it("bộ nhớ đệm: không quét lại trong thời hạn", () => {
    let n = 0;
    const c = new ThemeCache((h) => (n++, { host: h, themes: [], colors: [], fonts: [], source: "builtin", dirs: [] }), 1000);
    c.get("word", 0);
    c.get("word", 500);
    c.get("excel", 500);
    c.get("word", 1500);
    expect(n).toBe(3);
  });
  it("đổi sang tham số áp dụng: màu chính đọc được trên nền trắng, phông lấy từ chủ đề", () => {
    const c = parseClrScheme(clr("X", "FFC000"))!.colors; // accent1 vàng nhạt: không đủ tương phản
    const a = themeApplyArgs(c, { major: "Georgia", minor: "Calibri" });
    expect(contrast(a.primary, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(a.headingFont).toBe("Georgia");
    expect(a.bodyFont).toBe("Calibri");
    expect(a.text).toBe("#000000");
    const b = themeApplyArgs(undefined, { major: "Arial", minor: "Arial" }, { primary: "#123456" });
    expect(b.primary).toBe("#123456");
    expect(b.headingFont).toBe("Arial");
  });
  it("tìm theo mã, tên đầy đủ hoặc một phần tên", () => {
    const list = scanThemes("word", [mk()]).themes;
    expect(findOfficeTheme(list, "facet")?.name).toBe("Facet");
    expect(findOfficeTheme(list, list[0]!.id)).toBe(list[0]);
    expect(findOfficeTheme(list, "không có")).toBeUndefined();
    expect(findOfficeTheme(list, "")).toBeUndefined();
  });
});
