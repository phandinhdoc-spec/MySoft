# Phiếu bàn giao 06 — Luồng chạy thống nhất và thao tác lưu bản sao

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Đầu vào: `docs/handoffs/workflow-prompt-05.md`.
Mã đọc trực tiếp trong lượt này: `core/src/desktop/runtime.ts` (hàm `reviewWorkflow`, nhánh `chatWorkflow`, `workflowRun`, `runPlan`, `workflowPromptCancel`), `core/src/desktop/workflow-prompts.ts`, `core/src/desktop/prompt-draft.ts`, `chatbox/src/workflow-prompt-review.ts`, `chatbox/src/WorkflowPromptDock.tsx`, `chatbox/src/ipc.ts`, `chatbox/src/App.tsx` (hàm `runWorkflowInChat`), `chatbox/src/TemplateDialogs.tsx`, `chatbox/src/WorkflowPanel.tsx` (nút Chạy và Chạy lại), `core/test/workflow-prompts.test.ts`, `chatbox/test/workflow-prompt-review.test.ts`.

## 1. Đã làm
- **Luồng chạy đã thống nhất (xác minh bằng mã):** mọi đường khởi chạy đều qua `rpc` → `withPromptReview` (phía chatbox) → `reviewWorkflow` (phía core). Đường gồm: `chatWorkflow` (Chạy trong chat, `runWorkflowInChat`), `workflowRun` (nút Chạy và Chạy lại phần lỗi trong `WorkflowPanel`; nút quy trình thuộc Plan được chuyển sang `runPlan`), `runPlan` (`executePlan`). Không tìm thấy lệnh gọi thô nào bỏ qua cơ chế này.
- **Tách phạm vi duyệt:** hàm mới `promptScope` trong `runtime.ts` dựng nút, khóa và ngữ cảnh cho cả chuẩn bị, duyệt và lưu, để không lệch nhau.
- **Bỏ lưu ngầm khi chạy:** `reviewWorkflow` không còn ghi bản sao khi có `savePrompts`. Nút "Duyệt và chạy ngay" chỉ chạy với bản đã duyệt. Checkbox "Lưu bản tốt… khi duyệt" đã bị xóa.
- **Thao tác lưu rõ ràng:** RPC mới `workflowPromptSave` (`runtime.ts`). Tham số: `{method, params, promptApproval, promptEdits}` (lấy từ `reply.resume` và token của bản duyệt). RPC này: (a) khớp lại đúng lượt bằng `promptScope`; (b) với Plan, kiểm tra `revision` nếu có gửi kèm và `validatePlan`; (c) gọi `consume`, nên bản nháp cũ bị từ chối khi nguồn hoặc tài nguyên đã đổi; (d) ghi qua `saveReviewedPrompts` (hàm tách ra từ logic lưu cũ, không đổi hành vi); (e) **không chạy**, trả `{promptSaved:true, steps}`.
- **Khung xem trước:** nút "Lưu vào bản sao" (chỉ hiện khi có nút `canSave`, bị khóa khi có lỗi sửa). Trạng thái mới `saved` xác nhận đã ghi và nhắc "chưa chạy". Trạng thái `failed` giữ `review` khi lưu thất bại để hiển thị bản nháp đối chiếu, không ghi gì. Khi đang lưu, nút bị khóa (`busy`) để tránh bấm đúp.
- **Phiên bản:** `withPromptReview` giữ khung cho tới khi lưu xong. Lỗi "hết hiệu lực", "cần duyệt lại", "đã đổi" được nhận diện là `stale`.
- **Hướng dẫn:** cập nhật `README.md` (dòng về Duyệt và chạy ngay), `README-addin.md` (mục Xem trước lời nhắc), `chatbox/src/helpData.ts` (mục prompt quy trình).
- **Kiểm thử mới/sửa:**
  - Core: `saves the approved copy without running, keeps attachments…` (giữ tệp đính kèm, `templateCopy`, thứ tự nút, không gọi model, mẫu không đổi); `refuses to save a draft whose approved version no longer matches…` (bản nháp không bị tiêu thụ, dữ liệu không đổi); `refuses a save with no copy node…`; trong kiểm thử Plan: lưu với `revision` sai bị từ chối, rồi lưu đúng và chạy sau khi lưu.
  - Chatbox: duyệt chạy không gửi `savePrompts` và không gọi `workflowPromptSave`; lưu riêng gửi đúng RPC, không gọi `workflowRun` có token, hiện xác nhận "chưa chạy"; lưu khi có lỗi sửa bị khóa; bản nháp hết hiệu lực được giữ trên khung.

## 2. Kết quả và đường dẫn tệp
- Sửa: `core/src/desktop/runtime.ts`, `chatbox/src/workflow-prompt-review.ts`, `chatbox/src/WorkflowPromptDock.tsx`, `chatbox/test/workflow-prompt-review.test.ts`, `core/test/workflow-prompts.test.ts`, `README.md`, `README-addin.md`, `chatbox/src/helpData.ts`.
- Mới: `docs/handoffs/workflow-prompt-06.md`.
- Kiểm thử (kết quả công cụ xác nhận):
  - `npx tsc --noEmit -p .` cho core và chatbox: exit 0, 0 lỗi TS.
  - Core `workflow-prompts` + `chat-workflow`: 26/26 đạt. Riêng `workflow-prompts.test.ts`: 20 kiểm thử đạt, gồm 3 mới.
  - Chatbox `workflow-prompt-review`: 12/12 đạt (2 lỗi ban đầu do kỳ vọng kiểm thử sai, đã sửa).
  - Chatbox toàn bộ (`chatbox/test`): 65 tệp, 379/379 đạt.
  - Core toàn bộ: 8 lỗi (xem mục 5). Trước đó phiếu 05 ghi 5 lỗi cũ.

