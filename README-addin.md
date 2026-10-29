# PVTA

Extension Office (Word, Excel, PowerPoint) dành cho giáo viên. Nhanh, nhẹ, **không dùng Hermes**. Mặc định chạy qua **gói đăng ký** của một trong ba CLI ở chế độ không giao diện: `claude` (Claude Code), `codex` (OpenAI Codex CLI), `agy` (Antigravity CLI). Máy không có CLI nào thì có thể nhập **khóa API** (Anthropic, OpenAI, Google Gemini, hoặc máy chủ tương thích OpenAI như Ollama) làm phương án dự phòng.

Đặc tả đầy đủ: [docs/dac-ta.md](docs/dac-ta.md).

## Tra cứu cách dùng trong PVTA Chat

Nhấn **F1** để đọc hướng dẫn theo chương sách, hoặc nhấp chuột phải trên giao diện **PVTA Chat** → **Hỏi PVTA về chỗ này**. Popup nhận nhãn giao diện và tọa độ nhấp; nhập câu hỏi hoặc bấm câu hỏi gợi ý. Câu trả lời trích từ hướng dẫn, có tên chương để mở nguồn. **Esc** đóng popup.

Brain hướng dẫn có chỉ mục riêng trên máy, dùng chung cho tìm kiếm trong sách và hỏi đáp; không cần model AI, không đọc nội dung chat hay giá trị ô nhập. Chưa có căn cứ thì báo chưa tìm thấy. Tính năng này chưa tích hợp vào menu chuột phải của add-in Word, Excel hoặc PowerPoint.

## Cấu trúc

```
shared/   Kiểu giao thức, bộ tách khối office-tool, danh mục công cụ, giới hạn (TypeScript)
bridge/   Tiến trình cục bộ: engine gọi CLI, quyền 3 mức, thư mục ẩn, học nền, WebSocket
addin/    Office add-in (React + Office.js) và manifest.xml cho cả 3 ứng dụng
skills/   Ba skill nền tự viết: pvta-word, pvta-excel, pvta-powerpoint; và pvta-gioi-thieu (PVTA tự giới thiệu mình)
```

Toàn bộ viết bằng TypeScript. Bridge được đóng gói thành một file `bridge/dist/pvta-bridge.mjs`.

## Cài đặt (đơn giản nhất)

**Windows: bấm đúp một tệp.** Tải [Cai-PVTA-Windows.bat](https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/Cai-PVTA-Windows.bat) (chuột phải → Lưu liên kết thành…), rồi bấm đúp. Nếu Windows báo "Windows protected your PC", chọn **More info → Run anyway**. Khi hỏi về chứng chỉ, chọn **Yes**.

**macOS: dán một dòng.** Mở Terminal (Cmd + Space, gõ `Terminal`), dán dòng sau rồi nhấn Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.sh | bash
```

Máy hỏi mật khẩu đăng nhập Mac một lần: nhập và chọn **Cho phép**. Muốn bấm đúp thay vì dán lệnh, dùng [Cai-PVTA-Mac.command](https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/Cai-PVTA-Mac.command) (macOS có thể chặn lần đầu: chuột phải → Mở; nếu báo thiếu quyền chạy thì dùng dòng lệnh ở trên).

Cài xong, **thoát hẳn Word / Excel / PowerPoint** (macOS: Cmd + Q) rồi mở lại. Trên Mac, PVTA nằm trong mục **Chèn → Phần bổ trợ (Add-ins) → Developer Add-ins** (Phần bổ trợ dành cho nhà phát triển), không nằm ở danh sách chính; bấm vào PVTA sẽ thấy nút **PVTA** trên thẻ Trang đầu (Home). Trên Windows: Chèn → Phần bổ trợ → Phần bổ trợ của tôi → mục **Thư mục chia sẻ / Shared Folder** hoặc **Developer Add-ins**.

Dành cho người quen dòng lệnh, Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.ps1 | iex
```

Bộ cài tự làm hết: tải Node nếu máy chưa có, tải PVTA, tạo và tin cậy chứng chỉ HTTPS cục bộ, đăng ký add-in với Word/Excel/PowerPoint, và chạy bridge nền mỗi khi đăng nhập. Xong thì mở Office → Chèn → Phần bổ trợ của tôi → PVTA. Máy cần có ít nhất một trong `claude`, `codex`, `agy` đã đăng nhập, hoặc một khóa API nhập trong ⚙ Cài đặt của PVTA. Gỡ: bấm đúp `Go-PVTA-Windows.bat` (Windows) hoặc `Go-PVTA-Mac.command` (macOS); hoặc `bash install.sh --uninstall` (macOS), hoặc đặt `$env:PVTA_UNINSTALL=1` trước lệnh PowerShell (Windows). Bản Windows chưa được thử trên máy thật.

**Cửa sổ chọn công cụ AI (Windows).** Khi cài lần đầu (hoặc máy chưa có công cụ AI nào), bộ cài mở một cửa sổ 3 bước, dựng bằng WinForms có sẵn trong Windows (`scripts/windows/wizard.ps1`, nằm trong gói và do `install.ps1` gọi): (1) chọn công cụ AI: Gemini - Antigravity `agy` (gợi ý cho giáo viên Việt Nam; đăng nhập Google, nên có gói Google AI Pro), Claude Code (cần gói Pro/Max/Team/Enterprise), Codex (tài khoản ChatGPT; gói Free dùng được nhưng hạn mức thấp) hoặc khóa API; cửa sổ tự nhận ra công cụ nào đã có trên máy; (2) tự cài công cụ đã chọn (bỏ qua nếu đã có); (3) mở cửa sổ đăng nhập (trình duyệt), có nút Kiểm tra đăng nhập (đọc tệp đăng nhập của claude/codex, hoặc chạy một lượt hỏi rất nhỏ cho agy), rồi bấm Tiếp tục để kết thúc. Cài xong, bridge được khởi động lại để thấy công cụ mới. Các ứng dụng chat (ChatGPT, Claude, Gemini trên web hoặc app) không dùng trực tiếp được vì PVTA không điều khiển được chúng. `PVTA_NO_GUI=1` dùng bản hỏi bằng chữ; `PVTA_INSTALL_CLI=claude|codex|agy|none` cài thẳng, không hỏi. Chữ tiếng Việt có dấu nằm trong `wizard.ps1` (UTF-8 có BOM), còn `install.ps1` chỉ dùng ASCII.

**Biểu tượng.** Hình tròn mực tím, chữ PVTA ở giữa (phông Montserrat ExtraBold); chữ PVTA ở đầu khung dùng cùng phông, chép sẵn trong gói. Vẽ lại bằng `python3 scripts/make-icons.py` (cần `pillow`, `fonttools` và `npm i --no-save @fontsource/montserrat`). Địa chỉ icon trong manifest có `?v=2` để Office bỏ bản cũ trong bộ nhớ đệm; khi đổi icon lần nữa hãy tăng số này. Nhãn PVTA dưới nút trên thanh Office do Office vẽ bằng phông của nó, add-in không đổi được.

**Cập nhật (từ bản 1.0.0).** PVTA tự kiểm tra `install/latest.json` trên GitHub sau khi khởi động rồi 12 giờ một lần (tắt bằng biến `PVTA_NO_UPDATE_CHECK=1`). Có bản mới thì khung PVTA hiện "Cập nhật ngay"; bấm thì bridge tải `install/pvta.tar.gz`, kiểm tra sha256, đổi thư mục app (giữ bản cũ ở `app.old`), tự khởi động lại và trang tự tải lại. Cấu hình, hội thoại, skill nằm ngoài thư mục app nên không mất. Cũng bấm được ở ⚙ Cài đặt → Phiên bản PVTA. Bản chạy từ mã nguồn (`npm run bridge`) không tự cập nhật. Phát hành bản mới: tăng `version` trong `package.json`, đặt `PVTA_NOTES="…"` nếu muốn ghi chú, chạy `scripts/package.sh`, commit `install/`.

**Đóng gói .dmg và .exe.** Workflow `.github/workflows/release.yml` (chạy tay hoặc khi đẩy thẻ `v1.0.0`) dựng `PVTA-<version>.dmg` (macOS, bằng `scripts/build-dmg.sh`) và `PVTA-Setup-<version>.exe` (Windows, Inno Setup, `scripts/windows/pvta.iss`) rồi đưa lên GitHub Releases. Cả hai chứa sẵn gói PVTA, cài không cần tải (`PVTA_LOCAL_TGZ`). Chưa ký số: macOS cần chuột phải → Mở, Windows báo SmartScreen thì chọn More info → Run anyway.

Đóng gói bản phát hành (cho người phát triển): `scripts/package.sh` tạo `release/pvta.tar.gz` và tự chép vào `install/` cùng sáu tệp cài đặt (`install.sh`, `install.ps1`, hai tệp `.bat`, hai tệp `.command`); rồi commit `install/` (các lệnh cài tải từ đó).

## Chạy thử (phát triển)

```bash
npm install
npm test              # unit + tích hợp (dùng CLI giả, không cần đăng nhập)
npm run typecheck
npm run build         # bridge + add-in

npm run bridge        # chạy bridge: ws://127.0.0.1:52731/ws
npm run dev -w addin  # add-in: https://localhost:3000 (cần chứng chỉ cục bộ, xem dưới)
```

Add-in cần HTTPS. Tạo chứng chỉ cục bộ (ví dụ `npx office-addin-dev-certs install`), rồi đặt `PVTA_CERT` và `PVTA_KEY` trỏ tới hai file. Sau đó sideload `addin/manifest.xml` vào Word/Excel/PowerPoint (hãy chạy `npx office-addin-manifest validate addin/manifest.xml` trước).

## Backend

| Backend | Lệnh gọi | Phiên | Ghi chú |
|---|---|---|---|
| `claude` | `claude -p --output-format stream-json …` (prompt qua stdin) | `--resume` | Không có công cụ gốc (`--tools ""`). |
| `codex` | `codex [--config model_reasoning_effort="…"] exec --json --sandbox read-only --skip-git-repo-check [--model …] [resume <id>] -` (prompt qua stdin) | `resume <thread_id>` | Luôn sandbox chỉ đọc; model "Mặc định của Codex" không truyền `--model`. |
| `agy` | `agy -p "<prompt>" --output-format stream-json …` | `--conversation` | Prompt qua tham số dòng lệnh. |
| API | HTTPS trực tiếp (SSE) | không giữ phiên | Khóa lưu trong `~/.phananh-office/config.json` (quyền 600), không bao giờ gửi về add-in. Không dùng cho học nền (tránh tốn tiền ngầm). |

- **Dò máy**: khi khởi động và khi bấm "Kiểm tra lại", bridge chạy `--version`/`--help` của từng CLI (codex dò cả `exec --help`). Bridge tự thêm các thư mục cài CLI thường gặp vào PATH (bridge chạy nền nên không có PATH của shell).
- **Tự động**: chạy model mặc định của backend đầu tiên có trên máy theo thứ tự agy → claude → codex → API. Câu trả lời ghi rõ model đã chạy.
- **Backend chưa cài**: trong danh sách model, nhóm đó hiện "Chưa cài" kèm nút "Cách cài" (lệnh cài đúng hệ điều hành, nút sao chép); chọn nó thì ô soạn nhắc chuyển sang model khác, không gửi. **Chỉ báo lỗi khi máy không có backend nào**, kèm hướng dẫn cài hoặc nhập khóa API.
- Model chọn cụ thể vẫn được ghim: lỗi khi chạy không bao giờ tự đổi sang model khác.

## Lời nhắc

- **Tự chỉnh đề theo model (luôn bật, không thêm độ trễ)**: yêu cầu và phần đang chọn được trình bày theo họ model đang chạy: Claude nhận thẻ XML (`<dang_chon>`, `<yeu_cau>`), GPT/Codex nhận tiêu đề Markdown, Gemini nhận yêu cầu đứng trước ngữ cảnh, model cục bộ nhỏ (Ollama…) nhận câu lệnh ngắn kèm dòng nhắc lại ràng buộc ở cuối. Không gọi thêm model nào.
- **Tối ưu lời nhắc** (nút ✦ hoặc phím Tab khi đã gõ, giống Monica): PVTA viết lại câu đang gõ thành lời nhắc rõ ràng (mục tiêu, đối tượng, đầu vào, yêu cầu đầu ra, ràng buộc) đúng kiểu model đích; giữ nguyên ý định, chỗ thiếu thông tin để ô trống `[mô tả]` chứ không tự bịa. Kết quả vào ô nhập để xem và sửa trước khi gửi; nút đổi màu theo trạng thái (vàng: sẵn sàng, nhấp nháy: đang viết lại, xanh kèm dấu ✓: đã áp dụng, đỏ: lỗi, di chuột để xem lý do; sửa ô nhập thì về vàng); có **Hoàn tác** về câu gốc; có ô trống thì mở luôn màn hình điền. Dùng mức suy nghĩ thấp cho nhanh.
- **Thư viện lời nhắc** (nút 📚 hoặc gõ `/` ở ô trống, giống Monica): 24 mẫu cho giáo viên theo 6 nhóm (Soạn bài, Kiểm tra – đánh giá, Điểm số, Trình chiếu, Văn bản – hành chính, Học sinh – phụ huynh), lọc theo ứng dụng đang mở; tìm kiếm; ★ yêu thích; tạo / sửa / xóa lời nhắc riêng (điền sẵn từ ô nhập). Ô trống viết `[mô tả]` hiện thành ô điền, rồi **Gửi ngay** hoặc **Đưa vào ô nhập**. Lời nhắc riêng và mục yêu thích lưu ở `~/.phananh-office/prompts.json` (dùng chung cho Word, Excel, PowerPoint; tối đa 200).

