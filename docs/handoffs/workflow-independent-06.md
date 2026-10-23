# Phiếu bàn giao 06 — Kiểm thử giao diện: chuyển A→B khi A chưa trả RPC, lỗi và thư viện độc lập

Ngày: 2026-10-23 · Nút 6/8 · Nhận phiếu 05 (chỉ đọc, không dùng lại trạng thái phiên trước).

## 1. Đã làm
- Đọc phiếu 05, `chatbox/src/WorkflowPanel.tsx` (khóa theo ID: `operation`, `runPending`, `libraryOperation`, `libraryPending`, `running`, `select`/`mayLeave`, `run`, `remove`), `chatbox/src/WorkflowBrowser.tsx` (`isRunning`, `busyIds`, `runningIds`), và các kiểm thử giao diện hiện có (`workflow-browser`, `workflow-step-ui`, `step-composer`).
- Thêm `chatbox/test/workflow-independent-ui.test.ts` (5 ca). Giả lập `rpc`; `workflowRun` được giữ chờ bằng promise để mô phỏng "A chưa trả RPC".
- Không sửa mã sản phẩm. Các ca đều đạt ngay lần chạy đầu, nên không có lỗi sản phẩm để sửa.
- Đột biến để chứng minh ca có tác dụng; đã khôi phục tệp và xác nhận bằng `cmp`.

## 2. Kết quả và đường dẫn tệp
- Tệp mới: `chatbox/test/workflow-independent-ui.test.ts`, 5/5 đạt.
- Tệp mới: `docs/handoffs/workflow-independent-06.md` (phiếu này).

| Ca | Nội dung đã kiểm | Kết quả |
|---|---|---|
| 1 | A đang chờ RPC, chuyển sang B: B hiện Chạy, chạy được B; A vẫn Dừng khi quay lại. | Đạt |
| 2 | A bị lỗi RPC: báo lỗi, A về Chạy; B vẫn chạy được. | Đạt |
| 3 | Dừng A chỉ gửi `workflowCancel({id:'A'})`; B vẫn Dừng; A trả RPC muộn thì chỉ A được giải phóng. | Đạt |
| 4 | Khi A và B đang chạy: ghim C được; xóa A bị chặn; xóa C được, không gọi hủy nào. | Đạt |
| 5 | Có thay đổi chưa lưu ở B; chuyển sang A đang chạy: hủy xác nhận thì ở lại B, nội dung giữ nguyên; đồng ý thì sang A, không `workflowSave` cho B. | Đạt |

Kết quả công cụ:
- `npx vitest run chatbox/test/workflow-independent-ui.test.ts`: **5/5 đạt**.
- Nhóm `chatbox/test/workflow*`, `step-composer`, `chat-workflow-card`: **12 tệp, 92/92 đạt**.

Đột biến (đã khôi phục, `cmp` xác nhận khớp):
- Khóa `running` thành toàn cục (`runPending.length>0 ||`): **3 ca fail** (1, 3, 4). Đúng như kỳ vọng.
- Bỏ xác nhận thay đổi chưa lưu (`mayLeave` luôn true): **1 ca fail** (5).

## 3. Quyết định và giả định
- Dùng `vi.stubGlobal('confirm')` để điều khiển hộp xác nhận; `rpc` giả lập, không gọi backend thật.
- Phân biệt ID bằng `title` của mục thư viện (`Quy trình <ID>`) và `aria-label` của menu (`Thao tác quy trình: ...`).
- Kiểm tra "không cập nhật nhầm quy trình" bằng cách xác nhận không có `workflowSave` cho B trong ca 5 và mọi `workflowRun` đúng ID.
- Không đổi mã `WorkflowPanel.tsx`, `WorkflowBrowser.tsx` hay `workflows.ts`.

## 4. Phát hiện
- Mã giao diện hiện tại đã khóa theo ID đúng như mô tả trong dữ kiện: `running` chỉ đọc `runPending` của quy trình được chọn; `libraryPending` và `runPending` tách riêng; `finally` giải phóng đúng ID đã bắt đầu.
- `select` và `mayLeave` không chặn chuyển quy trình khi lượt chạy đang chờ, nên chuyển sang B là hành vi đúng.
- Kết quả RPC muộn của A không đổi quy trình đang mở, vì `run` dùng ID được chụp lúc bắt đầu.

## 5. Việc nút sau cần biết
- Có thể tái dùng `show`, `pending` và `runBtn` trong `workflow-independent-ui.test.ts` làm mẫu cho ca kiểm thử giao diện khác.
- Ca chưa phủ: hủy đúng lúc đang chuẩn bị prompt (`isPreparing`); hai Plan trong một hội thoại; thông báo `promptScope`; thao tác kéo-thả sơ đồ khi chạy song song.
- Khi viết ca "đang chạy", nhớ rằng với nút thường có giai đoạn chuẩn bị prompt chưa được tính trong `running` ở đây.

## 6. Giới hạn chưa kiểm chứng
- Chưa mở ứng dụng, chưa kiểm tra giao diện bằng mắt, chưa build, chưa chạy với backend thật. Các ca dùng DOM jsdom và `rpc` giả lập.
- Chưa kiểm tra vòng đời RPC thật, bản xem trước prompt và quy trình gắn Plan khi chạy đồng thời.
- Tệp kiểm thử mới chưa được git theo dõi; chưa commit.
- Không chạy lại `core`. Năm lỗi `python-setup`/`project-storage` ghi ở phiếu 05 chưa được xác minh lại trong phiên này.

## BÀN GIAO
- **Đã làm:** Thêm 5 ca giao diện cho chuyển A→B khi A chưa trả RPC, lỗi A không khóa B, dừng chọn lọc, thao tác thư viện trên C, và giữ thay đổi chưa lưu. Chạy kiểm thử và đột biến xác nhận các ca có tác dụng. Không sửa mã sản phẩm.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** `chatbox/test/workflow-independent-ui.test.ts` (mới, 5/5 đạt); `docs/handoffs/workflow-independent-06.md` (mới). Nhóm workflow giao diện 92/92 đạt. Đột biến khóa toàn cục làm 3 ca fail; đột biến bỏ xác nhận làm 1 ca fail; tệp `WorkflowPanel.tsx` đã khôi phục và xác nhận khớp.
- **Quyết định và giả định:** Giữ `rpc` giả lập và giữ `workflowRun` chờ bằng promise để mô phỏng RPC chưa trả; điều khiển `confirm` bằng stub toàn cục. Không đổi logic khóa.
- **Việc nút sau cần biết:** Mẫu ca nằm trong file mới (`show`, `pending`, `runBtn`, `menuItem`). Chưa phủ: hủy khi đang chuẩn bị prompt, hai Plan trong một hội thoại, `promptScope`. Giai đoạn chuẩn bị prompt chưa được tính vào `running` ở giao diện.
- **Việc còn dở hoặc lỗi:** Chưa mở ứng dụng, chưa build, chưa kiểm tra bằng mắt, chưa chạy backend thật. Tệp mới chưa commit. Năm lỗi `core` ở phiếu 05 chưa được xác minh lại.
