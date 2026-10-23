# Phiếu bàn giao 08 — Kiểm tra kiểu, kiểm thử, build và kịch bản A/B/C

Ngày: 2026-10-23 · Nút 8/8 · Nhận phiếu 07 (chỉ đọc, không dùng lại trạng thái phiên trước).

## 1. Đã làm
- Đọc phiếu 07 và rà lại các điểm mã liên quan đến chạy, hủy, khóa, sửa, xóa:
  - `core/src/desktop/workflows.ts`: `jobs` theo ID (dòng 153); chặn chạy trùng (dòng 233); `cancel(id)` (dòng 187); `acquire` khóa ghi chung (dòng 169); xóa khỏi `jobs` trong `finally` (dòng 441).
  - `core/src/desktop/runtime.ts`: kiểm tra theo đúng ID trước khi sửa, ghim, xóa, chạy (dòng 1311, 1354, 1361, 1408); `workflowCancel` (dòng 1435).
- Chạy kiểm tra kiểu, kiểm thử và build (kết quả bên dưới).
- Chạy một kịch bản A/B/C ở cấp bộ chạy bằng script tạm trong `/tmp/pvta-abc-check/` (ngoài repo, đã dùng `tsx`).
- Không sửa mã sản phẩm ở bước này. Không commit, không đẩy mã, không phát hành.

## 2. Kết quả kiểm tra
| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Kiểu `shared` | `npx tsc -p shared` | Đạt (exit 0) |
| Kiểu `core` | `npx tsc -p core` | Đạt (exit 0) |
| Kiểu `chatbox` | `npm run typecheck -w chatbox` | Đạt (exit 0) |
| Kiểm thử quy trình và hướng dẫn | `vitest run` 4 tệp: `core/test/workflows.test.ts`, `chatbox/test/workflow-independent-ui.test.ts`, `chatbox/test/help-brain.test.ts`, `chatbox/test/workflow-browser.test.ts` | 42/42 đạt |
| Build giao diện | `npm run build:chatbox` (vite) | Vite báo `built in 720ms`; cảnh báo chunk lớn và dynamic import không hiệu quả, không làm lỗi build |
| Toàn bộ `core/test` + `chatbox/test` | `vitest run core/test chatbox/test` | 1305 đạt, 1 bỏ qua, **5 lỗi** (2 tệp) |

Năm lỗi nằm ở `core/test/python-setup.test.ts` (4) và `core/test/project-storage.test.ts` (1). Không thuộc phạm vi quy trình đồng thời. Chưa đối chiếu với mã gốc, nên chưa khẳng định chúng có sẵn từ trước. Phiếu 05 ghi số lỗi khác (2 và 7), nên số liệu cũ không đồng nhất.

## 3. Kịch bản A/B/C (cấp bộ chạy, script tạm)
Dùng `WorkflowRunner` với mô hình giả có thể điều khiển thời điểm hoàn tất. A, B là quy trình chỉ đọc; C là quy trình thứ ba.

| Kiểm tra | Kết quả |
|---|---|
| A và B khởi chạy đồng thời | Cả hai gọi mô hình (`calls = [A, B]`); `isRunning(A)`, `isRunning(B)` đều `true` |
| Chạy trùng A khi A đang chạy | Bị chặn: `Quy trình này đang chạy.` |
| Dừng A | A kết thúc `cancelled`; B vẫn `isRunning` = `true` |
| Sau đó hoàn tất B | B kết thúc `success`; `activeCount()` = 0 |
| C không chạy | `isRunning(C)` = `false` |

Kiểm tra sửa/xóa C khi A và B đang chạy chỉ được xác minh bằng đọc mã: các điều kiện trong `runtime.ts` chỉ kiểm tra đúng ID của quy trình đang thao tác. **Chưa chạy qua RPC thật** nên chưa kiểm chứng đầy đủ.

Kiểm thử có sẵn `workflows.test.ts` dòng 172–185 cũng xác nhận: hủy một nhánh không làm nhánh khác mất trạng thái; khi một bước ghi đang giữ khóa, quy trình khác bị chặn và nhánh đang chờ khóa bị hủy không gọi mô hình.

