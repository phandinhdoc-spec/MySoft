# Xưởng Toán PVTA

Mở **Xưởng Toán** trên thanh bên. Công cụ tổ chức theo công việc, không hỏi cấp học.

- **Đồ thị:** chọn hàm bậc nhất, bậc hai hoặc tỉ lệ nghịch; thay tham số, đổi khoảng nhìn cùng tỉ lệ hai trục. “Đoán trước khi kéo” ẩn đồ thị đến khi ghi dự đoán. Hệ số a bằng 0 được báo lỗi; tỉ lệ nghịch tách tại điểm không xác định.
- **Hình vẽ:** các mẫu tam giác với đường cao, trung tuyến, đường song song hoặc đường tròn tâm A qua B. Kéo A/B/C hoặc nhập tọa độ. Bật/tắt nhãn để tạo bản điền tên điểm. Nếu hình suy biến, sửa tọa độ hoặc Hoàn tác để khôi phục.
- **Biến thể:** phương trình bậc nhất có nghiệm nguyên, cộng phân số cùng mẫu và đọc giá trị hàm bậc nhất. Mã bộ đề tái tạo cùng nội dung. Không nhận bài tự do để tự chứng minh.
- **Máy tính:** nhập bằng bàn phím hoặc bàn phím màn hình; phân số, căn, lũy thừa, phần trăm, sin/cos/tan, log/ln. Chọn DEG/RAD trước khi tính. Dấu chấm là dấu thập phân, phép nhân viết `*`. Có lịch sử phiên tính, dùng lại và sao chép kết quả. Các phép căn và lượng giác luôn được ghi gần đúng; phép tính hữu tỉ dùng BigInt.
- **Học liệu đã lưu:** lưu dữ liệu mô hình trong thư mục `math-workshop` thuộc thư mục dữ liệu PVTA; mở để sửa hoặc tạo bản sao. Bản đã xuất không tự đồng bộ khi sửa mô hình.

## Xuất tài liệu

Chọn **Học sinh** hoặc **Giáo viên**, xem trước rồi xuất. Bản học sinh không chứa đáp án của bộ biến thể hay phần hướng dẫn giáo viên. Nội dung tự nhập vào ô nhiệm vụ vẫn được xuất nguyên văn, vì vậy không đặt đáp án trong ô này nếu muốn ẩn.

Word và PowerPoint nhận hình PNG tĩnh. SVG giữ nét vector; mô hình tương tác được lưu riêng trong PVTA. Excel chứa bảng giá trị hoặc bộ biến thể. Các tệp mới không ghi đè tệp trùng tên. Hướng dẫn tự nhập chưa được kiểm chứng; kiểm tra tọa độ không phải chứng minh hình học. Công thức trong bản xuất hiện tại là văn bản, chưa phải Equation Word.

**Nhờ AI gợi ý nhiệm vụ** đưa cấu hình học liệu vào ô trò chuyện để giáo viên xem rồi gửi. Chức năng dựng và tính không cần AI; yêu cầu AI sử dụng kết nối đang được chọn.

## Nhóm và công việc

Mục **Nhóm & công việc → Việc làm** mở Xưởng Toán, soạn học liệu, rà soát căn cứ hoặc Quy trình. Trong tab Nhóm, bấm số văn bản để mở danh sách của nhóm đã bật. Nút **Xem** trong bản tin văn bản mới mở đúng tab và nhóm; **Mở nguồn** dùng cơ chế mở liên kết có xác nhận, **Mở tệp** mở bản lưu trong kho. Văn bản thiếu cả tệp lẫn URL hiển thị lý do rõ ràng.

## Phạm vi hiện tại

Đây là bộ công cụ cục bộ theo mẫu; chưa phải bộ dựng hình tổng quát từ ngôn ngữ tự nhiên. Chưa tích hợp GeoGebra, Desmos hoặc Polypad; chưa có hình không gian, chứng minh tự động, đồng bộ hai chiều với Office hay lưu nhiều trạng thái đồ thị trong cùng học liệu. Có thể dùng **Tạo bản sao** để lưu từng tình huống.

Kiểm tra phát triển: TypeScript toàn dự án; kiểm thử lõi Toán, điều hướng bản tin, lưu/mở lại, bảo vệ tệp xuất và tách đáp án; kiểm tra tạo tệp Office bằng Python. Cần thử thêm trực tiếp trong ứng dụng macOS và xem bố cục trên Office thật.
