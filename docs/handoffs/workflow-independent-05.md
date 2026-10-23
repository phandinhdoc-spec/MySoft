# Phiếu bàn giao 05 — Kiểm thử A/B đồng thời, hủy chọn lọc, sửa/xóa C và tác vụ chờ khóa

Ngày: 2026-10-23 · Nút 5/8 · Nhận phiếu 04 (chỉ rà soát, không sửa mã).

## 1. Đã làm
- Đọc phiếu 04, `core/test/workflows-concurrent.test.ts`, `core/test/workflows.test.ts`, và đường RPC trong `core/src/desktop/runtime.ts` (`workflowRun`, `workflowCancel`, `workflowSave`, `workflowDelete`, `reviewWorkflow`, `promptScope`).
- Thêm mới `core/test/workflows-independent-rpc.test.ts` (3 ca, dùng `DesktopRuntime` thật, chỉ giả lập `engine.run`).
- Không sửa mã nguồn sản phẩm. Không commit, không build, không mở ứng dụng.

## 2. Kết quả và đường dẫn tệp
- Tệp mới: `core/test/workflows-independent-rpc.test.ts`.
- Tệp mới: `docs/handoffs/workflow-independent-05.md` (phiếu này).

| Ca | Nội dung đã kiểm | Kết quả |
|---|---|---|
| 1 | Chạy A và B đồng thời qua RPC; chạy trùng A bị từ chối ("đang chạy") và không gọi mô hình thêm; `workflowCancel(A)` chỉ hủy A, B còn chạy; sửa (`workflowSave`) và xóa (`workflowDelete`) C được khi A, B đang chạy; B hoàn tất `success`. | Đạt |
| 2 | Khi A đang chạy: `workflowSave` và `workflowDelete` A bị chặn đúng thông báo; sau khi dừng A thì sửa được. | Đạt |
| 3 | B giữ khóa ghi; A (ghi) vào hàng chờ khóa, chưa gọi mô hình; hủy A → A `cancelled`, không còn `isRunning`, không gọi mô hình; B hoàn tất; C (ghi) chạy và `success` ngay sau đó, chứng minh khóa không bị rò. | Đạt |

Kết quả công cụ:
- `npx vitest run core/test/workflows-independent-rpc.test.ts`: **3/3 đạt**.
- Nhóm liên quan (`workflows-independent-rpc`, `workflows-concurrent`, `workflows`, `plans`, `workflow-prompts`, `workflow-prompt-integration`): **6 tệp, 121/121 đạt**.
- Toàn bộ `core` (`npx vitest run core`): 913 đạt, 1 bỏ qua, **5 lỗi** ở `python-setup.test.ts` (4) và `project-storage.test.ts` (1). Các lỗi này không nằm trong file tôi thêm; **chưa đối chiếu với mã gốc** nên không khẳng định chúng có sẵn từ trước.

Kiểm chứng ca có tác dụng thật (phép thử đột biến, đã khôi phục):
- Tạm đổi `WorkflowRunner.cancel(id)` thành hủy mọi lượt → 2 ca (1 và 3) **fail** đúng như mong đợi. Sau đó `cmp` xác nhận `core/src/desktop/workflows.ts` đã khôi phục đúng byte gốc.

## 3. Quyết định và giả định
- Dùng đúng luồng sản phẩm: `workflowRun` không có `promptApproval` chỉ trả `promptReview.token`; gọi lại với token mới mới chạy. Kiểm thử làm hai bước này.
- Các bước dùng `promptFormat: 'yaml-v1'` để bỏ qua lời gọi mô hình viết lại prompt. Nếu không, phiếu duyệt vẫn được tạo nhưng lời gọi viết lại chiếm `engine.run` và làm kiểm thử treo.
- Ca 3 dùng quy trình ghi (`access: 'full'`) với thư mục tạm; lời gọi mô hình của A không xảy ra vì A dừng trước khi vào bước.
- Không đổi khóa `chatId` của Plan; ngoài phạm vi ca này.

## 4. Phát hiện
- **Chuẩn bị prompt là một lời gọi mô hình thật.** Với nút thường (không Plan, không `yaml-v1`), `workflowRun` gọi `engine.run` để viết lại prompt trước khi chạy. Trạng thái lúc này là `isPreparing`, chưa phải `isRunning`. Ai đọc `isRunning` ngay sau khi nhận lượt gọi mô hình đầu tiên sẽ thấy `false`. Đây là hành vi đúng, nhưng dễ gây hiểu nhầm khi viết kiểm thử.
- **Phiếu duyệt có thời hạn 30 phút** và bị vô hiệu khi quy trình hoặc tài nguyên đổi (`consume` kiểm `source`).
- `workflowCancel` của quy trình thường **hủy cả chuẩn bị prompt** (`workflowPrompts.cancel`) trước khi hủy lượt chạy. Hai ca chưa phủ trường hợp hủy đúng lúc đang chuẩn bị.

## 5. Việc nút sau cần biết
- Có thể dùng `startRun` trong file mới làm mẫu: trả về `{done}` thay vì promise của lượt chạy, vì `await` một promise lồng bên trong sẽ chờ cả lượt chạy và gây treo (đã gặp và sửa trong phiên này).
- Còn thiếu (đã nêu trong phiếu 04, chưa làm ở đây): kiểm thử hai Plan trong một hội thoại (khóa theo `chatId`); thông báo `promptScope` dòng ~188; kiểm thử giao diện Dừng/Chạy/Xóa.

## 6. Giới hạn chưa kiểm chứng
- Chưa mở ứng dụng, chưa kiểm tra giao diện, chưa build, chưa chạy `chatbox`.
- Chưa kiểm thử quy trình gắn Plan chạy song song; chưa kiểm thử hủy đúng lúc đang chuẩn bị prompt.
- 5 lỗi `python-setup`/`project-storage` chưa đối chiếu với mã gốc.
- Chưa commit. Tệp `core/test/workflows-independent-rpc.test.ts` là tệp mới chưa theo dõi bởi git.

## BÀN GIAO
- **Đã làm:** Thêm 3 ca RPC đồng thời cho A/B/C, hủy chọn lọc, chặn sửa/xóa khi đang chạy, và hủy tác vụ chờ khóa ghi. Chạy kiểm thử; phép đột biến xác nhận ca có tác dụng. Không sửa mã sản phẩm.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `core/test/workflows-independent-rpc.test.ts` (mới, 3/3 đạt). `docs/handoffs/workflow-independent-05.md` (mới). Nhóm liên quan 121/121 đạt. Toàn `core`: 913 đạt, 5 lỗi ở `python-setup` và `project-storage` (chưa đối chiếu mã gốc).
- **Quyết định và giả định:** Kiểm thử đi đúng luồng phiếu duyệt rồi chạy; nút test dùng `promptFormat: 'yaml-v1'` để tránh gọi mô hình viết lại. Giữ khóa Plan theo `chatId`.
- **Việc nút sau cần biết:** Khi kiểm thử "đang chạy", phải tính đến giai đoạn chuẩn bị prompt (`isPreparing`). Mẫu `startRun` nằm trong file mới. Còn thiếu: hai Plan trong một hội thoại, hủy đúng lúc đang chuẩn bị, thông báo `promptScope`.
- **Việc còn dở hoặc lỗi:** Chưa mở ứng dụng, chưa build, chưa commit, chưa kiểm tra giao diện. Năm lỗi `core` ngoài phạm vi chưa được xác minh là có sẵn từ trước.
