# Phiếu bàn giao 07 — Kiểm thử tích hợp chuỗi duyệt nháp và cập nhật hướng dẫn

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Đầu vào: `docs/handoffs/workflow-prompt-06.md`.
Mã đọc trực tiếp trong lượt này: `core/src/desktop/runtime.ts` (`promptScope`, `reviewWorkflow`, `saveReviewedPrompts`, nhánh `workflowPromptSave`, `workflowPromptCancel`, `workflowRun`), `core/src/desktop/workflow-prompts.ts`, `core/src/desktop/prompt-draft.ts`, `core/src/desktop/workflow-resources.ts`, `core/src/desktop/workflows.ts` (`run`, truyền `{{prev}}`), `chatbox/src/workflow-prompt-review.ts`, `chatbox/src/WorkflowPromptDock.tsx`, `chatbox/test/workflow-prompt-review.test.ts`, `core/test/workflow-prompts.test.ts`, `addin/src` và `bridge/src` (tìm `promptReview`, `workflowRun`, `chatWorkflow`: không có kết quả).

## 1. Đã làm
- **Kiểm thử tích hợp core mới** `core/test/workflow-prompt-integration.test.ts` (15 kiểm thử), chạy qua `DesktopRuntime.dispatch` với engine giả. Phủ:
  - Đầu vào/đầu ra bỏ trống: nút đầu (`buoc_truoc: []`, nguồn "Đầu vào quy trình"), nút sau, nút phụ thuộc trong chế độ song song, đầu ra khai báo thay mặc định.
  - Lỗi: model ném lỗi (gắn tên nút, không chạy, không để lại nháp); JSON sai (thông điệp "thiếu dau_ra" và "không phải JSON"); tệp mất trước khi viết lại (không gọi model); tệp mất sau khi duyệt; tệp sửa sau khi duyệt.
  - Hủy: RPC `workflowPromptCancel` xóa nháp; `WorkflowPrompts.cancel` khi đang viết lại dừng chuẩn bị.
  - Lưu và token: RPC lưu từ chối phương thức lạ và thiếu bản duyệt; token dùng một lần (lưu xong thì lưu lại và duyệt lại đều bị từ chối).
  - Ngoại lệ ngôn ngữ: quy trình có `#bien` chạy thẳng, không tạo nháp và không gọi model.
  - Chạy lại phần lỗi qua RPC (`retry:true`): tái sử dụng đúng prompt đã duyệt, không gọi viết lại lần nữa, rồi chạy thành công.
- **Kiểm thử trạng thái chatbox mới** `chatbox/test/workflow-prompt-state.test.ts` (7 kiểm thử, không DOM): hủy khi đang chuẩn bị gửi `workflowPromptCancel` đúng `id` (và `plan:true` với Plan); từ chối hai lượt duyệt đồng thời; phương thức ngoài luồng được chuyển thẳng; `dismissReviewNotice` không đụng bản đang chờ duyệt; phân loại lỗi "cần duyệt lại" theo năm thông điệp thật của máy chủ; lỗi thường không bị đánh dấu.
- **Cập nhật hướng dẫn**:
  - `README.md` (mục Công cụ quản lí quy trình): đóng xem trước khi đang viết lại thì không chạy/không ghi; tệp mất thì dừng trước khi gọi model; sau lưu bản sao phải bấm Chạy để mở lại khung duyệt (không viết lại); chỉ desktop có bước này.
  - `README-addin.md` (mục Xem trước lời nhắc quy trình): ghi rõ **chỉ PVTA Chat desktop, add-in Office không có bước này**; bổ sung các hành vi trên.
  - `chatbox/src/helpData.ts` (mục prompt quy trình): bổ sung hành vi hủy, lỗi, tệp thiếu và lưu rồi chạy.

## 2. Kết quả và đường dẫn tệp
- Mới: `core/test/workflow-prompt-integration.test.ts`, `chatbox/test/workflow-prompt-state.test.ts`, `docs/handoffs/workflow-prompt-07.md`.
- Sửa: `README.md`, `README-addin.md`, `chatbox/src/helpData.ts`.
- Kết quả công cụ xác nhận:
  - `tsc --noEmit -p core` và `-p chatbox`: exit 0.
  - Hai tệp mới: 22/22 đạt (sau khi sửa hai lỗi do chính kiểm thử: mock ghi đè bộ giải `finish`, và kỳ vọng gọi `runPlan` không phân biệt lượt chuẩn bị với lượt thực chạy).
  - `vitest run core chatbox`: 1294 đạt, 5 lỗi, 1 bỏ qua (tổng 1300).
- Lỗi còn lại, phân loại theo thông điệp (chưa đối chiếu với bản gốc):
  - `python-setup` (4): "Bộ công cụ PVTA không hoạt động. Hãy cài lại ứng dụng." — thiếu bộ Python đóng gói trong môi trường, không liên quan luồng duyệt.
  - `project-storage` (1): `EEXIST: /tmp/PVTA-Ket-qua/answer.txt` — thư mục tạm dùng chung giữa các lần chạy, lỗi cô lập kiểm thử.
  - Ba lỗi core ghi ở phiếu 06 (`assessment-skills`, `github-files`, `workflows`) **không tái hiện** trong lượt này.

## 3. Quyết định và giả định
- Không sửa mã sản phẩm trong bước này: mọi kiểm thử thêm đều pass với hành vi hiện có, nên không có lỗi sản phẩm nào được xác nhận để sửa.
- Hủy trên giao diện là nút **Đóng xem trước** (không có nút "Dừng" trong khung duyệt). Hướng dẫn đã ghi đúng nhãn này.
- Nút "Chèn và chạy" của `TemplateInsertDialog` vẫn không được truyền `offerRun`, nên không có kiểm thử cho nó vì không tới được từ giao diện. Không thuộc phạm vi bước này.
- Không commit, không đẩy mã, không phát hành.

## 4. Việc nút sau cần biết
- Phân loại `stale` trong `chatbox/src/workflow-prompt-review.ts` dựa trên regex `STALE`. Kiểm thử mới khóa năm thông điệp hiện có; nếu đổi chuỗi lỗi trong `runtime.ts` hoặc `workflow-prompts.ts`, phải cập nhật cả hai nơi.
- Hai kiểm thử core xác nhận hành vi sau: sửa nội dung tệp → "hết hiệu lực"; xóa tệp → "không còn truy cập được" (do `assertStepFiles` chạy trước khi kiểm tra bản duyệt). Thông điệp hướng dẫn cho người dùng có thể cần ghi rõ hai trường hợp này nếu muốn.
- Kiểm thử retry dùng engine giả ném lỗi một lần ở nút "Rà"; nó dựa vào `o.buildPrompt(...).includes('Rà')` để chọn lượt lỗi.

## 5. Việc còn dở hoặc lỗi
- **Chưa kiểm tra giao diện.** Chưa mở ứng dụng: chưa xem nút "Lưu vào bản sao", trạng thái `saved`, bố cục khung ở 850 px (còn từ phiếu 05, 06).
- **Chưa chạy với model thật.** Mọi kiểm thử dùng engine giả; chưa có kết quả thực về chất lượng YAML.
- Chưa kiểm chứng bằng đột biến (mutation) rằng các kiểm thử sẽ bắt được lỗi cố ý; chỉ chứng minh chúng đạt với mã hiện tại.
- 5 lỗi nêu ở mục 2 chưa được đối chiếu với bản gốc (không stash để tránh xáo trộn thay đổi chưa commit).
- Cây làm việc còn nhiều thay đổi chưa commit từ các bước và phiên khác; không đụng tới.
