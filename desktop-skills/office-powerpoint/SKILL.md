---
name: office-powerpoint
description: Thiết kế bài giảng và thuyết trình PowerPoint PPTX 16:9 hiện đại (bố cục Bento Cards, bảng biểu trực quan, thẻ câu hỏi trắc nghiệm và speaker notes).
load: demand
groups: powerpoint, giao-vien, to-truong, hieu-truong, doan-doi
---
# Thiết kế bài trình chiếu PowerPoint (.pptx) chuyên nghiệp

## 1. Nguyên tắc thị giác cốt lõi (Chống đơn điệu)
- Tuyệt đối KHÔNG tạo hàng chục slide có cùng một kiểu danh sách 4 dòng chữ đơn điệu.
- Mỗi slide chỉ truyền tải 1 thông điệp trọng tâm. Tận dụng cơ chế tự động dàn trang Bento Cards của PVTA bằng cách biến đổi số lượng mục (bullets) và cấu trúc giữa các slide liên tiếp:
  + **Slide 1 (Trang bìa Hero):** Đặt tiêu đề bài học/báo cáo ấn tượng; các mục bullets viết theo dạng `"Môn học: ..."`, `"Mục tiêu trọng tâm: ..."`, `"Năng lực số & AI: ..."`, `"Phương pháp: ..."` để tạo lưới thẻ mở đầu có dải màu nhấn.
  + **Bố cục 2 Cột đối xứng (2 mục bullets):** Dùng khi so sánh 2 khái niệm, Thuận lợi & Thách thức, hoặc 2 nhiệm vụ lớn.
  + **Bố cục 3 Cột chuyên gia (3 mục bullets):** Dùng khi trình bày 3 trụ cột kiến thức, 3 đặc trưng tự nhiên/kinh tế hoặc quy trình 3 bước.
  + **Bố cục Lưới Bento 2x2 (4 mục bullets):** Dùng khi phân công 4 nhóm chuyên gia, 4 tiêu chí đánh giá hoặc 4 hoạt động.
  + **Bố cục Thẻ Câu hỏi & Đáp án (Quiz):** Với slide luyện tập trắc nghiệm, viết dòng câu hỏi `"Câu 1: Nội dung câu hỏi?"` và dòng ngay sau là `"-> Đáp án: Nội dung đáp án đúng"` để hệ thống tự động đóng khung câu hỏi màu Indigo và thẻ đáp án màu Xanh lục bảo nổi bật.
  + **Bố cục Bảng dữ liệu (rows):** Khi trình bày số liệu ngân sách (như báo cáo Nghị quyết 27), lịch trình, ma trận hoặc bảng tổng hợp, BẮT BUỘC dùng `rows` (tối đa 12 hàng × 8 cột) thay vì viết chữ rời rạc. Đặt tên dòng cuối là `"Tổng cộng"`, `"Cộng cả năm"` hoặc `"Số dư"` để tự động tô nền xanh nổi bật và căn phải cột số. Có thể kèm thêm 1–2 dòng `bullets` ngắn để làm hộp chú thích (Callout) ngay bên dưới bảng.

## 2. Quy chuẩn biên tập nội dung trên Slide & Speaker Notes
- Mỗi mục trong `bullets` phải viết theo cấu trúc **"Nhãn ngắn gọn (2–5 từ): Nội dung cốt lõi (10–22 từ)"** để PVTA tách riêng phần nhãn làm tiêu đề thẻ in đậm có màu nhấn và phần thân làm nội dung thẻ.
- Tiêu đề slide (`title`) nên có tiền tố phân mục rõ ràng (ví dụ: `"HOẠT ĐỘNG 1: KHỞI ĐỘNG"`, `"BƯỚC 2: THẢO LUẬN NHÓM"`, `"CHUYÊN GIA NHÓM 1: VỊ TRÍ ĐỊA LÍ"`, `"I. Thông tin chung: Quỹ lương"`) để PVTA tự động tách phần tiền tố thành Huy hiệu (Badge Pill) phía trên tiêu đề chính.
- Toàn bộ lời dẫn dắt của giáo viên, kịch bản tổ chức lớp học, câu hỏi gợi mở và giải thích sâu phải đưa vào trường `notes` (Speaker Notes) của từng slide.
