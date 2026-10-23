import { planSheet, type MergeArea, type RoleSig, type SheetPlan } from "@pvta/shared";

/**
 * Làm đẹp Excel: phần hỗ trợ cho model. Đọc cấu trúc (kể cả ô gộp), chụp định dạng để Hoàn tác, chữ ký vai trò để học.
 * Không có mẫu cố định: cách trình bày do model quyết định theo lời nhắc của PVTA.
 */

const MAX_CELLS = 40_000;
const MAX_ROWS_READ = 3000;

const colName = (i: number): string => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export interface Loaded {
  sheet: Excel.Worksheet;
  used: Excel.Range;
  r0: number;
  c0: number;
  rows: number;
  cols: number;
  values: unknown[][];
  merges: MergeArea[];
  plan: SheetPlan;
}

/** Đọc vùng đang dùng, ô gộp (nếu bản Excel hỗ trợ) và dựng sơ đồ vùng. */
export async function load(ctx: Excel.RequestContext, name?: string): Promise<Loaded | null> {
  const sheet = name ? ctx.workbook.worksheets.getItem(name) : ctx.workbook.worksheets.getActiveWorksheet();
  const used = sheet.getUsedRangeOrNullObject(true);
  used.load("rowIndex,columnIndex,rowCount,columnCount");
  await ctx.sync();
  if (used.isNullObject) return null;
  const rows = Math.min(used.rowCount, MAX_ROWS_READ);
  const cols = used.columnCount;
  const part = used.getCell(0, 0).getResizedRange(rows - 1, cols - 1);
  part.load("values");
  let merged: Excel.RangeAreas | null = null;
  try {
    merged = part.getMergedAreasOrNullObject();
    merged.load("areas/items/rowIndex,areas/items/columnIndex,areas/items/rowCount,areas/items/columnCount");
  } catch {
    merged = null;
  }
  try {
    await ctx.sync();
  } catch {
    merged = null; // bản Excel chưa có API ô gộp
    await ctx.sync();
  }
  const merges: MergeArea[] = [];
  if (merged && !merged.isNullObject) {
    for (const a of merged.areas.items) {
      merges.push({ r1: a.rowIndex - used.rowIndex, c1: a.columnIndex - used.columnIndex, r2: a.rowIndex - used.rowIndex + a.rowCount - 1, c2: a.columnIndex - used.columnIndex + a.columnCount - 1 });
    }
  }
  return { sheet, used, r0: used.rowIndex, c0: used.columnIndex, rows, cols, values: part.values, merges, plan: planSheet(part.values, merges) };
}

export const rangeOf = (l: Loaded, r1: number, c1: number, r2: number, c2: number): Excel.Range => l.used.getCell(r1, c1).getResizedRange(r2 - r1, c2 - c1);

/** Chỉ đọc: cho model biết cấu trúc sheet (kể cả ô gộp) để định dạng mà không phá đầu bảng nhiều tầng. */
export async function inspectLayout(sheet?: string): Promise<unknown> {
  return Excel.run(async (ctx) => {
    const l = await load(ctx, sheet);
    if (!l) return { empty: true };
    const { plan, cols } = l;
    const A1 = (r: number, c: number) => `${colName(l.c0 + c)}${l.r0 + r + 1}`;
    const span = (r1: number, r2: number) => `${l.r0 + r1 + 1}–${l.r0 + r2 + 1}`;
    const parts: Array<{ name: string; r: Excel.Range }> = [];
    if (plan.titleRows) parts.push({ name: "titleBlock", r: rangeOf(l, plan.titleRows[0], 0, plan.titleRows[1], cols - 1) });
    if (plan.headerRows) parts.push({ name: "header", r: rangeOf(l, plan.headerRows[0], 0, plan.headerRows[1], cols - 1) });
    if (plan.dataEnd >= plan.dataStart) parts.push({ name: "data", r: rangeOf(l, plan.dataStart, 0, plan.dataEnd, cols - 1) });
    if (plan.totalRow !== null) parts.push({ name: "totalRow", r: rangeOf(l, plan.totalRow, 0, plan.totalRow, cols - 1) });
    for (const p of parts) {
      p.r.format.load("horizontalAlignment,verticalAlignment,wrapText");
      p.r.format.font.load("name,size,bold");
    }
    const loc = l.sheet.freezePanes.getLocationOrNullObject();
    loc.load("address");
    await ctx.sync();
    const now: Record<string, unknown> = {};
    for (const { name, r } of parts) now[name] = { font: r.format.font.name, size: r.format.font.size, bold: r.format.font.bold, align: r.format.horizontalAlignment, valign: r.format.verticalAlignment, wrap: r.format.wrapText };
    return {
      usedRange: `${A1(0, 0)}:${A1(l.rows - 1, cols - 1)}`,
      titleRows: plan.titleRows ? span(plan.titleRows[0], plan.titleRows[1]) : null,
      headerRows: plan.headerRows ? span(plan.headerRows[0], plan.headerRows[1]) : null,
      dataRows: plan.dataEnd >= plan.dataStart ? span(plan.dataStart, plan.dataEnd) : null,
      totalRow: plan.totalRow !== null ? l.r0 + plan.totalRow + 1 : null,
      columns: plan.colKinds.map((kind, c) => ({ col: colName(l.c0 + c), kind, header: plan.headerText[c] || undefined })),
      mergedCells: l.merges.map((m) => `${A1(m.r1, m.c1)}:${A1(m.r2, m.c2)}`).slice(0, 80),
      current: now,
      frozen: loc.isNullObject ? null : loc.address,
      note: "Ô gộp và đầu bảng nhiều tầng phải giữ nguyên: không gộp/bỏ gộp, không đặt căn lề đè lên vùng đã căn, không coi dòng đầu sheet là tiêu đề bảng.",
    };
  });
}

