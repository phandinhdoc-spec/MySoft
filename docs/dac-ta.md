# Phananh Office: đặc tả extension Office không dùng Hermes

Tài liệu này tóm tắt yêu cầu, tính năng, quyết định thiết kế và các điều đã kiểm chứng trên máy thật, rút ra từ quá trình làm `hermes-office`. Mục đích: viết lại một extension mới, gọn nhẹ, **không phụ thuộc Hermes**. Hermes nặng (RAM, CPU) và mỗi lần gọi đều khởi động lại toàn bộ agent, là nguyên nhân chính gây chậm.

## 1. Mục tiêu

- Extension Office (Word, Excel, PowerPoint) dành riêng cho giáo viên, nhanh hơn Claude for Office.
- Chạy qua **gói đăng ký** của `agy` (Antigravity CLI) và `claude` (Claude Code CLI), chạy không giao diện (headless). **Không dùng API**, để kiểm soát chi phí.
- Tự học thói quen của người dùng sau mỗi lần làm việc thành công, chạy nền, không hỏi người dùng.
- Nhẹ: không có tiến trình agent nền, không đổ RAM. Chỉ chạy CLI khi có yêu cầu.

## 2. Kiến trúc

```
Office add-in (React + TypeScript + Office.js)
        │  WebSocket ws://127.0.0.1:<cổng>/ws
        ▼
Bridge cục bộ (một tiến trình nhỏ, FastAPI hoặc tương đương)
   ├─ Engine: gọi agy / claude headless trong thư mục ẩn
   ├─ Quyền: 3 mức (đọc / hỏi / toàn quyền)
   ├─ Học nền: tạo skill từ lịch sử làm việc
   └─ Công cụ cục bộ: bảng màu, cặp font, đọc skill
```

- **Add-in** chỉ là giao diện và cầu nối Office.js. Phiên làm việc thật chạy trong CLI.
- **Bridge** giữ trạng thái phiên, gọi CLI, kiểm soát quyền, chạy học nền.
- Không có Hermes ở bất kỳ khâu nào. Skill do extension tự quản lý trong thư mục riêng (ví dụ `~/.phananh-office/skills/`).

### Giao thức công cụ

Model không có công cụ gốc. Mọi thao tác trên văn bản đi qua khối văn bản đặc biệt trong câu trả lời:

````
```office-tool
{"tool": "office_word_insert_text", "args": {"text": "xin chào"}}
```
````

Bridge tách các khối này, kiểm tra quyền, gửi yêu cầu (`rpc_request`) cho add-in chạy bằng Office.js, rồi trả kết quả vào lượt sau cho model, tối đa vài vòng cho mỗi tin nhắn.

## 3. Engine (backend)

> **Cập nhật 10/2026:** thêm backend `codex` (OpenAI Codex CLI, `codex exec --json`, sandbox chỉ đọc) và backend dự phòng **API** (khóa người dùng tự nhập: Anthropic, OpenAI, Gemini, máy chủ tương thích OpenAI). Auto = model mặc định của backend đầu tiên có trên máy (agy → claude → codex → API). Backend chưa cài chỉ hiện gợi ý cài; chỉ báo lỗi khi máy không có backend nào. Xem README mục "Backend".

### Hai backend, chọn model theo từng backend

- `agy`: các model do `agy models` báo (Gemini 3.8 Flash high/medium/low, Claude Sonnet 4.6, Opus 4.6 thinking, GPT-OSS 120B...).
- `claude`: Sonnet, Opus, Haiku (bí danh `sonnet`, `opus`, `haiku`).
- Người dùng chọn một model của một backend. **Model đó được ghim cho đến khi người dùng chọn lại.** Không bao giờ tự đổi sang model khác khi lỗi, chỉ báo lỗi rõ ràng.
- **Auto** = một model duy nhất: Gemini 3.8 Flash (medium) của `agy`.
- Chat và F6 (sửa nhanh tại chỗ) dùng cùng model đang chọn.

### Lệnh gọi

`agy`:
```
agy -p "<prompt>" --output-format stream-json --model <id> [--conversation <id>] [--print-timeout 900s]
```
- Sự kiện: `init` (có `conversation_id`), `step_update` (`agent_response` với `text_delta`), `result` (`status`, `response`, có thể có `denied_actions`).
- Prompt đi qua tham số dòng lệnh. Trên Windows giới hạn khoảng 30.000 ký tự (chưa kiểm).

`claude`:
```
claude -p --output-format stream-json --verbose --tools "" --strict-mcp-config --disable-slash-commands [--model <alias>] [--resume <session>]
```
- Prompt đi qua stdin (không bị giới hạn độ dài, không lộ trong danh sách tiến trình).
- Sự kiện: `system/init` (`session_id`, `model`), `assistant`, `rate_limit_event`, `result`.
- `--verbose` bắt buộc khi dùng `stream-json` với `-p`.

