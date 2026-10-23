# PVTA CLI

Giao diện terminal thật, dùng chung `DesktopRuntime` với PVTA Desktop. Giữ nguyên các ảnh mẫu trong `docs/cli-mau/`; CLI dựng bằng chữ Unicode và màu ANSI, không chạy ảnh HTML trong terminal.

## Khởi chạy từ Bash, Zsh hoặc Fish

Yêu cầu Node.js ≥ 22.12 và các phụ thuộc của repository đã được cài.

```sh
cd /Users/phananh/MySoft
npm run build:cli
./cli/pvta
```

Hoặc `npm run cli`. Để chọn thư mục và chủ đề ngay khi mở:

```sh
./cli/pvta --cwd /Users/phananh/MySoft --theme than-chi
```

`./cli/pvta --demo` mở giao diện minh họa, không khởi tạo lõi, không gọi AI và không ghi dữ liệu. `--help` dùng được qua pipe. Phiên làm việc thật cần terminal TTY.

CLI dùng chung cấu hình, giấy phép, model và hội thoại tại `PVTA_HOME` (mặc định `~/.phananh-office`). CLI và PVTA Desktop **chạy đồng thời được**: tiến trình mở đầu tiên giữ dữ liệu và mở socket cục bộ (`daemon.sock`, quyền 0600; Windows dùng named pipe), các tiến trình sau nối vào đó. Nếu tiến trình giữ dữ liệu thoát, một tiến trình còn lại tự nhận quyền. Chi tiết: `core/src/desktop/daemon.ts`.

Desktop có nút **Mở cửa sổ chat mới** và menu hội thoại **Mở trong cửa sổ mới**. Các cửa sổ chọn hội thoại và giữ ô soạn riêng; kho dữ liệu và cài đặt chung được đồng bộ. Một hội thoại chỉ chạy một lượt tại một thời điểm; các hội thoại khác nhau có thể chạy song song.

Lần mở CLI tạo hội thoại mới trong dự án của thư mục hiện tại; `/chats` và `/chat <id>` mở lại lịch sử. Khởi động ở quyền Hỏi duyệt; `/access full` bật Tự sửa, `/access read` bật Chỉ đọc. Đây là tùy chọn dùng chung với Desktop. Nếu cần kích hoạt, dùng `/activate <email> <mã>` rồi `/connect`.

## Chủ đề và bố cục

| Lệnh | Chủ đề |
| --- | --- |
| `/theme bang-xanh` | Bảng xanh, xanh rêu dịu |
| `/theme trang-vo` | Trang vở, nền giấy sáng |
| `/theme soan-bai` | Soạn bài, tông nâu ấm |
| `/theme than-chi` | Than chì, mặc định |
| `/theme thanh-lich` | Thanh lịch, xám tím trầm |

Chủ đề được lưu cho lần mở sau. Tôn trọng `NO_COLOR`. Terminal đủ rộng chia hai cột; cửa sổ hẹp chuyển một cột, F2 đổi giữa hội thoại/nguồn và chi tiết/xem trước. Màu không điều khiển quyền hoặc chức năng.

Gõ `/` để mở menu lệnh và kỹ năng, gõ tiếp để lọc; ↑↓ chọn, Enter thực hiện, Tab điền lệnh, Esc đóng. Lệnh cần tham số chỉ điền vào ô nhập để bạn bổ sung. `/theme` mở danh sách năm chủ đề. `/models` hoặc `/model` mở danh sách nhà cung cấp rồi model; gõ tên để tìm trong danh sách hiện tại, dấu ✓ chỉ lựa chọn đang dùng. Chỉ liệt kê backend đã cài và API đã cấu hình.

Trang vở dùng ba cột dự án/hội thoại — nội dung — nguồn/quy tắc khi cửa sổ đủ rộng. Bàn soạn bài và Plan dùng kế hoạch — bản nháp — nhật ký. Code chia hội thoại và mã/diff; Markdown chia nguồn có số dòng và xem trước, kèm mục lục và dòng duyệt bản nháp. Dữ liệu các vùng lấy từ phiên hiện tại; không dùng số liệu minh họa của ảnh thiết kế.

