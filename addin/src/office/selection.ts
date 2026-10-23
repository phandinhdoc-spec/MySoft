import { put } from "./word";
import type { OfficeHost } from "@pvta/shared";

export interface Selection {
  text: string;
  /** Đoạn ngay trước vùng chọn / con trỏ (Word), để viết tiếp liền mạch. */
  before?: string;
  /** Excel: số hàng × cột đang chọn. */
  cells?: { rows: number; cols: number };
}

const BEFORE_MAX = 3000;

/** Đọc phần đang chọn trực tiếp bằng Office.js (không qua model: nhanh, không tốn lượt). */
export async function readSelection(host: OfficeHost): Promise<Selection> {
  if (host === "word") {
    return Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load("text");
      const before = ctx.document.body.getRange("Start").expandTo(sel.getRange("Start"));
      before.load("text");
      await ctx.sync();
      return { text: sel.text, before: before.text.slice(-BEFORE_MAX) };
    });
  }
  if (host === "excel") {
    return Excel.run(async (ctx) => {
      const r = ctx.workbook.getSelectedRange();
      r.load("rowCount,columnCount");
      await ctx.sync();
      if (r.rowCount * r.columnCount > 400) return { text: "", cells: { rows: r.rowCount, cols: r.columnCount } };
      r.load("text");
      await ctx.sync();
      const lines = r.text.map((row) => row.filter((c) => c !== "").join("\t")).filter((l) => l.trim());
      return { text: lines.join("\n"), cells: { rows: r.rowCount, cols: r.columnCount } };
    });
  }
  return PowerPoint.run(async (ctx) => {
    try {
      const tr = ctx.presentation.getSelectedTextRange();
      tr.load("text");
      await ctx.sync();
      if (tr.text) return { text: tr.text };
    } catch {
      /* chưa chọn chữ trong hộp: thử lấy các hộp đang chọn */
    }
    const shapes = ctx.presentation.getSelectedShapes();
    shapes.load("items/type");
    await ctx.sync();
    const ranges = shapes.items.map((s) => {
      const r = s.textFrame.textRange;
      r.load("text");
      return r;
    });
    try {
      await ctx.sync();
    } catch {
      return { text: "" };
    }
    return { text: ranges.map((r) => r.text).filter(Boolean).join("\n") };
  });
}

/**
 * Ghi kết quả vào tài liệu. replace: thay phần đang chọn (không chọn gì thì chèn tại con trỏ);
 * after: chèn thành đoạn mới ngay sau phần đang chọn (chỉ Word).
 */
export async function applyText(host: OfficeHost, text: string, mode: "replace" | "after"): Promise<void> {
  if (host === "word") {
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load("text");
      await ctx.sync();
      // Qua put(): công thức $…$ trong kết quả thành Equation chuẩn của Word (chữ thường thì chèn như cũ).
      if (mode === "after") await put(ctx, sel, `\n${text}`, "After");
      else await put(ctx, sel, text, sel.text ? "Replace" : "After");
    });
    return;
  }
  if (host === "excel") {
    await Excel.run(async (ctx) => {
      const r = ctx.workbook.getSelectedRange();
      r.load("rowCount,columnCount");
      await ctx.sync();
      const lines = text.split("\n");
      // Cùng số hàng với vùng chọn một cột: mỗi dòng vào một ô; còn lại ghi cả vào ô đầu.
      if (r.columnCount === 1 && lines.length === r.rowCount && r.rowCount > 1) r.values = lines.map((l) => [l]);
      else r.getCell(0, 0).values = [[text]];
      await ctx.sync();
    });
    return;
  }
  await PowerPoint.run(async (ctx) => {
    try {
      const tr = ctx.presentation.getSelectedTextRange();
      tr.load("text");
      await ctx.sync();
      if (tr.text) {
        tr.text = text;
        await ctx.sync();
        return;
      }
    } catch {
      /* thử hộp đang chọn */
    }
    const shapes = ctx.presentation.getSelectedShapes();
    shapes.load("items");
    await ctx.sync();
    const first = shapes.items[0];
    if (!first) throw new Error("Hãy chọn một hộp chữ trên slide.");
    first.textFrame.textRange.text = text;
    await ctx.sync();
  });
}

/** Báo khi người dùng chọn chỗ khác trong tài liệu (chế độ gợi ý viết cập nhật ngay). */
export function onSelectionChanged(fn: () => void): () => void {
  let added = false;
  try {
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, fn, (r) => {
      added = r.status === Office.AsyncResultStatus.Succeeded;
    });
  } catch {
    /* host không hỗ trợ sự kiện: người dùng bấm "Lấy phần đang chọn" */
  }
  return () => {
    if (!added) return;
    try {
      Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: fn });
    } catch {
      /* bỏ qua */
    }
  };
}

/**
 * Đọc nhanh phần đang chọn để gửi kèm tin nhắn (model khỏi tốn một vòng gọi công cụ đọc).
 * Có hạn giờ: Office chậm thì gửi luôn không kèm, không bắt người dùng chờ.
 */
export async function quickSelection(host: OfficeHost, timeoutMs = 350): Promise<{ selection?: string; where?: string } | undefined> {
  const read = async (): Promise<{ selection?: string; where?: string }> => {
    if (host === "word") {
      return Word.run(async (ctx) => {
        const sel = ctx.document.getSelection();
        sel.load("text");
        await ctx.sync();
        return { selection: sel.text };
      });
    }
    if (host === "excel") {
      return Excel.run(async (ctx) => {
        const r = ctx.workbook.getSelectedRange();
        r.load("address,rowCount,columnCount");
        await ctx.sync();
        if (r.rowCount * r.columnCount > 400) return { where: r.address };
        r.load("text");
        await ctx.sync();
        const rows = r.text.map((row) => row.join("\t"));
        return { selection: rows.join("\n"), where: r.address };
      });
    }
    const s = await readSelection("powerpoint");
    return { selection: s.text };
  };
  try {
    return await Promise.race([read(), new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs))]);
  } catch {
    return undefined;
  }
}
