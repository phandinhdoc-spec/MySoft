import { LIMITS, onColor } from "@pvta/shared";
import { cfFormula, cfOperator, chartType } from "./helpers";
import { inspectLayout, load as loadSheet, rangeOf } from "./sheetbeautify";
import { themeArgs } from "./theme";

type Args = Record<string, unknown>;

function addr(a: Args): string {
  if (typeof a.address !== "string" || !a.address) throw new Error("Thiếu tham số 'address' (ví dụ \"A1:C10\").");
  return a.address;
}

function matrix(v: unknown, name: string): unknown[][] {
  if (!Array.isArray(v) || v.length === 0 || !v.every((r) => Array.isArray(r))) throw new Error(`'${name}' phải là mảng hai chiều không rỗng.`);
  return v as unknown[][];
}

export async function excelTool(tool: string, a: Args): Promise<unknown> {
  if (tool === "office_excel_inspect_layout") return inspectLayout(typeof a.sheet === "string" && a.sheet ? a.sheet : undefined);
  return Excel.run(async (ctx) => {
    const wb = ctx.workbook;
    const sheet = () => (typeof a.sheet === "string" && a.sheet ? wb.worksheets.getItem(a.sheet) : wb.worksheets.getActiveWorksheet());
    /** Vùng có kích thước đúng bằng ma trận, bắt đầu từ ô trên trái của địa chỉ. */
    const target = (rows: number, cols: number) => sheet().getRange(addr(a)).getCell(0, 0).getResizedRange(rows - 1, cols - 1);

    switch (tool) {
      case "office_excel_get_preview": {
        if (!Office.context.requirements.isSetSupported("ExcelApi", "1.7")) throw new Error("Excel trên máy này chưa hỗ trợ chụp ảnh vùng ô. Bỏ qua bước xem ảnh.");
        let rng: Excel.Range;
        if (typeof a.range === "string" && a.range) rng = sheet().getRange(a.range);
        else {
          const used = sheet().getUsedRangeOrNullObject(true);
          used.load("rowCount,columnCount");
          await ctx.sync();
          if (used.isNullObject) return { files: [], note: "Sheet trống." };
          rng = used.getCell(0, 0).getResizedRange(Math.min(used.rowCount, 60) - 1, Math.min(used.columnCount, 20) - 1);
        }
        rng.load("address,rowCount,columnCount");
        await ctx.sync();
        if (rng.rowCount * rng.columnCount > 60 * 20) throw new Error("Vùng quá lớn để chụp (tối đa 60 hàng × 20 cột); chia nhỏ range.");
        const img = rng.getImage();
        await ctx.sync();
        return { files: [{ name: "sheet.png", mime: "image/png", b64: img.value }], address: rng.address };
      }
      case "office_excel_get_sheet": {
        const used = sheet().getUsedRangeOrNullObject(true);
        used.load("address,rowCount,columnCount");
        await ctx.sync();
        if (used.isNullObject) return { address: null, values: [], truncated: false, totalRows: 0, totalColumns: 0 };
        const rows = used.rowCount;
        const cols = used.columnCount;
        const maxRows = Math.max(1, Math.floor(LIMITS.excelMaxCells / Math.max(1, cols)));
        const take = Math.min(rows, maxRows);
        const part = used.getCell(0, 0).getResizedRange(take - 1, cols - 1);
        part.load("values,address");
        await ctx.sync();
        return { address: part.address, values: part.values, truncated: take < rows, totalRows: rows, totalColumns: cols };
      }
      case "office_excel_list_sheets": {
        wb.worksheets.load("items/name");
        await ctx.sync();
        return wb.worksheets.items.map((s) => s.name);
      }
      case "office_excel_add_sheet": {
        if (typeof a.name !== "string" || !a.name) throw new Error("Thiếu tham số 'name'.");
        wb.worksheets.add(a.name);
        await ctx.sync();
        return `đã thêm sheet ${a.name}`;
      }
      case "office_excel_get_range": {
        const r = sheet().getRange(addr(a));
        r.load("rowCount,columnCount");
        await ctx.sync();
        if (r.rowCount * r.columnCount > LIMITS.excelMaxCells) {
          throw new Error(`Vùng quá lớn (${r.rowCount}x${r.columnCount}, tối đa ${LIMITS.excelMaxCells} ô). Hãy hỏi vùng nhỏ hơn.`);
        }
        r.load("values,formulas,address");
        await ctx.sync();
        return { address: r.address, values: r.values, formulas: r.formulas };
      }
      case "office_excel_set_range": {
        const values = matrix(a.values, "values");
        const cols = Math.max(...values.map((r) => r.length));
        const grid = values.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
        const r = target(values.length, cols);
        r.values = grid as (string | number | boolean)[][];
        await ctx.sync();
        return `đã ghi ${values.length}x${cols}`;
      }
      case "office_excel_set_formula": {
        const f = matrix(a.formulas, "formulas");
        const cols = Math.max(...f.map((r) => r.length));
        const grid = f.map((r) => Array.from({ length: cols }, (_, i) => String(r[i] ?? "")));
        target(f.length, cols).formulas = grid;
        await ctx.sync();
        return `đã đặt công thức ${f.length}x${cols}`;
      }
      case "office_excel_create_table": {
        const t = sheet().tables.add(addr(a), a.hasHeaders !== false);
        if (typeof a.name === "string" && a.name) t.name = a.name;
        await ctx.sync();
        return "đã tạo bảng";
      }
      case "office_excel_set_format": {
        const r = sheet().getRange(addr(a));
        const f = r.format;
        if (typeof a.bold === "boolean") f.font.bold = a.bold;
        if (typeof a.italic === "boolean") f.font.italic = a.italic;
        if (typeof a.fontSize === "number") f.font.size = a.fontSize;
        if (typeof a.fontName === "string") f.font.name = a.fontName;
        if (typeof a.fontColor === "string") f.font.color = a.fontColor;
        if (typeof a.fill === "string") f.fill.color = a.fill;
        if (a.align === "left" || a.align === "center" || a.align === "right")
          f.horizontalAlignment = a.align === "left" ? "Left" : a.align === "center" ? "Center" : "Right";
        if (typeof a.wrap === "boolean") f.wrapText = a.wrap;
        if (a.border === true) {
          for (const e of ["EdgeTop", "EdgeBottom", "EdgeLeft", "EdgeRight", "InsideHorizontal", "InsideVertical"] as const) {
            const b = f.borders.getItem(e);
            b.style = "Continuous";
            b.weight = "Thin";
          }
        }
        if (typeof a.numberFormat === "string") {
          r.load("rowCount,columnCount");
          await ctx.sync();
          r.numberFormat = Array.from({ length: r.rowCount }, () => Array.from({ length: r.columnCount }, () => a.numberFormat as string));
        }
        if (a.autofit === true) {
          f.autofitColumns();
          f.autofitRows();
        }
        await ctx.sync();
        return "đã định dạng";
      }
      case "office_excel_sort": {
        const col = typeof a.column === "number" ? a.column : 0;
        sheet()
          .getRange(addr(a))
          .sort.apply([{ key: col, ascending: a.ascending !== false }], false, a.hasHeaders !== false);
        await ctx.sync();
        return "đã sắp xếp";
      }
      case "office_excel_get_format": {
        const r = typeof a.address === "string" && a.address ? sheet().getRange(a.address) : wb.getSelectedRange();
        r.load("address,numberFormat");
        r.format.load("horizontalAlignment,verticalAlignment,wrapText,columnWidth,rowHeight");
        r.format.font.load("name,size,bold,italic,color");
        r.format.fill.load("color");
        await ctx.sync();
        const f = r.format;
        return {
          address: r.address,
          numberFormat: r.numberFormat[0]?.[0],
          font: { name: f.font.name, size: f.font.size, bold: f.font.bold, italic: f.font.italic, color: f.font.color },
          fill: f.fill.color,
          align: f.horizontalAlignment,
          wrap: f.wrapText,
          columnWidth: f.columnWidth,
        };
      }
      case "office_excel_list_tables": {
        wb.tables.load("items/name");
        await ctx.sync();
        const parts = wb.tables.items.map((t) => {
          t.columns.load("items/name");
          t.rows.load("count");
          t.worksheet.load("name");
          const range = t.getRange();
          range.load("address");
          return { t, range };
        });
        await ctx.sync();
        return parts.map(({ t, range }) => ({ name: t.name, sheet: t.worksheet.name, address: range.address, columns: t.columns.items.map((c) => c.name), rows: t.rows.count }));
      }
      case "office_excel_add_table_column": {
        if (typeof a.table !== "string" || !a.table) throw new Error("Thiếu tham số 'table' (tên bảng, xem office_excel_list_tables).");
        if (typeof a.name !== "string" || !a.name) throw new Error("Thiếu tham số 'name' (tên cột mới).");
        const col = wb.tables.getItem(a.table).columns.add(undefined, undefined, a.name);
        if (typeof a.formula === "string" && a.formula) {
          const body = col.getDataBodyRange();
          body.load("rowCount");
          await ctx.sync();
          // Cùng một công thức cho mọi hàng; tham chiếu cột bảng dạng [@Cột] tự đổi theo hàng.
          body.formulas = Array.from({ length: body.rowCount }, () => [a.formula as string]);
        }
        await ctx.sync();
        return `đã thêm cột ${a.name} vào bảng ${a.table}`;
      }
      case "office_excel_insert_chart": {
        const data = sheet().getRange(addr(a));
        data.load("columnCount,rowCount");
        await ctx.sync();
        const by = a.seriesBy === "rows" ? "Rows" : a.seriesBy === "columns" ? "Columns" : "Auto";
        const chart = sheet().charts.add(chartType(a.type) as never, data, by as never);
        if (typeof a.title === "string" && a.title) chart.title.text = a.title;
        // Không nói chỗ đặt thì đặt bên phải dữ liệu, cách một cột, để không đè lên bảng.
        const start = typeof a.at === "string" && a.at ? sheet().getRange(a.at) : data.getCell(0, data.columnCount + 1);
        const end = typeof a.to === "string" && a.to ? sheet().getRange(a.to) : undefined;
        chart.setPosition(start, end);
        chart.load("name");
        await ctx.sync();
        return `đã chèn biểu đồ ${chart.name}`;
      }
      case "office_excel_conditional_format": {
        const r = sheet().getRange(addr(a));
        if (a.clear === true) r.conditionalFormats.clearAll();
        const rule = typeof a.rule === "string" ? a.rule : "cellValue";
        const fill = typeof a.fill === "string" ? a.fill : undefined;
        const fontColor = typeof a.fontColor === "string" ? a.fontColor : undefined;
        if (rule === "colorScale") {
          const cf = r.conditionalFormats.add("ColorScale" as never);
          cf.colorScale.criteria = {
            minimum: { formula: null, type: "LowestValue", color: typeof a.minColor === "string" ? a.minColor : "#F8696B" },
            midpoint: { formula: "50", type: "Percentile", color: typeof a.midColor === "string" ? a.midColor : "#FFEB84" },
            maximum: { formula: null, type: "HighestValue", color: typeof a.maxColor === "string" ? a.maxColor : "#63BE7B" },
          } as never;
        } else if (rule === "duplicates" || rule === "unique") {
          const cf = r.conditionalFormats.add("PresetCriteria" as never);
          cf.preset.rule = { criterion: rule === "duplicates" ? "DuplicateValues" : "UniqueValues" } as never;
          if (fill) cf.preset.format.fill.color = fill;
          if (fontColor) cf.preset.format.font.color = fontColor;
        } else if (rule === "cellValue") {
          if (!fill && !fontColor) throw new Error("Cho ít nhất một trong 'fill' (màu nền) hoặc 'fontColor' (màu chữ).");
          const op = cfOperator(a.operator);
          const between = op === "Between" || op === "NotBetween";
          const cf = r.conditionalFormats.add("CellValue" as never);
          cf.cellValue.rule = { operator: op, formula1: cfFormula(a.value), ...(between ? { formula2: cfFormula(a.value2) } : {}) } as never;
          if (fill) cf.cellValue.format.fill.color = fill;
          if (fontColor) cf.cellValue.format.font.color = fontColor;
        } else {
          throw new Error(`Quy tắc '${rule}' không có. Dùng: cellValue, colorScale, duplicates, unique.`);
        }
        await ctx.sync();
        return `đã đặt định dạng có điều kiện cho ${addr(a)}`;
      }
      case "office_excel_filter": {
        const sh = sheet();
        if (a.clear === true) {
          sh.autoFilter.remove();
          await ctx.sync();
          return "đã bỏ bộ lọc";
        }
        const values = Array.isArray(a.values) ? a.values.map((v) => String(v)) : [];
        if (values.length === 0) throw new Error("Thiếu 'values' (danh sách giá trị cần giữ lại), hoặc dùng clear: true để bỏ lọc.");
        const col = typeof a.column === "number" ? a.column : 0;
        sh.autoFilter.apply(sh.getRange(addr(a)), col, { filterOn: "Values", values } as never);
        await ctx.sync();
        return `đã lọc cột ${col} giữ ${values.length} giá trị`;
      }
      case "office_excel_apply_theme": {
        const t = themeArgs(a);
        // Tô đúng khối đầu bảng (kể cả hai tầng, giữ ô gộp), không mặc định hàng đầu của sheet là tiêu đề.
        const l = await loadSheet(ctx, typeof a.sheet === "string" && a.sheet ? a.sheet : undefined);
        if (!l) throw new Error("Sheet đang trống, chưa có gì để áp chủ đề.");
        if (t.bodyFont) l.used.format.font.name = t.bodyFont;
        const [h0, h1] = l.plan.headerRows ?? [0, 0];
        const head = rangeOf(l, h0, 0, h1, l.cols - 1);
        head.format.fill.color = t.primary;
        head.format.font.color = onColor(t.primary);
        head.format.font.bold = true;
        if (t.headingFont) head.format.font.name = t.headingFont;
        await ctx.sync();
        return `đã áp chủ đề cho đầu bảng (dòng ${l.r0 + h0 + 1}–${l.r0 + h1 + 1}) của ${l.used.address ?? "sheet"}`;
      }
      default:
        throw new Error(`Công cụ Excel không tồn tại: ${tool}`);
    }
  });
}