### Tiết kiệm token: chỉ gửi phần mới

Mỗi (backend, model) giữ một mã hội thoại của chính CLI (`--conversation` / `--resume`). Lượt đầu gửi đầy đủ (quy tắc, skill, lịch sử). Các lượt sau chỉ gửi phần mới. Đặt lại mã khi đổi model, đổi skill, đổi quy tắc hoặc sửa lịch sử.

### Tự thích ứng theo phiên bản CLI

Khi gọi lỗi, extension tự kiểm tra phiên bản và điều chỉnh, tối đa hai lần thử lại:
1. Dò `--version` / `--help`, lưu danh sách cờ trong `probe.json`, khóa theo dấu vân tay (phiên bản hoặc kích thước + thời gian sửa file).
2. Lỗi cờ không nhận ra: bỏ cờ đó, nhớ lại, thử lại.
3. Lỗi mã hội thoại cũ: bỏ mã, gửi lại bản đầy đủ.
4. Không đọc được `stream-json`: chuyển sang đầu ra văn bản thuần.
5. Phân loại lỗi: cờ, phiên, model, đăng nhập, công cụ bị từ chối, khác. Lỗi đăng nhập và lỗi model **không** được thử lại với model khác.
6. Có lệnh cập nhật `agy update` do người dùng chủ động bấm.

### Môi trường tiến trình con

