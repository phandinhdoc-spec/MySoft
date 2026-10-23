---
name: office-doc-ma-tran
description: Đọc ma trận đề kiểm tra từ bảng Word, Excel, PDF; giữ hàng cột và ô gộp, kiểm số câu, điểm, tỉ lệ và mâu thuẫn với đặc tả.
load: demand
groups: giao-vien, to-truong
---
# Đọc ma trận kiểm tra

## Quy tắc đọc bảng nhiều tầng

- Dựng đường dẫn tiêu đề cho mỗi cột: thành phần năng lực → mức độ → mã năng lực. Các mã TN1.1, TN2.3 là nhãn; không diễn giải chữ số trong mã thành số câu hay điểm.
- Đọc dạng I, II, III theo từng hàng; chủ đề gộp dọc chỉ lấy từ ô gốc. Mã tọa độ phải kèm số bảng để tránh nhầm R1C1 giữa hai bảng.
- Giữ riêng bảng ô chi tiết và các dòng tổng. Cộng theo cùng chủ đề, dạng, mức độ, đơn vị rồi đối chiếu tổng nguồn; không cộng các ô tổng gộp dọc nhiều lần.
- Trắc nghiệm đúng/sai có thể phân bổ từng ý sang các mức độ khác nhau. Giữ số câu và số ý riêng; chỉ quy đổi khi nguồn nêu số ý mỗi câu và cách chấm. Nếu biểu mẫu phần mềm chỉ nhận câu nguyên, báo giới hạn biểu mẫu, không kết luận nguồn sai.
- Phần III có thể là trả lời ngắn hoặc tự luận. Số câu không tự chuyển thành điểm. Giữ các ô trống chưa xác định; chỉ kết luận tổng sai khi các ô và quy ước đếm đủ rõ.
- Khi phần mở đầu, tổng bảng và bảng chi tiết khác nhau, nêu từng vị trí cùng số liệu nguyên văn. Không tự chọn bên đúng hoặc chỉnh nguồn cho khớp mẫu 16–2–4.

1. Đọc toàn bộ bảng và chú thích bằng office_file_read, tìm nguồn bằng office_rag_search khi cần. Ghi tên tệp và vị trí bảng/trang. Lấy môn, thời lượng, thang điểm, hình thức và quy tắc chấm từ tài liệu hoặc yêu cầu cụ thể, không áp cấu trúc đề mẫu.
2. Chuẩn hóa từng ô dữ liệu thành: chủ đề, yêu cầu/mã nếu có, mức độ, dạng câu, số câu, số ý/lệnh hỏi, điểm, vị trí ô. Phân biệt số câu với số ý đúng/sai; giữ số thập phân và đơn vị. Tiêu đề gộp kế thừa theo vùng ô thực; ô trống là chưa xác định, không mặc nhiên bằng 0.
3. Tính bằng pvta-calc: tổng số câu, tổng số ý, tổng điểm theo hàng, cột, dạng câu và mức độ; tỉ lệ = điểm nhóm / tổng điểm × 100. Dùng giá trị chưa làm tròn để đối chiếu; nếu chỉ có phần trăm đã làm tròn, ghi rõ độ chính xác thay vì sửa số gốc. Đếm mỗi câu/ý một lần; không cộng lại dòng tổng vào dữ liệu.
4. Đối chiếu các tổng tính được với tổng ghi trong nguồn. Liệt kê bất đồng, vị trí và chênh lệch. Nếu thiếu quy tắc điểm đúng/sai, điểm từng câu hoặc tổng điểm, giữ null/chưa xác định; không áp thang 10 hay tự chia đều điểm.
5. So khớp với bản đặc tả nếu có: chủ đề, yêu cầu cần đạt, mức độ, dạng câu, số câu/điểm. Khi thiếu căn cứ hoặc có mâu thuẫn, báo trạng thái `cần làm rõ` và câu hỏi cụ thể; vẫn trả phần đã đọc được.

Hoàn thành khi các ô có thể đọc đều được truy nguyên và mọi tổng kiểm tra có kết quả hoặc lý do chưa thể tính. Chỉ chuyển sang sinh đề khi ràng buộc đủ và nhất quán; đọc ma trận không đồng nghĩa với xin tạo đề hoặc tệp. Dùng JSON nếu người dùng yêu cầu.
