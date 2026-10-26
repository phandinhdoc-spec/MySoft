# Bàn giao 01 — Khảo sát phân nhóm tự học PVTA

Ngày khảo sát: 2026-10-24. Plan: 9bc04df0-a5f5-43a6-bab5-830be6f2ae00, bước buoc-1.
Phạm vi: khảo sát mã desktop và các thành phần lưu/áp dụng liên quan; không triển khai tính năng, không chạy Plan, không sửa mã nguồn.
Thư mục làm việc và gốc Git đều là /Users/phananh/MySoft. Nhánh feature/workflow-directive-editor; HEAD 3f24022a980f50bf66dfd673dae9a506580ac4d0.

## 1. Bằng chứng và độ tin cậy

Đã đọc AGENTS.md, brain.md, docs/feedback-learning.md và package.json gốc/core/chatbox. Dùng Tier 2: list_projects → index_status → search_graph → trace_path hai chiều → get_code_snippet → check_index_coverage → đọc nguồn hiện tại.

Graph mysoft-current trỏ đúng thư mục nhưng generation là 2026-10-20T03:34:38Z, chế độ fast. Tìm các Function/Method có Feedback/Learning/Learned và DesktopStore; các truy vấn đã trả has_more=false; trace queueLearning độ sâu 1 không báo trang tiếp theo. Trace cũ cho dispatchInner → queueLearning → saveLearning/scheduleLearning/changed/maskPersonal chỉ dùng để định hướng. Snippet queueLearning trả dòng 209–213 nhưng nguồn hiện tại ở đó là saveReviewedPrompts: không dùng snippet lệch dòng làm bằng chứng.

check_index_coverage đã kiểm tra toàn bộ đường dẫn bằng chứng:
- metadata_changed: package.json, core/package.json, chatbox/package.json, vitest.config.ts, core/src/desktop/{runtime,types,feedback-learning}.ts, chatbox/src/{LearningPanel,App}.tsx.
- not_tracked: AGENTS.md, brain.md, core/src/desktop/learning-memory.ts, chatbox/test/learning-panel.test.ts.
- excluded: docs/feedback-learning.md (docs bị loại), core/test/feedback-learning.test.ts (fast-pattern).
- metadata_match: core/src/desktop/storage.ts, core/src/desktop/project-learning.ts, core/src/learner.ts.
Đã đọc trực tiếp phần liên quan của các tệp trên; đọc toàn bộ helper ngắn, storage, learner và panel. Kiểm tra scope feedback-learning.ts, learning-memory.ts, LearningPanel.tsx không ghi nhận gap, nhưng không chứng minh đầy đủ. Các kết luận bên dưới dựa trên nguồn hiện tại, không suy ra thiếu tính năng toàn repo từ graph cũ. Không reindex hoặc sửa cấu hình graph.

## 2. Bản đồ luồng hiện tại

