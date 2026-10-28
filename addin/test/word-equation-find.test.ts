import { describe, expect, it, vi, beforeEach } from "vitest";
import { findTool, DESKTOP_OFFICE_TOOLS } from "@pvta/shared";
import { rulesText } from "../../core/src/prompts.js";
import {
  convertOoxmlEquationToLatex,
  convertOoxmlLatexToEquation,
  equationToOoxml,
  inlineEquationToOoxml,
  normalizeOoxmlTypographyAndMath,
  ommlToLatex,
  ooxmlPackage,
} from "../src/office/equation.js";
import {
  convertEquationToLatexInWordXml,
  convertLatexInWordXml,
  normalizeWordXmlInPlace,
  wordTool,
} from "../src/office/word.js";
import { DOC_RULE_PRESETS } from "../src/SessionsDrawer.js";
import { toolLabel, argsPreview } from "../src/toolLabels.js";

interface MockRange {
  text: string;
  insertedOoxml: Array<{ xml: string; loc: string }>;
  insertedText: Array<{ text: string; loc: string }>;
  selectedModes: string[];
  load: (props?: string) => MockRange;
  insertOoxml: (xml: string, loc: string) => MockRange;
  insertText: (text: string, loc: string) => MockRange;
  getRange: (loc?: string) => MockRange;
  expandTo: (other: MockRange) => MockRange;
  select: (mode?: string) => void;
}

function makeRange(text: string, onReplace?: (val: string) => void): MockRange {
  const rng: MockRange = {
    text,
    insertedOoxml: [],
    insertedText: [],
    selectedModes: [],
    load: () => rng,
    insertOoxml: (xml: string, loc: string) => {
      rng.insertedOoxml.push({ xml, loc });
      onReplace?.(`[OMML:${loc}]`);
      return rng;
    },
    insertText: (t: string, loc: string) => {
      rng.insertedText.push({ text: t, loc });
      onReplace?.(t);
      return rng;
    },
    getRange: () => rng,
    expandTo: (other: MockRange) => makeRange(`${rng.text}\n${other.text}`),
    select: (mode = "Select") => {
      rng.selectedModes.push(mode);
    },
  };
  return rng;
}

