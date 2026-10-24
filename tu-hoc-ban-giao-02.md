# Bàn giao 02 — Hợp đồng dữ liệu tự học theo chức năng

Ngày: 2026-10-24. Plan: `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 2.
Đầu vào: [tu-hoc-ban-giao-01.md](tu-hoc-ban-giao-01.md).
Trạng thái: thiết kế để triển khai; không phải schema, migration hay tính năng đã chạy trong PVTA. Chỉ tạo tài liệu này, không sửa mã nguồn hoặc dữ liệu người dùng.

## 1. Căn cứ và quyết định tương thích

Đã đọc toàn bộ phiếu 01 và brain.md; đối chiếu trực tiếp docs/feedback-learning.md, core/src/desktop/types.ts:26–29 và core/src/desktop/storage.ts:1–26. Tài liệu tự học hiện ghi tự dùng và sửa có hiệu lực ngay; kiểu cũ có `proposed | approved | active | rejected`, nhưng không có nhóm, revision hay bằng chứng duyệt theo phiên bản. DesktopStore dùng `version:1`, giữ các trường dữ liệu khác và ghi atomic. Đây là những điểm xác minh lại ở bước này. Các đường runtime/startup/refine và UI lấy từ khảo sát ở phiếu 01, chưa khảo sát lại toàn bộ.

Graph Tier 2, project `mysoft-current`, gốc `/Users/phananh/MySoft`, generation `2026-10-20T03:34:38Z`, fast. Đã gọi list_projects, index_status và check_index_coverage cho các nguồn trên: phiếu 01/brain chưa tracked, docs bị excluded, types metadata_changed, storage metadata_match. Đã đọc trực tiếp nguồn liên quan thay vì tin chỉ mục cũ. Không có kết luận đầy đủ toàn repo.

**Giải quyết khác biệt với yêu cầu mới:** giữ luồng thu nhận Chat; mọi đề xuất mới ở cả Chat và ba nhóm mới phải qua duyệt. Dữ liệu cũ đang active không bị xóa hoặc giả mạo thành “đã duyệt”. Nó được quản lí bằng ngoại lệ migration có giới hạn ở mục 9. Không đổi `DesktopData.version` thành phiên bản của mô hình tự học.

Không hợp nhất tự học này với thư mục Học hỏi/RAG dự án hoặc Learner Office. Không mặc định skill có trong thư mục là được phép áp dụng. Không mở rộng phạm vi chỉ vì nguồn xuất hiện trong một hội thoại.

## 2. Nhóm và tiêu chí áp dụng

ID nhóm cố định: `chat`, `workflow`, `research`, `planning`, `unclassified`. Nhóm chưa phân loại chỉ là nơi giữ đề xuất, không phải nhóm áp dụng. Nhóm không đồng nghĩa với dự án, backend hoặc model.

| Nhóm | Nguồn học được phép | Skill đề xuất | Rules đề xuất | Phạm vi mặc định và tiêu chí |
|---|---|---|---|---|
| chat | Lời sửa/dặn của người dùng, lời khen cụ thể, yêu cầu lặp lại; giữ ngưỡng praise/habit hiện có | Áp dụng phong cách trả lời đã được chỉ rõ | Không suy ra sở thích từ câu trả lời AI hoặc nội dung tài liệu | Chat nguồn; chỉ nâng thành project/global khi duyệt rõ; không chứa dữ liệu riêng |
| workflow | Bản thiết kế, phản hồi chỉnh nút, run/step result, artifact và lỗi đã xác minh | Phân tích đầu vào/đầu ra, phụ thuộc, kiểm định, phục hồi | Không coi bản thiết kế là lần chạy thành công; chống lặp; kiểm tra checkpoint trước thử lại | Workflow nguồn; bài học về kết quả chạy phải có runId/stepId và kết quả kiểm tra; bài học thiết kế ghi đúng loại design |
| research | Yêu cầu tìm nguồn, trang đã đọc, phiên bản tài liệu, phản hồi đối chiếu | Tìm nguồn gốc, đối chiếu phiên bản, phân biệt nguồn sơ cấp/thứ cấp | Lưu nguồn và ngày kiểm tra; kiểm tra lại thông tin biến động; không coi snippet là toàn văn | Chat/project nguồn; bắt buộc subtype legal/news/professional; thiếu nguồn hoặc phiên bản cần thiết thì chưa áp dụng |
| planning | Bản Plan có revision, phản hồi chỉnh kế hoạch, kiểm định và kết quả từng bước | Khảo sát dữ kiện, chia bước, phụ thuộc, nguồn lực, phản biện | Tách dữ kiện/giả định; duyệt kế hoạch không phải cho chạy; kế hoạch không phải kết quả | Plan nguồn; phải tham chiếu revision; khẳng định kết quả cần chứng cứ thực thi |
| unclassified | Tín hiệu thiếu metadata, nguồn legacy không rõ, phân loại mâu thuẫn | Chưa gán skill thực thi | Không tự áp dụng hoặc tự chuyển global | Chỉ lưu/quản lí, chờ người dùng phân loại |

Các skill/rules trên là định hướng nội dung, chưa tạo tài nguyên có hiệu lực. Dữ liệu nguồn luôn là dữ liệu không tin cậy; duyệt bài học không cấp quyền công cụ hoặc vượt quy tắc người dùng.

## 3. Envelope, ID và kiểu dùng chung

Đề xuất lưu một snapshot JSON riêng `learning-registry.json` trong vùng dữ liệu desktop hiện có; đây là vị trí thiết kế, chưa tạo tệp dữ liệu đó. Snapshot là nguồn chuẩn cho tự học mới. Envelope bắt buộc:

| Trường | Kiểu và điều kiện |
|---|---|
| schemaVersion | Integer, chính xác `1` cho hợp đồng này; độc lập với revision và DesktopData.version |
| registryId | UUID ổn định của kho cục bộ |
| generation | Integer >= 1, tăng khi transaction thành công; dùng compare-and-swap chống ghi đè |
| groups, lessons, skills, rules | Mảng record có phiên bản; không chứa ID/revision trùng |
| sources, evidence | Mảng bản ghi bất biến có ID |
| events | Mảng sự kiện append-only, có sequence liên tục trong registry |
| migration | null hoặc object ghi migrationId, sourceFingerprint, completedAt và ánh xạ legacy |

ID record mới là UUID; ID nhóm là enum cố định. ID cũ được giữ trong `legacyRef:{store,kind,id}` và ánh xạ sang UUID, không tái sử dụng ID đã xóa. Import gặp trùng ID nhưng khác nội dung không ghi đè. Khóa phiên bản là `{id, revision}`; revision integer >= 1, không dùng thời gian làm revision. Các tham chiếu nội bộ đều trỏ phiên bản chính xác, không trỏ ngầm tới “latest”.

Thời gian là RFC 3339 UTC có hậu tố Z, phải parse được. Trường bắt buộc nhưng chưa biết ghi null chỉ khi hợp đồng cho phép; không dùng chuỗi rỗng thay null. Chuỗi ID không được chứa đường dẫn. Mảng nhóm/tham chiếu không trùng. JSON Schema triển khai dùng Draft 2020-12, object đóng (`additionalProperties:false`); dữ liệu mở rộng chỉ ở `extensions` được đặt tên theo namespace và không tham gia áp dụng.

### Record chung cho lesson/skill/rule

Mọi record bắt buộc: `id`, `revision`, `previousRevision` (null ở bản đầu, còn lại là revision ngay trước), `createdAt`, `createdBy:{kind:user|model|system,id}`, `classification`, `scope`, `sourceIds`, `evidenceIds`, `review`, `reviewDueAt`, `supersedes`, `legacyRef`, `extensions`. Hai trường cuối mặc định null và `{}`; `supersedes` là mảng ref phiên bản của record khác bị thay thế, mặc định rỗng. Không tạo chu trình thay thế/phụ thuộc.

- `classification:{state:classified|unclassified,groupIds:[],researchSubtype:null|legal|news|professional,reason}`. Classified có ít nhất một nhóm, không chứa unclassified. Unclassified có đúng `["unclassified"]`, subtype null và reason không rỗng. Có research thì subtype bắt buộc, không có research thì subtype null. Một bản ghi bao trùm nhiều subtype research phải tách thành các bản ghi khác nhau.
- `scope` là union đóng: `{kind:global}`, `{kind:project,projectId}`, `{kind:chat,chatId,projectId:null|string}`, `{kind:workflow,workflowId,projectId:null|string}`, `{kind:plan,planId,chatId,projectId:null|string}`, `{kind:unresolved,reason}`. Không được có trường đích thừa hoặc thiếu. Scope unresolved không đủ điều kiện duyệt/kích hoạt. Các ID phải tồn tại hoặc được giữ trong vùng nhập chờ ánh xạ.
- `review:{status,approval,activation}`. Status: `proposed|approved|active|suspended|rejected|archived`. Approval null hoặc `{revision,by,at,groupIds,scope}`; by phải là người dùng cục bộ được xác thực, không lấy danh tính từ lời model. GroupIds/scope phải khớp record đã duyệt. Activation null hoặc `{revision,at,basis:approval|legacy,artifactHash:null|string}`. Bản mới proposed có approval/activation null.
- `reviewDueAt`: thời điểm bắt buộc đối với approved/active; proposed có thể null. Đến hạn thì bộ chọn chặn ngay dù background job chưa đổi status; giao diện hiển thị cần rà soát. Gia hạn bằng revision mới, duyệt lại. Không chỉ sửa timestamp để giữ bản duyệt cũ.
- `sourceIds`/`evidenceIds` có thể rỗng ở proposed thiếu dữ liệu, nhưng không ở approved/active mới. Nguồn migration là ngoại lệ riêng, không được đóng giả bằng chứng thực nghiệm.

Nội dung từng revision bất biến. `review` là projection hiện tại từ events, không sửa payload đã duyệt; lịch sử phải dựng lại được trạng thái. Edit nội dung, nhóm, scope, nguồn, bằng chứng, hạn rà soát hoặc dependency luôn tạo revision mới, không chỉ sửa review.

### Trường riêng

| Loại | Trường bắt buộc bổ sung |
|---|---|
| Group | `id` enum, `revision`, `previousRevision`, `title`, `enabled`, `allowedSourceKinds`, `skillRefs`, `ruleRefs`, `policy:{reviewRequired:true,reviewIntervalDays,verifyEachUse}`, `updatedAt`; group là cấu hình do ứng dụng/người dùng quản lí, không do model tự sửa |
| Lesson | `title`, `statement`, `claimKind:preference|procedure|factual|execution`, `limitations` (mảng chuỗi), `relatedLessonRefs` (mảng ref) |
| Skill | `name`, `description`, `bodyMarkdown`, `lessonRefs` (ít nhất một), `dependencyRefs`, `artifact:{relativePath,expectedExistingHash}` |
| Rule | `key`, `title`, `text`, `lessonRefs` (ít nhất một), `conflictKey`, `trigger:automatic|explicit`; automatic vẫn phải qua mọi điều kiện nhóm/phạm vi/duyệt |

Group refs là danh mục, không có quyền kích hoạt. Rule không tự chép vào ruleBook always; skill không tự bật load. lessonRefs là nguồn lí do của tài nguyên; không chèn statement và text hai lần vào prompt. Dependency phải là skill/rule chính xác, được duyệt và đủ điều kiện trong cùng ngữ cảnh. `relativePath` phải nằm trong skillsDir sau chuẩn hóa và kiểm symlink; từ chối `..`, đường dẫn tuyệt đối, trùng tên không thuộc sở hữu registry. expectedExistingHash null chỉ hợp lệ khi tệp chưa tồn tại.

## 4. Nguồn, bằng chứng và lịch sử

Source bắt buộc: `id`, `kind:user_feedback|user_request|workflow_design|workflow_run|web_document|plan_revision|legacy_snapshot`, `capturedAt`, `locator`, `version`, `excerpt`, `privacy:{redacted:boolean,exportable:boolean}`. excerpt là đoạn tối thiểu đã che dữ liệu, không lưu toàn bộ hội thoại mặc định. version là mã/hash nguồn hoặc null có lí do trong locator. Nguồn bất biến; nội dung nguồn đổi thì tạo sourceId mới.

Locator theo kind:

- user_feedback/user_request: chatId, messageId; workflow/plan context thêm khi có bằng chứng liên kết.
- workflow_design: workflowId, revision; workflow_run: workflowId, runId, stepId, outcome, artifactRefs. Không suy outcome từ lời AI.
- plan_revision: planId, revision, chatId; không dùng approved của Plan làm approval bài học.
- web_document: url, title, publisher, retrievedAt, verifiedAt (nullable), publishedAt (nullable), documentVersion (nullable), effectiveFrom/effectiveTo (nullable), jurisdiction (nullable), sourceClass:primary|secondary|unknown, readState:snippet|full|partial. URL phải là http/https; truy xuất lại vẫn chịu quyền và bảo vệ mạng của ứng dụng.
- legacy_snapshot: migrationId, legacyStore, legacyId, originalStatus (nullable), fingerprint; không tạo người duyệt hoặc ngày xác minh giả.

Evidence bắt buộc: `id`, `sourceId`, `kind:explicit_preference|repeated_observation|artifact_check|source_check|plan_review|legacy_capture`, `claim`, `locator`, `result:passed|failed|unverified`, `verifiedAt` (nullable), `verifiedBy` (actor hoặc null), `method`. Passed cần thời điểm, người/bộ kiểm tra và phương pháp thật. Model tự nói “đạt” không đủ thành artifact_check passed. Failed là bằng chứng hợp lệ cho bài học về thất bại, không phải xác nhận nội dung đề xuất đúng; khi duyệt phải có bằng chứng hỗ trợ kết luận sửa sai.

Research factual legal: phải có nguồn sơ cấp đã đọc đoạn liên quan, phiên bản văn bản và kiểm tra hiệu lực theo ngày/phạm vi sử dụng. Không biết ngày hiệu lực được giữ null nhưng chặn áp dụng kết luận pháp lí phụ thuộc hiệu lực. News lưu ngày sự kiện trong locator nếu xác định được, phân biệt ngày đăng; mỗi lượt dùng cần xác minh lại. Professional lưu ấn bản/phiên bản hoặc ngày truy cập và giới hạn nguồn. Quy tắc phương pháp “kiểm tra lại nguồn” không cần tự mang một văn bản pháp luật, nhưng cần bằng chứng cho bài học quy trình.

Event bắt buộc: `id`, `sequence`, `transactionId`, `at`, `actor`, `action`, `target:{kind,id,revision}`, `fromStatus`/`toStatus` (nullable), `reason`, `relatedRefs`. Action: create, revise, classify, approve, activate, suspend, reject, archive, restore, migrate, import, conflict_resolve, group_update. Revision snapshot giữ nguyên; event không chứa bí mật. Ghi record và event trong một transaction. Không xóa lịch sử khi hoàn tác; restore tạo revision mới từ bản cũ và quay về proposed.

Lịch sử cục bộ hỗ trợ truy vết, không được quảng cáo là chống sửa giả mạo. Import events chỉ làm provenance, không tự nhận là hành động duyệt cục bộ.

## 5. Chọn nhóm, nhiều nhóm và xung đột

1. Xác định context tác vụ từ metadata thật: Chat thông thường, workflow design/run, research, planning. Không chỉ dựa vào từ khóa, mode viết hay tên model. Một lượt có thể có nhiều context nhưng áp dụng theo công đoạn cụ thể.
2. Tách tín hiệu thành bài học nguyên tử. Một lời sửa về tìm nguồn trong bước workflow có thể tạo hai bài học khác nhau dùng chung source; không sao chép toàn câu thành quy tắc cho mọi nhóm.
3. Metadata rõ thì gợi ý group; thiếu hoặc mâu thuẫn thì unclassified. Model phân loại chỉ tạo proposed. Người dùng duyệt cả nhóm lẫn phạm vi.
4. Một record nhiều nhóm chỉ dùng khi cùng một nội dung, phạm vi, bằng chứng và hạn rà soát phù hợp cho tất cả nhóm. Áp dụng theo giao không rỗng với nhóm công đoạn hiện tại, chèn một lần; duyệt phải bao phủ tất cả groupIds. Nếu nhóm cần scope hoặc chính sách khác nhau thì tách ID và liên kết relatedLessonRefs.
5. Scope mặc định hẹp nhất có nguồn xác thực; không có đối tượng hợp lệ thì unresolved. Nâng scope cần revision mới và giải thích đã loại dữ liệu riêng. Scope global không bỏ lọc nhóm.
6. Trùng đúng nội dung chuẩn hóa + nhóm + scope + loại thì gộp đề xuất bằng chứng dưới revision mới; không cộng một sourceId thành nhiều quan sát. Gợi ý gần trùng cần người dùng xử lí, không tự xóa.
7. conflictKey chỉ giúp tìm ứng viên; không chứng minh hai rules hòa hợp. Quy tắc người dùng hiện tại luôn thắng bài học. Với hai tài nguyên tự học mâu thuẫn và scope giao nhau: chặn cả hai trong vùng giao, ghi conflict và yêu cầu chọn/sửa; không tự chọn bản mới hơn hoặc nhiều evidence hơn. Ngoài vùng giao vẫn được xét riêng. Chỉ ưu tiên scope hẹp khi đã có quyết định conflict_resolve rõ ràng theo revision, không dùng “cụ thể hơn” để tự bỏ quy tắc.
8. Bản giải quyết xung đột thay đổi nội dung/scope phải tạo revision và duyệt lại. Gỡ một phía không tự bật phía từng bị suspended.

## 6. Chuyển trạng thái và bộ chọn dùng chung

| Từ → đến | Điều kiện/hậu quả |
|---|---|
| Mới → proposed | Mọi đường feedback, reflect, refine, import; không có quyền kích hoạt |
| proposed → approved | Người dùng duyệt đúng revision; phân loại/phạm vi rõ; evidence đủ; hạn còn hiệu lực; không xung đột |
| approved → active | Người dùng chọn Dùng; kiểm lại revision/phụ thuộc/hạn/hash; materialize skill thành công mới đánh active |
| active → suspended | Thu hồi chứng cứ, đến hạn, hash lệch, xung đột hoặc người dùng tạm dừng; ngừng áp dụng ngay |
| proposed/approved/active/suspended → rejected | Người dùng bác bỏ; tắt projection thực thi thuộc registry; không xóa dữ liệu nguồn |
| Trạng thái bất kỳ → archived | Người dùng lưu trữ; loại khỏi áp dụng, giữ truy nguyên |
| Sửa/khôi phục → proposed revision mới | Giữ bản cũ và events; revision đang active của cùng ID bị suspended khi lưu sửa; không dùng approval cũ |
| suspended → active | Chỉ bật lại revision đã được duyệt còn hạn, đã giải quyết nguyên nhân, kiểm tra lại bằng chứng/hash; trường hợp sửa nội dung hoặc gia hạn phải qua revision mới |

Rejected/archived không tự hồi sinh khi restart, retry, import hoặc rollback. Nút “Chấp nhận và dùng” có thể gộp thao tác UI nhưng phải ghi hai event và không báo active khi ghi skill thất bại. Lỗi materialization giữ approved và báo activationError ở kết quả thao tác, không giả activation thành công.

Bộ chọn dùng chung cho prompt Chat, workflow resolver và nạp skill thực hiện theo thứ tự:

- Kiểm schema/ref và bật tính năng/nhóm; chọn công đoạn/context đã biết.
- Chỉ revision active hiện hành của ID; nhóm giao context, scope khớp đối tượng và quyền đọc.
- Approval đúng revision/scope/group hoặc ngoại lệ legacy hợp lệ; hạn chưa tới; nguồn/bằng chứng/phụ thuộc chưa bị thu hồi; không conflict.
- Skill phải khớp hash artifact của activation; file tồn tại/load=true không thay thế bước kiểm này. Gọi skill trực tiếp cũng phải qua cùng bộ chọn.
- Áp dụng giới hạn kích thước prompt; thiếu chỗ thì ghi lý do bỏ qua, không cắt rules làm đổi nghĩa. Không tự mở rộng phạm vi khi thiếu context.

Review interval mặc định đề xuất: chat 180 ngày, workflow/planning 90 ngày, research professional 90 ngày, legal 30 ngày, news 1 ngày. Đây là chính sách sản phẩm, không bảo đảm nội dung đúng trong thời hạn. Legal/news factual phải verifyEachUse; offline/không kiểm chứng được thì không dùng kết luận như dữ kiện hiện hành. Nhiều nhóm chọn hạn sớm nhất. Group policy nghiêm hơn có hiệu lực chặn ngay; nới policy không tự gia hạn bản đã duyệt.

## 7. JSON mẫu

Các ID và câu chữ dưới đây là fixture thiết kế, không phải dữ liệu/thao tác thật. Các mảnh được xác định theo loại record, không phải một registry hoàn chỉnh. Mẫu lesson hợp lệ để LƯU proposed; không đủ để áp dụng. Source/evidence đi kèm tham chiếu một hội thoại fixture tồn tại trong môi trường kiểm thử.

```json
{
  "source": {
    "id": "10000000-0000-4000-8000-000000000001",
    "kind": "user_feedback",
    "capturedAt": "2026-10-24T03:00:00Z",
    "locator": {"chatId": "fixture-chat", "messageId": "fixture-message"},
    "version": "fixture-message-v1",
    "excerpt": "Hãy tách dữ kiện và giả định trong kế hoạch.",
    "privacy": {"redacted": true, "exportable": false}
  },
  "evidence": {
    "id": "20000000-0000-4000-8000-000000000001",
    "sourceId": "10000000-0000-4000-8000-000000000001",
    "kind": "explicit_preference",
    "claim": "Người dùng yêu cầu tách dữ kiện và giả định.",
    "locator": {"messageId": "fixture-message"},
    "result": "passed",
    "verifiedAt": "2026-10-24T03:01:00Z",
    "verifiedBy": {"kind": "user", "id": "fixture-user"},
    "method": "Đối chiếu nguyên văn lời dặn trong fixture."
  },
  "lesson": {
    "id": "30000000-0000-4000-8000-000000000001",
    "revision": 1,
    "previousRevision": null,
    "createdAt": "2026-10-24T03:02:00Z",
    "createdBy": {"kind": "model", "id": "fixture-extractor"},
    "classification": {"state": "classified", "groupIds": ["planning"], "researchSubtype": null, "reason": "Phản hồi trực tiếp về trình bày kế hoạch."},
    "scope": {"kind": "chat", "chatId": "fixture-chat", "projectId": null},
    "sourceIds": ["10000000-0000-4000-8000-000000000001"],
    "evidenceIds": ["20000000-0000-4000-8000-000000000001"],
    "review": {"status": "proposed", "approval": null, "activation": null},
    "reviewDueAt": null,
    "supersedes": [],
    "legacyRef": null,
    "extensions": {},
    "title": "Phân biệt dữ kiện và giả định",
    "statement": "Khi lập kế hoạch, trình bày dữ kiện và giả định riêng.",
    "claimKind": "preference",
    "limitations": ["Chỉ có lời dặn trong hội thoại fixture; chưa duyệt áp dụng."],
    "relatedLessonRefs": []
  }
}
```

Mẫu chưa phân loại: fragment thay classification và scope của lesson trên; giữ proposed, approval/activation null. Đây là dữ liệu hợp lệ để lưu, bộ chọn phải trả `UNCLASSIFIED` trước khi xét áp dụng. Khi phân loại lại tạo revision 2, không sửa revision 1.

```json
{
  "classification": {"state": "unclassified", "groupIds": ["unclassified"], "researchSubtype": null, "reason": "Tín hiệu chưa có ngữ cảnh chức năng đáng tin cậy."},
  "scope": {"kind": "unresolved", "reason": "Chưa xác định đối tượng áp dụng."}
}
```

Mẫu sai: fragment của revision 2; approval trỏ revision 1 nên phải từ chối `APPROVAL_REVISION_MISMATCH`. Dù JSON parse được, không được tự sửa approval sang 2 hoặc coi status active là đủ.

```json
{
  "revision": 2,
  "previousRevision": 1,
  "review": {
    "status": "active",
    "approval": {"revision": 1, "by": "fixture-user", "at": "2026-10-24T03:03:00Z", "groupIds": ["planning"], "scope": {"kind": "chat", "chatId": "fixture-chat", "projectId": null}},
    "activation": {"revision": 2, "at": "2026-10-24T03:04:00Z", "basis": "approval", "artifactHash": null}
  },
  "reviewDueAt": "2026-11-01T00:00:00Z"
}
```

Để tạo fixture active hợp lệ từ lesson 1: giữ revision 1, đặt reviewDueAt tương lai, approval revision 1 cùng nhóm/scope, actor người dùng, ghi approve event; activation revision 1 basis approval artifactHash null và activate event. Người duyệt fixture không được dùng làm người duyệt thật khi nhập.

## 8. Validation và tiêu chí kiểm thử chuyển giao

JSON Schema kiểm kiểu, required, enum, min/max, union theo kind, format thời gian/UUID, uniqueItems và điều kiện trạng thái. Validator ngữ nghĩa kiểm tham chiếu, revision liên tục, scope tồn tại, bằng chứng hỗ trợ, conflict, quyền người duyệt, hash và transaction. Không tuyên bố JSON Schema đơn lẻ chứng minh tính đúng của nội dung.

Giới hạn nhập đề xuất: 10 MiB UTF-8, 10.000 record tổng, depth 32; vượt giới hạn từ chối nguyên gói, không cắt. Rule text mới tối đa 160 ký tự Unicode để giữ tương thích bộ lọc hiện có; skill Markdown tối đa 64 KiB; excerpt tối đa 2.000 ký tự. Legacy vượt giới hạn giữ nguyên trong snapshot backup/quarantine, không cắt rồi active. Các giới hạn này là quyết định thiết kế cần đưa vào schema/validator và UI.

| Ca | Kết quả bắt buộc |
|---|---|
| Fixture proposed mục 7 | Lưu được khi ref fixture tồn tại; không áp dụng |
| Fixture active theo hướng dẫn | Áp dụng đúng chat/planning, không áp dụng ở chat khác hoặc workflow |
| Unclassified/unresolved | Lưu được; từ chối duyệt và áp dụng |
| approval revision 1, record revision 2 | Từ chối trạng thái active, không nâng quyền ngầm |
| schemaVersion 99, thiếu required, timestamp sai | Từ chối; không thay dữ liệu đang có |
| project scope thiếu projectId, group lạ, research thiếu subtype | Từ chối schema/semantic với JSON pointer vị trí lỗi |
| source/evidence/ref không tồn tại, vòng dependency | Từ chối transaction; không lưu nửa gói |
| Chỉ có snippet hoặc AI tự báo thành công | Lưu proposed; không duyệt kết luận cần nguồn đầy đủ/kết quả chạy |
| Nhiều nhóm cùng scope | Chèn một lần, chỉ trong nhóm đã duyệt; thêm nhóm tạo revision mới |
| Hai rule trái nhau cùng vùng áp dụng | Không áp dụng cả hai tại vùng giao; ghi conflict |
| Hết hạn, mất source hoặc hash skill lệch | Chặn tại bộ chọn, không phụ thuộc scheduler |
| Sửa skill đang active | Revision mới proposed, bản cũ suspended, giữ file người dùng sửa ngoài |
| Startup/reflect/refine/retry | Không tự active đề xuất mới, rejected không sống lại |
| Import active từ máy khác | Giữ provenance, chuyển proposed; không tin approval ngoại lai |
| Export/import vòng lại | Nội dung và refs bảo toàn hoặc có ánh xạ rõ; không tăng quan sát/trùng revision |
| Mất điện giữa JSON và SKILL.md | Chưa xác nhận artifact thì không active; khôi phục theo transactionId/hash |
| Rollback sau khi đã sửa tiếp | Tạo revision mới, không mất lịch sử hoặc hồi sinh ngầm |

## 9. Migration, lưu trữ và đồng bộ Markdown

Migration chỉ chạy khi triển khai sau, không phải công việc nút 2. Tạo backup đầy đủ state/queue và skill liên quan, kèm fingerprint; không đọc/chép bí mật ngoài phạm vi. Migration phải idempotent theo migrationId + fingerprint + legacyRef. Không thay các trường chats/projects/preferences khác.

- Giữ nguyên bản gốc và ID trong legacyRef, giữ source/at/edited/status/existingHash/activationError bằng mapping hoặc metadata legacy. Không suy chatId là scope hiện hành của dữ liệu cũ vì runtime cũ dùng rộng hơn.
- Legacy active chỉ tiếp tục trong nhóm chat với scope global để bảo toàn hành vi Chat đã có, basis legacy, approval null; hiển thị rõ “đang dùng theo cơ chế cũ, chưa duyệt”. Gán reviewDueAt migration + 30 ngày và yêu cầu chuyển sang duyệt mới. Không tự cho vào workflow/research/planning. Đây là ngoại lệ giới hạn, không phải nguồn để tự duyệt mới.
- Nếu thiếu status hoặc không xác minh được active trước migration thì giữ proposed, unclassified/unresolved. Rejected giữ rejected. Approved cũ không có người/revision duyệt xác thực thì proposed. Skill load=true nhưng không có draft tương ứng không đủ chứng minh active. Mọi thay đổi hoặc gia hạn legacy làm mất ngoại lệ và phải qua duyệt mới.
- Không tự thay đổi file skill đang có. Giữ mapping tên/hash; trùng tên hoặc hash khác thì suspended/quarantine, báo người dùng. Snapshot bảo toàn dữ liệu không có nghĩa phải tiếp tục thực thi dữ liệu không xác minh được.
- Queue cũ là mảng riêng: chuyển sang envelope version riêng, giữ text/about/kind/chatId/retries; thêm idempotencyKey, capturedContext, sourceIds và proposedGroupIds. Không xác định được context thì unclassified, không bịa timestamp. Retry không sinh nguồn/bài học trùng. Không reset retries vô hạn qua restart; chính sách thử lại phải được kiểm thử khi triển khai.
- Tắt đường tiêu thụ learned/learnedDrafts cũ sau cutover để không chèn hai lần hoặc lách duyệt; giữ snapshot backup chỉ đọc. Các mirror cần cho UI cũ chỉ là projection, không tự ghi ngược thành nguồn chuẩn.

JSON registry là nguồn chuẩn, SKILL.md là artifact thực thi tương thích cơ chế hiện có. Transaction activation: kiểm generation/revision/hash → ghi intent trong registry → materialize bằng ghi tạm/rename và backup → kiểm hash → ghi active/event. Nếu crash, restart đối chiếu intent và hash; không suy “file tồn tại” thành approved. Lỗi giữ approved hoặc suspended tùy trạng thái trước và chặn áp dụng. Nhiều writer (runtime/refine) cần chung khóa ghi hoặc một writer; atomic rename một tệp không đủ chống lost update nhiều writer.

Export mặc định bỏ excerpt/đường dẫn riêng không được phép xuất, nhưng không làm refs treo: giữ source stub redacted với provenance và đánh unverified; khi import gói thiếu bằng chứng chỉ ở proposed. Không xuất token/khóa, không coi đường dẫn nhập là quyền ghi. Import validate vào vùng tạm, hiển thị ánh xạ scope; đụng ID khác nội dung thì conflict, không last-write-wins. Không hỗ trợ version mới thì giữ nguyên tệp nhập và báo lỗi, không làm mất trường lạ.

Hoàn tác migration phải khôi phục đúng snapshot bằng công cụ được kiểm soát và không ghi đè dữ liệu đã phát sinh sau cutover; nếu có dữ liệu mới thì xuất/bảo toàn rồi lập phương án chuyển ngược. Hạ phiên bản ứng dụng không được tự đọc registry mới như dữ liệu cũ và bật lại mọi skill.

## 10. Ranh giới bàn giao và kiểm chứng

Thiết kế đã xử lí xung đột giữa cơ chế tự active hiện tại và yêu cầu duyệt mới bằng cutover + ngoại lệ legacy có hạn. Bước triển khai phải kiểm tra lại startup, feedback, reflect, edit/review, refine, Chat selector và workflow resolver nêu trong phiếu 01; không chỉ thêm cột status vào UI. Nguồn research và hook workflow độc lập còn cần khảo sát trước khi nối, không giả định đã có event/API.

Chỉ tạo tài liệu này; các thay đổi đang dở trong git status được giữ nguyên. Không tạo schema executable, migration, skill thực thi hoặc dữ liệu cá nhân; không chạy test/typecheck/build/desktop/AI thật. Đã dùng Python json.loads đọc lại toàn bộ khối JSON mục 7 từ tệp vừa ghi: cú pháp parse thành công, kể cả mẫu cố ý sai về ngữ nghĩa. Chưa có validator schema/ngữ nghĩa để chạy; ma trận mục 8 là tiêu chí cho bước triển khai, không phải báo cáo test đã đạt.

## BÀN GIAO

- Đã làm: xác định hợp đồng nhóm, lesson, skill, rule, source, evidence và event; quy tắc phân loại, phạm vi, phiên bản, duyệt, rà soát và xung đột.
- Kết quả và đường dẫn tệp đã tạo/sửa: tạo `/Users/phananh/MySoft/tu-hoc-ban-giao-02.md`.
- Quyết định và giả định: registry riêng schemaVersion 1; đề xuất mới không tự có hiệu lực; bảo toàn legacy bằng ngoại lệ Chat có hạn, không giả approval.
- Việc nút sau cần biết: hiện thực schema + validator ngữ nghĩa và migration atomic/idempotent; mọi đường ghi/nạp phải dùng chung điều kiện áp dụng; SKILL.md phải được kiểm hash; đọc lại diff trước sửa.
- Việc còn dở hoặc lỗi: chưa triển khai hoặc chạy kiểm thử ứng dụng; hook research/workflow độc lập và toàn bộ refine chưa được xác minh lại trong bước này.