| Khâu | Hiện trạng và nguồn mã đã đọc |
|---|---|
| Thu nhận | runtime.ts:1425 nhận lời sửa/khen trước khi chạy AI; :1428 chỉ đưa habit vào queue sau lượt thành công, không phải Plan và không ở workflowDesign. Vì vậy điều kiện loại Plan/quy trình ở đây chỉ áp cho habit, không phải mọi tín hiệu. RPC feedback ở :1847 gọi queueLearning. |
| Hàng đợi | runtime.ts:443–453 che dữ liệu bằng maskPersonal, kiểm findUnsafe, giữ chatId/text/about/kind/retries, tối đa 20 mục, lưu learning-queue.json và hẹn xử lí. feedback-learning.ts:1–14 định nghĩa kind feedback/praise/habit; ưu tiên feedback, gom cùng chat/kind; praise cần 2, habit cần 3 quan sát. |
| Trích xuất | runtime.ts:455–490 chọn model nhẹ đã cấu hình qua lightFeedbackModel, nhường jobs/refine, giới hạn 45 giây, parse JSON và kiểm quy tắc/skill. Lỗi giữ hàng đợi và tăng retries; learnNow (:1789) đặt lại retries. Không có model nhẹ thì ghi lỗi, không thay bằng model nặng. |
| Rút kinh nghiệm | runtime.ts:394–441 có reflectDigest/scheduleReflect/reflectNow. Digest lấy lượt gần nhất, kết quả AI, trạng thái thao tác và Plan gần nhất; giới hạn văn bản và che dữ liệu. Model mặc định, hạn 90 giây, sinh lessons và skill. Hook đã thấy ở send thành công/thất bại (:1428), kết thúc lượt chạy Plan (:1718), bật reflect (:1401). Chưa xác minh hook cho mọi quy trình độc lập; không khẳng định chạy workflow nào cũng tự thu nhận. |
| Ghi và kích hoạt | runtime.ts:475–483 lưu Learned với status active, skill qua autoActivateLearnedSkill. Reflect cũng tự active (:430–434). learning-memory.ts:11–26 kiểm tên/nội dung, hash tệp, ghi skill, đổi load và status; lỗi giữ proposed cùng activationError. |
| Khởi động lại | runtime.ts:258–268 đọc queue, đặt retries=0; nhập learned-* có sẵn vào drafts; đổi rule hợp lệ chưa rejected thành active và thử kích hoạt drafts chưa active/rejected. Đây là điểm bắt buộc sửa nếu thêm cơ chế duyệt. |
| Sửa/xóa/duyệt | runtime.ts:1848–1857: editLearned sửa và active ngay; reviewLearned quy approved/active về active; reviewLearnedSkill edit/approve/activate gọi activateLearnedSkill, reject tắt load và giữ rejected. UI không có bước chấp nhận riêng. |
| Áp dụng vào Chat | runtime.ts:706–724 chọn skill theo load, active draft và điểm phù hợp; phần sở thích lấy tất cả learned active khi preferences.learning bật, tối đa 4000 ký tự, không lọc theo nhóm chức năng hay projectId. chatId hiện là nguồn gốc, không phải điều kiện phạm vi áp dụng. |
| Áp dụng vào workflow | runtime.ts:239 cung cấp resolver skill chặn learned-* chưa active và resolver rules từ profile/project. Đây là điểm tích hợp cần đối chiếu tiếp với runner khi triển khai, chưa kiểm thử end-to-end. |
| Giao diện | LearningPanel.tsx:4–18 hiển thị bật/tắt, chờ/chạy, lần chạy cuối, reflect, rule và skill; có Lưu sửa/Xóa bỏ, lỗi kích hoạt; ẩn rejected. App.tsx:558–590 gắn panel vào modal Những điều đã học và Cài đặt Chung. |
| Biên tập nền | runtime.ts:270–281 cung cấp writeSkill tự kích hoạt; applyRules sao lưu learned rồi cập nhật/xóa các mục chưa rejected và chưa edited. Cần áp chính sách nhóm/duyệt ở đường ghi này nữa. Chưa khảo sát toàn bộ daemon biên tập nền. |

Các đường dẫn runtime.ts trong bảng là core/src/desktop/runtime.ts; đường dẫn panel/App thuộc chatbox/src.

## 3. Dữ liệu đang lưu và ranh giới cần giữ

- core/src/desktop/storage.ts:7–26: DesktopStore lưu `<home>/chatbox/state.json`; ghi atomic qua tệp tạm/rename, quyền hạn chế. Đọc kiểm version=1 và các mảng chats/projects/attachments/learned; chưa phải validation từng trường bằng JSON Schema tại lớp này. Không mở dữ liệu cá nhân thật trong home.
- core/src/desktop/types.ts:26–29,66:
  - Learned: id, rule, source, at, status?, chatId?, edited?.
  - LearnedDraft: id, name, description, body, source, at, status, chatId?, existingHash?, activationError?.
  - LearningReview: proposed | approved | active | rejected.
  - DesktopData version:1 chứa learned, learnedDrafts?, learningLast?, ruleBook? và dữ liệu khác.
- core/src/desktop/feedback-learning.ts:1–3: LearningItem gồm chatId/text/about/retries/kind?; kind là loại tín hiệu, không phải workflow/research/planning.
- runtime.ts:443 và :258: queue là mảng JSON riêng `<home>/chatbox/learning-queue.json`, không có envelope version trong đường ghi này; khi đọc chỉ kiểm một số trường và reset retries.
- learning-memory.ts:13–21; core/src/learner.ts:230–256: skill thực thi vẫn là `<skillsDir>/<name>/SKILL.md`, chuẩn hóa nội dung, bảo vệ bằng existingHash; ghi đè hợp lệ tạo .backup. JSON draft và Markdown thực thi phải đồng bộ, không nên thay một phía rồi mất phía còn lại.
- Trong các kiểu Learned/LearnedDraft đã đọc không có groupId, revision, evidenceId, project scope, người duyệt, phiên bản đã duyệt hay lịch sử sự kiện. source là chuỗi mô tả và chatId là liên kết thô; chưa đủ chứng cứ theo phiên bản.
- Không đồng nhất Học hỏi của dự án với tự học phản hồi: types.ts:24–25 và project-learning.ts:17–46 quản lí folders/notes/enabled/noteFile, nguồn purpose=learning, ghi chú Markdown có fingerprint và chống ghi đè bản đã sửa ngoài.
- Không đồng nhất với learner Office: core/src/learner.ts:99–153,279–328 có LearnQueue/LearnState/Learner riêng, chọn nhóm theo backend/model, chính sách thời gian và hàng đợi khác. Khảo sát này chưa xác minh toàn bộ nơi dùng add-in/bridge.

