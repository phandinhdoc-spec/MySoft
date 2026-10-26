# Bàn giao 02 cập nhật — Hợp đồng tự học theo chức năng

Ngày 2026-10-24; Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 2. Đây là thiết kế, không phải thông báo đã tích hợp vào ứng dụng.

## Căn cứ và thứ tự sử dụng

Đọc [phiếu 01 gốc](tu-hoc-ban-giao-01.md), [phiếu 01 cập nhật](tu-hoc-ban-giao-01-cap-nhat.md), [hợp đồng 02](tu-hoc-ban-giao-02.md) và [phiếu triển khai 03](tu-hoc-ban-giao-03.md). Giữ nguyên các phiếu đó. Hợp đồng cho bước tiếp theo gồm **phiếu 02 gốc cộng bản cập nhật này**; khi khác nhau, quyết định trong bản cập nhật này được ưu tiên. Không tạo lại schema/migration đã có.

Đã dùng skill codebase-memory, Tier 2, xác nhận project `mysoft-current` đúng `/Users/phananh/MySoft`. Search graph trong learning-registry trả 0 kết quả, hết trang; coverage generation `2026-10-20T03:34:38Z`, các đường dẫn khảo sát đều not_tracked. Vì vậy đọc nguồn trực tiếp: `learning-registry.ts:8–155` (kiểu bản ghi), `learning-schema.ts:1–100` (schema nền), toàn bộ `learning-signals.ts` (inbox), `learning-migration.ts:19–65` (queue/migration). Các đường dẫn mã này thuộc `core/src/desktop/`. Không có symbol graph để trace/snippet đáng tin cậy trong phạm vi mới; không kết luận toàn repo từ kết quả rỗng.

Hiện trạng runtime/UI và vị trí kho lấy từ phiếu 01 cập nhật/03, chưa kiểm lại runtime ở nút này. Số test trong phiếu 03 là kết quả phiên trước. Đã xem git status; không sửa các thay đổi đang dở.

## Quyết định tương thích và chuyển tiếp

1. **Trước cutover:** giữ luồng Chat đang tự kích hoạt theo hiện trạng; inbox workflow/research/planning chỉ thu nhận và tạo đề xuất. Không sửa hành vi Chat trong nút thiết kế này, không mở rộng ngoại lệ Chat cho nhóm mới.
2. **Sau cutover đồng bộ:** mọi đề xuất mới trong registry, kể cả Chat, phải qua duyệt. Ngoại lệ `basis:legacy` chỉ dành cho dữ liệu đã active trước migration được xác minh, giới hạn chat/global và thời hạn theo mục 9 phiếu 02. Giữ nguyên nguồn cũ và không bịa người duyệt. Đây là đích triển khai, chưa phải hành vi hiện tại.
3. Chỉ cutover sau khi nối đủ writer, dịch vụ duyệt, bộ chọn, nạp skill, startup/refine và UI; không kích hoạt riêng registry trong khi consumer cũ vẫn có thể bỏ qua duyệt. Nếu chưa đạt, tiếp tục chế độ chuẩn bị; không dual-write thiếu giao dịch.
4. Vị trí đích là `<desktopDirectory>/learning-v1/learning-registry.json` theo phiếu 03, thay vị trí dự kiến trong phiếu 02. `schemaVersion:1` độc lập với `DesktopData.version`, `revision`, `generation`.
5. Registry, queue migration và inbox tín hiệu là **ba hợp đồng khác nhau dù cùng mang schemaVersion 1**. Bộ đọc phải chọn theo loại kho/đường nhập đã biết, không chỉ nhìn số phiên bản. Không đổi tên inbox thành registry hoặc ghép thẳng các mảng items.

## Nhóm, nguồn học và điều kiện dùng

