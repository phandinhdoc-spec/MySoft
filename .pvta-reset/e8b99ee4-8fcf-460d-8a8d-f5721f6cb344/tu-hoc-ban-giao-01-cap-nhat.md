# Bàn giao 01 — Đối chiếu lại hiện trạng tự học

Ngày 2026-10-24; Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, bước `buoc-1`. Chỉ khảo sát, không sửa mã hoặc dữ liệu ứng dụng.

## Phạm vi và bằng chứng

Thư mục làm việc và gốc dự án: `/Users/phananh/MySoft`. Nhánh `feature/workflow-directive-editor`, HEAD `a9022fc7b5fe5a7cf0d904d0ae3eda8b00fe2bab`.

Đã có `tu-hoc-ban-giao-01.md`, `02.md`, `03.md`; giữ nguyên, không làm lại triển khai được mô tả trong đó. Phiếu này thay phần hiện trạng đã cũ của phiếu 01 cho lần tiếp tục này. Số test trong phiếu 03 là báo cáo phiên trước, chưa được chạy lại ở đây.

Đọc AGENTS.md, brain.md và cấu hình workspace. Dùng skill codebase-memory, Tier 2: list_projects xác nhận `mysoft-current`; search_graph về Learning/Feedback và queueLearning hết trang (`has_more=false`); trace queueLearning hai chiều sâu 1 hết kết quả. Coverage generation `2026-10-20T03:34:38Z`, fast. Snippet queueLearning trả phạm vi 209–213 hiện chứa mã duyệt prompt khác: graph cũ chỉ dùng định hướng.

Đã kiểm coverage các đường dẫn tài liệu, cấu hình và mã được viện dẫn: storage.ts metadata_match; runtime/types/workflows/feedback-learning/LearningPanel/App và package/vitest metadata_changed; learning-memory và các module learning mới, test mới, phiếu bàn giao not_tracked; docs/feedback-learning.md excluded. Đã đọc nguồn trực tiếp các phạm vi liên quan và tìm chuỗi tại nguồn để đối chiếu. Coverage không có gap không chứng minh đầy đủ. Không reindex, không đọc kho dữ liệu cá nhân thật; không khảo sát toàn bộ add-in/bridge/refine daemon.

## Bản đồ hiện tại

Đường dẫn `runtime.ts` dưới đây là `core/src/desktop/runtime.ts`.

| Khâu | Kết quả xác minh từ nguồn hiện tại |
|---|---|
| Thu nhận Chat | runtime.ts:1477–1480 nhận feedback/praise, habit sau lượt thành công; queueLearning :476–483 chuyển feedback thuộc nhóm chức năng sang inbox mới. `feedback-learning.ts:1–14` ưu tiên feedback, gom praise/habit cùng chat. |
| Queue Chat | runtime.ts:262 đọc mảng `chatbox/learning-queue.json`, reset retries; :475 ghi atomic; :483 giữ tối đa 20 tín hiệu. Đây là queue cũ, không phải envelope v1 mới. |
| Trích xuất Chat | runtime.ts:489–525 chọn model nhẹ, nhường công việc chính, timeout 45 giây, lọc trùng; rule được ghi active và skill qua autoActivateLearnedSkill. |
| Reflect và refine | runtime.ts:413–445 tránh reflect cho chat có functionalGroup, nhưng reflect Chat vẫn tự active; :283–285 refine vẫn có đường tự kích hoạt skill và cập nhật rule. |
| Startup và sửa | runtime.ts:263–269 tự active dữ liệu cũ hợp lệ; :1910–1918 sửa/duyệt rule và skill vẫn áp dụng ngay. `learning-memory.ts:11–26` kiểm hash để tránh ghi đè skill sửa bên ngoài; lỗi giữ proposed. |
| Hook mới | runtime.ts:243 và workflows.ts:140,418 nối observed sau bước workflow; runtime.ts:1480 ghi nháp Plan/workflow, :1779 ghi kết quả bước Plan, :913 ghi search/read riêng. Trạng thái runner không xác minh độc lập chất lượng đầu ra. |
| Inbox mới | runtime.ts:270 mở `chatbox/learning-signals-v1.json`; `learning-signals.ts:10–50` có group, kind, sourceId/sourceVersion, scope IDs, outcome, trạng thái và proposal. :74–87 chống lặp, giữ chưa phân loại; :90–113 chỉ tạo proposal proposed, không kích hoạt. |
| Worker mới | runtime.ts:461–473 dùng model nhẹ, nhường foreground, timeout; :492 chỉ xử lý inbox khi không có batch Chat đủ điều kiện. |
| Áp dụng | runtime.ts:743–745 nạp skill theo load và draft active; :758 chèn learned active khi bật learning, chưa lọc nhóm/project/revision trong biểu thức này. Resolver workflow :243 vẫn kiểm active theo draft cũ. |
| Giao diện | `chatbox/src/LearningPanel.tsx:5–18` đọc learned/learnedDrafts cũ, sửa/xóa và bật/tắt; không có trình quản lí nhóm, import/export, lịch sử/hoàn tác trong component này. `App.tsx:578` gắn panel vào modal learned. `runtime.ts:318` pending vẫn đếm queue cũ. Chưa thao tác UI thật. |

## Các lớp dữ liệu đã có, không tạo lại

