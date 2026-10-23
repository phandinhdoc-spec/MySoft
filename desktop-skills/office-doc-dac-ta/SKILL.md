---
name: office-doc-dac-ta
description: Đọc bản đặc tả kiểm tra, trích yêu cầu cần đạt và mức độ; phát hiện ô thiếu, mâu thuẫn và truy nguyên vị trí nguồn trước khi ra đề.
load: demand
groups: giao-vien, to-truong
---
# Đọc bản đặc tả

## Quy tắc đọc bảng

- Xác định cột bằng tiêu đề Yêu cầu cần đạt, Mức độ, Nội dung, Mã hóa, Dạng thức, Số câu hỏi, Câu số; đọc hết từng hàng, kể cả YCCĐ không bắt đầu bằng động từ quen thuộc.
- Bảng năng lực đứng trước bảng đặc tả là bảng riêng. Khởi tạo lại ánh xạ cột và ngữ cảnh khi sang bảng khác; không cộng lại số liệu của cùng câu ở hai bảng.
- Với ô trống lặp lại nội dung/mức độ, phân biệt gộp ô thật với quy ước trình bày. Nếu chỉ dựa vào hàng trước thì đánh dấu suy luận và đề nghị xác nhận quy ước; không đổi mức độ theo động từ trong YCCĐ.
- Giữ nguyên mã hóa như 1.1, danh sách dạng I / II và mã câu 19a. Mã năng lực không phải số câu; 19a là ý a, không phải cả câu 19. Một YCCĐ có thể gắn nhiều dạng hoặc nhiều mã câu.
- Đọc nguồn chưa phải phân bổ đề: các số 0 trong biểu mẫu chọn câu chỉ là trạng thái chưa phân bổ. Lưu số liệu nguồn riêng, ô thiếu là chưa xác định. Không thay dữ liệu không đọc được bằng đặc tả mẫu hoặc tự cân bằng về 10 điểm.
- Đối chiếu tên dạng phần III giữa hai tệp: trả lời ngắn và tự luận là hai dạng khác nhau. Báo rõ vị trí khác biệt trước khi dùng hai tệp chung một đề.

1. Xác định tài liệu nguồn, môn, phạm vi kiến thức, thời lượng và thang điểm nếu có. Dùng office_file_read để đọc đủ các trang/đoạn bảng liên quan; office_rag_search chỉ giúp tìm vị trí, không thay cho đọc toàn bộ bảng. Với ảnh/PDF scan, xác nhận chữ và cấu trúc nhìn được; ô không đọc rõ ghi `chưa xác định`.
2. Lập danh sách từng yêu cầu: mã ổn định, chủ đề, đơn vị kiến thức, nguyên văn yêu cầu cần đạt, mức độ ghi ở nguồn, dạng câu và số câu/điểm nếu nguồn nêu, vị trí nguồn. Giữ nhãn NB/TH/VD hoặc các nhãn khác đúng tài liệu; phân biệt yêu cầu cần đạt với hoạt động dạy học.
3. Đọc tiêu đề nhiều tầng và ô gộp theo tọa độ bảng. Chỉ kế thừa tiêu đề khi có bằng chứng ô gộp; ô trống khác với số 0. Nếu văn bản trích xuất làm mất hàng/cột, báo hạn chế và yêu cầu nguồn rõ hơn, không tự đoán quan hệ giữa các ô.
4. Giữ riêng dữ kiện nguồn và đề xuất. Không tự thêm số câu, điểm hoặc đổi mức độ theo động từ đơn lẻ. Một yêu cầu có nhiều mức độ phải giữ các nhánh tương ứng.
5. Nếu có ma trận, gọi office_skill_read với name `office-doc-ma-tran` để đối chiếu. Ghi từng bất đồng kèm hai vị trí nguồn; chưa chốt cấu trúc đề khi xung đột chưa được giải quyết.

Hoàn thành khi mọi yêu cầu trong phạm vi đã có dòng truy nguyên hoặc được ghi rõ là thiếu/không đọc được. Đầu ra là bảng trích xuất và danh sách vấn đề; chỉ sinh đề hay tạo tệp khi người dùng yêu cầu bước đó. Khi người dùng yêu cầu JSON, giữ cùng nội dung bằng JSON hợp lệ, dùng null cho dữ liệu chưa biết.