## 4. Khác biệt với yêu cầu và đề xuất điểm tích hợp

1. **Cơ chế duyệt đang khác bản tóm tắt cũ.** docs/feedback-learning.md:12 trên đĩa hiện ghi tự dùng, sửa hợp lệ có hiệu lực ngay. runtime.ts:264–265,430–434,478–483,1848–1855 và LearningPanel.tsx xác nhận. Test hiện tại còn kỳ vọng hành vi tự kích hoạt. Không triển khai dựa trên giả định đã có chốt duyệt.
2. **Đã có JSON nhưng chưa có mô hình nhóm/version/evidence yêu cầu trong các kiểu khảo sát.** Thiết kế lớp riêng cho nhóm, bài học, tài nguyên và lịch sử; giữ ID cũ và dữ liệu ngoài phạm vi migration. Không tự gán nguồn thiếu thành nhóm toàn cục.
3. **Đã có reflect cho tiến trình.** Tận dụng đầu vào này sau khi phân loại và gắn chứng cứ; không tạo luồng học thứ ba trùng lặp. Digest hiện dùng cả lời AI và trạng thái bước, chưa phải bằng chứng kết quả chạy được xác minh độc lập.
4. **Nhóm research cần thêm hợp đồng nguồn.** Trong Learned/LearnedDraft/queue đã đọc chưa có URL nguồn, ngày xác minh, phiên bản văn bản hay nhánh pháp luật/tin tức/chuyên môn. Bước sau khảo sát công cụ web và điểm kết thúc research trước khi nối; chưa khẳng định toàn bộ repo không có metadata nguồn.
5. **Áp dụng cần lọc nhóm/phạm vi/phiên bản duyệt.** Tập trung một bộ chọn dùng chung cho context Chat, resolver workflow và đường nạp skill. Phải chặn tự active ở startup, reflect, feedback và refine cho đề xuất mới theo chính sách được thiết kế.
6. **UI hiện chỉ sửa/xóa.** Trong LearningPanel đã đọc chưa có nhóm, import/export, lịch sử hay hoàn tác. Bổ sung tại đây và RPC tương ứng; không coi backup skill hoặc backup refine là lịch sử hoàn tác đầy đủ.
7. **Có nhãn UI cũ.** App.tsx:440 còn nói bài học “chờ duyệt”, :646 nói “duyệt bản đề xuất”, trong khi LearningPanel và runtime tự kích hoạt. Cần thống nhất theo quyết định mới; bước này không sửa chữ.

## 5. Công việc đang dở phải bảo toàn

Không tin tóm tắt hội thoại cũ nói clean working tree: git status hiện có các mục dưới đây. Không commit, reset, checkout, stash hoặc sửa các mục này. Đặc biệt App.tsx, runtime.ts và types.ts là điểm tích hợp đang có thay đổi người dùng.

```text
 M README-addin.md
 M chatbox/src/App.tsx
 M chatbox/src/Composer.tsx
 M chatbox/src/PlanningControls.tsx
 M chatbox/src/StepComposer.tsx
 M chatbox/src/TemplateDialogs.tsx
 M chatbox/src/WorkflowPanel.tsx
 M chatbox/src/WorkflowStepZones.tsx
 M chatbox/src/composer.css
 M chatbox/src/en.json
 M chatbox/src/step-composer.css
 M chatbox/src/workflow-tools.ts
 M chatbox/src/workflow.css
 M chatbox/test/planning-controls.test.ts
 M chatbox/test/step-composer.test.ts
 M chatbox/test/workflow-step-zones.test.ts
 M core/src/desktop/planning.ts
 M core/src/desktop/plans.ts
 M core/src/desktop/runtime.ts
 M core/src/desktop/template-apply.ts
 M core/src/desktop/types.ts
 M core/src/desktop/workflow-fingerprint.ts
 M core/src/desktop/workflow-frames.ts
 M core/src/desktop/workflow-language.ts
 M core/src/desktop/workflow-templates.ts
 M core/src/desktop/workflows.ts
 M core/test/desktop.test.ts
 M core/test/plans.test.ts
 M core/test/workflow-language.test.ts
 M docs/plan-pro.md
?? chatbox/src/Modal.tsx
?? chatbox/src/SkillsManagerModal.tsx
?? chatbox/src/StepInputFiles.tsx
?? chatbox/src/WorkflowResourceEditor.tsx
?? chatbox/src/WorkflowStepForm.tsx
?? chatbox/src/workflow-directives.ts
?? chatbox/test/workflow-directives.test.ts
?? core/src/desktop/workflow-scoped-resources.ts
?? core/test/workflow-scoped-resources.test.ts
?? ke-hoach-viet-lai-xuat-mau-va-xuat-quy-trinh.json
?? quy-trinh-viet-lai-xuat-mau-va-xuat-quy-trinh.json
```