| Nhóm | Nguồn học | Skill / rules riêng | Phạm vi mặc định; điều kiện |
|---|---|---|---|
| chat | Lời sửa/dặn, lời khen cụ thể, thói quen có quan sát truy nguyên | Skill diễn đạt theo sở thích; rule không suy sở thích từ lời AI/tài liệu | Chat nguồn; nâng project/global phải duyệt. Ngoại lệ Chat cũ chỉ theo chính sách chuyển tiếp |
| workflow | Thiết kế có revision, sửa nút, run/step và kiểm tra artifact | Skill chia nút, hợp đồng đầu ra, phụ thuộc, phục hồi; rule chống chạy lặp, kiểm checkpoint | Workflow nguồn; phân biệt design với execution; kết luận đầu ra đúng cần kiểm tra độc lập |
| research | Yêu cầu tìm, tài liệu đã đọc, phiên bản, phản hồi đối chiếu | Skill tìm nguồn sơ cấp/đối chiếu phiên bản; rule ghi nguồn/ngày, xác minh lại | Chat hoặc project có nguồn; subtype legal/news/professional bắt buộc. Snippet không thay toàn văn |
| planning | Plan có revision, chỉnh kế hoạch, kiểm định, kết quả bước | Skill khảo sát/chia bước/nguồn lực; rule tách dữ kiện–giả định, duyệt–chạy, dự kiến–kết quả | Plan nguồn; approval của Plan không phải approval của bài học |
| unclassified | Thiếu/mâu thuẫn context hoặc subtype | Không có tài nguyên thực thi | Chỉ lưu proposed; chặn duyệt và áp dụng đến khi phân loại/phạm vi rõ |

Các skill/rules ở bảng là nội dung đề xuất, không phải tài nguyên đã tạo. Chu kỳ rà soát đề xuất giữ như phiếu 02: chat 180 ngày, workflow/planning/professional 90 ngày, legal 30 ngày, news 1 ngày; legal/news factual kiểm lại mỗi lần dùng. Nhiều nhóm chọn hạn sớm nhất. Đây là chính sách sản phẩm, không bảo đảm nguồn đúng trong thời hạn.

## Hợp đồng bản ghi và phiên bản

Giữ nguyên tên trường/union đã có trong `learning-registry.ts`; định nghĩa đầy đủ tại mục 3–4 phiếu 02:

- Envelope: `schemaVersion`, `registryId`, `generation`, `groups`, `lessons`, `skills`, `rules`, `sources`, `evidence`, `events`, `migration`.
- Lesson/skill/rule dùng UUID ổn định, revision nguyên dương liên tiếp, previousRevision; thời điểm UTC, actor; classification; scope; sourceIds/evidenceIds; review; reviewDueAt; supersedes; legacyRef; extensions. Tham chiếu tài nguyên dùng `{kind,id,revision}` chính xác.
- Group dùng ID cố định, revision, enabled, allowedSourceKinds, skillRefs/ruleRefs và policy. Danh mục nhóm không cấp quyền kích hoạt; unclassified không bao giờ là context thực thi.
- Lesson có statement, claimKind, limitations, relatedLessonRefs. Rule có key/title/text, lessonRefs, conflictKey, trigger. Skill có name/description/bodyMarkdown, lessonRefs/dependencyRefs và artifact relativePath/hash.
- Source bất biến có kind, locator, version, capturedAt, excerpt tối thiểu đã che dữ liệu và privacy. Evidence nối source, claim, kind, result, verifiedAt/By, method. Không sửa nguồn cũ khi nội dung thay đổi.
- Event append-only: UUID, sequence, transactionId, actor/time, action, target revision, from/toStatus, reason, relatedRefs. Payload revision bất biến; review là trạng thái được kiểm chứng bằng lịch sử. Record và event ghi chung giao dịch có CAS generation.
- Scope đóng: global/project/chat/workflow/plan/unresolved; trường ID bắt buộc theo kind. Không coi ID có hình dạng đúng là đối tượng tồn tại hay quyền truy cập hợp lệ. Không tự chuyển unresolved thành global.

