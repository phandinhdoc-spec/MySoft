/** Nhận ra và tách công thức LaTeX trong văn bản (dùng chung cho hiển thị trong chat và chèn Equation vào Word). */

export type MathSeg = { kind: "text"; text: string } | { kind: "math"; latex: string; display: boolean };

const DELIMS: { re: RegExp; display: boolean }[] = [
  { re: /\$\$([\s\S]+?)\$\$/, display: true },
  { re: /\\\[([\s\S]+?)\\\]/, display: true },
  { re: /\\\(([\s\S]+?)\\\)/, display: false },
  // single-dollar inline; avoid "$5 and $10" prose by forbidding space after the opening / before the closing $
  { re: /\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/, display: false },
];

/** Whole text with no delimiters that is plainly a formula (e.g. `\frac{a}{b}`, `\ce{H2O}`, `H_2SO_4`). */
function looksLikeBareLatex(t: string): boolean {
  const s = t.trim();
  if (!s || s.includes("\n")) return false;
  if (/\\[a-zA-Z]+/.test(s)) return !/[\p{L}]{4,}\s+[\p{L}]{3,}\s+[\p{L}]{3,}/u.test(s.replace(/\\[a-zA-Z]+/g, ""));
  return /^[A-Za-z0-9()+\-=^_{}.,\s→]*$/.test(s) && /[A-Za-z)][_^]\{?[\w+-]/.test(s) && s.split(/\s+/).length <= 6;
}

export function hasMath(text: string): boolean {
  return DELIMS.some((d) => d.re.test(text)) || looksLikeBareLatex(text);
}

export function splitMath(text: string): MathSeg[] {
  const segs: MathSeg[] = [];
  let rest = text;
  while (rest) {
    let best: { idx: number; len: number; latex: string; display: boolean } | null = null;
    for (const d of DELIMS) {
      const m = d.re.exec(rest);
      if (m && (!best || m.index < best.idx)) best = { idx: m.index, len: m[0].length, latex: m[1] ?? "", display: d.display };
    }
    if (!best) break;
    if (best.idx > 0) segs.push({ kind: "text", text: rest.slice(0, best.idx) });
    segs.push({ kind: "math", latex: best.latex.trim(), display: best.display });
    rest = rest.slice(best.idx + best.len);
  }
  if (rest) segs.push({ kind: "text", text: rest });
  if (!segs.some((s) => s.kind === "math") && looksLikeBareLatex(text)) return [{ kind: "math", latex: text.trim(), display: false }];
  return segs;
}

