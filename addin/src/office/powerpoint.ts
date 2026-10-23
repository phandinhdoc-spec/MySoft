import { LIMITS } from "@pvta/shared";
import { findTitleBody, pickLayout, type LayoutInfo } from "./helpers";
import { themeArgs } from "./theme";

type Args = Record<string, unknown>;

const PREVIEW_MAX_SLIDES = 12;

/** Loại shape có khung chữ. Bảng, ảnh, nhóm, đường kẻ… không có, đọc chữ sẽ lỗi cả lô. */
const TEXT_SHAPES = new Set(["GeometricShape", "TextBox", "Placeholder", "Callout"]);

/** Tìm bố cục (theo tên, hoặc mặc định theo nội dung) ở bản cái đầu tiên; không đọc được thì để PowerPoint tự chọn. */
async function layoutFor(ctx: PowerPoint.RequestContext, want: string | undefined, hasBullets: boolean): Promise<{ layout: LayoutInfo; masterId: string } | undefined> {
  const masters = ctx.presentation.slideMasters;
  masters.load("items/id");
  await ctx.sync();
  const master = masters.items[0];
  if (!master) return undefined;
  master.layouts.load("items/id,items/name");
  await ctx.sync();
  const layout = pickLayout(master.layouts.items.map((l) => ({ id: l.id, name: l.name })), want, hasBullets);
  return layout ? { layout, masterId: master.id } : undefined;
}

