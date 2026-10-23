---
name: office-word
description: Thiết kế tài liệu Word DOCX chuẩn thẩm mỹ (giáo án 5512, đề kiểm tra GDPT 2018, phiếu học tập, báo cáo và văn bản hành chính).
load: demand
groups: word, giao-vien, to-truong, hieu-pho, hieu-truong, van-thu, ke-toan, thu-vien, thiet-bi
---
# Thiết kế tài liệu Word (.docx) chuẩn mực & thẩm mỹ

## 1. Cấu trúc và Phân cấp Typography
- Xác định rõ thể loại tài liệu (Kế hoạch bài dạy 5512, Hồ sơ đề kiểm tra & Ma trận đặc tả GDPT 2018, Phiếu học tập, Báo cáo hay Công văn hành chính NĐ 30/2020).
- Dùng `create_office` với `title` và danh sách `blocks` có phân cấp rõ ràng:
  + `heading` (level 1, 2, 3): Dùng cho các phần lớn (`I. MỤC TIÊU`, `II. THIẾT BỊ DẠY HỌC`, `III. TIẾN TRÌNH DẠY HỌC`, `Hoạt động 1...`). Tuyệt đối không nhét ký hiệu Markdown (`##`, `**`) vào chuỗi văn bản.
  + `paragraph`: Viết theo cấu trúc `"Nhãn đề mục: Nội dung chi tiết"` (ví dụ `"Mục tiêu: Học sinh trình bày được..."`, `"Lưu ý: ..."`, `"Kết luận: ..."`) để bộ dựng Word tự động in đậm nhãn màu xanh Navy và đóng khung nền xanh nhạt (Callout) cho các đoạn Lưu ý / Mục tiêu / Kết luận.
  + `list`: Dùng cho danh sách yêu cầu cần đạt, các bước thực hiện hoặc câu hỏi thảo luận; viết theo mẫu `"Từ khóa chính: Nội dung diễn giải"` để tự động in đậm phần từ khóa đầu câu.
  + `table`: Bắt buộc dùng bảng cho Ma trận đặc tả, Bảng phân công nhiệm vụ (Hoạt động của GV | Hoạt động của HS), Bảng đáp án trắc nghiệm và Bảng thống kê số liệu. Hàng đầu tiên luôn là tiêu đề cột (tự động tô nền xanh Navy chữ trắng in đậm, lặp lại khi sang trang), các hàng chẵn kẻ sọc sáng (zebra striping), cột số tự động căn phải và dòng `"Tổng"` / `"Cộng"` tự động tô nổi bật.

## 2. Kiểm soát chất lượng nội dung
- Giữ đúng thứ tự câu hỏi, phương án A/B/C/D, thang điểm từng ý (0.25đ, 0.5đ) và tổng điểm bằng công cụ tính `pvta-calc`.
- Khi chỉnh sửa tài liệu sẵn có, ưu tiên `patch_office` hoặc công cụ Word trực tiếp để bảo toàn hình ảnh, sơ đồ và công thức toán học.
