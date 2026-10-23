# Phiếu bàn giao 05 — Khung xem trước, trạng thái và chỉnh sửa bản nháp

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Đọc mã trong lượt này: `chatbox/src/WorkflowPromptDock.tsx`, `chatbox/src/workflow-prompt-review.ts`, `chatbox/src/workflow-prompt-review.css`, `chatbox/test/workflow-prompt-review.test.ts`, `core/src/desktop/workflow-prompts.ts` (hàm `editReviewedPrompt`, `consume`). Không dựa vào tóm tắt cũ.

## 1. Đã làm
- Giao diện xem trước đã có sẵn (chia cạnh sơ đồ; dưới 850 px chuyển sang màn hình riêng bằng container query). Lượt này bổ sung:
  - Trạng thái **lỗi** và **cần duyệt lại** hiển thị trên khung. Trước đây lỗi chỉ đi qua thông báo chung và khung biến mất.
  - Nút **Duyệt và chạy ngay** chỉ hiện khi đang có bản nháp cần duyệt. Ở trạng thái đang viết lại hoặc lỗi không hiện nút nào.
  - Kiểm tra bản sửa ngay trên giao diện bằng đúng luật của core. Nút duyệt bị khóa và báo lỗi theo tên nút.
  - Đóng khung khi đang duyệt: hủy, không chạy. Đóng khi lỗi: chỉ ẩn thông báo.
- Tách `editReviewedPrompt` sang module thuần `core/src/desktop/prompt-edit.ts` để chatbox import được (`workflow-prompts.ts` kéo `node:crypto`, không đưa vào trình duyệt). `workflow-prompts.ts` vẫn re-export tên cũ, nên kiểm thử và backend không đổi.

## 2. Kết quả và đường dẫn tệp
- Mới: `core/src/desktop/prompt-edit.ts`, `docs/handoffs/workflow-prompt-05.md`.
- Sửa: `core/src/desktop/workflow-prompts.ts` (chỉ chuyển hàm sang module mới), `chatbox/src/workflow-prompt-review.ts` (thêm phase `failed`, hàm `dismissReviewFailure`), `chatbox/src/WorkflowPromptDock.tsx` (viết lại, giữ API `WorkflowPromptDock`), `chatbox/src/workflow-prompt-review.css` (kiểu cho lỗi và cần duyệt lại), `chatbox/test/workflow-prompt-review.test.ts` (+4 kiểm thử).
- Không sửa `WorkflowPanel.tsx` và `workflow.css`. Khung xem trước nằm ở `WorkflowPromptDock.tsx` và `workflow-prompt-review.css`. `WorkflowPanel.tsx` chỉ có nút "Duyệt và chạy" theo từng nấc của Plan, không liên quan khung này.
- Kiểm thử đã chạy (kết quả công cụ xác nhận):
  - `workflow-prompt-review` + `workflow-prompts` + `prompt-draft`: 48/48 đạt (trước: 22/22; sau thêm 4 kiểm thử mới và 22 kiểm thử prompt-draft).
  - `chatbox` toàn bộ: 65 tệp, 376/376 đạt.
  - `npx tsc -p core --noEmit`: exit 0. `npx tsc -p chatbox --noEmit`: exit 0.
- 4 kiểm thử mới: lỗi khi viết lại (hiện lỗi, không có nút duyệt, vẫn ném lỗi cho bên gọi, Đóng xóa thông báo); bản nháp hết hiệu lực sau khi duyệt (hiện "Cần duyệt lại", không tự thử lại); sửa làm sai luật (khóa nút, giữ nội dung đã gõ, mở lại vẫn còn); đóng khi đang viết lại (không gửi lệnh chạy, không hiện nút duyệt).

## 3. Quyết định và giả định
- Hiển thị lỗi bằng trạng thái `failed` trong cùng khung. Lỗi vẫn ném lên để `report` như trước, nên có thể thấy hai lần (khung và thông báo). Chấp nhận để không đổi hợp đồng gọi.
- Lỗi "hết hiệu lực" được nhận diện bằng cụm từ trong thông báo của core (`hết hiệu lực`, `cần duyệt lại`, `cần duyệt lời nhắc`). Đây là phân loại theo chuỗi, dễ vỡ nếu core đổi câu chữ.
- Lỗi xảy ra sau khi đã duyệt (ví dụ không khởi động được lượt chạy) cũng hiện ở trạng thái lỗi, với thông điệp chung "Không hoàn tất được bước duyệt lời nhắc".
- Đóng khung đang duyệt vẫn gọi `decide(null)`, nên không chạy và `workflowPromptCancel` được gửi như cũ.

## 4. Việc nút sau cần biết
- `ReviewState` có thêm phase `failed {message, stale}`. Ai đọc `reviewSnapshot()` cần xử lý phase này. Hiện chỉ `WorkflowGraph.tsx` dùng và chỉ kiểm tra có trạng thái hay không.
- Kiểm tra bản sửa ở giao diện dùng `reviewEditProblem` (trong `WorkflowPromptDock.tsx`) và `editReviewedPrompt` (trong `core/src/desktop/prompt-edit.ts`). Nếu đổi luật, sửa ở `prompt-edit.ts`.
- `consume` ở backend vẫn kiểm tra lại bản sửa, nên lớp giao diện chỉ là lớp chặn sớm.

## 5. Việc còn dở hoặc lỗi
- **Chưa kiểm tra trực quan.** Không mở ứng dụng, không kiểm tra bố cục ở các kích thước cửa sổ. Ngưỡng 850 px (container query) là từ trước, chưa xác minh lại. Cần thử ở ít nhất: rộng (≥ 1100 px), ngưỡng 850 px, và hẹp (≈ 600 px). Kiểm tra cả nút "Xem vùng làm việc" khi có bản nháp.
- Chưa kiểm tra với model thật; mọi kiểm thử dùng hàm giả.
- Kiểm thử dùng jsdom nên không đo được layout hay container query.
- Stale chỉ phát hiện sau khi bấm duyệt (ở `consume`). Không có kiểm tra trước để báo sớm khi quy trình đã đổi trong lúc xem.
- Chưa kiểm tra chuyển màn hình (sang quy trình khác khi đang có bản nháp) trên ứng dụng thật; luồng này chỉ đọc qua mã.
- Cây làm việc còn nhiều thay đổi chưa commit từ các bước và phiên khác; không liên quan và không được đụng tới. Chưa commit.
