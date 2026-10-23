# Phiếu bàn giao 01 — Khảo sát đường chạy quy trình và nguồn gốc bản sao

Ngày đọc thực tế: 2026-10-23, 13:28–13:29 (+07). Thư mục: /Users/phananh/MySoft. HEAD: 4e873c1.

## 1. Trạng thái mã (đã kiểm tra bằng git, không dựa vào lịch sử)

- Worktree có **155 tệp sửa** (`M`) và **126 tệp chưa theo dõi** (`??`). Các tệp prompt-review và chèn mẫu chủ yếu là chưa theo dõi, nên chưa có trong HEAD.
- Các tệp mới liên quan trực tiếp (untracked, đã xác nhận bằng `git status`): `core/src/desktop/workflow-prompts.ts`, `core/src/desktop/template-apply.ts`, `core/src/desktop/workflow-templates.ts`, `core/src/desktop/workflow-resources.ts`, `chatbox/src/workflow-prompt-review.ts`, `chatbox/src/WorkflowPromptDock.tsx`, `chatbox/src/TemplateDialogs.tsx`, `chatbox/src/ChatWorkflow.tsx`, `chatbox/src/workflow-zoom.ts`, `docs/workflow-language.md`.
- Sửa (`M`) liên quan: `core/src/desktop/runtime.ts` (+541/−), `workflows.ts` (+268), `types.ts`, `plans.ts`, `rules.ts`, `chatbox/src/WorkflowPanel.tsx`, `WorkflowGraph.tsx`, `WorkflowWindow.tsx`, `PlanCard.tsx`, `workflow-tools.ts`.
- **Không xác định được** từ git các hunk nào là của lượt bị ngắt và các hunk nào là công việc trước đó. Coi toàn bộ là công việc của người dùng; không revert, không `git checkout`, không xóa.

## 2. Đường khởi chạy (đã đọc, `core/src/desktop/runtime.ts`)

Tất cả đi qua `reviewWorkflow` (dòng 186–214), cổng duyệt chung:
- `chatWorkflow` (dòng 1361–1382): tạo bản sao bằng `insertTemplate` khi không có `workflowId`; áp `applyRunEdits` cho bản sao; gọi `reviewWorkflow(named,'chatWorkflow',…)` ở dòng 1381. **Điểm cần xử lý:** bản sao được lưu (`this.changed()`) trước khi duyệt; nếu người dùng hủy ở bước xem trước, bản sao vẫn còn trong kho.
- `workflowRun` (dòng 1400–1406): nếu có `planId` chuyển sang `runPlan`; nếu không gọi `reviewWorkflow(w,'workflowRun',p)` rồi `workflows.run(...)`.
- `runPlan` (dòng 1462–1481): gọi `reviewWorkflow(linkedWorkflow,'runPlan',p)` (dòng 1471). Khi có bản duyệt, ghi đè `s.task` của `run.approvedPlan` (dòng 1477).
- `workflowCancel` / `workflowPromptCancel` (dòng 1407, 1409): hủy bản nháp.
- Chèn: `workflowInsertTemplate` (dòng 1329), `insertTemplate` trong `core/src/desktop/template-apply.ts` (dòng 41–89).

Lưu: `workflowSave` (dòng 1303) với kiểm tra chạy dở (1306); `plans.ts:86` và `workflows.ts:31` giữ cờ `templateCopy` và `promptFormat` khi chuẩn hóa.

## 3. Cơ chế duyệt và dấu vân tay (đã đọc)

- `WorkflowPrompts` (`core/src/desktop/workflow-prompts.ts`, dòng 75–112):
  - `prepare` (dòng 80): viết lại các nút qua `rewriteSteps` (dòng 26–29); bỏ qua khi `hasWorkflowLanguage` hoặc có `frame.decl` (`#bien`/`#ham`). Nút đã là `yaml-v1` không viết lại. Nút gốc Plan (`planPrompt` hoặc không có `templateCopy`) không nằm trong danh sách viết lại.
  - Bản nháp lưu trong bộ nhớ `drafts`, hết hạn sau 30 phút, tối đa 100 bản (dòng 96–97). Dấu so sánh là `promptSource` (dòng 37–41): băm định nghĩa, ngữ cảnh và `fileStamp` (kích thước, mtime, ctime) của tệp đính kèm, gồm cả tệp trong thư mục đến độ sâu 3.
  - `consume` (dòng 101–111): từ chối nếu token không khớp, khác `workflowId`, khác `contextKey` hoặc `source` đã đổi. Đây là điểm chặn thay đổi sau xem trước.
  - `savePrompts` (`runtime.ts` 199–212): chỉ lưu nút có `canSave` (`templateCopy` và, với Plan, prompt ≤ 4000 ký tự). Nút Plan được ghi vào `editPlanSteps`, các bước phụ thuộc bị giữ lại.