Không thêm trường top-level vào v1 để tiện nối inbox. Metadata cầu nối có thể lưu trong `extensions` với namespace `pvta:signal`; phải kiểm ngữ nghĩa, không dùng metadata đó để bỏ qua duyệt. Thay cấu trúc không tương thích cần phiên bản schema mới và migration rõ ràng.

## Cầu nối inbox → registry

Đây là hợp đồng phải triển khai, chưa khẳng định đã có adapter:

| Inbox hiện có | Đích/điều kiện chuyển |
|---|---|
| id, key, sourceId, sourceVersion | Lưu dấu vết `pvta:signal`; tạo UUID source riêng của registry. sourceId inbox không mặc nhiên là UUID source registry |
| group, researchSubtype | Chuyển classification khi metadata đáng tin cậy; thiếu subtype research hoặc nhiều context chưa phân giải → unclassified |
| chatId/projectId/workflowId/planId | Chọn scope hẹp nhất xác minh được; không có đích hợp lệ → unresolved |
| feedback | user_feedback chỉ khi xác minh được messageId và lời người dùng; thiếu thì giữ inbox chờ bổ sung |
| draft | workflow_design hoặc plan_revision khi có đối tượng và revision thật; không biến hash sourceVersion thành revision số |
| execution | workflow_run khi có workflowId/runId/stepId và locator cần thiết; kết quả Plan cần nguồn Plan và liên kết kiểm định riêng, không giả workflowId |
| search/read | Chỉ tạo web_document khi có URL, metadata đọc và phiên bản/ngày theo hợp đồng; search snippet phải ghi readState snippet |
| outcome succeeded/failed/interrupted | Ghi trạng thái quan sát ở nguồn; không tự tạo evidence passed cho chất lượng đầu ra |
| proposal.status proposed, proposal.rule | Tạo lesson và rule proposed liên kết; approval/activation null; không chép sang ruleBook luôn áp dụng |
| status processed | Chỉ worker đã xử lí; không đồng nghĩa đã chuyển registry, đã duyệt hoặc active |

Nguồn không đủ locator bắt buộc thì **giữ nguyên inbox**, không bịa trường để qua schema. Cho phép bài học proposed chưa đủ evidence trong registry khi source hợp lệ, nêu limitations rõ; bộ duyệt vẫn chặn. Nội dung inbox đã bị che/cắt không được gọi là bản nguồn đầy đủ hoặc chứng cứ duy nhất cho một kết luận thực nghiệm.

Idempotency: trước giao dịch, tìm dấu vết inbox ID/key và phiên bản nguồn trong extensions; cùng tín hiệu đã chuyển thì trả refs cũ. Ghi source/evidence/lesson/rule/events trong một transaction; chỉ đánh dấu chuyển sau commit. Crash sau commit, retry tra lại dấu vết, không tạo bản sao. duplicateOf là gợi ý trùng nội dung cùng scope, không phải thêm một quan sát độc lập; nguồn mới được bổ sung qua revision mới, không âm thầm sửa bản đã duyệt.

## Chọn nhóm, nhiều nhóm và xung đột

Context do ứng dụng xác định theo công đoạn thực tế, không lấy nhóm từ lời model hay từ khóa. `signalGroup` hiện trả unclassified khi không có đúng một nhóm; giữ hành vi bảo thủ này ở inbox. Registry vẫn cho nhiều groupIds sau khi người dùng phân loại rõ. Không tự chọn workflow chỉ vì research nằm trong một workflow.

Nếu một nội dung dùng được cho nhiều nhóm với cùng scope/bằng chứng/hạn, duyệt toàn bộ groupIds và chèn một lần khi context giao nhóm. Nếu khác scope hoặc tiêu chí chứng cứ, tách record, dùng chung nguồn và liên kết bài học. Thêm nhóm hoặc mở scope tạo revision mới và duyệt lại.

