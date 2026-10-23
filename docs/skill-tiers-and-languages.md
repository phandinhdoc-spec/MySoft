# Quản lý kỹ năng, ngôn ngữ và truy cập nhanh

## Bốn nguồn kỹ năng

1. **Hệ thống**: xác định từ danh mục đóng gói và tên nội bộ, không tin trường phân loại trong SKILL.md tải về. Không xuất hiện trong danh mục thông thường. RPC xem/sửa/xóa/bật-tắt thông thường đều bị chặn. Quản trị viên có RPC xem riêng, chỉ đọc; thay đổi bằng cập nhật mã nguồn.
2. **PVTA tự học**: xem trong mục PVTA tự học. Biên tập qua bộ viết skill chuyên dụng của Biên tập nền, duyệt đề xuất trong Những điều đã học. Không sửa trực tiếp từ trình sửa kỹ năng.
3. **GitHub**: giữ tên và nguồn, tạo hướng dẫn tiếng Việt riêng gồm tóm tắt trên thẻ và bản đầy đủ qua menu Xem hướng dẫn. Bản hướng dẫn được lưu theo băm nội dung, thay đổi skill sẽ làm mất hiệu lực bản cũ.
4. **Tự tạo**: tạo và chỉnh sửa qua giao diện. Skill GitHub và tự tạo vẫn có bước Sửa để tạo backup trước khi cho phép thay đổi, và Khôi phục backup.

## Quyền quản trị

Máy chủ giấy phép Apps Script ký trường `role`. Cấu hình Script Property `ADMIN_EMAILS` bằng các email quản trị, cách nhau bằng dấu phẩy, chấm phẩy hoặc khoảng trắng. Triển khai lại Apps Script và kích hoạt lại tài khoản để nhận token mới. Thiết bị xác minh chữ ký, email, mã thiết bị và trạng thái thu hồi trước khi mở danh mục hệ thống. Không bật quyền quản trị từ localStorage hay chế độ phát triển. Thay đổi trong kho mã không tự triển khai máy chủ giấy phép.

## Tìm kỹ năng phù hợp

Chọn nhóm công việc và khai báo hồ sơ trước. Tác vụ nền dùng model nhẹ trong số backend đã cấu hình, ưu tiên các dòng được đặt tên haiku/flash/mini/nano/lite/small/fast; đây là lựa chọn theo dòng model, không phải kết quả đo tốc độ. Không bắt buộc Claude. Có dự phòng tối đa ba model.

Mỗi lần rà tìm tối đa ba kho GitHub và đánh giá tối đa 12 skill mới. Ghi nhớ băm nội dung cùng hồ sơ để tránh đánh giá lặp lại. Tự rà tối đa một lần mỗi tuần theo hồ sơ, chờ ít nhất một giờ sau lần thử lỗi; nút tìm thủ công có thể yêu cầu rà lại. Không chạy khi người dùng đã chọn không dùng mạng. Đề xuất chỉ được cài sau khi người dùng bấm Đồng ý tải, mặc định gọi thủ công bằng /tên. Chỉ nhập SKILL.md, không tự chạy script trong kho.

Dữ liệu được lưu trong thư mục dữ liệu PVTA: `skill-discovery.json`, và `.usage-guides.json` trong thư mục skills. Không cần tìm lại sau khi đóng ứng dụng.

## Ngôn ngữ

Chat: Cài đặt → Chung → Ngôn ngữ Chat. Add-in: Cài đặt → Ngôn ngữ add-in. Hai lựa chọn lưu riêng (`pvta.chat.language` và `pvta.lang`), tải lại giao diện khi đổi. Tên skill, nguồn, nội dung tài liệu/hội thoại và các mã dữ liệu không bị dịch tự động. Hướng dẫn skill vẫn viết bằng tiếng Việt theo yêu cầu. Thông báo thô từ CLI hoặc dịch vụ bên ngoài giữ nguyên để hỗ trợ chẩn đoán.

## Truy cập nhanh

Trong thanh bên Office/Kỹ năng/Tiện ích, bấm biểu tượng sửa tại Truy cập nhanh để chọn công cụ, đưa lên hoặc bỏ ghim. Danh sách lưu trong preferences của PVTA và giữ lại khi mở lại ứng dụng. Ghim công cụ không thực thi công cụ đó.

## Kiểm chứng

Kiểm thử tự động bao phủ phân tầng, chặn sửa hệ thống/tự học, cache hướng dẫn, duyệt tải mới cài, lưu ghim, tách ngôn ngữ, quyền admin có chữ ký và các luồng GitHub. Tìm GitHub và sinh hướng dẫn được kiểm bằng phản hồi giả lập; chất lượng đề xuất thực tế phụ thuộc backend và hồ sơ đã cấu hình.