Danh sách này là ảnh chụp trạng thái, không phải bản sao nội dung. Nút sau đọc diff hiện tại trước khi sửa; không dùng patch nguyên tệp từ HEAD để thay nguồn. Tệp tu-hoc-ban-giao-01.md chưa tồn tại khi khảo sát, được tạo mới ở bước này.

## 6. Kiểm chứng và lệnh dành cho bước triển khai

Đã kiểm tra cấu hình và đọc test; **chưa chạy test, typecheck, build hoặc desktop**, vì bước được duyệt là khảo sát và ghi lệnh. Không đưa số test đạt hay tái sử dụng kết quả cũ.

Nguồn lệnh: package.json scripts; chatbox/package.json scripts; vitest.config.ts:1–8.
- `npm test`: pretest chạy check:viet-skill, sau đó vitest run theo cấu hình gồm cli/chatbox/core/shared/bridge/addin/scripts.
- `npx vitest run core/test/feedback-learning.test.ts chatbox/test/learning-panel.test.ts`: kiểm tập trung; không thay thế kiểm toàn bộ khi triển khai.
- `npm run typecheck`: shared/core/bridge/addin/chatbox.
- `npm run typecheck -w chatbox`: frontend riêng.
- `npm run build:chatbox`: build Vite; `npm run build`: bridge/addin/chatbox; không tương đương build desktop.
- `npm run desktop`: phục vụ kiểm tra UI thật ở giai đoạn sau, chưa chạy.

core/test/feedback-learning.test.ts:16–123 có ca cho lời dặn, habit, praise, phân batch, lỗi/gián đoạn, lưu lại qua restart, tự áp dụng, sửa/xóa, collision/hash và reflect. chatbox/test/learning-panel.test.ts:8–24 kiểm markup sửa/xóa, không có bước chấp nhận và ẩn rejected. Đây là mô tả nội dung test, không phải kết quả chạy.

Cần bổ sung khi triển khai: migration không mất dữ liệu; phân loại chưa rõ giữ pending; duyệt đúng revision; sửa làm hết hiệu lực bản duyệt; không rò nhóm/project; import lỗi/phiên bản lạ/ID trùng; export vòng lại; lịch sử/hoàn tác; startup/refine không lách duyệt; giữ chỉnh sửa Markdown bên ngoài. Sau đó chạy toàn bộ test và phân tích từng lỗi, không tự gán là lỗi có sẵn.

## 7. Bàn giao cho nút sau

Đã đủ bản đồ luồng desktop và điểm tích hợp để thiết kế hợp đồng JSON. Giữ yêu cầu mới “đề xuất không tự có hiệu lực”; việc chuyển dữ liệu Chat cũ đang active cần chính sách migration rõ, không tự hạ/xóa hoặc tự duyệt các nhóm mới.
Chưa chốt schema, chưa triển khai hoặc sửa Plan được lưu trong PVTA. Chưa xác minh UI thật, AI thật, toàn bộ add-in/bridge, hook mọi workflow độc lập, nguồn research và daemon refine. Những phần đó là ranh giới khảo sát, không phải bằng chứng thiếu tính năng. Nút sau đọc lại nguồn vì graph cũ và cây làm việc đang có thay đổi.


## 8. Phụ lục cập nhật (2026-10-24, kiểm tra lại khi tiếp tục nút 1)

- Nhánh vẫn `feature/workflow-directive-editor`, HEAD hiện là `a9022fc` (đã commit gói nút Duyệt/chỉ thị/phạm vi).
- `git status --short` có 32 mục chưa commit. Tệp theo dõi đang sửa: `chatbox/src/{App.tsx,WorkflowPanel.tsx,en.json,helpData.ts}`, `chatbox/test/workflow-step-ui.test.ts`, `core/src/desktop/{runtime.ts,types.ts,workflows.ts}`, `core/test/{plans,workflow-chat-summary}.test.ts`. Tệp mới gồm: PromptQueue, reset, `.pvta-reset/`, các module dữ liệu tự học `core/src/desktop/learning-{baseline,migration,policy,registry,schema,signals,store}.ts`, các tệp test liên quan, và các phiếu bàn giao từ `tu-hoc-ban-giao-01.md` đến `tu-hoc-ban-giao-05.md`.
- Các nút tiếp theo (2 đến 5) đã xây dựng lớp dữ liệu `learning-*`, nguồn tín hiệu riêng cho các nhóm và bộ baseline đề xuất.
- Xác nhận các điểm tích hợp tại `core/src/desktop/runtime.ts` và `chatbox/src/LearningPanel.tsx` được giữ nguyên vẹn, sẵn sàng cho các bước giao diện và tích hợp tiếp theo. Chưa chạy test/typecheck toàn bộ repo trong bước khảo sát này; không sửa mã nguồn chức năng.