## 3. Bằng chứng theo đường khởi chạy
| Đường | Bằng chứng |
|---|---|
| Chạy (`workflowRun`) | Core: `requires review through workflowRun…` (đạt). Chatbox: `keeps edits…`, `marks a draft that became stale…` (đạt). |
| Chạy trong chat (`chatWorkflow`, `runWorkflowInChat`) | Core: `chat route creates one copy…` (đạt). Chatbox: `keeps edits…` dùng `chatWorkflow` (đạt). |
| Chạy lại phần lỗi (`workflowRun` có `retry`) | Core: `reuses the exact approved prompts for retry…` (đạt, mức hàm `prepare`). **Chưa có kiểm thử đầu-cuối qua RPC.** |
| Plan (`runPlan`, nút đi qua `workflowRun` nếu thuộc Plan) | Core: `retains inserted Plan provenance…` (đạt, gồm lưu và chạy). |
| Bỏ qua viết lại (`#bien`/`#ham`, `promptPrepare`) | Core: `prepare-only bypass for language workflows…` (đạt). |
| Lưu bản sao (`workflowPromptSave`) | Core: 3 kiểm thử mới (đạt). Chatbox: 3 kiểm thử mới (đạt). |

## 4. Quyết định và giả định
- Lưu tách hẳn khỏi chạy. Duyệt và chạy ngay không bao giờ ghi bản sao. Ghi chú: RPC chạy cũ với `savePrompts: true` không còn được xử lý; mã cũ nào còn gửi cờ này sẽ không lưu.
- Lưu không chạy, nên sau khi lưu người dùng phải bấm Chạy lại. Lần chạy sau dùng `yaml-v1` đã lưu, không viết lại (đã có kiểm thử).
- Kiểm tra phiên bản khi lưu dựa trên **nguồn nội dung** (`consume`), không phải số phiên bản riêng. Với Plan, thêm kiểm tra `revision` nếu UI gửi kèm.
- Khi lưu thất bại, bản nháp được giữ trên khung ở trạng thái `failed` (chỉ đọc). Người dùng không sửa tiếp được trên đó; muốn duyệt lại phải bấm Chạy.
- Nút "Chèn và chạy" trong hộp thoại chèn mẫu (`TemplateInsertDialog`, có tùy chọn `offerRun`) **không có lệnh gọi nào truyền `offerRun`** (đã kiểm tra `WorkflowPanel` và `PlanCard`). Vì vậy đường này hiện không tới được từ giao diện. Không sửa điều hướng trong lượt này.

## 5. Việc nút sau cần biết
- Nếu nút sau sửa khung hoặc `withPromptReview`, giữ nguyên thứ tự: `decide` → `workflowPromptSave` (giữ khung tới khi xong) hoặc `resume.method` (đóng khung rồi chạy).
- `ReviewState` có thêm `saved` và `failed.review?`. `dismissReviewFailure` đã đổi tên thành `dismissReviewNotice` (không còn tham chiếu cũ trong mã).
- Tên lỗi "hết hiệu lực" do core sinh; phân loại `stale` vẫn dựa vào chuỗi (regex `STALE` trong `workflow-prompt-review.ts`). Thêm "đã đổi" để bắt lỗi revision Plan.
- Kiểm thử core toàn bộ có 8 lỗi (không phải do thay đổi này, đã đối chiếu thông báo):
  - `python-setup` (4), `project-storage` (1): đã ghi nhận ở phiếu 05.
  - `assessment-skills`: thiếu tệp `core/desktop-skills/office-doc-dac-ta/SKILL.md` (ENOENT).
  - `github-files`: build esbuild thất bại.
  - `workflows` "dùng thư mục đầu vào làm thư mục chạy…": **không ổn định**. Chạy riêng 2/2 lần đạt (30/30), nhưng thất bại khi chạy song song toàn bộ bộ kiểm thử.
  - Chưa đối chiếu với bản gốc (chưa stash) nên chưa khẳng định 3 lỗi `assessment-skills`, `github-files`, `workflows` là có sẵn từ trước.

## 6. Việc còn dở hoặc lỗi
- **Chưa kiểm tra trực quan.** Chưa mở ứng dụng: không xem nút "Lưu vào bản sao", trạng thái `saved`, và bố cục khung ở ngưỡng 850 px (vẫn là việc còn dở từ phiếu 05).
- Chưa có kiểm thử đầu-cuối qua RPC cho đường chạy lại phần lỗi (`retry`).
- Chưa thử với model thật; mọi kiểm thử dùng hàm giả.
- Chưa commit. Cây làm việc còn nhiều thay đổi chưa commit từ các bước và phiên khác (không liên quan, không đụng tới).
- Chưa dựng bộ cài, không đẩy mã, không phát hành.
- `WorkflowPanel.tsx` không được sửa vì không có lệnh gọi bỏ qua duyệt; các thay đổi nằm ở khung và core.
