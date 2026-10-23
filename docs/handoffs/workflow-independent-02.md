# Phiếu bàn giao 02 — Định tuyến khởi chạy và hủy theo quy trình

Ngày: 2026-10-23 · Nút 2/8 · Đã sửa mã và chạy kiểm thử cục bộ. Chưa commit, chưa build, chưa mở ứng dụng.

## 1. Đối chiếu với phiếu 01
- Backend đã định tuyến theo ID cho `workflowRun`, `workflowCancel`, `workflowSave`, `workflowDelete`, `workflowPin`, `workflowLinkResolve` (runtime.ts). Không cần sửa logic này.
- Nguồn chặn chéo thật nằm ở giao diện: `pending`/`operation` toàn panel và `libraryPending`/`libraryOperation` toàn panel (WorkflowPanel.tsx), cùng `busy`/`busyId` trong WorkflowBrowser.tsx.
- Lớp truyền tải không xếp hàng: `daemon.ts` (`invoke`) và `src-tauri/src/lib.rs` (bảng chờ theo request ID) cho phép nhiều RPC song song. Hàm `dispatch` không khóa toàn cục.
- `workflowRun` trả về promise của cả lượt chạy, nên cờ "đang gửi" giữ đến khi lượt xong. Đây là lý do chặn chéo trên giao diện kéo dài suốt thời gian chạy.

## 2. Thay đổi
**Core**
- `core/src/desktop/workflow-prompts.ts`: thêm `isPreparing(id)` (theo ID).
- `core/src/desktop/runtime.ts`:
  - `workflowSave` (dòng ~1311): chặn sửa khi quy trình **đang chuẩn bị prompt** (cùng ID), không chỉ khi đang chạy.
  - `workflowDelete` (dòng ~1361): chặn xóa khi đang chuẩn bị prompt (cùng ID).
  - Không đổi `workflowCancel`, `workflowRun`, khóa đọc/ghi chung.

**Giao diện (chatbox)**
- `WorkflowPanel.tsx`:
  - `pending` → `runPending: string[]` theo ID; `operation` → `Set` theo ID. `running` = `saved` có trong `runPending` hoặc có lượt `running`.
  - `run()` khóa theo `draft.id`, bỏ qua khi chính quy trình đó đang bận.
  - `libraryPending` → mảng ID, `libraryAction(id, action)` khóa đúng mục. Ba lệnh ghim, nhân bản, xóa truyền `w.id`.
  - Truyền `runningIds={runPending}` và `busyIds={libraryPending}` cho WorkflowBrowser.
- `WorkflowBrowser.tsx`: bỏ `busy`/`busyId`, thêm `runningIds` và `busyIds` (mặc định `[]`). `isRunning(w)` chỉ đúng với mục có ID trong danh sách.

**Kiểm thử mới**
- `core/test/workflows-concurrent.test.ts` (mới, 2 test): A và B chạy song song, C chạy khi A và B đang chạy; dừng A không dừng B; chạy trùng A bị chặn; hủy C chưa chạy không ảnh hưởng A. Mô hình giả có thể điều khiển thời điểm hoàn tất.
- `chatbox/test/workflow-browser.test.ts`: thêm test khóa theo ID (quy trình đang chạy và đang thao tác bị khóa; quy trình khác mở được).

## 3. Kiểm chứng
- `core`: 5 tệp, 74/74 test đạt (workflows, workflows-concurrent, workflow-prompt-integration, workflow-prompts, workflow-approval). `tsc -p core` không báo lỗi.
- `chatbox`: 4 tệp, 31/31 test đạt (workflow-browser, workflow-prompt-state, workflow-prompt-review, workflow-step-ui). `tsc -p chatbox` không báo lỗi.
- Chạy vitest cho chatbox phải làm từ thư mục gốc `/Users/phananh/MySoft` (cấu hình include `chatbox/test/**`).

