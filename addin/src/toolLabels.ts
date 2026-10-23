/** Tên dễ hiểu của từng công cụ, hiện trong dòng tiến trình và hộp xác nhận. */
const VI: Record<string, string> = {
  office_word_get_selection: "Đọc phần đang chọn",
  office_word_get_body: "Đọc toàn văn bản",
  office_word_replace_selection: "Thay phần đang chọn",
  office_word_set_body: "Thay toàn bộ văn bản",
  office_word_insert_text: "Chèn văn bản",
  office_word_insert_table: "Chèn bảng",
  office_word_get_structure: "Đọc cấu trúc và nhận diện đề mục",
  office_word_apply_outline: "Phân cấp tiêu đề và Heading",
  office_word_insert_index: "Tạo mục lục / danh mục",
  office_word_apply_style: "Áp kiểu đề mục",
  office_word_insert_equation: "Chèn công thức",
  office_word_get_format: "Đọc định dạng chữ",
  office_word_apply_format: "Định dạng chữ",
  office_word_format_paragraph: "Định dạng đoạn",
  office_word_apply_theme: "Áp chủ đề",
  office_excel_apply_theme: "Áp chủ đề",
  office_ppt_apply_theme: "Áp chủ đề",
  office_ppt_format_text: "Định dạng chữ",
  office_theme_presets: "Xem mẫu chủ đề",
  office_excel_get_sheet: "Đọc trang tính",
  office_excel_list_sheets: "Xem danh sách trang tính",
  office_excel_add_sheet: "Thêm trang tính",
  office_excel_get_range: "Đọc vùng ô",
  office_excel_set_range: "Ghi dữ liệu vào ô",
  office_excel_set_formula: "Đặt công thức",
  office_excel_create_table: "Tạo bảng",
  office_excel_set_format: "Định dạng ô",
  office_excel_sort: "Sắp xếp",
  office_excel_get_format: "Đọc định dạng ô",
  office_excel_list_tables: "Xem các bảng",
  office_excel_add_table_column: "Thêm cột vào bảng",
  office_excel_insert_chart: "Chèn biểu đồ",
  office_excel_conditional_format: "Tô màu theo điều kiện",
  office_excel_filter: "Lọc dữ liệu",
  office_ppt_get_slides: "Đọc các slide",
  office_ppt_get_preview: "Chụp ảnh slide để soát",
  office_word_get_preview: "Xuất bản xem trước để soát",
  office_excel_get_preview: "Chụp ảnh bảng tính để soát",
  office_ppt_add_slide: "Thêm slide",
  office_ppt_insert_textbox: "Chèn hộp chữ",
  office_ppt_get_theme: "Xem bố cục và phông của slide",
  office_ppt_generate_slide: "Tạo slide",
  office_ppt_format_shape: "Định dạng hình",
  office_skill_read: "Đọc hướng dẫn",
  office_style_get: "Xem phong cách của thầy cô",
  office_style_save: "Lưu phong cách",
  office_palette: "Tạo bảng màu",
  office_font_pairs: "Gợi ý phông chữ",
  office_file_read: "Đọc tệp đính kèm",
  office_file_search: "Tìm trong tệp đính kèm",
  office_docs_list: "Xem các tệp đang mở",
  office_docs_open: "Mở tệp",
  office_calc: "Tính chính xác",
  office_calc_check: "Đối chiếu số liệu",
};

export function toolLabel(tool: string, lang: "vi" | "en"): string {
  if (lang === "vi" && VI[tool]) return VI[tool]!;
  const s = tool.replace(/^office_(word|excel|ppt)_/, "").replace(/^office_/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Đoạn xem trước nội dung sắp ghi vào văn bản (cho hộp xác nhận). */
export function argsPreview(args: Record<string, unknown>): { text?: string; rest: Record<string, unknown> } {
  const { text, ...rest } = args;
  if (typeof text === "string") return { text, rest };
  if (Array.isArray(args.values)) {
    const rows = (args.values as unknown[][]).slice(0, 12).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")).join(" | ") : String(r)));
    const { values: _v, ...others } = args;
    return { text: rows.join("\n") + ((args.values as unknown[]).length > 12 ? "\n…" : ""), rest: others };
  }
  return { rest: args };
}
