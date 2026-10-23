import { describe, expect, it } from "vitest";
import { keepTogetherOoxml, mapImages, mentionedQuestions, questionBlocks, type ParaInfo } from "../src/examimages.js";

const P = (text: string, pics = 0): ParaInfo => ({ text, pics });

describe("gán hình vào câu hỏi", () => {
  it("theo vị trí: hình nằm trong khối câu nào thì thuộc câu đó", () => {
    const paras = [P("ĐỀ KIỂM TRA"), P("", 1), P("Câu 1. Cho mạch điện như hình."), P("", 1), P("A. 2 Ω  B. 3 Ω"), P("Câu 2: Quan sát đồ thị"), P("", 1), P("")];
    const { blocks, images } = mapImages(paras);
    expect(blocks.map((b) => [b.label, b.start, b.end])).toEqual([["Câu 1", 2, 4], ["Câu 2", 5, 7]]);
    expect(images.map((i) => [i.id, i.question])).toEqual([["H1", undefined], ["H2", "Câu 1"], ["H3", "Câu 2"]]);
  });

  it("theo chú thích: câu nhắc 'hình 2' thì lấy hình có chú thích Hình 2, dù hình nằm ở chỗ khác", () => {
    const paras = [P("Câu 1. Xem hình 1."), P("", 1), P("Hình 1"), P("", 1), P("Hình 2"), P("Câu 2. Dựa vào hình 2, tính gia tốc.")];
    const { images } = mapImages(paras);
    expect(images[0]).toMatchObject({ caption: "Hình 1", question: "Câu 1", by: "caption" });
    expect(images[1]).toMatchObject({ caption: "Hình 2", question: "Câu 2", by: "caption" });
  });

  it("Bài N cũng là câu; số lấy đúng", () => {
    expect(questionBlocks([P("Bài 3 (2 điểm)"), P("x")])[0]).toMatchObject({ label: "Bài 3", num: 3 });
  });

  it("đọc câu và hình được nhắc trong yêu cầu", () => {
    expect(mentionedQuestions("Điền đáp án câu 1 và câu 3")).toEqual({ questions: [1, 3], figures: [] });
    expect(mentionedQuestions("giải câu 2, 4 dựa vào hình 2.1").questions).toEqual([2, 4]);
    expect(mentionedQuestions("giải câu 2, 4 dựa vào hình 2.1").figures).toEqual(["Hình 2.1"]);
    expect(mentionedQuestions("sửa lỗi chính tả")).toEqual({ questions: [], figures: [] });
  });
});

describe("giữ câu và hình cùng trang (OOXML)", () => {
  const pkg = (body: string) => `<pkg:package><w:document><w:body>${body}<w:sectPr><w:pgSz/></w:sectPr></w:body></w:document></pkg:package>`;
  it("mọi đoạn trừ đoạn cuối có keepNext; mọi đoạn có keepLines; giữ pStyle đứng đầu", () => {
    const xml = pkg('<w:p><w:pPr><w:pStyle w:val="A"/><w:jc w:val="both"/></w:pPr><w:r><w:t>Câu 1</w:t></w:r></w:p><w:p><w:r><w:drawing/></w:r></w:p><w:p w:rsidR="1"><w:pPr/><w:r><w:t>A.</w:t></w:r></w:p>');
    const { xml: out, paragraphs } = keepTogetherOoxml(xml);
    expect(paragraphs).toBe(3);
    const ps = out.match(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g)!;
    expect(ps[0]).toContain('<w:pPr><w:pStyle w:val="A"/><w:keepNext/><w:keepLines/><w:jc w:val="both"/></w:pPr>');
    expect(ps[1]).toContain("<w:pPr><w:keepNext/><w:keepLines/></w:pPr><w:r><w:drawing/>");
    expect(ps[2]).toContain("<w:pPr><w:keepLines/></w:pPr>");
    expect(ps[2]).not.toContain("keepNext");
    expect(out).toContain("<w:sectPr><w:pgSz/></w:sectPr>");
  });
  it("không đụng đoạn trong bảng; không lặp thẻ đã có", () => {
    const xml = pkg('<w:p><w:pPr><w:keepNext/></w:pPr></w:p><w:tbl><w:tr><w:tc><w:p><w:r/></w:p></w:tc></w:tr></w:tbl><w:p/>'.replace("<w:p/>", "<w:p></w:p>"));
    const { xml: out } = keepTogetherOoxml(xml);
    expect(out.match(/keepNext/g)).toHaveLength(1);
    expect(out).toContain("<w:tc><w:p><w:r/></w:p></w:tc>");
  });
  it("không có thân văn bản thì giữ nguyên", () => {
    expect(keepTogetherOoxml("<x/>")).toEqual({ xml: "<x/>", paragraphs: 0 });
  });
});
