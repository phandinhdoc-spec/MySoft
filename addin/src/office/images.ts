import { keepTogetherOoxml, mapImages, type ExamImage, type ParaInfo, type QuestionBlock } from "@pvta/shared";

/** Hình gửi lên bridge: thông tin vị trí + ảnh đã thu nhỏ (JPEG base64) + chữ của câu chứa hình. */
export interface ScannedImage extends ExamImage {
  hash: string;
  /** Lời câu hỏi chứa hình (rút gọn), để model đọc hình biết hình dùng cho việc gì. */
  context: string;
  data?: string;
  w: number;
  h: number;
}

const MAX_IMAGES = 30;
const MAX_SIDE = 1024;

function mimeOf(b64: string): string | undefined {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  if (b64.startsWith("Qk")) return "image/bmp";
  return undefined; // EMF/WMF… trình duyệt không vẽ được
}

async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Thu nhỏ còn cạnh dài tối đa 1024 px, JPEG: đủ để đọc số liệu, nhẹ khi gửi. */
function shrink(b64: string, mime: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext("2d");
      if (!g) return resolve(undefined);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = () => resolve(undefined);
    img.src = `data:${mime};base64,${b64}`;
  });
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

async function readParas(ctx: Word.RequestContext): Promise<{ paras: ParaInfo[]; items: Word.Paragraph[] }> {
  const ps = ctx.document.body.paragraphs;
  ps.load("items/text");
  await ctx.sync();
  const pics = ps.items.map((p) => {
    const c = p.inlinePictures;
    c.load("items");
    return c;
  });
  await ctx.sync();
  return { paras: ps.items.map((p, i) => ({ text: p.text, pics: pics[i]!.items.length })), items: ps.items };
}

/**
 * Quét hình trong văn bản Word: gán hình vào câu ("Câu 2", "Bài 3", hoặc theo chú thích "Hình 2").
 * withData = false: chỉ vị trí (nhanh); true: kèm ảnh thu nhỏ để model nền đọc.
 */
export async function scanWordImages(withData: boolean): Promise<{ images: ScannedImage[]; blocks: QuestionBlock[] }> {
  return Word.run(async (ctx) => {
    const { paras } = await readParas(ctx);
    const { blocks, images } = mapImages(paras);
    if (images.length === 0) return { images: [], blocks };
    const all = ctx.document.body.inlinePictures;
    all.load("items/width,items/height");
    await ctx.sync();
    const take = images.slice(0, MAX_IMAGES);
    const srcs = take.map((_, i) => all.items[i]?.getBase64ImageSrc());
    await ctx.sync();
    const out: ScannedImage[] = [];
    for (const img of take) {
      const pic = all.items[img.index];
      const raw = srcs[img.index]?.value ?? "";
      const b = blocks.find((x) => x.label === img.question);
      const context = b ? clip(paras.slice(b.start, b.end + 1).map((p) => p.text).join(" "), 600) : clip(paras[img.para]?.text ?? "", 200);
      const s: ScannedImage = { ...img, hash: raw ? await sha1(raw) : `none-${img.index}`, context, w: Math.round(pic?.width ?? 0), h: Math.round(pic?.height ?? 0) };
      const mime = mimeOf(raw);
      if (withData && raw && mime) s.data = await shrink(raw, mime);
      out.push(s);
    }
    return { images: out, blocks };
  });
}

/**
 * Giữ câu hỏi và hình của nó trên cùng một trang: đặt "giữ với đoạn sau" cho các đoạn của khối câu (trừ đoạn cuối).
 * questions: số câu cần giữ; bỏ trống = mọi câu có hình.
 */
export async function keepQuestionsTogether(questions?: number[]): Promise<{ blocks: string[] }> {
  return Word.run(async (ctx) => {
    const { paras, items } = await readParas(ctx);
    const { blocks, images } = mapImages(paras);
    const withPics = new Set(images.map((i) => i.question).filter(Boolean) as string[]);
    const chosen = blocks.filter((b) => (questions && questions.length ? questions.includes(b.num) : withPics.has(b.label)));
    const done: string[] = [];
    // Làm từ cuối lên để chỉ số đoạn phía trước không bị xê dịch.
    for (const b of [...chosen].reverse()) {
      // Bỏ các đoạn trống ở cuối khối (khoảng cách giữa hai câu).
      let end = b.end;
      while (end > b.start && !paras[end]!.text.trim() && paras[end]!.pics === 0) end--;
      if (end <= b.start) continue;
      const first = items[b.start]!;
      const last = items[end]!;
      const range = first.getRange("Start").expandTo(last.getRange("End"));
      const ox = range.getOoxml();
      const before = ctx.document.body.paragraphs;
      before.load("items");
      await ctx.sync();
      const n0 = before.items.length;
      const { xml, paragraphs } = keepTogetherOoxml(ox.value);
      if (paragraphs < 2) continue;
      range.insertOoxml(xml, "Replace");
      await ctx.sync();
      // Word đôi khi thêm một đoạn trống sau khi chèn OOXML: xóa đi để không đổi bố cục.
      const after = ctx.document.body.paragraphs;
      after.load("items/text");
      await ctx.sync();
      if (after.items.length > n0) {
        const extra = after.items[end + 1];
        if (extra && !extra.text.trim()) {
          extra.inlinePictures.load("items");
          await ctx.sync();
          if (extra.inlinePictures.items.length === 0) {
            extra.delete();
            await ctx.sync();
          }
        }
      }
      done.push(b.label);
    }
    return { blocks: done.reverse() };
  });
}

/** Thay hình chỉ chứa công thức (id H1, H2…) bằng Equation của Word. */
export async function imageToEquation(id: string, latex: string): Promise<string> {
  const eq = await import("./equation");
  const clean = latex.replace(/^\s*\$+|\$+\s*$/g, "").trim();
  if (!clean) throw new Error("'latex' đang trống.");
  try {
    eq.latexToOmml(clean);
  } catch (e) {
    throw new Error(`LaTeX chưa đúng cú pháp: ${e instanceof Error ? e.message : String(e)}. Hình giữ nguyên.`);
  }
  const { images } = await scanWordImages(false);
  const img = images.find((x) => x.id === id);
  if (!img) throw new Error(`Không thấy hình ${id}. Gọi office_word_list_images để xem danh sách.`);
  return Word.run(async (ctx) => {
    const all = ctx.document.body.inlinePictures;
    all.load("items");
    await ctx.sync();
    const pic = all.items[img.index];
    if (!pic) throw new Error(`Không thấy hình ${id}.`);
    pic.getRange("Whole").insertOoxml(eq.equationToOoxml(clean), "Replace");
    await ctx.sync();
    return `đã thay hình ${id} bằng công thức`;
  });
}