## 4. Giữ nguyên có chủ đích
- Khóa đọc/ghi chung (`readers/writer/waiters`, workflows.ts 165–182). Test workflows.test.ts:177 khẳng định bước ghi chặn quy trình khác. Không bỏ khi chưa chứng minh nguy cơ ghi đè.
- Chặn chạy trùng cùng ID (`jobs.has`, `isRunning`, `pending` theo ID).
- Cơ chế bảo vệ tệp: `assertStepFiles`, xác nhận khi bước lỗi có quyền ghi, duyệt mã.
- Quy trình gắn Plan: `workflowCancel` vẫn hủy hội thoại của Plan; `workflowSave`/`workflowDelete` vẫn chặn khi chat của Plan bận.

## 5. Quyết định và giả định
- Hủy vẫn theo ID; giai đoạn chuẩn bị được hủy qua `workflowPrompts.cancel(id)` như trước.
- Chặn sửa/xóa khi đang chuẩn bị là chặn cùng ID, nên không ảnh hưởng quy trình khác. Thông báo dùng lại "Dừng quy trình trước khi…" để nhất quán.
- Kiểm thử mới ở tầng runner, không qua RPC. Vì backend vốn đã theo ID, hai test core là hồi quy, không phải bằng chứng tái hiện lỗi. Chưa chạy các test này trên mã cũ để xác nhận chúng thất bại trước khi sửa.

## 6. Việc nút sau cần biết
- Tiêu chí "thao tác B không phụ thuộc A" đã có test ở tầng runner và tầng thư viện giao diện. Chưa có test RPC đầy đủ (`workflowRun`/`workflowCancel` qua dispatch).
- Với quy trình gắn Plan, `runPlan` (runtime.ts ~1489–1560) vẫn chưa đọc đầy đủ. Chưa xác minh nó có dùng khóa đọc/ghi chung hay không.
- `normalizeWorkflow` chưa kiểm tra có giữ `runs` khi lưu không.
- Khoảng trống khung hình chuyển đổi (WorkflowPanel, mục 6.7 phiếu 01) chưa được xử lý; `draft.id` vẫn lấy từ closure hiện tại.

## 7. Giới hạn chưa kiểm chứng
- Chưa mở ứng dụng, chưa thao tác chuột/touchpad, chưa kiểm tra trực quan nút Dừng và trạng thái khóa.
- Chưa build, chưa chạy toàn bộ bộ kiểm thử `core` và `chatbox` (chỉ chạy các tệp liên quan).
- Chưa commit.

## BÀN GIAO
- **Đã làm:** Đối chiếu phiếu 01 với mã hiện tại. Xác nhận backend đã theo ID; sửa chặn chéo trên giao diện (`pending`, `libraryPending`, `busy`/`busyId`) thành theo ID; thêm chặn sửa/xóa cùng ID khi đang chuẩn bị prompt; thêm kiểm thử đồng thời.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `core/src/desktop/workflow-prompts.ts` (thêm `isPreparing`); `core/src/desktop/runtime.ts` (workflowSave, workflowDelete); `chatbox/src/WorkflowPanel.tsx`; `chatbox/src/WorkflowBrowser.tsx`; `core/test/workflows-concurrent.test.ts` (mới); `chatbox/test/workflow-browser.test.ts`; `docs/handoffs/workflow-independent-02.md` (mới). core 74/74 đạt; chatbox 31/31 đạt; tsc không lỗi cho cả hai.
- **Quyết định và giả định:** Giữ khóa đọc/ghi chung và chặn chạy trùng cùng ID. Chuẩn bị prompt bị chặn sửa/xóa theo cùng ID. Chưa chạy test mới trên mã cũ để xác nhận thất bại trước sửa.
- **Việc nút sau cần biết:** Đọc `runPlan` (runtime.ts ~1489–1560) và `normalizeWorkflow` để xác minh khóa và giữ `runs`. Thêm test RPC cho `workflowRun`/`workflowCancel` nếu cần. Khoảng trống khung hình chuyển đổi (mục 6.7 phiếu 01) vẫn mở.
- **Việc còn dở hoặc lỗi:** Chưa mở ứng dụng, chưa build, chưa commit, chưa xác minh giao diện bằng mắt. Chưa đọc đầy đủ `runPlan` và `normalizeWorkflow`.
