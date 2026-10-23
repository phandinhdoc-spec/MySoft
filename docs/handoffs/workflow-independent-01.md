# Phiếu bàn giao 01 — Bản đồ khóa và đường chạy quy trình

Ngày: 2026-10-23 · Nút 1/8 · Chỉ đọc mã, chưa sửa tệp nào, chưa chạy kiểm thử hay build.

## 1. Khởi chạy
- RPC `workflowRun` — `core/src/desktop/runtime.ts` 1405–1411: chặn nếu `workflows.isRunning(id)`; qua `reviewWorkflow` (chuẩn bị prompt) rồi `return this.workflows.run(...)` (dòng 1410).
- RPC `chatWorkflow` — runtime.ts 1366–1400: gọi `workflows.run` ở dòng 1396.
- `WorkflowRunner.run` — `core/src/desktop/workflows.ts` 231–233: chặn trùng ID. `jobs.set(id, ctl)` ở dòng 267 chạy đồng bộ, trước mọi `await` → chặn trùng ID an toàn.

## 2. Chuẩn bị prompt
- `promptScope` — runtime.ts 187–194: chặn nếu `workflows.isRunning(w.id)` hoặc (quy trình gắn Plan và chat của Plan đang có job trong `this.jobs`).
- `WorkflowPrompts.prepare` — `core/src/desktop/workflow-prompts.ts` 65–69: khóa theo `w.id` (`preparing`), gọi `cancel(w.id)` trước khi bắt đầu.
- Giai đoạn này **không** nằm trong `WorkflowRunner.jobs`.

## 3. Hủy
- RPC `workflowCancel` — runtime.ts 1435: gọi `workflowPrompts.cancel(id)` (hủy chuẩn bị theo ID, dòng 63). Quy trình gắn Plan → `jobs.get(chatId).abort()` (hủy cả hội thoại của Plan). Còn lại → `workflows.cancel(id)` (workflows.ts 187): abort `AbortController` của đúng ID.
- `cancel` luôn trả `true`, kể cả khi quy trình không chạy.
- Chờ khóa đọc/ghi: `acquire` (workflows.ts 169–182) reject theo signal; chờ duyệt mã (`askCode`, 157–164) cũng reject.

## 4. Lưu và xóa
- `workflowSave` — runtime.ts 1308–1321: chặn nếu `isRunning(old.id)`; với Plan, chặn nếu `jobs.has(plan.chatId)`.
- `workflowDelete` — runtime.ts 1357–1365: chặn nếu `isRunning(id)` hoặc chat của Plan đang bận.
- `workflowPin` — 1300–1306; `workflowLinkResolve` — 1352–1355: chặn theo ID.
- Hai nhánh lưu/xóa **không** kiểm tra `workflowPrompts.preparing`.

## 5. Các cờ khóa
| Cờ | Vị trí | Phạm vi | Ghi chú |
|---|---|---|---|
| `Runtime.jobs` | runtime.ts 168 | Theo `chatId`/`req.id`/`nb:` | Chat, Plan, học hỏi. Quy trình không gắn Plan KHÔNG đăng ký vào đây. Một số điều kiện toàn cục: 247, 409, 451, 539, 1770 (cập nhật ứng dụng) |
| `WorkflowRunner.jobs` | workflows.ts 153, 267, 441 | Theo ID quy trình | Đúng phạm vi cần cho dừng/sửa/xóa |
| `readers/writer/waiters` | workflows.ts 165–182 | **Một instance dùng chung cho mọi quy trình** | Bước `access:'full'` giữ writer độc quyền; nhả khi chờ duyệt mã (211–214, 385) và khi xong (398) |
| `waitingCode` | workflows.ts 154–162 | Theo `runId/stepId` | Duyệt mã |
| `pending`, `operation` | WorkflowPanel.tsx 57, 97, 100–105 | **Toàn panel** | `running` (dòng 60) = `pending` \|\| lượt đang chạy của quy trình được chọn |
| `libraryPending`, `libraryOperation` | WorkflowPanel.tsx 58–59 | **Toàn panel** | Dùng cho ghim, nhân bản, xóa từ thư viện |
| Nút header | WorkflowPanel.tsx 143–146, 153, 168; `stageAction` 124 | Theo `running` | |
| `busy` / `busyId` | WorkflowBrowser.tsx 25–33; WorkflowPanel.tsx 137 | `busy` toàn cục, `busyId` theo ID | `isRunning(w)` = `busy` \|\| `w.id===busyId` \|\| có lượt running |

