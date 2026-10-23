# Phiếu bàn giao 04 — Rà điểm điều khiển theo ID, chuẩn bị prompt và Plan

Ngày: 2026-10-23 · Nút 4/8 · **Chỉ rà soát và đo bằng kiểm thử; không sửa mã, không commit, không build, không mở ứng dụng.**

## 1. Đã đọc và đối chiếu (mã hiện tại)
- Phiếu 03 đọc đủ. `WorkflowPanel.tsx` có cờ theo ID: `runPending` (state), `operation` (Set), `libraryOperation` (Set), `libraryPending` (state). `running` (dòng 61) chỉ phản ánh quy trình đang chọn (`saved`).
- Nút Chạy/Dừng (dòng 159): Dừng gọi `workflowCancel` với `draft.id`, cùng ID với `saved`. Chạy gọi `workflowRun` với `id` và `targetId` (dòng 117).
- `WorkflowBrowser.tsx` dòng 25: `isRunning(w)` = `busyIds` + `runningIds` + `w.runs` đang chạy + plan liên kết có bước đang chạy. Tính theo từng mục.
- `RunningTasks.tsx`: danh sách gồm hội thoại (`busy`, dừng bằng `cancel` theo `chatId`) và quy trình không gắn Plan (`!w.planId`, dừng bằng `workflowCancel` theo `id`). Quy trình gắn Plan không có dòng riêng, chỉ hiện qua hội thoại.

## 2. Bản đồ điểm điều khiển (core, `runtime.ts` và `workflows.ts`)
| Điểm | Khóa | Ghi chú |
|---|---|---|
| `WorkflowRunner.jobs` (`workflows.ts` 153) | ID quy trình | `run()` kiểm `jobs.has(id)` (dòng 233) **trước** khi `jobs.set` (dòng 267), không có `await` ở giữa, nên không chạy trùng hai lượt của cùng quy trình. |
| `WorkflowRunner.cancel(id)` (187) | ID quy trình | Hủy đúng một `AbortController`. |
| Khóa đọc/ghi chung (165–182) | Toàn bộ bộ chạy | Bước ghi chờ có hủy qua `signal`. Ghi chú: người đọc mới vẫn vượt qua người ghi đang chờ (có nguy cơ đói ghi). Không thuộc phạm vi sửa lần này. |
| `WorkflowPrompts.preparing` (`workflow-prompts.ts` 62–65) | ID quy trình | `cancel(id)` chỉ hủy lượt chuẩn bị của ID đó và xóa bản nháp có `workflowId` đó. |
| `workflowRun` (`runtime.ts` ~1405) | ID | Quy trình gắn Plan chuyển sang `runPlan`. Kiểm `isRunning` trước khi duyệt prompt. |
| `workflowCancel` (~1435) | ID | Hủy prep theo ID. Nếu gắn Plan: `jobs.get(chatId).abort()` rồi **trả true sớm**, không gọi `workflows.cancel`. |
| `workflowDelete` (~1361) | ID + Plan | Chặn khi `isRunning` hoặc `isPreparing` hoặc `jobs.has(plan.chatId)`. Đây là chốt an toàn phía máy chủ. |
| `runPlan` (~1489–1501) | **chatId** | `jobs.set(c.id)`. Chặn khi `jobs.has(c.id)`. |

## 3. Kết quả kiểm thử (đã chạy trong phiên này)
- `npx vitest run core/test/workflows-concurrent.test.ts core/test/plans.test.ts core/test/workflows.test.ts`: **3 tệp, 83/83 đạt**.
- Phạm vi: `workflows-concurrent.test.ts` có 2 kiểm thử ở cấp bộ chạy (A/B/C: dừng A không dừng B, C vẫn chạy, chạy trùng A bị chặn; hủy quy trình chưa chạy không ảnh hưởng quy trình đang chạy).
- **Chưa có kiểm thử** cho: RPC `workflowRun`/`workflowCancel`/`workflowDelete` với hai ID cùng lúc; quy trình gắn Plan chạy song song; giao diện Dừng/Chạy/Xóa; bản xem trước prompt khi đang chạy.

