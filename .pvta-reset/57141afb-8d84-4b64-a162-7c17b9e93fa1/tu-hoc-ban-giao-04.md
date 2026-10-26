# Bàn giao 04 — Nguồn tín hiệu tự học theo chức năng

Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 4, ngày 2026-10-24.
Đã đọc phiếu 03 gốc, 03 cập nhật và hợp đồng 02 cập nhật. Các hook runtime, inbox và test tín hiệu đã có khi vào phiên; đã đọc, kiểm thử và sửa bổ sung, không tạo lại hay ghi đè thay đổi khác.

## Luồng đã xác minh

| Nhóm | Nguồn và hành vi |
|---|---|
| workflow | Runtime nối `WorkflowRunner.started/observed`; bắt đầu chạy ngắt bộ học, kết thúc bước lưu run/step, trạng thái và hash. Mã bị chọn không chạy được ghi draft. Lượt thiết kế cũng ghi draft. |
| planning | Lượt soạn ghi draft/unverified; bước Plan thực thi ghi execution với plan/run/step và hash. Công bố kế hoạch không được coi là chạy thành công. |
| research | Vòng công cụ web ghi search/read riêng với chat, message trong sourceId, hash tham số và hash kết quả; luôn unverified. Thiếu subtype thì chờ phân loại, không gọi AI học. |
| Chat | Giữ queue/bộ học cũ cho Chat thông thường. Phản hồi nhóm chức năng đi inbox riêng; không tự kích hoạt proposal vào learned hoặc skill. |

Điểm nối: `core/src/desktop/runtime.ts` (constructor, captureSignal, functionalGroup, learnSignalNext, queueLearning, vòng công cụ web, send, vòng chạy Plan); `core/src/desktop/workflows.ts` (started/observed). Inbox: `core/src/desktop/learning-signals.ts`, tại `<home>/chatbox/learning-signals-v1.json`, độc lập registry và queue migration.

Inbox giữ nguồn, thời điểm, loại tín hiệu, scope, phiên bản hash và trạng thái; che liên hệ, đường dẫn, khóa trong text trước ghi. Mỗi lần trích chỉ gửi một quan sát; model nhẹ đã cấu hình, chỉ chạy khi rảnh. Thiếu model giữ pending; bị ngắt giữ interrupted không tăng retries, restart tiếp tục; lỗi xử lý tối đa ba lần trước chờ retry. Kết quả chỉ proposed. Trùng quy tắc chỉ liên kết trong cùng scope; không bỏ nguồn quan sát.

## Sửa bổ sung trong phiên

- `runtime.ts`: web trong Plan/thiết kế workflow dùng ngữ cảnh ứng dụng, chuyển unclassified khi chồng nhóm. Nhận diện research theo search/read kể cả bản ghi chưa phân loại, giữ phản hồi tiếp theo khỏi Chat.
- `runtime.ts`: reflectDigest chỉ lấy Plan trong lượt hiện tại; không kéo kết quả Plan cũ vào phản tỉnh Chat mới.
- `learning-signals.ts`: subtype tham gia khóa trùng; cho phép lưu quan sát đã bổ sung subtype sau quan sát chưa rõ loại. Vẫn nhận khóa inbox cũ để tránh tạo trùng sau nâng cấp.
- `core/test/learning-signals.test.ts`: thêm bốn ca cho các ranh giới trên, gồm tương thích khóa cũ và luồng Chat thông thường.

## Kiểm chứng

- Trước sửa: bộ registry/signals/feedback **83 ca đạt**.
- Sau sửa cuối: cùng bộ **87 ca đạt** (`/tmp/pvta-step4-focused.log`). Bao gồm đúng nhóm/chồng nhóm, thiếu subtype, draft không thành công, che dữ liệu, trùng nguồn, cách li hội thoại, thiếu model, nhường foreground, ngắt/restart, retries và lỗi ghi.
- `npm run typecheck`: đạt năm workspace; sau sửa cuối chạy lại `npx tsc -p core --noEmit`, đạt. `git diff --check`: đạt.
- `npm test`: **248 tệp đạt, 10 tệp lỗi; 2221 ca đạt, 17 lỗi, 3 bỏ qua** (`/tmp/pvta-step4-full.log`). Lần này trước bổ sung ca tương thích khóa cuối; bộ tập trung sau đó đã chạy lại.
- Lỗi: community thiếu skill (1); e2e/prompts thiếu effort (3); skills-bundled quá dài (1); skills-server thiếu pvta-word (1); workflow-step-ui thiếu skills/map và khác payload (4); chat-workflow khác thông báo retry (1); plans active thay proposed (1); project-storage EEXIST (1); python-setup lỗi runtime/thông báo (4). Chưa chẩn đoán gốc đầy đủ; không sửa ngoài phạm vi.

Graph Tier 2 `mysoft-current`, generation `2026-10-20T03:34:38Z`: search/trace/snippet/coverage; mã đã đổi hoặc not_tracked, snippet lệch dòng. Đã đọc trực tiếp phạm vi liên quan và kiểm chỗ gọi bằng tìm kiếm nguồn; không suy tính đầy đủ từ graph cũ.

## BÀN GIAO

- Đã làm: xác minh nguồn từng nhóm, sửa phân loại chồng ngữ cảnh, tương thích loại trùng và cách li phản tỉnh.
- Kết quả và đường dẫn tệp đã tạo/sửa: ba tệp mã/test nêu trên và `tu-hoc-ban-giao-04.md`.
- Quyết định và giả định: giữ chế độ inbox chuẩn bị, Chat cũ, không tự duyệt hoặc cutover; succeeded chỉ là trạng thái runner, không chứng nhận chất lượng đầu ra.
- Việc nút sau cần biết: nối adapter idempotent, dịch vụ duyệt và selector theo phiếu 02 cập nhật. Hash/chuỗi mô tả không thay locator và bằng chứng đầy đủ; research hiện chưa lưu URL/toàn văn trong inbox, thiếu metadata phải giữ chờ bổ sung, không bịa nguồn. Chưa có UI phân loại subtype.
- Việc còn dở hoặc lỗi: 17 lỗi toàn repo; chưa thử desktop/AI thật, crash thật, chuyển dữ liệu thật hoặc build bộ cài. Không commit/push. Giữ nguyên thay đổi ngoài phạm vi.
