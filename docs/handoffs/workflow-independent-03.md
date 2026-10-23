# Phiếu bàn giao 03 — Kết quả bất đồng bộ theo ID đã bắt đầu

Ngày: 2026-10-23 · Nút 3/8 · Đã sửa `WorkflowPanel.tsx`, kiểm tra kiểu và kiểm thử cục bộ. Chưa commit, chưa build, chưa mở ứng dụng.

## 1. Rà soát cờ chờ còn lại
- `runPending` (theo ID), `operation` (Set theo ID), `libraryPending` (theo ID), `libraryOperation` (Set theo ID): đã đúng từ phiếu 02.
- `WorkflowBrowser.tsx`: không còn cờ chung; `isRunning` chỉ đọc `runningIds`, `busyIds` và trạng thái của chính mục đó. Không cần sửa.
- `running` trong `WorkflowPanel` chỉ mô tả quy trình đang chọn (`saved`). Đây là đúng: nút Chạy/Dừng/Sửa của quy trình đang chọn chỉ phản ánh chính nó.
- Chỗ còn sai: các thao tác bất đồng bộ áp kết quả vào quy trình **đang chọn** lúc trả về, không phải quy trình đã bắt đầu. Đã sửa bên dưới.

## 2. Thay đổi (`chatbox/src/WorkflowPanel.tsx`)
- **Ref mới** `selRef`, `dirtyRef`, `versionRef`: đọc trạng thái mới nhất sau `await`; `versionRef` tăng mỗi lần `edit` và `history`.
- **`openIfIdle(newId, fromId, doneText)`**: chỉ chuyển lựa chọn sang bản mới khi người dùng vẫn ở quy trình đã bắt đầu và không có thay đổi chưa lưu. Nếu không, chỉ báo thông báo, không chuyển.
- **`save()`**: chỉ xóa cờ bẩn khi vẫn cùng quy trình và nội dung không đổi trong lúc lưu. Trước đây `setDirty(false)` vô điều kiện, nên sửa trong lúc lưu có thể bị mất khỏi bản nháp.
- **`run()`**: nếu nội dung đổi trong lúc lưu thì không chạy bản cũ, báo yêu cầu chạy lại. `setOpenRun('')` chỉ khi vẫn đang chọn quy trình đó.
- **`remove(target)`**: chặn xóa khi `target` đang trong `operation` hoặc có lượt `running`. Chỉ hỏi "Bỏ thay đổi" khi xóa chính quy trình đang chọn (trước đây hỏi cả khi xóa quy trình khác, và câu hỏi không bỏ gì). Sau `await`, bỏ lựa chọn bằng hàm cập nhật theo `target.id`.
- **`duplicate`**: bỏ `mayLeave` không cần thiết (không đổi lựa chọn trước khi xong); chuyển sang bản sao qua `openIfIdle`.
- **`create`, `loadTemplate`, chèn mẫu (`onDone`)**: chuyển sang kết quả qua `openIfIdle`.

**Không đổi:** `workflowRun`/`workflowCancel` theo ID; khóa đọc/ghi chung (`workflows.ts`); `WorkflowBrowser.tsx`; core.

## 3. Kiểm chứng
- `npx tsc --noEmit -p chatbox`: exit 0.
- `npx vitest run chatbox/test`: 387/387 đạt (từ thư mục gốc).
- Bốn tệp workflow UI (31 test) đạt.

## 4. Tình huống đã phân tích (chưa tái hiện bằng kiểm thử)
Các tình huống làm cập nhật nhầm hoặc mất bản nháp, đã chặn trong mã:
1. Sửa A trong lúc `save()` của A chạy: trước đây cờ bẩn bị xóa, bản nháp bị thay bằng bản đã lưu khi `updatedAt` đổi. Nay cờ giữ nguyên.
2. Nhân bản A, sửa A trong lúc chờ, rồi `setSelId(copy)` xong: trước đây chuyển lựa chọn và bỏ bản nháp A. Nay không chuyển nếu còn thay đổi.
3. Xóa B khi A có thay đổi chưa lưu: trước đây hỏi "Bỏ thay đổi" dù không liên quan. Nay không hỏi.
4. Xóa B trong lúc B đang chuẩn bị/chạy: nay chặn ở giao diện bằng `operation`/`running` của chính B.

