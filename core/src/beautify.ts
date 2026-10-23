import type { OfficeHost } from "@pvta/shared";

/**
 * Làm đẹp: không còn mẫu hay quy chuẩn dựng sẵn. PVTA chỉ dựng MỘT lời nhắc chuyên nghiệp rồi để model
 * (Gemini, Sonnet…) tự khảo sát tệp, tự nhận loại tài liệu và tự quyết định cách trình bày bằng công cụ sẵn có.
 */

export interface DocKind {
  id: string;
  label: string;
}

/** Nhãn dùng cho việc học (không phân loại tài liệu). */
export function beautifyKind(host: OfficeHost): DocKind {
  return host === "excel" ? { id: "sheet", label: "bảng tính" } : host === "powerpoint" ? { id: "slides", label: "bài trình chiếu" } : { id: "document", label: "văn bản" };
}

export interface BeautifyPromptInput {
  host: OfficeHost;
  /** Tên tệp (đã rút gọn) và vài dòng đầu, chỉ để model biết khởi điểm; model vẫn phải tự đọc tệp. */
  fileName?: string;
  head?: string;
  hasImages?: boolean;
  /** Phương án AI đã được người dùng chọn. */
  design?: string;
}

const COMMON = `Bạn là chuyên gia trình bày tài liệu cho giáo viên THCS Việt Nam. Nhiệm vụ: LÀM ĐẸP tệp đang mở, sửa trực tiếp trên tệp, để thầy cô nhìn là dùng được ngay.

NGUYÊN TẮC BẤT BIẾN
- Không đổi nội dung: chữ, số liệu, công thức, đáp án, thứ tự, số lượng câu/hàng/cột. Không xóa, không thêm chữ ngoài những gì thể thức bắt buộc.
- Giữ cấu trúc thầy cô đã dựng (bảng, ô gộp, đánh số, danh sách, hình, biểu đồ). Việc nào không chắc thì bỏ qua và nói rõ ở cuối.
- Không mặc định chọn chủ đề có sẵn của Office. Rút quy tắc bố cục từ mẫu người dùng cung cấp; dùng hệ chữ, khoảng cách, màu và đường kẻ riêng theo vai trò nội dung. Công cụ Office này chỉ chỉnh trực tiếp; yêu cầu PDF + mã nguồn .typ cần chuyển sang luồng Typst của desktop.
- Tính nhất quán quan trọng hơn trang trí: một hệ phông, cỡ chữ, đề mục, khoảng cách và khung dùng xuyên suốt; ít màu, nhã, dễ in đen trắng. Phông chỉ chọn loại đi kèm sẵn Office trên Windows và Mac.
- Theo thể thức hiện hành nếu tài liệu thuộc loại có quy định (văn bản hành chính, kế hoạch bài dạy, đề kiểm tra…); loại nào có thông lệ thì theo thông lệ của loại đó. Quy tắc và phong cách thầy cô đã dạy PVTA (kỹ năng, quy tắc học được) được ưu tiên hơn ý riêng của bạn.

CÁCH LÀM
1. Khảo sát trước khi sửa: đọc tệp, nhận ra đây là loại tài liệu gì và vai trò từng phần (đầu đề, tiêu đề, mục, nội dung, bảng, chữ ký…).
2. Chốt trong đầu một hệ trình bày gọn cho đúng loại tài liệu đó (phông, cỡ, đề mục, căn lề, giãn dòng/độ rộng, khung).
3. Thực hiện bằng các công cụ sẵn có, gộp nhiều thao tác độc lập vào một lượt. Ưu tiên kiểu (style) và định dạng theo vai trò thay vì chỉnh từng ô/đoạn lẻ; KHÔNG áp một định dạng đồng loạt lên cả tệp (dễ làm cả tài liệu bị đậm, dẹt hay mất cấu trúc).
4. Kiểm tra hai lớp. (a) Đọc lại bằng công cụ đọc: nội dung không đổi, không phần nào bị mất hay lệch. (b) NHÌN kết quả bằng công cụ xem trước của phần mềm này (tên công cụ ở mục RIÊNG bên dưới): ảnh/PDF được gửi kèm lượt sau, hãy mở ra xem như người đọc thật. Tìm lỗi chỉ thấy bằng mắt: tràn trang/tràn khung, chữ bị cắt, lệch lề, khoảng trống bất thường, chữ quá nhỏ, màu khó đọc, bảng vỡ, hình tách khỏi câu. Thấy lỗi thì sửa rồi xem lại MỘT lần nữa (tối đa 2 lần xem). Công cụ xem trước báo không dùng được thì bỏ qua lớp (b) và nói rõ ở cuối.
5. Báo ngắn gọn (3–5 dòng) đã đổi gì và việc nào bỏ qua. Nhắc thầy cô xem lại: chưa ưng thì bấm Hoàn tác; ưng thì chỉnh thêm rồi bấm Lưu để PVTA học từ chỗ thầy cô sửa.`;

