import type { OfficeHost } from "./protocol.js";

export interface ToolSpec {
  name: string;
  host: OfficeHost | "local";
  /** Mô tả ngắn gọn (đưa vào prompt, nên viết cô đọng để tiết kiệm token). */
  doc: string;
}

/**
 * Danh mục công cụ ĐÃ CÀI ĐẶT. Chỉ liệt kê công cụ có thật để model không gọi nhầm.
 * Quy ước tên: chứa `_get_`/`_list_` là công cụ đọc, còn lại là công cụ ghi.
 */
export const TOOL_CATALOG: ToolSpec[] = [
  // Word
  { name: "office_word_get_structure", host: "word", doc: "Đọc các đoạn kèm index, text, style, cỡ, đậm, trong bảng/danh sách và gợi ý vai trò (không sửa). args: {start?:0,count?:60} tối đa 100 đoạn/lượt; đọc tiếp next tới hết. Gợi ý chỉ là bằng chứng; AI tự nhận diện Title/Heading1–6 theo ngữ nghĩa và quan hệ cha-con." },
  { name: "office_word_apply_outline", host: "word", doc: "Gán style thật theo từng đoạn, không cần chọn tay. args: {items:[{index,expectedText,role:'title'|'subtitle'|'heading1'|'heading2'|'heading3'|'heading4'|'heading5'|'heading6'|'body'|'tableCaption'|'figureCaption'}],font?,headingFont?,bodySize?:13,headingSizes?:[18,16,14],textColor?,accent?:'#243B53'}. Tối đa 200 đoạn/lượt; expectedText phải nguyên văn từ get_structure, đọc lại nếu nguồn đổi. Không nhảy cấp; không gán heading cho ô bảng. Dùng hệ chữ riêng, giữ nguyên nội dung. tableCaption cần WordApi 1.5." },
  { name: "office_word_insert_index", host: "word", doc: "CHỈ sau khi người dùng đồng ý thêm danh mục: {kind:'toc'|'tables'|'abbreviations',afterIndex,expectedText,entries?:[{term,meaning,evidence}]}. Chèn sau đoạn neo ngoài bảng, expectedText nguyên văn. toc dùng Heading1–3; tables dùng các đoạn đã gán tableCaption; abbreviations chỉ nhận nghĩa và dẫn chứng thật trong tài liệu. Trường mục lục tự cập nhật được trong Word. Không chèn trùng; cần Word trên máy tính + WordApi1.5. Hãy đề nghị các danh mục phù hợp trước, không tự thêm chỉ vì yêu cầu làm đẹp." },
  { name: "office_word_get_selection", host: "word", doc: "Lấy văn bản đang chọn. args: {}" },
  { name: "office_word_get_body", host: "word", doc: "Lấy toàn văn (tối đa 60.000 ký tự, có ghi chú cắt). args: {}" },
  { name: "office_word_replace_selection", host: "word", doc: "Thay vùng chọn. args: {text}" },
  { name: "office_word_set_body", host: "word", doc: "Đặt lại toàn bộ nội dung. args: {text}" },
  { name: "office_word_insert_text", host: "word", doc: "Chèn văn bản. args: {text, where?: 'end'|'start'|'cursor'}" },
  { name: "office_word_insert_equation", host: "word", doc: "Chèn một công thức thành Equation chuẩn của Word. args: {latex, where?: 'cursor'|'end'|'start'|'replace'} (LaTeX toán lý, vd \\frac{a}{b}; hóa học viết \\ce{H2SO4}, \\ce{CaCO3 -> CaO + CO2 ^}). Văn bản thường chứa $…$ hoặc $$…$$ cũng tự thành công thức" },
  { name: "office_word_insert_table", host: "word", doc: "Chèn bảng. args: {values: string[][], header?: boolean}" },
  { name: "office_word_list_images", host: "word", doc: "Liệt kê hình trong văn bản: mỗi hình thuộc câu nào (Câu N/Bài N, theo vị trí hoặc chú thích 'Hình N') và mô tả nội dung hình do PVTA đã đọc (số liệu, nhãn, chữ trong hình). args: {}" },
  { name: "office_word_get_preview", host: "word", doc: "Xuất văn bản ra PDF để TỰ NHÌN trang in (tràn trang, bảng lệch, chữ dính, hình tách khỏi câu). args: {}. Tệp PDF được gửi kèm lượt sau; mở và xem nó. Dùng ở bước kiểm tra sau khi trình bày." },
  { name: "office_word_keep_together", host: "word", doc: "Giữ câu hỏi và hình của nó trên cùng một trang (Word tự đẩy cả khối sang trang sau, không để hình một trang, câu hỏi một trang). args: {questions?: number[]} (bỏ trống = mọi câu có hình). Gọi sau khi chèn/sửa đề có hình." },
  { name: "office_word_format_find", host: "word", doc: "TỰ TÌM chữ trong văn bản rồi định dạng, không cần người dùng chọn tay (vd in đậm/tô màu đáp án đúng của nhiều câu cùng lúc). args: {items: [{find, paragraphStart?: true, matchCase?, occurrence?, bold?, italic?, underline?, color?: '#rrggbb', highlight?: '#rrggbb'|'none', size?, font?}]} hoặc một mục đơn {find, ...}. paragraphStart:true = chỉ đoạn BẮT ĐẦU bằng chữ đó và định dạng cả đoạn (nên dùng cho đáp án 'A. …' để không đụng chỗ khác trùng chữ); mặc định là mọi chỗ khớp. Tối đa 80 mục/lần; kết quả báo số chỗ đã định dạng mỗi mục (0 = không thấy, hãy kiểm tra lại chữ)." },
  { name: "office_word_math_scan", host: "word", doc: "Liệt kê các đoạn có vẻ chứa công thức toán/lý/hóa viết dạng chữ thường (x^2, H2O, v = s/t, m/s2...) chưa thành Equation. args: {} → [{index, text}]. Dùng khi làm đẹp văn bản." },
  { name: "office_word_replace_paragraph", host: "word", doc: "Thay nội dung một đoạn (theo index từ office_word_math_scan) bằng văn bản mới; công thức viết $…$ / \\ce{…} được chèn thành Equation, giữ định dạng đoạn. args: {index, text}" },
  { name: "office_word_image_to_equation", host: "word", doc: "Thay một hình chỉ chứa công thức/biểu thức (id H1, H2… từ office_word_list_images) bằng Equation. args: {id, latex}. Chỉ dùng khi hình CHỈ là công thức đọc rõ; hình vẽ/đồ thị/mạch điện giữ nguyên." },
  { name: "office_word_apply_style", host: "word", doc: "Áp style cho vùng chọn. args: {style} (vd 'Heading 1')" },
  { name: "office_word_get_format", host: "word", doc: "Lấy định dạng chữ vùng chọn. args: {}" },
  { name: "office_word_apply_format", host: "word", doc: "Định dạng chữ. args: {font?, size?, bold?, italic?, underline?, color?, highlight?: '#rrggbb'|'none', scope?: 'selection'|'document'} (mặc định vùng chọn)" },
  { name: "office_word_format_paragraph", host: "word", doc: "Định dạng đoạn. args: {lineSpacing?: bội số dòng (1, 1.15, 1.5, 2), spaceBefore?, spaceAfter? (pt), alignment?: 'left'|'center'|'right'|'justify', firstLineIndent?, leftIndent? (cm), scope?: 'selection'|'document'} (mặc định các đoạn trong vùng chọn)" },
  { name: "office_word_apply_theme", host: "word", doc: "Áp chủ đề: đề mục dùng phông tiêu đề + màu chính, thân bài dùng phông nội dung (giữ chữ đen để in). args: {primary, secondary?, accent?, text?, headingFont?, bodyFont?} (màu #rrggbb; nên lấy từ office_palette) Dùng giá trị do AI thiết kế theo phương án người dùng đã chọn; không dùng mã theme Office." },
  // Excel
  { name: "office_excel_get_sheet", host: "excel", doc: "Lấy vùng đang dùng của sheet (mặc định sheet hiện tại; tối đa ~4.000 ô, vượt thì trả hàng đầu kèm truncated/totalRows/totalColumns). args: {sheet?}" },
  { name: "office_excel_list_sheets", host: "excel", doc: "Liệt kê sheet. args: {}" },
  { name: "office_excel_add_sheet", host: "excel", doc: "Thêm sheet. args: {name}" },
  { name: "office_excel_get_range", host: "excel", doc: "Đọc vùng. args: {address, sheet?}" },
  { name: "office_excel_set_range", host: "excel", doc: "Ghi giá trị. args: {address, values: any[][], sheet?}" },
  { name: "office_excel_set_formula", host: "excel", doc: "Đặt công thức. args: {address, formulas: string[][], sheet?}" },
  { name: "office_excel_create_table", host: "excel", doc: "Tạo bảng từ vùng. args: {address, name?, hasHeaders?: boolean}" },
  { name: "office_excel_set_format", host: "excel", doc: "Định dạng vùng. args: {address, sheet?, bold?, italic?, fontSize?, fontName?, fontColor?, fill?, numberFormat?, align?: 'left'|'center'|'right', wrap?: boolean, border?: boolean, autofit?: boolean}" },
  { name: "office_excel_sort", host: "excel", doc: "Sắp xếp vùng. args: {address, column: number (0-based), ascending?: boolean, hasHeaders?: boolean}" },
  { name: "office_excel_get_format", host: "excel", doc: "Đọc định dạng ô (phông, số, nền, căn lề, độ rộng cột). args: {address?, sheet?} (mặc định vùng đang chọn)" },
  { name: "office_excel_list_tables", host: "excel", doc: "Liệt kê bảng (tên, sheet, vùng, cột, số hàng). args: {}" },
  { name: "office_excel_add_table_column", host: "excel", doc: "Thêm cột vào bảng. args: {table, name, formula?} (formula cho mọi hàng, vd '=[@Toán]+[@Lý]')" },
  { name: "office_excel_insert_chart", host: "excel", doc: "Chèn biểu đồ từ vùng dữ liệu (hàng đầu là tiêu đề). args: {address, type?: 'column'|'column_stacked'|'bar'|'line'|'line_markers'|'pie'|'doughnut'|'area'|'scatter', title?, at?: ô góc trên trái, to?: ô góc dưới phải, seriesBy?: 'rows'|'columns', sheet?} (không nói 'at' thì đặt bên phải dữ liệu)" },
  { name: "office_excel_conditional_format", host: "excel", doc: "Tô màu theo điều kiện. args: {address, rule?: 'cellValue'|'colorScale'|'duplicates'|'unique', operator?: 'greaterThan'|'lessThan'|'greaterThanOrEqual'|'lessThanOrEqual'|'equalTo'|'notEqualTo'|'between'|'notBetween', value?, value2?, fill?, fontColor?, clear?: boolean, sheet?} (vd điểm dưới 5 tô đỏ: operator 'lessThan', value 5; colorScale cho thang màu)" },
  { name: "office_excel_filter", host: "excel", doc: "Lọc theo giá trị. args: {address, column: number (0-based), values: string[], sheet?}; bỏ lọc: {clear: true, sheet?}" },
  { name: "office_excel_get_preview", host: "excel", doc: "Chụp ảnh vùng dữ liệu của sheet để TỰ NHÌN (khung, căn lề, chữ bị cắt, cột hẹp). args: {sheet?, range?: 'A1:H40' (mặc định vùng đã dùng, tối đa 60 hàng × 20 cột)}. Ảnh PNG gửi kèm lượt sau; mở và xem nó." },
  { name: "office_excel_inspect_layout", host: "excel", doc: "Chỉ ĐỌC cấu trúc sheet để làm đẹp khỏi phá: khối tiêu đề, đầu bảng (một hoặc nhiều tầng), dữ liệu, dòng tổng, loại từng cột, danh sách ô GỘP, căn lề và phông hiện có của từng vùng, cố định hàng. args: {sheet?}. Gọi trước khi định dạng cả sheet; không thay đổi gì." },
  { name: "office_excel_apply_theme", host: "excel", doc: "Áp chủ đề cho sheet hiện tại: hàng tiêu đề tô màu chính, chữ tương phản; toàn vùng dùng phông nội dung. args: {primary, secondary?, accent?, text?, headingFont?, bodyFont?} (màu #rrggbb; nên lấy từ office_palette) Dùng giá trị do AI thiết kế theo phương án người dùng đã chọn; không dùng mã theme Office." },
  // PowerPoint
  { name: "office_ppt_get_slides", host: "powerpoint", doc: "Lấy danh sách slide và các hình: tên, loại, vị trí và kích thước (left, top, width, height, đơn vị point), chữ (mỗi hộp tối đa 1.500 ký tự). args: {}" },
  { name: "office_ppt_get_preview", host: "powerpoint", doc: "Chụp ảnh các slide để TỰ NHÌN (tràn chữ, lệch, chữ nhỏ, chồng hình). args: {slides?: number[] (0-based; mặc định tối đa 12 slide đầu)}. Ảnh PNG gửi kèm lượt sau; mở và xem từng ảnh." },
  { name: "office_ppt_add_slide", host: "powerpoint", doc: "Thêm slide trống. args: {layout?: tên bố cục}" },
  { name: "office_ppt_get_theme", host: "powerpoint", doc: "Xem bố cục có sẵn và phông, cỡ, màu của các hộp trên một slide. args: {slide?: number (0-based, mặc định 0)}" },
  { name: "office_ppt_generate_slide", host: "powerpoint", doc: "Tạo một slide hoàn chỉnh theo bố cục của mẫu (tiêu đề, nội dung). args: {title?, bullets?: string[], subtitle?, layout?: tên bố cục, vd 'Title and Content'} (xem tên bố cục ở office_ppt_get_theme)" },
  { name: "office_ppt_format_shape", host: "powerpoint", doc: "Định dạng và đặt vị trí một hình. args: {slide: number (0-based), shape: số thứ tự 'index' hoặc tên (lấy từ office_ppt_get_slides), size?, bold?, italic?, color?, font?, fill?, left?, top?, width?, height?}" },
  { name: "office_ppt_format_text", host: "powerpoint", doc: "Định dạng chữ. args: {scope?: 'selection'|'slide'|'all' (mặc định selection), slide?: number (0-based, khi scope='slide'), bold?, italic?, underline?, size?, color?, font?, align?: 'left'|'center'|'right'|'justify'}" },
  { name: "office_ppt_insert_textbox", host: "powerpoint", doc: "Chèn hộp văn bản. args: {slide: number (0-based), text, left?, top?, width?, height?, size?, bold?, color?}" },
  { name: "office_ppt_apply_theme", host: "powerpoint", doc: "Áp chủ đề cho mọi slide: tiêu đề dùng phông tiêu đề + màu chính, chữ khác dùng phông nội dung + màu chữ. args: {primary, secondary?, accent?, text?, headingFont?, bodyFont?} (màu #rrggbb; nên lấy từ office_palette) Dùng giá trị do AI thiết kế theo phương án người dùng đã chọn; không dùng mã theme Office." },
  // Cục bộ
  { name: "office_offer_apply", host: "local", doc: "KHÔNG phải thao tác: dùng ở cuối câu trả lời cho một CÂU HỎI để đề nghị áp dụng thay đổi vào tài liệu; giáo viên bấm Có/Không. args: {summary: '<việc sẽ làm, tối đa 15 từ>'}" },
  { name: "office_skill_read", host: "local", doc: "Đọc chi tiết một skill. args: {name}" },
  { name: "office_style_get", host: "local", doc: "Lấy hồ sơ phong cách của người dùng. args: {}" },
  { name: "office_style_save", host: "local", doc: "Lưu hồ sơ phong cách. args: {markdown}" },
  { name: "office_palette", host: "local", doc: "Tạo bảng màu. args: {base?: '#rrggbb', mood?: 'calm'|'energetic'|'nature'|'serious'|'warm', dark?: boolean}" },
  { name: "office_font_pairs", host: "local", doc: "Gợi ý cặp font. args: {}" },
  { name: "office_docs_list", host: "local", doc: "Liệt kê các tệp Office đang mở CÓ bật PVTA (mỗi cửa sổ một phiên): id, ứng dụng, tên tệp, current=tệp này. args: {} hoặc {id} để xem danh sách công cụ của tệp đó (khác ứng dụng). Để thao tác trên tệp khác, thêm \"target\": \"<id>\" vào args của công cụ (đúng công cụ của ứng dụng tệp đó); PVTA luôn hỏi người dùng trước." },
  { name: "office_docs_open", host: "local", doc: "Nhờ máy mở một tệp Word/Excel/PowerPoint CHƯA mở (cần người dùng đồng ý). args: {path: đường dẫn đầy đủ}. Cửa sổ mới chỉ thao tác được sau khi người dùng bật PVTA trong cửa sổ đó (Chèn → PVTA); khi ấy gọi lại office_docs_list." },
  { name: "office_file_read", host: "local", doc: "Đọc tệp thầy cô đã đính kèm (của hội thoại hoặc của dự án; xem mục TỆP ĐÍNH KÈM). args: {name, start?: ký tự bắt đầu (mặc định 0), length?: số ký tự (mặc định 8000, tối đa 20000)}. Kết quả có total và next: tệp dài thì đọc tiếp từ next." },
  { name: "notebook_source_read", host: "local", doc: "Đọc trọn một tệp trong SỔ NGUỒN đã liên kết (xem mục DANH MỤC TỆP CỦA SỔ NGUỒN). args: {notebook?: tên hoặc mã sổ, source: tên hoặc mã tệp, start?: ký tự bắt đầu (mặc định 0), length?: số ký tự (mặc định 8000, tối đa 20000)}. Có next thì đọc tiếp từ next." },
  { name: "office_pdf_pages", host: "local", doc: "Đọc PDF đã đính kèm THEO TRANG. args: {name: tên tệp PDF, from: trang đầu (từ 1), to?: trang cuối (mặc định = from; tối đa 15 trang mỗi lần)} hoặc {name, query: từ khóa} để liệt kê các trang có từ khóa. Kết quả có pages (tổng số trang đọc được). PDF scan dạng ảnh cần OCR mới có chữ." },
  { name: "office_rag_search", host: "local", doc: "Tìm trong CHÍNH tài liệu đang mở (PVTA đã lập chỉ mục sẵn, nhanh hơn đọc cả tài liệu). args: {query: từ khóa hoặc câu hỏi ngắn, k?: số đoạn (mặc định 8)} → các đoạn khớp nhất kèm ref (nhãn vị trí để trích nguồn) và id. Hoặc {around: id, before?, after?} để đọc các đoạn kề một đoạn đã tìm thấy. Dùng khi mục TÀI LIỆU ĐANG MỞ chưa đủ ý; trả lời dựa vào tài liệu thì ghi nguồn [ref]." },
  { name: "office_file_search", host: "local", doc: "Tìm trong các tệp đính kèm. args: {query: từ khóa, name?: chỉ tìm trong một tệp}. Trả về các dòng khớp kèm vị trí start để đọc tiếp bằng office_file_read." },
  { name: "office_calc", host: "local", doc: "Tính CHÍNH XÁC (số thập phân/phân số, không sai số nổi). args: {expr: '1234.5*12%+sum(1,2,3)', round?: số chữ số thập phân (0 = nguyên đồng), mode?: 'half_up'|'half_even'|'down'|'up'} hoặc {exprs: [..]}. Số thập phân viết bằng dấu CHẤM, không dấu phân cách hàng nghìn (có thể dùng _). Toán tử + - * / ^ (mũ nguyên) % (phần trăm: 15% = 0,15), hàm round sum avg min max abs floor ceil count; thống kê median, var_p/var_s, stdev_p/stdev_s (như VAR.P/VAR.S, STDEV.P/STDEV.S của Excel), sqrt; wavg(điểm1, hệ số1, điểm2, hệ số2, …) cho điểm trung bình có hệ số; percent(phần, tổng); rank(x, các giá trị…) xếp hạng từ cao xuống; count_ge/count_gt/count_le/count_lt/count_eq(ngưỡng, các giá trị…) đếm số giá trị ≥ > ≤ < = ngưỡng (vd số học sinh đạt từ 5 trở lên). Mọi con số cần chính xác (tổng, thuế, phần trăm, điểm trung bình, tỉ lệ) PHẢI tính bằng công cụ này, không nhẩm." },
  { name: "office_calc_check", host: "local", doc: "Đối chiếu số trong tài liệu với giá trị tính lại. args: {items: [{label?, expr, expected}], round?: số chữ số thập phân của số trong tài liệu, mode?}. Trả về số mục đã kiểm, số mục lệch và từng chỗ lệch (computed, expected, diff). Dùng sau khi đọc ô/bảng/văn bản để kiểm tổng, phần trăm, chênh lệch." },
];

