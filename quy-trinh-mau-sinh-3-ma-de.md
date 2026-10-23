# Quy trình mẫu: Sinh 3 mã đề từ một đề gốc

Đầu vào (`{{input}}`): MỘT tệp ảnh, PDF hoặc Word chứa đề kiểm tra gốc.
Thư mục làm việc: `de-moi/` trong thư mục xuất. Các nút bàn giao cho nhau bằng TÊN TỆP CỐ ĐỊNH bên dưới, không dựa vào `{{prev}}`.

## Ghi chú thiết kế (đọc trước)
- Ngôn ngữ quy trình chưa có chỉ thị sinh nút theo số câu, nên dựng sẵn K = 10 ô câu (k = 1..10). Đề nhiều hơn 10 câu: nhân bản cặp nút S2/S3 theo mẫu. Đề ít hơn: nút thừa ghi "Không có câu k" rồi kết thúc.
- Chỉ thị `!` chạy trước phần AI, không bắt được kết quả AI, nên bàn giao bằng tệp. Mẫu này không bắt buộc dùng chỉ thị `!`.
- `!lap-lai` không đọc được kết quả AI để quyết định lặp, nên Section 5 dùng hai nút tuần tự (kiểm tra, rồi làm lại câu lỗi).
- Chưa chạy thử với đề ảnh scan/PDF thật; chưa xác minh `!dung neu` có bỏ qua phần prompt AI hay không.
- Tệp tên cố định: `header.md`, `quy-tac-de.md`, `danh-sach-cau.md`, `cau-k.md`, `learn-cau-k.md`, `moi-cau-k-v1.md`, `moi-cau-k-v2.md`, `moi-cau-k-v3.md`, `v1.md`, `v2.md`, `v3.md`, `bao-cao-kiem-tra.md`, `v1.docx`, `v2.docx`, `v3.docx`.

## Bảng nút (28 nút)

| Mã nút | Phải chờ | Việc |
|---|---|---|
| s1-doc-de | không | Đọc đề, lưu header, quy tắc đề, tách từng câu, lập danh sách |
| s2-cau-1 … s2-cau-10 | s1-doc-de | Phân tích câu k, tạo `learn-cau-k.md` |
| s3-cau-1 … s3-cau-10 | s2-cau-k (cùng số) | Tạo 3 câu mới v1, v2, v3 cho câu k |
| s4-gom | s3-cau-1 … s3-cau-10 | Gom thành `v1.md`, `v2.md`, `v3.md` |
| s5a-kiem-tra | s4-gom | Kiểm tra 3 mã đề, ghi `bao-cao-kiem-tra.md` |
| s5b-lam-lai | s5a-kiem-tra | Làm lại câu lỗi, chèn đúng vị trí |
| s6-xuat-word | s5b-lam-lai | Xuất `v1.docx`, `v2.docx`, `v3.docx`, đưa liên kết, hỏi người dùng |

Cách dựng nhanh: tạo nút `s2-cau-1`, `s3-cau-1` đúng prompt rồi nhân bản (nếu giao diện có), đổi số k và mã nút chờ. Nếu giao diện không có nhân bản thì dán thủ công từng nút.

---

## Prompt nút `s1-doc-de`

```text
Đầu vào: {{input}} (tệp ảnh, PDF hoặc Word chứa đề kiểm tra gốc). Đọc kỹ toàn bộ, kể cả công thức và hình.

Làm lần lượt, ghi mọi tệp vào thư mục de-moi/ (tạo nếu chưa có):
1. Phân tích phần header của đề (trường, tên bài kiểm tra, môn, lớp, thời gian, họ tên, mã đề...). Nếu có, lưu nguyên văn vào header.md. Nếu không có, ghi "Không có header".
2. Ghi quy tắc trình bày đề quan sát được vào quy-tac-de.md: cách đánh số câu, kiểu câu (trắc nghiệm, đúng/sai, tự luận), thang điểm, phông chữ, bố cục, cách ghi đáp án nếu có.
3. Đếm số câu. Mỗi câu lưu nguyên văn (kèm phương án, hình mô tả, điểm) vào cau-1.md, cau-2.md, ... theo số thứ tự trong đề.
4. Ghi danh-sach-cau.md: bảng gồm số câu, tên tệp, loại câu, điểm. Đây là mảng quản lý các tệp câu hỏi.
5. Không chép nội dung đề vào trả lời; chỉ báo tổng số câu và danh sách tệp đã tạo. Nếu đề quá 10 câu, báo rõ để nhân bản thêm nút.
Phần nào không đọc chắc chắn thì đánh dấu [CHƯA CHẮC], không đoán.
```

## Prompt nút `s2-cau-k` (thay k = 1..10; phải chờ `s1-doc-de`)

