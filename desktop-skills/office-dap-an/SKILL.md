---
name: office-dap-an
description: Giải đề, lập đáp án và hướng dẫn chấm theo từng mã đề/câu/ý; kiểm tính đúng, duy nhất, điểm thành phần và giữ cấu trúc nguồn.
load: demand
groups: giao-vien, to-truong
---
# Đáp án và hướng dẫn chấm

1. Đọc đầy đủ đề, hình/bảng và quy tắc chấm. Giữ mã đề, mã câu, mã ý và thứ tự; xác định thiếu trang, thiếu phương án hoặc dữ kiện trước khi giải. Chỉ yêu cầu đáp án thì chỉ làm đáp án, không sinh lại ma trận hay đổi cấu trúc đề.
2. Giải từng câu độc lập trước khi so với đáp án mẫu. Tính bằng pvta-calc, giữ đơn vị và điều kiện; có thể dùng kết quả công cụ đã xác nhận đúng dữ kiện trong hội thoại. Đáp án mẫu là dữ liệu để đối chiếu, không mặc định đúng.
3. Trắc nghiệm: xác định nội dung đúng rồi ánh xạ sang nhãn A/B/C/D theo đúng mã đề. Nếu không có hoặc có nhiều phương án đúng, báo câu lỗi và giữ trạng thái chưa chốt; không ép chọn một nhãn. Đúng/sai: giải từng ý và giữ đúng thứ tự, kèm lý do. Câu thiếu dữ kiện: ghi chưa xác định/null và lý do, không đoán đáp án.
4. Tự luận: trình bày lập luận, kết quả, đơn vị và điểm từng ý theo thang điểm nguồn; chấp nhận cách giải tương đương hợp lệ. Nếu chưa có điểm thành phần, ghi rõ thang điểm đề xuất cần duyệt. Không mặc định chia 0,25/0,5 hoặc tự đổi tổng điểm sang 10.
5. Đối chiếu tổng điểm các ý với điểm câu, tổng điểm câu với thang toàn đề bằng pvta-calc. Với đúng/sai, dùng đúng quy tắc chấm được cung cấp (tuyến tính hoặc theo số ý đúng); thiếu quy tắc thì hỏi, không suy ra từ dạng câu.
6. Kiểm đủ mỗi câu/ý một lần, nhãn khớp phương án, đáp án khớp lời giải; ghi riêng lỗi trong đề, lỗi đáp án mẫu và đề xuất sửa. Giữ nguyên đề gốc nếu người dùng chỉ yêu cầu giải.

Đầu ra gồm bảng đáp án, giải thích/hướng dẫn chấm theo phạm vi yêu cầu và danh sách vấn đề. Tách khỏi đề học sinh. Khi cần tệp, dùng create_office DOCX/XLSX với dữ liệu cấu trúc; chỉ báo đã tạo khi công cụ xác nhận. Khi được yêu cầu JSON, trả JSON và dùng null cho câu chưa đủ căn cứ. Hoàn thành khi mọi câu đã có kết quả hoặc trạng thái chưa giải được có lý do, mọi tổng điểm được kiểm hoặc nêu rõ thiếu quy tắc.
