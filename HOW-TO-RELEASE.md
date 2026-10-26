# Phát hành PVTA Studio trên MySoft

1. Giải nén ZIP. Tải NỘI DUNG thư mục đã giải nén lên gốc repository phandinhdoc-spec/MySoft, gồm cả thư mục ẩn .github. Finder: Cmd+Shift+. để hiện tệp ẩn. Không đặt source trong một thư mục con trên GitHub.
2. Xóa hai workflow cũ .github/workflows/chatbox-release.yml và .github/workflows/release.yml nếu còn trên GitHub. Chỉ giữ .github/workflows/studio-release.yml.
3. Xác nhận package.json là 1.5.2 và .github/workflows/studio-release.yml có tên PVTA Studio — Build & Release.
4. Actions → PVTA Studio — Build & Release → Run workflow → main.
5. Chờ desktop, office và publish thành công. Có thể lấy từng gói ở Artifacts; Releases sẽ có bản nháp desktop-v1.5.2 khi tất cả thành công.
6. Cài thử .exe trên Windows (x64). Đối chiếu SHA256SUMS nếu cần. Publish bản nháp khi đã kiểm tra.

Workflow hỗ trợ đẩy tag desktop-v1.5.2 để chạy tự động. Các lần sau tăng phiên bản chung bằng npm run version:set -- X.Y.Z trước khi commit và tạo tag mới. Không ghi đè bản đã công bố.

Bản phát hành chỉ có các gói người dùng cần:

- Windows: `PVTA-Studio-Setup-<v>.exe`, MỘT tệp cho cả x64 và ARM64. Bên trong có sẵn PVTA Chat (cả hai kiến trúc) và tiện ích Office; khi chạy tự chọn đúng kiến trúc, không cần tải thêm (chỉ cần Internet nếu máy chưa có Node.js).
- macOS Apple Silicon: `PVTA-Studio-<v>-arm64.dmg`, chứa PVTA.app và `Cai-tien-ich-Office.command` (kèm gói Office). Intel Mac chỉ dựng khi chọn rõ `mac-x64`.
- Linux x86_64: `PVTA-Chatbox-<v>-x64.AppImage` (không có tiện ích Office trên Linux).
- `pvta-office.tar.gz`, `office-latest.json` (tiện ích Office tự cập nhật dùng) và `SHA256SUMS`.

Các gói PVTA Chat riêng lẻ (.exe, .dmg) chỉ là nguyên liệu để đóng gói Studio, không đưa lên Releases. Python, Typst, Tinymist được dựng theo hệ điều hành khi tạo ứng dụng. Bản dựng chưa được cấu hình chứng chỉ ký số Windows hoặc Apple notarization.

Chạy một phần: ô `only` của workflow nhận danh sách khóa `win-x64`, `win`, `mac-arm64`, `mac-x64`, `linux-x64`, `office`; bản 1.5.2 mặc định để trống = `win-x64` (chỉ xuất Studio Setup cho Windows x86_64 kèm tiện ích Office).

ZIP này là mã nguồn để GitHub dựng bộ cài; chưa chứa bộ cài đã biên dịch. Workflow đã được kiểm tra YAML và mã nguồn, chưa chạy thực tế trên GitHub trong phiên này.

## Linux x86_64

Workflow dựng PVTA-Chatbox-1.4.1-x64.AppImage. Chỉ tạo bản nháp khi đã đủ gói Linux cùng các gói Studio Windows/Mac và Office.

AppImage:

    chmod +x PVTA-Chatbox-1.4.1-x64.AppImage
    ./PVTA-Chatbox-1.4.1-x64.AppImage

Nếu môi trường không có FUSE:

    APPIMAGE_EXTRACT_AND_RUN=1 ./PVTA-Chatbox-1.4.1-x64.AppImage

Hoặc sau khi bản phát hành đã công bố: bash Cai-PVTA-Linux.sh. Trình cài lấy AppImage từ MySoft, kiểm tra SHA256 và tạo mục PVTA trong menu ứng dụng. Dữ liệu được giữ qua cập nhật. Gỡ bản AppImage được cài bằng script: bash Cai-PVTA-Linux.sh --uninstall. Bản .deb gỡ qua trình quản lý gói.

Bản Linux này dành cho x86_64. Tính năng sửa tệp hoạt động trong Chat; đăng ký add-in vào Office desktop dành cho Windows/macOS. Linux vẫn cần các thư viện hệ thống như WebKitGTK; .deb khai báo để trình quản lý gói cài phụ thuộc.
