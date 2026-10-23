# Công cụ GitHub trong PVTA Chat

Mở mục **GitHub** ở thanh bên PVTA Chat. Chọn thư mục dự án trong panel và kiểm tra nhánh, địa chỉ kho trước khi thao tác. Máy cần Git; các thao tác tài khoản và kho GitHub cần GitHub CLI (`gh`). Panel có hướng dẫn khi thiếu công cụ.

- **Đăng nhập bằng trình duyệt:** làm theo mã dùng một lần do GitHub cấp. Không nhập mật khẩu hoặc token vào panel.
- **Lưu phiên bản:** nhập mô tả, xem trước rồi thực hiện. Thao tác đưa tất cả thay đổi không bị Git bỏ qua vào lần lưu, gồm tệp mới và tệp đã xóa.
- **Đưa lên GitHub:** chia sẻ các phiên bản đã lưu qua origin và nhánh theo dõi. **Lưu và đưa lên** thực hiện lần lượt; nếu đưa lên lỗi, phiên bản đã lưu trên máy vẫn còn.
- **Tải cập nhật:** chỉ cập nhật fast-forward. Luồng đồng bộ có thể gộp nhánh; khi xung đột, công cụ giữ trạng thái để xử lý thủ công.
- Danh mục chung có các nhóm quản lý kho, nhánh, lịch sử, cộng tác và cấu hình. Điền biểu mẫu rồi chọn **Xem trước tác động**; thao tác nguy hiểm yêu cầu gõ đúng chữ xác nhận.
- Dừng chuột hoặc tiêu điểm bàn phím trên nút trong 2 giây để xem hướng dẫn. Nút bị khóa có lý do hiển thị bên dưới.

Ẩn panel không dừng thao tác. **Yêu cầu dừng thao tác** không hoàn tác các bước đã xong; chờ kết quả trước khi thử lại. Nhật ký phân biệt thành công, lỗi, đã dừng và hoàn thành một phần. Nếu tác động chưa rõ, kiểm tra kho trước khi gửi lại.

Backend kiểm tra lại trạng thái, quyền và xác nhận khi chạy. Bản xem trước cũ bị từ chối. Hoàn tác commit cuối bị khóa khi không chứng minh được chưa công bố; dùng thao tác đảo ngược để giữ lịch sử. Bỏ thay đổi của tệp đang theo dõi không xóa tệp mới chưa được theo dõi.

Xem [báo cáo kiểm chứng](github-verification.md) để biết phạm vi đã thử và giới hạn.

## Duyệt và chuyển riêng tệp / thư mục

- **Kho trên GitHub → Duyệt tệp từ liên kết GitHub**: dán URL kho, `/tree/…` hoặc `/blob/…`; xem trước rồi thực hiện để hiện danh sách. Bấm **Mở thư mục** để chuyển biểu mẫu sang liên kết con; tệp có nút **Xem trên GitHub**. Đánh dấu nhiều mục rồi bấm **Tải các mục đã chọn**.
- **Tải xuống và đồng bộ → Tải tệp hoặc thư mục được chọn**: nhập mỗi đường dẫn trên một dòng, tính từ gốc kho. Chọn thư mục cha; ứng dụng đề xuất thư mục con mới `github-download-…`. Giữ cấu trúc đường dẫn, không ghi đè thư mục đã tồn tại.
- **Lưu và đưa lên → Cập nhật tệp hoặc thư mục được chọn**: chọn thư mục nguồn, thêm nhiều tệp hoặc lần lượt thêm thư mục, chọn nhánh và nhập nội dung lần lưu. Đường dẫn nguồn tương đối trở thành đường dẫn tính từ gốc kho GitHub. Liên kết thư mục không tự thêm tiền tố vào đường dẫn tải lên. Mọi tệp thường trong thư mục đã chọn đều được đưa lên, kể cả tệp ẩn, trừ `.git`; kiểm tra danh sách xem trước trước khi xác nhận **CẬP NHẬT**.

Các thao tác cần GitHub CLI và đăng nhập. Cập nhật cần quyền ghi, tạo một commit dựa trên cây hiện tại rồi cập nhật nhánh không ép ghi đè. Không xóa các tệp chỉ có trên GitHub. Nhánh có dấu `/` được nhận diện từ liên kết; có thể nhập nhánh rõ ràng khi URL không rõ nghĩa. Nhánh hoặc nội dung nguồn đổi sau xem trước thì phải xem trước lại.

Giới hạn mỗi lần chuyển: 500 tệp, tổng 100 MB; tối đa 20 MB mỗi tệp. Không hỗ trợ symlink, submodule hoặc cây kho bị GitHub cắt ngắn. Không tạo thư mục rỗng; kho đích phải có ít nhất một commit. Tải xuống kiểm tra mã blob Git; nếu lỗi giữa chừng, các tệp đã tải được giữ ở thư mục đích và kết quả báo cần kiểm tra trước khi thử lại. Hủy/timeout khi cập nhật nhánh có thể chưa xác định được kết quả từ xa; không tự thử lại.
