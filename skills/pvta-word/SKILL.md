---
name: pvta-word
description: Soạn thảo và thiết kế tài liệu Word chuyên nghiệp (giáo án 5512, đề kiểm tra GDPT 2018, phiếu học tập, báo cáo và công văn hành chính).
load: always
groups: word
---
Làm việc trong Word:
- Đọc vùng chọn bằng office_word_get_selection (hoặc đọc văn bản bằng office_word_get_body) trước khi sửa; thay thế vùng chọn bằng office_word_replace_selection, tìm và thay hàng loạt bằng office_word_replace_find, tự điều khiển con trỏ / bôi đen từ xa bằng office_word_select, hoặc chèn tại con trỏ bằng office_word_insert_text. Không dùng office_word_set_body ghi đè toàn bộ nếu người dùng chưa yêu cầu thay hết.
- Chuẩn thẩm mỹ & Typography sư phạm:
  + Hệ chữ: Times New Roman cỡ 13-14pt cho văn bản hành chính, đề thi, giáo án; giãn dòng 1.2-1.35, khoảng cách đoạn 4-6pt qua office_word_format_paragraph. Không dùng dòng trống liên tiếp để căn khoảng cách.
  + Phân cấp tiêu đề: dùng office_word_apply_style với "Heading 1", "Heading 2", "Heading 3" hoặc phân tích toàn văn bằng office_word_get_structure rồi gán đồng loạt qua office_word_apply_outline. Mỗi đoạn liệt kê viết theo cấu trúc "Nhãn in đậm: Nội dung giải thích" để tạo điểm tựa thị giác.
  + Bảng biểu chuyên nghiệp: dùng office_word_insert_table với header: true cho ma trận đề, bảng phân công, phiếu học tập và thống kê. Hàng tiêu đề in đậm nổi bật, nội dung gọn gàng, số liệu căn phải, dòng Tổng/Cộng in đậm.
  + Hộp nhấn (Callout): các mục Lưu ý, Mục tiêu, Kết luận hoặc Yêu cầu cần đạt được trình bày tách biệt, thụt lề và tô sáng hợp lý bằng office_word_apply_format.
- Công thức Toán, Lý, Hóa, Sinh: dùng office_word_insert_equation với LaTeX chuẩn (vd \frac{a}{b}, \ce{H2SO4}, \ce{CaCO3 -> CaO + CO2 ^}) để chèn tại vị trí hoặc tự tìm & thay thế hàng loạt (`find`, `index`, `items: [{find, latex}]`) thành Equation chỉnh sửa được trong Word mà không cần người dùng đặt con trỏ tay; hoặc quét bằng office_word_math_scan rồi thay bằng office_word_replace_paragraph / office_word_replace_find.
- Đề xuất mục lục, danh mục bảng và từ viết tắt theo nhu cầu tài liệu; chỉ gọi office_word_insert_index sau khi người dùng đồng ý.
- Con số cần chính xác (tổng điểm ma trận, phần trăm, ngân sách): tính bằng office_calc và kiểm chứng bằng office_calc_check; không tự nhẩm.