```text
Đọc danh-sach-cau.md trong de-moi/. Nếu không có câu k thì chỉ trả lời "Không có câu k" và dừng.
Nếu có, đọc cau-k.md và quy-tac-de.md. Phân tích rồi ghi vào learn-cau-k.md:
- Cấu trúc câu hỏi: loại câu, số ý, dữ kiện cho sẵn, cách đặt vấn đề.
- Yêu cầu cần đạt của từng ý (nhận biết, thông hiểu, vận dụng; kiến thức, kỹ năng).
- Cách ra câu hỏi: ngữ cảnh, kiểu số liệu, độ khó, bẫy thường gặp.
- Đáp án và lời giải gốc nếu đề có; nếu không, tự giải và ghi rõ là tự giải.
- Quy tắc để sinh câu tương đương: những gì được đổi (số liệu, ngữ cảnh) và những gì phải giữ.
Mọi phép tính dùng công cụ tính, không nhẩm.
```

## Prompt nút `s3-cau-k` (thay k = 1..10; phải chờ `s2-cau-k` cùng số)

```text
Nếu learn-cau-k.md không có hoặc ghi "Không có câu k" thì trả lời "Không có câu k" và dừng.
Đọc learn-cau-k.md. Tạo 3 câu mới, cùng số thứ tự k, cùng loại, cùng yêu cầu cần đạt và độ khó với câu gốc, nhưng khác nhau đôi một và khác câu gốc về số liệu, ngữ cảnh:
- moi-cau-k-v1.md
- moi-cau-k-v2.md
- moi-cau-k-v3.md
Mỗi tệp gồm: đề câu (đúng số thứ tự k và điểm như gốc), các phương án nếu trắc nghiệm, đáp án và lời giải ngắn. Câu tự luận phải có đáp án đầy đủ. Dữ kiện phải hợp lý, chính tả chuẩn. Mọi phép tính dùng công cụ tính, không nhẩm.
```

## Prompt nút `s4-gom` (phải chờ toàn bộ `s3-cau-1 … s3-cau-10`)

```text
Trong de-moi/, gom các tệp moi-cau-k-v1.md (k tăng dần, bỏ qua tệp không tồn tại) vào v1.md. Làm tương tự cho v2.md và v3.md.
Mỗi tệp bắt đầu bằng header.md (nếu có), rồi các câu theo số thứ tự tăng dần, giữ đúng số câu và điểm như đề gốc. Phần đáp án để ở cuối tệp theo từng câu.
Báo số câu của mỗi tệp và câu nào bị thiếu.
```

## Prompt nút `s5a-kiem-tra` (phải chờ `s4-gom`)

```text
Đọc v1.md, v2.md, v3.md trong de-moi/. Kiểm tra từng câu:
- Sai chính tả, sai dấu, sai đơn vị, sai ký hiệu.
- Dữ kiện bất hợp lý (số liệu phi thực tế, mâu thuẫn, thiếu dữ kiện).
- Câu trắc nghiệm có hơn một hoặc không có đáp án đúng.
- Câu tự luận sai đáp án: tự giải lại, mọi phép tính dùng công cụ tính, không nhẩm.
Ghi bao-cao-kiem-tra.md gồm bảng: mã đề, câu số, loại lỗi, mô tả, hướng sửa. Cuối tệp ghi danh sách "CẦN LÀM LẠI" dạng: v1: 3, 5; v2: (không); v3: 7. Nếu không lỗi, ghi "CẦN LÀM LẠI: không".
```

## Prompt nút `s5b-lam-lai` (phải chờ `s5a-kiem-tra`)

```text
Đọc bao-cao-kiem-tra.md. Với mỗi (mã đề, câu số) trong danh sách CẦN LÀM LẠI:
1. Đọc learn-cau-k.md của câu đó.
2. Tạo lại câu theo cách của Section 3 (cùng yêu cầu cần đạt, số liệu mới, tránh lỗi đã nêu), ghi đè moi-cau-k-vX.md.
3. Chèn câu mới đúng vị trí số k trong vX.md, giữ nguyên các câu khác.
Tự kiểm tra lại các câu vừa làm; mọi phép tính dùng công cụ tính. Câu nào vẫn chưa ổn thì ghi vào cuối bao-cao-kiem-tra.md mục "CHƯA SỬA ĐƯỢC" kèm lý do. Chỉ làm lại một lượt. Nếu không có câu cần làm lại, trả lời "Không có câu cần làm lại".
```

## Prompt nút `s6-xuat-word` (phải chờ `s5b-lam-lai`)

```text
Dùng kỹ năng Word (soạn đề) và quy tắc trình bày trong quy-tac-de.md cùng header.md để tạo 3 tệp Word từ v1.md, v2.md, v3.md:
- v1.docx, v2.docx, v3.docx trong thư mục xuất.
- Mã đề ghi rõ trên từng tệp (đề 1, 2, 3). Công thức dùng LaTeX/Equation. Đáp án để ở trang riêng cuối tệp.
- Tên tệp đã tồn tại thì dùng tên mới, không ghi đè.
Chỉ đưa liên kết khi công cụ xác nhận đã tạo xong từng tệp; tệp nào lỗi thì nói rõ. Nếu có mục "CHƯA SỬA ĐƯỢC" trong bao-cao-kiem-tra.md, nhắc người dùng kiểm tra các câu đó.
Cuối cùng hỏi: "Thầy cô muốn xem, sửa, hay lưu như (tên/thư mục khác)?"
```