## 4. Phát hiện (chưa sửa)
1. **Khóa Plan theo hội thoại, không theo Plan.** `runPlan`, `workflowDelete`, `workflowPromptSave`, `pin`, `editPlan`, `skipPlanStep`, các nhánh đối chiếu và `insertTemplate` (`planBusy`) đều chặn theo `plan.chatId`. Nếu một hội thoại có từ hai Plan trở lên, chạy Plan A sẽ chặn sửa Plan B. Điều này vi phạm yêu cầu "chỉ khóa chính quy trình đang chạy". **Chưa xác minh** hội thoại có nhiều Plan trong dữ liệu thực; `findPlan` duyệt mọi tin nhắn nên về cấu trúc là có thể.
2. **`promptScope` báo sai lý do.** Dòng 188 gộp hai điều kiện: quy trình đang chạy và hội thoại có Plan đang chạy. Thông báo "Dừng quy trình trước khi chuẩn bị" không đúng khi nguyên nhân là hội thoại khác trạng thái.
3. **Dừng Plan đi qua hội thoại.** `workflowCancel` của quy trình gắn Plan hủy job theo `chatId`. Hiện an toàn vì mỗi hội thoại chỉ có một job `chatId`, nhưng là phụ thuộc ngầm. Nút Dừng trong RunningTasks ở dòng hội thoại gọi `cancel` và cũng hủy job này.
4. **Hai bộ lọc "đang chạy" khác nhau.** `RunningTasks` lọc `runs.some(status==='running' && !endedAt)`; `WorkflowBrowser` lọc `runs.some(status==='running')`. Một lượt có trạng thái `running` nhưng đã có `endedAt` sẽ hiện ở Browser mà không hiện trong danh sách Việc đang chạy.
5. **UI xóa không hỏi trạng thái chuẩn bị ở máy chủ.** `remove()` chỉ kiểm `operation` và `runs`. Máy chủ vẫn chặn đúng (`isPreparing`), nên lỗi chỉ hiện dưới dạng thông báo chung.
6. **Chưa xác minh** `promptWorkflow(w, all)` giữ nguyên `id` của liên kết Plan, vì `cancel(w.id)` dựa vào điều đó.
7. **Chưa xác minh** nguồn `busy` trong `App.tsx` có bao gồm hội thoại đang chạy Plan hay không (dòng hội thoại của RunningTasks phụ thuộc vào đó).

## 5. Quyết định và giả định
- Giữ nguyên mã. Các điểm 1–7 là đầu vào cho bước sửa, không phải lỗi đã chứng minh.
- Điều kiện "không chạy trùng cùng một quy trình" đã có chốt ở bộ chạy (`jobs.has` trước `jobs.set`), nên không cần thêm khóa ở tầng RPC.
- Giả định của kế hoạch vẫn đúng: chạy đồng thời giữa các quy trình độc lập; chạy đa nhánh trong một quy trình là việc khác.

## 6. Việc nút sau cần biết
- Xác minh điểm 1: đếm Plan theo hội thoại trong dữ liệu thật hoặc tạo dữ liệu thử; nếu có nhiều Plan, đổi khóa `runPlan`/`editPlan`/`workflowDelete` từ `chatId` sang `planId` (kèm kiểm thử: chạy A, sửa B vẫn được).
- Viết kiểm thử RPC cho `workflowRun`/`workflowCancel`/`workflowDelete` với hai ID; và một kiểm thử cho quy trình gắn Plan. Đọc `dispatchInner` và `runPlan` (~1489–1560) trước.
- Sửa thông báo dòng 188 theo nguyên nhân thật.
- Đọc `promptWorkflow` (điểm 6) và `App.tsx` (điểm 7) trước khi kết luận về Dừng qua hội thoại.
- Kiểm thử component chưa có harness: cần tách logic hoặc dựng kiểm thử cho nút Dừng/Chạy theo `draft.id`.

## 7. Giới hạn chưa kiểm chứng
- Chưa mở ứng dụng, chưa thao tác chuột, chưa kiểm tra trực quan.
- Chưa chạy `chatbox` (không đổi chatbox ở bước này), chưa build, chưa chạy RPC thật.
- Chưa tái hiện lỗi trên dữ liệu thật; các điểm 1–7 là suy luận từ mã.
- Chưa commit.

## BÀN GIAO
- **Đã làm:** Đối chiếu điểm điều khiển theo ID trong `runtime.ts`, `workflows.ts`, `workflow-prompts.ts`, `WorkflowPanel.tsx`, `WorkflowBrowser.tsx`, `RunningTasks.tsx`. Chạy 83 kiểm thử core liên quan. Không sửa mã.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `docs/handoffs/workflow-independent-04.md` (mới). `core/test`: `workflows-concurrent`, `plans`, `workflows` đạt 83/83. Không có tệp mã nào bị sửa.
- **Quyết định và giả định:** Không sửa khi chưa xác minh. Khóa chạy trùng nằm ở bộ chạy và đã được kiểm thử. Khóa Plan đang theo hội thoại (`chatId`), cần xác minh trước khi đổi.
- **Việc nút sau cần biết:** Xác minh có nhiều Plan trong một hội thoại; viết kiểm thử RPC hai ID; sửa thông báo dòng 188 của `promptScope`; đọc `promptWorkflow`, `App.tsx` busy, `runPlan` và `normalizeWorkflow`. Khóa đọc/ghi chung không đổi.
- **Việc còn dở hoặc lỗi:** Chưa xác minh các điểm 1, 6, 7 ở trên. Chưa có kiểm thử cho RPC và Plan chạy đồng thời. Chưa mở ứng dụng, chưa build, chưa commit, chưa kiểm tra giao diện. Điểm tích hợp RPC và bản xem trước prompt khi chạy đồng thời **chưa được xác minh**.
