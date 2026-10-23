/**
 * Đề thi / văn bản có hình trong Word: gán từng hình vào câu hỏi, chia khối câu hỏi,
 * và đánh dấu "giữ với đoạn sau" (keepNext) trong OOXML để Word không tách hình khỏi câu.
 * Toàn là hàm thuần (chạy được ở add-in lẫn bridge, kiểm thử bằng Node).
 */

export interface ParaInfo {
  text: string;
  /** Số hình nằm trong đoạn này. */
  pics: number;
}

export interface QuestionBlock {
  /** Nhãn hiển thị, vd "Câu 2", "Bài 3". */
  label: string;
  /** Số câu (2 trong "Câu 2"). */
  num: number;
  /** Đoạn đầu (dòng "Câu 2") và đoạn cuối (trước câu kế tiếp) của khối, tính từ 0. */
  start: number;
  end: number;
}

export interface ExamImage {
  /** H1, H2… theo thứ tự xuất hiện. */
  id: string;
  /** Vị trí trong danh sách hình của văn bản (0..). */
  index: number;
  para: number;
  /** Nhãn câu chứa hình ("Câu 2"), hoặc undefined nếu hình không thuộc câu nào. */
  question?: string;
  /** Chú thích gần hình, vd "Hình 2". */
  caption?: string;
  /** Vì sao gán vào câu này. */
  by?: "caption" | "position";
}

const Q_RE = /^\s*(câu|cau|bài|bai|question)\s*(\d{1,3})\b/i;
const CAP_RE = /^\s*(hình|hinh|h\.)\s*(\d{1,3}(?:\.\d{1,2})?)\b/i;
const REF_RE = /(hình|hinh|\bh)\s*\.?\s*(\d{1,3}(?:\.\d{1,2})?)\b/gi;

export function questionBlocks(paras: ParaInfo[]): QuestionBlock[] {
  const heads: Array<{ i: number; label: string; num: number }> = [];
  paras.forEach((p, i) => {
    const m = Q_RE.exec(p.text);
    if (m) {
      const word = m[1]!.toLowerCase().startsWith("b") ? "Bài" : m[1]!.toLowerCase().startsWith("q") ? "Question" : "Câu";
      heads.push({ i, label: `${word} ${Number(m[2])}`, num: Number(m[2]) });
    }
  });
  return heads.map((h, k) => ({ label: h.label, num: h.num, start: h.i, end: (heads[k + 1]?.i ?? paras.length) - 1 }));
}

/** Gán hình vào câu: chú thích "Hình N" mà câu nhắc tới thì theo chú thích; còn lại theo vị trí (hình nằm trong khối câu nào). */
export function mapImages(paras: ParaInfo[]): { blocks: QuestionBlock[]; images: ExamImage[] } {
  const blocks = questionBlocks(paras);
  const images: ExamImage[] = [];
  paras.forEach((p, i) => {
    for (let k = 0; k < p.pics; k++) images.push({ id: `H${images.length + 1}`, index: images.length, para: i });
  });
  const near = (i: number): string | undefined => {
    for (const j of [i, i + 1, i - 1]) {
      const t = paras[j]?.text;
      const m = t ? CAP_RE.exec(t) : null;
      if (m) return `Hình ${m[2]}`;
    }
    return undefined;
  };
  // Câu nào nhắc "hình N".
  const refs = new Map<string, string>();
  for (const b of blocks) {
    for (let i = b.start; i <= b.end; i++) {
      const t = paras[i]?.text ?? "";
      if (CAP_RE.test(t) && paras[i]!.pics === 0 && i !== b.start) continue; // dòng chú thích, không phải lời câu hỏi
      for (const m of t.matchAll(REF_RE)) if (!refs.has(`Hình ${m[2]}`)) refs.set(`Hình ${m[2]}`, b.label);
    }
  }
  for (const img of images) {
    img.caption = near(img.para);
    const byCap = img.caption ? refs.get(img.caption) : undefined;
    if (byCap) {
      img.question = byCap;
      img.by = "caption";
      continue;
    }
    const b = blocks.find((x) => img.para >= x.start && img.para <= x.end);
    if (b) {
      img.question = b.label;
      img.by = "position";
    }
  }
  return { blocks, images };
}

