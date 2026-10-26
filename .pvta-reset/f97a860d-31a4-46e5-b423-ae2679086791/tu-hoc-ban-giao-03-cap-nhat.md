# Bàn giao 03 cập nhật — Kiểm chứng lớp dữ liệu tự học

Ngày 2026-10-24. Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 3.
Đầu vào: `tu-hoc-ban-giao-02.md` và `tu-hoc-ban-giao-02-cap-nhat.md`.
Giữ nguyên `tu-hoc-ban-giao-03.md`; phiếu này ghi phần bổ sung và kết quả chạy mới, không thay lịch sử phiên trước.

## Hiện trạng và thay đổi

Lớp schema, registry, migration, store và kiểm thử đã tồn tại khi bắt đầu. Không tạo lại, không ghi dữ liệu cá nhân thật, không cutover. Các thay đổi runtime/UI/quy trình đang dở được giữ nguyên.

- `core/src/desktop/learning-migration.ts`: thêm `validateLegacyLearningBundle`, kiểm cấu trúc state/queue/skills và đường dẫn skill có thể phục hồi an toàn; từ chối trước chuyển đổi/công bố. Bản ghi legacy lỗi vẫn được cách li riêng theo cơ chế hiện có, giữ nguyên nguồn.
- `core/src/desktop/learning-store.ts`: kiểm bundle cả khi chạy lại; đọc lại và đối chiếu chính xác cả registry, queue, quarantine, backup ở staging trước rename công bố. Backup JSON hỏng hoặc sai cấu trúc báo lỗi rõ ràng trước tạo thư mục phục hồi. Không nâng trạng thái duyệt.
- `core/src/desktop/learning-registry.ts`: chấp nhận namespace dấu hai chấm như `pvta:signal` trong hợp đồng cập nhật, đồng thời giữ namespace dấu chấm cũ. Đây chỉ là kiểm tên namespace, chưa phải xác minh metadata cầu nối hay locator nguồn.
- `core/test/learning-registry.test.ts`: thêm ca dữ liệu staging sai nhưng thao tác ghi không báo lỗi, retry/phục hồi sau lỗi, đường dẫn backup không an toàn, backup hỏng, namespace mới và từ chối queue đưa nhầm vào registry.

SchemaVersion của registry/queue vẫn là 1, không thay DesktopData.version. Bổ sung kiểm tra không tạo approval hoặc đưa nhóm mới vào thực thi.

## Kiểm chứng trong lượt này

- `npx vitest run core/test/learning-registry.test.ts core/test/learning-signals.test.ts core/test/feedback-learning.test.ts`: **83 ca đạt**. Có kiểm chuyển đổi lặp lại, lỗi ghi/rename, CAS, không nâng duyệt, phục hồi nguyên văn và từ chối JSON sai.
- `npm run typecheck`: đạt shared/core/bridge/addin/chatbox.
- `npm test`: **248 tệp đạt, 10 tệp lỗi; 2.218 ca đạt, 17 lỗi, 3 bỏ qua**. Không kết luận toàn repo sạch.
- `git diff --check`: đạt đối với diff tracked; các module tự học còn untracked, đã được compiler/test và Prettier kiểm tra.

Nhật ký: `/tmp/pvta-step3-focused.log`, `/tmp/pvta-step3-typecheck.log`, `/tmp/pvta-step3-full.log`.

Lỗi toàn repo theo kết quả: community thiếu skill; e2e (2) và prompts thiếu effort; skills-bundled vượt giới hạn nội dung; skills-server thiếu pvta-word; workflow-step-ui (4) gồm dữ liệu skills undefined và tham số workflowSave khác mong đợi; chat-workflow khác thông báo retry; plans nhận active thay proposed; project-storage gặp EEXIST; python-setup (4) lỗi runtime/thông báo. Chưa chẩn đoán gốc tất cả; không sửa hoặc gọi chúng là lỗi có sẵn chỉ dựa vào lịch sử.

## Phục hồi và chuyển tiếp

Kho chuẩn bị: `<desktopDirectory>/learning-v1/`. Nguồn state/queue/SKILL.md không bị ghi đè. Dừng writer cũ trước snapshot/cutover thật.

`LearningStore.exportRecovery(destinationMới)` kiểm cấu trúc/hash rồi xuất nguyên văn nguồn. Đích đã tồn tại bị từ chối. Nếu có `RECOVERY-INCOMPLETE.txt`, không sử dụng thư mục đó; xử lí lỗi và xuất sang đích mới. Đối chiếu nội dung với nguồn trước thay dữ liệu chạy. Nếu đã phát sinh dữ liệu mới, bảo toàn chúng và lập phương án chuyển ngược; không chép snapshot cũ đè trực tiếp.

`COMMIT_UNCERTAIN`: đọc lại kho/generation trước retry. `MIGRATION_SOURCE_CHANGED`: dừng, không ghi đè. Khóa tồn dư cần xác minh writer đã dừng trước xử lí. Các kiểm thử dùng lỗi I/O mô phỏng, chưa kiểm mất điện/crash thật.

Graph Tier 2: `mysoft-current`, generation `2026-10-20T03:34:38Z`; tìm symbol mới không có kết quả và coverage báo not_tracked. Đã đọc nguồn trực tiếp; không dùng graph cũ để kết luận đầy đủ.

## BÀN GIAO

- Đã làm: củng cố kiểm bundle, staging và phục hồi; giữ cơ chế schema/version/migration hiện có.
- Kết quả và đường dẫn tệp đã tạo/sửa: ba module và test nêu trên; tạo `tu-hoc-ban-giao-03-cap-nhat.md`, giữ phiếu 03 cũ.
- Quyết định và giả định: chỉ hoàn thiện lớp dữ liệu chuẩn bị, không tự cutover hay duyệt; giữ mọi thay đổi ngoài phạm vi.
- Việc nút sau cần biết: nối adapter inbox idempotent, xác minh metadata/locator, dịch vụ duyệt và bộ chọn; nối đủ writer/consumer trước kích hoạt kho.
- Việc còn dở hoặc lỗi: 17 lỗi toàn repo; chưa tích hợp runtime/UI, chuyển dữ liệu thật, build desktop hoặc thử AI thật. Chưa commit/push.
