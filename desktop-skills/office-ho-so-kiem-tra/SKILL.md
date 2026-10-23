---
name: office-ho-so-kiem-tra
description: Phối hợp toàn bộ hồ sơ kiểm tra gồm đọc đặc tả, đọc ma trận, sinh đề và đáp án; dùng khi yêu cầu nhiều bước hoặc đối chiếu cả bộ.
load: demand
groups: giao-vien, to-truong
---
# Hồ sơ kiểm tra có đối chiếu

Thực hiện đúng các sản phẩm người dùng yêu cầu. Nếu chỉ đọc một tài liệu hoặc chỉ giải đề thì dùng skill tương ứng, không bắt buộc tạo cả bộ.

1. Đọc `office-doc-dac-ta` bằng office_skill_read khi có bản đặc tả: chuẩn hóa yêu cầu cần đạt, mức độ và vị trí nguồn.
2. Đọc `office-doc-ma-tran` khi có ma trận: chuẩn hóa bảng, kiểm số câu/ý, điểm và các tổng. Đối chiếu với đặc tả; liệt kê xung đột hoặc phần chưa đọc rõ. Nếu thiếu ràng buộc thiết yếu, hỏi cụ thể trước khi sinh đề; không thay nguồn bằng cấu trúc mẫu.
3. Đọc `office-sinh-de` khi cần đề mới: lập bảng phân bổ có truy nguyên, viết câu theo ràng buộc, giải kiểm độc lập và đối chiếu bao phủ.
4. Đọc `office-dap-an` khi cần đáp án: giải từng câu, kiểm nhãn, lời giải và điểm thành phần. Tách bản học sinh khỏi bản giáo viên.
5. Trước khi xuất, báo kiểm tra: yêu cầu nào được bao phủ bởi câu nào; số câu/ý và điểm từng dạng/mức độ; thiếu dữ liệu, lỗi hoặc phần chưa xác minh. Dùng pvta-calc cho tổng và tỉ lệ. Không tuyên bố đạt chỉ vì tổng điểm đúng.
6. Chỉ xuất các tệp đã được yêu cầu, giữ mã đề và bảng đối chiếu đồng nhất. Chế độ Chỉ đọc chỉ trả nội dung; Hỏi duyệt tạo đề xuất; Tự sửa áp dụng qua công cụ. Chỉ thông báo đường dẫn tệp sau kết quả công cụ thành công.

Kết thúc khi các bước thuộc phạm vi đều có đầu ra kiểm chứng được hoặc vấn đề còn mở được nêu cụ thể. Người dùng quyết định phê duyệt nội dung chuyên môn.
