# Sửa Office cạnh chat

Phiên bản 1.1.1: đính kèm XLSX, DOCX hoặc PPTX, bấm **Xem và sửa** trên tên tệp.

- Excel: chọn sheet, chọn ô hiện có, sửa giá trị hoặc công thức.
- Word: chọn đoạn chữ trong bản xem nội dung, sửa rồi áp dụng. Các đoạn có nhiều kiểu chữ được tách thành các phần nhỏ để giữ định dạng.
- PowerPoint: chọn slide rồi chọn phần chữ cần sửa.
- Bấm **Áp dụng chỉnh sửa** để đưa vào bản nháp, **Hoàn tác/Làm lại** để điều chỉnh, **Lưu bản mới** để xuất tệp.
- **Hỏi AI về phần này** đưa nội dung đang chọn vào ô chat; bạn bổ sung yêu cầu rồi gửi.

Tệp mới lưu ở nơi xuất của hội thoại, tự thêm số nếu trùng tên. Không ghi đè nguồn. Nếu nguồn đổi sau khi mở, yêu cầu mở lại trước khi lưu.

## Giới hạn

Đây là trình sửa nội dung có cấu trúc, không phải bộ Office hoàn chỉnh hoặc bản xem trang chính xác. Hình, phương trình, hiệu ứng, biểu đồ và các phần không chỉnh sửa vẫn nằm trong tệp gốc và được giữ trong bản xuất; khung xem không tái dựng các thành phần này.

Excel chỉ sửa ô đã có, hiển thị tối đa 1.000 hàng có dữ liệu mỗi sheet, chưa thêm hàng/cột hoặc tính công thức trong ChatBox. Excel tính lại khi mở tệp xuất. Công thức mảng/chung phải sửa bằng Excel. Tệp có chữ ký số không cho sửa tại đây. Chỉ hỗ trợ .xlsx, .docx, .pptx.

Bản nháp được giữ khi chuyển hội thoại trong cùng phiên ứng dụng, chưa lưu qua việc thoát ứng dụng. Hãy lưu bản mới trước khi đóng PVTA.

## Kiểm tra

Kiểm thử tạo–sửa–mở lại cả 3 định dạng; kiểm tra tệp nguồn không đổi, từng phần ZIP không sửa giữ nguyên byte, giữ kiểu chữ Word, định dạng số/công thức Excel và vị trí hộp chữ PowerPoint; từ chối ghi đè và nguồn đã thay đổi. Chưa kiểm chứng trực quan trên ứng dụng macOS/Windows thực tế.
