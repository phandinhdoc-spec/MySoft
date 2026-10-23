---
name: pvta-excel
description: Thiết kế bảng tính Excel chuẩn thẩm mỹ cho giáo viên và nhà trường (sổ điểm TT 22/27, báo cáo tài chính NQ 27, thống kê, biểu đồ).
load: always
groups: excel
---
Làm việc trong Excel:
- Khảo sát dữ liệu hiện có bằng office_excel_get_sheet (hoặc office_excel_get_range nếu bảng lớn bị cắt). Không ghi đè vùng dữ liệu người dùng chưa nhắc tới.
- Chuẩn thiết kế bảng tính hiện đại & dễ đọc:
  + Cấu trúc rõ ràng: hàng tiêu đề cột in đậm, nền màu đậm tinh tế (Navy/Indigo chữ trắng hoặc Xanh ngọc nhạt), căn giữa cả chiều ngang và chiều dọc, bật tự động xuống dòng (wrapText) và giãn cột tự động qua office_excel_set_format.
  + Phân tách dữ liệu và công thức: ghi dữ liệu thô bằng office_excel_set_range (điểm số và tiền tệ phải là kiểu số thực sự, không lưu chuỗi có dấu chấm/phẩy lẫn chữ). Đặt numberFormat chuẩn ("0.0" cho điểm số, "#,##0" cho tiền tệ/ngân sách).
  + Tự động hóa bằng công thức: ghi công thức qua office_excel_set_formula bắt đầu bằng dấu = (AVERAGE, SUM, COUNTIF, IF, ROUND, RANK) để bảng tự cập nhật khi đổi số liệu.
  + Tô màu cảnh báo & phân loại: dùng office_excel_conditional_format để làm nổi bật điểm dưới 5.0, mức Chưa đạt hoặc số dư âm. Dùng office_excel_create_table, office_excel_sort và office_excel_filter khi cần quản lý danh sách lớp.
  + Trực quan hóa bằng biểu đồ: dùng office_excel_insert_chart (type column, bar, line, pie với vùng dữ liệu gồm cả tiêu đề và đặt bên phải bảng).
- Làm đẹp toàn sheet đang có: luôn gọi office_excel_inspect_layout trước để nhận diện đúng vùng tiêu đề, đầu bảng nhiều tầng, vùng dữ liệu, dòng tổng và ô gộp; sau đó định dạng chính xác theo từng vùng bằng office_excel_set_format. Không làm dẹt đầu bảng hai tầng, không tự ý gộp hay bỏ gộp ô.
- Mọi con số tổng hợp, tỷ lệ phần trăm, điểm trung bình báo cáo cho người dùng phải tính qua office_calc và đối chiếu bằng office_calc_check.
