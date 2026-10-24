# Plan và Plan Pro

Bộ chọn trong khung chat có Chat, Plan và Plan Pro. Khi chọn Plan hoặc Plan Pro, ô ngay bên phải nhận `KGH` (mặc định, không có hạn giờ cục bộ) hoặc số phút nguyên từ 1 đến 35791. Thời gian tính cho cả lượt, gồm khảo sát, công cụ đọc, phản biện và sửa nháp. Đổi ô thời gian áp dụng cho lượt gửi tiếp theo. Nút Dừng/Esc vẫn hủy lượt hiện tại. Giới hạn của nhà cung cấp AI hoặc mất kết nối vẫn có thể kết thúc yêu cầu.

Plan Pro dùng công cụ khảo sát sẵn có của PVTA, sau đó điều phối:

1. Kiểm tra cấu trúc khảo sát và hợp đồng từng bước: ID, đầu vào, đầu ra, phụ thuộc, tiêu chí hoàn thành, xử lí lỗi; phát hiện vòng lặp và xung đột đầu ra.
2. Gọi AI ở vai trò phản biện riêng, đối chiếu bản nháp với yêu cầu và bằng chứng công cụ đã thu được.
3. Sửa nháp theo lỗi cụ thể và kiểm tra lại, tối đa ba vòng. KGH bỏ hạn giờ, không bỏ giới hạn số vòng.
4. Chỉ nhận bản nháp khi kiểm tra cấu trúc và phản biện đều đạt. Thiếu dữ kiện thiết yếu thì hỏi người dùng; hết vòng thì giữ nháp và báo chưa đạt. Harness đi cùng Plan Pro cả lúc phản biện nháp và kiểm định từng bước khi chạy.

## Từ bản nháp sang kế hoạch và quy trình

Trong Plan và Plan Pro, mọi lượt chỉ trao đổi và cập nhật bản nháp; kể cả lời đồng ý cũng chưa công bố hay chạy kế hoạch. Bản nháp hợp lệ được lưu theo hội thoại và giữ qua lần mở lại ứng dụng.

Cách nhanh nhất: bấm nút **Duyệt** ngay bên phải ô chế độ (bên trái nút gửi). Ở Chat, nút xám và khóa; ở Plan/Plan Pro, nút đỏ chữ trắng. Khi bấm, PVTA dừng ngay lượt đang bàn (nếu có), gửi AI **toàn văn trao đổi** của hội thoại (không chỉ vài lượt gần nhất; quá 150.000 ký tự thì giữ yêu cầu đầu và phần gần nhất, ghi rõ đã lược), yêu cầu xuất một khối `pvta-plan`, rồi công bố kế hoạch và lưu quy trình như khi chốt. Plan Pro vẫn qua harness phản biện. Nếu AI chưa xuất được kế hoạch, bản nháp cũ được giữ và PVTA báo cần bổ sung gì để bấm Duyệt lại. Duyệt thành công thì bộ chọn tự về Chat.

Cách cũ vẫn dùng được: chuyển bộ chọn sang **Chat**, rồi gửi **Chốt kế hoạch** hoặc **Đồng ý với kế hoạch** để công bố đúng bản nháp hiện tại. Có thể gửi **Lập kế hoạch…** trong Chat để tạo kế hoạch chính thức theo yêu cầu mới; nếu tiếp nối nháp Plan Pro thì vẫn qua harness. Chỉ chuyển bộ chọn sang Chat chưa đủ để chốt nháp. Câu hỏi, lời từ chối và trao đổi tiếp vẫn giữ luồng nháp.

Khi công bố thành công, hệ thống tắt nháp, hiển thị thẻ kế hoạch và lưu quy trình liên kết vào bộ quản lý quy trình. Chốt không tự chạy: các bước vẫn chờ, chưa có lượt chạy; người dùng bấm **Duyệt và chạy** khi muốn thực hiện. Nếu lượt sửa nháp lỗi hoặc bị ngắt, bản cũ vẫn ở lịch sử nhưng không được tự chốt thay cho yêu cầu sửa còn dở.

Mỗi lượt lưu tiến độ, vòng hiện tại, bản nháp gần nhất và vấn đề còn lại trong tin nhắn người dùng. Đóng ứng dụng giữa chừng đánh dấu bị ngắt khi mở lại. Người dùng có thể xem/copy nháp để yêu cầu tiếp; chưa có cơ chế tự động khởi động lại lượt bị ngắt.

Plan/Plan Pro chỉ đọc, không cho mô hình gọi MCP ngoài luồng kiểm soát. Kế hoạch được tạo vẫn chưa duyệt và chưa thực hiện. Phản biện dùng mô hình đang chọn qua lời nhắc riêng; không phải dịch vụ Google hay một đội tác nhân độc lập. Phản biện AI không chứng minh thông tin nguồn là đúng.

## Cơ sở thiết kế

- [Google: Agent Harness with the Google Cloud Developer Plugin and Workflow Skills](https://codelabs.developers.google.com/agent-harness-developer-plugin?hl=en): lớp điều phối cung cấp công cụ, ngữ cảnh và vòng thực thi quanh mô hình.
- [Google: The Anatomy of Harness Engineering](https://developers.googleblog.com/en/the-anatomy-of-harness-engineering-how-to-evaluate-iterate-and-guard-ai-coding-agents/): đánh giá hành vi quan sát được, kiểm chứng trước khi hoàn tất và kết hợp kiểm tra xác định với đánh giá toàn luồng.

PVTA áp dụng các nguyên tắc trên cho lập kế hoạch. Đây là triển khai riêng, không nhúng Google Antigravity hoặc Google Cloud Developer Plugin.

## Kiểm chứng

Các kiểm thử tại `core/test/plans.test.ts`, `core/test/api-transport.test.ts`, `bridge/test/engine.test.ts` và `chatbox/test/planning-controls.test.ts` kiểm tra: KGH qua các mốc thời gian cũ, thời hạn tổng giữa nhiều vòng, hủy API/CLI, giữ nháp khi bị ngắt, chặn kế hoạch lỗi, vòng phản biện/sửa và bộ chọn giao diện.