export async function powerpointTool(tool: string, a: Args): Promise<unknown> {
  return PowerPoint.run(async (ctx) => {
    const slides = ctx.presentation.slides;
    switch (tool) {
      case "office_ppt_get_slides": {
        // Gom lệnh để chỉ cần vài lần đồng bộ cho cả bài (không phải hai lần cho mỗi slide).
        slides.load("items/id");
        await ctx.sync();
        for (const slide of slides.items) slide.shapes.load("items/name,items/type,items/left,items/top,items/width,items/height");
        await ctx.sync();
        const ranges = slides.items.map((slide) =>
          slide.shapes.items.map((s) => {
            if (!TEXT_SHAPES.has(String(s.type))) return undefined;
            const tr = s.textFrame.textRange;
            tr.load("text");
            return tr;
          }),
        );
        let ok = true;
        try {
          await ctx.sync();
        } catch {
          ok = false; // có shape không đọc được chữ: đọc lại từng slide, bỏ qua slide lỗi
        }
        if (!ok) {
          for (const [i, slide] of slides.items.entries()) {
            ranges[i] = slide.shapes.items.map((s) => {
              if (!TEXT_SHAPES.has(String(s.type))) return undefined;
              const tr = s.textFrame.textRange;
              tr.load("text");
              return tr;
            });
            try {
              await ctx.sync();
            } catch {
              ranges[i] = [];
            }
          }
        }
        return slides.items.map((slide, i) => ({
          index: i,
          id: slide.id,
          shapes: slide.shapes.items.map((s, k) => {
            let text: string | undefined;
            try {
              text = ranges[i]?.[k]?.text?.slice(0, LIMITS.pptTextBoxMaxChars);
            } catch {
              text = undefined;
            }
            const r1 = (n: number) => Math.round(n * 10) / 10;
            return { index: k, name: s.name, type: s.type, left: r1(s.left), top: r1(s.top), width: r1(s.width), height: r1(s.height), text };
          }),
        }));
      }
      case "office_ppt_get_preview": {
        if (!Office.context.requirements.isSetSupported("PowerPointApi", "1.8")) throw new Error("PowerPoint trên máy này chưa hỗ trợ chụp ảnh slide (cần bản Microsoft 365 mới). Bỏ qua bước xem ảnh, kiểm tra bằng office_ppt_get_slides.");
        slides.load("items/id");
        await ctx.sync();
        const all = slides.items.map((_, i) => i);
        const want = Array.isArray(a.slides) ? a.slides.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < all.length) : all;
        const pick = [...new Set(want)].slice(0, PREVIEW_MAX_SLIDES);
        const shots = pick.map((i) => ({ i, img: slides.items[i]!.getImageAsBase64({ width: 800 }) }));
        await ctx.sync();
        return {
          files: shots.map(({ i, img }) => ({ name: `slide-${i + 1}.png`, mime: "image/png", b64: img.value })),
          note: all.length > pick.length && !Array.isArray(a.slides) ? `Mới chụp ${pick.length}/${all.length} slide; gọi lại với {slides: [...]} để xem tiếp.` : undefined,
        };
      }
      case "office_ppt_format_text": {
        const scope = a.scope === "slide" || a.scope === "all" ? a.scope : "selection";
        const ranges: PowerPoint.TextRange[] = [];
        if (scope === "selection") {
          try {
            const tr = ctx.presentation.getSelectedTextRange();
            tr.load("text");
            await ctx.sync();
            if (tr.text) ranges.push(tr);
          } catch {
            /* không chọn chữ: dùng các hộp đang chọn */
          }
          if (ranges.length === 0) {
            const shapes = ctx.presentation.getSelectedShapes();
            shapes.load("items/type");
            await ctx.sync();
            for (const s of shapes.items) if (TEXT_SHAPES.has(String(s.type))) ranges.push(s.textFrame.textRange);
          }
          if (ranges.length === 0) throw new Error("Chưa chọn chữ hay hộp chữ nào trên slide.");
        } else {
          slides.load("items/id");
          await ctx.sync();
          const list = scope === "all" ? slides.items : [slides.items[typeof a.slide === "number" ? a.slide : 0]].filter(Boolean) as PowerPoint.Slide[];
          if (list.length === 0) throw new Error(`Không có slide số ${String(a.slide)} (đếm từ 0).`);
          for (const sl of list) sl.shapes.load("items/type");
          await ctx.sync();
          for (const sl of list) for (const s of sl.shapes.items) if (TEXT_SHAPES.has(String(s.type))) ranges.push(s.textFrame.textRange);
        }
        const align: Record<string, PowerPoint.ParagraphHorizontalAlignment> = { left: "Left", center: "Center", right: "Right", justify: "Justify" } as never;
        for (const tr of ranges) {
          const f = tr.font;
          if (typeof a.bold === "boolean") f.bold = a.bold;
          if (typeof a.italic === "boolean") f.italic = a.italic;
          if (typeof a.underline === "boolean") f.underline = a.underline ? "Single" : "None";
          if (typeof a.size === "number") f.size = a.size;
          if (typeof a.color === "string") f.color = a.color;
          if (typeof a.font === "string") f.name = a.font;
          if (typeof a.align === "string" && align[a.align]) tr.paragraphFormat.horizontalAlignment = align[a.align]!;
        }
        await ctx.sync();
        return `đã định dạng ${ranges.length} vùng chữ`;
      }
      case "office_ppt_get_theme": {
        const masters = ctx.presentation.slideMasters;
        masters.load("items/id,items/name");
        await ctx.sync();
        for (const m of masters.items) m.layouts.load("items/id,items/name");
        slides.load("items/id");
        await ctx.sync();
        const index = typeof a.slide === "number" ? a.slide : 0;
        const slide = slides.items[index];
        const out: Record<string, unknown> = {
          masters: masters.items.map((m) => ({ name: m.name, layouts: m.layouts.items.map((l) => l.name) })),
        };
        if (slide) {
          slide.layout.load("name");
          slide.shapes.load("items/name,items/type");
          await ctx.sync();
          const fonts = slide.shapes.items.map((s) => {
            if (!TEXT_SHAPES.has(String(s.type))) return undefined;
            const f = s.textFrame.textRange.font;
            f.load("name,size,bold,italic,color");
            return f;
          });
          let loaded = true;
          try {
            await ctx.sync();
          } catch {
            loaded = false; // có hộp không đọc được phông: vẫn trả về phần còn lại
          }
          out.slide = index;
          out.layout = slide.layout.name;
          out.shapes = slide.shapes.items.map((s, k) => {
            const f = loaded ? fonts[k] : undefined;
            return { index: k, name: s.name, type: s.type, ...(f ? { font: { name: f.name, size: f.size, bold: f.bold, italic: f.italic, color: f.color } } : {}) };
          });
        }
        return out;
      }
      case "office_ppt_add_slide": {
        // Không nói bố cục thì giữ cách cũ: để PowerPoint tự chọn.
        const lay = typeof a.layout === "string" && a.layout ? await layoutFor(ctx, a.layout, true) : undefined;
        slides.add(lay ? { layoutId: lay.layout.id, slideMasterId: lay.masterId } : undefined);
        await ctx.sync();
        return `đã thêm slide${lay ? ` (bố cục ${lay.layout.name})` : ""}`;
      }
      case "office_ppt_generate_slide": {
        const title = typeof a.title === "string" ? a.title : "";
        const bullets = Array.isArray(a.bullets) ? a.bullets.map((b) => String(b)) : [];
        const subtitle = typeof a.subtitle === "string" ? a.subtitle : "";
        if (!title && bullets.length === 0 && !subtitle) throw new Error("Cho ít nhất 'title', 'subtitle' hoặc 'bullets'.");
        const lay = await layoutFor(ctx, typeof a.layout === "string" ? a.layout : undefined, bullets.length > 0);
        slides.add(lay ? { layoutId: lay.layout.id, slideMasterId: lay.masterId } : undefined);
        await ctx.sync();
        slides.load("items/id");
        await ctx.sync();
        const slide = slides.items[slides.items.length - 1]!;
        slide.shapes.load("items/name,items/type,items/top");
        await ctx.sync();
        const texts = slide.shapes.items.map((s, index) => ({ s, index })).filter(({ s }) => TEXT_SHAPES.has(String(s.type)));
        const { title: tShape, body: bShape } = findTitleBody(texts.map(({ s, index }) => ({ index, name: s.name, top: s.top })));
        const body = bullets.length > 0 ? bullets.join("\n") : subtitle;
        const shapeAt = (i?: number) => (i === undefined ? undefined : slide.shapes.items[i]);
        let placed = 0;
        if (title) {
          const ts = shapeAt(tShape?.index);
          if (ts) {
            ts.textFrame.textRange.text = title;
            placed++;
          } else slide.shapes.addTextBox(title, { left: 50, top: 40, width: 620, height: 60 }).textFrame.textRange.font.size = 32;
        }
        if (body) {
          const bs = shapeAt(bShape?.index);
          if (bs) {
            bs.textFrame.textRange.text = body;
            placed++;
          } else slide.shapes.addTextBox(bullets.length ? bullets.map((b) => `• ${b}`).join("\n") : body, { left: 50, top: 120, width: 620, height: 320 }).textFrame.textRange.font.size = 20;
        }
        // Bố cục có thêm ô chữ mà slide không dùng (vd phụ đề rỗng): để nguyên, người dùng tự điền hoặc xóa.
        await ctx.sync();
        return `đã tạo slide số ${slides.items.length - 1}${lay ? ` (bố cục ${lay.layout.name})` : ""}${placed < (title ? 1 : 0) + (body ? 1 : 0) ? ", có phần chữ phải đặt bằng hộp văn bản vì bố cục không có ô tương ứng" : ""}`;
      }
      case "office_ppt_format_shape": {
        const index = typeof a.slide === "number" ? a.slide : 0;
        slides.load("items/id");
        await ctx.sync();
        const slide = slides.items[index];
        if (!slide) throw new Error(`Không có slide số ${index} (đếm từ 0, hiện có ${slides.items.length}).`);
        slide.shapes.load("items/name,items/type");
        await ctx.sync();
        const list = slide.shapes.items;
        const shape = typeof a.shape === "number" ? list[a.shape] : typeof a.shape === "string" ? list.find((s) => s.name === a.shape) : undefined;
        if (!shape) throw new Error(`Không thấy hình '${String(a.shape)}' trên slide ${index}. Có: ${list.map((s, k) => `${k}=${s.name}`).join("; ")} (dùng số thứ tự 'index' hoặc tên).`);
        if (TEXT_SHAPES.has(String(shape.type))) {
          const f = shape.textFrame.textRange.font;
          if (typeof a.bold === "boolean") f.bold = a.bold;
          if (typeof a.italic === "boolean") f.italic = a.italic;
          if (typeof a.size === "number") f.size = a.size;
          if (typeof a.color === "string") f.color = a.color;
          if (typeof a.font === "string") f.name = a.font;
        }
        if (typeof a.fill === "string") shape.fill.setSolidColor(a.fill);
        for (const k of ["left", "top", "width", "height"] as const) if (typeof a[k] === "number") shape[k] = a[k] as number;
        await ctx.sync();
        return `đã định dạng hình ${shape.name}`;
      }
      case "office_ppt_insert_textbox": {
        const index = typeof a.slide === "number" ? a.slide : 0;
        if (typeof a.text !== "string") throw new Error("Thiếu tham số 'text'.");
        slides.load("items/id");
        await ctx.sync();
        const slide = slides.items[index];
        if (!slide) throw new Error(`Không có slide số ${index} (đếm từ 0, hiện có ${slides.items.length}).`);
        const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
        const box = slide.shapes.addTextBox(a.text, { left: num(a.left, 60), top: num(a.top, 60), width: num(a.width, 600), height: num(a.height, 80) });
        const font = box.textFrame.textRange.font;
        if (typeof a.size === "number") font.size = a.size;
        if (typeof a.bold === "boolean") font.bold = a.bold;
        if (typeof a.color === "string") font.color = a.color;
        await ctx.sync();
        return "đã chèn hộp văn bản";
      }
      case "office_ppt_apply_theme": {
        const t = themeArgs(a);
        slides.load("items/id");
        await ctx.sync();
        for (const slide of slides.items) slide.shapes.load("items/name,items/type,items/top");
        await ctx.sync();
        let n = 0;
        for (const slide of slides.items) {
          const texts = slide.shapes.items.filter((s) => TEXT_SHAPES.has(String(s.type)));
          if (texts.length === 0) continue;
          // Tiêu đề: shape tên "Title"/"Tiêu đề", nếu không có thì hộp chữ nằm cao nhất.
          const title = texts.find((s) => /title|tiêu đề/i.test(s.name)) ?? texts.reduce((a, b) => (b.top < a.top ? b : a));
          for (const s of texts) {
            const f = s.textFrame.textRange.font;
            if (s === title) {
              if (t.headingFont) f.name = t.headingFont;
              f.color = t.primary;
            } else {
              if (t.bodyFont) f.name = t.bodyFont;
              if (t.text) f.color = t.text;
            }
            n++;
          }
        }
        try {
          await ctx.sync();
        } catch {
          throw new Error("Có hộp chữ không đổi được định dạng (vd SmartArt). Các slide khác có thể đã đổi; dùng Ctrl+Z nếu muốn hoàn tác.");
        }
        return `đã áp chủ đề cho ${slides.items.length} slide (${n} hộp chữ)`;
      }
      default:
        throw new Error(`Công cụ PowerPoint không tồn tại: ${tool}`);
    }
  });
}