Trùng chính xác chỉ gộp trong cùng loại/nhóm/scope; không đếm lại một source thành nhiều bằng chứng. conflictKey chỉ tìm ứng viên. Khi xác nhận mâu thuẫn giữa hai tài nguyên học trong vùng áp dụng giao nhau, chặn cả hai tại vùng giao, yêu cầu quyết định theo revision và ghi conflict_resolve. Không tự lấy bản mới hơn, scope hẹp hơn hay nhiều bằng chứng hơn. Quy tắc người dùng hiện tại thắng nội dung tự học.

## Chuyển trạng thái và bộ chọn

`proposed → approved → active`: người dùng duyệt đúng revision/nhóm/scope, nguồn/evidence đủ, hạn còn hiệu lực, không xung đột; chọn Dùng phải kiểm lại và materialize skill thành công. Nút gộp Chấp nhận và dùng vẫn ghi hai sự kiện. Lỗi ghi skill giữ approved, báo lỗi thật.

`active → suspended`: hết hạn, mất nguồn/phụ thuộc, hash lệch, xung đột hoặc tạm dừng. Bộ chọn chặn ngay, không đợi scheduler. Bật lại cùng revision chỉ khi duyệt cũ còn hiệu lực và nguyên nhân đã giải quyết. Sửa nội dung/nguồn/evidence/scope/nhóm/hạn hoặc khôi phục tạo revision mới proposed, ngừng bản cũ theo chính sách phiếu 02. Rejected/archived không tự hồi sinh qua restart/import/retry.

Bộ chọn dùng chung kiểm schema/ref → context/nhóm bật → revision active hiện hành → scope/quyền → approval hoặc ngoại lệ legacy hợp lệ → hạn/nguồn/evidence/phụ thuộc/xung đột → hash skill. Gọi skill trực tiếp cũng phải qua bộ chọn. Không chèn lesson và rule tương ứng hai lần; không cắt rule để vừa ngân sách prompt.

## JSON mẫu và tiêu chí kiểm tra

Mẫu đầy đủ source/evidence/lesson proposed ở mục 7 phiếu 02 vẫn áp dụng. Các khối dưới đây là **fragment hoặc ca kiểm tra**, không phải registry hoàn chỉnh hay dữ liệu người dùng. Không nhập trực tiếp chúng vào kho. Thời gian fixture cố định chỉ có ý nghĩa tại thời điểm kiểm thử được đặt tương ứng.

Fragment hợp lệ để gắn vào lesson proposed của mẫu cũ: đa nhóm, scope đã xác minh trong fixture; chưa đủ để áp dụng.

```json
{
  "classification": {"state":"classified","groupIds":["workflow","planning"],"researchSubtype":null,"reason":"Cùng quy tắc phân biệt dự kiến với kết quả."},
  "scope": {"kind":"project","projectId":"fixture-project"},
  "review": {"status":"proposed","approval":null,"activation":null},
  "extensions": {"pvta:signal":{"inboxId":"fixture-signal","sourceId":"fixture-source","sourceVersion":null}}
}
```

Fragment hợp lệ để lưu chưa phân loại; phải từ chối duyệt và áp dụng:

```json
{
  "classification":{"state":"unclassified","groupIds":["unclassified"],"researchSubtype":null,"reason":"Chưa phân giải công đoạn research trong workflow."},
  "scope":{"kind":"unresolved","reason":"Chưa xác minh đối tượng nguồn."},
  "review":{"status":"proposed","approval":null,"activation":null}
}
```

Ca cố ý sai về ngữ nghĩa, dù JSON hợp lệ: approval revision 1 không duyệt revision 2. Không tự chữa approval; phải từ chối với lỗi chỉ đúng trường.

```json
{
  "revision":2,
  "previousRevision":1,
  "review":{
    "status":"active",
    "approval":{"revision":1,"by":"fixture-user","at":"2026-10-24T03:00:00Z","groupIds":["planning"],"scope":{"kind":"project","projectId":"fixture-project"}},
    "activation":{"revision":2,"at":"2026-10-24T03:01:00Z","basis":"approval","artifactHash":null}
  }
}
```

