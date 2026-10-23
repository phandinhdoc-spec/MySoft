import { describe, expect, it } from "vitest";
import { BUILTIN_PROMPTS, checkAiPrompt, normalizePromptTemplate, shortValue, templateSlots, trackTemplate } from "../src/index";

const TPL = 'Soạn đề [số câu] câu cho bài "[tên bài]" lớp [lớp].';

describe("chỗ trống của lời nhắc mẫu", () => {
  it("liệt kê chỗ trống theo thứ tự", () => {
    expect(templateSlots(TPL).map((s) => s.label)).toEqual(["số câu", "tên bài", "lớp"]);
    expect(templateSlots("Không có chỗ trống [1] [ ]")).toEqual([]);
  });

  it("mới chèn thì mọi chỗ đều chưa điền", () => {
    const st = trackTemplate(TPL, TPL);
    expect(st.map((s) => s.status)).toEqual(["pending", "pending", "pending"]);
    expect(TPL.slice(st[1]!.start, st[1]!.end)).toBe("[tên bài]");
  });

  it("nhận ra chỗ đã điền và lấy đúng nội dung mới", () => {
    const cur = 'Soạn đề 10 câu cho bài "Phân số" lớp [lớp].';
    const st = trackTemplate(TPL, cur);
    expect(st.map((s) => s.status)).toEqual(["filled", "filled", "pending"]);
    expect(st[0]!.value).toBe("10");
    expect(st[1]!.value).toBe("Phân số");
    expect(cur.slice(st[1]!.start, st[1]!.end)).toBe("Phân số");
    expect(cur.slice(st[2]!.start, st[2]!.end)).toBe("[lớp]");
  });

  it("vẫn đúng khi lời nhắc nằm giữa chữ khác", () => {
    const cur = 'Xin chào. Soạn đề 5 câu cho bài "[tên bài]" lớp 6A. Cảm ơn.';
    const st = trackTemplate(TPL, 'Xin chào. ' + TPL);
    expect(st.every((s) => s.status === "pending")).toBe(true);
    const st2 = trackTemplate(TPL.replace(/\.$/, ""), cur.replace(". Cảm ơn.", ""));
    expect(st2[0]!.value).toBe("5");
    expect(st2[2]!.value).toBe("6A");
  });

  it("chỗ trống cuối mẫu lấy đến hết văn bản", () => {
    const t = "Viết thư gửi phụ huynh về [nội dung]";
    expect(trackTemplate(t, "Viết thư gửi phụ huynh về họp cuối kì")[0]).toMatchObject({ status: "filled", value: "họp cuối kì" });
    expect(trackTemplate(t, "Viết thư gửi phụ huynh về ")[0]!.status).toBe("empty");
  });

  it("người dùng sửa cả đoạn chữ cố định thì chỉ dựa vào [nhãn] còn hay mất", () => {
    const st = trackTemplate(TPL, "Làm đề 10 câu, lớp [lớp]");
    expect(st.map((s) => s.status)).toEqual(["unknown", "unknown", "pending"]);
  });

  it("rút gọn giá trị dài", () => {
    expect(shortValue("a".repeat(60), 10)).toBe("aaaaaaaaa…");
    expect(shortValue("  hai   chữ ")).toBe("hai chữ");
  });
});

