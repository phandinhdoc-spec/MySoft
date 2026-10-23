# Brain — bộ não tra cứu mã của PVTA

Brain là CLI native (Rust) chạy một lần rồi thoát, không daemon, không phụ thuộc ngoài (không cần Ctags hay ripgrep). PVTA sinh Brain riêng cho mỗi phạm vi làm việc và luôn khởi chạy theo quy tắc lõi:

- **Phạm vi dự án**: thư mục được cấp quyền rõ ràng. Brain duyệt cả thư mục, tôn trọng `.gitignore`, bỏ `node_modules`, `target`, `dist`, `build`…
- **Phạm vi tệp lẻ**: phiên chỉ có tệp đính kèm thì Brain chỉ đọc đúng các tệp đó (`--file <tệp>` hoặc biến `PVTA_BRAIN_ONLY`, mỗi dòng một đường dẫn). Không duyệt, không đọc tệp cùng thư mục, không suy ra quyền đọc thư mục từ một tệp.
- Thư mục Học hỏi và dự án chứa nó bị loại khỏi Brain để giữ ranh giới truy cập. Brain là công cụ tra cứu, không tự nâng quyền phiên.

## Hai tầng hiểu

1. **Tầng 1 — toàn dự án** (`overview`, công cụ `brain_overview`): ngôn ngữ, vùng mã kèm ký hiệu chính, điểm vào/cấu hình, tệp trung tâm (nhiều tệp import tới nhất). PVTA nạp sẵn tầng 1 vào lời nhắc mỗi phiên. Ở phạm vi tệp lẻ, tầng 1 là dàn ý của từng tệp được cấp.
2. **Tầng 2 — toàn một tệp** (`outline <tệp>`, công cụ `brain_outline`): cây ký hiệu lồng nhau có dòng đầu–cuối thật, import, các tệp import tới tệp này. Markdown/Typst cho cây đề mục.

Đi từ rộng đến hẹp: tầng 1 chọn vùng, `find` chọn ký hiệu, tầng 2 nắm cả tệp, `read <tệp> <ký hiệu>` đọc trọn thân, sửa, rồi `refs` kiểm tra chỗ gọi.

## Tìm kiếm (`find`)

Mọi truy vấn chạy trên chỉ mục trong bộ nhớ; chỉ mở đĩa để lấy dòng bằng chứng.

- **Ký hiệu**: khớp nguyên tên, tiền tố, chuỗi con; khớp từng mảnh định danh (camelCase, snake_case) có trọng số IDF; viết tắt kiểu IDE (`bPRoot` → `brainProjectRoot`); chịu lỗi gõ 1 ký tự (Damerau); khớp mờ kiểu fzf. Điểm nhân theo loại ký hiệu, độ phủ truy vấn, ký hiệu export; tệp kiểm thử bị hạ trừ khi hỏi về test.
- **Nội dung**: BM25 trên chữ đã gấp dấu tiếng Việt (`quy tắc lõi` khớp `quy tac loi`), cộng điểm đường dẫn; trả các dòng khớp nhiều từ nhất làm bằng chứng.
- **Bộ lọc**: `in:<đường dẫn>`, `kind:<loại>` (function, method, class, struct, type, test, heading…), `lang:<ngôn ngữ>`. Chỉ có bộ lọc thì liệt kê ký hiệu thỏa bộ lọc.
- Không thấy gì: kết quả có `hint` gợi ý tên gần giống. Không kết luận "không có mã" chỉ vì một lần tìm không ra.

## Lệnh

```text
overview [--text]             Tầng 1
outline <file> [--text]       Tầng 2
find <truy vấn> [--limit N]   Tìm xếp hạng (ký hiệu + nội dung)
refs <identifier>             Ứng viên tham chiếu theo từ: định nghĩa, import, dùng, chú thích
read <file> <start> <end>     Đọc tối đa 500 dòng, kèm SHA-256 toàn tệp
read <file> <symbol>          Đọc trọn thân một ký hiệu (tối đa 500 dòng)
index [--rebuild]             Cập nhật chỉ mục (các lệnh khác tự gọi)
symbols                       Xuất JSONL {path,name,kind,line,end,scope}
patch < stdin                 Sửa có bảo vệ, chỉ C thuần
--file <tệp>                  Thu phạm vi về đúng tệp này (lặp được)
```

