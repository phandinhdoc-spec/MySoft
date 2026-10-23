/**
 * Áp dụng thử rồi hoàn tác: chụp toàn bộ nội dung Word (OOXML, gồm định dạng, hình, công thức) trước khi
 * "Làm đẹp" hay đổi chủ đề, để thầy cô xem kết quả thật trên tệp rồi Giữ hoặc Hoàn tác về đúng bản cũ.
 */
export interface BodySnapshot {
  ooxml: string;
  texts: string[];
}

/** Bỏ các đoạn trống ở cuối: Word hay thêm một đoạn trống khi chèn lại OOXML. */
function trimEnd(a: string[]): string[] {
  const out = a.map((s) => s.replace(/\s+$/g, ""));
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out;
}

/** Chữ trước và sau khi khôi phục có giống nhau không (bỏ qua đoạn trống cuối). */
export function sameTexts(a: string[], b: string[]): boolean {
  const x = trimEnd(a);
  const y = trimEnd(b);
  return x.length === y.length && x.every((s, i) => s === y[i]);
}

export async function captureBody(): Promise<BodySnapshot> {
  return Word.run(async (ctx) => {
    const body = ctx.document.body;
    const ps = body.paragraphs;
    ps.load("items/text");
    const ox = body.getOoxml();
    await ctx.sync();
    return { ooxml: ox.value, texts: ps.items.map((p) => p.text) };
  });
}

/** Trả lại nội dung đã chụp. ok=false khi chữ sau khôi phục khác bản cũ: báo để thầy cô nhấn Ctrl+Z của Word. */
export async function restoreBody(s: BodySnapshot): Promise<{ ok: boolean }> {
  return Word.run(async (ctx) => {
    const body = ctx.document.body;
    body.insertOoxml(s.ooxml, "Replace");
    await ctx.sync();
    const ps = body.paragraphs;
    ps.load("items/text");
    await ctx.sync();
    let texts = ps.items.map((p) => p.text);
    // Thừa một đoạn trống ở cuối so với bản cũ thì bỏ đi.
    const last = ps.items[ps.items.length - 1];
    if (last && texts.length === s.texts.length + 1 && texts[texts.length - 1] === "") {
      last.delete();
      await ctx.sync();
      texts = texts.slice(0, -1);
    }
    return { ok: sameTexts(s.texts, texts) };
  });
}
