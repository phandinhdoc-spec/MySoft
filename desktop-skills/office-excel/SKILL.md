---
name: office-excel
description: Thiết kế bảng tính Excel XLSX chuyên nghiệp (sổ điểm TT 22/27, báo cáo ngân sách NQ 27, bảng tổng hợp, công thức tự động và biểu đồ).
load: demand
groups: excel, giao-vien, to-truong, hieu-pho, hieu-truong, ke-toan, thiet-bi
---
# Thiết kế bảng tính Excel (.xlsx) chuyên nghiệp & tự động hóa

## 1. Chuẩn hóa Cấu trúc & Định dạng Bảng tính
- Mỗi nhóm dữ liệu tách thành một sheet có tên ngắn gọn, rõ nghĩa (tối đa 31 ký tự).
- Hàng đầu tiên của `rows` luôn là hàng tiêu đề cột chuẩn mực (ví dụ: `["STT", "Họ và tên", "TX1", "TX2", "TX3", "TX4", "Giữa kì", "Cuối kì", "ĐTBmhk", "Xếp loại", "Nhận xét"]`). Bộ dựng Excel của PVTA sẽ tự động tô nền xanh Navy chữ trắng in đậm, cố định dòng tiêu đề (`freeze_panes`), bật bộ lọc (`auto_filter`), kẻ khung mảnh toàn bảng và giãn độ rộng cột tự động.
- Dữ liệu số (điểm số, tiền lương, ngân sách, số lượng) trong `rows` BẮT BUỘC truyền dưới dạng số nguyên hoặc số thập phân thực sự (`8.5`, `2029076946`), tuyệt đối không truyền dưới dạng chuỗi văn bản có dấu chấm phân cách (`"2.029.076.946"`) để Excel áp dụng định dạng số (`#,##0` hoặc `0.0`) và tính toán được công thức.
- Dòng tổng kết ở cuối bảng đặt tên bắt đầu bằng `"Tổng cộng"`, `"Cộng cả năm"`, `"Trung bình"` hoặc `"Số dư"` để hệ thống tự động tô nền xanh nhạt và in đậm toàn dòng.

## 2. Công thức Động & Biểu đồ Trực quan
- Luôn dùng mảng `formulas` (ví dụ `{"cell": "I2", "formula": "=ROUND((SUM(C2:F2)+G2*2+H2*3)/9,1)"}`, `SUM`, `AVERAGE`, `COUNTIF`, `IF`) cho các ô kết quả để sổ điểm và bảng tài chính tự động cập nhật khi giáo viên/kế toán thay đổi số liệu.
- Tính toán trước giá trị bằng `pvta-calc` khi cần trích dẫn con số chính xác trong lời giải thích.
- Thêm biểu đồ trực quan qua `charts` (`type: "bar"` hoặc `"line"`, tham chiếu đúng `minRow`, `maxRow`, `minCol`, `maxCol`, `categoryCol` và đặt `anchor` bên phải bảng dữ liệu) đối với các bảng thống kê phổ điểm hoặc so sánh ngân sách theo quý.
