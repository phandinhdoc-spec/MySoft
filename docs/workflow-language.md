# Biến, hàm và vòng lặp trong PVTA Chat

Áp dụng cho **quy trình độc lập**, không phải bộ chạy Plan. Viết chỉ thị ở đầu dòng trong prompt; ví dụ trong khối mã Markdown không thực thi. `{{input}}` vẫn là đầu vào chung, `{{prev}}` giữ cơ chế bàn giao hiện có. Không có bí danh `!input`. `#` dành cho quy tắc; các chỉ thị trước đây dùng `#bien`, `#ham`… cần đổi thủ công sang `!bien`, `!ham`…; dữ liệu đã lưu không bị viết lại tự động.

## Khai báo và dữ liệu

```text
!bien so-lan = 0
!bien thong-bao = "Xin chào"
!dau-vao de-bai = "/Users/giao-vien/Documents/de bai.pdf"
!dau-vao hinh = "![Hình](</Users/giao-vien/Documents/hinh ve.png>)"
!dau-vao ket-qua = @truoc
!gan so-lan = $so-lan + 1
!in $so-lan
!dau-ra = {so-lan: $so-lan, thong-bao: $thong-bao}
```

Thay đường dẫn ví dụ bằng tệp thật. Đường dẫn hoặc toàn bộ liên kết/ảnh Markdown sau `=` bắt buộc nằm trong dấu nháy kép (`"..."` hoặc `“...”`); chỉ `@truoc` không cần nháy. Nút File/Image tự chèn liên kết có nháy; chỉ thị `!dau-vao` đọc và giải mã đường dẫn đó, không tự dò liên kết ngoài khai báo. Tệp phải tồn tại và đọc được. Có thể có nhiều đầu vào với tên khác nhau.

`@truoc` lấy giá trị có kiểu từ `!dau-ra` của nút nguồn. Nhiều nguồn tạo đối tượng theo mã nút, mỗi phần có `name` và `value`; truy cập bằng `$ket-qua["mã-nút"].value`. Nút không có `!dau-ra` truyền kết quả AI như trước. `!in` chỉ thêm dòng vào **Nhật kí bước**, không truyền tiếp. Mỗi nút tối đa một `!dau-ra`; nhiều giá trị dùng mảng hoặc đối tượng.

Giá trị ban đầu của `!bien` là hằng: số, chuỗi JSON trong dấu nháy kép, true/false/null, mảng hoặc đối tượng. Khởi tạo một lần mỗi lượt chạy. Dùng `!gan` để tính từ biến khác. Biểu thức hỗ trợ `+ - * / %`, `== != < <= > >=`, `&& || !`, ngoặc, truy cập trường và chỉ số hằng. Không thực thi JavaScript, shell hoặc Python từ biểu thức.

## Hàm

```text
!ham tinh-tong(a, b)
[
  Cộng hai tham số a và b.
]
{
  tong: tổng của a và b
}
!goi lan-tinh = tinh-tong($so-lan, 1)
!gan so-lan = $lan-tinh.tong
!in $lan-tinh.tong
```

Khai báo không tự chạy. Lần gọi đầu yêu cầu AI sinh **biểu thức thuần**, ví dụ `{tong: $a + $b}`. Người dùng xem mô tả, biểu thức và duyệt trước khi chạy. Triển khai lưu cùng quy trình; đổi tên, tham số, mô tả hoặc đầu ra phải duyệt lại. Nhập mẫu/nhân bản không mang phê duyệt sang quy trình mới.

Hàm chỉ đọc tham số, không đọc/sửa biến ngoài, không truy cập tệp/mạng hoặc gọi hàm khác. Hàm có đầu ra trả đối tượng đúng các trường khai báo. Hàm không đầu ra dùng `{}` hoặc bỏ khối đầu ra, gọi bằng `!goi ten-ham(...)`, triển khai trả `null`; không được gán kết quả. Hiển thị giá trị bằng `!in` tại nút. Tác vụ không biểu diễn được bằng biểu thức thuần vẫn dùng prompt AI thông thường.