## PVTA tự biết về chính mình

Model không có sẵn kiến thức về PVTA, nên hỏi "PVTA làm được gì?", "cài thế nào?" sẽ không trả lời được. Quy tắc gửi cho mọi model có một dòng chỉ tới skill `pvta-gioi-thieu` (đọc theo yêu cầu bằng `office_skill_read`, chỉ liệt kê tên và mô tả ở prompt đầu nên không tốn thêm token mỗi lượt): tính năng, cách dùng, chế độ viết, quyền, cài đặt, nơi lưu dữ liệu, lỗi thường gặp, và mục **Chưa có** để model không bịa tính năng chưa làm. **Thêm hoặc đổi tính năng thì sửa `skills/pvta-gioi-thieu/SKILL.md` cho khớp** (bản cài tự cập nhật skill đi kèm, trừ khi người dùng đã sửa).

## Cách ứng xử

- **Hỏi** (kiến thức, cách làm, nhờ nhận xét mà không bảo sửa): trả lời, không sửa tài liệu; nếu có thể áp vào tài liệu thì hiện thẻ "Áp dụng vào văn bản: … ?" với nút **Áp dụng / Không cần** (model gọi công cụ giả `office_offer_apply`).
- **Ra lệnh thao tác cơ bản** (in đậm, giãn dòng, căn lề, thụt đầu dòng, phông, màu, tô ô, sắp xếp…): làm ngay trong một vòng, không hỏi lại; có phần chọn thì áp cho phần chọn, không thì cả tài liệu.
- **Ra lệnh về nội dung**: làm theo, nêu ngắn vấn đề nếu thấy; nếu sẽ đưa kiến thức sai vào tài liệu thì hỏi lại trước.
- **Bàn về nội dung**: phản biện cụ thể (điểm tốt, chỗ cần sửa, vì sao, sửa thế nào). Ở chế độ **Học thuật**, mỗi nhận định kèm chứng minh (lập luận, phản ví dụ, số liệu, căn cứ có thật) và mức độ chắc chắn.
- Công cụ định dạng cơ bản mới: `office_word_format_paragraph` (giãn dòng theo bội số, khoảng cách đoạn, căn lề, thụt lề), `office_word_apply_format` thêm gạch chân / tô sáng / cả văn bản, `office_excel_set_format` thêm nghiêng, cỡ, phông, căn lề, xuống dòng, kẻ khung, tự giãn cột, `office_ppt_format_text`.
- **Công cụ lấy từ hermes-office** (đợt 1):
  - Word: `office_word_insert_equation` chèn công thức Toán, Lý, Hóa thành Equation chuẩn của Word (LaTeX, hóa học `\ce{CaCO3 -> CaO + CO2 ^}`); văn bản thường chứa `$…$`, `$$…$$`, `\(…\)`, `\[…\]` khi chèn (thay vùng chọn, đặt lại nội dung, chèn văn bản) cũng tự thành công thức, lỗi thì giữ nguyên chữ. Thư viện công thức (temml, mathml2omml) chỉ tải khi gặp công thức, không làm chậm lúc mở panel.
  - Excel: `office_excel_insert_chart` (cột, cột chồng, ngang, đường, tròn, vành khuyên, miền, phân tán; không nói chỗ đặt thì nằm bên phải dữ liệu), `office_excel_conditional_format` (so sánh giá trị, thang màu, trùng lặp), `office_excel_filter`, `office_excel_list_tables`, `office_excel_add_table_column` (cột có công thức cho mọi hàng), `office_excel_get_format`.
  - PowerPoint: `office_ppt_generate_slide` (tạo slide theo bố cục của mẫu rồi điền tiêu đề, nội dung; không có ô tương ứng thì dùng hộp văn bản), `office_ppt_get_theme` (bố cục có sẵn, phông các hộp), `office_ppt_format_shape` (phông, màu, nền, vị trí, kích thước; chọn hình theo số thứ tự hoặc tên), `office_ppt_add_slide` nhận thêm `layout`.
  - Thư viện bên thứ ba cho công thức: temml (MIT) và mathml2omml (LGPL-3.0-or-later); mã PVTA là MIT.

## Giao diện

- Ô soạn ở dưới: nút chọn model (model + mức suy nghĩ) và nút quyền ngay cạnh nút Gửi. Enter gửi, Shift+Enter xuống dòng, Esc dừng.
- Danh sách model gom theo backend; backend sẵn sàng lên trước, có phiên bản CLI; mỗi nhóm có "Model khác…" để nhập mã tự do.
- Màn hình trống có gợi ý nhanh theo ứng dụng (giáo án, phiếu học tập, tính điểm, xếp loại, slide ôn tập…).
- Câu trả lời hiển thị Markdown, các bước công cụ có tên dễ hiểu, nút Sao chép và (Word) Chèn vào văn bản.
- Hộp xác nhận hiện đúng nội dung sắp ghi; Enter đồng ý, Esc từ chối.
- Cài đặt: quyền sửa, AI trên máy (trạng thái, lệnh cài, Kiểm tra lại), khóa API.
- **Command Code** (nhà cung cấp API thứ tư, chỉ dùng Provider API chính thức, không dùng đường OAuth/`alpha/generate`): chọn trong ⚙ Cài đặt → API thì địa chỉ `https://api.commandcode.ai/provider/v1` hiện sẵn (chỉ đọc) và danh sách model tự tải ngay (`GET /models`, chưa cần khóa nếu máy chủ cho xem công khai); dán khóa tạo ở commandcode.ai/settings/keys rồi chọn model. Dán nhanh cũng nhận ra máy chủ `api.commandcode.ai`.
- **Nhập API nhanh** (⚙ Cài đặt → API, `shared/src/apisetup.ts`): ô **Dán nhanh** nhận đoạn curl, dòng `.env` (`export OPENAI_API_KEY=…`), JSON hoặc chỉ khóa + địa chỉ; `parseQuickSetup` tách nhà cung cấp (theo tiền tố khóa `sk-ant-`, `sk-`, `AIza` và theo máy chủ), khóa, địa chỉ gốc (bỏ `/chat/completions`, `/messages`; máy chủ cục bộ tự thêm `/v1`), model. Chỗ trống kiểu `$OPENAI_API_KEY`, `YOUR_API_KEY` không bị nhận là khóa; dán xong ô dán được xóa để khóa không nằm lại trên màn hình. **Danh sách model lấy từ chính API** (`GET /models`, bridge: `ApiClient.listModels`; Anthropic đọc nhiều trang và lấy `display_name`): bỏ model nhúng, giọng nói, ảnh; chọn trong danh sách, có ô lọc, vẫn gõ tay được. Lưu khóa xong bridge tự tải và lưu danh sách vào `config.json` (`api.<nhà cung cấp>.models`), bộ chọn model hiện đủ, ghi rõ của nhà cung cấp nào khi có nhiều. **Khóa không bao giờ gửi về add-in**; khóa đã lưu chỉ được gửi tới đúng địa chỉ đã lưu, không bao giờ tới địa chỉ lạ mới gõ.
- **Chế độ viết** (nút riêng cạnh tên model, tách khỏi bảng chọn model; áp cho cả Trò chuyện và Viết): Sư phạm (mặc định), Chính xác (Toán/KHTN: giải từng bước, đơn vị SI, nhiệt độ 0), Học thuật (0,3; không bịa nguồn), Sáng tạo (1,0), Hành chính (0,2; thể thức NĐ 30/2020/NĐ-CP), Ngắn gọn (0,2). Mỗi chế độ = chỉ dẫn đưa vào prompt + mức suy nghĩ gợi ý + nhiệt độ; có thanh kéo để tự chỉnh nhiệt độ (0–1).
  - **Sửa và thêm chế độ** (nút ⚙ Quản lý chế độ, hoặc Cài đặt → Chế độ viết): chế độ có sẵn chỉ đọc, bấm **Nhân bản** để có bản riêng sửa được; chế độ riêng thêm, sửa, xóa, kéo thả (hoặc ↑ ↓) đổi thứ tự. Mỗi chế độ gồm tên, biểu tượng, mô tả ngắn, chỉ dẫn cho AI (tối đa 4.000 ký tự), mức suy nghĩ và nhiệt độ (tùy chọn). **Xuất JSON / Nhập tệp JSON / Dán JSON** để chia sẻ trong tổ chuyên môn; **Khôi phục mặc định** xóa mọi chế độ riêng. Lưu ở `~/.phananh-office/modes.json`, tách khỏi `config.json` của model; xóa chế độ đang dùng thì tự về Sư phạm.
  - **Nhiệt độ chỉ tới được model khi chạy bằng khóa API.** Claude Code, Codex và agy không có tham số này, nên với ba CLI chế độ viết tác động qua chỉ dẫn và mức suy nghĩ. Ngay cả qua API, model mới như Claude Sonnet 5.5 và GPT-5.x (có suy nghĩ) không nhận nhiệt độ khác mặc định: bridge không gửi (GPT-5) hoặc tự bỏ khi bị từ chối (400), nhớ cho các lần sau, và ghi chú dưới câu trả lời. Gemini và máy chủ tương thích OpenAI (Ollama…) nhận bình thường. Qua API của Anthropic, mức suy nghĩ được gửi bằng `output_config.effort`.
  - Sửa chính tả và Dịch trong thẻ Viết không dùng chỉ dẫn của chế độ (phải giữ nguyên ý).
- **Thẻ Viết (gợi ý viết / sửa nhanh tại chỗ)**: phần đang chọn tự cập nhật khi chọn chỗ khác (sự kiện DocumentSelectionChanged). Một chạm: Sửa chính tả, Viết gọn, Viết rõ hơn, Trang trọng, Dễ hiểu cho học sinh lớp 1–12, Tạo câu hỏi (3 trắc nghiệm + 2 tự luận), Tóm tắt, Viết tiếp, Gợi ý ý tưởng, Dịch Anh ⇄ Việt (tự nhận chiều), hoặc yêu cầu riêng. Không chọn gì thì Viết tiếp / Gợi ý ý tưởng dùng đoạn trước con trỏ (Word). Kết quả hiện để xem trước, rồi mới Thay thế / Chèn bên dưới / Sao chép. Mỗi lần là một lượt gọi ngắn, không công cụ, không lịch sử (nhanh); add-in tự đọc vùng chọn bằng Office.js nên không tốn vòng model. Kết quả được dùng thì thành tín hiệu cho học nền (không ghi nội dung văn bản).
- **Tương thích bản cài tên cũ (PDD)**: bridge đọc cả biến `PDD_*` (chép sang `PVTA_*`, `bridge/src/legacyenv.ts`), gói có thêm `pdd-bridge.mjs` (chỉ chuyển sang bridge mới) và `install/pdd.tar.gz` (bản sao cùng mã sha256) để máy cài từ thời PDD tự cập nhật được mà không mất máy chủ web của add-in (triệu chứng: ô add-in quay vòng mãi).
- **Áp dụng thử, Hoàn tác (Word)**: trước khi "Làm đẹp" hoặc áp chủ đề, add-in chụp toàn bộ nội dung (OOXML: định dạng, hình, công thức; `addin/src/office/restore.ts`). Làm xong thầy cô xem kết quả thật trên tệp, chưa ưng thì bấm **Hoàn tác** (trả đúng bản cũ, bỏ việc học), ưng thì **Giữ & học ngay** hoặc chỉnh thêm rồi Lưu. Sau khi trả về, add-in so chữ với bản gốc; lệch thì báo thầy cô dùng Ctrl+Z của Word. Excel, PowerPoint chưa có Hoàn tác.
- **Thẻ Chủ đề**: 6 mẫu theo môn (Khoa học, Thiên nhiên, Ấm áp, Tươi sáng, Mực tím, Trang trọng) hoặc tự chọn màu gốc + phong cách + cặp phông; xem trước đúng loại tài liệu (trang Word, bảng Excel, slide); Áp dụng ngay hoặc "Nhờ PVTA chọn theo nội dung". Áp dụng: Word đổi màu/phông đề mục, thân bài chỉ đổi phông (giữ chữ đen để in); Excel tô hàng tiêu đề, chữ tương phản theo WCAG; PowerPoint đổi phông/màu tiêu đề và chữ mọi slide. Model cũng dùng được qua `office_*_apply_theme` và `office_theme_presets`.
- Có chế độ tối theo hệ thống.

