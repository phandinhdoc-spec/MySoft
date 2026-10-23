# PVTA Chatbox — Bản mô tả phần mềm

> Phiên bản tài liệu: 0.1 (bản nháp để chốt trước khi viết mã)
> Ngày soạn: 16/10/2026
> Tác giả yêu cầu: thầy Phan (THCS Phan Văn Trị, TP.HCM)

**Cách đọc tài liệu này.** Mỗi chức năng được gắn một trong ba nhãn:

- **[Có sẵn]**: đã có ở PVTA add-in (trong Word/Excel/PowerPoint), chatbox dùng lại hoặc chuyển sang.
- **[Mới]**: chức năng riêng của chatbox độc lập.
- **[Đề xuất]**: mình đề xuất, chưa phải quyết định, cần thầy xác nhận.

Những chỗ mình chưa xem mã nguồn nên chưa chắc chắn được ghi ở mục 22 (Câu hỏi còn mở).

---

## 1. Tổng quan

### 1.1 PVTA Chatbox là gì

Ứng dụng chat AI chạy độc lập trên máy tính (không cần mở Word, Excel hay PowerPoint), mang đầy đủ chức năng của tiện ích PVTA đang chạy trong bộ Office. Giáo viên có thể trò chuyện với AI, lập kế hoạch, xử lý file Word/Excel/PowerPoint, quản lý dự án và dùng kỹ năng (skills) ngay trong một cửa sổ riêng.

### 1.2 Tên gọi

- Tên hiển thị duy nhất: **PVTA** (chữ nghiêng ở tiêu đề, biểu tượng hình tròn có chữ PVTA).
- Không còn dùng tên PDD ở bất kỳ đâu: giao diện, README, trình cài đặt, tên file, biến môi trường (`PVTA_*`).
- Thư mục dữ liệu người dùng giữ nguyên `~/.phananh-office` để không làm mất dữ liệu cũ.

### 1.3 Đối tượng sử dụng

- Giáo viên THCS, phần lớn không rành kỹ thuật, dùng Windows hoặc macOS; một số dùng Linux.
- Người phát triển và người dùng đầu tiên: thầy Phan.

### 1.4 Nguyên tắc thiết kế (xếp theo độ ưu tiên)

1. **Nhanh nhất**: mở nhanh, phản hồi giao diện ngay, không chặn người dùng khi AI đang xử lý.
2. **Cài một lệnh**: giáo viên không phải làm các bước kỹ thuật.
3. **Chạy bằng gói thuê bao CLI (agy, claude, codex)** ở chế độ không giao diện (headless); API chỉ là phương án dự phòng.
4. **Nhẹ**: dung lượng và RAM thấp.
5. **Một nguồn mã dùng chung** với add-in để sửa một nơi là cả hai bản cùng được cập nhật.
6. **Tiếng Việt là ngôn ngữ chính** của giao diện và câu trả lời.
7. **Không làm thay khi chưa được phép**: mọi thao tác ghi, mở, chuyển file đều hỏi người dùng.

### 1.5 Ngoài phạm vi (không làm)

- Không sao chép các tính năng chỉ có trong phần mềm hermes-agent.
- Không dựng sẵn máy chủ trung gian (relay server) cho tính năng phản hồi/cập nhật trong giai đoạn đầu; thầy sẽ tự làm sau.
- Không có chế độ iPad cho chatbox (iPad chỉ dành cho add-in, đã phát hành ở v1.0.22).

---

## 2. Quan hệ giữa Chatbox và Add-in

| Hạng mục | Add-in (trong Office) | Chatbox (độc lập) |
|---|---|---|
| Nơi chạy | Khung bên phải Word/Excel/PowerPoint | Cửa sổ riêng |
| Đọc nội dung file đang mở | Trực tiếp qua Office.js | Không trực tiếp; đọc từ file đã lưu, hoặc qua cầu nối với add-in |
| Sửa file đang mở, thấy thay đổi tức thì | Có | Không, trừ khi qua cầu nối |
| Sửa file trên đĩa (`.docx`, `.xlsx`, `.pptx`) | Hạn chế | Có |
| Chat, Plan, dự án, skills, chế độ viết, RAG, cập nhật, phản hồi | Có | Có |
| Điều khiển nhiều file Office | Có (xin phép) | Có (xin phép) |

### 2.1 Cầu nối Chatbox ↔ Add-in [Đề xuất]

