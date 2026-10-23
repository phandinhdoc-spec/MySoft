import { describe, expect, it } from "vitest";
import { cfFormula, cfOperator, chartType, findTitleBody, pickLayout } from "../src/office/helpers.js";

describe("biểu đồ, định dạng có điều kiện", () => {
  it("loại biểu đồ: mặc định cột, nhận tên Việt / Anh / tên gốc, báo lỗi kèm danh sách", () => {
    expect(chartType(undefined)).toBe("ColumnClustered");
    expect(chartType("tròn")).toBe("Pie");
    expect(chartType("LINE")).toBe("Line");
    expect(chartType("xyscatter")).toBe("XYScatter");
    expect(() => chartType("radar")).toThrow(/column, column_stacked/);
  });
  it("giá trị so sánh thành công thức: số, chuỗi số (dấu phẩy), công thức giữ nguyên, chữ được bọc nháy", () => {
    expect(cfFormula(5)).toBe("=5");
    expect(cfFormula("6,5")).toBe("=6.5");
    expect(cfFormula("=$B$1")).toBe("=$B$1");
    expect(cfFormula('Yếu "kém"')).toBe('="Yếu ""kém"""');
    expect(() => cfFormula("")).toThrow(/giá trị so sánh/);
  });
  it("toán tử: không phân biệt hoa thường, sai thì báo lỗi", () => {
    expect(cfOperator("lessThan")).toBe("LessThan");
    expect(cfOperator("NOTBETWEEN")).toBe("NotBetween");
    expect(() => cfOperator("lt")).toThrow(/greaterThan/);
  });
});

describe("slide", () => {
  const layouts = [
    { id: "1", name: "Title Slide" },
    { id: "2", name: "Title and Content" },
    { id: "3", name: "Trống" },
  ];
  it("chọn bố cục theo nội dung: có gạch đầu dòng -> Title and Content, không có -> Title Slide", () => {
    expect(pickLayout(layouts, undefined, true)?.id).toBe("2");
    expect(pickLayout(layouts, undefined, false)?.id).toBe("1");
  });
  it("bản tiếng Việt của Office cũng nhận ra", () => {
    const vi = [{ id: "a", name: "Trang chiếu tiêu đề" }, { id: "b", name: "Tiêu đề và Nội dung" }];
    expect(pickLayout(vi, undefined, true)?.id).toBe("b");
    expect(pickLayout(vi, undefined, false)?.id).toBe("a");
  });
  it("gọi theo tên (một phần, bỏ dấu); tên sai thì liệt kê các bố cục có", () => {
    expect(pickLayout(layouts, "trong")?.id).toBe("3");
    expect(pickLayout(layouts, "title and")?.id).toBe("2");
    expect(() => pickLayout(layouts, "Bảng")).toThrow(/Title Slide; Title and Content; Trống/);
    expect(pickLayout([], "x")).toBeUndefined();
  });
  it("tìm ô tiêu đề và nội dung: theo tên, không có tên rõ thì theo thứ tự từ trên xuống", () => {
    const byName = findTitleBody([
      { index: 0, name: "Content Placeholder 2", top: 120 },
      { index: 1, name: "Title 1", top: 20 },
    ]);
    expect(byName.title?.index).toBe(1);
    expect(byName.body?.index).toBe(0);
    const byOrder = findTitleBody([
      { index: 0, name: "Ô A", top: 300 },
      { index: 1, name: "Ô B", top: 10 },
    ]);
    expect([byOrder.title?.index, byOrder.body?.index]).toEqual([1, 0]);
    expect(findTitleBody([{ index: 0, name: "Title 1", top: 0 }]).body).toBeUndefined();
    expect(findTitleBody([]).title).toBeUndefined();
  });
});
