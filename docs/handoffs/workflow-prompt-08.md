# Phiếu bàn giao 08 — Rà thay đổi cuối, kiểm tra kiểu, kiểm thử và build

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Đầu vào: `docs/handoffs/workflow-prompt-07.md`.
Lượt này **không sửa mã sản phẩm**; chỉ chạy kiểm tra và ghi phiếu này.

## 1. Đã làm
- Đối chiếu `git status`: cây làm việc có rất nhiều thay đổi chưa commit từ nhiều phiên (không chỉ luồng prompt). Không hoàn lại, không stash, không commit.
- Kiểm tra phạm vi của phiếu 07: ba tệp sửa (`README.md` có 47 dòng thêm theo `git diff --stat`; cả ba tệp cộng lại là 80 dòng thêm và 7 dòng xóa) và hai tệp kiểm thử mới đều có mặt. Không tách được riêng phần thay đổi của phiếu 07 khỏi diff các phiên trước, nên **chưa xác nhận được** thay đổi không ghi đè công việc khác ở mức từng dòng.
- Kiểm tra kiểu (xem mục 2).
- Chạy kiểm thử nhóm liên quan luồng prompt và toàn bộ `core` + `chatbox`.
- Build giao diện chatbox bằng `vite build`.

## 2. Kết quả và đường dẫn tệp
Lệnh và kết quả (đã chạy trong lượt này):

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit -p core` | exit 0 |
| `npx tsc --noEmit -p chatbox` (và `tsc --noEmit` trong `chatbox/`) | exit 0 |
| `npx vitest run` trên 10 tệp liên quan (gồm `workflow-prompt-integration`, `workflow-prompt-state`, `workflow-prompts`, `workflow-prompt-review`, `prompt-draft`, `workflow-resources`, `workflows`, `workflow-zoom`, `workflow-links`, `workflow-approval`) | 10/10 tệp, **141/141 kiểm thử đạt** |
| `npx vitest run core chatbox` | 166/168 tệp đạt; **1294 đạt, 5 lỗi, 1 bỏ qua** (tổng 1300) |
| `vite build` trong `chatbox/` | **Đạt** (`✓ built in 674ms`; có cảnh báo chunk > 500 kB và `INEFFECTIVE_DYNAMIC_IMPORT`, không phải lỗi) |

5 lỗi nằm ở hai tệp, giống phiếu 07:
- `core/test/python-setup.test.ts` (4): "Bộ công cụ PVTA không hoạt động. Hãy cài lại ứng dụng." Dấu hiệu môi trường thiếu bộ Python đóng gói.
- `core/test/project-storage.test.ts` (1): `EEXIST: /tmp/PVTA-Ket-qua/answer.txt`. Dấu hiệu thư mục tạm dùng chung, không phải lỗi luồng prompt.

Chưa đối chiếu với bản gốc, nên **chưa khẳng định** đây là lỗi có sẵn. Không dùng `git stash` vì sẽ xáo trộn thay đổi chưa commit.

Tệp đã tạo/sửa trong lượt này: chỉ `docs/handoffs/workflow-prompt-08.md` (mới).

## 3. Quyết định và giả định
- Không sửa mã vì không có lỗi mới nào được xác nhận.
- Các lỗi môi trường được ghi nhận, không gộp vào kết luận "đạt".

## 4. Đối chiếu yêu cầu đã duyệt
| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Rà thay đổi cuối đúng phạm vi, không ghi đè công việc khác | **Chưa đạt trọn vẹn** | Chỉ kiểm được sự tồn tại của tệp; diff chung lẫn nhiều phiên |
| Kiểm tra kiểu | **Đạt** | tsc core và chatbox exit 0 |
| Kiểm thử | **Đạt một phần** | Nhóm liên quan 141/141; toàn bộ còn 5 lỗi môi trường chưa đối chiếu gốc |
| Build | **Đạt** | `vite build` của chatbox |
| Giao diện desktop cửa sổ rộng và hẹp | **Chưa thực hiện** | Không có công cụ điều khiển ứng dụng desktop trong phiên |
| Thử luồng model thật | **Chưa thực hiện** | CLI `claude`, `codex`, `agy` có trên máy nhưng chưa chạy luồng quy trình thật; không gọi model để giả kết quả |
| Báo cáo tệp, kết quả, tình huống trực quan, giới hạn | **Đạt** (phiếu này) | — |

Điều kiện hoàn thành **chưa đạt đầy đủ**: hai mục giao diện và model thật chưa kiểm chứng.

## 5. Việc nút sau cần biết
- Để thử giao diện: mở PVTA Chat desktop, kiểm tra khung duyệt ở cửa sổ rộng và ở mức 850 px (chuyển sang màn hình xem trước riêng khi hẹp). Ghi kết quả vào phiếu mới.
- Để thử model thật: dùng một quy trình nhỏ có nút viết lại, duyệt, lưu bản sao, chạy lại.
- Khi đổi thông điệp lỗi trong `core/src/desktop/runtime.ts` hoặc `workflow-prompts.ts`, cập nhật regex `STALE` trong `chatbox/src/workflow-prompt-review.ts`.

## 6. Việc còn dở hoặc lỗi
- **Chưa kiểm tra giao diện desktop** ở cửa sổ rộng và hẹp, kể cả nút "Lưu vào bản sao" và trạng thái `saved`.
- **Chưa chạy luồng model thật.** Mọi kiểm thử dùng engine giả.
- Chưa xác minh 5 lỗi môi trường với bản gốc.
- Chưa kiểm chứng bằng đột biến.
- Chưa rà diff theo từng dòng để chứng minh không ghi đè thay đổi của phiên khác.
- Chưa commit. Không đẩy mã, không phát hành.

## BÀN GIAO
- **Đã làm:** Kiểm tra kiểu core và chatbox; chạy 141 kiểm thử nhóm prompt; chạy toàn bộ core+chatbox; build chatbox. Không sửa mã sản phẩm. Chưa kiểm tra giao diện desktop, chưa chạy model thật.
- **Kết quả và đường dẫn tệp đã tạo/sửa:** Mới: `docs/handoffs/workflow-prompt-08.md`. Kết quả: tsc exit 0 (core, chatbox); 141/141 nhóm prompt đạt; core+chatbox 1294 đạt, 5 lỗi (`python-setup` 4, `project-storage` 1), 1 bỏ qua; `vite build` đạt.
- **Quyết định và giả định:** Không sửa mã vì không có lỗi mới được xác nhận. Coi 5 lỗi là lỗi môi trường đến khi đối chiếu được với bản gốc.
- **Việc nút sau cần biết:** Ưu tiên kiểm tra giao diện desktop rộng/hẹp và một luồng model thật. Giữ đồng bộ regex `STALE` với thông điệp lỗi.
- **Việc còn dở hoặc lỗi:** Giao diện và model thật chưa kiểm chứng; chưa đối chiếu 5 lỗi với bản gốc; chưa rà diff từng dòng; chưa commit.