- Chạy lại và tái sử dụng (`core/src/desktop/workflows.ts`, dòng 281–305):
  - Dấu vân tay theo nút (dòng 292) băm: `wf.name`, vị trí, số nút, `handoff`, `mode`, `source`, `folder`, `deps`, toàn bộ `step` (có prompt), `promptSource` từ bản duyệt, và `decl`.
  - Chỉ tái sử dụng kết quả `success` khi dấu khớp và mọi phụ thuộc đã tái sử dụng. Dữ liệu cũ không có `fingerprint` dùng `signature` cấp quy trình (`legacySame`).
- Tài nguyên: `runtime.ts:1496` thu thập tài nguyên cho bản sao Plan qua `collectStepResources(…, true)` với `skill:()=>undefined` và `rules:()=>''`. Nghĩa là **skill và quy tắc không được áp vào nút bản sao Plan**, đúng như ghi nhận trong lịch sử. Cần xác nhận đây là chủ đích trước khi thay đổi.

## 4. Nguồn gốc của nút chèn (hiện trạng)

- Chỉ có cờ boolean `templateCopy?:true` (`core/src/desktop/types.ts` dòng 3–4) và `promptFormat?:'yaml-v1'`. Cờ được gán ở `template-apply.ts` dòng 57, 76, 86.
- **Không có** mã mẫu, mã phiên bản mẫu, hay mã nhóm chèn bền vững. Trường `insertGroup` (`template-apply.ts` dòng 61–62) chỉ gắn nhóm chèn, không xác định nguồn mẫu.
- Hệ quả: chưa phân biệt được nút gốc Plan và bản sao chèn khi dữ liệu cũ thiếu cờ. Cần thêm trường nguồn bền vững (bước 2).

## 5. Kiểm thử và kiểm tra kiểu (đã chạy trong lượt này)

- `npx vitest run` trên 10 tệp: `core/test/{workflow-prompts,chat-workflow,workflows,workflow-templates,plans,workflow-resources}.test.ts` và `chatbox/test/{workflow-prompt-review,template-dialogs,chat-workflow-card,workflow-zoom}.test.ts` → **10/10 tệp, 145/145 test đạt**.
- `npx tsc -p core --noEmit`: không in lỗi.
- `npx tsc -p chatbox --noEmit`: exit 0.
- Chưa chạy bộ đầy đủ `npm test`. Lịch sử ghi 2 lỗi Brain (quyền ghi cache) và 5 lỗi test cũ ở `python-setup`/`project-storage`; **chưa xác minh lại**.

## 6. Điểm chưa rõ / cần xử lý

1. `core/src/desktop/workflow-prompts.ts` và `template-apply.ts` là tệp chưa theo dõi (`??`), nên không có trong HEAD. Cần người dùng xác nhận đây là công việc muốn giữ trước khi commit hay sửa tiếp.
2. Bản sao từ `chatWorkflow` được lưu trước khi duyệt (dòng 1372–1381); cần quyết định có dọn bản sao khi hủy.
3. Skill/quy tắc không áp cho bản sao Plan (dòng 1496) — chủ đích hay thiếu?
4. Nút "Sửa lại" trong `WorkflowPromptDock.tsx` (dòng 32) luôn hiện khi dock mở; yêu cầu chỉ hiện khi có bản nháp cần duyệt, cần kiểm tra lại ở bước 5.
5. Chưa đọc `chatbox/src/workflow-prompt-review.ts` chi tiết và `WorkflowPanel.tsx`; chưa đọc `core/src/desktop/workflow-templates.ts` và `workflow-resources.ts`. Chưa xác minh `collectStepResources` (cần đọc `workflow-resources.ts`).
6. Không xác minh được thứ tự mong muốn giữa `END` và bước hoàn thiện Word (ngoài phạm vi bước này).

## 7. Việc bước 2 cần biết

- Thêm trường nguồn bền vững trên nút bản sao (ví dụ mã mẫu + mã nhóm chèn), không đổi thứ tự hay liên kết nút đã lưu.
- Viết kiểm thử cho: dữ liệu cũ chỉ có `templateCopy`; vòng lưu → tải → dựng lại từ Plan; nút gốc Plan không bị nhận nhầm.
- Không sửa mẫu gốc trong `workflowTemplates`.
- Nếu dữ liệu cũ không đủ phân loại an toàn, dừng và ghi trường hợp cụ thể (theo phần onError của bước 2).

## 8. Giới hạn

- Các nhận định trên được xác minh bằng đọc tệp và chạy kiểm thử trong lượt này; không dùng tóm tắt cũ làm bằng chứng.
- Chưa mở ứng dụng, chưa kiểm tra giao diện, chưa chạy với model thật.
- Không commit, không đẩy mã, không sửa mã nguồn trong bước này.