## Thiết kế nhanh (những chỗ quyết định tốc độ)

- **Quy tắc đi bằng `--system-prompt`** (claude) / trường `system` có cache (API): thay lời nhắc hệ thống mặc định rất dài của Claude Code (hướng dẫn lập trình, công cụ) bằng quy tắc của PVTA; prompt người dùng chỉ còn phần thay đổi. CLI cũ không có cờ này thì quy tắc tự chuyển vào prompt.
- **claude khởi động gọn**: `--safe-mode` (bỏ hook, plugin, skill của máy) và các biến `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY` (không tự cập nhật, không nạp CLAUDE.md / bộ nhớ lập trình của máy). Thích ứng phiên bản chỉ bỏ đúng cờ CLI báo lỗi (vì `--help` không liệt kê mọi cờ).
- **Khởi động sẵn**: khi thầy cô bắt đầu gõ (hoặc mở thẻ Viết), bridge chạy sẵn CLI với đúng đối số của lượt sắp tới và để nó chờ prompt ở stdin (claude, codex). Bấm Gửi chỉ còn ghi prompt vào, bỏ được thời gian khởi động CLI. Không dùng thì tự tắt sau 2 phút; tối đa 3 tiến trình chờ.
- **Gửi kèm phần đang chọn**: add-in đọc vùng chọn (tối đa 0,35 giây) và gửi cùng tin nhắn, nên lệnh kiểu "in đậm đoạn này" xong trong một vòng thay vì hai.
- Chỉ nạp skill nền của ứng dụng đang mở (Word không nạp skill Excel/PowerPoint).
- Lần đầu mở panel không chờ dò máy nếu đã biết backend từ lần trước; phiên bản CLI lấy từ lần dò, khỏi chạy `--version` trước lần gọi đầu.
- Hộp xác nhận có **Đồng ý tất cả**: các thay đổi còn lại của cùng yêu cầu chạy luôn.

- Chữ truyền về giao diện ngay khi model sinh ra (`--include-partial-messages` với `claude`, `text_delta` với `agy`); khối `office-tool` được lọc khỏi luồng hiển thị.
- Mỗi (backend, model) giữ một mã hội thoại của CLI (`--resume` / `--conversation`); lượt sau chỉ gửi phần mới. Đổi quy tắc, skill hoặc phong cách thì đặt lại mã; đổi qua lại giữa các model thì model quay lại nhận bản đầy đủ (vì có lượt nó chưa thấy). Model đã chọn được ghim và hiện lại khi mở panel.
- Một khối `office-tool` có thể là mảng JSON để gộp nhiều thao tác, giảm số vòng model ↔ Office.js.
- Prompt đầu chỉ nạp nội dung skill nền; skill học được chỉ liệt kê, model đọc khi cần bằng `office_skill_read`.
- Mức suy nghĩ chọn trong add-in (mặc định **Thấp** cho nhanh): với `claude` bridge thêm cờ `--effort <low|medium|high|xhigh|max>` vào mỗi lệnh gọi (cờ không bắt buộc, CLI cũ không có thì bị bỏ). Với `agy` (theo tài liệu Google) bridge thêm `--effort <low|medium|high>` (xhigh/max quy về high); mã model có hậu tố `-low/-medium/-high` đã gồm mức suy nghĩ nên không thêm cờ và ô bị khóa. Bridge cũng dùng `--print-timeout 15m` và `--disable-slash-commands` cho agy.
- Lần chạy đầu (và mỗi khi phiên bản CLI đổi) bridge chạy nền `--version` và `--help` của từng backend, đọc danh sách cờ và các mức `--effort`, lưu vào `probe.json` rồi gửi cho add-in; ô "Suy nghĩ" chỉ hiện đúng các mức CLI đang cài hỗ trợ. CLI chưa cài thì được ghi nhận là chưa cài; chưa dò xong thì dùng bảng mặc định.
- PowerPoint: đọc toàn bộ slide chỉ với vài lần đồng bộ Office.js (gom lệnh cho cả bài thay vì hai lần mỗi slide).
- Mọi phản hồi kèm thời gian từng khâu (`spawnMs`, `firstTokenMs`, `totalMs`, số vòng, thời gian mỗi lần gọi Office.js) và hiện ở cuối mỗi tin nhắn.

## An toàn

- Model được chọn là model được chạy; **không bao giờ tự đổi** khi lỗi. Lỗi đăng nhập, model, bị từ chối: báo rõ, không thử lại.
- Xóa `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY` trước khi gọi CLI, để CLI luôn dùng gói đăng ký.
- `claude` chạy với `--tools ""`, `--strict-mcp-config`, `--disable-slash-commands`; ba cờ này là bắt buộc, thiếu thì báo lỗi chứ không chạy yếu đi. Ngoại lệ duy nhất: khi bật **Cho phép công cụ kết nối** (xem mục dưới), PVTA bỏ `--strict-mcp-config` và `--safe-mode`.

### Kết nối Google, Canva qua MCP của từng CLI

PVTA không có MCP client riêng. Thầy cô tự thêm máy chủ MCP vào CLI và tự đăng nhập OAuth bằng lệnh của CLI; PVTA chỉ quyết định có chặn hay không.

**Bật trong PVTA:** ⚙ Cài đặt → Công cụ AI → **Cho phép công cụ kết nối** (mặc định **tắt**). Khi bật, nhập mỗi dòng một công cụ được phép, dạng `mcp__<máy-chủ>__<công-cụ>`; dòng sai dạng (vd `Bash`) bị bỏ. Tắt thì PVTA chạy y như trước.

**Thêm máy chủ vào từng CLI** (theo tài liệu chính thức của Google Antigravity `https://antigravity.google/docs/mcp` và `--help` trên máy):
- Claude Code: `claude mcp add -s user -t http <tên> <url>` (hoặc stdio: `claude mcp add -s user <tên> -e KEY=VAL -- npx -y <gói>`), rồi đăng nhập OAuth trong Claude.
- Codex: `codex mcp add <tên> --url <url>`, rồi `codex mcp login`.
- agy (Google Antigravity): `agy mcp add [cờ] <tên> <commandOrUrl> [tham-số...]` (cờ đứng trước `<tên>`, URL `http`/`https` tự nhận, dùng `--` trước lệnh có dấu `-`), hoặc khai báo trong `~/.gemini/config/mcp_config.json` (máy chủ HTTP từ xa dùng khóa `"serverUrl"` kèm `"oauth": { "clientId", "clientSecret" }`; máy chủ stdio dùng `"command"`, `"args"`, `"env"`).

URL máy chủ MCP chính thức của Google và Canva do nhà cung cấp công bố; thầy cô lấy từ tài liệu của họ. Tài liệu này không ghi URL vì chưa tra nguồn.

**Rủi ro:**
- AI có thể gửi email, sửa lịch hoặc sửa tài liệu qua kết nối; nội dung đi ra dịch vụ ngoài. Không dùng dữ liệu học sinh.
- Bật công tắc sẽ bỏ `--safe-mode` của Claude nên hook và plugin cá nhân cũng được nạp.
- Quyền ghi trong thư mục làm việc không mở rộng sang công cụ kết nối.

**Bảng kiểm chứng:**

| CLI | Phạm vi công tắc của PVTA | Google | Canva |
|---|---|---|---|
| Claude Code | Có: bỏ hai cờ chặn, lọc `--allowedTools`. Đã có kiểm thử đơn vị | Chưa kiểm chứng | Chưa kiểm chứng |
| Codex | Không: PVTA không chặn, cũng chưa giới hạn công cụ | Chưa kiểm chứng | Chưa kiểm chứng |
| agy | Có một phần: chế độ ghi dùng `--dangerously-skip-permissions` (bỏ qua mọi quyền); chế độ chỉ đọc dùng `--mode plan --sandbox` | Chưa kiểm chứng | Chưa kiểm chứng |

**Chưa có / chưa kiểm chứng:**
- Chưa chạy thật CLI nào với Google hoặc Canva; OAuth phụ thuộc tài khoản của thầy cô.
- Tên công cụ dạng `mcp__<máy-chủ>__<công-cụ>` mới lấy từ trợ giúp CLI, chưa kiểm chứng khi chạy.
- Codex: chưa rõ server trong `~/.codex/config.toml` có được gọi ở chế độ `exec` không, và `approval_mode` có hiệu lực không.
- agy: chưa rõ có nạp MCP ở chế độ `--print` không, và cách đăng nhập OAuth.
- Chưa có công tắc riêng cho thao tác ghi/gửi qua kết nối.
- Ba mức quyền: chỉ đọc, hỏi trước khi sửa (mặc định khi chưa chọn), toàn quyền (`agy` thêm `--dangerously-skip-permissions`, agy tự duyệt mọi công cụ kể cả chạy lệnh).
- Bridge chỉ chạy công cụ có trong danh mục và đúng ứng dụng đang mở; tên công cụ tự đặt bị từ chối trước bước phân loại đọc/ghi. Mã model từ add-in được kiểm tra (backend hợp lệ, ký tự an toàn).
- Hủy hoặc đóng panel khi đang chờ đồng ý / chờ Office.js: yêu cầu đang chờ kết thúc ngay, phiên không bị kẹt ở trạng thái bận. Tin nhắn hỏng không làm sập bridge.
- WebSocket chỉ nghe `127.0.0.1` và chỉ nhận kết nối từ Origin trong danh sách cho phép (`allowedOrigins` trong `config.json`), để trang web lạ không điều khiển được bridge. Ngoại lệ duy nhất là **chế độ iPad** (tắt mặc định): cổng 52732 mở trong mạng nội bộ nhưng bắt buộc mã ghép nối, xem mục *Dùng trên iPad*.
- Nội dung lấy từ tài liệu được coi là dữ liệu, không phải chỉ thị (có trong quy tắc gửi cho model).
- Học nền chỉ ghi lời yêu cầu đã che thông tin cá nhân, tên công cụ và **tên** tham số. Skill do máy sinh ra qua bộ lọc (tên, mô tả, độ dài, khối công cụ, lệnh shell, URL, khóa bí mật), có sao lưu khi ghi đè, tối đa 30 skill.
- Học nền chỉ học từ tác vụ có thao tác trên văn bản, chạy ở mức suy nghĩ thấp trong thư mục riêng `~/.phananh-office/learn/`; hàng đợi tối đa 200 mục.
- Skill nền `pvta-*` tự cập nhật khi cài bản mới, trừ khi người dùng đã sửa (so dấu vân tay trong `skills/.bundled.json`, có sao lưu).
- Thư mục ẩn `~/.phananh-office/workspace/<phiên>/` được xóa sau khi đóng panel (chờ 30 giây, học nốt tối đa 120 giây); thư mục cũ hơn 24 giờ bị dọn khi khởi động.

## Trạng thái

Đã làm và có test: giao thức, engine (thích ứng phiên bản CLI, thử lại tối đa 2 lần), quyền, thư mục ẩn, học nền, server WebSocket (kiểm thử đầu-cuối bằng CLI giả), bộ lọc skill. Đã chạy engine với `claude` thật một lần để xác nhận định dạng luồng.

**Chưa kiểm trên máy thật** (cần bạn kiểm):

- `codex` thật: định dạng `exec --json` (thread.started / item.* / turn.*) viết theo tài liệu tháng 4/2026, có đọc cả định dạng cũ; mã model gợi ý (`gpt-5.5`, `gpt-5.4-mini`, `gpt-5.3-codex`) cần khớp tài khoản. Mục "Mặc định của Codex" luôn chạy được.
- API: mã model gợi ý (`claude-sonnet-5-5`, `gpt-5.4-mini`, `gemini-flash-latest`…) chưa gọi thử với khóa thật.
- `agy` thật: hình dạng sự kiện `init`/`step_update`/`result` được viết theo đặc tả và phân tích dè dặt. Mã model `agy` trong `addin/src/models.ts` và model Auto (`gemini-3.8-flash-medium` trong `shared/src/protocol.ts`) là **đoán**, phải khớp đầu ra của `agy models`.
- Office.js: các bộ chạy công cụ trong `addin/src/office/` đã qua typecheck nhưng chưa chạy trong Word/Excel/PowerPoint thật; `manifest.xml` chưa được validate.
- Windows: bridge tự tìm lệnh theo `PATH`/`PATHEXT`; `.exe` chạy trực tiếp, shim npm (`.cmd`) được chạy thẳng bằng node (prompt nhiều dòng đi nguyên vẹn), còn lại mới qua `cmd.exe` với trích dẫn kiểu cross-spawn (prompt nhiều dòng qua `cmd.exe` thì báo lỗi rõ). Giới hạn ~28.000 ký tự khi prompt đi qua tham số dòng lệnh. Chưa chạy trên máy Windows thật.
- Bản cài đặt nối `wss://` cùng địa chỉ trang add-in (bridge phục vụ cả hai), nên không vướng chặn `ws://` của Safari. Chế độ phát triển (vite, cổng 3000) vẫn dùng `ws://127.0.0.1:52731`.

