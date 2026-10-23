# Máy chủ giấy phép và phản hồi PVTA (Google Apps Script)

Chạy trên chính Gmail của chủ phần mềm, miễn phí, không cần máy chủ riêng.

## Cách hoạt động
- Chủ phần mềm cấp cho **mỗi email một mã kích hoạt** (menu **PVTA ▸ Cấp mã cho email**). Sheet chỉ lưu bản băm, mã chỉ hiện một lần.
- Người dùng nhập email + mã trong PVTA. Mỗi email dùng được **tối đa 3 thiết bị**.
- Kích hoạt xong, giấy phép được **ký RSA** và kiểm ngay trên máy: dùng offline, cập nhật thoải mái, không hết hạn.
  Chỉ khi chủ phần mềm bấm **Thu hồi** thì lần kiểm tra kế tiếp (tối đa mỗi 24 giờ, khi có mạng) mới khóa máy đó.
- Phản hồi của người dùng (đã che số điện thoại, email…, người dùng xem trước rồi mới gửi) được lưu thành tệp `.md` trong thư mục Drive
  bạn chọn (thư mục đã đồng bộ về laptop) và thêm một dòng vào sheet **Phản hồi**.

## Cài đặt (một lần, khoảng 10 phút)
1. Vào Google Sheets, tạo bảng tính mới tên **PVTA – Giấy phép**.
2. **Tiện ích mở rộng ▸ Apps Script**. Xóa mã mẫu, dán toàn bộ `Code.gs`. Bật **Hiển thị tệp kê khai** (Cài đặt dự án) rồi dán nội dung `appsscript.json`.
3. Trên laptop, trong thư mục mã nguồn chạy:
   `node scripts/license-keygen.mjs`
   Lệnh in **khóa bí mật**. Dán vào Apps Script ▸ Cài đặt dự án ▸ Thuộc tính tập lệnh ▸ thêm `PRIVATE_KEY`. Khóa công khai tự được ghi vào `core/src/license/config.ts`.
4. **Triển khai ▸ Triển khai mới ▸ Ứng dụng web**: *Thực thi với tư cách: Tôi*, *Ai có quyền truy cập: Bất kỳ ai*. Chấp nhận quyền Drive/Sheets. Sao chép địa chỉ `.../exec`.
5. Chạy `node scripts/license-keygen.mjs --endpoint <địa chỉ .../exec>` rồi build lại ứng dụng.
6. Quay lại Sheet, tải lại trang, menu **PVTA ▸ Chọn thư mục Drive nhận phản hồi** → dán ID thư mục (phần cuối link thư mục Drive đã đồng bộ).
7. **PVTA ▸ Cấp mã cho email…** cho từng người, gửi mã riêng cho họ.

## Vận hành
| Việc | Cách làm |
|---|---|
| Người dùng đổi máy, hết chỗ | Họ tự bấm *Gỡ máy này* trong Cài đặt ▸ Giấy phép, hoặc chọn dòng của họ ▸ **Đặt lại thiết bị** |
| Mã bị lộ / muốn đổi mã | **Cấp mã cho email…** lần nữa (mã mới thay mã cũ; máy đã kích hoạt vẫn dùng bình thường) |
| Nhập sai mã 5 lần bị khóa | Chọn dòng ▸ **Mở khóa** |
| Ngừng cho một người | Chọn dòng ▸ **Thu hồi** |

## Lưu ý an toàn
- **Không bao giờ** commit `PRIVATE_KEY`. Mất khóa bí mật thì phải tạo lại (`--rotate`) và mọi người kích hoạt lại.
- Sau khi sửa `Code.gs`, phải **Triển khai ▸ Quản lý triển khai ▸ Sửa ▸ Phiên bản mới** thì địa chỉ cũ mới dùng mã mới.
- Chữ ký chỉ chống làm giả giấy phép; ai tự sửa mã nguồn ứng dụng để bỏ qua kiểm tra thì không ngăn được. Mục đích là không để dùng tràn lan, không phải bảo vệ bản quyền tuyệt đối.