- `core/src/desktop/storage.ts:7–26`: state.json version 1, atomic ghi tạm/rename; `types.ts:26–29,66` vẫn giữ Learned/LearnedDraft cũ, chưa có revision/evidence/group trong các kiểu này.
- `learning-registry.ts:8–58,134–155`: hợp đồng riêng có nhóm chat/workflow/research/planning/unclassified, scope, revision, nguồn/bằng chứng, approval/activation và events. :396–418 kiểm revision và scope duyệt. `learning-schema.ts:44–50` định nghĩa nhóm tương ứng.
- `learning-store.ts:85–95,139–200`: kho `learning-v1`, chuẩn bị registry/queue/backup/quarantine qua staging; cùng fingerprint dùng kho hiện có, nguồn đổi từ chối. :245–268 kiểm generation và bất biến lịch sử.
- `learning-migration.ts:19–65`: đầu vào snapshot state/queue/skills; queue mới có schemaVersion và idempotencyKey. Chi tiết chính sách migration xem phiếu 03; phiên này không chạy migration hoặc kiểm lại toàn bộ thuật toán.
- Trong runtime.ts đã tìm toàn tệp không thấy LearningStore hoặc import learning-store/learning-registry/learning-migration. Các đường đang đọc/ghi đã kiểm ở bảng vẫn dùng store cũ và LearningSignals. Đây là bằng chứng giới hạn ở runtime.ts, không phải kết luận mọi consumer trong repo.

## Khoảng trống và việc nối tiếp

1. Không dùng giả định “chưa có JSON/nhóm/hook”: đã có lớp registry và inbox đang dở. Đối chiếu phiếu 02–03 với diff trước khi triển khai tiếp.
2. `docs/feedback-learning.md:12` hiện mô tả tự áp dụng, khớp luồng Chat cũ; khác yêu cầu đề xuất mới phải duyệt. Cần quyết định cutover và bảo toàn legacy, chặn các đường startup/feedback/reflect/refine/edit tự active theo chính sách mới.
3. Inbox mới chưa thay thế registry trong những đường runtime đã kiểm. Cần cầu nối nguồn/bằng chứng → revision proposed → duyệt → selector dùng chung; không coi proposal trong inbox là đã active.
4. Hook research :913 chưa truyền researchSubtype, URL hoặc ngày kiểm chứng vào SignalInput. `learning-signals.ts:83–87` giữ research thiếu subtype ở unclassified; cần phân loại và hợp đồng nguồn trước worker. Không suy snippet là toàn văn hoặc kiến thức đúng.
5. UI hiện chưa hiển thị inbox/registry nhóm; cần RPC/projection, bộ đếm phù hợp, duyệt đúng revision, lịch sử, nhập/xuất và hoàn tác. Kiểm quyền/scope thực tế khi nối; schema riêng không chứng minh nguồn đúng hoặc người duyệt có quyền.

## Thay đổi đang dở phải giữ

Git status đầu phiên: modified `chatbox/src/{WorkflowPanel.tsx,en.json,helpData.ts}`, `chatbox/test/workflow-step-ui.test.ts`, `core/src/desktop/{runtime.ts,types.ts,workflows.ts}`, `core/test/{plans.test.ts,workflow-chat-summary.test.ts}`.

Untracked: `core/src/desktop/learning-{migration,registry,schema,signals,store}.ts`, `workflow-reset.ts`; `core/test/{learning-registry,learning-signals,workflow-reset}.test.ts`; `ke-hoach-viet-lai-xuat-mau-va-xuat-quy-trinh.json`, `quy-trinh-viet-lai-xuat-mau-va-xuat-quy-trinh.json`, các phiếu 01–03. Không reset, checkout, commit, push hoặc sửa các mục này. Snapshot status không phải bản sao nội dung.

## Lệnh kiểm tra cho bước triển khai

Nguồn: scripts trong package.json gốc, chatbox/package.json; vitest.config.ts:3–7.

- `npm test`: pretest check:viet-skill rồi toàn bộ Vitest theo cấu hình.
- `npx vitest run core/test/learning-registry.test.ts core/test/learning-signals.test.ts core/test/feedback-learning.test.ts chatbox/test/learning-panel.test.ts`: bộ tập trung đề nghị; không thay thế toàn bộ test.
- `npm run typecheck`: shared/core/bridge/addin/chatbox; `npm run typecheck -w chatbox` cho giao diện riêng.
- `npm run build:chatbox` hoặc `npm run build` theo phạm vi; `npm run desktop` để thử UI thật sau triển khai.

Phiên này chỉ đọc cấu hình và tên ca test mới, chưa chạy test/typecheck/build/desktop/AI thật. Không xác nhận lại số lỗi cũ. Cần kiểm thử phân nhóm, retry/restart, duyệt revision, migration, giữ file sửa ngoài, import/export và selector khi tích hợp.

## BÀN GIAO

- Đã làm: khảo sát lại luồng thu nhận/lưu/kích hoạt/áp dụng/UI và phát hiện phần triển khai đang dở.
- Kết quả và đường dẫn tệp đã tạo/sửa: chỉ tạo `/Users/phananh/MySoft/tu-hoc-ban-giao-01-cap-nhat.md`; giữ nguyên phiếu 01–03 và mã nguồn.
- Quyết định và giả định: tạo tên mới vì phiếu đích đã tồn tại; phân biệt Chat tự active với inbox proposed và registry riêng.
- Việc nút sau cần biết: dùng hiện trạng phiếu này cùng hợp đồng 02 và triển khai 03; kiểm diff mới trước sửa, không tạo lại lớp dữ liệu hoặc hook đã có.
- Việc còn dở hoặc lỗi: chưa nối duyệt/selector/UI mới trong phạm vi runtime đã kiểm; chưa kiểm thử thực thi. Graph cũ, các kết luận dựa trên nguồn trực tiếp; chưa xác minh toàn repo hoặc dữ liệu người dùng.
