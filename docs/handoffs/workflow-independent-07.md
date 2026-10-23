# Phiếu bàn giao 07 — Cập nhật hướng dẫn chạy nhiều quy trình và dừng riêng

Ngày: 2026-10-23 · Nút 7/8 · Nhận phiếu 06 (chỉ đọc, không dùng lại trạng thái phiên trước).

## 1. Đã làm
- Đọc phiếu 06 và đối chiếu mã thật trước khi viết hướng dẫn:
  - `core/src/desktop/workflows.ts`: `WorkflowRunner` giữ `jobs` theo ID (`AbortController`), chặn chạy trùng (`'Quy trình này đang chạy.'`), `cancel(id)` hủy đúng ID; khóa đọc/ghi `acquire` nằm trong một instance chung (`new WorkflowRunner` tại `runtime.ts` dòng 235), nên áp cho mọi quy trình độc lập.
  - `core/src/desktop/runtime.ts`: `workflowCancel` (dòng 1435) gọi `workflowPrompts.cancel(id)` nên hủy cả giai đoạn viết lại prompt; quy trình gắn Plan thì `abort()` lượt chat của Plan. `workflowRun` (dòng 1405) chuyển sang `runPlan` nếu quy trình gắn Plan.
  - `chatbox/src/WorkflowPanel.tsx`: `running` = `runPending` chứa ID hoặc có lượt `running`; `runPending` bao cả RPC `workflowRun`.
- Sửa mục hướng dẫn liên quan (không đổi mã sản phẩm):
  - `README.md` mục "Quy trình đa nhánh và chạy song song": thêm gạch về nhiều quy trình độc lập cùng lúc; sửa mô tả **Dừng**.
  - `README-addin.md` mục "Tương thích và giới hạn kiểm chứng": thêm đoạn "Chạy đồng thời nhiều quy trình độc lập" kèm giới hạn.
  - `chatbox/src/helpData.ts`: sửa mục "Quy trình đa nhánh" (bước 4 về Dừng) và thêm một đoạn về chạy đồng thời.
  - `chatbox/src/en.json`: cập nhật khóa tiếng Việt cũ và thêm khóa mới cho hai chuỗi trên.
- Chạy `chatbox/test/workflow-independent-ui.test.ts` và `chatbox/test/help-brain.test.ts`: **9/9 đạt**; JSON của `en.json` hợp lệ.

## 2. Kết quả và đường dẫn tệp đã sửa
- `README.md` (mục Quy trình đa nhánh, hai mục sửa).
- `README-addin.md` (một đoạn mới sau đoạn "Quy trình độc lập cũ vẫn dùng bộ chạy riêng").
- `chatbox/src/helpData.ts` (một chuỗi sửa, một đoạn mới).
- `chatbox/src/en.json` (một khóa sửa, một khóa mới).
- `docs/handoffs/workflow-independent-07.md` (phiếu này).

Chưa commit. Cây làm việc đã có nhiều thay đổi không liên quan từ trước (ví dụ `addin/`, `bridge/`, `.github/`), không được đụng tới.

## 3. Quyết định và giả định
- Hướng dẫn chỉ nêu điều đã thấy trong mã: chạy trùng bị chặn; Dừng hủy theo ID; khóa Chỉnh sửa dùng chung giữa các quy trình; sửa, ghim, xóa, chạy lại bị khóa đúng quy trình đang chạy.
- Không hứa có giới hạn số quy trình chạy cùng lúc; ghi rõ mã đã đọc không có giới hạn.
- Với quy trình gắn Plan, ghi rõ Dừng hủy lượt Plan của hội thoại, không phải từng quy trình.
- Không sửa `README-addin.md` ở phần Plan hay phần giới hạn chung khác; không đổi logic khóa.

## 4. Phát hiện
- Hai câu trong README/helpData cũ nói Dừng "hủy các nhánh đang chạy" là đúng về nhánh trong một quy trình nhưng dễ bị hiểu là hủy cả hệ thống. Đã sửa để nói rõ theo quy trình đang chọn.
- Nút **Dừng** trên giao diện dựa trên `runPending` (bao RPC `workflowRun`). Khung xem trước prompt đang chờ duyệt đã trả `reply` trước khi chạy nên có thể không nằm trong `runPending`. Vì vậy hướng dẫn chỉ nói Dừng hủy việc viết lại prompt "nếu đang diễn ra", không hứa nút hiện trong mọi giai đoạn.

## 5. Việc nút sau cần biết
- Nếu muốn khẳng định "Dừng hủy cả khi đang xem trước", cần kiểm tra trên ứng dụng: nút Dừng có hiện trong lúc khung xem trước chờ duyệt không, và "Đóng xem trước" có gọi hủy không.
- Quy trình gắn Plan: `workflowCancel` hủy theo `chatId` của Plan, có thể ảnh hưởng toàn bộ lượt Plan của hội thoại đó. Chưa kiểm chứng khi chạy đồng thời với quy trình độc lập.
- Mẫu kiểm thử giao diện (`show`, `pending`, `runBtn`, `menuItem`) nằm trong `workflow-independent-ui.test.ts`.

## 6. Giới hạn chưa kiểm chứng
- Chưa mở ứng dụng, chưa kiểm tra giao diện bằng mắt, chưa build, chưa thử với AI thật.
- Chưa kiểm tra vòng đời RPC thật, bản xem trước prompt chờ duyệt, quy trình gắn Plan khi chạy đồng thời, và chưa đo tải nhiều quy trình.
- Chưa chạy lại toàn bộ `chatbox` hay `core`; hai lỗi `python-setup`/`project-storage` ở `core` (phiếu 05) chưa được xác minh lại.
- Chưa kiểm tra bản tiếng Anh bằng mắt; chỉ kiểm tra JSON hợp lệ.

## BÀN GIAO
- **Đã làm:** Đối chiếu mã chạy, hủy, khóa và giao diện với hướng dẫn; sửa mục liên quan trong README, README-addin, helpData và en.json; chạy 9 kiểm thử liên quan (đạt).
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `README.md`; `README-addin.md`; `chatbox/src/helpData.ts`; `chatbox/src/en.json`; `docs/handoffs/workflow-independent-07.md` (mới). Chưa commit.
- **Quyết định và giả định:** Hướng dẫn chỉ nêu điều đã thấy trong mã; không hứa giới hạn số quy trình; Dừng nói rõ phạm vi theo quy trình đang chọn; quy trình Plan dừng theo hội thoại.
- **Việc nút sau cần biết:** Nút Dừng có thể không hiện khi khung xem trước đang chờ duyệt; cần kiểm tra trên ứng dụng trước khi khẳng định chi tiết này. Chưa kiểm chứng tác động của Plan khi chạy đồng thời.
- **Việc còn dở hoặc lỗi:** Chưa mở ứng dụng, chưa build, chưa chạy AI thật, chưa xác minh lại hai lỗi `core` ở phiếu 05. Cây làm việc còn nhiều thay đổi không liên quan chưa commit.
