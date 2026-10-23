# Plan: Tinh gọn giao diện PVTA Studio bằng menu chuột phải

**Mục tiêu:** giảm số nút phụ xuất hiện thường trực; thống nhất thao tác theo đối tượng; giữ các chức năng chính dễ tìm và dễ sử dụng.

**Phạm vi:** quy trình, hội thoại, dự án, tệp, PDF, sổ nguồn, skill, lời nhắc, quy tắc, nhóm tài liệu và GitHub.

## 1. Nguyên tắc thiết kế

- Bấm trái để chọn, mở hoặc sửa đối tượng theo hành vi hiện có.
- Chuột phải mở menu thao tác của đúng đối tượng được bấm.
- Dấu **⋯** mở cùng menu với chuột phải. Không tạo hai bộ lệnh riêng.
- Dấu ⋯ hiện khi rê chuột, khi đối tượng được focus bằng bàn phím; luôn có cách truy cập trên thiết bị cảm ứng.
- Không che giấu thao tác quan trọng: Gửi/Dừng, Lưu, Duyệt/Từ chối, Chạy/Dừng, Cập nhật GitHub.
- Không thay menu sao chép/dán mặc định trong ô nhập liệu và vùng soạn thảo.
- Menu phải hoạt động với mọi theme, font và mức kích thước giao diện hiện có.
- Không thay đổi dữ liệu hoặc quyền thực hiện chỉ vì chuyển vị trí nút.
- Không bổ sung thao tác xóa dữ liệu mới ngoài phạm vi các chức năng hiện có.

## 2. Rà soát và lập danh mục thao tác

**Công việc**

1. Kiểm tra các màn hình, nút hiện có và menu ⋯ đang dùng.
2. Với mỗi thao tác, ghi rõ:
   - Đối tượng áp dụng.
   - Vị trí hiện tại.
   - Điều kiện được phép thực hiện.
   - Có thay đổi dữ liệu hay không.
   - Cơ chế xác nhận, hoàn tác hoặc backup hiện tại.
   - Vị trí mới: nút chính, menu đối tượng, menu xuất hoặc cài đặt.
3. Phân biệt thao tác đã tồn tại với chức năng cần bổ sung.
4. Kiểm tra hành vi khi AI hoặc quy trình đang chạy.

**Đầu ra:** bảng danh mục thao tác và danh sách màn hình sẽ thay đổi.

**Hoàn thành khi:** mỗi nút dự kiến bỏ khỏi giao diện đều có vị trí thay thế rõ ràng.

## 3. Xây dựng menu dùng chung

**Công việc**

1. Tạo thành phần menu dùng chung cho chuột phải và dấu ⋯.
2. Hỗ trợ:
   - Icon, tên thao tác và phím tắt nếu có.
   - Nhóm thao tác và đường phân cách.
   - Trạng thái vô hiệu hóa kèm lý do dễ hiểu.
   - Đánh dấu thao tác nguy hiểm.
3. Đặt menu gần vị trí bấm, tự điều chỉnh để không tràn cửa sổ.
4. Đóng menu khi bấm ngoài, nhấn Esc hoặc chuyển ngữ cảnh.
5. Hỗ trợ bàn phím:
   - Shift+F10 mở menu của đối tượng đang focus.
   - Phím mũi tên di chuyển.
   - Enter thực hiện.
   - Esc đóng và trả focus về đối tượng.
6. Khi chuột phải vào đối tượng chưa chọn, menu phải áp dụng cho chính đối tượng đó.
7. Nếu đối tượng bị xóa hoặc trạng thái thay đổi trong lúc menu mở, không cho chạy lệnh đã mất hiệu lực.

**Hoàn thành khi:** menu dùng được bằng chuột, bàn phím và dấu ⋯; không vượt khung nhìn hoặc áp dụng nhầm đối tượng.

## 4. Tinh gọn màn hình quy trình

**Menu trên ô quy trình**

- Xem/sửa bước.
- Tạo liên kết mới.
- Thêm bước sau.
- Tạo nhánh song song.
- Thay đổi thứ tự nếu loại quy trình hỗ trợ.
- Xóa bước.

**Menu trên đường kết nối**

- Xóa liên kết.

**Menu trên nền sơ đồ**

- Thêm bước.
- Sắp xếp lại sơ đồ.
- Đặt lại vị trí sơ đồ.

**Menu trên thẻ trong thư viện quy trình**

- Ghim/bỏ ghim.
- Nhân bản.
- Xuất mẫu.
- Xóa quy trình.

**Điều chỉnh giao diện**

