import temml from "temml";
import { mml2omml } from "mathml2omml";

/**
 * LaTeX (math, physics, chemistry via mhchem `\ce{}` / `\pu{}`) -> native Word equations (OMML).
 * `latex-to-omml` needs mathjax-node (Node only), so the browser pipeline is temml (LaTeX -> MathML) + mathml2omml.
 */

import { hasMath, splitMath, type MathSeg as Seg } from "@pvta/shared";

export { hasMath, splitMath };

/** `ce{H2O}` written without the backslash -> `\ce{H2O}`. */
function normalize(latex: string): string {
  return latex.replace(/(^|[^\\A-Za-z])(ce|pu)\{/g, "$1\\$2{");
}

/** Rewrite temml/mhchem MathML constructs that mathml2omml mishandles (padding wrappers, detached scripts, spacer-only arrows). */
function tidyMathml(mml: string): string {
  return mml
    .replace(/<mpadded[^>]*>([\s\S]*?)<\/mpadded>/g, "$1")
    .replace(/<(mover|munder)[^>]*>(<mo[^>]*>[^<]*<\/mo>)<mspace[^>]*><\/mspace><\/\1>/g, "$2")
    .replace(/<mspace><\/mspace>/g, "")
    .replace(/<mrow>(<mi[^>]*>[^<]*<\/mi>)<\/mrow>/g, "$1")
    // `<mi>CaCO</mi><msub><mrow></mrow>X</msub>` -> `<mi>CaC</mi><msub><mi>O</mi>X</msub>`
    .replace(
      /<mi([^>]*)>([^<]*?)([^<])<\/mi><(msub|msup|msubsup)><mrow><\/mrow>/g,
      (_m, at: string, a: string, b: string, t: string) => `${a ? `<mi${at}>${a}</mi>` : ""}<${t}><mi${at}>${b}</mi>`,
    )
    .replace(/<mrow><\/mrow>/g, "");
}

/** One LaTeX formula -> `<m:oMath>` (throws on invalid LaTeX). */
export function latexToOmml(latex: string): string {
  const mml = temml.renderToString(normalize(latex), { displayMode: false, throwOnError: true, xml: true, annotate: false });
  return mml2omml(tidyMathml(mml))
    .replace(/<w:rPr\/>/g, "")
    .replace(/<m:sty m:val="undefined"\/>/g, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (t: string) => (t ? `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : "");

function mathXml(s: Extract<Seg, { kind: "math" }>): { xml: string; display: boolean } {
  try {
    return { xml: latexToOmml(s.latex), display: s.display };
  } catch {
    // Invalid LaTeX: keep the source visible rather than losing it.
    return { xml: run(s.display ? `$$${s.latex}$$` : `$${s.latex}$`), display: false };
  }
}

/** Mixed text + math -> `<w:p>` list. Display math gets its own centred paragraph. */
export function textToParagraphsXml(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    let cur = "";
    const flush = () => {
      out.push(`<w:p>${cur}</w:p>`);
      cur = "";
    };
    for (const seg of splitMath(line)) {
      if (seg.kind === "text") {
        cur += run(seg.text);
        continue;
      }
      const m = mathXml(seg);
      if (m.display && m.xml.startsWith("<m:oMath")) {
        if (cur.trim()) flush();
        cur = `<m:oMathPara>${m.xml}</m:oMathPara>`;
        flush();
      } else cur += m.xml;
    }
    if (cur || !out.length || line === "") flush();
  }
  return out.join("");
}

/** Flat-OPC package accepted by `range.insertOoxml`. */
export function ooxmlPackage(bodyXml: string): string {
  return (
    `<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">` +
    `<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml">` +
    `<pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships></pkg:xmlData></pkg:part>` +
    `<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">` +
    `<pkg:xmlData><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">` +
    `<w:body>${bodyXml}</w:body></w:document></pkg:xmlData></pkg:part></pkg:package>`
  );
}

export const textToOoxml = (text: string) => ooxmlPackage(textToParagraphsXml(text));
/** Mixed text + math on a single line -> single `<w:p>` with inline `<m:oMath>` (for replacing a substring inside a paragraph via XML). */
export function inlineTextToOoxml(text: string): string {
  let cur = "";
  for (const seg of splitMath(text.replace(/\r\n?/g, " "))) {
    if (seg.kind === "text") {
      cur += run(seg.text);
      continue;
    }
    const m = mathXml(seg);
    cur += m.xml;
  }
  return ooxmlPackage(`<w:p>${cur}</w:p>`);
}
/** A single formula as a display equation. */
export const equationToOoxml = (latex: string) => textToOoxml(`$$${latex.replace(/^\s*\$+|\$+\s*$/g, "")}$$`);
/** A single formula as an inline equation (for replacing a substring inside a paragraph without breaking the line). */
export const inlineEquationToOoxml = (latex: string) => ooxmlPackage(`<w:p>${latexToOmml(latex.replace(/^\s*\$+|\$+\s*$/g, "").trim())}</w:p>`);

const unescXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function hasUnclosedMathDelimiter(t: string): boolean {
  const dollars = (t.match(/(?<!\\)\$/g) ?? []).length;
  if (dollars % 2 === 1) return true;
  const openParen = (t.match(/\\\(/g) ?? []).length;
  const closeParen = (t.match(/\\\)/g) ?? []).length;
  if (openParen > closeParen) return true;
  const openBrack = (t.match(/\\\[/g) ?? []).length;
  const closeBrack = (t.match(/\\\]/g) ?? []).length;
  return openBrack > closeBrack;
}

/**
 * Chuyển đổi trực tiếp trên chuỗi OOXML của Word: tìm mọi đoạn `<w:p>` có chứa công thức LaTeX dạng text
 * (`$…$`, `$$…$$`, `\(...\)`, `\[...\]`, `\ce{…}`) và thay `<w:r><w:t>...$latex$...</w:t></w:r>` bằng `<m:oMath>`
 * ngay trong bộ nhớ (1 lượt XML duy nhất, giữ nguyên `<w:pPr>`, `<w:rPr>`, bảng biểu và hình ảnh).
 */
export function convertOoxmlLatexToEquation(ooxml: string): { xml: string; converted: number; paragraphs: number } {
  let converted = 0;
  let paragraphs = 0;
  const RUN_RE = /<w:r\b[^>]*>(\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>\s*<\/w:r>/g;

  let xml = ooxml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paraXml) => {
    if (!/[$]|\\\(|\\\[|\\(?:ce|pu|frac|sqrt|sum|int)\b/.test(paraXml)) return paraXml;
    // Bỏ thẻ đánh dấu lỗi chính tả của Word để công thức $...$ không bị cắt làm nhiều run
    const cleanedPara = paraXml.replace(/<w:proofErr\b[^>]*\/>/g, "");

    // Bước 1: Gộp các <w:r> liên tiếp có cùng <w:rPr> hoặc đang mở dở dấu $ / \( / \[
    const tokens: Array<{ kind: "other"; raw: string } | { kind: "run"; raw: string; rPr: string; text: string }> = [];
    let lastIdx = 0;
    for (const m of cleanedPara.matchAll(RUN_RE)) {
      const idx = m.index ?? 0;
      if (idx > lastIdx) tokens.push({ kind: "other", raw: cleanedPara.slice(lastIdx, idx) });
      const rPr = (m[1] ?? "").trim();
      const text = unescXml(m[2] ?? "");
      const prev = tokens[tokens.length - 1];
      if (prev && prev.kind === "run" && (prev.rPr === rPr || hasUnclosedMathDelimiter(prev.text))) {
        prev.text += text;
        prev.raw += m[0];
      } else {
        tokens.push({ kind: "run", raw: m[0], rPr, text });
      }
      lastIdx = idx + m[0].length;
    }
    if (lastIdx < cleanedPara.length) tokens.push({ kind: "other", raw: cleanedPara.slice(lastIdx) });

    // Bước 2: Chuyển các run chứa LaTeX sang <m:oMath>
    let paraConverted = 0;
    const onlyOneRun = tokens.filter((t) => t.kind === "run").length === 1;
    const rebuilt = tokens
      .map((tok) => {
        if (tok.kind === "other") return tok.raw;
        if (!hasMath(tok.text)) return tok.raw;
        const segs = splitMath(tok.text);
        if (!segs.some((s) => s.kind === "math")) return tok.raw;
        let runOut = "";
        let localHits = 0;
        for (const seg of segs) {
          if (seg.kind === "text") {
            if (seg.text) runOut += `<w:r>${tok.rPr}<w:t xml:space="preserve">${esc(seg.text)}</w:t></w:r>`;
            continue;
          }
          try {
            const omml = latexToOmml(seg.latex);
            if (seg.display && onlyOneRun && segs.length === 1) {
              runOut += `<m:oMathPara>${omml}</m:oMathPara>`;
            } else {
              runOut += omml;
            }
            localHits++;
          } catch {
            const fallback = seg.display ? `$$${seg.latex}$$` : `$${seg.latex}$`;
            runOut += `<w:r>${tok.rPr}<w:t xml:space="preserve">${esc(fallback)}</w:t></w:r>`;
          }
        }
        if (localHits === 0) return tok.raw;
        paraConverted += localHits;
        return runOut;
      })
      .join("");

    if (paraConverted > 0) {
      converted += paraConverted;
      paragraphs++;
      return rebuilt;
    }
    return paraXml;
  });

  if (converted > 0 && !/xmlns:m=/.test(xml)) {
    xml = xml.replace(/<w:document\b/, '<w:document xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"');
  }
  return { xml, converted, paragraphs };
}

const UNICODE_TO_LATEX: Record<string, string> = {
  "α": "\\alpha ",
  "β": "\\beta ",
  "γ": "\\gamma ",
  "δ": "\\delta ",
  "Δ": "\\Delta ",
  "ε": "\\epsilon ",
  "θ": "\\theta ",
  "λ": "\\lambda ",
  "μ": "\\mu ",
  "π": "\\pi ",
  "ρ": "\\rho ",
  "σ": "\\sigma ",
  "ω": "\\omega ",
  "Ω": "\\Omega ",
  "⋅": "\\cdot ",
  "×": "\\times ",
  "÷": "\\div ",
  "±": "\\pm ",
  "≈": "\\approx ",
  "≠": "\\neq ",
  "≤": "\\leq ",
  "≥": "\\geq ",
  "∞": "\\infty ",
  "→": "\\rightarrow ",
  "⇒": "\\Rightarrow ",
  "↔": "\\leftrightarrow ",
  "°": "^\\circ ",
};

/**
 * Chuyển đổi một khối thẻ `<m:oMath>...</m:oMath>` (OMML của Word) ngược về chuỗi LaTeX chuẩn.
 * Xử lý đệ quy phân số `<m:f>`, căn thức `<m:rad>`, số mũ `<m:sSup>`, chỉ số dưới `<m:sSub>`,
 * cả trên lẫn dưới `<m:sSubSup>`, tổng/tích phân `<m:nary>`, ngoặc `<m:d>`.
 */
export function ommlToLatex(omml: string): string {
  let s = omml;
  // Lặp từ trong ra ngoài cho các cấu trúc lồng nhau
  for (let pass = 0; pass < 8; pass++) {
    const before = s;
    // <m:f> -> \frac{num}{den}
    s = s.replace(
      /<m:f\b[^>]*>(?:(?!<m:f\b)[\s\S])*?<m:num\b[^>]*>([\s\S]*?)<\/m:num>\s*<m:den\b[^>]*>([\s\S]*?)<\/m:den>\s*<\/m:f>/g,
      (_m, num: string, den: string) => `<m:t>\\frac{${ommlToLatex(num)}}{${ommlToLatex(den)}}</m:t>`,
    );
    // <m:rad> -> \sqrt[deg]{e} hoặc \sqrt{e}
    s = s.replace(
      /<m:rad\b[^>]*>([\s\S]*?)<m:deg\b[^>]*>([\s\S]*?)<\/m:deg>\s*<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<\/m:rad>/g,
      (_m, pr: string, deg: string, e: string) => {
        const hide = /<m:degHide\b[^>]*(?:m:val="(?:1|true|on)"|\/>)/.test(pr);
        const d = hide ? "" : ommlToLatex(deg).trim();
        return `<m:t>\\sqrt${d ? `[${d}]` : ""}{${ommlToLatex(e)}}</m:t>`;
      },
    );
    s = s.replace(
      /<m:rad\b[^>]*>(?:(?!<m:rad\b)[\s\S])*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<\/m:rad>/g,
      (_m, e: string) => `<m:t>\\sqrt{${ommlToLatex(e)}}</m:t>`,
    );
    // <m:sSubSup> -> base_{sub}^{sup}
    s = s.replace(
      /<m:sSubSup\b[^>]*>(?:(?!<m:sSubSup\b)[\s\S])*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>\s*<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>\s*<\/m:sSubSup>/g,
      (_m, base: string, sub: string, sup: string) => {
        const b = ommlToLatex(base);
        const sb = ommlToLatex(sub);
        const sp = ommlToLatex(sup);
        return `<m:t>${b}_{${sb}}^{${sp}}</m:t>`;
      },
    );
    // <m:sSup> -> base^{sup}
    s = s.replace(
      /<m:sSup\b[^>]*>(?:(?!<m:sSup\b)[\s\S])*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>\s*<\/m:sSup>/g,
      (_m, base: string, sup: string) => {
        const b = ommlToLatex(base);
        const sp = ommlToLatex(sup);
        return `<m:t>${b}^{${sp}}</m:t>`;
      },
    );
    // <m:sSub> -> base_{sub}
    s = s.replace(
      /<m:sSub\b[^>]*>(?:(?!<m:sSub\b)[\s\S])*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>\s*<\/m:sSub>/g,
      (_m, base: string, sub: string) => {
        const b = ommlToLatex(base);
        const sb = ommlToLatex(sub);
        return `<m:t>${b}_{${sb}}</m:t>`;
      },
    );
    // <m:nary> -> \sum / \int_{sub}^{sup} e
    s = s.replace(
      /<m:nary\b[^>]*>([\s\S]*?)<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>\s*<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>\s*<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<\/m:nary>/g,
      (_m, pr: string, sub: string, sup: string, e: string) => {
        const chrMatch = /<m:chr\b[^>]*m:val="([^"]+)"/.exec(pr);
        const chr = chrMatch?.[1] ?? "∫";
        const op = chr === "∑" ? "\\sum" : chr === "∏" ? "\\prod" : "\\int";
        const sb = ommlToLatex(sub).trim();
        const sp = ommlToLatex(sup).trim();
        return `<m:t>${op}${sb ? `_{${sb}}` : ""}${sp ? `^{${sp}}` : ""} ${ommlToLatex(e)}</m:t>`;
      },
    );
    // <m:d> -> ngoặc (e)
    s = s.replace(/<m:d\b[^>]*>([\s\S]*?)<m:e\b[^>]*>([\s\S]*?)<\/m:e>\s*<\/m:d>/g, (_m, pr: string, e: string) => {
      const beg = /<m:begChr\b[^>]*m:val="([^"]+)"/.exec(pr)?.[1] ?? "(";
      const end = /<m:endChr\b[^>]*m:val="([^"]+)"/.exec(pr)?.[1] ?? ")";
      return `<m:t>${beg}${ommlToLatex(e)}${end}</m:t>`;
    });
    if (s === before) break;
  }

  // Gom toàn bộ nội dung <m:t> và <w:t> còn lại
  const parts: string[] = [];
  for (const m of s.matchAll(/<(?:m|w):t(?:\s+[^>]*)?>([\s\S]*?)<\/(?:m|w):t>/g)) {
    parts.push(unescXml(m[1] ?? ""));
  }
  let out = parts.join("");
  for (const [u, ltx] of Object.entries(UNICODE_TO_LATEX)) {
    out = out.replaceAll(u, ltx);
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Chuyển đổi trực tiếp trên chuỗi OOXML của Word: tìm mọi thẻ `<m:oMathPara>` / `<m:oMath>` (Equation của Word)
 * và đổi sang chuỗi LaTeX `$…$` / `$$…$$` nằm trong `<w:r><w:t>` (1 lượt XML duy nhất).
 */
export function convertOoxmlEquationToLatex(ooxml: string): { xml: string; converted: number; paragraphs: number } {
  let converted = 0;
  let paragraphs = 0;

  const xml = ooxml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paraXml) => {
    if (!/<m:oMath\b/.test(paraXml)) return paraXml;
    let paraHits = 0;
    let updated = paraXml.replace(/<m:oMathPara\b[^>]*>[\s\S]*?<\/m:oMathPara>/g, (mPara) => {
      const ltx = ommlToLatex(mPara);
      if (!ltx) return mPara;
      paraHits++;
      return `<w:r><w:t xml:space="preserve">$$${esc(ltx)}$$</w:t></w:r>`;
    });
    updated = updated.replace(/<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g, (mInline) => {
      const ltx = ommlToLatex(mInline);
      if (!ltx) return mInline;
      paraHits++;
      return `<w:r><w:t xml:space="preserve">$${esc(ltx)}$</w:t></w:r>`;
    });
    if (paraHits > 0) {
      converted += paraHits;
      paragraphs++;
      return updated;
    }
    return paraXml;
  });

  return { xml, converted, paragraphs };
}