- Khi add-in đang chạy trong Office, chatbox có thể kết nối với nó qua `localhost` (cổng cố định, chỉ nhận kết nối từ chính máy này).
- Nhờ cầu nối, chatbox đọc và sửa được tài liệu đang mở bằng Office.js do add-in thực hiện.
- Nếu add-in không chạy, chatbox vẫn hoạt động bình thường với file trên đĩa.
- Cầu nối chỉ bật khi người dùng cho phép; có công tắc trong Cài đặt.

---

## 3. Kiến trúc kỹ thuật

### 3.1 Công nghệ

- **Khung ứng dụng**: Tauri (Rust + webview của hệ điều hành). Lý do: nhẹ (khoảng 10–15 MB), ít RAM, đáp ứng yêu cầu "nhanh nhất".
- **Giao diện**: TypeScript + HTML/CSS, dùng lại khung chat của add-in.
- **Lõi dùng chung (`core/`)**: TypeScript. Chạy bằng Node đóng gói kèm (sidecar) ở giai đoạn đầu; chỉ chuyển sang Rust những chỗ đo được là chậm.
- **Việc nặng**: gọi Python khi cần (chế độ kế toán, xử lý `.docx`/`.xlsx`/`.pptx`, lập chỉ mục RAG).
- **Hệ điều hành hỗ trợ**: macOS, Windows, Linux.

### 3.2 Cấu trúc thư mục mã nguồn [Đề xuất]

```
office/
├─ core/                  Lõi dùng chung
│  ├─ backends/           codex, claude, agy, api, command-code
│  ├─ modes/              chế độ viết, plan, kế toán, làm đẹp
│  ├─ skills/             nhập và quản lý SKILL.md
│  ├─ projects/           dự án, tóm tắt chat cũ
│  ├─ rag/                lập chỉ mục và truy xuất
│  ├─ learning/           tự học
│  ├─ hints/              gợi ý thông minh
│  ├─ update/             cập nhật và phản hồi
│  └─ storage/            đọc ghi JSON/Markdown
├─ addin/                 PVTA trong Office (đang có)
├─ chatbox/               Ứng dụng Tauri (mới)
│  ├─ src/                Giao diện TypeScript
│  └─ src-tauri/          Phần Rust, cấu hình, đóng gói
├─ installers/            Lệnh cài một dòng cho Windows và macOS/Linux
└─ README.md
```

### 3.3 Luồng xử lý một yêu cầu

1. Người dùng gõ tin nhắn trong giao diện.
2. Giao diện gửi sang lõi qua kênh IPC của Tauri.
3. Lõi chọn backend theo cài đặt (codex, claude, agy hoặc API) và gọi ở chế độ headless.
4. Kết quả được gửi về giao diện từng phần (streaming) để chữ hiện ra dần.
5. Giao diện không bị khóa trong lúc chờ; người dùng vẫn gõ, đổi tab, dừng yêu cầu được.

### 3.4 Quy tắc hiệu năng

- Cửa sổ chính hiện ra trước khi lõi khởi động xong (tải lõi chạy nền).
- Các tác vụ phụ (gợi ý thông minh, tóm tắt dự án, lập chỉ mục) chạy song song, không chặn tác vụ chính.
- Danh sách model và trạng thái đăng nhập của CLI được lưu đệm (cache) và làm mới nền.
- Không quét ổ đĩa liên tục.

---

## 4. Hệ điều hành và đóng gói

### 4.1 macOS

- Đóng gói `.dmg` (có thể thêm `.app` nén).
- Cài một dòng bằng Terminal.
- Cần xử lý ký số (signing) để tránh cảnh báo; nếu chưa có chứng chỉ, hướng dẫn mở lần đầu bằng chuột phải → Open.

### 4.2 Windows

- Đóng gói `.exe` hoặc `.msi`.
- Cài một dòng bằng PowerShell.
- Có trình hướng dẫn cài đặt (wizard) lần đầu, mô tả ở mục 17.

### 4.3 Linux

- Đóng gói `.AppImage` và `.deb`.
- Gói khai báo phụ thuộc WebKitGTK để người dùng không phải tự cài.
- Ưu tiên kiểm thử trên các bản phổ biến (Ubuntu, Debian, Fedora, Arch/CachyOS).

### 4.4 Yêu cầu chung

