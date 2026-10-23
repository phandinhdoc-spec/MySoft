import fs from "node:fs";
import path from "node:path";
import type { ToolCall, ToolResult } from "@pvta/shared";
import { findUnsafe, type SkillStore } from "./skills.js";

import { calc, check, CalcError, FONT_PAIRS, makePalette, presetTheme, THEME_PRESETS, type CheckItem, type RoundMode } from "@pvta/shared";

export { FONT_PAIRS, hexToHsl, hslToHex, makePalette, type Palette } from "@pvta/shared";

// ---- Thực thi công cụ cục bộ ----

const STYLE_CAP = 8000;

export class LocalTools {
  constructor(
    private skills: SkillStore,
    private styleFile: string,
  ) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    const a = call.args;
    const ok = (result: unknown): ToolResult => ({ tool: call.tool, ok: true, result });
    const fail = (error: string): ToolResult => ({ tool: call.tool, ok: false, error });
    try {
      switch (call.tool) {
        case "office_skill_read": {
          const name = typeof a.name === "string" ? a.name : "";
          const s = this.skills.read(name);
          return s ? ok(s.body) : fail(`Không có skill '${name}'.`);
        }
        case "office_style_get": {
          try {
            return ok(fs.readFileSync(this.styleFile, "utf8"));
          } catch {
            return ok("");
          }
        }
        case "office_style_save": {
          const md = typeof a.markdown === "string" ? a.markdown : "";
          if (md.length > STYLE_CAP) return fail(`Hồ sơ phong cách quá dài (tối đa ${STYLE_CAP} ký tự).`);
          const bad = findUnsafe(md);
          if (bad) return fail(`Không lưu được hồ sơ: ${bad}.`);
          fs.mkdirSync(path.dirname(this.styleFile), { recursive: true });
          fs.writeFileSync(this.styleFile, md);
          return ok("đã lưu");
        }
        case "office_palette":
          return ok(
            makePalette({
              base: typeof a.base === "string" ? a.base : undefined,
              mood: typeof a.mood === "string" ? a.mood : undefined,
              dark: a.dark === true,
            }),
          );
        case "office_font_pairs":
          return ok(FONT_PAIRS);
        case "office_theme_presets":
          return ok(THEME_PRESETS.map((p) => ({ id: p.id, name: p.name, hint: p.hint, theme: presetTheme(p.id, a.dark === true) })));
        case "office_calc": {
          const opts = { round: typeof a.round === "number" ? a.round : undefined, mode: a.mode as RoundMode | undefined };
          if (Array.isArray(a.exprs)) {
            if (a.exprs.length > 200) return fail("Tối đa 200 biểu thức mỗi lần.");
            return ok(a.exprs.map((e) => (typeof e === "string" ? safeCalc(e, opts) : { error: "Biểu thức phải là chuỗi." })));
          }
          if (typeof a.expr !== "string") return fail("Thiếu biểu thức: args {expr: '...'}.");
          const r = safeCalc(a.expr, opts);
          return "error" in r ? fail(String(r.error)) : ok(r);
        }
        case "office_calc_check": {
          if (!Array.isArray(a.items)) return fail("Thiếu items: [{expr, expected}].");
          const items: CheckItem[] = a.items
            .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
            .map((i) => ({ label: typeof i.label === "string" ? i.label : undefined, expr: String(i.expr ?? ""), expected: typeof i.expected === "number" ? i.expected : String(i.expected ?? "") }));
          return ok(check(items, { round: typeof a.round === "number" ? a.round : undefined, mode: a.mode as RoundMode | undefined }));
        }
        default:
          return fail(`Công cụ cục bộ không tồn tại: ${call.tool}`);
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }
}

function safeCalc(expr: string, opts: { round?: number; mode?: RoundMode }) {
  try {
    return calc(expr, opts);
  } catch (e) {
    return { expr, error: e instanceof CalcError ? e.message : "Không tính được." };
  }
}
