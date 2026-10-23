# Cập nhật tự động trong PVTA Chatbox

Thầy cô bấm **Cập nhật ngay** là xong: app tự tải (có thanh tiến trình), tự cài và tự mở lại.
Không mở Terminal, không PowerShell, không phải gõ lệnh. **Không cần tạo khóa hay cấu hình gì thêm.**

## Người dùng thấy gì

1. Mở app, vài giây sau app tự hỏi GitHub (sau đó cứ 12 giờ hỏi lại). Có bản mới thì hiện thanh nhỏ ở đầu cửa sổ: "Có bản mới 0.1.x [Cập nhật ngay] [Để sau]".
2. Bấm cập nhật: "Đang tải bản 0.1.x… 45%" kèm thanh tiến trình.
3. "Đang cập nhật lên bản 0.1.x…"
4. "Đã cập nhật xong lên bản 0.1.x. Đang mở lại PVTA…", rồi app mở lại ở bản mới.

Hội thoại, cấu hình và kỹ năng nằm ngoài thư mục cài đặt nên được giữ nguyên.
Nếu đang có việc chạy (đang trả lời, đang chạy kế hoạch), nút cập nhật tạm khóa để không làm gián đoạn.
Có thể kiểm tra bằng tay ở **Cài đặt → Dữ liệu & cập nhật**.

## Cách hoạt động

Phần xử lý nằm ở `core/src/desktop/selfupdate.ts` (lõi PVTA), giao diện ở `chatbox/src/updater.ts` và `UpdatePanel.tsx`.

1. Đọc bản phát hành mới nhất của `phandinhdoc-spec/PVTA-ChatBox` qua GitHub API, lấy số phiên bản từ tên thẻ (`desktop-v0.1.12` → `0.1.12`) rồi so với bản đang chạy.
2. Chọn gói đúng máy: macOS `PVTA-Chatbox-x.y.z-arm64.dmg` / `-x64.dmg`, Windows `-x64.exe` / `-arm64.exe`, Linux `-x64.AppImage`. Chỉ nhận địa chỉ tải trong kho PVTA.
3. Tải gói, báo tiến trình, rồi **đối chiếu mã SHA256 với tệp `SHA256SUMS`** của bản phát hành. Không khớp thì xóa gói và không cài.
4. Cài:
   - **Windows:** chạy bộ cài ở chế độ passive (`/P /UPDATE /R`). Bộ cài chỉ hiện thanh tiến trình, không hỏi gì, tự đóng PVTA cũ, cài xong tự mở lại.
   - **macOS:** gắn tệp `.dmg`, chép `PVTA.app` mới vào cạnh bản đang chạy, đổi chỗ rồi mở lại. Nếu không có quyền ghi vào thư mục chứa PVTA.app, app báo tải gói `.dmg` bằng tay.
   - **Linux:** chỉ bản AppImage (thay tệp rồi mở lại). Bản cài từ `.deb` thì app báo tải gói mới.

## Phát hành một bản mới

Không đổi gì so với trước:

1. Tăng số phiên bản ở `chatbox/package.json`, `chatbox/src-tauri/tauri.conf.json`, `chatbox/src-tauri/Cargo.toml` và hằng `VERSION` trong `core/src/desktop/runtime.ts`.
2. Đẩy thẻ phát hành như mọi lần, rồi **Publish** bản nháp. App chỉ thấy bản đã Publish, không thấy bản nháp.

Bản phát hành cần có các gói `PVTA-Chatbox-…` và tệp `SHA256SUMS`. Quy trình phát hành hiện tại đã tạo sẵn cả hai.

## Lưu ý

- Máy đang chạy 0.1.11 trở xuống chưa có tính năng này, nên lần cập nhật đầu tiên lên bản mới vẫn theo cách cũ. Từ bản đó trở đi mọi lần cập nhật đều tự động.
- Gói chưa ký số nên Windows có thể hiện cảnh báo SmartScreen ở lần cài thủ công đầu tiên. Khi cập nhật trong app thì bộ cài chạy trực tiếp.
- Mã SHA256 giúp phát hiện gói tải hỏng hoặc bị tráo trên đường truyền. Nó không thay được chữ ký số. Khi phần mềm hoàn thiện, có thể bật thêm chữ ký (plugin updater của Tauri) mà không cần đổi giao diện.