## Phạm vi và thứ tự

- Ngoài khung: tên thuộc toàn quy trình. Trong khung: tên thuộc khung trong cùng và nhìn thấy từ các khung con.
- Khung con được cập nhật biến cha. Cấm trùng tên cùng phạm vi và cấm che khuất tên cha. Hai khung rời nhau có thể có tên riêng giống nhau.
- `input`, `prev` và các tên prototype được dành riêng. Tên cho phép chữ không dấu, số, `_`, `-`, không bắt đầu bằng số.
- Khung lồng tối đa ba tầng. Khung chồng một phần hoặc có cùng tập nút bị từ chối.
- Quy trình có chỉ thị trạng thái chạy lần lượt theo phụ thuộc; các nút cùng sẵn sàng được chọn theo thứ tự danh sách. Quy trình AI cũ giữ cách chạy song song.

Nút kiểm tra phải chờ các nút cập nhật biến được kiểm tra. Bộ chạy không tự thêm liên kết. Lỗi chỉ thị dừng lượt chạy, kể cả khi nút bật “Lỗi vẫn chạy tiếp”.

## Ví dụ đã kiểm thử: đếm đến 3

| Mã nút | Phải chờ | Prompt |
|---|---|---|
| start | Không | `!bien so-lan = 0` |
| left | start | Công việc thứ nhất trong vòng |
| right | start | Công việc thứ hai trong vòng |
| check | left, right | Các chỉ thị bên dưới |

```text
!gan so-lan = $so-lan + 1
!in $so-lan
!dau-ra = $so-lan
!lap-lai "start" neu $so-lan < 3
!dung neu $so-lan == 3
```

Với nút tạo bằng giao diện, thay `"start"` bằng **mã thực của nút đầu vòng** trong danh sách gợi ý. Hoàn tất cả hai công việc mới tăng một lần; nhật ký hiện 1, 2, 3. Đi qua `start` lần nữa không đặt lại biến về 0.

Chỉ thị chạy theo thứ tự trước phần prompt AI của nút. Lặp/dừng có điều kiện đúng kết thúc phần chỉ thị còn lại; đặt `!in` và `!dau-ra` trước điều khiển nếu cần chúng ở vòng cuối. Vòng lặp chứa các nút trên đường từ nút đầu tới nút kiểm tra; nhánh thoát sớm bị chặn. Giới hạn 100 vòng và 30 phút toàn lượt. Dừng không mở bước mới; do tuần tự hóa, không có bước trạng thái đang chạy song song lúc xử lý lệnh dừng.

## Gợi ý, lưu và tương thích

Gõ `!`, ` để xem gợi ý cục bộ; `#` chỉ mở quy tắc, kể cả quy tắc có tên `bien`, `ham` hay `in`. lỗi hiện kèm mã nút và dòng. Thiếu tên/giá trị khi rời ô prompt mở popup. **Gợi ý khai báo / trao đổi** cho nhập yêu cầu, chọn tệp thật, nhờ AI đề xuất, sửa bản xem trước. Chỉ **Áp dụng** mới đổi prompt; **Hủy** giữ nguyên. Không gọi AI theo từng phím gõ. Ngữ cảnh gửi gợi ý chỉ gồm bản nháp đang mở, không lấy hội thoại/quy trình khác.

Đóng/mở trình sửa, ẩn/hiện công cụ không xóa khai báo. Bấm **Lưu thay đổi** để giữ qua lần mở ứng dụng. Dữ liệu `frame.decl` vẫn được giữ. Khi dùng chỉ thị mới, biến hằng cũ ở khung và dòng `{{a = 2}}` được đọc an toàn; hàm `!{{tenHam: mô tả}}` bị chặn, yêu cầu chuyển thủ công. Quy trình chỉ dùng khai báo khung cũ giữ cơ chế sinh mã, phản biện và duyệt trước đây.

## Giới hạn và kiểm chứng