Màn hình đầu không mở trợ giúp. Gõ `/help` để xem, `/` để chọn lệnh. Ở terminal hẹp, kết quả lệnh và thông báo lỗi tự hiện trong vùng nội dung; F2 quay lại hội thoại. PgUp/PgDn cuộn các vùng. Viền, màu và dòng kẻ Trang vở mô phỏng mẫu trong `docs/cli-mau`; terminal không hỗ trợ bóng đổ hoặc nhiều cỡ chữ như HTML.

Nếu không thấy màu, mở `./cli/pvta --color` để bật màu kể cả khi môi trường đặt `NO_COLOR`. `--no-color` tắt màu. Terminal có `COLORTERM=truecolor`/`24bit` dùng màu 24-bit; các terminal khác dùng bảng 256 màu. Vùng nhập và mục được chọn có nền màu nhấn riêng.

Tab chuyển giữa Hội thoại, Lập trình viên, Chỉnh Markdown, Chế độ viết, Plan và Plan Pro. Có thể dùng `/mode chat|code|markdown|write|plan|pro`. PgUp/PgDn cuộn nội dung, phím lên/xuống duyệt lịch sử nhập, trái/phải/Home/End sửa dòng, Ctrl+U xóa dòng. Ctrl+C dừng tác vụ hoặc xóa ô nhập; `/quit` hoặc Ctrl+D thoát và trả terminal về trạng thái thường.

Con lăn chuột cuộn nội dung trong màn hình CLI, giữ nguyên ô nhập; khi menu đang mở, con lăn di chuyển mục chọn. CLI bật nhận chuột trong phiên tương tác và tắt khi thoát hoặc mở `/editor`. Terminal cần hỗ trợ báo sự kiện chuột; PgUp/PgDn vẫn dùng được khi terminal không hỗ trợ.

## Các chức năng

- **AI:** `/models`, `/model backend model`, `/model api:provider model`, `/model auto`. Gõ yêu cầu để gửi; câu trả lời truyền dần vào màn hình. Dùng backend agy/Claude/Codex/API và cơ chế quyền hiện có của lõi.
- **Tệp và ngữ cảnh:** `/attach đường-dẫn`, `/skills`, `/rules`; gọi `/tên-skill` hoặc `#quy-tắc` trong yêu cầu. Brain, nguồn và kiểm định vẫn do lõi thực hiện.
- **Code:** `/mode code` chọn văn phong lập trình; `/code tệp` đọc nguồn có số dòng; `/diff` xem Git diff; `/test tên-script`, `/typecheck`, `/lint`, `/build` chạy script có thật trong package.json của thư mục làm việc. Hiển thị kết quả đạt/lỗi và stdout/stderr, không giả lập kết quả.
- **Markdown:** `/edit tệp.md` mở nguồn và xem trước; `/replace số-dòng nội-dung` sửa bản nháp; `/toc` xem mục lục; `/diff` xem thay đổi; `/save` duyệt ghi; `/discard` bỏ bản nháp; `/undo` hoàn tác lần lưu cuối nếu tệp chưa bị sửa bên ngoài.
- **Soạn thảo đầy đủ:** `/editor` mở bản nháp tạm bằng `$VISUAL`, `$EDITOR` hoặc `vi`. Cấu hình như `code --wait` được tách thành argv, không thực thi qua shell. Thoát editor quay về xem diff; chỉ `/save` mới ghi nguồn.
- **Viết:** `/writing standard|academic|admin|creative|exact|concise|accounting` hoặc mã chế độ tùy chỉnh hiện có.
- **Duyệt:** `/actions` xem nội dung và ID đề xuất, `/approve id`, `/decline id`, `/output id` mở kết quả. Không tự duyệt trong chế độ Hỏi duyệt.
- **Plan/Plan Pro:** chọn chế độ rồi gửi yêu cầu. `/plans` hiển thị ID, khâu, trạng thái và kết quả; `/run id` chạy hoặc tiếp tục; `/step id-plan id-khâu` chạy khâu cụ thể. `/stop` hủy. Không tự chạy sau khi vừa lập kế hoạch.
- **Khôi phục:** `/recovery id-plan id-khâu` nhận báo cáo và token. Các bước có tác động chưa rõ vẫn bị lõi chặn, phải đối chiếu trước. Dùng `/rpc resolvePlanRecovery {"id":"…","stepId":"…","revision":0,"token":"…","decision":"retry","evidence":"Kết quả đối chiếu thực tế"}` rồi `/step` để thử lại. Không dùng dữ liệu minh họa này thay bằng chứng thật.
- **Media và sơ đồ:** `/browser` mở Markdown/Mermaid từ bản nháp hoặc câu trả lời cuối trong trình duyệt, dùng tài nguyên đóng gói cục bộ; HTML được lọc trước khi hiển thị, Mermaid dùng chế độ strict. `/open tệp` mở ảnh/HTML/audio/video bằng ứng dụng hệ điều hành. Terminal không có iframe hoặc trình phát media nhúng.
- **Nhật ký và công cụ lõi:** `/activity`; `/rpc tên-phương-thức {JSON}` cung cấp đường vào các RPC hiện có (quy trình, lưu đầu ra, chỉnh Plan…), với kiểm định của lõi. Đây là lệnh nâng cao, cần truyền đúng tham số.

