# Kiểm chứng công cụ GitHub PVTA

Ngày thực hiện: 20/10/2026. Phạm vi: bước kiểm tra đầu ra và bàn giao trên mã đang có trong thư mục làm việc; không tạo bộ cài, không commit hoặc push mã dự án.

## Kết quả thực chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `npx vitest run core/test/github.test.ts core/test/github-contract.test.ts core/test/github-executor.test.ts core/test/github-rpc.test.ts` | 4 tệp, 35 kiểm thử qua |
| `npx vitest run --config chatbox/vitest.config.ts` | 9 tệp, 52 kiểm thử qua; riêng panel GitHub có 13 kiểm thử |
| `npm run typecheck` | Qua shared, core, bridge, addin và chatbox |
| `npm run build -w chatbox` | Qua; chỉ dựng tài nguyên giao diện web |

Build báo cảnh báo bundle lớn và import Tauri vừa tĩnh vừa động. Chưa tối ưu các cảnh báo này trong phạm vi bàn giao.

## Bằng chứng theo tình huống

- `core/test/github-executor.test.ts`: kho Git thật trong thư mục tạm; kiểm tra lưu phiên bản, bản xem trước cũ, xác nhận bỏ thay đổi, giữ tệp chưa theo dõi, lỗi push sau commit, xung đột gộp, hủy trước và giữa chuỗi, chống ghi đè, đầu vào sai, che bí mật.
- Bổ sung trong phiên bàn giao: thiếu Git/gh không chạy lệnh ghi; gh đã cài nhưng chưa đăng nhập không tạo kho; lưu và đẩy lên bare remote cục bộ, nhận thay đổi từ bản clone khác bằng pull fast-forward và đối chiếu nội dung thực.
- GitHub được giả lập qua runner: đăng nhập có mã chia nhiều đoạn, hủy đăng nhập, thiết lập Git và thu hồi quyền quản trị sau xem trước. Không dùng tài khoản GitHub thật.
- `core/test/github-contract.test.ts`: tính nhất quán danh mục, dữ liệu truyền JSON, điều kiện, đầu vào và chữ xác nhận.
- `core/test/github-rpc.test.ts`: định tuyến RPC có kiểu và trả lỗi xác thực đầu vào.
- `core/test/github.test.ts`: luồng Git cũ và kiểm tra URL remote.
- `chatbox/test/github-panel.test.ts`: xem trước, nhấp lặp, sự kiện kết quả đến sớm, ẩn/mở panel, hủy, lỗi, sửa biểu mẫu, xác nhận nguy hiểm và hướng dẫn bằng bàn phím. Bổ sung trạng thái thiếu công cụ và chưa đăng nhập.

Kiểm thử giao diện mới ban đầu dùng nhầm thao tác đăng xuất để kiểm tra điều kiện cần đăng nhập. Đã sửa kiểm thử sang tạo kho, rồi chạy lại toàn bộ bộ kiểm thử chatbox thành công.

## Danh sách thay đổi của bước bàn giao

- Bổ sung kiểm thử trong `core/test/github-executor.test.ts` và `chatbox/test/github-panel.test.ts`.
- Cập nhật `docs/github-tools.md` theo panel hiện tại.
- Lưu báo cáo này. Giữ nguyên các thay đổi mã nguồn từ các bước trước.

## Giới hạn xác minh

- Chưa đăng nhập, tạo/xóa kho, thao tác quyền, PR, issue hoặc release trên GitHub thật; chưa có kho thử do người dùng chỉ định.
- Kiểm thử giao diện dùng jsdom và RPC giả. Chưa kiểm tra trực quan trên cửa sổ Tauri/macOS, trình duyệt đăng nhập thật hoặc các kích thước màn hình.
- Không coi các kiểm thử trên là kiểm chứng đầu cuối mọi thao tác trong danh mục.
- Chỉ mục codebase-memory của `mysoft-current` có thế hệ 2026-10-20T03:34:38Z, chưa theo dõi một số tệp mới và báo panel đã đổi. Đã dùng nguồn trực tiếp cho các tệp kiểm tra; không dùng chỉ mục cũ làm bằng chứng đầy đủ.
- Không tạo `.app`/`.dmg` và không chạy trình cài.
