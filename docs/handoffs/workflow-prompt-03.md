# Phiếu bàn giao 03 — Dịch vụ tạo và kiểm tra bản nháp YAML

Ngày: 2026-10-23. Thư mục: /Users/phananh/MySoft. Đọc mã trong lượt này: `core/src/desktop/workflow-prompts.ts`, `core/test/workflow-prompts.test.ts`, `core/src/desktop/runtime.ts` (hàm `reviewWorkflow`, khoảng dòng 186–215), `core/src/desktop/workflow-resources.ts` (`assertStepFiles`).

## 1. Đã làm
- Tách logic bản nháp thành mô-đun thuần `core/src/desktop/prompt-draft.ts`:
  - `parseDraftAnswer`: đọc JSON của model, bỏ hàng rào markdown, kiểm tra bốn mục mô tả (không rỗng, tối đa 4.000 ký tự). Mọi lỗi gắn tên nút và ghi “Chưa chạy; bấm Chạy để thử lại.”
  - `renderDraftYaml`: dựng YAML xác định. Khai báo trống được điền mặc định: nguồn là “Đầu vào quy trình, nếu có” ở nút đầu, “Kết quả các bước cần chờ” ở nút sau; đầu ra lấy từ bản viết lại khi nút chưa khai báo.
  - `verifyDraftYaml`: kiểm tra cấu trúc sau khi dựng: đủ 7 khóa cấp cao, mỗi khóa đúng một lần; khối `yeu_cau_goc` khớp từng dòng với prompt gốc; mọi tệp đính kèm còn được tham chiếu trong `tep`; không vượt 20.000 ký tự.
  - `buildDraft` = parse + render + verify. Lỗi kiểu `DraftError`.
- `core/src/desktop/workflow-prompts.ts`:
  - `rewriteYaml` nay gọi `buildDraft` (API cũ giữ nguyên).
  - `prepare` gọi `assertStepFiles` trước khi gọi model, nên tệp mất được báo ngay và không tốn lượt model.
  - Hàm nội bộ `ask` bọc lỗi model: thành “Nút “X”: mô hình không trả được bản viết lại (…). Chưa chạy…”. Nếu là hủy (signal đã abort), ném lại lý do hủy gốc, không đổi thành lỗi bản nháp.
- Mới `core/test/prompt-draft.test.ts`: 22 kiểm thử. Bao phủ: JSON có hàng rào; không phải JSON; thiếu/rỗng/sai kiểu/quá dài; khai báo trống và khai báo đã có; yêu cầu gốc giữ nguyên từng byte (placeholder `{{input}}`, `{{prev}}`, `/skill`, `#lệnh`, bảng, dòng trống, tab); mất tham chiếu tệp; sửa yêu cầu gốc; thiếu/lặp khóa; quá 20.000 ký tự; nút đủ điều kiện và nút `yaml-v1`; quy trình `#bien` bỏ qua viết lại; lỗi model ở nút sau rồi thử lại thành công; JSON lỗi rồi thử lại; tệp mất không gọi model; hủy giữa chừng không để lại bản nháp; chạy thử qua runtime: lỗi model không tạo lượt chạy (`w.runs` = 0) và chỉ prompt viết lại được gọi.

## 2. Kết quả và đường dẫn tệp
- Mới: `core/src/desktop/prompt-draft.ts`, `core/test/prompt-draft.test.ts`, `docs/handoffs/workflow-prompt-03.md`.
- Sửa: `core/src/desktop/workflow-prompts.ts`.
- Kiểm thử đã chạy:
  - `prompt-draft` + `workflow-prompts`: 39/39 đạt (17 cũ, 22 mới).
  - 16 bộ kiểm thử quy trình liên quan (workflow*, plans, chat-workflow, template*): 216/216 đạt.
  - `npx tsc -p core --noEmit`: exit 0.
- Chưa chạy toàn bộ `core`; báo cáo bàn giao 02 ghi 7 lỗi ngoài phạm vi (python-setup, project-storage, assessment-skills, github-files), chưa đối chiếu lại trong lượt này.

## 3. Quyết định và giả định
- Dùng `DraftError` cho mọi lỗi bản nháp, không đổi kiểu lỗi chung của runtime. Lý do: giữ phạm vi nhỏ; runtime vẫn nhận `Error` thường.
- Bản nháp không tự chạy: `prepare` không gọi `WorkflowRunner`; chỉ `consume` với token duyệt mới cho phép chạy (cơ chế cũ, không đổi).
- Thử lại: mỗi lần `prepare` gọi lại model cho mọi nút cần viết lại; không tái dùng kết quả nút đã thành công trong lần lỗi trước. Chấp nhận được vì số nút ít; có thể tối ưu sau.
- Khai báo trống: backend đã chấp nhận và điền mặc định. Chưa kiểm tra trình soạn giao diện có cho bỏ trống không; đây không thuộc phạm vi bước này.

## 4. Việc nút sau cần biết
- API công khai không đổi: `WorkflowPrompts.prepare/consume/cancel`, `rewriteYaml`, `rewriteSteps`, `promptWorkflow`, `editReviewedPrompt`. `runtime.ts` không cần sửa.
- Để hiển thị lỗi có cấu trúc, có thể kiểm tra `err instanceof DraftError` (từ `prompt-draft.ts`).
- Mọi thông báo lỗi bản nháp đều bắt đầu bằng `Nút “<tên>”:` và kết thúc bằng hướng dẫn thử lại; giao diện có thể hiển thị trực tiếp.
- Nút `promptFormat: 'yaml-v1'` vẫn nằm trong danh sách duyệt, dùng nguyên prompt gốc, không gọi model.

## 5. Việc còn dở hoặc lỗi
- Chưa kiểm thử với model thật; mọi kiểm thử dùng model giả.
- Chưa kiểm thử nhánh hết thời gian (300 giây) của `prepare`.
- Chưa kiểm tra tham chiếu skill (`/ten-skill`) và quy tắc (`#khóa`) có tồn tại; chỉ giữ nguyên văn trong prompt.
- Kiểm tra cấu trúc là kiểm tra chuỗi theo định dạng cố định, không phải phân tích YAML đầy đủ (không có thư viện YAML trong `core`).
- Chưa cập nhật giao diện trình soạn cho khai báo trống; chưa mở ứng dụng; chưa commit.
