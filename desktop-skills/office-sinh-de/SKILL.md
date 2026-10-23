---
name: office-sinh-de
description: Sinh đề kiểm tra bám ma trận và bản đặc tả đã đối chiếu; phân bổ từng câu, giữ thang điểm nguồn, tách đề học sinh khỏi đáp án.
load: demand
groups: giao-vien, to-truong
---
# Sinh đề kiểm tra theo nguồn

1. Đọc skill `office-doc-ma-tran` và `office-doc-dac-ta` qua office_skill_read khi nguồn tương ứng chưa được chuẩn hóa. Lấy cấu trúc từ ma trận/đặc tả và yêu cầu người dùng; khi không có nguồn, hỏi các ràng buộc thiết yếu hoặc trình cấu trúc đề xuất để người dùng quyết định. Không áp sẵn số câu, tỉ lệ, thang 10 hoặc coi một mẫu là quy định chung.
2. Lập bảng phân bổ trước khi viết: mã câu/ý → mã yêu cầu cần đạt → chủ đề → mức độ → dạng câu → điểm → vị trí nguồn. Mỗi yêu cầu bắt buộc phải có câu bao phủ, mỗi câu phải có căn cứ. Giải quyết mâu thuẫn trước khi chốt đề, không âm thầm chọn một nguồn thắng.
3. Viết đúng số câu và ý theo bảng. Câu nhiều lựa chọn có một đáp án đúng, các phương án khác nhau và cùng loại/đơn vị; phương án nhiễu phản ánh sai lầm có thể giải thích. Câu đúng/sai có từng mệnh đề độc lập đủ dữ kiện, tách số câu và số ý. Câu tự luận có yêu cầu rõ, dữ kiện đủ và điểm phù hợp. Mức độ dựa vào thao tác tư duy thực, không chỉ động từ.
4. Giải độc lập từng câu, dùng pvta-calc cho phép tính, đối chiếu đơn vị, điều kiện và đáp án duy nhất. Nếu phép tính đã được công cụ xác nhận trong hội thoại, dùng lại kết quả đúng ngữ cảnh. Với lỗi/mơ hồ, sửa câu rồi giải lại; không giữ câu lỗi chỉ để đủ số lượng.
5. Kiểm toàn đề với bảng phân bổ: không trùng/mất mã, không vượt phạm vi, tổng số câu/ý và điểm theo hàng/cột khớp nguồn. Kiểm ngữ liệu, hình/bảng tham chiếu có thực và đủ để trả lời. Chưa kiểm được phần nào phải nêu rõ.
6. Đề học sinh tách đáp án và dấu hiệu chỉ đáp án. Nếu người dùng yêu cầu đáp án, dùng `office-dap-an`. Nếu yêu cầu tệp, xuất create_office DOCX (hoặc định dạng được hỗ trợ đã chọn), gồm đề và đáp án tách tệp hoặc ngắt trang theo yêu cầu; chỉ báo tạo thành công khi công cụ xác nhận. Nếu yêu cầu JSON thì trả dữ liệu, không tạo tệp ngoài yêu cầu.

Hoàn thành khi từng câu đã được giải, kiểm bao phủ và kiểm điểm; báo rõ mọi phần còn cần duyệt, không tự công bố đề đã được phê duyệt.
