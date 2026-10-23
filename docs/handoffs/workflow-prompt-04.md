# Phiếu bàn giao 04 — Ảnh chụp bản duyệt và kiểm soát tái dùng kết quả

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Phạm vi: `core/`. Chưa commit.

## 1. Đã làm
- Băm nội dung thay vì chỉ kích thước/mtime: `fileStamp` nay tính SHA-256 cho tệp ≤ 20 MB; tệp lớn hơn vẫn dùng kích thước + mtime + ctime. Thư mục đi tối đa 3 cấp, bỏ tệp ẩn, `node_modules`, `dist`, `build`, `__pycache__`.
- Mô-đun mới `core/src/desktop/workflow-fingerprint.ts`: `fileStamp` và `resourceDigest` (băm tệp của nút, tệp đính kèm quy trình, đầu vào là tệp/thư mục, nội dung skill được gọi và quy tắc `#khóa`).
- `workflows.ts`: dấu vân tay từng nút (`stepPrints`) thêm trường `resources`. Đổi nội dung tài nguyên mà giữ nguyên đường dẫn thì nút đó và các nút sau chạy lại.
- `workflow-prompts.ts`: `promptStepSources` đưa thêm `cac_buoc` (id, tên, đầu ra của mọi nút) vào khóa của từng nút, vì bản viết lại cho một nút đã gửi danh sách này cho model. Trước đây đổi đầu ra nút khác vẫn tái dùng bản viết lại cũ.
- Mới `core/test/workflow-approval.test.ts`: 7 kiểm thử.

## 2. Kết quả và đường dẫn tệp
- Mới: `core/src/desktop/workflow-fingerprint.ts`, `core/test/workflow-approval.test.ts`, `docs/handoffs/workflow-prompt-04.md`.
- Sửa: `core/src/desktop/workflow-prompts.ts`, `core/src/desktop/workflows.ts`.
- `runtime.ts` không sửa. Cơ chế `consume` đã kiểm tra `promptSource` (định nghĩa quy trình, ngữ cảnh, tệp) và hết hạn sau 30 phút từ trước.
- Kiểm thử đã chạy:
  - `workflow-approval` + `workflow-prompts` + `prompt-draft` + `workflows` + `workflow-resources`: 80/80 đạt (73 cũ, 7 mới).
  - 16 tệp `workflow-*`, `chat-workflow`, `plans`, `desktop`, `prompt-draft`: 238/238 đạt.
  - `npx tsc -p core --noEmit`: exit 0.

## 3. Quyết định và giả định
- Bản duyệt chặn chạy khi `promptSource` đổi. Lỗi là `Bản nháp hết hiệu lực: ... Bấm Chạy để xem và duyệt lại.`; không tạo lượt chạy, giữ nguyên lịch sử và kết quả cũ.
- Bản sửa tay (`promptEdits`) đi vào dấu vân tay qua `step`, nên đổi prompt sau khi duyệt vẫn buộc chạy lại nút đó.
- Dấu vân tay cũ (`stepSources` đã lưu trước bước này) không khớp khóa mới. Hệ quả: lần chạy lại đầu tiên sẽ viết lại prompt một lần. An toàn, không lấy nhầm kết quả.

## 4. Việc nút sau cần biết
- Khi cần thông báo lỗi tài nguyên đổi, nút sau có thể dựa vào thông điệp của `consume` (đã có sẵn, không đổi).
- `fileStamp` và `resourceDigest` nằm ở `workflow-fingerprint.ts`. Nếu thêm loại tài nguyên mới, băm nó trong `resourceDigest`.
- `resourceDigest` nhận `lookup` từ `this.d.resources(wf)`; nếu không có lookup thì skill và quy tắc không được băm.

## 5. Việc còn dở hoặc lỗi
- **Khe thời gian chưa đóng:** giữa lúc `consume` kiểm tra và lúc đọc tệp trong `execute` vẫn còn các `await` (sao chép tệp, trích xuất). Thay đổi tệp trong khoảng này chưa bị chặn; chỉ được phát hiện ở lần chạy lại sau.
- **Thư mục làm việc của quy trình** (`wf.folder`, đường dẫn cwd) chưa được băm nội dung khi nút không có bản duyệt. Nút có quyền đọc thư mục đó có thể tái dùng kết quả cũ. Cần quyết định có băm thư mục này hay không.
- Băm đồng bộ tệp ≤ 20 MB có thể chặn event loop khi quy trình có nhiều tệp lớn; chưa đo.
- Chưa kiểm tra với model thật; mọi kiểm thử dùng model giả.
- Chưa kiểm tra xem 7 kiểm thử mới có thất bại trên mã cũ hay không; chỉ suy luận từ logic.
- Cây làm việc đang có nhiều thay đổi chưa commit từ các bước và phiên khác; không liên quan và không được đụng tới.
