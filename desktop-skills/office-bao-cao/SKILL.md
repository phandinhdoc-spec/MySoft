---
name: office-bao-cao
description: Tạo bộ báo cáo thống kê, tài chính (NQ 27), tổng kết năm học đồng bộ trên Word, Excel và PowerPoint.
load: demand
groups: to-truong, hieu-pho, hieu-truong, ke-toan, excel
---
# Thiết kế Báo cáo Thống kê & Tài chính Đồng bộ (Word · Excel · PowerPoint)

- Xác định rõ kỳ báo cáo, đơn vị ban hành, đơn vị tính (đồng, triệu đồng, học sinh, %) và nguồn số liệu.
- Kiểm tra chéo mọi phép cộng, trừ, tỷ lệ (như mức chi 0,8 quỹ lương, số dư từng quý và lũy kế cả năm) bằng công cụ `pvta-calc`.
- Khi xuất PowerPoint báo cáo số liệu (như báo cáo thu nhập tăng thêm NQ 27):
  + Chia mỗi bảng chuyên đề thành một slide riêng có tiêu đề phân mục rõ ràng (`"I. Thông tin chung: Quỹ lương từng quý"`, `"II. Mức chi tối đa và số đã chi"`).
  + Dùng `rows` để dựng bảng số liệu có dòng `"Tổng"` / `"Cộng cả năm"` / `"Số dư"` nổi bật, kèm 1 dòng `bullets` bên dưới bảng để giải thích công thức hoặc lý do biến động.
- Khi xuất Excel: giữ nguyên số thực và gắn công thức `SUM`, `AVERAGE` trong `formulas`.
- Khi xuất Word: trình bày đầy đủ Quốc hiệu, Tiêu ngữ, tên đơn vị, các mục La Mã (`I.`, `II.`), bảng biểu căn giữa và phần nhận xét, kiến nghị.