describe("Word equation search/replace & remote selection tools", () => {
  let paragraphs: Array<{
    text: string;
    ranges: MockRange[];
    contentRange: MockRange;
    search: (q: string, opts?: { matchCase?: boolean }) => { items: MockRange[]; load: () => void };
    getRange: (loc?: string) => MockRange;
  }>;
  let bodySearchRanges: Record<string, MockRange[]>;
  let selectionRange: MockRange;

  beforeEach(() => {
    selectionRange = makeRange("vùng đang chọn");
    bodySearchRanges = {};
    const rawTexts = [
      "Câu 1: Cho công thức I = U / R và P = U * I trong mạch điện.",
      "Câu 2: Phương trình hóa học H2SO4 + BaCl2 -> BaSO4 + 2HCl.",
      "A. Đáp án thứ nhất cần thay",
    ];
    paragraphs = rawTexts.map((txt) => {
      const contentRange = makeRange(txt, (newVal) => {
        pObj.text = newVal;
      });
      const pObj = {
        text: txt,
        ranges: [] as MockRange[],
        contentRange,
        search: (q: string, opts?: { matchCase?: boolean }) => {
          const flags = opts?.matchCase ? "g" : "gi";
          const pat = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
          const items: MockRange[] = [];
          for (const m of pObj.text.matchAll(pat)) {
            const r = makeRange(m[0]);
            pObj.ranges.push(r);
            items.push(r);
          }
          return { items, load: () => {} };
        },
        getRange: () => contentRange,
      };
      return pObj;
    });

    (globalThis as Record<string, unknown>).Word = {
      run: async (fn: (ctx: unknown) => Promise<unknown>) => {
        const ctx = {
          sync: vi.fn(async () => {}),
          document: {
            getSelection: () => selectionRange,
            body: {
              paragraphs: {
                items: paragraphs,
                load: () => {},
              },
              search: (q: string, opts?: { matchCase?: boolean }) => {
                const items: MockRange[] = [];
                for (const p of paragraphs) {
                  items.push(...p.search(q, opts).items);
                }
                bodySearchRanges[q] = items;
                return { items, load: () => {} };
              },
              insertOoxml: (xml: string, loc: string) => selectionRange.insertOoxml(xml, loc),
            },
          },
        };
        return fn(ctx);
      },
    };
  });

  it("inlineEquationToOoxml generates inline <m:oMath> without <m:oMathPara> wrapper", () => {
    const inlineXml = inlineEquationToOoxml("I = \\frac{U}{R}");
    const displayXml = equationToOoxml("I = \\frac{U}{R}");
    expect(inlineXml).toContain("</m:oMath>");
    expect(inlineXml).not.toContain("<m:oMathPara>");
    expect(displayXml).toContain("<m:oMathPara>");
  });

  it("office_word_insert_equation supports bulk find-and-replace via items and single find", async () => {
    const res = await wordTool("office_word_insert_equation", {
      items: [
        { find: "I = U / R", latex: "I = \\frac{U}{R}" },
        { find: "H2SO4", latex: "\\ce{H2SO4}", index: 1 },
      ],
      select: true,
    });
    expect(res).toBe("đã chèn công thức (I = U / R: 1 chỗ; H2SO4: 1 chỗ)");
    const matchedFirst = bodySearchRanges["I = U / R"]?.[0];
    expect(matchedFirst?.insertedOoxml).toHaveLength(1);
    expect(matchedFirst?.insertedOoxml[0]?.xml).toContain("</m:oMath>");
    expect(matchedFirst?.insertedOoxml[0]?.xml).not.toContain("<m:oMathPara>");

    const matchedSecond = paragraphs[1]!.ranges[0];
    expect(matchedSecond?.insertedOoxml).toHaveLength(1);
    expect(matchedSecond?.selectedModes).toEqual(["Select"]);
  });

  it("office_word_insert_equation supports paragraph index targeting", async () => {
    const res = await wordTool("office_word_insert_equation", {
      latex: "E = mc^2",
      index: 0,
      where: "end",
      inline: true,
      select: true,
    });
    expect(res).toBe("đã chèn công thức");
    expect(paragraphs[0]!.contentRange.insertedOoxml).toHaveLength(1);
    expect(paragraphs[0]!.contentRange.selectedModes).toEqual(["Select"]);
  });

  it("office_word_replace_find replaces text and converts $...$ math in bulk", async () => {
    const res = await wordTool("office_word_replace_find", {
      items: [
        { find: "P = U * I", replace: "$P = U \\cdot I$" },
        { find: "A. Đáp án", replace: "A. Đáp án đúng: $x = 2$", paragraphStart: true },
      ],
    });
    expect(res).toBe("đã tìm và thay thế (P = U * I: 1 chỗ; A. Đáp án: 1 đoạn)");
    const hit = bodySearchRanges["P = U * I"]?.[0];
    expect(hit?.insertedOoxml).toHaveLength(1);
    expect(paragraphs[2]!.contentRange.insertedOoxml).toHaveLength(1);
  });

  it("office_word_select remotely selects or positions cursor by keyword or paragraph index", async () => {
    const byKeyword = await wordTool("office_word_select", {
      find: "BaCl2",
      mode: "select",
    });
    expect(byKeyword).toBe('đã bôi đen vùng chọn: "BaCl2"');
    expect(bodySearchRanges["BaCl2"]?.[0]?.selectedModes).toEqual(["Select"]);

    const byParaRange = await wordTool("office_word_select", {
      index: 0,
      toIndex: 1,
      mode: "start",
    });
    expect(String(byParaRange)).toContain("đã đặt con trỏ ở đầu:");
  });

  it("exposes updated catalog, desktop office tools, prompts, and Vietnamese tool labels", () => {
    expect(findTool("office_word_insert_equation")?.doc).toContain("items");
    expect(findTool("office_word_replace_find")).toBeDefined();
    expect(findTool("office_word_select")).toBeDefined();
    expect(DESKTOP_OFFICE_TOOLS.some((t) => t.name === "office_word_replace_find")).toBe(true);
    expect(DESKTOP_OFFICE_TOOLS.some((t) => t.name === "office_word_select")).toBe(true);
    expect(toolLabel("office_word_replace_find", "vi")).toBe("Tìm và thay thế văn bản / công thức");
    expect(toolLabel("office_word_select", "vi")).toBe("Di chuyển con trỏ / chọn vùng văn bản");

    const preview = argsPreview({
      items: [
        { find: "x^2", latex: "x^2" },
        { find: "H2O", replace: "$\\ce{H2O}$" },
      ],
    });
    expect(preview.text).toBe("x^2 → $x^2$\nH2O → $\\ce{H2O}$");

    const rules = rulesText("word", "vi");
    expect(rules).toContain("office_word_replace_find");
    expect(rules).toContain("office_word_select");
    expect(rules).toContain("Chuyển LaTeX → Equation (XML)");
  });

  it("convertOoxmlLatexToEquation & convertLatexInWordXml convert raw $...$ in OOXML in one pass and coalesce split runs", async () => {
    const sampleOoxml = ooxmlPackage(
      `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>` +
        `<w:r><w:t xml:space="preserve">Cho công thức </w:t></w:r>` +
        `<w:r><w:rPr><w:b/></w:rPr><w:t>$I = \\frac{U}</w:t></w:r>` +
        `<w:proofErr w:type="spellStart"/>` +
        `<w:r><w:rPr><w:b/></w:rPr><w:t>{R}$</w:t></w:r>` +
        `<w:r><w:t xml:space="preserve"> và phản ứng $\\ce{H2SO4}$.</w:t></w:r>` +
        `</w:p>`,
    );
    const out = convertOoxmlLatexToEquation(sampleOoxml);
    expect(out.converted).toBe(2);
    expect(out.paragraphs).toBe(1);
    expect(out.xml).toContain("</m:oMath>");
    expect(out.xml).not.toContain("$I =");
    expect(out.xml).toContain("<w:pStyle w:val=\"Normal\"/>");

    // Kiểm tra convertLatexInWordXml chạy 1 lượt đọc getOoxml + 1 lượt ghi insertOoxml
    selectionRange.text = "Cho $E = mc^2$";
    (selectionRange as unknown as { getOoxml: () => { value: string } }).getOoxml = () => ({ value: sampleOoxml });
    const res = await convertLatexInWordXml("auto");
    expect(res.converted).toBe(2);
    expect(res.paragraphs).toBe(1);
    expect(res.scope).toBe("selection");
    expect(selectionRange.insertedOoxml).toHaveLength(1);
  });

  it("convertOoxmlEquationToLatex & convertEquationToLatexInWordXml convert Word Equations back to $...$ and $$...$$", async () => {
    const ooxmlWithEq = inlineEquationToOoxml("I = \\frac{U}{R}");
    expect(ommlToLatex(ooxmlWithEq)).toContain("\\frac{U}{R}");

    const rev = convertOoxmlEquationToLatex(ooxmlWithEq);
    expect(rev.converted).toBe(1);
    expect(rev.paragraphs).toBe(1);
    expect(rev.xml).toContain("$I=\\frac{U}{R}$");
    expect(rev.xml).not.toContain("<m:oMath");

    selectionRange.text = "I = U/R";
    (selectionRange as unknown as { getOoxml: () => { value: string } }).getOoxml = () => ({ value: ooxmlWithEq });
    const liveRev = await convertEquationToLatexInWordXml("auto");
    expect(liveRev.converted).toBe(1);
    expect(liveRev.scope).toBe("selection");
  });

  it("normalizeOoxmlTypographyAndMath & normalizeWordXmlInPlace clean Vietnamese spacing/punctuation and convert plain chem/math in one XML pass", async () => {
    const messyOoxml = ooxmlPackage(
      `<w:p><w:r><w:t xml:space="preserve">Dung dịch  H2SO4 ,Ca(OH)2 và   biểu thức x^2  ( chọn đáp án đúng ) .</w:t></w:r></w:p>`,
    );
    const normRes = normalizeOoxmlTypographyAndMath(messyOoxml);
    expect(normRes.typographyFixed).toBeGreaterThanOrEqual(4);
    expect(normRes.mathConverted).toBe(3); // H2SO4, Ca(OH)2, x^2 -> <m:oMath>
    expect(normRes.paragraphs).toBe(1);
    expect(normRes.xml).toContain("</m:oMath>");
    expect(normRes.xml).toContain('<w:r><w:t xml:space="preserve">, </w:t></w:r><m:oMath');
    expect(normRes.xml).toContain("(chọn đáp án đúng).");

    selectionRange.text = "Dung dịch H2SO4";
    (selectionRange as unknown as { getOoxml: () => { value: string } }).getOoxml = () => ({ value: messyOoxml });
    const liveNorm = await normalizeWordXmlInPlace("auto");
    expect(liveNorm.typographyFixed).toBeGreaterThanOrEqual(4);
    expect(liveNorm.mathConverted).toBe(3);
  });

  it("provides one-click document rule presets for common Vietnamese pedagogical documents", () => {
    expect(DOC_RULE_PRESETS.map((p) => p.id)).toEqual(["exam2018", "khbd5512", "nd30", "skkn"]);
    expect(DOC_RULE_PRESETS[0]?.text).toContain("CTGDPT 2018");
    expect(DOC_RULE_PRESETS[1]?.text).toContain("5512");
    expect(DOC_RULE_PRESETS[2]?.text).toContain("30/2020/NĐ-CP");
  });
});