/** Biểu thức hóa học / số mũ viết dạng chữ thường phổ biến trong đề Toán, Lý, Hóa phổ thông. */
const PLAIN_CHEM_OR_EXP_RE =
  /(?<![\\$\w])((?:H2O2|H2O|H2SO4|H2SO3|H2S|H2CO3|HNO3|H3PO4|HClO4|HClO|Ca\(OH\)2|Ba\(OH\)2|Mg\(OH\)2|Fe\(OH\)2|Fe\(OH\)3|Al\(OH\)3|Cu\(OH\)2|Zn\(OH\)2|Al2\(SO4\)3|Fe2\(SO4\)3|Cr2\(SO4\)3|\(NH4\)2SO4|\(NH4\)2CO3|NH4NO3|NH4Cl|CaCO3|BaCO3|Na2CO3|NaHCO3|K2CO3|KHCO3|BaSO4|CaSO4|CuSO4|FeSO4|ZnSO4|MgSO4|Na2SO4|Na2SO3|KMnO4|K2Cr2O7|KClO3|Fe2O3|Fe3O4|Al2O3|Cr2O3|P2O5|SO2|SO3|CO2|NO2|N2O5|N2O|CH4|C2H4|C2H2|C2H6|C3H8|C4H10|C6H6|C2H5OH|CH3COOH|C6H12O6|C12H22O11|AgNO3|Cu\(NO3\)2|Fe\(NO3\)3|Fe\(NO3\)2|Mg\(NO3\)2|Zn\(NO3\)2|BaCl2|CaCl2|MgCl2|FeCl2|FeCl3|AlCl3|CuCl2|ZnCl2)|(?:[A-Za-z)\]]\^[-+]?\d+)|(?:\b10\^[-+]?\d+))(?![\w$])/g;