const WORD = `
RIÊNG CHO WORD
- Bắt đầu bằng office_word_get_structure, đọc các trang next đến hết để biết từng đoạn, định dạng, vị trí, bảng/danh sách. Kèm office_word_get_body để đọc toàn văn; kiểm tra lại bằng các công cụ đó.
- NHẬN DIỆN NGỮ NGHĨA: người dùng thường chưa gán style. Tự phân biệt tên cơ quan, tiêu đề tài liệu (Title), phụ đề, Heading 1, Heading 2, Heading 3… và thân bài. Dựa trên nội dung và quan hệ cha-con, không chỉ dựa vào chữ hoa/in đậm/đánh số. Không nhầm Câu 1, đáp án A/B/C/D, danh sách, tiêu đề cột bảng với heading. Gợi ý từ công cụ chưa phải kết luận. Chỗ không chắc thì nêu câu hỏi ngắn hoặc giữ nguyên, không ép vào cấp sai.
- Tạo sơ đồ đề mục nhất quán: Heading 1 là phần lớn, Heading 2 thuộc Heading 1 gần nhất, Heading 3 thuộc Heading 2. Không nhảy cấp, không tự thêm số vào tên đề mục, không đổi chữ. Dùng office_word_apply_outline theo index + expectedText để gán style THẬT, không chỉ phóng to/in đậm. Chọn font, bodySize và accent riêng; cùng cấp cùng cách trình bày. Đọc lại ngay sau mọi thay đổi nội dung/chèn đoạn trước khi dùng index. Nếu chia nhiều đợt, xử lý từ trên xuống để cấp cha được gán trước.
- MỤC LỤC VÀ DANH MỤC LÀ TÙY CHỌN: sau khi khảo sát, đề xuất từng mục có lý do cụ thể: mục lục khi văn bản dài/có nhiều phần; danh mục bảng khi có nhiều bảng và chú thích; danh mục hình khi có hình; danh sách từ viết tắt khi xuất hiện nhiều thuật ngữ viết tắt. Hỏi người dùng muốn thêm mục nào; làm đẹp không mặc nhiên cho phép chèn các phần này. Không thêm mục lục cho mọi văn bản ngắn.
- Khi người dùng đồng ý, office_word_insert_index tạo mục lục dựa trên Heading1–3; danh mục bảng dựa trên các chú thích đã gán tableCaption (không lấy chú thích hình); danh sách từ viết tắt cần term, meaning, evidence nguyên văn. Nghĩa không có trong nguồn thì hỏi lại, không đoán. Không bịa chú thích bảng. Chọn vị trí sau tiêu đề/phần đầu theo tài liệu và đề xuất. Công cụ hiện chưa tạo danh mục hình tự động: nêu giới hạn nếu được hỏi. Danh mục có sẵn thì đề nghị cập nhật, không chèn trùng. Báo rõ nếu Word yêu cầu cập nhật trường thủ công.
- Sau khi gán style, gọi lại get_structure để kiểm tra phân cấp, sau đó xem PDF để soát bố cục. Không áp theme Office để thay cho phân tích cấu trúc. Chỉnh theo vùng chọn bằng office_word_get_selection, office_word_apply_format, office_word_format_paragraph.
- Toán – Lý – Hóa: gọi office_word_math_scan; với mỗi đoạn có công thức viết dạng chữ, gọi office_word_replace_paragraph với phần công thức viết lại bằng LaTeX trong $…$ (hóa học $\\ce{…}$, đơn vị $\\text{…}$) và giữ nguyên mọi chữ khác. Mọi công thức phải là Equation của Word. Làm bước này trước các chỉnh định dạng lớn vì công cụ thay đoạn giữ định dạng đoạn.
- Đề có câu hỏi và hình: gọi office_word_keep_together để câu và hình của nó nằm cùng trang, TRƯỚC bước xem trước.
- Xem trước bằng office_word_get_preview (PDF của cả văn bản): soát ngắt trang, bảng tràn lề, tiêu đề mồ côi cuối trang, khoảng trống lớn.`;

const WORD_IMAGES = `
- HÌNH: xem mục <hinh_anh>. Hình CHỈ chứa công thức/biểu thức đọc rõ thì gọi office_word_image_to_equation {id, latex} để thay bằng Equation; hình vẽ, đồ thị, mạch điện, bảng số liệu thì giữ nguyên.`;

