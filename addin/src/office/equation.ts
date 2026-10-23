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
/** A single formula as a display equation. */
export const equationToOoxml = (latex: string) => textToOoxml(`$$${latex.replace(/^\s*\$+|\$+\s*$/g, "")}$$`);