describe("chuẩn hóa lời nhắc mẫu", () => {
  it("đổi ký hiệu chỗ trống khác về [mô tả]", () => {
    const r = normalizePromptTemplate("Soạn bài {tên bài} lớp {{lớp}} và <số tiết> tiết.");
    expect(r.text).toBe("Soạn bài [tên bài] lớp [lớp] và [số tiết] tiết.");
    expect(r.slots).toEqual(["tên bài", "lớp", "số tiết"]);
    expect(r.fixes.length).toBeGreaterThan(0);
  });

  it("không đụng tới JSON hay thẻ HTML", () => {
    expect(normalizePromptTemplate('Trả về {"a": 1} cho [lớp].').text).toBe('Trả về {"a": 1} cho [lớp].');
    expect(normalizePromptTemplate("Dùng <b>đậm</b> cho [lớp].").text).toBe("Dùng <b>đậm</b> cho [lớp].");
  });

  it("đặt nhãn cho chỗ trống chưa có tên", () => {
    const r = normalizePromptTemplate("Soạn đề lớp ___ môn [môn] thời gian ... phút");
    expect(r.text).toContain("lớp [lớp]");
    expect(r.fixes.join(" ")).toMatch(/chưa có tên/);
  });

  it("dọn nhãn và khoảng trắng", () => {
    const r = normalizePromptTemplate("  Viết   về [  chủ đề . ]  \n\n\n\nXong.  ");
    expect(r.text).toBe("Viết về [chủ đề]\n\nXong.");
  });

  it("báo lỗi và cảnh báo cần người viết xem", () => {
    const long = normalizePromptTemplate("x".repeat(20001));
    expect(long.issues.some((i) => i.level === "error" && i.code === "length")).toBe(true);
    const many = normalizePromptTemplate(Array.from({ length: 13 }, (_, i) => `[mục ${i + 1}]`).join(" ") + ".");
    expect(many.issues.some((i) => i.code === "too-many")).toBe(true);
    const lab = normalizePromptTemplate("Viết [một đoạn văn rất dài mô tả đầy đủ mọi yêu cầu của thầy cô cho học sinh].");
    expect(lab.issues.some((i) => i.code === "long-label")).toBe(true);
    expect(normalizePromptTemplate("Còn [ngoặc mở").issues.some((i) => i.code === "bracket")).toBe(true);
  });

  it("chuẩn hóa hai lần cho cùng kết quả", () => {
    const once = normalizePromptTemplate("Soạn {đề}  lớp ___ .");
    expect(normalizePromptTemplate(once.text).text).toBe(once.text);
  });

  it("mọi mẫu dựng sẵn đã đúng chuẩn: không lỗi, không cần sửa", () => {
    for (const p of BUILTIN_PROMPTS) {
      const r = normalizePromptTemplate(p.text);
      expect(r.issues.filter((i) => i.level !== "info"), p.id).toEqual([]);
      expect(r.text, p.id).toBe(p.text.trim());
    }
  });
});

describe("kiểm kết quả AI viết lại mẫu", () => {
  it("nhận bản giữ đủ chỗ trống", () => {
    expect(checkAiPrompt("Soạn đề lớp [lớp]", "Hãy soạn đề kiểm tra cho lớp [lớp] theo GDPT 2018.")).toBeNull();
  });
  it("từ chối bản làm mất chỗ trống hoặc thêm đường dẫn", () => {
    expect(checkAiPrompt("Soạn đề lớp [lớp] môn [môn]", "Soạn đề lớp [lớp]")).toMatch(/môn/);
    expect(checkAiPrompt("Soạn đề", "Xem https://x.vn")).toMatch(/đường dẫn/);
    expect(checkAiPrompt("a", "  ")).toMatch(/trống/);
  });
});

describe('placeholder editing edge cases',()=>{
 it('tracks duplicate labels independently and retains exact selection ranges',()=>{
  const current='So sánh 6A với [lớp].';
  const slots=trackTemplate('So sánh [lớp] với [lớp].',current);
  expect(slots.map(s=>s.status)).toEqual(['filled','pending']);
  expect(current.slice(slots[1]!.start,slots[1]!.end)).toBe('[lớp]');
 });
 it('does not report empty or partially edited brackets as filled',()=>{
  expect(trackTemplate('Lớp [lớp].','Lớp .')[0]!.status).toBe('empty');
  expect(trackTemplate('Lớp [lớp].','Lớp [6A.')[0]!.status).toBe('pending');
  expect(trackTemplate('Lớp [ lớp ].','Lớp [ lớp ].')[0]!.status).toBe('pending');
 });
 it('does not reuse an earlier duplicate token after an anchor is edited',()=>{
  const slots=trackTemplate('A [lớp] B [lớp] C','A [lớp] B 6A sửa đoạn cuối');
  expect(slots.map(s=>s.status)).toEqual(['pending','unknown']);
  expect(slots[1]!.start).toBe(-1);
 });
 it('rejects AI output that removes one occurrence of a repeated placeholder',()=>{
  expect(checkAiPrompt('So sánh [lớp] với [lớp].','Soạn cho [lớp].')).toMatch(/mất chỗ trống/);
 });
 it('preserves LaTeX braces',()=>{
  const text=String.raw`Giải $\frac{a}{b}$ cho lớp [lớp].`;
  expect(normalizePromptTemplate(text).text).toBe(text);
 });
});

it('không báo ô cuối đã điền khi không tách được hai placeholder liền nhau',()=>{
 expect(trackTemplate('[họ][tên]','Nguyễn An').map(s=>s.status)).toEqual(['unknown','unknown']);
 expect(trackTemplate('[họ][tên]','Nguyễn [tên]').map(s=>s.status)).toEqual(['unknown','pending']);
});