/** Bản chụp định dạng để Hoàn tác (chỉ định dạng; giá trị không bị đổi nên không cần chụp). */
export interface SheetSnapshot {
  sheet: string;
  address: string;
  props: unknown;
  colWidths: number[];
  rowHeights: number[];
  hadFreeze: boolean;
}

export async function captureSheet(): Promise<SheetSnapshot | null> {
  return Excel.run(async (ctx) => {
    const ws = ctx.workbook.worksheets.getActiveWorksheet();
    ws.load("name");
    const used = ws.getUsedRangeOrNullObject(true);
    used.load("address,rowCount,columnCount");
    const loc = ws.freezePanes.getLocationOrNullObject();
    loc.load("address");
    await ctx.sync();
    if (used.isNullObject || used.rowCount * used.columnCount > MAX_CELLS) return null;
    const b = { style: true, color: true, weight: true };
    const props = used.getCellProperties({
      format: {
        font: { name: true, size: true, bold: true, italic: true, color: true },
        fill: { color: true },
        horizontalAlignment: true,
        verticalAlignment: true,
        wrapText: true,
        borders: { top: b, bottom: b, left: b, right: b },
      },
    } as never);
    const cols = Array.from({ length: used.columnCount }, (_, c) => {
      const r = used.getColumn(c);
      r.format.load("columnWidth");
      return r;
    });
    const nRows = Math.min(used.rowCount, 40);
    const rws = Array.from({ length: nRows }, (_, r) => {
      const x = used.getRow(r);
      x.format.load("rowHeight");
      return x;
    });
    await ctx.sync();
    return {
      sheet: ws.name,
      address: used.address,
      props: props.value,
      colWidths: cols.map((c) => c.format.columnWidth),
      rowHeights: rws.map((r) => r.format.rowHeight),
      hadFreeze: !loc.isNullObject,
    };
  });
}

export async function restoreSheet(s: SheetSnapshot): Promise<void> {
  await Excel.run(async (ctx) => {
    const ws = ctx.workbook.worksheets.getItem(s.sheet);
    const used = ws.getRange(s.address.includes("!") ? s.address.split("!")[1]! : s.address);
    used.setCellProperties(s.props as never);
    s.colWidths.forEach((w, c) => {
      used.getColumn(c).format.columnWidth = w;
    });
    s.rowHeights.forEach((h, r) => {
      used.getRow(r).format.rowHeight = h;
    });
    if (!s.hadFreeze) ws.freezePanes.unfreeze();
    await ctx.sync();
  });
}

/** Chữ ký định dạng theo vai trò (để học từ chỗ thầy cô sửa): chỉ đặc điểm, không chữ của sheet. */
export async function takeSheetSigs(): Promise<RoleSig[]> {
  return Excel.run(async (ctx) => {
    const l = await load(ctx);
    if (!l) return [];
    const { plan, cols } = l;
    const parts: Array<{ role: string; r: Excel.Range }> = [];
    if (plan.titleRows) {
      const t = plan.titleRows[0] + Math.max(0, plan.titleRoles.indexOf("title"));
      parts.push({ role: "tên bảng", r: rangeOf(l, t, 0, t, cols - 1) });
    }
    if (plan.headerRows) parts.push({ role: "đầu bảng", r: rangeOf(l, plan.headerRows[0], 0, plan.headerRows[1], cols - 1) });
    if (plan.dataEnd >= plan.dataStart) parts.push({ role: "dữ liệu", r: rangeOf(l, plan.dataStart, 0, plan.dataEnd, cols - 1) });
    if (plan.totalRow !== null) parts.push({ role: "dòng tổng", r: rangeOf(l, plan.totalRow, 0, plan.totalRow, cols - 1) });
    for (const p of parts) {
      p.r.format.load("horizontalAlignment,wrapText");
      p.r.format.font.load("name,size,bold");
    }
    await ctx.sync();
    return parts.map(({ role, r }) => ({
      role,
      font: r.format.font.name || undefined,
      size: r.format.font.size || undefined,
      bold: r.format.font.bold ?? undefined,
      align: r.format.horizontalAlignment || undefined,
      wrap: r.format.wrapText ?? undefined,
    }));
  });
}

/** Chờ thầy cô bấm Lưu: Excel báo `isDirty` (đã sửa chưa lưu); lưu = chuyển từ true sang false. */
export function watchSaveExcel(onSave: () => void, opts: { everyMs?: number; maxMs?: number } = {}): () => void {
  let stop = false;
  let prev: boolean | undefined;
  const t0 = Date.now();
  const tick = async () => {
    if (stop || Date.now() - t0 > (opts.maxMs ?? 4 * 60 * 60 * 1000)) return;
    try {
      const dirty = await Excel.run(async (ctx) => {
        const wb = ctx.workbook as unknown as { isDirty: boolean; load(p: string): void };
        wb.load("isDirty");
        await ctx.sync();
        return wb.isDirty;
      });
      if (prev === true && !dirty) {
        stop = true;
        onSave();
        return;
      }
      prev = dirty;
    } catch {
      /* thử lại lần sau */
    }
    if (!stop) window.setTimeout(() => void tick(), opts.everyMs ?? 2000);
  };
  void tick();
  return () => {
    stop = true;
  };
}