const BY_NAME = new Map(TOOL_CATALOG.map((t) => [t.name, t]));

/** Tìm công cụ trong danh mục (undefined = model gọi công cụ không có thật). */
export function findTool(name: string): ToolSpec | undefined {
  return BY_NAME.get(name);
}

export function toolsForHost(host: OfficeHost): ToolSpec[] {
  return TOOL_CATALOG.filter((t) => t.host === host || t.host === "local");
}

export function toolCatalogText(host: OfficeHost): string {
  return toolsForHost(host)
    .map((t) => `- ${t.name}: ${t.doc}`)
    .join("\n");
}

/** Desktop currently transports structured data; image/PDF preview hydration lives in the full add-in bridge. */
export const DESKTOP_OFFICE_TOOLS = TOOL_CATALOG.filter(t=>t.host!=='local'&&!t.name.endsWith('_get_preview')&&t.name!=='office_word_image_to_equation').map(t=>t.name==='office_word_list_images'?{...t,doc:'Liệt kê hình: id, câu hỏi, chú thích và kích thước. Đây là metadata, không phải nội dung thị giác của hình. args: {}'}:t);
export function isDesktopOfficeReadTool(tool:string){
 return DESKTOP_OFFICE_TOOLS.some(t=>t.name===tool)&&(tool.includes('_get_')||tool.includes('_list_')||tool==='office_word_math_scan'||tool==='office_excel_inspect_layout');
}
