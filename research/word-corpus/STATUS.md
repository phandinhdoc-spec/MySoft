# Trạng thái nghiên cứu mẫu Word ngày 17/10/2026

Mục tiêu: khoảng 50 giáo án Word đẹp theo khung 5512, có năng lực số và AI, rồi rút quy tắc cho PVTA; mở rộng văn bản hành chính và pháp lý.

## Đã làm

- Tải 13 tệp căn cứ/phụ lục công khai: **4 DOCX khung 5512 và 9 PDF**. Đây không phải 13 giáo án hoàn chỉnh. Tệp nằm trong `raw/`; URL, hash, dung lượng và kết quả tải trong `downloads.json`.
- Kiểm tra 12 trang ứng viên Violet: tình trạng từng nguồn trong `candidates.json`. Chỉ bản xem trước công khai, không tính là đã tải Word, không chứng nhận hình thức đẹp.
- Thử 16 liên kết Word do trang THCS Nguyễn Trực công bố qua đúng cơ chế tải của trang; phản hồi không phải DOCX. Kết quả trong `lessons.json`.
- Đọc khung bài dạy 5512, xem cấu trúc Word; đọc miền ứng dụng AI trong khung năng lực số; xem trang PDF 21–22 của Nghị định 30 để đối chiếu thể thức. Các PDF Nghị định 78 và 187 đã tải nhưng chưa rà soát đầy đủ nội dung/hiệu lực; không suy ra quy tắc chi tiết từ những phần chưa đọc.
- Tạo skill cơ sở về giáo án, hành chính và pháp lý cho add-in và ChatBox. Phân biệt quy định có nguồn với đề xuất thiết kế, giữ nội dung khi chỉ làm đẹp, yêu cầu mã năng lực có căn cứ. Đây là biên soạn quy trình có nguồn, không phải huấn luyện mô hình.
- Thêm trình thống kê cấu trúc DOCX và loại trùng theo tệp/nội dung. Công cụ không tự chấm đẹp hay xác nhận tuân thủ.

## Chưa hoàn thành

**Chưa có bộ 50 giáo án Word hoàn chỉnh và chưa phân tích trực quan 50 mẫu.** Violet và kho GDTC đã kiểm tra yêu cầu đăng nhập khi tải bản gốc. Một số liên kết trường không trả về tệp. Không vượt qua đăng nhập, thanh toán hoặc dựng tệp giả thay cho bản gốc.

Để hoàn tất phần học từ mẫu: bổ sung khoảng 50 DOCX người dùng có quyền sử dụng (ZIP), giữ nguồn/tác giả nếu có. Sau đó chạy thống kê, loại trùng, đọc nội dung và xem từng trang kết xuất; chỉ các mẫu đã duyệt mới được dùng để rút thêm quy tắc. Không đưa toàn bộ giáo án cộng đồng vào gói phân phối phần mềm nếu chưa có quyền.

## Lặp lại thống kê

Từ gốc repository:

```bash
python scripts/research/audit-word-corpus.py research/word-corpus/raw research/word-corpus/structure-audit.json
```

Bốn DOCX hiện tại là khung trống/phụ lục, không phải mẫu giáo án đạt yêu cầu tuyển chọn. Chỉ số từ khóa trong báo cáo không thay cho đọc và thẩm định.

## Bổ sung từ người dùng

Đã phân tích ba giáo án DOCX Bài 18–20 về kim loại, cập nhật skill giáo án cả add-in và ChatBox. Đã đọc văn bản/cấu trúc và kiểm tra trực quan chọn mẫu ba trang, không tuyên bố thẩm định mọi trang. Xem `user-lessons-audit.json` và `skills/pvta-giao-an/references/sample-review.md`. Ba tệp gốc không đưa vào repository. Hiện có ba mẫu bài dạy hoàn chỉnh để rút quy tắc ban đầu; mục tiêu 50 mẫu vẫn chưa hoàn thành.