Tiêu chí bổ sung cho ma trận mục 8 phiếu 02:

| Ca | Kết quả bắt buộc |
|---|---|
| Đa nhóm đã duyệt đủ, cùng scope | Chèn một lần ở context phù hợp; không rò sang project khác |
| Research thiếu subtype hoặc thiếu URL nguồn | Chưa phân loại/chờ bổ sung; không bịa nguồn, không factual active |
| Runner succeeded nhưng chưa kiểm artifact | Chỉ ghi quan sát, không evidence artifact_check passed |
| Inbox processed nhưng chưa adapter commit | Không hiển thị đã duyệt/đã áp dụng |
| Retry sau commit registry trước khi cập nhật inbox | Tìm refs cũ, không tạo trùng nguồn/bài học/event chuyển đổi |
| Tín hiệu mới có cùng rule và khác nguồn | Không tăng số quan sát của nguồn cũ; bổ sung bằng revision có truy nguyên |
| Cùng schemaVersion nhưng sai loại kho | Từ chối đưa queue/inbox vào registry reader |
| Chat trước/sau cutover | Trước giữ cơ chế cũ; sau không có writer cũ tự active đề xuất mới |
| Import active/approval từ ngoài | Chỉ provenance; chuyển proposed, duyệt cục bộ lại |
| Phiên bản lạ/ID trùng khác nội dung/ref treo | Từ chối hoặc cách li có lý do; không ghi đè kho đang dùng |

Schema chỉ kiểm cấu trúc; validator ngữ nghĩa kiểm ref/revision; dịch vụ kiểm danh tính, quyền, tính đủ của nguồn và transaction; bộ chọn kiểm điều kiện tại lúc dùng. Không coi validation thành bằng chứng chuyên môn đúng. Giữ backup/quarantine, migration idempotent, export có che dữ liệu và restore tạo revision mới theo mục 9 phiếu 02; không sửa SKILL.md ngoài quyền sở hữu registry.

## Kiểm chứng và giới hạn

Chỉ tạo tài liệu này, không sửa code/schema/skill, không chạy migration hoặc thay Plan trong ứng dụng. Đối chiếu tên trường với nguồn hiện có và phân biệt các yêu cầu dịch vụ còn phải triển khai. Kiểm cú pháp JSON của các ví dụ không tương đương chạy validator trên registry đầy đủ. Không chạy test/build/desktop/AI thật cho thay đổi tài liệu; không xác nhận lại kết quả test của phiên trước.

## BÀN GIAO

- Đã làm: cập nhật hợp đồng nhóm, phiên bản, nguồn/bằng chứng, duyệt, hạn, xung đột và cầu nối inbox; thêm ví dụ hợp lệ, sai và chưa phân loại.
- Kết quả và đường dẫn tệp đã tạo/sửa: chỉ tạo `/Users/phananh/MySoft/tu-hoc-ban-giao-02-cap-nhat.md`; giữ nguyên phiếu 01–03 và mã đang dở.
- Quyết định và giả định: dùng phiếu 02 gốc cùng bản cập nhật này; giữ Chat trước cutover, sau cutover đề xuất mới phải duyệt; registry/queue/inbox không hoán đổi được.
- Việc nút sau cần biết: không tạo lại lớp dữ liệu; đọc phiếu 03 và diff hiện tại, nối adapter idempotent và dịch vụ duyệt/bộ chọn. Thiếu locator nguồn thì giữ inbox chờ bổ sung.
- Việc còn dở hoặc lỗi: chưa triển khai adapter/cutover/UI, chưa kiểm thử thực thi. Graph chưa bao phủ mã mới; bằng chứng bước này là nguồn đọc trực tiếp và các phiếu có nêu giới hạn.