**Chưa làm** (theo đặc tả mục 11): công thức LaTeX → Word Equation, các công cụ Office còn lại (định dạng có điều kiện, biểu đồ, nền slide / theme gốc của PowerPoint — Office.js chưa cho đổi, trang Word), phím tắt F6 khi đang gõ trong tài liệu (cần shared runtime; hiện dùng thẻ Viết), danh sách model agy động (`agy models`, chưa rõ định dạng đầu ra), giao diện quản lý skill đã học, trình cài cho macOS/Windows, lời gọi công cụ từ ngoài qua HTTP (hàm `decide` đã hỗ trợ cờ `external`).

## Cập nhật giai đoạn 2 và các mục còn lại

- **Giao diện theo bố cục hermes**: thanh trên gọn (chừa 68px bên phải cho nút nổi của Office), thanh công cụ dưới (＋, thẻ Trò chuyện / Viết / Chủ đề, 🛡, ⚙), ô soạn lớn có hàng model · chế độ · 📚 · ✦ · gửi.
- **Chế độ Kế toán** (`accounting`): mọi phép tính qua `office_calc`, đối chiếu số trong tài liệu bằng `office_calc_check`. Bộ tính viết bằng TypeScript, số dạng phân số BigInt (0,1 + 0,2 = 0,3 đúng tuyệt đối), chỉ nhận cú pháp biểu thức nhỏ (không chạy mã). **Không cần Python**, nên trình cài không hỏi Python.
- **Trình cài hỏi công cụ AI** khi cài lần đầu hoặc máy chưa có claude / codex / agy: Windows mở cửa sổ 3 bước (chọn, tự cài, đăng nhập); macOS hỏi bằng chữ (`PVTA_INSTALL_CLI=none` để bỏ qua).
- **PVTA tự học chủ động**: lời khen/chê ngắn sau một thao tác thành tín hiệu (`shared/src/feedback.ts`); khen một lần chưa đủ để học; chỉ lưu đặc điểm đã trừu tượng hóa. Công tắc và danh sách xem/xóa ở ⚙ Cài đặt → PVTA tự học.
- **Nhiều tệp Office**: `office_docs_list`, tham số `target` trên mọi công cụ, `office_docs_open`. Luôn hỏi người dùng khi đụng tệp khác (kể cả Toàn quyền). Chỉ thấy các cửa sổ đã bật PVTA; không có tab gộp kiểu WPS (add-in không làm được).
- **Chưa kiểm trên Office thật**: mọi phần gọi Office.js và hai bộ cài trên Mac/Windows.

## Cập nhật: nút nhanh và Hội thoại & dự án

- Hàng nút nhanh trên ô soạn (Tóm tắt, Soát lỗi, Dịch, Tạo bảng): làm ngay với phần đang chọn.
- Nút 📁: ngăn Hội thoại & dự án. Hội thoại tự lưu, mở lại làm tiếp được; gom theo dự án (như project): mỗi dự án có quy tắc riêng, và hội thoại mới trong dự án chỉ mang bản tóm tắt các hội thoại cũ (PVTA tự tóm tắt nền, không mang cả lịch sử nên nhanh, ít tốn quota); "Quy tắc chung" áp cho mọi hội thoại; nút 🔗 bật/tắt dùng chung giữa Word, Excel, PowerPoint. Lưu trên máy ở `~/.phananh-office/chats.json` và `chats/`.

## Cập nhật: Skills cộng đồng và giao diện mới

- **Skills (🧩)**: nhập skill do cộng đồng chia sẻ (định dạng `SKILL.md`). Dán link GitHub của kho hoặc thư mục skill (`github.com/chủ/kho`, `/tree/nhánh/skills/ten-skill`, hoặc dạng ngắn `chủ/kho`): bridge tải về `SKILL.md` qua `raw.githubusercontent.com` và liệt kê thư mục qua `api.github.com` (chỉ hai máy chủ này, không tải link tùy ý), thầy cô tick những skill muốn thêm. Cũng dán được trực tiếp nội dung `SKILL.md`. Không cần đăng nhập GitHub (giới hạn khoảng 60 lượt liệt kê mỗi giờ).
  - **Chỉ lấy chữ hướng dẫn.** Model của PVTA không có shell hay Python, nên script và tệp tham chiếu đi kèm không được tải; phần hướng dẫn nhắc lệnh Python/shell bị bỏ qua và lời nhắc có dặn model như vậy.
  - **Mặc định `load: manual`**: chỉ nạp khi gõ `/tên-skill` ở ô chat (nạp tới 14.000 ký tự). Đổi trong bảng Skills: *Tự dùng khi hợp* (`demand`, model đọc bằng `office_skill_read`), *Luôn nạp* (`always`, tốn lượt dùng), *Tắt* (`off`).
  - **An toàn**: bộ lọc chặn khối `office-tool` giả, câu bảo bỏ qua chỉ dẫn (Anh/Việt), khóa bí mật, tên tệp nhạy cảm; skill quá 60 KB bị từ chối; không được mượn tên `pvta-*` và `learned-*`; trùng tên skill khác thì thêm số đuôi. Nguồn skill ghi ở `~/.phananh-office/skills/.imported.json`. Xóa skill nhập về trong bảng; skill của PVTA không đổi được ở đây.
  - Mã: `bridge/src/skillimport.ts` (quét, đọc YAML dễ dãi, lọc, cài, đổi chế độ, xóa), tin nhắn `skills_get | skills_scan | skills_install | skills_set | skills_delete` và `skills | skills_found` (`shared/src/protocol.ts`), bảng `addin/src/SkillsPanel.tsx`.
- **Giao diện (theo hướng hermes)**: ba thẻ Trò chuyện / Viết / Chủ đề thành hàng phân đoạn có biểu tượng; thanh tiện ích dưới có nhãn (Mới, Hội thoại, Skills, Lời nhắc, Quyền, Thêm); **menu ⋯ Thêm** (Quy tắc chung & dự án, PVTA đã học gì, Thư viện lời nhắc, Skills, **Tải hội thoại .md**, **Sao chép dạng Markdown**, **Chèn hội thoại vào tài liệu** (Word), Cài đặt); sáu chip màu (thêm *Viết hay hơn*, *Rút gọn*); tin nhắn dạng bong bóng; nhắc bắt đầu hội thoại mới khi quá 40 tin. Xuất hội thoại: `addin/src/chatExport.ts`.

## Cập nhật: chủ đề có sẵn của Office

- Thẻ Chủ đề đọc chủ đề, bảng màu, bộ phông có sẵn của chính Word/Excel/PowerPoint trên máy (tệp .thmx, Theme Colors, Theme Fonts; kèm ảnh xem trước thật). Không thấy thì dùng danh sách dự phòng. Office cài ở chỗ lạ: đặt biến môi trường `PVTA_THEME_DIRS` trỏ tới thư mục chủ đề.
- "Nhờ PVTA chọn theo nội dung": PVTA đọc cấu trúc tệp → đưa vài mẫu để chọn (Xem / Áp dụng) → người dùng mô tả ý muốn để PVTA chọn lại hoặc chỉnh thêm trong Trò chuyện.

## Cập nhật: Gợi ý thông minh (mặc định bật)

Khi mở tệp (hoặc quay lại cửa sổ, cách nhau ≥ 2 phút), add-in gửi `hint_get` kèm hồ sơ cấu trúc tệp; bridge trả gợi ý **chế độ viết, kỹ năng, dự án** dưới dạng nút nhỏ ở tab Trò chuyện (chỉ đề xuất, bấm mới áp dụng, có nút ×).
- **Hai tầng**: (1) luật cục bộ tức thì, không tốn model (`bridge/src/hints.ts`, bỏ dấu tiếng Việt, từ đơn + cặp âm tiết); (2) một lượt gọi model **rẻ và nhanh nhất** của backend đang dùng (agy `gemini-3.8-flash-low`, claude `haiku`, codex mặc định; effort thấp), chạy ở tiến trình riêng với `AbortController` riêng nên **chạy song song và không làm hủy việc chính**.
- **Không chạy liên tục** (`HintGate`): bộ nhớ đệm 6 giờ theo tệp; cách nhau ≥ 45 giây mỗi phiên; tối đa 10 lượt AI/giờ; mỗi lúc một lượt; lỗi thì nghỉ 10 phút và im lặng.
- **Về nhiều nhân CPU**: lượt này chủ yếu chờ mạng/CLI, đã chạy ở tiến trình khác nên không cần luồng tính toán; phần chấm điểm cục bộ chỉ vài mili giây. Chỉ khi sau này có chỉ mục tệp trên đĩa mới đáng dùng worker pool.
- **Riêng tư**: chỉ dùng hồ sơ cấu trúc, tiêu đề hội thoại và dự án trong PVTA; không quét đĩa tìm tệp liên quan (chưa làm).
- Tắt/bật: ⚙ Cài đặt → Gợi ý thông minh (hoặc `hints.enabled` trong cấu hình bridge).

### Văn bản liên quan trên mạng (không quét máy)

- Khi có tên tệp, bridge **tự tìm trên mạng** (không tốn lượt model, vì CLI model không có công cụ web): câu tìm lấy từ tên tệp và hồ sơ cấu trúc, kết quả bóc từ `html.duckduckgo.com`, bỏ mạng xã hội và trang lạc đề, ưu tiên `.gov.vn`, `.edu.vn`, thuvienphapluat.vn, vbpl.vn (`bridge/src/refs.ts`).
- **Chỉ lưu tên + link + lý do** vào `~/.phananh-office/refs/refs.json` (máy đọc) và `refs.md` (người đọc). Chưa tải nội dung. Nhớ 6 giờ theo tệp, tối đa 6 lần tìm mỗi giờ, một lượt một lúc, lỗi mạng thì im lặng.
- **Khi thầy cô bấm Xem** (`ref_open`): bridge mới tải trang, và chỉ với link đã nằm trong chỉ mục (không tải link tùy ý). Chỉ https, chặn địa chỉ mạng nội bộ kể cả khi bị chuyển hướng, tối đa 2 MB và 20.000 chữ, hết giờ sau 15 giây. PDF/Word thì báo mở link bằng trình duyệt. "Đưa vào chat" chèn phần đầu của trang vào ô soạn để trích thông tin.
- Xóa danh sách: ⚙ Cài đặt → Gợi ý thông minh → Xóa danh sách văn bản liên quan.

### Màn hình chat mặc định

Chip gợi ý (chế độ, kỹ năng, dự án) và danh sách văn bản liên quan nằm ngay trong màn hình trống của tab Trò chuyện, dưới lời chào. Hai gợi ý đầu của màn hình trống đổi theo tệp đang mở (`Hints.starters`): luật cục bộ theo kiểu viết đoán được (vd hành chính → "Soạn lại đúng thể thức văn bản hành chính"), rồi model rẻ nhất thay bằng hai câu lệnh sát nội dung tệp. Hai gợi ý cuối (sửa chính tả, định dạng) giữ cố định; chưa đoán được thì giữ cả bốn gợi ý mặc định.

### Tìm đúng địa bàn (v1.0.5)

Trước khi tìm văn bản liên quan, add-in gửi thêm vài dòng đầu của văn bản Word (`head`, chỉ bridge dùng cục bộ, **không đưa vào lời nhắc gửi model**). `bridge/src/place.ts` đọc ra đơn vị (vd THCS Phan Văn Trị), địa phương (vd phường Hạnh Thông) và tên văn bản (dòng tiêu đề viết hoa). Nếu văn bản không ghi tỉnh/thành, bridge tra tên địa phương một lần (tỉnh/thành nào được nhắc nhiều nhất trong kết quả; nhớ ở `refs/places.json`), rồi mới tìm kèm đơn vị, địa phương và tỉnh/thành. Kết quả của tỉnh khác (`*.quangngai.gov.vn` cho một phường ở TP Hồ Chí Minh) bị loại; chưa xác định được địa bàn thì cũng không mang trang địa phương lạ về, chỉ giữ trang trung ương và trang tổng hợp.