1. Bỏ các nút phụ tương ứng trên từng ô và dấu × xóa thường trực trên thẻ.
2. Giữ một nút **Thêm bước** dễ thấy trên thanh công cụ.
3. Giữ thao tác kéo để di chuyển và bấm ô để sửa.
4. Bấm đường kết nối chỉ chọn đường; xóa qua menu.
5. Đổi nút vô hiệu hóa **Đã hoàn tất** thành nhãn trạng thái.
6. Giữ nút Chạy, Dừng, Duyệt và các lựa chọn xử lý lỗi ở vị trí rõ ràng.
7. Giữ cơ chế tạo chấm kết nối ở cạnh ô; không đặt giới hạn số lượng tùy ý.

**Kiểm tra**

- Thêm/xóa bước, tạo nhánh, tạo/xóa liên kết.
- Chặn liên kết không hợp lệ theo quy tắc hiện có.
- Không kích hoạt sửa bước khi chỉ mở menu.
- Lưu và mở lại vẫn giữ đúng cấu trúc, vị trí và liên kết.
- Các thao tác bị cấm khi đang chạy vẫn bị cấm trong menu.

## 5. Tinh gọn hội thoại và dự án

**Hội thoại**

1. Dùng chung menu hiện có cho chuột phải và dấu ⋯:
   - Đổi tên.
   - Chuyển vào dự án.
   - Xóa.
2. Bỏ các nút tương ứng lặp lại trên từng hàng lịch sử.
3. Giữ bấm trái để mở hội thoại.

**Dự án**

1. Chuyển **Học hỏi**, **Chỉnh sửa thông tin** vào menu của thẻ dự án.
2. Giữ bấm thẻ để mở dự án.
3. Nếu đưa lệnh xóa ra menu, phải dùng lại quy trình xác nhận hiện có.

**Câu trả lời AI**

1. Giữ nút sao chép nhỏ khi rê chuột hoặc focus.
2. Bổ sung Sao chép và Góp ý vào menu phù hợp.
3. Không cản trở chọn và sao chép một đoạn văn bản.

**Kiểm tra:** thao tác trên hội thoại/dự án không đang mở vẫn áp dụng đúng đối tượng được bấm.

## 6. Tinh gọn tệp đính kèm và tệp kết quả

**Tệp đính kèm**

Chuyển các thao tác phù hợp vào menu:

- Xem/mở.
- Chỉnh sửa.
- Thêm vào dự án.
- Gỡ khỏi hội thoại.

Bấm tên tệp thực hiện thao tác xem/mở mặc định. Giữ nút thêm tệp và thêm thư mục trên khung soạn.

**Tệp AI đã tạo**

Chuyển các thao tác phụ vào menu:

- Hiện trong Finder hoặc trình quản lý tệp tương ứng.
- Lưu bản sao.
- Xem cạnh chat.
- Hoàn tác khi còn khả dụng.

Giữ **Mở tệp** là thao tác chính.

**Không thay đổi**

- Các nút Duyệt/Tạo tệp/Bỏ qua trước khi ghi.
- Nút thử lại khi xảy ra lỗi.
- Điều kiện cấp quyền truy cập tệp.

**Kiểm tra:** tệp bị di chuyển, mất quyền hoặc không còn tồn tại phải có thông báo rõ ràng, không khiến giao diện bị treo.

## 7. Tinh gọn công cụ PDF

**Công việc**

1. Chuyển năm nút trên từng trang vào menu:
   - Xoay trái.
   - Xoay phải.
   - Đưa lên trước.
   - Đưa xuống sau.
   - Xóa trang.
2. Cho phép mở menu từ trang hoặc hình thu nhỏ.
3. Giữ dấu ⋯ để người dùng nhận biết có thao tác bổ sung.
4. Giữ công cụ chú thích, điều hướng, zoom, Lưu và Hoàn tác.
5. Không ảnh hưởng menu chọn văn bản, OCR và hỏi AI theo vùng.

**Kiểm tra**

- Menu áp dụng đúng trang sau khi sắp xếp lại.
- Điều kiện xóa trang tuân theo quy tắc hiện có.
- Hoàn tác và lưu PDF hoạt động đúng.
- Menu không cản kéo chọn vùng hoặc bôi đen văn bản.

## 8. Tinh gọn sổ nguồn, skill và tài liệu

