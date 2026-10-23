# Cài và cập nhật PVTA

## macOS

Sau khi mã nguồn này được đưa lên nhánh main, dùng cùng một lệnh cho lần đầu và mọi lần cập nhật:

```bash
curl -fsSL https://raw.githubusercontent.com/phandinhdoc-spec/PVTA-ChatBox/main/installers/studio.sh | bash
```

Script tải một snapshot main, dựng ứng dụng và gói Office từ chính snapshot đó. Không tải DMG, không tắt Gatekeeper, không xóa quarantine. Cần Internet. Lần đầu cần Command Line Tools của Apple: nếu máy chưa có, script mở yêu cầu cài của macOS; cài xong chạy lại lệnh. Node được tải riêng nếu thiếu/không đủ phiên bản, Rust được cài nếu thiếu. Bộ nhớ đệm Rust được giữ để giảm thời gian những lần sau.

Nút cập nhật trong bản Mac mới mở cùng script trong Terminal để thấy tiến trình. Chương trình cũ chỉ được yêu cầu đóng sau khi dựng thành công. Hoàn tất tác vụ và lưu nội dung đang nhập trước khi cập nhật. Hội thoại/cấu hình không bị xóa. Bản app trước nằm ở `PVTA.previous.app` cạnh app chính; gói Office trước ở `~/.phananh-office/app.previous`. Phục hồi khi lỗi thay tệp/cài Office, chưa có kiểm tra tự động toàn bộ giao diện Chat sau khởi động. Không bảo đảm loại bỏ mọi yêu cầu bảo mật macOS: Office vẫn có thể cần xác nhận chứng chỉ HTTPS cục bộ lần đầu.

Script cài mới mặc định vào `~/Applications`, dùng lại `/Applications/PVTA.app` nếu có; báo rõ nếu không có quyền ghi. Không dùng sudo để ép quyền. Nút cập nhật giữ đúng đường dẫn app đang chạy.

## Windows

Tải bộ cài Studio mới rồi chạy lại. Bộ cài chạy nâng cấp Chat bằng chế độ passive và kiểm tra mã thoát, sau đó cập nhật Office. Không bắt nhấn Enter ở cuối. Dữ liệu nằm ngoài thư mục chương trình. Nút cập nhật Chat chọn bản desktop/chatbox có gói phù hợp và SHA256SUMS, bỏ qua bản Office riêng, bản nháp và prerelease. Nút cập nhật Windows dùng bộ cài Studio để nâng cấp cả Chat và Office.

## Kiểm chứng và giới hạn

Đã kiểm tra cú pháp shell, TypeScript và unit test. Cần thử cài mới/cài đè trên Mac Intel, Apple Silicon và Windows trước khi phát hành; môi trường Linux kiểm thử không xác nhận được Gatekeeper, hộp thoại chứng chỉ, NSIS hoặc thao tác mở lại app. Không tự động phát hành các thay đổi local.

## Một phiên bản chung

Nguồn phiên bản duy nhất: `package.json` ở gốc. Tăng phiên bản bằng:

```bash
npm run version:set -- 1.1.1
npm run version:check
```

Lệnh đồng bộ các workspace, lockfile, Tauri/Cargo, số phiên bản runtime và manifest Office (1.1.1.0 là cách biểu diễn bốn thành phần của cùng bản 1.1.1). Không sửa số ở từng thành phần. Bản hợp nhất đầu tiên là 1.1.0 để cao hơn cả Chat 0.1.12 và Office 1.0.25.

Dùng workflow `chatbox-release.yml`, thẻ `desktop-vX.Y.Z`. Workflow dựng Chat và Office từ cùng commit, kiểm tra đủ gói và số phiên bản rồi tạo bản nháp phát hành. Hai workflow phát hành riêng cũ đã ngừng. Không lấy lại gói Office cũ để ghép vào Chat mới; không đổi tên gói cũ thành số phiên bản mới. Công bố bản nháp sau khi thử cài trên các hệ điều hành. `install/latest.json` cũ chỉ là metadata của gói cũ, không sửa số thủ công khi chưa dựng lại gói/hash.