### Hai thư mục ẩn, hai tiến trình (v1.0.6)

Việc chính chạy trong `~/.phananh-office/workspace/<phiên>/`, gợi ý nền chạy trong `~/.phananh-office/hint/`, học nền trong `learn/`. Mỗi lượt là một tiến trình CLI riêng, không dùng chung thư mục làm việc (không chung trạng thái hội thoại, không giành nhau khóa tệp). Thư mục tách theo **nơi làm việc**, không tách nơi lưu đăng nhập của CLI: `agy`, `claude`, `codex` vẫn dùng chung một lần đăng nhập của máy, nên thầy cô không phải xác thực thêm lần nào. Chưa tách thư mục đăng nhập vì như vậy mỗi thư mục phải đăng nhập riêng.

## Cập nhật: đề thi và văn bản có hình (v1.0.7)

- **Bản đồ hình–câu** (`shared/src/examimages.ts`, `addin/src/office/images.ts`): add-in quét Word, nhận các dòng "Câu N" / "Bài N", gán mỗi hình (H1, H2…) vào câu chứa nó; nếu câu nhắc "hình 2" và có chú thích "Hình 2" thì gán theo chú thích (hình nằm xa câu vẫn đúng). Chỉ hình nằm cùng dòng chữ (inline); hình trôi tự do chưa đọc được.
- **Model nền đọc hình** trong thư mục ẩn riêng `~/.phananh-office/hint/img/`: add-in gửi bản đồ (không kèm ảnh); bridge xin ảnh của hình chưa đọc (`img_need`), add-in thu nhỏ còn cạnh dài 1024 px (JPEG) rồi gửi. Model rẻ nhất xem ảnh (claude: chỉ mở công cụ Read; codex: `--image`; agy: tự mở tệp trong thư mục làm việc), 4 hình một lượt, ghi mô tả, chữ/số trong hình và số liệu theo mã băm của ảnh (đọc một lần, mở lại tệp không đọc lại). Khóa API chưa gửi ảnh được.
- **Hai model trao đổi qua kho mô tả**: mỗi lượt của phiên chính trong Word kèm mục `<hinh_anh>` (hình nào thuộc câu nào, đã đọc được gì). Yêu cầu nhắc "câu 1" mà hình câu 1 chưa đọc thì phiên chính chờ model nền đọc xong (tối đa 45 giây) rồi mới giải. Công cụ `office_word_list_images` trả bản đồ kèm mô tả.
- **Giữ câu và hình cùng trang**: `office_word_keep_together` đặt "giữ với đoạn sau" + "giữ các dòng" (OOXML `keepNext`/`keepLines`) cho các đoạn của khối câu có hình, nên Word đẩy cả câu sang trang sau thay vì để hình một trang, lời câu hỏi một trang. Model được dặn gọi công cụ này sau khi chèn/sửa đề có hình (ở mức quyền "hỏi trước" thì thầy cô bấm đồng ý).
- Màn hình chat hiện "Đang đọc hình trong văn bản: 2/5". Tắt Gợi ý thông minh thì cũng tắt đọc hình nền.

## Cập nhật: công thức không còn hiện mã LaTeX (v1.0.8)

Gặp khi giải thử đề Vật lí: câu trả lời hiện `\frac{U}{R}`, `\ce{…}` rối. Ba chỗ cùng sửa:
- **Khung chat vẽ công thức**: `$…$` và `$$…$$` (cả `\(…\)`, `\[…\]`) được vẽ bằng MathML qua temml (`addin/src/mathRender.ts`, tải khi có công thức đầu tiên); công thức sai cú pháp giữ nguyên chữ, không mất. Dùng chung bộ tách công thức với phần chèn Word (`shared/src/mathtext.ts`).
- **Dặn model cách viết** (`mathRule` trong `bridge/src/prompts.ts`, cả chat và thẻ Viết): LaTeX giữa `$`, chữ tiếng Việt ngoài `$`, số thập phân `1{,}5`, đơn vị `\text{A}`, hóa học `\ce{…}`. Word thì chữ chèn vào tài liệu tự thành Equation; Excel/PowerPoint không có Equation nên dặn dùng Unicode thường (x², H₂O).
- **Thẻ Viết → Thay thế/Chèn trong Word** trước đây chèn chữ thô, nên mã LaTeX nằm nguyên trong văn bản; nay đi qua cùng đường chèn Equation như công cụ của chat.

## Cập nhật: nút "Làm đẹp" (v1.0.9)

Ở Word có biểu tượng **Làm đẹp** (trang giấy có tia sáng) trên thanh đầu, cùng hàng với PVTA. PVTA:

1. Nhận loại văn bản (đề kiểm tra, kế hoạch bài dạy, văn bản hành chính, phiếu học tập, chung) từ tên tệp và vài dòng đầu (quy tắc cục bộ, không gửi đi).
2. Tra cách trình bày loại đó trên mạng (bridge tự tìm, tải tối đa 2 trang, ưu tiên .edu.vn/.gov.vn) cộng quy chuẩn có sẵn (vd Nghị định 30/2020) nên không có mạng vẫn chạy.
3. Sửa trực tiếp trên tệp đang mở: phông, cỡ, căn lề, giãn dòng, đề mục. Không đổi nội dung.
4. Toán/Lý/Hóa: `office_word_math_scan` tìm đoạn có công thức dạng chữ, `office_word_replace_paragraph` viết lại thành Equation. Hình chỉ chứa công thức được model nền đọc ra LaTeX, `office_word_image_to_equation` thay hình bằng Equation (hình vẽ/đồ thị giữ nguyên).
5. **Chờ lưu rồi học (mức cao)**: sau khi làm đẹp, PVTA chụp định dạng từng đoạn; khi thầy cô bấm Lưu (Word không có sự kiện lưu nên add-in hỏi thuộc tính `saved` mỗi 2 giây, chỉ trong lúc chờ), PVTA so sánh bản của mình với bản đã sửa, chỉ giữ ĐẶC ĐIỂM thay đổi (vd "cỡ chữ: 13 → 12 (20 đoạn)", không có chữ nào của văn bản) và đưa vào học nền ở mức cao (chạy ngay, tạo/cập nhật skill `learned-*` theo loại văn bản). Xong thì tắt chế độ chờ. Có nút "Học ngay" và "Bỏ qua". Tôn trọng công tắc học nền: tắt học thì không học.

Giới hạn: chỉ Word; hình nội tuyến; mất tối đa vài giây sau khi lưu để nhận ra; chưa thử trên Word thật.

**v1.0.11:** dàn trang không còn do model tự đặt từng định dạng (dễ hỏng, từng làm cả đề bị đậm): công cụ `office_word_beautify_layout` phân vai từng đoạn bằng quy tắc (đầu đề, tiêu đề, mục I./II., "Câu N." chỉ đậm nhãn, phương án A–D thụt vào, lời giải, thân bài căn đều, đoạn trống thu nhỏ, chữ ký, nơi nhận) rồi áp phông Times New Roman, cỡ, giãn dòng, cách đoạn theo loại văn bản. Model chỉ kiểm tra lại, đổi công thức và hình.

**v1.0.12:** khi PVTA đang chạy có ba chấm nhảy (như bot chat) ở thanh đầu (cạnh tên Word) và phía trên ô nhập, không có chữ, nên thấy ngay là chưa xong dù câu trả lời đã hiện.

**v1.0.14:** PVTA tự tìm và định dạng chữ trong văn bản (`office_word_format_find`: in đậm/tô màu hàng loạt, vd đáp án đúng của 24 câu, tìm theo đầu đoạn để không đụng chỗ trùng chữ), không còn đòi người dùng bôi đen từng chỗ hay dùng Tìm và Thay thế.

**v1.0.15:** chặn model lặp vô hạn (vd hàng nghìn thẻ `<br>`): bridge phát hiện chuỗi ngắn lặp từ ~300 ký tự trở lên thì dừng ngay và báo lỗi rõ ràng; chat cũng đổi `<br>` thành xuống dòng.

## Cập nhật: góp kiến thức và cập nhật bằng lệnh cài đặt

**⚙ Cài đặt → "Góp kiến thức cho PVTA"** (`bridge/src/community.ts`): gửi những mục PVTA đã học (chỉ skill `learned-*`) lên GitHub để bản cập nhật sau mang kiến thức chung đến mọi máy.
- Chỉ gửi khi thầy cô bấm: "Xem trước và gửi" liệt kê từng mục, bỏ tích mục không muốn gửi, rồi "Gửi lên GitHub". Không có gửi nền.
- Không gửi văn bản, đề thi, hội thoại, tệp phong cách, hàng đợi học hay skill tự viết. Mỗi mục được kiểm tra lại bằng bộ lọc lúc học (không URL, lệnh shell, khóa bí mật, khối công cụ) rồi che email, số điện thoại, dãy số dài. Bản gốc được kiểm tra **trước** khi che (che trước sẽ biến URL thành `[url]` và lọt bộ lọc).
- Dạng gửi: một issue tiêu đề `[phan-hoi] PVTA <phiên bản>: N mục học được`, thân có Markdown ngắn và một khối JSON (`pvta-feedback/1`: `version`, `platform`, `date`, `skills[{name, description, body}]`, tối đa 30 mục, dưới 50.000 ký tự). Máy cũng lưu `.md` và `.json` trong `~/.phananh-office/feedback/`.
- **Cách đến GitHub:** PVTA không giữ và không nhúng khóa truy cập nào. Máy có GitHub CLI (`gh`) đã đăng nhập thì tạo issue tự động. Máy không có thì PVTA hiện hai nút: chép nội dung, mở trang tạo issue để dán (cần tài khoản GitHub). Muốn thầy cô không cần tài khoản GitHub thì phải có một máy chủ trung gian giữ khóa, chưa làm.

**Người phụ trách gộp vào bản cập nhật:**

```
npm run collect-feedback -w bridge                  # chỉ liệt kê (cần gh đã đăng nhập)
npm run collect-feedback -w bridge -- --accept      # ghi skills/cd-*/SKILL.md và feedback/accepted.json
npm run collect-feedback -w bridge -- --file issues.json   # đọc issue từ tệp [{number,title,body}] thay vì gọi gh
```

Đọc kỹ phần liệt kê trước khi `--accept`: nội dung do người ngoài gửi và sẽ vào lời nhắc của mọi máy. Cùng nội dung từ nhiều máy gộp làm một; cùng tên khác nội dung thêm hậu tố `-2`, `-3`; mục đã duyệt không bị ghi đè. Skill `cd-*` nạp theo nhu cầu (`load: demand`), hiện ở bảng Skills là "cộng đồng" (tắt/xóa được), và đi kèm gói `pvta.tar.gz` như skill `pvta-*`, nên máy nào cập nhật cũng nhận. Mỗi mục thêm một dòng chỉ mục vào lời nhắc, nên chỉ duyệt mục thật sự hữu ích. Sau `--accept`: chạy kiểm thử, tăng phiên bản, `scripts/package.sh`, đẩy thẻ `v*`.

**⚙ Cài đặt → Phiên bản → "Cập nhật bằng lệnh cài đặt"**: ngoài nút "Cập nhật ngay" (tải gói, kiểm tra sha256, đổi chỗ tại chỗ), PVTA có thể chạy lại đúng lệnh cài đặt từ GitHub, tùy hệ điều hành (`installerCommand` trong `bridge/src/updater.ts`):
- macOS: `curl -fsSL https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.sh | bash`
- Windows: `irm https://raw.githubusercontent.com/phandinhdoc-spec/MySoft/main/install/install.ps1 | iex` (qua `powershell.exe -ExecutionPolicy Bypass`)

Lệnh chạy tách rời bridge, không hỏi gì giữa chừng (`PVTA_INSTALL_CLI=none`, `PVTA_NO_GUI=1`), nhật ký ở `~/.phananh-office/update.log`. Script tự dừng bridge, thay bản mới rồi bật lại; add-in tự nối lại và tải lại trang khi thấy số phiên bản đổi. Quá 3 phút bridge vẫn chạy thì báo chưa hoàn tất. Địa chỉ cố định vào kho `phandinhdoc-spec/MySoft`, nhánh main; chỉ chạy khi thầy cô bấm và xác nhận, không chạy khi PVTA chạy từ mã nguồn; Linux chưa có lệnh.

Giới hạn: phần chạy lệnh cài đặt trên Mac/Windows thật **chưa được thử** (chỉ có kiểm thử giả lập tiến trình). Điểm cần để mắt: trên macOS, `install.sh` gọi `launchctl bootout` dừng chính bridge đang chạy nó; tiến trình con được tách (`detached`) nên dự kiến sống sót, nhưng cần thử trên máy thật trước khi phát hành.

