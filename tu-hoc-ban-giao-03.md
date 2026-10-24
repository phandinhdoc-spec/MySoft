# Bàn giao 03 — Phân loại ngữ cảnh nguồn vào 4 nhóm chức năng và xử lý mục chờ

Ngày 2026-10-24. Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 3.
Đầu vào: [bàn giao 02](tu-hoc-ban-giao-02.md).

**Trạng thái:** Đã triển khai và kiểm thử hoàn chỉnh module phân loại ngữ cảnh nguồn trong `core/src/desktop/learning-policy.ts` cùng bộ kiểm thử tập trung `core/test/learning-policy.test.ts`.

---

## 1. Cơ chế phân loại 4 nhóm chức năng

Module cung cấp hàm chuẩn `classifyContext(c: SourceContext): ClassificationResult` phân định chính xác 4 nhóm chức năng theo hợp đồng dữ liệu:

1. **Nhóm `chat` (Sở thích hội thoại):**
   - Áp dụng khi có cờ `chat: true` hoặc chỉ có `chatId` đơn thuần mà không gắn với quy trình, kế hoạch hay công cụ tra cứu.
   - Nhóm này chỉ học phong cách trả lời, xưng hô, dặn dò cá nhân; không tự mở rộng sang các chức năng nghiệp vụ.
   - `researchSubtype: null`.

2. **Nhóm `workflow` (Thiết kế & Phục hồi quy trình):**
   - Áp dụng khi có cờ `workflow: true`, `workflowId`, `runId` hoặc `stepId`.
   - Phân biệt rõ giữa bản thiết kế (design) và kết quả chạy thật (execution run/step).
   - `researchSubtype: null`.

3. **Nhóm `planning` (Lập kế hoạch & Kiểm định):**
   - Áp dụng khi có cờ `planning: true` hoặc `planId`.
   - Gắn với các phiên lập kế hoạch có kiểm định, bản nháp Plan hoặc kết quả xác minh bước trong Plan.
   - `researchSubtype: null`.

4. **Nhóm `research` (Tìm văn bản & Tin tức):**
   - Áp dụng khi có cờ `research: true` hoặc kích hoạt công cụ tra cứu mạng (`office_web_search`, `office_web_read`).
   - **Bắt buộc có một trong 3 nhánh con (`researchSubtype`):**
     + `legal`: Văn bản quy phạm pháp luật, công văn, thông tư, nghị định (chu kỳ rà soát 30 ngày, bắt buộc nguồn sơ cấp toàn văn).
     + `news`: Tin tức thời sự, sự kiện cập nhật (chu kỳ rà soát 1 ngày, phân biệt ngày đăng và ngày sự kiện).
     + `professional`: Tài liệu chuyên môn, học liệu, giáo trình, hướng dẫn bộ môn (chu kỳ rà soát 90 ngày).
   - **Quy tắc an toàn nhánh con:** Nếu nhóm là `research` nhưng thiếu `researchSubtype` (hoặc subtype null/không hợp lệ), hệ thống **tuyệt đối không đoán mò**, lập tức chuyển sang trạng thái `unclassified` để đưa vào hàng đợi chờ phân loại thủ công.

---

## 2. Xử lý ngữ cảnh mâu thuẫn và hàng đợi chờ phân loại

1. **Cô lập mục mơ hồ (`unclassified`):**
   - Khi ngữ cảnh thiếu thông tin (empty context `{}`) hoặc chứa nhiều nhóm mâu thuẫn (ví dụ vừa gắn cờ `planning` vừa `workflow`, hoặc `chat` kèm `workflow`), `classifyContext` trả về:
     ```json
     {
       "state": "unclassified",
       "groupIds": ["unclassified"],
       "researchSubtype": null,
       "reason": "Ngữ cảnh nguồn mâu thuẫn / thiếu thông tin; chuyển vào hàng đợi chờ phân loại"
     }
     ```
   - Trạng thái `unclassified` ngăn chặn hoàn toàn việc tự động kích hoạt hoặc đưa đề xuất vào kho học đang hoạt động.

2. **Hàng đợi tín hiệu chưa rõ (`createUnclassifiedSignal`):**
   - Đóng gói tín hiệu thành `UnclassifiedQueueItem` với UUID định danh, thời điểm ghi nhận UTC và lý do cụ thể.
   - Trạng thái `status: "unclassified"` bảo đảm bộ tiến trình nền (background processor) bỏ qua, không gửi prompt tới mô hình AI khi chưa có sự xác nhận của người dùng.

3. **Cơ chế giải quyết thủ công (`resolveUnclassifiedSignal`):**
   - Cho phép người dùng duyệt và phân loại thủ công mục chờ vào một trong các nhóm hợp lệ (`chat`, `workflow`, `planning`, `research`).
   - Nếu giải quyết sang `research`, bắt buộc phải chỉ định `researchSubtype` hợp lệ (`legal`, `news`, `professional`); nếu thiếu sẽ bị từ chối bằng lỗi `RESEARCH_SUBTYPE`.

