import type { OfficeHost } from "@pvta/shared";

/** Nhãn nguồn PVTA ghi trong câu trả lời → vị trí trong tài liệu. */
export type Ref =
  | { kind: "para"; from: number; to: number }
  | { kind: "slide"; n: number }
  | { kind: "range"; sheet: string; address: string };

const PARA = /^Đoạn\s+(\d+)(?:\s*[–-]\s*(\d+))?$/;
const SLIDE = /^Slide\s+(\d+)$/;
const RANGE = /^(?:'((?:[^']|'')+)'|([\p{L}\p{N}_]+))!([A-Z]{1,3}\d+(?::[A-Z]{1,3}\d+)?)$/u;

export function parseRef(s: string): Ref | undefined {
  const t = s.trim();
  let m = PARA.exec(t);
  if (m) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    return from >= 1 && to >= from ? { kind: "para", from, to } : undefined;
  }
  m = SLIDE.exec(t);
  if (m) return Number(m[1]) >= 1 ? { kind: "slide", n: Number(m[1]) } : undefined;
  m = RANGE.exec(t);
  if (m) return { kind: "range", sheet: (m[1] ?? m[2]!).replace(/''/g, "'"), address: m[3]! };
  return undefined;
}

/** "[Đoạn 12; Slide 3]" → các nhãn bên trong, hoặc undefined nếu có phần không phải nhãn. */
export function parseCitation(inner: string): string[] | undefined {
  const parts = inner.split(/\s*[,;]\s*/).filter(Boolean);
  return parts.length > 0 && parts.length <= 6 && parts.every((p) => parseRef(p)) ? parts : undefined;
}

/** Chọn vị trí đó trong tài liệu (cuộn tới). Trả về false nếu không tới được (tài liệu đã đổi, sheet đã xóa…). */
export async function gotoRef(host: OfficeHost, ref: string): Promise<boolean> {
  const r = parseRef(ref);
  if (!r) return false;
  try {
    if (host === "word" && r.kind === "para") {
      return await Word.run(async (ctx) => {
        const ps = ctx.document.body.paragraphs;
        ps.load("items");
        await ctx.sync();
        const a = ps.items[r.from - 1];
        const b = ps.items[Math.min(r.to, ps.items.length) - 1];
        if (!a || !b) return false;
        if (a === b) a.select("Select");
        else a.getRange("Start").expandTo(b.getRange("End")).select();
        await ctx.sync();
        return true;
      });
    }
    if (host === "excel" && r.kind === "range") {
      return await Excel.run(async (ctx) => {
        const ws = ctx.workbook.worksheets.getItem(r.sheet);
        ws.activate();
        ws.getRange(r.address).select();
        await ctx.sync();
        return true;
      });
    }
    if (host === "powerpoint" && r.kind === "slide") {
      return await PowerPoint.run(async (ctx) => {
        const slides = ctx.presentation.slides;
        slides.load("items/id");
        await ctx.sync();
        const s = slides.items[r.n - 1];
        if (!s) return false;
        ctx.presentation.setSelectedSlides([s.id]);
        await ctx.sync();
        return true;
      });
    }
  } catch {
    /* tài liệu đã đổi hoặc phiên bản Office chưa hỗ trợ */
  }
  return false;
}