## Cập nhật: Làm đẹp bằng một prompt (bỏ hết mẫu), thêm cho Excel

- **Bỏ mẫu**: không còn kiểu LaTeX/Typst/Times New Roman, quy chuẩn dựng sẵn theo loại tệp, tra mạng cách trình bày, hay công cụ dàn trang cố định (`office_word_beautify_layout`, `shared/src/layout.ts`, `typeset.ts`). Nút ✨ chỉ gửi **một lời nhắc chuyên nghiệp** (`bridge/src/beautify.ts`) rồi model (Gemini, Sonnet…) tự khảo sát tệp, tự nhận loại tài liệu, tự chọn cách trình bày bằng công cụ sẵn có. Nhanh hơn vì không tra mạng; kỹ năng và quy tắc PVTA đã học vẫn được ưu tiên.
- **Lời nhắc** gồm nguyên tắc bất biến (không đổi nội dung, giữ cấu trúc, nhất quán, theo thể thức hiện hành), quy trình (khảo sát, chốt hệ trình bày, làm theo lô, kiểm tra lại, báo ngắn) và phần riêng cho Word (Equation, hình, giữ câu-hình cùng trang), Excel, PowerPoint.
- **Excel**: có nút ✨ ở Excel. Model gọi `office_excel_inspect_layout` (chỉ đọc: khối tiêu đề, đầu bảng nhiều tầng, vùng dữ liệu, dòng tổng, **ô gộp**, căn lề hiện có) rồi định dạng theo từng vùng, không bao giờ theo "hàng đầu của sheet". `office_excel_apply_theme` cũng tô đúng khối đầu bảng. Hoàn tác bằng bản chụp định dạng ô (`getCellProperties`), học theo vai trò vùng khi thầy cô bấm Lưu. Chưa thử trên Excel thật.

## Cập nhật: dùng trên iPad (v1.0.22)

iPad không chạy được agy/claude/codex, và Office cho iPad không nạp add-in từ `localhost`. Vì vậy máy tính đã cài PVTA (Mac hoặc Windows) làm **máy chủ** cho iPad trong cùng Wi-Fi: iPad gửi yêu cầu, máy tính chạy AI rồi trả kết quả. Mặc định **tắt**.

**Bật:** trên máy tính, PVTA → Cài đặt → **📱 Dùng trên iPad** → Bật. Rồi làm 4 bước hiện ngay trong mục đó:

1. Trên iPad mở Safari vào `http://<tên-máy>.local:52733` → tải hồ sơ PVTA → Cài đặt → Đã tải về hồ sơ → Cài đặt; rồi Cài đặt chung → Giới thiệu → Cài đặt tin cậy chứng nhận → bật **PVTA iPad CA**.
2. Cắm cáp iPad. Mac: Finder → iPad → Tệp. Windows: iTunes → iPad → Chia sẻ tệp.
3. Bấm **Mở thư mục manifest**, kéo `PVTA-iPad.xml` vào **Word** và **Excel**. (Wi-Fi không nhận tên `.local` thì dùng `PVTA-iPad-theo-IP.xml`.)
4. Trên iPad: Word/Excel → mở tệp → Trang đầu → Phần bổ trợ → Xem tất cả → **PVTA (iPad)**.

**Cách hoạt động:**

| Cổng | Giao thức | Dùng cho |
|---|---|---|
| 52732 | HTTPS + wss, mọi giao diện mạng | Add-in và WebSocket cho iPad |
| 52733 | HTTP | Trang hướng dẫn + hồ sơ chứng chỉ (không chứa mã) |
| 52730/52731 | như cũ, chỉ 127.0.0.1 | Office trên chính máy tính |

- **Chứng chỉ riêng cho iPad** (`~/.phananh-office/ipad/certs`): PVTA tự tạo một CA (cài lên iPad một lần) và chứng chỉ máy chủ theo đúng yêu cầu iOS (SAN, serverAuth, SHA-256, ≤ 825 ngày). Đổi Wi-Fi / đổi IP thì chứng chỉ máy chủ và manifest theo IP tự tạo lại mỗi phút; CA giữ nguyên nên iPad không phải cài lại.
- **Mã ghép nối:** manifest iPad mang mã ngẫu nhiên 192 bit (`?k=…`). WebSocket thiếu mã hoặc sai mã bị từ chối (401), Origin lạ bị từ chối (403). **Đổi mã ghép nối** ngắt ngay iPad cũ. Tệp `.xml` này không nên gửi cho người khác.
- **Trên iPad:** nút và ô nhập to hơn cho ngón tay, ô nhập 16px để iOS không tự phóng to; ẩn "Thêm thư mục" (Safari iPad không chọn được thư mục); iPad không tự tắt được chế độ iPad, không mở được thư mục trên máy tính.
- **Giới hạn:** Microsoft chỉ hỗ trợ chính thức Word và Excel trên iPad (PowerPoint có thể không hiện). Máy tính phải bật, không ngủ. Wi-Fi trường thường chặn các máy nhìn thấy nhau: dùng điểm phát Wi-Fi điện thoại. Lần đầu bật, macOS/Windows có thể hỏi cho phép kết nối đến: chọn Cho phép.

## Cập nhật: làm đẹp có mắt, thống kê chính xác, bộ cài hỏi công cụ AI (v1.0.25)

- **✨ Làm đẹp tự nhìn kết quả**: thêm `office_word_get_preview` (xuất PDF cả văn bản), `office_excel_get_preview` (ảnh PNG vùng dữ liệu, tối đa 60 hàng × 20 cột), `office_ppt_get_preview` (ảnh PNG từng slide, tối đa 12 slide/lần). Bridge lưu tệp vào thư mục phiên và gửi kèm lượt gọi kế tiếp, nên model soát được lỗi chỉ thấy bằng mắt (tràn, cắt chữ, lệch lề, chữ nhỏ, hình tách khỏi câu) rồi sửa, xem lại tối đa 2 lần. Claude và agy xem được cả PNG lẫn PDF; Codex chỉ xem PNG; khóa API bỏ qua bước nhìn. PowerPoint cần bản hỗ trợ PowerPointApi 1.8, Excel cần ExcelApi 1.7; thiếu thì model được báo và kiểm tra bằng công cụ đọc.
- **Phần PowerPoint của lời nhắc làm đẹp** viết lại đầy đủ: nhận vai trò slide, cỡ chữ theo cấp (tiêu đề 32–40 pt, nội dung 24–28 pt, không dưới 18 pt), tối đa ~6–7 dòng mỗi slide, căn thẳng theo số đo thật, lề an toàn ~30 pt; tràn thì báo, không tự xóa hay tự tách slide. `office_ppt_get_slides` nay trả thêm vị trí và kích thước từng hình.
- **Xem lời nhắc**: dưới bong bóng "Làm đẹp văn bản này" có dòng gập "Xem lời nhắc PVTA đã gửi cho model", hiện đúng lời nhắc đầy đủ.
- **Kế toán: hàm thống kê trong `office_calc`** (vẫn tính bằng phân số, không cần Python): `median`, `var_p`/`var_s`, `stdev_p`/`stdev_s` (như Excel), `sqrt`, `wavg` (điểm trung bình có hệ số), `percent`, `rank`, `count_ge`/`count_gt`/`count_le`/`count_lt`/`count_eq`, `count`. Căn bậc hai đúng tuyệt đối khi kết quả hữu tỉ, còn lại đúng tới 30 chữ số thập phân.
- **Bộ cài** (macOS và bản dòng lệnh Windows): lần cài đầu luôn hiện menu công cụ AI, công cụ đã có trên máy được đánh dấu; chọn công cụ chưa có thì tự cài, rồi mời đăng nhập ngay trong cửa sổ cài (Codex dùng `codex login`). Cài xong thì khởi động lại PVTA để nó thấy công cụ mới. Bản cập nhật chỉ hỏi khi máy chưa có công cụ nào.

## Cập nhật: học phong cách từ tệp (v1.0.24)

⚙ Cài đặt → PVTA tự học có hai nút: **Học từ tệp đang mở** và **Học từ tệp của dự án**. Chỉ chạy khi bấm. PVTA lấy mẫu có giới hạn (đã che email, URL, số điện thoại, dãy số dài), nhờ model rút ra *phong cách và quy ước* (bố cục, giọng văn, thuật ngữ, cách trình bày) thành skill `learned-*` đánh dấu `source: file`; không lưu chữ của tệp, không học thuộc nội dung (đã có RAG và tệp dự án cho việc đó). Skill này ở lại máy, không bao giờ vào gói gửi cộng đồng. Cần đăng nhập Claude/Codex/Antigravity (chưa hỗ trợ khóa API).

## Cập nhật: RAG từ tệp đang mở (v1.0.23)

PVTA lập chỉ mục chính tệp đang mở ngay trên máy (không API, không embedding, không gửi lên mạng) rồi mỗi câu hỏi tự chèn các đoạn liên quan nhất kèm nhãn vị trí. Hỏi nhanh hơn, ít tốn lượt hơn, và tệp dài vẫn trả lời đúng thay vì để model đọc cả tệp.

- **Đọc tệp thành đoạn có cấu trúc** (`addin/src/office/ragsource.ts`): Word theo đoạn thật + đường dẫn đề mục (kiểu dựng sẵn nên không phụ thuộc ngôn ngữ Office), bảng gộp một dòng; Excel theo khối ≤ 25 hàng, mỗi hàng ghi "Tiêu đề cột: giá trị" và nhãn đúng địa chỉ ô (kể cả vùng không bắt đầu ở A1); PowerPoint theo slide.
- **Chỉ mục và truy xuất** (`shared/src/rag.ts`, thuần hàm): tách từ tiếng Việt bỏ dấu (gõ không dấu vẫn khớp), ghép cặp từ liền kề để bắt từ ghép ("quang hợp", "định luật"), từ dừng lọc theo dạng còn dấu (giữ "lá", bỏ "là"), xếp hạng BM25 có thưởng khi khớp tên mục và sàn độ dài để dòng ngắn không thắng chỉ vì ngắn. Chia đoạn ~900 ký tự theo mục, có đoạn gối đầu.
- **Mỗi lượt hỏi** (`bridge/src/chat.ts`): tệp ngắn (≤ 5.000 ký tự) đưa nguyên văn; hỏi cả tài liệu ("tóm tắt", "dàn ý", "toàn bộ") đưa dàn ý các mục; còn lại đưa tối đa 6 đoạn khớp nhất theo thứ tự trong tài liệu, trong ngân sách ~7.000 ký tự, cắt phần gối đầu lặp. Câu nối tiếp ("còn đơn vị của nó?") dùng thêm câu hỏi trước và phần đang chọn. Lệnh định dạng không dính nội dung thì không chèn gì. Model cần thêm thì gọi `office_rag_search {query}` hoặc `{around: id}`. "Làm đẹp" bỏ qua RAG.
- **Nguồn bấm được**: `[Đoạn 12]`, `[Slide 3]`, `[Sheet1!A5:F20]` trong câu trả lời là nút; bấm để chọn và cuộn tới đúng chỗ trong Word/Excel/PowerPoint.
- **Luôn đúng với tài liệu**: chỉ mục đánh dấu cũ khi PVTA vừa sửa tài liệu hoặc quá 90 giây, và được làm mới (tối đa 1,5 giây) trước khi gửi câu hỏi. Dấu vân tay nội dung: tài liệu chưa đổi thì không gửi lại.
- **Điều khiển**: nút sách trên thanh đầu (chấm xanh = đã lập chỉ mục, bấm để lập lại); Cài đặt → Tìm trong tệp đang mở để bật/tắt (mặc định bật). Chỉ mục nằm trong bộ nhớ của bridge, không ghi ra đĩa.
- **Giới hạn**: một tệp (đang mở) mỗi cửa sổ; tối đa ~3 triệu ký tự; chưa có embedding ngữ nghĩa nên câu hỏi dùng từ hoàn toàn khác tài liệu (đồng nghĩa xa) có thể không khớp, khi đó model dùng `office_rag_search` với từ khóa khác.


## Làm đẹp Word theo cấu trúc

Nút Làm đẹp yêu cầu AI đọc toàn bộ danh sách đoạn (có phân trang), nhận diện tiêu đề tài liệu, phụ đề, Heading 1–6, thân bài và chú thích. Các tín hiệu như chữ hoa, in đậm và số thứ tự chỉ là gợi ý; AI phải xét ngữ nghĩa/quan hệ cha-con, không coi câu hỏi, đáp án hoặc ô bảng là đề mục. Công cụ gán style thật theo vị trí + nội dung nguyên văn, từ chối nếu nguồn đã đổi hoặc phân cấp bị nhảy. Cỡ chữ/màu/phông được áp theo hệ riêng; không mặc định lấy theme Office.

