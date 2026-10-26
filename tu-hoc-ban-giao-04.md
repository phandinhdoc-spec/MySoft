# Bàn giao 04 — Nguồn tín hiệu riêng cho workflow, research, planning

Ngày 2026-10-24. Plan `9bc04df0-a5f5-43a6-bab5-830be6f2ae00`, nút 4.
Đầu vào: [Phiếu bàn giao 03](tu-hoc-ban-giao-03.md), module [learning-store.ts](file:///Users/phananh/MySoft/core/src/desktop/learning-store.ts).

**Trạng thái:** Đã triển khai, tích hợp và kiểm chứng hoàn tất module [`learning-signals.ts`](file:///Users/phananh/MySoft/core/src/desktop/learning-signals.ts) cùng bộ kiểm thử [`learning-signals.test.ts`](file:///Users/phananh/MySoft/core/test/learning-signals.test.ts).

---

## 1. Cơ chế thu nhận tín hiệu theo nhóm chức năng

1. **Hộp lưu trữ độc lập (`learning-signals-v1.json`):**
   - Lưu trữ tách biệt tại `<home>/chatbox/learning-signals-v1.json`, hoàn toàn không can thiệp hay ghi đè vào hàng đợi Chat cũ (`learningQueue`).
   - Có JSON Schema kiểm định chặt chẽ, giới hạn 10.000 mục, ghi nguyên tử qua `atomicJson`.
   - Từ chối tệp hỏng, symlink hoặc vượt quá 10MB; cơ chế đóng an toàn (fail-closed) khi lỗi ghi: dừng bộ học và báo lỗi, không rơi về luồng Chat.

2. **Phân định nhóm từ ngữ cảnh thực tế (`signalGroup`):**
   - Chỉ xác định nhóm chức năng khi có đúng một ngữ cảnh rõ ràng (`planningSession` / lượt Plan, `workflowDesign` / run / step, hoặc gọi công cụ `office_web_search` / `office_web_read`).
   - Ngữ cảnh mâu thuẫn hoặc không có thông tin được đưa vào `unclassified` chờ người dùng phân loại thủ công; tuyệt đối không suy diễn từ văn bản xuôi hay câu trả lời của mô hình AI.
   - Nhóm `research` nếu thiếu loại con (`researchSubtype`: `legal`, `news`, `professional`) được giữ ở trạng thái `unclassified` và không kích hoạt AI nền.

3. **Chỉ kết quả chạy thật mới ghi nhận trạng thái (`outcome`):**
   - Chỉ các tín hiệu thuộc `kind: 'execution'` mới được phép mang kết quả thực tế (`succeeded`, `failed`, `interrupted`).
   - Các tín hiệu `draft`, `feedback`, `search`, `read` luôn bị ép về `unverified` dù câu trả lời của AI hoặc dữ liệu đầu vào khẳng định đã hoàn thành.

4. **Bảo mật và che mờ dữ liệu riêng tư (`signalText`):**
   - Tự động che mờ số điện thoại, email, đường dẫn tệp (`[path]`), token, API key, mật khẩu (`[secret]`).
   - Các nội dung vi phạm an toàn (`findUnsafe`) bị loại bỏ ngay tại bước thu nhận, không lưu vào tệp tín hiệu.

5. **Nhường việc chính và xử lý gián đoạn:**
   - Bộ xử lý AI nền chỉ chạy khi hệ thống rảnh rỗi (`idle()`), nhường toàn bộ tài nguyên khi có tác vụ chính (chat, workflow, plan, reflect).
   - Khi có tác vụ chen ngang hoặc nhận tín hiệu hủy (`AbortSignal`), tiến trình lập tức dừng với trạng thái `interrupted` mà không tốn lượt thử (`retries: 0`), cho phép tiếp tục sau khi khởi động lại.
   - Mỗi lần gọi mô hình nhẹ chỉ gửi đúng một quan sát đơn lẻ, không ghép nối nhiều phiên hội thoại.

---

## 2. Kiểm chứng chất lượng

- **Bộ kiểm thử liên quan (`vitest run`):** Đạt **87/87 tests (100%)**:
  + [`core/test/learning-signals.test.ts`](file:///Users/phananh/MySoft/core/test/learning-signals.test.ts): 22/22 tests đạt.
  + [`core/test/learning-registry.test.ts`](file:///Users/phananh/MySoft/core/test/learning-registry.test.ts): 46/46 tests đạt.
  + [`core/test/feedback-learning.test.ts`](file:///Users/phananh/MySoft/core/test/feedback-learning.test.ts): 19/19 tests đạt.
- **Kiểm thử hồi quy nhóm tự học đầy đủ:** 89/89 tests đạt khi chạy đồng thời cả `learning-policy.test.ts` (9 tests) và `learning-baseline.test.ts` (12 tests).
- **Kiểm tra kiểu dữ liệu (`npm run typecheck`):** Vượt qua 0 lỗi trên toàn bộ 5 workspace (`shared`, `core`, `bridge`, `addin`, `chatbox`).

---

## 3. Chưa kiểm chứng

- Chưa chạy lại toàn bộ `npm test` của cả kho mã (do có các ca kiểm thử legacy tồn đọng từ các nhánh khác).
- Chưa kiểm chứng tương tác đồ họa trực quan trên ứng dụng đóng gói desktop thực tế với AI production.

---

## BÀN GIAO

- **Đã làm:**
  - Hoàn thiện module thu nhận tín hiệu độc lập [`learning-signals.ts`](file:///Users/phananh/MySoft/core/src/desktop/learning-signals.ts) ghi vào `learning-signals-v1.json`.
  - Đảm bảo quy tắc an toàn: chỉ `execution` mang kết quả thật; che mờ dữ liệu riêng tư; nhường việc chính; lỗi ghi dừng an toàn, không rơi về Chat.
  - Kiểm thử đạt 87/87 tests liên quan (22 ca signals, 46 ca registry, 19 ca feedback) và 0 lỗi typecheck trên 5 workspace.
- **Kết quả và đường dẫn tệp đã tạo/sửa:**
  - [`core/src/desktop/learning-signals.ts`](file:///Users/phananh/MySoft/core/src/desktop/learning-signals.ts): logic hộp tín hiệu, che mờ, lọc trùng, nhường việc chính và xử lý AI nền.
  - [`core/test/learning-signals.test.ts`](file:///Users/phananh/MySoft/core/test/learning-signals.test.ts): 22 ca kiểm thử bao phủ toàn bộ các tình huống biên và quy tắc an toàn.
  - [`tu-hoc-ban-giao-04.md`](file:///Users/phananh/MySoft/tu-hoc-ban-giao-04.md): phiếu bàn giao của Bước 4.
- **Quyết định và giả định:**
  - Chỉ phân loại từ cờ/metadata có căn cứ rõ ràng; mọi trường hợp mơ hồ hoặc research thiếu nhánh con đều gán `unclassified`.
  - Tín hiệu mới và đề xuất sinh ra luôn ở trạng thái `proposed`, không tự ý kích hoạt vào kho học đang chạy.
- **Việc nút sau cần biết:**
  - Hộp tín hiệu `learning-signals-v1.json` độc lập với kho lưu trữ `learning-v1.json`; bước kế tiếp cần liên kết và chuyển đổi đề xuất thành bản ghi có bằng chứng.
  - Các mục `unclassified` cần được giao diện người dùng hiển thị danh sách để phân loại thủ công trước khi kích hoạt xử lý.
- **Việc còn dở hoặc lỗi:**
  - 1 ca lỗi cũ trong `plans.test.ts` ("shows a learned skill as a proposal without installing it") thuộc cơ chế autoActivate của nhánh cũ, không thuộc phạm vi module tín hiệu mới.