4. **Nguyên tắc chống suy diễn nội dung (Chống đoán mò):**
   - Không phân loại dựa trên câu chữ trong văn bản tự do hay câu trả lời của mô hình ngôn ngữ (ví dụ: đoạn văn có chứa từ "kế hoạch" hay "quy trình" nhưng không có metadata tương ứng thì không được tự ý gán vào nhóm `planning` hay `workflow`).

---

## 3. Kiểm chứng chất lượng

- **Kiểm thử đơn vị tập trung (`core/test/learning-policy.test.ts`):** 9/9 ca kiểm thử đạt 100%:
  + Phân loại đúng nhóm `chat` độc lập.
  + Phân loại đúng nhóm `workflow` từ cờ, workflowId, runId/stepId.
  + Phân loại đúng nhóm `planning` từ cờ, planId.
  + Phân loại đúng nhóm `research` cho cả 3 nhánh con (`legal`, `news`, `professional`).
  + Giữ `research` thiếu nhánh con ở trạng thái `unclassified`.
  + Cô lập ngữ cảnh rỗng và ngữ cảnh mâu thuẫn nhiều nhóm.
  + Chống đoán mò từ văn bản tự do chứa từ khóa nghiệp vụ.
  + Quản lý hàng đợi mục chờ và giải quyết thủ công có thẩm định.
  + Thẩm định chính sách từ chối (`UNCLASSIFIED` và `SUBTYPE` denial).
- **Kiểm thử hồi quy nhóm tự học:** Chạy đồng thời 4 tệp kiểm thử `learning-policy.test.ts`, `learning-registry.test.ts`, `learning-signals.test.ts`, `learning-baseline.test.ts`: **89/89 ca đạt (100%)**.
- **Kiểm tra kiểu dữ liệu (`npm run typecheck`):** Đạt 0 lỗi trên toàn bộ 5 workspace (`shared`, `core`, `bridge`, `addin`, `chatbox`).

---

## BÀN GIAO

- **Đã làm:**
  - Thiết lập module phân loại ngữ cảnh nguồn vào 4 nhóm chức năng (`chat`, `workflow`, `planning`, `research`) trong `core/src/desktop/learning-policy.ts`.
  - Hỗ trợ đầy đủ 3 nhánh con của research (`legal`, `news`, `professional`); bắt buộc có subtype mới được phân loại vào research.
  - Xây dựng cơ chế giữ các tín hiệu thiếu/mâu thuẫn ngữ cảnh ở hàng đợi `unclassified` chờ người dùng phân loại thủ công (`createUnclassifiedSignal`, `resolveUnclassifiedSignal`).
  - Xây dựng bộ kiểm thử đơn vị `core/test/learning-policy.test.ts` đạt 9/9 ca kiểm thử; vượt qua typecheck toàn bộ 5 workspace.
- **Kết quả và đường dẫn tệp đã tạo/sửa:**
  - `core/src/desktop/learning-policy.ts`: bổ sung `classifyContext`, `createUnclassifiedSignal`, `resolveUnclassifiedSignal`, các kiểu dữ liệu `SourceContext`, `ClassificationResult`, `UnclassifiedQueueItem`.
  - `core/test/learning-policy.test.ts`: bộ test kiểm chứng phân loại 4 nhóm, 3 nhánh con research, mục chờ unclassified, chống đoán mò và chính sách từ chối.
  - `tu-hoc-ban-giao-03.md`: hồ sơ bàn giao kỹ thuật của Bước 3.
- **Quyết định và giả định:**
  - Nhóm chỉ được xác định từ metadata có căn cứ, không suy diễn từ văn bản tự do hay phản hồi AI.
  - Mục `unclassified` là vùng cách ly an toàn, không kích hoạt AI nền và không áp dụng vào runtime cho đến khi người dùng phân loại rõ ràng.
  - Phân loại `research` bắt buộc gắn liền với 1 trong 3 nhánh con để áp dụng chu kỳ rà soát và điều kiện xác minh tương ứng (1 ngày đối với news, 30 ngày đối với legal, 90 ngày đối với professional).
- **Việc nút sau cần biết:**
  - Nút 4 (hoặc các bước kế tiếp) có thể sử dụng trực tiếp `classifyContext` khi tiếp nhận tín hiệu từ các sự kiện runtime (`workflowDesign`, `planMode`, `toolCall`).
  - Khi hiển thị giao diện danh sách mục chờ, dùng `resolveUnclassifiedSignal` để gửi hành động phân loại của người dùng xuống backend.
- **Việc còn dở hoặc lỗi:**
  - Chưa nối luồng phân loại trực tiếp trên giao diện người dùng (thuộc phạm vi các bước UI kế tiếp).
  - Một lỗi cũ trong `plans.test.ts` thuộc luồng legacy của nhánh phát triển hiện tại vẫn được giữ nguyên trạng, không ảnh hưởng tới module tự học mới.