Sau khảo sát, AI đề nghị mục lục, danh mục bảng và từ viết tắt phù hợp. Việc chèn cần duyệt riêng, kể cả khi đang bật toàn quyền hoặc Đồng ý tất cả. Mục lục dùng Heading 1–3; danh mục bảng dùng style riêng `PVTA Table Caption`; từ viết tắt cần nghĩa và dẫn chứng có thật trong nguồn. Không tự suy diễn nghĩa, thêm chú thích hay chèn trùng danh mục. Chèn danh mục cần Word desktop hỗ trợ WordApi 1.5; nếu cập nhật trường thất bại, công cụ báo cần cập nhật trong Word. Phân cấp cơ bản cần WordApi 1.3. Danh mục hình hiện chỉ được đề xuất, chưa có công cụ tạo tự động.

Các công cụ: `office_word_get_structure`, `office_word_apply_outline`, `office_word_insert_index`. Luồng kiểm thử mô phỏng Office.js xác minh style ngữ nghĩa, vị trí neo, phân cấp, nguồn từ viết tắt và trường mục lục; vẫn cần kiểm thử trên Word Windows/Mac với tài liệu thực tế trước phát hành.


## Thiết kế AI: chọn ý tưởng trước khi áp dụng

Thẻ Thiết kế AI thay toàn bộ bộ chọn mẫu/chủ đề có sẵn. Bấm Làm đẹp sẽ mở bước đề xuất; AI đang được chọn đọc cấu trúc và tự tạo 3 ý tưởng khác nhau về bố cục, phân cấp, bảng, phông và màu. Các thẻ chỉ là minh họa hệ chữ/màu, không phải bản render Office. Chọn một thẻ rồi bấm Dùng phương án đã chọn để AI đọc lại tài liệu và thực hiện qua công cụ Office. Phương án được chuyển đầy đủ vào lời nhắc làm đẹp, bao gồm phông/cỡ chữ và quy tắc bố cục. Có thể yêu cầu tạo ý tưởng khác. AI trả kết quả không hợp lệ thì báo thử lại, không dùng mẫu dự phòng. Không cung cấp office_theme_list/office_theme_presets cho model trong luồng công cụ nữa.

Word/Excel giữ luồng chụp bản gốc và hoàn tác hiện có. PowerPoint thực hiện thiết kế đã chọn qua công cụ slide, dùng Hoàn tác của PowerPoint; chưa có bản chụp khôi phục toàn bài trong add-in. Các thao tác vẫn chịu mức quyền hiện có; việc thêm mục lục/danh mục cần duyệt riêng.

## Dùng chung với PVTA Chat: Sổ nguồn, PDF, quy tắc, lời nhắc, skill

- **Lời nhắc, skill, chế độ viết** nằm chung trong thư mục dữ liệu PVTA (`prompts.json`, `skills/`, `modes.json`), nên Chat và add-in thấy cùng một bộ.
- **Sổ nguồn** (⋯ → Sổ nguồn): dùng chung thư mục `notebooks/` với Chat; tạo, đổi tên, xóa ở bên nào thì bên kia thấy (bộ nhớ đệm tự nạp lại khi tệp đổi). Tick «Dùng trong chat» thì AI của add-in nhận danh mục tệp và đoạn trích theo câu hỏi, đọc trọn tệp bằng công cụ `notebook_source_read`. Danh sách sổ liên kết với add-in lưu ở `addin-notebooks.json` (chung Word, Excel, PowerPoint; không lẫn với liên kết riêng của từng hội thoại bên Chat). Tệp được tải lên bridge từng phần (tin `nb_upload`), đọc bằng `documents.py` (đi kèm gói cài, cạnh `pvta-bridge.mjs`).
- **PDF**: đọc chữ ngay trong add-in (pdf.js, nhãn `[Trang N]`); PDF scan được gửi sang bridge để OCR khi máy có `tesseract` và `pdftoppm`, không có thì báo rõ lý do. Công cụ `office_pdf_pages` cho AI đọc theo trang (tối đa 15 trang mỗi lần) hoặc tìm trang theo từ khóa.
- **Quy tắc**: quy tắc chung và quy tắc `#khóa` cá nhân tạo ở Chat được add-in đọc **một chiều** từ `chatbox/state.json` (luôn áp dụng, hoặc gọi bằng `#khóa`). Add-in không ghi vào tệp này vì Chat giữ dữ liệu trong bộ nhớ và sẽ ghi đè; muốn sửa thì sửa ở Chat. Quy tắc chung/dự án riêng của add-in (`chats.json`) vẫn như cũ. Quy tắc dự án của Chat chưa được đồng bộ (hai bên có danh sách dự án riêng).

## Soạn prompt trong quy trình độc lập của PVTA Chat

Ô prompt hiển thị gợi ý bằng chữ nghiêng; gõ `!` để xem mẫu chỉ thị và `$` để xem tên trong phạm vi quy trình. Bộ gợi ý và trợ lý AI dùng chung kiến thức về cú pháp, phạm vi biến, đầu vào/đầu ra và quan hệ chờ giữa các nút.

Khi phát hiện lỗi cú pháp hoặc tham chiếu, PVTA hiển thị lỗi đầu tiên cùng nút, dòng (nếu xác định được) và cách sửa. Chọn **Tự sửa** để chỉnh bản xem trước hoặc **Nhờ AI sửa** để nhận đề xuất. Chỉ **Áp dụng** mới thay prompt; bản xem trước còn lỗi ở nút hiện tại hoặc prompt gốc đã đổi sẽ chưa được áp dụng. Lỗi thuộc nút khác cần mở nút đó để sửa. Việc kiểm tra này không xác nhận tính đúng đắn của nội dung chuyên môn, sự tồn tại của tệp hay khả năng chạy thành công của model.

## Gợi ý khởi đầu theo ứng dụng Office

Màn hình trò chuyện hiển thị tác vụ phù hợp với ứng dụng đang mở:
- **Word:** soạn giáo án, tạo phiếu học tập, sửa chính tả và định dạng văn bản.
- **Excel:** tính điểm trung bình, kiểm tra công thức và dữ liệu thiếu, tô màu điểm và sắp xếp danh sách.
- **PowerPoint:** tạo dàn ý, thêm slide tóm tắt, câu hỏi ôn tập và kiểm tra chính tả trên slide.

Bấm một thẻ để điền yêu cầu vào ô chat, bổ sung nội dung rồi gửi. Gợi ý thông minh theo nội dung tệp (nếu bật) hiển thị bổ sung bên dưới. Bộ công cụ giáo viên vẫn có trong thẻ công cụ riêng.


## Plan và tiếp tục công việc trong PVTA Chat

**Xem trước lời nhắc quy trình (chỉ PVTA Chat desktop; add-in Office không có bước này):** nút thông thường và bản sao từ **Chèn quy trình** được viết lại theo YAML trước khi chạy, kể cả gọi từ chat hoặc cửa sổ riêng. Khung xem trước chia không gian, màn hình hẹp chuyển giữa vùng làm việc và bản viết lại. Hai nút **Duyệt và chạy ngay**, **Sửa lại** chỉ hiện khi có bản nháp. Không bắt buộc điền đầu vào/đầu ra từng nút; dữ liệu bước trước vẫn truyền theo liên kết. Duyệt và chạy ngay chỉ áp dụng cho lượt chạy; bấm **Lưu vào bản sao** nếu muốn ghi bản tốt vào các nút bản sao (không chạy). Nút gốc của Plan và quy trình dùng biến/hàm giữ nguyên. Prompt, liên kết hoặc tài nguyên đổi thì phải tạo lại bản nháp. Bấm **Lưu vào bản sao** rồi chưa chạy: lần **Chạy** sau mở lại khung duyệt với bản đã lưu, không gọi model viết lại. Bấm **Đóng xem trước** khi đang viết lại thì không chạy và không ghi gì. Lỗi model hoặc JSON sai được báo kèm tên nút, không chuyển sang chạy; tệp đính kèm đã mất thì dừng trước khi gọi model và nêu rõ nút, tệp.

Phần này mô tả **ứng dụng PVTA Chat desktop**. Cửa sổ quy trình, khôi phục Plan và Biên tập nền dưới đây không phải các nút của add-in Office.

### Từ yêu cầu đến bản nháp được duyệt

1. Chọn **Plan** ở ô nhập, nêu mục tiêu và đầu ra mong muốn. PVTA được hướng dẫn tìm hiểu chủ đề, loại tài liệu, môn/lớp, tài liệu trong hội thoại/dự án và nguồn liên quan. Với giáo án, cung cấp bài học, thời lượng, trình độ học sinh và điều kiện lớp; thiếu thông tin quan trọng thì trả lời câu hỏi làm rõ trước khi tạo Plan.
2. Đọc **Bối cảnh và căn cứ**, gồm Dữ kiện, Đề xuất, Giả định và Giới hạn xác minh. Nguồn có xuất xứ, ngày truy cập, phạm vi sử dụng và trạng thái đã đọc/đọc một phần/chưa xác minh. Văn bản hướng dẫn và phụ lục, chẳng hạn Công văn 5512 khi phù hợp, cần được đối chiếu theo cấp học, địa phương và thời điểm; không mặc định áp dụng cho mọi giáo án. Phương pháp và kĩ thuật dạy học phải phù hợp mục tiêu, học sinh và điều kiện thực tế. Kiểm tra cấu trúc Plan không chứng minh AI đã đọc đúng nguồn.
3. Bấm **Chỉnh sửa trực tiếp**, sửa bối cảnh hoặc từng bước: mục tiêu, việc làm, tệp, rủi ro, đầu vào, đầu ra, bước cần chờ, điều kiện hoàn thành và cách xử lí lỗi. Bấm **Lưu Plan và Quy trình**; không cần chép lại vào chat.
4. **Xem quy trình ↗** mở cửa sổ riêng với sơ đồ và chi tiết từng bước. Hai cách xem dùng chung dữ liệu đã lưu. Bản sửa chưa lưu được giữ riêng tại mỗi cửa sổ trên máy. Nếu phiên bản đã đổi ở nơi khác, bản sửa cũ bị chặn lưu: xem bản mới để đối chiếu, hoặc chọn **Bỏ bản sửa / tải bản mới** rồi sửa lại. Không có hợp nhất tự động hai bản sửa.
5. Bấm **Duyệt và chạy** để thực thi. Lưu hoặc đóng cửa sổ phụ không bắt đầu/dừng công việc. Trước khi duyệt, hệ thống kiểm tra vòng phụ thuộc, tham chiếu thiếu, trường đầu vào/đầu ra/tiêu chí trống và đầu ra trùng của bước độc lập. Mỗi lượt chạy giữ bản Plan đã duyệt; sửa Plan tạo phiên bản mới và cần duyệt lại.

### Theo dõi, lỗi và dữ liệu thay thế

Chat thông báo công việc hiện tại, bước tiếp theo, kết quả hoặc lỗi. Plan/Quy trình hiển thị Chờ, Đang chạy, Xong, Lỗi, Bị chặn, Bị ngắt và Đã chấp nhận bỏ qua; mỗi bước có thời gian, nhật kí và kết quả.

- **Thử lại bước này**: với bước có tác động chưa rõ, thực hiện Đối chiếu khôi phục trước khi thử lại.
- **Chấp nhận bỏ qua và tiếp tục**: chỉ bỏ qua sau khi người dùng chọn. Bỏ qua không sinh kết quả cho bước phụ thuộc. Bước thiếu kết quả vẫn Bị chặn; dùng **Bổ sung đầu vào**, ghi dữ liệu thay thế rồi **Tiếp tục**, hoặc giữ bước bị chặn.
- **Dừng**: ngắt lượt chạy và giữ kết quả đã xong. Các nhánh độc lập đủ điều kiện vẫn có thể tiếp tục khi một nhánh lỗi; Plan hiện thực hiện lần lượt theo phụ thuộc, không cam kết chạy song song.

### Mở lại sau gián đoạn

Vào **Nhật kí → Việc còn dở / bị gián đoạn**, tìm theo bài học hoặc tài liệu. Kết quả kết hợp Plan, lịch sử hội thoại và nhật kí; nếu có nhiều việc, chọn đúng mã công việc và xem phần đã xong/còn lại.

Trong Plan chọn **Đối chiếu khôi phục**, kiểm tra tệp đổi/mất, đầu vào, kết quả và thao tác đã ghi nhận. Ghi bằng chứng rồi chọn **Xác nhận kết quả đã hoàn thành** để tránh làm lại, hoặc **Đã đối chiếu, cho phép thử lại** rồi Tiếp tục. Tệp đổi sau đối chiếu yêu cầu kiểm tra lại. Khi chưa chắc, giữ bước bị chặn. Mốc khôi phục lưu mã lượt chạy, phiên bản đã duyệt, đầu vào, kết quả và dấu vân tay tệp đã biết.

