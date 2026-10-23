---
name: pvta-powerpoint
description: Thiết kế bài giảng và thuyết trình PowerPoint 16:9 hiện đại, đa dạng bố cục Bento Cards, bảng biểu trực quan và ghi chú diễn giả.
load: always
groups: powerpoint
---
Làm việc trong PowerPoint:
- Đọc cấu trúc bài trình chiếu hiện có bằng office_ppt_get_slides trước khi sửa. Không xóa hay ghi đè slide sẵn có khi người dùng chưa yêu cầu.
- Nguyên tắc thị giác cốt lõi (tuyệt đối chống nhàm chán):
  + Không bao giờ lặp lại cùng một bố cục danh sách gạch đầu dòng đơn điệu xuyên suốt cả bài.
  + Luân phiên nhịp điệu bố cục giữa các slide: Slide bìa Hero -> Lưới Bento 2x2 (4 thẻ nhiệm vụ/nhóm) -> 3 Cột chuyên gia (3 đặc điểm/bước) -> 2 Cột đối xứng (So sánh/Thuận lợi & Thách thức) -> Bảng số liệu chuẩn hóa -> Thẻ Câu hỏi & Đáp án nổi bật.
  + Mỗi ý trong slide viết cô đọng theo cấu trúc "Nhãn nổi bật (2-5 từ): Nội dung cốt lõi (10-22 từ)"; toàn bộ lời giảng giải chi tiết đưa vào phần notes của slide.
  + Với dữ liệu tài chính, ngân sách, thống kê hoặc ma trận: bắt buộc trình bày bằng bảng hoặc chia thành các slide chuyên đề kèm dòng Tổng/Số dư nổi bật.
- Thao tác trực tiếp trong Add-in PowerPoint:
  + Bảng màu & Phông chữ: gọi office_palette (quy tắc 60% nền sáng sạch - 30% màu cấu trúc Navy/Slate - 10% màu nhấn Indigo/Emerald/Amber) và office_font_pairs để lấy cặp phông đồng bộ, độ tương phản cao.
  + Tạo slide theo bố cục chủ đề: xem tên bố cục bằng office_ppt_get_theme rồi gọi office_ppt_generate_slide với title, subtitle hoặc bullets.
  + Dựng khối thẻ (Bento Cards) và phân vùng: dùng office_ppt_add_slide, office_ppt_insert_textbox và office_ppt_format_shape (đặt nền fill, viền, tọa độ left, top, width, height chuẩn khung 16:9) kết hợp office_ppt_format_text để in đậm nhãn thẻ, tạo tiêu đề từ 26-32pt và nội dung từ 16-20pt để học sinh cuối lớp đọc rõ.
  + Gộp nhiều thao tác độc lập vào một mảng JSON.
- Thuật ngữ khoa học viết đúng chuẩn CT GDPT 2018, có đơn vị; công thức dùng ký hiệu Unicode rõ nét (x², Δ, π, H₂O).
- Con số cần chính xác (tổng, phần trăm, quỹ lương, số dư, điểm trung bình): bắt buộc tính bằng office_calc và đối chiếu bằng office_calc_check; không tự nhẩm.