function cleanVietnameseSpacing(t: string): { text: string; fixes: number } {
  let fixes = 0;
  let s = t;
  // Gộp nhiều khoảng trắng liên tiếp (giữ khoảng trắng đầu/cuối của run nếu chỉ có 1 dấu cách nối chữ)
  s = s.replace(/ {2,}/g, () => {
    fixes++;
    return " ";
  });
  // Xóa khoảng trắng thừa trước dấu câu (, . ; : ? ! ) ])
  s = s.replace(/ +([,.;:?!)\]])/g, (_m, p: string) => {
    fixes++;
    return p;
  });
  // Xóa khoảng trắng thừa ngay sau dấu mở ngoặc ( [
  s = s.replace(/([(\[]) +/g, (_m, p: string) => {
    fixes++;
    return p;
  });
  // Thêm khoảng trắng sau dấu phẩy/chấm phẩy/hai chấm khi liền sau là chữ cái tiếng Việt (không đụng số thập phân 1,5 hay tỉ lệ 1:2)
  s = s.replace(/([,;:])([\p{L}])/gu, (_m, p: string, ch: string) => {
    fixes++;
    return `${p} ${ch}`;
  });
  return { text: s, fixes };
}

/**
 * Chuẩn hóa nhanh toàn bộ OOXML trong 1 lượt:
 * 1) Xóa khoảng trắng thừa, chuẩn hóa dấu câu tiếng Việt trong các `<w:t>` (không đụng thẻ cấu trúc).
 * 2) Tự bọc công thức hóa học / số mũ viết thường (`H2SO4`, `Ca(OH)2`, `x^2`, `10^-3`) thành `$…$` và
 *    chuyển toàn bộ `$…$` / `$$…$$` sang Equation chuẩn của Word (`<m:oMath>`).
 */
export function normalizeOoxmlTypographyAndMath(ooxml: string): {
  xml: string;
  typographyFixed: number;
  mathConverted: number;
  paragraphs: number;
} {
  let typographyFixed = 0;
  let touchedParas = 0;
  const RUN_RE = /<w:r\b[^>]*>(\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>\s*<\/w:r>/g;

  const step1 = ooxml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paraXml) => {
    const cleanedPara = paraXml.replace(/<w:proofErr\b[^>]*\/>/g, "");
    let paraChanged = false;
    const nextPara = cleanedPara.replace(RUN_RE, (fullRun, rPrRaw: string | undefined, innerRaw: string) => {
      const rPr = (rPrRaw ?? "").trim();
      const rawText = unescXml(innerRaw ?? "");
      const sp = cleanVietnameseSpacing(rawText);
      let nextText = sp.text;
      if (sp.fixes > 0) {
        typographyFixed += sp.fixes;
        paraChanged = true;
      }
      // Nếu không nằm sẵn trong $...$, bọc các công thức hóa học / số mũ rõ ràng thành $...$ để bước 2 chuyển sang Equation
      if (!rawText.includes("$")) {
        const withMath = nextText.replace(PLAIN_CHEM_OR_EXP_RE, (match) => {
          paraChanged = true;
          if (match.includes("^")) return `$${match}$`;
          return `$\\ce{${match}}$`;
        });
        nextText = withMath;
      }
      if (nextText === rawText) return fullRun;
      return `<w:r>${rPr}<w:t xml:space="preserve">${esc(nextText)}</w:t></w:r>`;
    });
    if (paraChanged) touchedParas++;
    return nextPara;
  });

  const eqRes = convertOoxmlLatexToEquation(step1);
  return {
    xml: eqRes.xml,
    typographyFixed,
    mathConverted: eqRes.converted,
    paragraphs: Math.max(touchedParas, eqRes.paragraphs),
  };
}