Xóa các biến khóa API (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`) trước khi gọi CLI, để CLI luôn dùng gói đăng ký. Chỉ bật lại khi người dùng đặt cờ rõ ràng.

## 4. Thư mục ẩn và vòng đời

- Mỗi phiên làm việc có một thư mục ẩn riêng, đặt ở **vị trí cố định**: `~/.phananh-office/workspace/<phiên>/`. Không đặt trong thư mục của văn bản đang mở, vì thư mục đó có thể là OneDrive, ổ mạng, USB hoặc chỉ đọc, và Office tạo file khóa `~$...` ở đó.
- CLI luôn chạy với thư mục làm việc là thư mục này.
- **Văn bản đang mở được sửa trực tiếp qua Office.js, không có bản sao lưu.**
- Khi người dùng đóng panel Office: chờ khoảng 30 giây (phòng khi chỉ tải lại), cho học nốt hàng đợi (tối đa khoảng 120 giây) để skill được ghi xong, rồi xóa thư mục phiên.
- Khi khởi động, dọn các thư mục phiên cũ hơn 24 giờ (máy tắt đột ngột).
- Chỉ xóa bên trong `workspace/`, không bao giờ chạm văn bản của người dùng.
- Chưa làm: đồng bộ khi lưu, bản đọc phụ cho văn bản rất nặng. Chỉ làm nếu đo thấy cần.

## 5. Quyền (hộp thoại lần đầu, nút 🛡 để đổi)

Hộp thoại giải thích hai điều: Hermes (nay là extension) làm việc trong thư mục ẩn, và văn bản được sửa trực tiếp. Rồi chọn một trong ba mức:

| Mức | Hành vi |
|---|---|
| Chỉ đọc | Chặn mọi công cụ làm thay đổi văn bản. Đọc bình thường. |
| Hỏi trước khi sửa | Mỗi thay đổi hiện hộp Đồng ý / Từ chối (hết hạn sau 300 giây thì bỏ qua). Mức khuyên dùng. |
| Toàn quyền chỉnh sửa | Sửa không hỏi. `agy` chạy thêm `--dangerously-skip-permissions` (agy tự duyệt cả chạy lệnh shell, do thầy cô duyệt ngày 22/10). Có cảnh báo về chữ ẩn trong văn bản của người khác. |

- Phân loại công cụ: tên chứa `_get_` hoặc `_list_` và công cụ cục bộ là công cụ đọc; còn lại là ghi.
- Lời gọi công cụ từ bên ngoài qua HTTP chỉ chạy được ở mức Toàn quyền (không có chỗ để hỏi).
- Chưa trả lời hộp thoại thì xử lý như mức "Hỏi trước khi sửa".
- Lựa chọn lưu theo người dùng.

### Điều đã kiểm chứng về quyền của CLI

- `claude --tools ""`: không có công cụ gốc, không MCP, không skill. Chạy `-p` không hỏi tin cậy thư mục.
- `agy -p` **không** hỏi tin cậy thư mục lạ. Khi không có cờ yolo, `agy` tự **từ chối lệnh ghi** (không file nào được tạo, kể cả ngoài thư mục làm việc) nhưng **vẫn cho phép lệnh đọc** như `ls`. Khi bị từ chối, `result` có `denied_actions` và `response` rỗng; extension phải báo rõ, không thử lại vô ích.
- `agy --mode plan` làm model chờ duyệt kế hoạch, nên không dùng được cho chat.
- `agy --sandbox` không thêm gì đáng kể so với mặc định.
- Rủi ro còn lại: lệnh đọc của `agy` vẫn chạy được, nên chữ ẩn trong văn bản của người khác có thể khiến nó đọc file trên máy. Dùng `claude` cho văn bản không tin cậy.

## 6. Học nền

Chạy tự động, không hỏi người dùng, không cần Office đang mở.

- **Khi nào xếp hàng**: sau mỗi tác vụ thành công (kết thúc không còn khối công cụ).
- **Dữ liệu ghi**: đã làm sạch. Chỉ có lời yêu cầu đã che thông tin cá nhân (cắt ngắn), tên công cụ đã dùng và **tên** tham số. Không bao giờ chứa nội dung văn bản.
- **Ai học**: đúng backend và model đã làm việc (học bằng `agy` nếu là `agy`, bằng `claude` nếu là `claude`).
- **Khi nào chạy**: lúc rảnh (mặc định sau 120 giây không hoạt động), khi hàng đợi đủ 3 mục hoặc có mục cũ hơn 6 giờ. Tối đa 6 lượt học mỗi ngày. Ngoài ra học nốt ngay khi đóng Office (xem mục 4).
- **Kết quả**: các skill dạng `learned-<tên>/SKILL.md`, tối đa 30 skill. Có bộ lọc an toàn (kiểm tra tên, mô tả, nội dung), sao lưu bản cũ trước khi ghi đè, có thể xem và xóa.
- **Cách dùng lại**: skill được nạp vào prompt ở lượt đầu; model có công cụ `office_skill_read` để đọc chi tiết khi cần.
- Chưa làm: tín hiệu "người dùng chấp nhận kết quả F6" làm dữ liệu học; giao diện quản lý skill đã học.

## 7. Skill

- **Mặc định nạp**: chỉ skill riêng cho Office (phong cách người dùng, ba skill nền Word/Excel/PowerPoint).
- **Theo yêu cầu**: skill về mã (code), nạp khi cần.
- **Chỉ khi người dùng gọi**: skill kiểu lập kế hoạch hoặc "grill".
- Skill ở định dạng thư mục có `SKILL.md` (phần đầu YAML: `name`, `description`).
- Giấy phép: các skill docx/pptx/xlsx/pdf của Anthropic là "source-available", không phải mã nguồn mở, **không sao chép**. Tự viết skill riêng.

## 8. Giao diện

- Thanh bên (task pane) với chat, lịch sử, dự án, quy tắc (rules) riêng.
- Chọn model gom theo backend; hiển thị model đang ghim.
- F6: sửa nhanh phần đang chọn, dùng cùng model với chat.
- Nút 🛡 quyền; hộp xác nhận từng thay đổi ở mức "Hỏi".
- Mức tư duy (reasoning) có thể chọn.
- Tạo và nạp skill, danh sách công cụ.
- Hai ngôn ngữ: tiếng Việt và tiếng Anh.
- Công nghệ đã dùng: React, TypeScript, Vite, Fluent UI, Tailwind.

## 9. Bộ công cụ Office (đã có, giữ lại)

**Word**: lấy vùng chọn, lấy toàn văn, thay vùng chọn, đặt nội dung, chèn văn bản, chèn công thức (LaTeX → Word Equation, hóa học `\ce{}`), chèn bảng, lấy/áp định dạng, lấy/đặt trang, áp style.

**Excel**: lấy sheet đang dùng, lấy/ghi vùng, đặt công thức, lấy/đặt định dạng, tạo bảng, thêm cột bảng, biểu đồ, định dạng có điều kiện, thiết kế bảng, sắp xếp/lọc, liệt kê/thêm sheet.

**PowerPoint**: lấy slide, thêm slide, tạo slide, chèn hộp văn bản, lấy chủ đề, định dạng shape, áp định dạng/bảng màu toàn bộ.

**Cục bộ**: hồ sơ phong cách người dùng (lấy/lưu), bảng màu (theo màu gốc, tâm trạng, nền tối), cặp font, đọc skill.

### Tài liệu nặng

- Excel: một lần đọc tối đa khoảng 4.000 ô, vượt thì chỉ trả các hàng đầu kèm `truncated`, `totalRows`, `totalColumns`; cần đọc phần còn lại thì hỏi lại với địa chỉ hẹp hơn.
- Word: một lần đọc toàn văn tối đa 60.000 ký tự, kèm ghi chú cắt.
- PowerPoint: mỗi hộp văn bản tối đa 1.500 ký tự trong kết quả.
- Mọi kết quả công cụ đưa lại cho model bị cắt ở 60.000 ký tự.
- Chưa đo với file pptx/xlsx nặng thật. Nên đo trước khi tối ưu thêm.

## 10. Hiệu năng: bài học

- Chậm vì Hermes: mỗi tin nhắn chạy `hermes chat --oneshot`, phát lại toàn bộ lịch sử, nạp skill và plugin mỗi lần. Bỏ Hermes loại bỏ nút thắt này.
- Chi phí còn lại là thời gian chờ model (khoảng 1 giây với `claude`, khoảng 5 giây với `agy`) và số vòng gọi Office.js. Mỗi lần gọi `agy` tốn khoảng 14.000 token đầu vào cố định.
- Rust: **chưa cần**. Nút thắt không nằm ở tiến trình bridge. Chỉ cân nhắc khi cần đóng gói một file chạy duy nhất hoặc đọc file nặng (ví dụ thư viện `calamine` cho Excel). Đo trước khi quyết định.
- Không cần giữ tiến trình CLI chạy nền; dùng `--conversation` / `--resume` là đủ.

## 11. Việc cần làm cho bản mới (không Hermes)

1. Khung dự án: add-in + bridge nhỏ; tách `backends` (engine), `permissions`, `learner`, `workspace` thành module riêng.
2. Thay mọi chỗ ghi/đọc `~/.hermes/skills` bằng thư mục skill riêng của extension; quyết định có đồng bộ sang thư mục skill của `claude` hay không (cần kiểm tra cách mỗi CLI đọc skill).
3. Bỏ các phần chỉ phục vụ Hermes: đăng nhập Hermes, plugin Antigravity của Hermes, danh sách toolset, nút ⚡ chế độ agent đầy đủ.
4. Giữ nguyên: engine, thích ứng phiên bản, quyền ba mức, thư mục ẩn tự xóa, học nền, giới hạn tài liệu nặng, bộ công cụ Office.
5. Viết ba skill nền Word/Excel/PowerPoint dùng các công cụ `office_*`.
6. Giao diện quản lý skill đã học; tín hiệu chấp nhận F6 cho học nền.
7. Đo hiệu năng với file pptx/xlsx nặng thật; quyết định bản đọc phụ nếu cần.
8. Cài đặt: trình cài cho macOS và Windows (đăng ký add-in, chạy bridge khi khởi động, chứng chỉ cục bộ cho HTTPS).

## 12. Điểm còn mở (cần kiểm tra)

- Giới hạn độ dài dòng lệnh `agy` trên Windows (khoảng 30.000 ký tự).
- `Office.context.document.url` có trả đường dẫn file đang mở không (cần cho đồng bộ khi lưu nếu làm sau này).
- Cách mỗi CLI nạp skill từ thư mục riêng (nếu muốn bỏ việc nhét skill vào prompt).
- Tên cờ mức quyền của `claude` khác ngoài `--tools ""` (hiện chưa cần vì không có công cụ gốc).

## 12a. Ô chat, thư mục và biên tập nền (Chatbox)

- Ô chat trống hiện gợi ý: gõ `@` (lệnh mẫu), `/` (kỹ năng), `#` (quy tắc). Ba biểu tượng cạnh nút đính kèm mở cùng danh sách; rê chuột hiện tên và hướng dẫn; mỗi danh sách có lối vào công cụ quản lý (lời nhắc, kỹ năng, quy tắc).
- Biểu tượng thư mục (và kéo thả thư mục): hộp thoại mặc định "Tạo dự án mới" với tên gợi ý từ tên thư mục (sửa được); có thể thêm vào dự án đang mở hoặc chỉ đính kèm vào chat.
- Quy tắc `#tên`: lưu ở `ruleBook`; đánh dấu "luôn áp dụng" thì dùng cho mọi yêu cầu.
- Biên tập nền (`pvta-core --refine`): bộ lập lịch của hệ điều hành gọi mỗi giờ và khi đăng nhập; mỗi lần tự kiểm tra bật/đến hạn/PVTA đang đóng/CPU và RAM rảnh. Thứ tự model: Sonnet của agy → CommandCode → Claude → model ngang Sonnet. Chỉ xử lý kỹ năng/quy tắc PVTA mới học hoặc đã đổi (băm so với `refine/manifest.json`); ghi nhật ký `refine/journal.jsonl` từng bước và xóa khi xong. Cài đặt (giờ, tần suất, model) ở Cài đặt → Biên tập nền; mặc định bật, 22:30 hằng ngày, model tự động.

## 13. Nguyên tắc cố định

- Không API, chỉ gói đăng ký.
- Model được chọn là model được chạy; không đổi ngầm.
- Học nền hoàn toàn tự động, nhưng dữ liệu học không chứa nội dung văn bản.
- Mặc định an toàn: hỏi trước khi sửa; toàn quyền là lựa chọn chủ động có cảnh báo.
- Thư mục ẩn luôn được dọn sau khi dùng xong.
