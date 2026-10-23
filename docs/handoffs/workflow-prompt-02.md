# Phiếu bàn giao 02 — Nguồn gốc bền vững của bản sao chèn

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Đọc mã trong lượt này (không dựa vào phiếu 01 làm bằng chứng).

## 1. Đã làm
- Thêm kiểu `TemplateOrigin {templateId, group}` và trường `origin` trên `WorkflowStep` và `PlanStep`. `templateCopy` vẫn là cờ quyết định bản sao có sửa được hay không.
- Thêm `cleanTemplateOrigin(value, copy)` (xuất khẩu từ `workflows.ts`): chỉ nhận khi `templateCopy` là true, `templateId` ≤ 80 ký tự, `group` ≤ 40 ký tự. Trường khác bỏ, không đoán lại.
- `normalizeWorkflow` giữ `origin` hợp lệ khi lưu quy trình.
- Dấu vân tay chạy (`workflows.ts`, khoảng dòng 300): băm `step` với `origin: undefined`, nên `origin` không đổi kết quả đã tái sử dụng.
- `insertTemplate` (`template-apply.ts`) gán `origin` cho bản sao ở cả ba đường: quy trình hiện có, Plan, quy trình mới. Đường Plan gán sau `editPlanSteps`, theo mã bước vừa tạo.
- `editPlanSteps` (`plans.ts`) chỉ giữ `origin` của bước đã có theo mã bước, không nhận từ dữ liệu gửi lên.
- `linkPlan` (`plans.ts`) đưa `origin` vào nút dựng từ Plan, cùng `templateCopy` và `files`.
- Thêm `core/test/template-origin.test.ts` (5 kiểm thử).
- Không sửa `workflowTemplates` (mẫu gốc), không sửa thứ tự hay liên kết của quy trình đã lưu.

## 2. Kết quả và đường dẫn tệp
- Sửa: `core/src/desktop/types.ts`, `core/src/desktop/workflows.ts`, `core/src/desktop/plans.ts`, `core/src/desktop/template-apply.ts`.
- Mới: `core/test/template-origin.test.ts`, `docs/handoffs/workflow-prompt-02.md`.
- Kiểm thử:
  - `template-origin.test.ts`: 5/5 đạt.
  - Bảy bộ liên quan (`workflow-templates`, `workflow-prompts`, `chat-workflow`, `workflows`, `plans`, `workflow-resources`, cùng bộ mới): 119/119 đạt.
  - `npx tsc -p core --noEmit`: exit 0.
  - Toàn bộ `core`: 859 đạt, 7 lỗi. Năm lỗi `python-setup` và một lỗi `project-storage` đã có trong lịch sử. Hai lỗi còn lại không liên quan: `assessment-skills` thiếu tệp `desktop-skills/office-doc-dac-ta/SKILL.md`; `github-files` lỗi build esbuild. Chưa đối chứng trên mã gốc, vì không dùng `git stash` khi worktree còn nhiều thay đổi chưa commit.

## 3. Quyết định và giả định
- Nguồn gốc là dữ liệu máy chủ: không nhận từ client cho bước Plan. Lý do: `planning.ts` nhận đầu ra mô hình, `editPlan` nhận dữ liệu từ giao diện.
- Dữ liệu cũ chỉ có `templateCopy` giữ nguyên cờ, không có `origin`. Không suy ra mẫu từ `insertGroup` (vốn mất khi lưu) hay tên bước.
- `origin` không đưa vào dấu vân tay: bước cũ và kết quả đã chạy không bị vô hiệu.
- Không thay đổi hành vi duyệt, hết hạn bản nháp, skill/quy tắc hay giao diện.

## 4. Việc nút sau cần biết
- Nguồn gốc đã có sẵn trên dữ liệu; nút sau có thể đọc `step.origin` để phân biệt bản sao chèn và nút gốc Plan.
- Nếu cần khóa biên tập theo mẫu, dùng `templateCopy` như hiện tại; `origin` chỉ là nguồn gốc.
- Cần xác nhận giữ `files` và `prompt` cho bản sao khi chạy lại (đã kiểm tra qua `linkPlan`, chưa qua giao diện).

## 5. Việc còn dở hoặc lỗi
- Chưa kiểm tra `origin` trong chatbox: xuất quy trình (`chatbox/src/workflow-tools.ts`) vẫn gửi `origin` đi. Chưa quyết định có nên bỏ như `insertGroup`.
- Chưa kiểm tra `templateId` có tồn tại trong `workflowTemplates` không. Hiện chỉ kiểm tra định dạng.
- Chưa có kiểm thử cho nhập quy trình từ tệp: `origin` từ tệp nhập sẽ được chấp nhận nếu `templateCopy` đúng.
- Chưa kiểm thử dấu vân tay thực tế (chưa có kiểm thử xác nhận kết quả đã chạy không bị vô hiệu do `origin`).
- Chưa mở ứng dụng, chưa commit, chưa chạy `chatbox` tests.
- Hai lỗi ngoài phạm vi (`assessment-skills`, `github-files`) chưa được đối chiếu với mã gốc.