Dấu vân tay không xác nhận chất lượng nội dung hoặc tác động tại dịch vụ ngoài. Thư mục, liên kết, tệp lớn và bản nháp Office cần đối chiếu thủ công. Kiểm tra hệ thống đích trước khi gửi lại yêu cầu có thể đã thành công.

### Tự học và Làm ngay

**Cài đặt → Chung → Những điều đã học** hiển thị bật/tắt, hàng đợi, lần chạy gần nhất, lỗi và kết quả. Dùng **Bật lại tự học** nếu đã tắt; lựa chọn tắt và góp ý đang chờ được giữ qua lần mở ứng dụng. JSON lỗi hoặc gián đoạn không làm mất góp ý. **Thử học ngay** cần model nhẹ đã cấu hình.

Kiến thức và skill hiển thị nguồn hình thành, ngày cập nhật và trạng thái **Đề xuất → Đã duyệt → Đang dùng**. Xem/sửa đề xuất, chọn **Chấp nhận**, rồi **Dùng**; có thể **Loại bỏ / ngừng dùng**. Sửa nội dung cần duyệt lại. Skill đang dùng cần ngừng dùng trước khi sửa đề xuất; nếu trùng tên hoặc tệp đã được người dùng sửa, đổi tên để tạo bản mới. Biên tập nền tạo đề xuất skill, giữ nguyên skill hiện có. Nội dung thu thập được không tự trở thành chỉ thị đang dùng.

**Cài đặt → Biên tập nền → Làm ngay** chạy cùng cấu hình model và bộ xử lí biên tập theo lịch, kể cả khi lịch tắt; xem tiến độ, kết quả, lỗi, lần chạy gần nhất và lịch kế tiếp. Chỉ một lượt biên tập được chạy tại một thời điểm. Lượt thủ công không đổi mốc lịch định kì. Khi mở lại sau lịch bị lỡ, chọn **Chạy bù**, hoặc bật **Tự chạy bù khi mở PVTA**. Tắt lịch thì không tự chạy bù. Lịch nền thông thường cần máy bật, ứng dụng đóng và bộ lập lịch hệ điều hành được cài; chạy thủ công/chạy bù thực hiện trong ứng dụng.

### Tương thích và giới hạn kiểm chứng

PVTA Chat có thêm [chỉ thị biến, hàm, đầu vào/đầu ra, lặp và dừng](docs/workflow-language.md) trong prompt của **quy trình độc lập**. Engine gợi ý chỉ nhận bản nháp đang mở; popup chỉ áp dụng khi người dùng chọn. `!in` ghi nhật ký riêng, `!dau-ra` truyền giá trị có kiểu qua `!dau-vao tên = @truoc`. `{{input}}`/`{{prev}}` giữ nguyên. Hàm mới dùng biểu thức thuần đã duyệt. Đây không phải chỉ thị cho bộ chạy Plan hoặc add-in Office.

Quy trình độc lập cũ vẫn dùng bộ chạy riêng: thiếu trường chế độ thì chạy tuần tự; tùy chọn **Lỗi vẫn chạy tiếp** giữ hành vi cũ. Trong quy trình đa nhánh độc lập, bước phụ thuộc có thể bị bỏ qua tự động khi nhánh trước lỗi. Cơ chế Bị chặn và bổ sung đầu vào nêu trên dành cho **quy trình gắn Plan**, không thay thế hành vi quy trình độc lập. Plan cũ được bổ sung mô tả đầu vào/đầu ra và phụ thuộc tuần tự mặc định; cần xem lại các mô tả này trước khi duyệt.

**Chạy đồng thời nhiều quy trình độc lập.** Bộ chạy quản lí trạng thái theo mã quy trình: có thể chạy nhiều quy trình cùng lúc, mỗi quy trình một lượt; chạy trùng cùng một quy trình bị từ chối. Trong lúc một quy trình đang chạy, chỉ sửa, ghim, xóa hoặc chạy lại quy trình đó bị khóa. Nút **Dừng** chỉ hủy lượt của quy trình đang chọn (gồm việc viết lại prompt của quy trình đó nếu đang diễn ra). Khóa đọc/ghi chung giữa các quy trình vẫn còn: bước **Chỉnh sửa** của hai quy trình không chạy song song với nhau, còn bước chỉ đọc thì không bị khóa này. Khóa không bao gồm chat, người dùng hay ứng dụng ngoài. Quy trình gắn Plan dùng bộ chạy Plan, nên **Dừng** ở quy trình đó hủy lượt Plan của hội thoại chứa nó.

Giới hạn: mã đã đọc không đặt giới hạn số quy trình chạy cùng lúc. Kiểm thử giao diện (chuyển sang quy trình khác khi lượt trước chưa trả kết quả, lỗi của một quy trình không khóa quy trình khác, dừng chọn lọc, giữ thay đổi chưa lưu) dùng jsdom và RPC giả lập. Chưa mở ứng dụng, chưa thử với AI thật, chưa kiểm tra vòng đời RPC thật, bản xem trước prompt khi chờ duyệt và quy trình gắn Plan khi chạy đồng thời.

Kiểm thử tự động dùng AI mô phỏng kiểm tra hợp đồng dữ liệu, đồng bộ qua sự kiện và RPC, xung đột phiên bản, phụ thuộc khi bỏ qua, khôi phục từ dữ liệu lưu trên đĩa, lịch bị lỡ và chống chạy trùng. Tình huống giáo án thiếu đầu vào kiểm tra hỏi làm rõ và tạo bản nháp chưa duyệt sau câu trả lời. Đây không phải kiểm chứng chất lượng giáo án hoặc nguồn mạng bằng AI thật. Chưa thử thao tác hai cửa sổ Tauri trên macOS, mất điện thực tế hoặc bộ lập lịch hệ điều hành trong đợt kiểm tra này; không tạo bộ cài .app/.dmg.


Lệnh kiểm tra từ thư mục gốc (không tạo bộ cài):

```sh
npx vitest run core/test/plans.test.ts core/test/workflows.test.ts core/test/workflow-graph.test.ts core/test/refine.test.ts core/test/refine-runtime.test.ts core/test/feedback-learning.test.ts core/test/desktop.test.ts
npx vitest run --config chatbox/vitest.config.ts
npx tsc -p core --noEmit
npx tsc -p chatbox --noEmit
```

## Phạm vi tài nguyên trong nút quy trình

Trong ô Prompt của nút hoặc khâu mẫu, chọn **Phạm vi quy tắc, skill, prompt mẫu** trước khi dùng `@`, `/`, `#`: **Thư viện chung** dùng các hộp thoại lưu chung; **Chỉ nút này** và **Cả quy trình** lưu nội dung riêng cùng quy trình, không tạo mục trong thư viện. Có thể chọn tài nguyên đã có làm bản sao riêng hoặc bấm thêm mới. Mở mục tài nguyên để sửa nội dung, đổi giữa phạm vi nút/quy trình hoặc bỏ áp dụng; sau đó lưu quy trình. Tài nguyên toàn quy trình hiện ở các nút khác kèm tên nút nguồn để tìm nơi sửa. Xóa nút nguồn cũng xóa các tài nguyên do nút đó lưu.

Vùng **ĐẦU VÀO → Tệp đầu vào của nút** có bộ lọc tài liệu, ảnh và PDF; hỗ trợ chọn nhiều tệp, bỏ tệp và lưu cùng nút. Công cụ **File** trong thanh Markdown cũng chọn được ảnh/PDF. Nút gốc của quy trình liên kết Plan vẫn theo giới hạn đính kèm hiện có; giao diện thông báo và khóa chọn tệp riêng cho những nút này.

Kiểm thử tự động xác nhận lưu/nhập/xuất, phạm vi nội dung gửi tới model mô phỏng và cấu hình tệp qua giao diện jsdom. Chưa kiểm chứng với ứng dụng desktop và model thật.

## Chuẩn hóa skill, quy tắc, lời nhắc và quản lí nguồn

- `SKILL.md` ở gốc là hướng dẫn nội bộ `pvta-viet-skill`, đồng bộ vào `core/src/standardize/guide.ts`. Không cài vào thư viện người dùng, không hiện trong danh sách hoặc gọi bằng `/`. Đây là giới hạn hiển thị của ứng dụng, không phải cơ chế giữ bí mật mã được phân phối. `npm test` kiểm tra bản nhúng còn khớp nguồn trước khi chạy.
- Tự học theo nhóm, học từ phản hồi/tài liệu và biên tập nền dùng hướng dẫn chung. Skill nhập/dán được chuẩn hóa khi lưu, giữ chế độ `manual`; cập nhật giữ lựa chọn nạp đang có. Thiếu nguồn chỉ cảnh báo, không bịa nhãn nguồn. Skill quá dài bị từ chối, không cắt âm thầm. Biên tập nền vẫn giữ cấu trúc dữ liệu riêng và dùng kiểm tra nhẹ.
- Quy tắc gọi bằng `#`, quy tắc chung và chỉ dẫn dự án giữ nguyên nội dung khi lưu, kể cả cách viết, khoảng trắng và dòng trùng. Chỉ chuẩn hóa khi bấm nút, xem trước rồi chọn **Dùng bản này**. Add-in Office cũng có công cụ xem trước cho quy tắc và skill, dùng chung bộ xử lý với Chat. Giữ khóa gọi khi đổi tên; không gộp các câu khác dấu tiếng Việt hoặc khác dấu so sánh. Giới hạn quy tắc `#` và add-in là 2.000 ký tự; chỉ dẫn chung/dự án desktop giữ giới hạn 10.000 ký tự. Khi chủ động chuẩn hóa, chỉ xóa các dòng trùng hệt sau sửa hình thức; gộp ý bằng AI là tùy chọn xem trước.
- Thư viện lời nhắc Chat và Office dùng chung chuẩn hóa khi lưu, tối đa 4.000 ký tự. Add-in có nút chuẩn hóa với bản xem trước. Chat có thêm tùy chọn AI; kiểm tra không làm mất cả những placeholder trùng nhãn.
- Thanh chỗ trống phía trên ô chat hiện từng vị trí, màu vàng khi chưa điền và xanh kèm giá trị khi điền. Vị trí xóa rỗng hoặc không xác định được không tính là hoàn tất. Có thể chọn bằng chip/Tab. Khung soạn kéo giãn, dùng −/＋ hoặc phím mũi tên, nhớ chiều cao và tự giới hạn khi cửa sổ nhỏ.
- **Xem nguồn** có tìm kiếm không dấu, tìm trong nội dung, lọc nhanh Tài liệu/Hình ảnh/Tất cả (mặc định Tài liệu để icon không lấn danh sách), lọc nơi lưu, sắp xếp và xem trước bên phải. **Cập nhật tệp mới** đọc lại tệp đã sửa, thêm tệp mới, gỡ chỉ mục tệp đã xóa trong thư mục; tệp đính kèm riêng bị mất chỉ được báo thiếu. Không sửa tệp gốc, không tự cập nhật nguồn Học hỏi. Quét tối đa 300 tệp sâu 8 cấp; đạt giới hạn có thông báo. Ảnh được tải lại khi nội dung đổi.
- **Chỉ mục nguồn của Brain (tài liệu):** thêm thư mục thì PVTA gọi ngầm `tree -a -f -i` (dự phòng `find`, `dir /s /b`, hoặc duyệt bằng Node) để lập cây thư mục gồm cả tệp chưa đọc nội dung; bỏ tệp/thư mục ẩn, `node_modules`, `.git`; lưu ngoài thư mục của thầy cô (`source-index`). Thêm tệp thì quét nhanh và ghi dàn ý Markdown (đề mục, slide, sheet, đoạn đầu) vào `source-outlines`, không gọi AI, không hiện ra giao diện. Brain có thêm `brain_tree {in?,depth?}` và `brain_summary {file}`. Ô tìm của Xem nguồn mặc định tìm bằng AI (model mặc định trong hồ sơ) sau khi ngừng gõ khoảng 0,7 giây hoặc nhấn Enter, không còn nút riêng; lúc chờ vẫn hiện kết quả theo tên/nội dung, AI lỗi thì giữ kết quả đó. Tệp có trong cây mà AI chọn nhưng chưa đọc sẽ được đọc ngay. Nút ▤ nhóm danh sách theo thư mục; dòng trạng thái cho biết số tệp đã lập chỉ mục.

Kiểm tra tập trung: `npx vitest run core/test/standardize.test.ts core/test/standardize-integration.test.ts shared/test/promptTemplate.test.ts chatbox/test/source-filter.test.ts bridge/test/skillimport.test.ts bridge/test/chats.test.ts`. Kiểm thử chatbox đã được thêm vào `npm test` ở gốc.