| Đối tượng | Thao tác đưa vào menu |
|---|---|
| Sổ nguồn | Đổi tên, xóa |
| Nguồn trong sổ | Mở, gỡ/xóa theo chức năng hiện có |
| Skill | Xem, sửa, nhân bản nếu hỗ trợ, xóa |
| Lời nhắc/quy tắc | Sửa, nhân bản, xóa |
| Tài liệu trong nhóm | Tải xuống, tóm tắt, xóa |
| Thư mục đã liên kết | Đọc lại, gỡ liên kết |

**Yêu cầu riêng với skill**

- Mở skill mặc định ở chế độ xem.
- Người dùng phải bấm **Sửa** mới được chỉnh nội dung.
- Tạo backup thành công trước khi cho phép chỉnh sửa.
- Giữ rõ các nút **Lưu**, **Hủy**, **Khôi phục backup** trong trình chỉnh sửa.
- Lệnh Sửa từ menu chuột phải phải đi qua cùng cơ chế backup.
- Nếu tạo backup thất bại, thông báo lỗi và chưa mở chế độ sửa.

**Giữ trên giao diện:** tạo mới, thêm nguồn, thêm tài liệu, bật/tắt và các thao tác duyệt nội dung.

## 9. Tinh gọn GitHub và các công cụ phụ

**GitHub**

1. Giữ rõ:
   - Kho GitHub, nhánh và thư mục trên máy.
   - Cập nhật.
   - Chế độ cập nhật.
   - Tiến trình, phần trăm và danh sách tệp.
   - Thông báo lỗi và cách khắc phục.
2. Đưa thao tác chọn lại thư mục vào menu của đường dẫn và dấu ⋯.
3. Khi thư mục không tồn tại, hiện trực tiếp nút **Chọn lại thư mục**.
4. Với tệp GitHub, dùng menu cho thao tác phụ như xem trên GitHub hoặc tải xuống nếu đã hỗ trợ.
5. Không thay đổi cơ chế đối chiếu, lịch sử tải lên hoặc quyền ghi.

**Các công cụ khác**

- Gom các nút xuất Word/PPTX/Excel/SVG thành một nút **Xuất…**.
- Đưa thao tác phụ của bản nháp Markdown vào menu ⋯ phù hợp.
- Giữ thanh định dạng thường dùng trong trình soạn thảo.
- Giữ Lưu, Hoàn tác, Làm lại và các nút áp dụng thay đổi quan trọng.

## 10. Kiểm thử và nghiệm thu

**Kiểm thử chức năng**

- Chuột phải và dấu ⋯ cho cùng danh sách lệnh, cùng kết quả.
- Menu áp dụng đúng đối tượng.
- Các thao tác vô hiệu hóa không thể gọi bằng đường truy cập khác.
- Xác nhận xóa, hoàn tác, backup và khôi phục vẫn hoạt động.
- Mở menu không tự thay đổi dữ liệu.
- Không phát sinh lệnh hai lần do sự kiện chuột hoặc bàn phím.

**Kiểm thử giao diện**

- Theme sáng, tối, sáng tương phản cao, tối tương phản cao.
- Các mức kích thước icon và font hiện có.
- Cửa sổ hẹp, cửa sổ rộng và vị trí sát bốn cạnh.
- Nhãn tiếng Việt dài.
- Danh sách cuộn dài.
- Điều khiển hoàn toàn bằng bàn phím.
- Ô nhập liệu vẫn giữ thao tác sao chép/dán bình thường.

**Tiêu chí nghiệm thu**

1. Các nút phụ đã chọn được gỡ khỏi vị trí thường trực.
2. Không mất chức năng và không phải tìm thao tác chính trong menu chuột phải.
3. Mọi đối tượng có menu đều có cách truy cập bằng dấu ⋯ hoặc bàn phím.
4. Không còn bấm một lần vào đường nối là xóa liên kết.
5. Skill vẫn bảo đảm backup trước khi sửa.
6. GitHub giữ nguyên luồng cập nhật và thông tin tiến trình.
7. Các kiểm tra tự động liên quan và bản build desktop đều thành công.
8. Có ảnh trước/sau cho các màn hình đã thay đổi và báo cáo những phần chưa kiểm thử được.

## Thứ tự thực hiện

**Giai đoạn 1:** rà soát → menu dùng chung → quy trình.

**Giai đoạn 2:** hội thoại/dự án → tệp → PDF.

**Giai đoạn 3:** sổ nguồn → skill/lời nhắc/quy tắc → nhóm tài liệu.

**Giai đoạn 4:** GitHub và công cụ phụ → kiểm thử tổng thể → đóng gói bản thử.

Sau mỗi giai đoạn, kiểm tra thao tác chính, thao tác chuột phải và khả năng khôi phục trước khi chuyển sang giai đoạn tiếp theo.