## 4. Rủi ro phát hiện (chưa sửa)
1. **Khóa ghi chung làm hai quy trình ghi không chạy song song.** Nếu A và B đều có bước `access: 'full'`, B phải chờ A. Đây là thiết kế đã chốt trong phiếu 01 (không bỏ khóa khi chưa xác minh nguy cơ ghi đè). Cần nói rõ với người dùng: "chạy đồng thời" chỉ đúng với bước chỉ đọc.
2. **Quy trình gắn Plan: Dừng có thể hủy cả lượt chat.** Tại `runtime.ts` dòng 1435, `workflowCancel` với quy trình có `planId` gọi `jobs.get(chatId).abort()` và `return true`, không gọi `workflows.cancel(id)`. Nên Dừng có thể dừng toàn bộ lượt Plan của hội thoại, vi phạm yêu cầu "dừng chỉ tác động quy trình được chọn". **Chưa kiểm chứng bằng thử nghiệm.**
3. **Chặn chạy theo trạng thái Plan.** Dòng 188: quy trình gắn Plan không chạy được khi hội thoại của Plan đang bận, kể cả do việc khác.
4. Nút Dừng khi khung xem trước đang chờ duyệt: vẫn chưa kiểm chứng (đã ghi trong phiếu 07).

## 5. Quyết định và giả định
- Không sửa mã trong bước này: kiểm thử và build chỉ để xác nhận trạng thái hiện tại.
- Coi kịch bản A/B là đã kiểm chứng ở cấp bộ chạy; kịch bản RPC và giao diện là chưa kiểm chứng.
- Không coi 5 lỗi `core` là do thay đổi này; chưa đối chiếu với mã gốc để tránh `git stash` trên cây làm việc đang có nhiều thay đổi.

## 6. Giới hạn còn lại (chưa kiểm chứng)
- Chưa mở ứng dụng Tauri, chưa kiểm tra giao diện bằng mắt, chưa bấm nút Dừng/Xóa/Sửa thật.
- Chưa chạy RPC `workflowRun`/`workflowCancel`/`workflowDelete` qua bridge thật.
- Chưa chạy với mô hình AI thật; chưa đo tải nhiều quy trình.
- Chưa kiểm chứng quy trình gắn Plan khi chạy đồng thời (rủi ro 2).
- Chưa đối chiếu 5 lỗi `core` với mã gốc.
- Build chỉ kiểm tra bundle giao diện; chưa dựng bộ cài desktop (`build:desktop`).
- Cây làm việc còn nhiều thay đổi không liên quan chưa commit; chưa commit ở bước này.

## BÀN GIAO
- **Đã làm:** Chạy typecheck `shared`, `core`, `chatbox` (đạt); 42 kiểm thử quy trình và hướng dẫn (đạt); build chatbox bằng vite (thành công); kiểm thử toàn bộ `core` và `chatbox` (1305 đạt, 5 lỗi); kịch bản A/B/C ở cấp bộ chạy (A và B chạy đồng thời, dừng A không dừng B, C không bị ảnh hưởng). Không sửa mã sản phẩm.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `docs/handoffs/workflow-independent-08.md` (mới). Script tạm `/tmp/pvta-abc-check/abc.mts` nằm ngoài repo.
- **Quyết định và giả định:** Khóa ghi chung giữ nguyên, nên hai quy trình ghi không chạy song song. Coi kịch bản A/B là đạt ở cấp bộ chạy; RPC, giao diện và Plan là chưa kiểm chứng.
- **Việc nút sau cần biết:** Cần sửa `runtime.ts` dòng 1435 để Dừng quy trình Plan không hủy cả lượt chat, sau đó thêm kiểm thử hồi quy. Cần xác minh 5 lỗi `core` với mã gốc trước khi bàn giao phát hành. Cần kiểm tra trên ứng dụng: nút Dừng, Sửa, Xóa khi có quy trình khác đang chạy.
- **Việc còn dở hoặc lỗi:** Chưa mở ứng dụng, chưa thử RPC thật, chưa thử AI thật, chưa dựng bộ cài. Năm lỗi `core` (`python-setup`, `project-storage`) chưa rõ nguồn gốc. Chưa commit.