const WORD_NO_IMAGES = `
- HÌNH: nếu văn bản có hình chứa công thức, gọi office_word_list_images rồi office_word_image_to_equation; hình vẽ giữ nguyên.`;

const EXCEL = `
RIÊNG CHO EXCEL
- Bắt đầu bằng office_excel_inspect_layout (chỉ đọc): cho biết khối tiêu đề, đầu bảng một hoặc nhiều tầng, vùng dữ liệu, dòng tổng, loại từng cột, DANH SÁCH Ô GỘP, căn lề và phông hiện có. Kèm office_excel_get_sheet khi cần xem giá trị.
- Định dạng theo từng vùng đó, không bao giờ theo "hàng đầu của sheet" (hàng đầu thường chỉ là tên trường/trường học, đầu bảng thật nằm thấp hơn). Không dùng office_excel_apply_theme hay office_excel_set_format lên cả sheet.
- Không gộp hay bỏ gộp ô; không căn lề đè lên vùng đã căn; không đổi giá trị, công thức, định dạng số, không làm tròn điểm. Cột số/điểm giữ đúng số chữ số thập phân đang có.
- Việc nên làm: phông thống nhất; khối tiêu đề (tên bảng đậm, to hơn, căn giữa nếu chưa căn); đầu bảng đậm, giữa, xuống dòng, có khung (giữ ô gộp); dữ liệu có khung mảnh, căn giữa theo chiều dọc; STT, ngày sinh, điểm căn giữa, họ tên căn trái; dòng tổng đậm có đường kẻ trên; nới cột bị cắt chữ (không thu cột đã chỉnh); cố định đầu bảng khi cuộn nếu bảng dài.
- Xem trước bằng office_excel_get_preview: soát chữ bị cắt (####), cột quá hẹp/rộng, khung đứt, đầu bảng lệch.`;

const POWERPOINT = `
RIÊNG CHO POWERPOINT
- Bắt đầu bằng office_ppt_get_slides (có vị trí, kích thước từng hình, đơn vị point) và office_ppt_get_theme (bố cục có sẵn, phông, cỡ, màu). Nên gọi office_ppt_get_preview ngay từ đầu để thấy hiện trạng, rồi mới quyết định.
- Nhận vai trò từng slide: slide tiêu đề, slide mục, slide nội dung, slide câu hỏi/đáp án, slide hình/bảng, slide kết. Cùng vai trò thì cùng cách trình bày.
- Cỡ chữ theo cấp, áp xuyên suốt: tiêu đề slide 32–40 pt, nội dung 24–28 pt, chú thích không dưới 18 pt (học sinh cuối lớp phải đọc được). Một hệ phông (tối đa 2 phông), ít màu; chữ tương phản rõ với nền.
- Mật độ: mỗi slide nội dung tối đa khoảng 6–7 dòng. Chữ tràn khung hay quá dày: giảm cỡ trong giới hạn trên, nới hoặc dời khung; vẫn tràn thì BÁO (đề nghị tách slide), không tự xóa, không tự tách, không rút gọn lời.
- Căn thẳng hàng: tiêu đề các slide cùng vị trí và cùng cỡ; khung nội dung cùng lề trái, cùng chiều rộng; giữ lề an toàn khoảng 30 pt so với mép slide. Chỉnh bằng office_ppt_format_shape (left, top, width, height) theo số đọc được, không ước lượng mò.
- Không xóa hay thay hình, bảng, video, hiệu ứng, ghi chú của người nói; không đổi thứ tự slide. Không chồng hộp chữ lên hình.
- Cuối cùng xem lại bằng office_ppt_get_preview; slide nào còn tràn, lệch hay chồng hình thì sửa hoặc nêu rõ.`;

export function buildBeautifyPrompt(i: BeautifyPromptInput): string {
  const hostPart = i.host === "excel" ? EXCEL : i.host === "powerpoint" ? POWERPOINT : WORD + (i.hasImages ? WORD_IMAGES : WORD_NO_IMAGES);
  const start = [i.fileName ? `Tên tệp: ${i.fileName}` : "", i.head ? `Vài dòng đầu (chỉ để biết khởi điểm, hãy tự đọc tệp):\n<dau_tep>\n${i.head}\n</dau_tep>` : ""].filter(Boolean).join("\n");
  return [COMMON + hostPart, i.design ? `PHƯƠNG ÁN NGƯỜI DÙNG ĐÃ CHỌN (ưu tiên hệ trình bày này, không tự thay bằng mẫu khác):\n${i.design.slice(0,12000)}\nNếu công cụ không hỗ trợ một chi tiết thì nêu rõ, không báo đã làm.` : "", start].filter(Boolean).join("\n\n");
}