/** Câu (theo số) mà yêu cầu của giáo viên nhắc tới: "câu 1", "câu 2 và 3", "bài 4", "hình 2". */
export function mentionedQuestions(text: string): { questions: number[]; figures: string[] } {
  const qs = new Set<number>();
  for (const m of text.matchAll(/(câu|cau|bài|bai)\s*((?:\d{1,3}\s*(?:,|và|va|-|đến|den)?\s*)+)/gi)) {
    for (const n of m[2]!.match(/\d{1,3}/g) ?? []) qs.add(Number(n));
  }
  const figs = new Set<string>();
  for (const m of text.matchAll(REF_RE)) figs.add(`Hình ${m[2]}`);
  return { questions: [...qs], figures: [...figs] };
}

/**
 * Thêm <w:keepNext/> (giữ với đoạn sau) cho mọi đoạn trừ đoạn cuối, và <w:keepLines/> cho mọi đoạn,
 * trong phần thân của gói OOXML (Range.getOoxml). Word sẽ đẩy cả câu hỏi + hình sang trang sau thay vì tách đôi.
 */
export function keepTogetherOoxml(xml: string): { xml: string; paragraphs: number } {
  const bodyStart = xml.indexOf("<w:body>");
  const bodyEnd = xml.lastIndexOf("</w:body>");
  if (bodyStart < 0 || bodyEnd < 0) return { xml, paragraphs: 0 };
  const head = xml.slice(0, bodyStart);
  const tail = xml.slice(bodyEnd);
  const body = xml.slice(bodyStart, bodyEnd);
  // Chỉ các đoạn cấp ngoài cùng của thân (không đụng đoạn trong ô bảng hay hộp chữ).
  const re = /<w:p(?=[\s>])[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:sectPr[\s\S]*?<\/w:sectPr>/g;
  const parts: Array<{ s: number; e: number; para: boolean }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) parts.push({ s: m.index, e: m.index + m[0].length, para: m[0].startsWith("<w:p") });
  const paraIdx = parts.map((p, i) => (p.para ? i : -1)).filter((i) => i >= 0);
  if (paraIdx.length === 0) return { xml, paragraphs: 0 };
  const lastPara = paraIdx[paraIdx.length - 1]!;
  let out = "";
  let pos = 0;
  parts.forEach((p, i) => {
    out += body.slice(pos, p.s);
    let seg = body.slice(p.s, p.e);
    if (p.para) seg = addKeep(seg, i !== lastPara);
    out += seg;
    pos = p.e;
  });
  out += body.slice(pos);
  return { xml: head + out + tail, paragraphs: paraIdx.length };
}

function addKeep(p: string, next: boolean): string {
  const want = (next ? "<w:keepNext/>" : "") + "<w:keepLines/>";
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>|<w:pPr\/>/.exec(p);
  if (!pPr) return p.replace(/^(<w:p(?=[\s>])[^>]*>)/, `$1<w:pPr>${want}</w:pPr>`);
  let inner = pPr[1] ?? "";
  inner = inner.replace(/<w:keepNext(?:\s[^>]*)?\/>|<w:keepLines(?:\s[^>]*)?\/>/g, "");
  // Theo thứ tự lược đồ: keepNext, keepLines nằm sau pStyle.
  const styled = /^(\s*<w:pStyle[^>]*\/>)/.exec(inner);
  const merged = styled ? styled[1] + want + inner.slice(styled[1]!.length) : want + inner;
  return p.slice(0, pPr.index) + `<w:pPr>${merged}</w:pPr>` + p.slice(pPr.index + pPr[0].length);
}
