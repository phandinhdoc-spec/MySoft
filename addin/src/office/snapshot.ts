import type { ParaSig } from "@pvta/shared";

/** Chụp định dạng từng đoạn của văn bản Word (chữ chỉ ở lại trong máy, dùng để ghép đoạn trước/sau). */
export async function takeSigs(): Promise<ParaSig[]> {
  return Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs;
    ps.load("items/text,items/style,items/alignment,items/lineSpacing,items/spaceBefore,items/spaceAfter,items/firstLineIndent,items/leftIndent,items/font/name,items/font/size,items/font/bold,items/font/italic");
    const ox = ctx.document.body.getOoxml();
    await ctx.sync();
    // Đoạn nào chứa Equation (<m:oMath>): chỉ tin khi số đoạn khớp.
    let eq: boolean[] | undefined;
    try {
      const body = /<w:body>([\s\S]*)<\/w:body>/.exec(ox.value)?.[1] ?? "";
      const chunks = body.split(/<w:p[ >]/).slice(1);
      if (chunks.length === ps.items.length) eq = chunks.map((c) => /<m:oMath[ >]/.test(c));
    } catch {
      /* bỏ qua */
    }
    const r = (n: number) => Math.round(n * 10) / 10;
    return ps.items.map((p, i) => ({
      text: p.text,
      style: p.style,
      font: p.font.name || undefined,
      size: p.font.size || undefined,
      bold: p.font.bold,
      italic: p.font.italic,
      align: p.alignment,
      lineSpacing: r(p.lineSpacing),
      spaceBefore: r(p.spaceBefore),
      spaceAfter: r(p.spaceAfter),
      firstIndent: r(p.firstLineIndent),
      leftIndent: r(p.leftIndent),
      eq: eq?.[i],
    }));
  });
}

/**
 * Chờ người dùng bấm Lưu: Word không có sự kiện lưu, nên hỏi thuộc tính `saved` mỗi 2 giây.
 * Lưu = `saved` đổi từ false sang true. Chỉ chạy khi "Làm đẹp" đang chờ; gọi hàm trả về để tắt.
 */
export function watchSave(onSave: () => void, opts: { everyMs?: number; maxMs?: number } = {}): () => void {
  let stop = false;
  let prev: boolean | undefined;
  const t0 = Date.now();
  const tick = async () => {
    if (stop) return;
    if (Date.now() - t0 > (opts.maxMs ?? 4 * 60 * 60 * 1000)) return;
    try {
      const saved = await Word.run(async (ctx) => {
        ctx.document.load("saved");
        await ctx.sync();
        return ctx.document.saved;
      });
      if (prev === false && saved) {
        stop = true;
        onSave();
        return;
      }
      prev = saved;
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