Các lệnh đọc/sửa/mở tệp trực tiếp của CLI giới hạn trong thư mục làm việc và kiểm tra đường dẫn thật, kể cả symlink. Công cụ AI và RPC vẫn dùng phạm vi/quyền của lõi; tùy chọn `full` không phải sandbox hệ điều hành.

## Kiểm chứng và giới hạn

```sh
npm run typecheck:cli
npm run test:cli
npm run build:cli
```

Đã thử khởi chạy bằng Bash, Zsh, Fish và một phiên PTY với kho dữ liệu tạm, đổi chủ đề, mở Markdown và thoát. Kiểm thử tự động kiểm tra bố cục, ký tự điều khiển, phạm vi tệp, lưu/hoàn tác, ánh xạ RPC, hủy và khóa dữ liệu. Chưa kiểm thử một lượt AI thật có tính phí, toàn bộ chuỗi Plan Pro với backend thật, hay trên Windows/Linux.

Xem trước Markdown trong terminal là dạng chữ, không đầy đủ như trình duyệt. Tô cú pháp nhận diện từ khóa, chuỗi, số và comment phổ biến; chưa phải bộ phân tích riêng cho từng ngôn ngữ. Chưa có tự đổi chủ đề theo Appearance của hệ điều hành. Cài đặt/phát hành bộ CLI độc lập chưa được nối vào workflow release.

Kiểm chứng 22/10/2026: CLI TTY chạy cùng sidecar trong gói macOS `.app`, chia sẻ thay đổi hội thoại và chuyển quyền host theo cả hai chiều khi một bên thoát; socket/khóa được dọn sau khi đóng hết. Test tích hợp dùng DesktopRuntime thật, backend giả, kiểm tra hai hội thoại chạy đồng thời và khóa cùng hội thoại. Chưa kiểm chứng thao tác trên hai cửa sổ GUI thật hoặc Windows. Báo cáo lỗi bộ test chung và bản dựng: `docs/kiem-ke-rpc-su-kien.md`, mục 7.

Kiểm chứng menu CLI: đã chạy PTY với kho tạm, mở `/`, lọc chủ đề Trang vở, chọn Claude → Sonnet và mở lại để kiểm tra dấu ✓. Kiểm tra đầu ra ANSI 24-bit/256-color và trường hợp `NO_COLOR=1`; chưa đánh giá bằng ảnh chụp cửa sổ Terminal của người dùng. Test CLI kiểm tra menu, model API, trạng thái lựa chọn và nền riêng cho năm theme; chưa gọi AI có tính phí.