- Chưa khôi phục trạng thái biến giữa các lượt hoặc chạy từng nấc: bộ chạy từ chối, không dùng trạng thái thiếu. Chạy trọn lượt mới tạo trạng thái mới.
- Chưa hỗ trợ chỉ thị mới trong Plan hoặc quy trình con được trải phẳng.
- AI trong kiểm thử được giả lập; chưa xác nhận chất lượng gợi ý/sinh biểu thức bằng tài khoản AI thật hoặc giao diện desktop native.
- Dữ liệu gốc “Quy trình mới” được đọc, không sửa: tên đúng là `so-lan`; `END` chỉ chờ “Bước 1”, bước hoàn thiện Word chờ `END`. Cần người dùng chọn lại quan hệ chờ trước khi chuyển dữ liệu này thành vòng lặp.

## Tệp triển khai và kết quả kiểm tra

Cập nhật cú pháp `!` và đường dẫn có ngoặc kép ngày 23/10/2026: 143/143 kiểm thử liên quan đạt (11 tệp); kiểm tra kiểu core/chatbox và build giao diện đạt. Build còn cảnh báo chunk lớn và import Tauri. Đã kiểm thử gợi ý `!`, quy tắc `#bien`, lưu File/Image cùng đính kèm và đọc lại đường dẫn có khoảng trắng/ký tự đặc biệt. Chưa kiểm tra trực quan trên desktop native.

Các tệp được sửa/thêm cho tính năng này (những thay đổi có sẵn trong dự án được giữ lại):

- Bộ phân tích và biểu thức: `core/src/desktop/workflow-language.ts`, `core/src/desktop/workflow-expression.ts`.
- Bộ chạy, dữ liệu và gợi ý AI: `core/src/desktop/workflows.ts`, `core/src/desktop/types.ts`, `core/src/desktop/workflow-resources.ts`, `core/src/desktop/runtime.ts`.
- Giao diện: `chatbox/src/WorkflowPromptAssistant.tsx`, `chatbox/src/StepComposer.tsx`, `chatbox/src/WorkflowPanel.tsx`, `chatbox/src/WorkflowGraph.tsx`, `chatbox/src/CodeApproval.tsx`, `chatbox/src/step-composer.css`.
- Kiểm thử: `core/test/workflow-language.test.ts`, `core/test/workflow-suggestions.test.ts`, `chatbox/test/step-composer.test.ts`.
- Hướng dẫn: tài liệu này, `README.md`, `README-addin.md`.

Kiểm chứng ngày 23/10/2026:

- Trước sửa: nhóm kiểm thử quy trình/khung/chạy mã/ô prompt đạt **50/50**.
- Sau sửa: nhóm liên quan gồm ngôn ngữ, gợi ý AI, bộ chạy, tài nguyên, khung, chạy mã, ô prompt và thẻ duyệt đạt **103/103**, 8 tệp kiểm thử.
- `npm run typecheck`: đạt toàn workspace. Build Vite của chatbox và bundle esbuild của core sidecar đạt; Vite còn cảnh báo kích thước chunk và import Tauri.
- Lượt kiểm thử rộng core + chatbox: **1188 đạt, 2 lỗi, 1 bỏ qua**. Hai lỗi thuộc kiểm thử Brain thật: môi trường không cho ghi cache ngoài phạm vi (`Operation not permitted`). Lượt này chạy trước khi bổ sung nhóm kiểm thử cuối về hủy duyệt và lỗi backend; nhóm bổ sung nằm trong kết quả 103/103 bên trên.
- Bốn lỗi Python ban đầu hết khi bỏ biến `PVTA_BUNDLED_RUNTIME` của ứng dụng đang cài; kiểm thử Python đạt **7/7**. Lỗi `EEXIST` của project-storage hết khi đặt `PVTA_RESULT_DIR` vào thư mục tạm mới; nhóm này đạt **11/11**. Không sửa mã Python, Brain hay project-storage để làm xanh kiểm thử.
- Không chạy quy trình thật có ghi Office, không thay dữ liệu gốc, không đóng gói/phát hành hoặc cài đè ứng dụng. Chưa kiểm tra desktop native và tài khoản AI thật.