## 5. Quyết định và giả định
- Khi kết quả đến mà có thay đổi chưa lưu, không chuyển lựa chọn; báo "chọn trong thư viện để mở". Đánh đổi này để không mất bản nháp.
- Với "Tạo mới" và "Nhập mẫu" đã xác nhận bỏ thay đổi, việc chuyển vẫn bị chặn nếu còn `dirty`. Hành vi an toàn hơn xác nhận cũ; cần thầy cô xác nhận có chấp nhận không.
- Chuỗi thông báo mới (chưa đối chiếu với `en.json`): "Nội dung đã đổi trong lúc lưu…", "Dừng quy trình trước khi xóa.", "Đã tạo quy trình mới.", "Có thay đổi chưa lưu nên chưa mở…".

## 6. Việc nút sau cần biết
- Chưa có kiểm thử cho các nhánh `await` này: `WorkflowPanel` không có harness render. Muốn kiểm chứng cần tách logic (`openIfIdle`, guard lưu theo phiên bản) ra hàm thuần, hoặc dựng kiểm thử component.
- `runPlan` (runtime.ts ~1489–1560) và `normalizeWorkflow` vẫn chưa đọc đầy đủ, như phiếu 02 đã nêu.
- Khoảng trống khung hình chuyển đổi (phiếu 01 mục 6.7) vẫn mở: `draft.id` lấy từ closure lúc bấm.
- `onResolveLink` và `stageAction` vẫn gọi `save()` chung. Đã an toàn nhờ guard trong `save()`, nhưng chưa kiểm tra từng nơi.
- `TemplateInsertDialog` dựa vào dialog modal để giả định `selRef.current` không đổi giữa lúc mở và lúc xong.

## 7. Giới hạn chưa kiểm chứng
- Chưa mở ứng dụng, chưa thao tác chuột, chưa kiểm tra trực quan.
- Chưa build, chưa chạy `core` (không đổi core ở bước này).
- Chưa commit.

## BÀN GIAO
- **Đã làm:** Rà soát cờ chờ (chỉ còn theo ID, `WorkflowBrowser` đã đúng). Sửa các thao tác bất đồng bộ áp kết quả vào quy trình đang chọn: `save` (cờ bẩn), `run` (lưu đổi giữa chừng), `remove` (hỏi và bỏ lựa chọn sai), `duplicate`/`create`/`loadTemplate`/chèn mẫu (chuyển lựa chọn không kiểm tra thay đổi).
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `chatbox/src/WorkflowPanel.tsx` (sửa); `docs/handoffs/workflow-independent-03.md` (mới). `tsc --noEmit -p chatbox` exit 0; `vitest run chatbox/test` 387/387 đạt. Chưa có kiểm thử riêng cho nhánh bất đồng bộ mới.
- **Quyết định và giả định:** Không chuyển lựa chọn khi còn thay đổi chưa lưu. `save` chỉ xóa cờ khi nội dung không đổi. `run` không chạy bản cũ nếu đổi trong lúc lưu. Xóa chặn theo `operation`/`running` của chính mục đó.
- **Việc nút sau cần biết:** Cần kiểm chứng nhánh `await` (tách hàm thuần hoặc kiểm thử component). Đọc `runPlan` và `normalizeWorkflow`. Kiểm tra chuỗi thông báo mới trong `en.json`. Khoảng trống khung hình chuyển đổi (phiếu 01, mục 6.7) vẫn mở.
- **Việc còn dở hoặc lỗi:** Chưa mở ứng dụng, chưa build, chưa commit, chưa xác minh giao diện bằng mắt; chưa tái hiện lỗi trên mã cũ để chứng minh các sửa trên đúng nguyên nhân.