- Cùng một giao diện và hành vi trên cả ba hệ điều hành.
- Đường dẫn file xử lý bằng thư viện chuẩn, không viết cứng dấu `/` hay `\`.
- Dữ liệu người dùng lưu ở `~/.phananh-office` (Windows: thư mục người dùng tương ứng).

---

## 5. Backend AI

### 5.1 Các backend hỗ trợ

| Backend | Cách chạy | Ghi chú |
|---|---|---|
| **agy** | CLI thuê bao, headless | Giáo viên Việt Nam dự kiến dùng nhiều nhất; gợi ý gói Gemini Pro |
| **claude** | CLI thuê bao, headless | |
| **codex** | CLI thuê bao, headless | PVTA bắt buộc hỗ trợ codex |
| **API** | Gọi trực tiếp qua khóa API | Phương án dự phòng |
| **Command Code** | Chỉ qua Provider API chính thức | Không dùng OAuth/alpha như Hermes; khi chọn thì tự điền sẵn base URL và danh sách model |

### 5.2 Phát hiện backend khi khởi động

- Kiểm tra máy có `codex`, `claude`, `agy` chưa (và đã đăng nhập chưa).
- Nếu có ít nhất một: dùng bình thường.
- Nếu không có cái nào trong ba CLI: hiện gợi ý cài đặt hoặc cho chọn dùng API.
- Chỉ báo lỗi khi **không có backend nào** dùng được.
- Kết quả phát hiện được lưu đệm, làm mới nền.

### 5.3 Chọn model

- Danh sách model **nhóm theo backend** (agy, claude, codex, API…).
- Thay đổi backend thì danh sách model đổi theo.
- Bộ chọn model là cửa sổ riêng, **chỉ chứa việc chọn backend/model/mức suy nghĩ**; chế độ viết và nút ✨ tối ưu prompt được tách ra ngoài.

### 5.4 Mức suy nghĩ (thinking level)

- Bộ chọn mức suy nghĩ phải **đúng với những gì từng backend/model thật sự hỗ trợ**.
- Model nào không có mức suy nghĩ thì ẩn bộ chọn hoặc hiển thị mờ.
- Danh sách mức thay đổi theo model được chọn.

### 5.5 Cài đặt API

- **Điền nhanh (quick-fill)**: dán một lệnh hoặc đoạn mã chứa khóa API, đường dẫn (base URL) và model; ứng dụng tự tách và điền vào các ô.
- **Hiện đầy đủ danh sách model** của nhà cung cấp để chọn, người dùng không phải nhớ tên model.
- Khóa API được lưu cục bộ, không gửi đi đâu ngoài nhà cung cấp đã chọn; không in khóa ra màn hình hay nhật ký.

### 5.6 Command Code

- Chỉ qua Provider API chính thức.
- Khi người dùng chọn Command Code: tự điền base URL và danh sách model.

---

## 6. Giao diện

### 6.1 Bố cục tổng thể [Đề xuất]

```
┌───────────────────────────────────────────────────────────┐
│ PVTA  | tên dự án/file đang gắn  ● (chấm nhảy khi bận)    │  ← thanh trên
├────────────┬──────────────────────────────────────────────┤
│ Thanh bên  │                                              │
│ - Chat     │              Khung hội thoại                 │
│ - Dự án    │                                              │
│ - Skills   │                                              │
│ - Tiện ích │                                              │
├────────────┴──────────────────────────────────────────────┤
│ [📎] [Chế độ viết ▾] [✨] [Chat | Plan]  Ô nhập…  [Gửi]    │
└───────────────────────────────────────────────────────────┘
```

### 6.2 Tiêu đề và biểu tượng

- Tiêu đề **PVTA** viết chữ nghiêng, phông chữ đẹp.
- Bấm vào chữ PVTA ở tiêu đề thì **quay về cuộc chat thường** (ngoài dự án).
- Biểu tượng ứng dụng là **hình tròn có chữ PVTA** bằng phông chữ đẹp; chữ PVTA ở tiêu đề cùng kiểu.

### 6.3 Chỉ báo "đang bận"

- Chấm nhảy (bouncing dots) chỉ hiện **ở thanh trên, cạnh tên dự án/file đang gắn** (vị trí tương ứng chữ "Word" bên add-in).
- **Không** hiển thị chấm nhảy bên dưới khung chat.

### 6.4 Nút tiện ích

- Các nút tiện ích **hiển thị rõ ràng**, không giấu trong menu (lý do: bản trước nhìn "buồn" so với hermes-office).
- Có tooltip tiếng Việt ngắn gọn.
- Nút có biểu tượng thống nhất, kích thước đủ lớn để bấm.

### 6.5 Giao diện sáng/tối và cỡ chữ [Đề xuất]

- Có chế độ sáng và tối, mặc định theo hệ điều hành.
- Có thể chỉnh cỡ chữ khung hội thoại.

### 6.6 Phím tắt [Đề xuất]

- Gửi tin: Enter; xuống dòng: Shift+Enter.
- Chuyển Chat ↔ Plan: phím tắt riêng.
- Dừng yêu cầu đang chạy: Esc.

---

## 7. Chế độ Chat và chế độ Plan

### 7.1 Chat [Có sẵn]

- Hỏi đáp bình thường, trả lời dần từng đoạn (streaming).
- Hiển thị Markdown, bảng, khối mã, công thức.

### 7.2 Plan [Mới]

Mục đích: AI **chỉ lập kế hoạch**, người dùng duyệt rồi mới thực hiện.

**Luồng:**

1. Người dùng chuyển công tắc sang **Plan** và nhập yêu cầu.
2. AI chỉ được **đọc**, không được ghi file hay chạy lệnh làm thay đổi dữ liệu.
3. AI trả về kế hoạch gồm các bước đánh số. Mỗi bước có: mục tiêu, việc cần làm, file bị ảnh hưởng, rủi ro (nếu có).
4. Người dùng **sửa, xóa, thêm, đổi thứ tự** bước; có thể yêu cầu AI chỉnh kế hoạch bằng chat.
5. Người dùng bấm **Duyệt và chạy** (có thể chạy cả kế hoạch hoặc từng bước).
6. Khi chạy, mỗi bước hiển thị trạng thái: chờ / đang chạy / xong / lỗi.
7. Người dùng có thể **dừng giữa chừng**; bước đang chạy dở được báo rõ.
8. Kế hoạch được lưu thành file Markdown (trong dự án hoặc thư mục dữ liệu) để xem lại.

**Quy tắc an toàn:**

- Không ghi, xóa, di chuyển file trước khi kế hoạch được duyệt.
- Với bước ghi đè file gốc: mặc định tạo bản sao hoặc cho hoàn tác (undo).
- Các hành động nguy hiểm (xóa, ghi đè hàng loạt) luôn hỏi lại.

---

## 8. Chế độ viết

### 8.1 Danh sách chế độ [Có sẵn]

- Học thuật, sáng tạo, kế toán (mục 14), và các chế độ khác.
- Mỗi chế độ là một bộ chỉ dẫn (prompt) cùng thiết lập giọng văn, cấu trúc, mức chi tiết.

### 8.2 Người dùng tự sửa và thêm chế độ [Có sẵn]

- Mở trình soạn chế độ: sửa tên, mô tả, nội dung chỉ dẫn.
- Thêm chế độ mới, nhân bản chế độ có sẵn, xóa chế độ do mình tạo.
- Chế độ lưu bằng file Markdown/JSON để dễ sao lưu và chia sẻ.
- Có nút "khôi phục mặc định" cho chế độ hệ thống.

### 8.3 Nơi đặt nút

- Chọn chế độ viết là một nút riêng ở khu vực nhập tin, **không nằm trong cửa sổ chọn model**.

### 8.4 Nút ✨ Tối ưu prompt [Có sẵn]

- Là nút riêng, **không nằm trong cửa sổ chọn model**.
- Bấm nút thì AI viết lại câu lệnh của người dùng cho rõ và đầy đủ hơn; người dùng xem bản đề xuất rồi chọn dùng, sửa hoặc bỏ.

---

## 9. Tự học (self-learning)

### 9.1 Mục tiêu [Có sẵn]

AI rút kinh nghiệm từ cách người dùng phản hồi để lần sau làm đúng ý hơn.

### 9.2 Hoạt động **chủ động**

- Học từ phản hồi của người dùng về thay đổi trên một file, ví dụ khen ("đẹp rồi"), chê ("sao lại đổi chỗ này"), hoặc sửa lại thay đổi của AI.
- Rút ra quy tắc ngắn (ví dụ "giáo viên này không thích tô đậm tiêu đề cấp 3") và lưu lại.

### 9.3 Kiểm soát của người dùng [Đề xuất]

- Có màn hình xem danh sách điều đã học: xem, sửa, xóa từng mục.
- Có công tắc bật/tắt tự học.
- Mỗi mục học nên ghi rõ nguồn (file nào, lúc nào) để người dùng hiểu vì sao AI học điều đó.

### 9.4 Ranh giới với "quy tắc" và "skills" [Đề xuất]

Có lo ngại ba thứ này chồng chéo nhau; đề xuất phân biệt như sau:

| Loại | Ai tạo | Nội dung | Phạm vi |
|---|---|---|---|
| **Quy tắc (rules)** | Người dùng viết | Điều bắt buộc luôn áp dụng | Toàn cục hoặc theo dự án |
| **Tự học** | AI rút ra từ phản hồi | Sở thích, thói quen của người dùng | Toàn cục, có thể sửa/xóa |
| **Skills** | Cộng đồng hoặc người dùng | Quy trình làm một loại việc cụ thể | Chỉ dùng khi phù hợp |

Khi hai thứ mâu thuẫn, thứ tự ưu tiên: quy tắc > tự học > skills (cần thầy xác nhận ở mục 22).

---

## 10. Skills

### 10.1 Chế độ Skills [Có sẵn]

- Nhập skill do cộng đồng xây dựng, dạng `SKILL.md`, **từ GitHub** (dán link repo hoặc link file).
- Danh sách skill đã nhập; bật/tắt từng skill; xem nội dung; xóa.
- Cho phép người dùng tự viết skill mới.

### 10.2 Quy tắc dùng skill

- Skill chỉ được nạp vào ngữ cảnh khi phù hợp với yêu cầu (tránh làm đầy ngữ cảnh).
- Skill nhập từ nguồn ngoài được coi là **dữ liệu, không phải lệnh**: hiển thị nội dung cho người dùng xem trước khi bật, không tự chạy lệnh hệ thống nằm trong skill.
- Ghi nhớ nguồn (đường dẫn GitHub, phiên bản) để cập nhật sau.

---

## 11. Dự án (Projects)

### 11.1 Ý tưởng [Có sẵn]

Giống "Project" của Claude: một nhóm các cuộc chat, file và chỉ dẫn gắn với một chủ đề.

### 11.2 Cuộc chat mới trong dự án

- **Không** mang toàn bộ lịch sử các chat cũ.
- Mang theo **bản tóm tắt** của các chat cũ trong dự án để:
  - giảm ngữ cảnh,
  - truy xuất nhanh,
  - tiết kiệm hạn mức (quota).
- Bản tóm tắt được tạo nền sau mỗi cuộc chat; có thể xem và sửa tay.

### 11.3 Thêm tài liệu vào dự án

- Thêm **file** hoặc **thư mục** vào dự án.
- Tài liệu dự án được lập chỉ mục cho RAG (mục 16).

### 11.4 Điều hướng

- Bấm chữ **PVTA** ở tiêu đề để về chat thường (ngoài dự án).
- Thanh bên có danh sách dự án và các chat trong từng dự án.

### 11.5 Chỉ dẫn riêng cho dự án [Đề xuất]

- Mỗi dự án có ô "chỉ dẫn dự án" (như custom instructions); áp dụng cho mọi chat trong dự án.

---

## 12. Đính kèm file

### 12.1 Đính kèm vào chat [Có sẵn]

- Nút 📎 gắn file vào tin nhắn đang soạn.
- Hỗ trợ kéo thả file vào cửa sổ.
- Định dạng ưu tiên: `.docx`, `.xlsx`, `.pptx`, `.pdf`, `.md`, `.txt`, `.csv`, hình ảnh.

### 12.2 Thêm vào dự án

- "Thêm file" và "Thêm thư mục" vào dự án (khác với đính kèm một lần vào chat).

### 12.3 Xử lý an toàn

- File gốc **không bị sửa tại chỗ**; thao tác trên bản sao, trừ khi người dùng cho phép ghi đè.
- Báo rõ file nào đã được đọc, file nào đã được ghi.

---

## 13. Điều khiển nhiều file Office

### 13.1 Chức năng [Có sẵn]

- Chuyển qua lại giữa nhiều file Office, **cả file đã mở lẫn file chưa mở**.
- Không dùng thẻ (tab) kiểu WPS; thay vào đó AI/ứng dụng điều khiển khi cần.

### 13.2 Quyền

- **Bắt buộc có sự cho phép của người dùng** trước khi mở file hoặc chuyển sang file khác.
- Quyền hỏi theo từng hành động; có thể cho phép tạm thời trong phiên.

### 13.3 Ở chatbox

- Với file chưa mở: đọc/sửa trên đĩa.
- Với file đang mở: đọc/sửa qua cầu nối với add-in (mục 2.1) nếu bật.

---

## 14. Chế độ kế toán

### 14.1 Mục tiêu [Có sẵn]

Gần với chế độ học thuật nhưng chuyên cho số liệu: **kiểm tra phép tính và giữ số liệu chính xác, khớp nhau giữa Excel, Word và PowerPoint**.

### 14.2 Nguyên tắc cốt lõi

- **Không tin phép tính của mô hình.** Mọi phép tính đều tính bằng **Python**.
- Làm tròn theo quy tắc nhất quán; hiển thị đúng định dạng số kiểu Việt Nam (dấu chấm ngăn cách nghìn, dấu phẩy thập phân) nếu người dùng chọn.

### 14.3 Quy trình [Đề xuất]

1. Trích số liệu từ file nguồn (thường là Excel).
2. Tính lại bằng Python, so sánh với số đang có trong file.
3. Quét Word/PowerPoint liên quan để tìm chỗ số liệu **không khớp** với nguồn.
4. Lập danh sách chênh lệch: vị trí, số cũ, số đúng.
5. Chỉ sửa sau khi người dùng đồng ý.

### 14.4 Lưu ý

- Cần Python trên máy; trình cài đặt có tùy chọn cài Python (mục 17).
- Nếu máy chưa có Python, chế độ kế toán báo rõ cách cài thay vì tự tính bằng mô hình.

---

## 15. Làm đẹp (✨)

### 15.1 Chức năng [Có sẵn]

- Chế độ làm đẹp cho Word, Excel, PowerPoint.

### 15.2 Cách làm hiện tại (đã quyết định)

- **Bỏ toàn bộ mẫu dựng sẵn** (các kiểu LaTeX/Typst/cổ điển, bộ mẫu theo loại tài liệu, các công cụ bố cục cố định).
- Thay vào đó: **dựng một prompt chuyên nghiệp duy nhất** để mô hình (Gemini, Sonnet…) tự làm đẹp theo nội dung.

### 15.3 Excel

- Có chế độ làm đẹp cho Excel.
- **Không làm "phẳng" cấu trúc gốc**: giữ ô gộp (merged cells), tiêu đề hai tầng và các cấu trúc tương tự.

### 15.4 Xem trước và hoàn tác

- **Xem trước trước khi áp dụng**, hoặc "thử rồi hoàn tác" (try-then-undo) để người dùng không bị mất bản gốc khi kết quả xấu.

### 15.5 Vấn đề đã nhận ra nhưng chưa chốt

- Thầy nhận xét làm đẹp ở Word/Excel/PowerPoint **cùng chung một cách nghĩ còn thiếu sót**; chỗ thiếu sót cụ thể chưa được nêu. Cần chốt trước khi thiết kế lại (mục 22).

---

## 16. RAG từ file đang mở / dự án

### 16.1 Tầm quan trọng

Thầy đánh giá đây là **tính năng rất quan trọng**.

### 16.2 Chức năng [Có sẵn trong add-in, mở rộng cho chatbox]

- Xây chỉ mục từ nội dung **file đang mở** (add-in) hoặc **file được chọn/tài liệu trong dự án** (chatbox).
- Khi hỏi, hệ thống truy xuất các đoạn liên quan rồi mới đưa vào prompt (không nhồi cả file).
- Trích dẫn nguồn: nêu rõ đoạn nào, trang/ô/slide nào.

### 16.3 Quy tắc [Đề xuất]

- Lập chỉ mục chạy nền, không chặn giao diện.
- Chỉ lập chỉ mục lại phần file đã thay đổi.
- Chỉ mục lưu cục bộ trong thư mục dữ liệu.
- Người dùng xóa được chỉ mục của từng file/dự án.

---

## 17. Cài đặt, trình hướng dẫn và cập nhật

### 17.1 Cài một lệnh

- Một dòng lệnh duy nhất cho Windows (PowerShell) và một dòng cho macOS/Linux (Terminal).
- Giáo viên không phải làm thêm bước kỹ thuật nào.

### 17.2 Menu tùy chọn lúc cài lần đầu

Trình cài hỏi người dùng muốn cài thêm thành phần nào, dạng menu đánh số, ví dụ:

```
1. Python (cần cho chế độ kế toán, xử lý file)
2. agy
3. ...
0. Bỏ qua
```

- Máy các giáo viên khác có thể chưa có Python nên phải có lựa chọn này.

### 17.3 Trình hướng dẫn (wizard) lần đầu trên Windows [Có sẵn]

1. Phát hiện công cụ AI nào đã được cài.
2. Cho giáo viên chọn một: **codex, claude, agy hoặc API**.
3. Tự cài đặt công cụ đã chọn.
4. Hiện bước đăng nhập.
5. Với giáo viên ở Việt Nam, mặc định gợi ý **agy** (kèm gợi ý gói Gemini Pro).

### 17.4 Cập nhật [Có sẵn]

- Chức năng cập nhật ở Cài đặt, chạy **lệnh cài đặt theo hệ điều hành** lấy từ GitHub (Windows khác macOS).
- Hiển thị phiên bản hiện tại và phiên bản mới.
- Cập nhật không xóa dữ liệu người dùng.

### 17.5 Phản hồi / chia sẻ tri thức [Có sẵn]

- Ở Cài đặt có nút gửi **những skills và tri thức PVTA đã học từ người dùng** lên GitHub (dạng Markdown/JSON, nhẹ).
- Bản cập nhật sau sẽ gom tri thức của mọi người.
- Máy chủ trung gian (relay) sẽ do thầy tự xây sau; trong giai đoạn đầu chỉ cài và dùng từ bản sao (clone) của thầy.
- **Quyền riêng tư [Đề xuất]**: trước khi gửi, hiển thị rõ nội dung sắp gửi; tự động loại bỏ khóa API, tên học sinh và thông tin cá nhân; người dùng phải đồng ý từng lần gửi.

### 17.6 Kho mã và nhánh

- Kho chính: `phandinhdoc-spec/office`, nhánh `main`.
- Kho `phandinhdoc-spec/phananh-office` là **kho sao lưu/bản ổn định**.
- Bản mang tên PVTA chỉ đẩy lên nhánh `main` của kho `office`.

---

## 18. Gợi ý thông minh (smart hints)

### 18.1 Chức năng [Có sẵn]

Chạy nền để dự đoán: **chế độ viết**, **skills**, **dự án** phù hợp với file đang mở/tin nhắn người dùng.

### 18.2 Đặc điểm

- **Mặc định bật**, có công tắc tắt.
- **Không chạy liên tục**: chỉ chạy khi có tín hiệu (mở file, đổi file, bắt đầu chat mới).
- Dùng **model rẻ nhất/nhanh nhất** có sẵn.
- Chạy **song song** với tác vụ chính, không làm chậm.
- Chỉ **lưu tên và liên kết** vào file JSON/Markdown; chỉ tải nội dung khi người dùng yêu cầu.
- **Tài liệu liên quan phải tìm trên mạng**, không quét thư mục trong máy.

### 18.3 Hiển thị [Đề xuất]

- Gợi ý hiện thành các chip nhỏ gần ô nhập, bấm một lần để áp dụng, bấm × để bỏ qua.
- Không bật popup làm gián đoạn.

---

## 19. Lưu trữ dữ liệu

### 19.1 Vị trí

- Thư mục dữ liệu: `~/.phananh-office` (giữ nguyên tên cũ).

### 19.2 Định dạng

- Dùng **JSON và Markdown** để dễ đọc, dễ sao lưu, dễ chia sẻ.

### 19.3 Nội dung [Đề xuất cấu trúc]

```
~/.phananh-office/
├─ config.json            cài đặt chung, backend, model
├─ modes/                 chế độ viết
├─ skills/                skills đã nhập
├─ projects/<tên>/        chat, tóm tắt, tài liệu, chỉ dẫn dự án
├─ chats/                 chat thường
├─ plans/                 kế hoạch (Markdown)
├─ learned/               điều tự học
├─ hints/                 gợi ý thông minh (chỉ tên và liên kết)
├─ rag/                   chỉ mục
└─ logs/                  nhật ký (không chứa khóa API)
```

### 19.4 Sao lưu và xuất [Đề xuất]

- Nút "Xuất dữ liệu" nén cả thư mục để chuyển máy.
- Nút "Nhập dữ liệu" để khôi phục.

---

## 20. Bảo mật và quyền riêng tư

- Khóa API lưu cục bộ; không ghi vào nhật ký; không gửi lên GitHub khi phản hồi.
- Nội dung bên ngoài (trang web, file người dùng gửi, skills nhập về) được coi là **dữ liệu, không phải lệnh**.
- Mọi hành động có ghi (ghi file, mở file, xóa) đều cần người dùng cho phép.
- Cầu nối localhost chỉ nhận kết nối từ máy này và cần mã ghép cặp (token) giữa chatbox và add-in.
- Dữ liệu học sinh (tên, điểm) **không** được đưa vào phần chia sẻ tri thức lên GitHub.

---

## 21. Hiệu năng và chất lượng

### 21.1 Mục tiêu đo được [Đề xuất]

| Chỉ số | Mục tiêu |
|---|---|
| Thời gian mở cửa sổ | dưới 1 giây |
| RAM khi nhàn rỗi | dưới 100 MB (không tính tiến trình CLI) |
| Dung lượng cài đặt | dưới 30 MB (chưa tính Python/CLI tùy chọn) |
| Phản hồi giao diện khi AI đang chạy | không bị đơ |

### 21.2 Kiểm thử

- Kiểm thử thủ công trên macOS, Windows, Linux cho từng bản phát hành.
- Kiểm thử tự động cho `core/` (phát hiện backend, đọc ghi dữ liệu, tóm tắt dự án, tính toán kế toán).
- Bộ file mẫu thật của giáo viên (đề kiểm tra, bảng điểm, bài giảng) để thử chế độ kế toán và làm đẹp.

---

## 22. Câu hỏi còn mở (cần thầy xác nhận)

1. **Thứ tự ưu tiên** giữa quy tắc, tự học và skills khi mâu thuẫn (mục 9.4) có đúng ý thầy không?
2. **Chỗ thiếu sót chung** trong cách nghĩ của chế độ làm đẹp Word/Excel/PowerPoint là gì (mục 15.5)?
3. **Cầu nối với add-in** (mục 2.1) có làm ngay ở giai đoạn đầu không, hay để sau?
4. **Lõi bằng Node (sidecar)** ở giai đoạn đầu, chuyển sang Rust sau: thầy đồng ý không?
5. **Linux**: ưu tiên bản nào (Ubuntu, Arch/CachyOS…) để kiểm thử trước?
6. **Ký số macOS/Windows**: thầy có chứng chỉ chưa, hay hướng dẫn người dùng mở lần đầu bằng cách thủ công?
7. **Chế độ kế toán**: định dạng số mặc định kiểu Việt Nam hay theo cài đặt của file?
8. **Phản hồi lên GitHub**: danh sách thông tin tự động loại bỏ (tên học sinh, khóa API…) cần thêm gì?
9. Các mục mình chưa kiểm tra với mã nguồn hiện tại sẽ được đối chiếu khi có quyền truy cập repo `office`.

---

## 23. Lộ trình đề xuất

### Giai đoạn 1 — Khung chạy được
- Khung Tauri, giao diện chat, bố cục tiêu đề/thanh bên.
- Tách `core/` từ add-in.
- Backend codex, claude, agy; phát hiện CLI; chọn model theo nhóm; mức suy nghĩ đúng theo model.
- Chế độ **Plan** cơ bản.
- Cài đặt API với điền nhanh.
- Đóng gói cho macOS, Windows, Linux.

### Giai đoạn 2 — Tổ chức công việc
- Dự án và tóm tắt chat cũ.
- Đính kèm file; thêm file/thư mục vào dự án.
- Chế độ viết (sửa/thêm được) và nút ✨.
- Skills nhập từ GitHub.

### Giai đoạn 3 — Thông minh
- RAG cho file/dự án.
- Tự học chủ động + màn hình quản lý điều đã học.
- Gợi ý thông minh nền.

### Giai đoạn 4 — Xử lý tài liệu
- Chế độ kế toán (Python).
- Làm đẹp (một prompt chuyên nghiệp, xem trước/hoàn tác, Excel giữ cấu trúc).
- Điều khiển nhiều file Office có xin phép.
- Cầu nối với add-in (nếu chọn làm).

### Giai đoạn 5 — Phân phối
- Trình cài một dòng, menu tùy chọn, wizard Windows.
- Cập nhật từ GitHub, phản hồi tri thức.
- Xuất/nhập dữ liệu; kiểm thử chéo ba hệ điều hành.

---

## 24. Tiêu chí hoàn thành bản 1.0

- [ ] Cài bằng **một lệnh** trên Windows và macOS (Linux có AppImage/.deb).
- [ ] Chạy được với ít nhất một backend CLI (agy, claude hoặc codex) và có phương án API.
- [ ] Chat, Plan, dự án, skills, chế độ viết, ✨, tự học, gợi ý, RAG hoạt động.
- [ ] Chế độ kế toán tính bằng Python, báo được chênh lệch số liệu giữa Excel/Word/PowerPoint.
- [ ] Làm đẹp có xem trước hoặc hoàn tác; Excel giữ nguyên ô gộp và tiêu đề hai tầng.
- [ ] Mọi thao tác ghi file đều hỏi người dùng.
- [ ] Không còn chữ PDD ở bất kỳ đâu.
- [ ] Đạt các chỉ số hiệu năng ở mục 21.1.