## 6. Khoảng trống và nguy cơ
1. **`pending` không gắn ID** (WorkflowPanel 60, 97): chọn quy trình B khi A đang chạy → B hiện "Đang chạy", nút Dừng gọi `workflowCancel(B)` (không tác động gì), và `run()` của B bị chặn. Đây là nguồn chính của việc chặn chéo ở giao diện.
2. **`libraryPending` toàn cục** (137 → WorkflowBrowser 25): một thao tác ghim/nhân bản/xóa khiến mọi mục trong thư viện bị khóa.
3. **Vòng đời RPC chưa xác minh**: dòng 1410 trả về promise của cả lượt chạy. Nếu dispatcher `await` handler thì RPC kéo dài đến hết lượt, và `pending` giữ đến khi xong. Cần đọc dispatcher RPC để xác nhận.
4. **Khoảng trống chuẩn bị**: `preparing` không khóa lưu/xóa. Sửa hoặc xóa khi đang viết lại prompt có thể để lượt chạy ghi vào đối tượng đã bị gỡ khỏi danh sách. Suy ra từ 1308–1365, **chưa tái hiện**.
5. **Khóa đọc/ghi chung** (workflows.ts 169–182): bước Chỉnh sửa của A làm bước đọc của B phải chờ. Test `core/test/workflows.test.ts:177` khẳng định hành vi này là có chủ đích. Theo kế hoạch: giữ, không bỏ khi chưa chứng minh nguy cơ ghi đè.
6. **Quy trình gắn Plan**: hủy = hủy cả hội thoại (1435); `runPlan` (1489–1502) dùng `jobs` theo `chatId` và không đi qua `WorkflowRunner`. **Chưa xác minh** nó có dùng khóa đọc/ghi chung hay không.
7. **Frame chuyển đổi (chưa tái hiện)**: WorkflowPanel 63–67 cập nhật `draft` sau khi `saved` đổi, nên có một khung hình mà `draft` còn của quy trình cũ. `draft.id` được dùng trong `Dừng` và `run()`.

## 7. Kiểm thử hiện có (chưa chạy lại)
- `core/test/workflows.test.ts`: 45–235, gồm chạy đa nhánh (102), hủy nhánh (153, 172), khóa ghi chặn quy trình khác và hủy người chờ khóa (177).
- `core/test/workflow-prompt-*.test.ts`, `core/test/workflow-approval.test.ts`, `core/test/plans.test.ts`.
- `chatbox/test/workflow-prompt-state.test.ts`, `workflow-prompt-review.test.ts`, `workflow-step-ui.test.ts`. **Chưa xác định** test nào phủ `pending`/`libraryPending`/`busyId`.

## 8. Giới hạn chưa kiểm chứng
- Chưa đọc: dispatcher RPC, `runPlan` đầy đủ (1489–1560), `workflow-prompts.ts` đầy đủ, `normalizeWorkflow` (có giữ `runs` khi lưu không).
- Chưa chạy kiểm thử, typecheck hay build. Chưa mở giao diện.
- Dòng số lấy từ đọc trực tiếp tệp trong phiên này; khớp với mô tả Brain đã cung cấp trước đó.

## BÀN GIAO
- **Đã làm:** Đọc `workflows.ts`, `WorkflowPanel.tsx`, `WorkflowBrowser.tsx`, các nhánh liên quan trong `runtime.ts`, `workflow-prompts.ts` và danh sách kiểm thử. Lập bản đồ khởi chạy, chuẩn bị, hủy, lưu, xóa và cờ khóa.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** Tạo `/Users/phananh/MySoft/docs/handoffs/workflow-independent-01.md`. Không sửa mã.
- **Quyết định và giả định:** Khóa theo ID đã có ở backend (`WorkflowRunner.jobs`, `isRunning`). Chặn chủ yếu nằm ở giao diện (`pending`, `libraryPending`, `busy`) và khóa đọc/ghi dùng chung. Giữ khóa đọc/ghi dùng chung và giữ chặn chạy trùng ID.
- **Việc nút sau cần biết:** Nguồn gây chặn chéo chính là `pending` toàn panel (WorkflowPanel 60, 97) và `libraryPending` (137). Backend lưu/xóa/ghim đã theo ID, trừ khoảng trống `preparing` (mục 6.4). Trước khi sửa cần xác minh vòng đời RPC `workflowRun` (dòng 1410) và `runPlan`.
- **Việc còn dở hoặc lỗi:** Chưa đọc dispatcher RPC, `runPlan` đầy đủ, `normalizeWorkflow`. Chưa chạy kiểm thử hay build. Các nguy cơ ở mục 6.4 và 6.7 chưa tái hiện.