Đường dẫn là tương đối theo gốc phạm vi, dấu `/`, không symlink. `refs` là ứng viên văn bản: có thể gồm chú thích/chuỗi và bỏ sót lời gọi động; đọc nguồn trước khi khẳng định.

## Chỉ mục

Chỉ mục bền và tăng dần: mỗi lần gọi chỉ `stat` tệp, tệp đổi (mtime/kích thước) mới được đọc lại và phân tích song song. Chỉ mục nằm ngoài dự án: `PVTA_BRAIN_INDEX` nếu đặt, nếu không thì thư mục cache của hệ điều hành (`~/Library/Caches/pvta-brain` trên macOS). Tiêu đề chỉ mục chứa dấu vân tay bộ phân tích, nên sửa bộ phân tích là chỉ mục cũ tự được lập lại. Giới hạn: tệp ≤ 1 MiB, ≤ 30.000 tệp.

Đo trên repository PVTA (~1.340 tệp, ~18.000 ký hiệu, máy Apple Silicon): lập mới khoảng 0,5 s, cập nhật khi không đổi khoảng 20 ms, `find` khoảng 20–70 ms. Đây là số đo tham khảo, không phải bảo đảm.

Ngôn ngữ có ký hiệu: TypeScript/JavaScript (gồm JSX, Vue/Svelte ở mức script), Rust, Python, Go, Java, Kotlin, C#, Swift, Dart, Scala, C/C++, PHP, Ruby, Lua, CSS/SCSS, Shell, PowerShell, SQL, Markdown, Typst, TOML, YAML, Makefile. JSON, HTML và văn bản thường vẫn được tìm theo nội dung. Bộ phân tích dựa trên lexer ngoặc/thụt lề và mẫu khai báo, không phải trình biên dịch: có thể sót cấu trúc lạ; dòng đầu–cuối lấy từ cặp ngoặc thật, không đoán.

## Quy trình sửa mã

Đọc AGENTS.md nếu có; thiếu thì theo mã nguồn lân cận và cấu hình dự án. Trước khi sửa: `outline` tệp, `read` đúng phạm vi. Sau khi sửa: `refs`/`find` kiểm tra chỗ gọi, rồi chạy kiểm tra phù hợp (ở repository PVTA: `npm run typecheck -w chatbox`, `npx vitest run <tệp test>`, `cargo test` trong `brain/`). Chỉ kết luận đã sửa xong khi nguồn đã đổi; ghi rõ kiểm tra nào đã chạy, kiểm tra nào chưa. Không dùng `sed -i`/awk để ghi mã nguồn. Với TS/TSX/CSS và các ngôn ngữ khác ngoài C, dùng công cụ sửa mà phiên đã cấp.

## Patch C có bảo vệ

Với tệp `.c`, gửi qua stdin. SEARCH phải khớp đúng một lần sau khi chuẩn hóa CRLF. HASH lấy từ lần `read` mới nhất.

```text
FILE: src/example.c
HASH: <SHA-256 từ read>
<<<< SEARCH
int answer() { return 41; }
====
int answer() { return 42; }
>>>> REPLACE
```

Kiểm tra `patched` và `indexError` riêng: đã ghi mà cập nhật chỉ mục lỗi thì chạy `index`, không áp dụng lại patch. Bộ kiểm ngoặc từ chối tiền xử lý, line splicing, trigraph; nó không phải trình kiểm chứng cú pháp. Ghi tệp tạm rồi rename, giữ quyền tệp, kiểm tra lại nội dung trước rename nhưng không khóa được editor khác.

## Dựng

`cargo build --release --manifest-path brain/Cargo.toml` (tôn trọng `CARGO_TARGET_DIR`). Bản dựng desktop đóng gói CLI cạnh sidecar; `PVTA_BRAIN` chọn CLI khác. Nếu PVTA gặp CLI cũ chưa có hai tầng, Brain báo "CLI Brain đã cũ" thay vì giả vờ đã lập chỉ mục.
