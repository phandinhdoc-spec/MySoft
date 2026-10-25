# Bàn giao 05 — Skill/rules nền, chọn theo phạm vi, duyệt và hoàn tác

Ngày 2026-10-24. Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 7 (bước "bổ sung skill/rules nền"). Đầu vào: [bàn giao 04](tu-hoc-ban-giao-04.md).

**Trạng thái:** lớp dữ liệu, không phải tính năng hoàn chỉnh. Bản nền chỉ **tạo đề xuất (`proposed`)**; chưa nối vào runtime, chưa có giao diện duyệt, chưa seed vào dữ liệu thật của người dùng.

## Đã có từ nút 3 (đọc lại, không viết lại)

`learning-policy.ts` + `LearningStore` đã có `review` (approve/activate/suspend/reject/archive), `select`, `revise`, `restore`. `learningDenial` kiểm: bản mới hơn, chưa phân loại, phạm vi (`canAccess` do ứng dụng cấp), nhóm, subtype research, hạn rà soát (tin tức ≤1 ngày, pháp luật ≤30 ngày), xung đột, trạng thái, duyệt đúng revision/nhóm/phạm vi, nguồn còn dùng được, bằng chứng đạt không do model, phụ thuộc, hash tệp skill.

## Mã mới / sửa

- **Mới** `core/src/desktop/learning-baseline.ts`: `BASELINE_DEFS`, `checkBaselineDef`, `seedBaseline(store, {now})`.
  - 5 bộ nền: `workflow`, `planning`, `research/legal`, `research/news`, `research/professional`. Tổng 5 bài học, 5 skill, 12 quy tắc (workflow 3, planning 3, mỗi loại research 2). Nội dung theo đặc tả plan (phân tích vào/ra, chia nút, phụ thuộc, phục hồi, bằng chứng chạy thật, chống chạy lặp, không mở rộng dữ liệu riêng; tách dữ kiện/giả định, duyệt ≠ chạy, kế hoạch ≠ kết quả; nguồn gốc, phiên bản, ngày kiểm tra, xác minh lại).
  - Mọi bản ghi `proposed`, phạm vi `global`, nhóm cố định, kèm nguồn `user_request` và bằng chứng `plan_review` do `system`. Bằng chứng chỉ `passed` khi `checkBaselineDef` đạt; nếu không là `failed` và không thể duyệt. Bằng chứng này là kiểm tra chuỗi tự động, **không thay** việc người dùng duyệt.
  - Idempotent theo `extensions["pvta.baseline"].key`: chạy lại không nhân đôi và không động đến quyết định duyệt.
- **Sửa** `core/src/desktop/learning-policy.ts` (`reviseLearning`): khi khôi phục, `reviewDueAt` được tính lại từ độ dài cửa sổ rà soát gốc kể từ bây giờ. Trước đó bản khôi phục mang hạn cũ nên có thể không duyệt lại được.
- **Mới** `core/test/learning-baseline.test.ts` (12 ca).

## Cơ chế chọn (không đổi, nay có test)

Thứ tự duyệt bắt buộc: **bài học trước, rồi skill/quy tắc** (vì phụ thuộc phải đang active). Nhóm phải do ngữ cảnh ứng dụng cung cấp, không lấy từ model.

## Bằng chứng kiểm thử (chạy 2026-10-24)

- `npx vitest run core/test/learning-baseline.test.ts`: 12/12. Cùng `learning-registry`, `learning-signals`, `feedback-learning`: **4 tệp, 99/99 đạt**.
- `npm run typecheck`: đạt (shared, core, bridge, addin, chatbox).
- Ca đã chứng minh: mới seed → 0 mục được chọn, 17 bị từ chối (`NOT_ACTIVE`/`SUBTYPE`); model hoặc người không có quyền không duyệt được; chỉ nhóm đúng mới nạp (workflow không nạp cho planning/chat); research tách đúng subtype (legal không nạp cho news hay khi thiếu subtype); sai phạm vi (`canAccess` false) và nguồn không còn → không nạp; quá hạn rà soát → `REVIEW_DUE`; tạm dừng một quy tắc chỉ dừng quy tắc đó; sửa nội dung → bản mới `proposed`, bản cũ `suspended`, không nạp tới khi duyệt lại; hoàn tác tới revision 1 tạo revision 3 `proposed` với nội dung đúng bản 1, nạp lại sau duyệt, lịch sử 1-2-3 và sự kiện `restore` còn nguyên; generation cũ bị từ chối và trạng thái giữ nguyên; JSON sửa tay thành `active` không có duyệt bị `read()` từ chối; bằng chứng `failed` chặn duyệt.

## Chưa kiểm chứng / hạn chế

- Chưa chạy `npm test` toàn repo; chưa thử desktop, model nhẹ hay AI thật.
- Chưa nối `seedBaseline`, `select` vào runtime (Chat selector, workflow resolver, nạp skill) và chưa chuyển hộp tín hiệu nút 4 sang kho `learning-v1`. Runtime vẫn dùng kho cũ.
- Chưa có giao diện duyệt, phân loại mục `unclassified`, nhập/xuất.
- `groups[].skillRefs/ruleRefs` chưa điền (nhóm bất biến theo revision; chọn dựa vào phân loại của bản ghi, không qua các tham chiếu này).
- Nội dung nền tin tức chỉ có hiệu lực 1 ngày và pháp luật 30 ngày theo chính sách có sẵn nên cần rà soát thường xuyên.
- Bản khôi phục khi cửa sổ gốc đã qua vẫn phụ thuộc bài học đang hiệu lực; test chỉ kiểm hạn mới và việc bị chặn khi bài học quá hạn.
- Chưa commit.

## BÀN GIAO

- Đã làm: bộ skill/rules nền cho workflow, planning, research (3 subtype); seed idempotent chỉ ở trạng thái đề xuất; sửa hạn rà soát khi hoàn tác; test áp dụng/từ chối/hoàn tác.
- Kết quả và đường dẫn tệp đã tạo/sửa: `core/src/desktop/learning-baseline.ts`, `core/test/learning-baseline.test.ts` (mới); `core/src/desktop/learning-policy.ts` (sửa `reviseLearning`); phiếu này. Chưa commit.
- Quyết định và giả định: bản nền do hệ thống đề xuất, người dùng phải duyệt từng mục (bài học trước); phạm vi `global` nhưng chỉ nạp khi nhóm và ngữ cảnh khớp; không động đến dữ liệu thật; giữ thay đổi chưa commit của các nút trước.
- Việc nút sau cần biết: nối `seedBaseline`/`store.select`/`review`/`restore` vào runtime và giao diện (duyệt, phân loại, lịch sử, hoàn tác, nhập/xuất); chuyển đề xuất từ hộp tín hiệu nút 4 sang `learning-v1` dưới dạng `proposed` có bằng chứng và `duplicateOf`; không tin trạng thái duyệt từ tệp nhập; chạy `npm test` toàn repo và thử desktop.
- Việc còn dở hoặc lỗi: ca `plans.test.ts` (Chat tự kích hoạt skill) vẫn lỗi cũ, ngoài phạm vi; `npm test` toàn repo và desktop/AI thật chưa chạy.
