# PVTA — Kế hoạch Nâng cấp & Cải tiến Toàn diện (Update-1)
> **Mã tài liệu:** `UPDATE-01-SPEC`  
> **Áp dụng cho repository:** [phandinhdoc-spec/MySoft](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fphandinhdoc-spec%2FMySoft)  
> **Nhánh mục tiêu:** `main`  
> **Trọng tâm:** Tối ưu hóa UI/UX sư phạm, hợp nhất kiến trúc kỹ năng, và hoàn thiện chu trình kiểm tra - đánh giá theo chuẩn GDPT 2018.

---

## 1. Bối cảnh & Mục tiêu

Phần mềm **PVTA** là trợ lý AI chuyên biệt dành cho giáo viên phổ thông (THCS, THPT) tại Việt Nam, tích hợp mô hình "2 trong 1" gồm Microsoft Office Add-in (`addin/`) và ứng dụng Desktop độc lập (`chatbox/`). 

Qua rà soát thực tế mã nguồn, hệ thống sở hữu nền tảng vững chắc về kết nối đa mô hình và bảo mật cục bộ, nhưng đang gặp phải 3 điểm nghẽn chính:
1. **Quá tải nhận thức trên giao diện:** Nhiều panel kỹ thuật (Terminal, GitHub, logs) hiển thị đồng cấp với công cụ sư phạm.
2. **Phân mảnh mã nguồn kỹ năng:** Thư mục `skills/` và `desktop-skills/` bị tách rời, gây trùng lặp định nghĩa quy trình và khó bảo trì.
3. **Thiếu tính năng khép kín theo chuẩn giáo dục mới:** Chưa có pipeline đối soát tự động giữa Ma trận – Đặc tả – Đề thi – Đáp án theo định dạng đề năm 2025 của Bộ GD&ĐT.

Bản kế hoạch **Update-1** này định hình lộ trình nâng cấp chi tiết cả về trải nghiệm người dùng, nghiệp vụ chuyên môn và kiến trúc kỹ thuật.

---

## 2. Rà soát Hiện trạng & Định hướng Giải pháp

| Phân hệ | Thành phần mã nguồn liên quan | Vấn đề tồn tại | Giải pháp Update-1 |
| :--- | :--- | :--- | :--- |
| **Desktop UI (`chatbox/`)** | `TerminalPanel.tsx`, `GitHubPanel.tsx`, `BackendSetup.tsx` | Các bảng điều khiển kỹ thuật phức tạp gây rối cho giáo viên. | Bổ sung chế độ **Teacher Simple Mode** (chỉ hiển thị tác vụ giảng dạy), ẩn công cụ lập trình vào mục Nâng cao. |
| **Add-in Taskpane (`addin/`)** | `App.tsx`, `HintBar.tsx`, `ModelPicker.tsx`, `SkillsPanel.tsx` | Taskpane Word/Excel hẹp (320–380px) bị phân mảnh bởi nhiều thanh công cụ dọc. | Gộp thư viện mẫu và kỹ năng thành **Command Palette (`/`)** duy nhất; chuyển cấu hình model xuống thanh trạng thái đáy. |
| **Duyệt bài & Hoàn tác** | `SlotBar.tsx`, `StandardizePreview.tsx`, `snapshot.ts`, `restore.ts` | Hoàn tác toàn khối tài liệu, chưa cho phép so sánh chi tiết câu chữ được sửa. | Bổ sung giao diện **Inline Diff View** tô màu xanh/đỏ trực quan và cho phép chấp nhận/từ chối từng đoạn sửa đổi. |
| **Quy trình Plan Mode** | `PlanCard.tsx`, `WorkflowWindow.tsx`, `PlanRecovery.tsx` | Hiển thị log kỹ thuật khi gặp lỗi, thiếu tính trực quan với người dùng phổ thông. | Chuyển thành biểu đồ tiến trình dạng bước (*Step Progress Flow*) với các nút xử lý sự cố bằng ngôn ngữ tự nhiên. |
| **Hệ thống Kỹ năng (`skills/`)** | `skills/pvta-*` và `desktop-skills/office-*` | Trùng lặp mã và tài liệu tham chiếu giữa hai môi trường Add-in và Desktop. | Hợp nhất thành thư mục dùng chung **`shared/skills/`** chuẩn hóa cấu trúc `SKILL.md` và `references/`. |
| **Xử lý tài liệu & RAG** | `ragsource.ts`, `ProjectLearning.tsx`, `PdfWorkspace.tsx` | Giới hạn quét thư mục (60 file, sâu 8 cấp) và chỉ trích xuất văn bản thuần, dễ gãy bảng/công thức. | Nâng cấp bộ phân tích cấu trúc bảng (Table-aware parser) và trích xuất OCR giữ nguyên ký hiệu Toán/Hóa. |

---

## 3. Chi tiết Nâng cấp Giao diện & Trải nghiệm (UI/UX)

### 3.1. Chế độ Giáo viên tối giản (Teacher Simple Mode) trên PVTA Chat
* **Mục tiêu:** Giảm tối đa các yếu tố gây phân tâm, giúp giáo viên tập trung vào việc soạn bài và xử lý số liệu.
* **Thay đổi chi tiết (`chatbox/src/`):**
  * Thêm công tắc chuyển đổi: `Teacher Mode` (Mặc định) vs `Developer Mode` trong `AppearancePicker.tsx`.
  * Khi ở `Teacher Mode`: Ẩn hoàn toàn `TerminalPanel.tsx`, `GitHubPanel.tsx`, và các trường cấu hình nhiệt độ (temperature), top-p trong `BackendSetup.tsx`.
  * Cấu hình backend AI được đơn giản hóa: Chọn nhà cung cấp (OpenAI, Claude, Gemini, Ollama) và dán API Key, hệ thống tự động kiểm tra và chọn model tối ưu nhất.

### 3.2. Tái cấu trúc Taskpane Office Add-in (`addin/src/App.tsx`)
* **Thiết kế lại bố cục không gian hẹp:**
  * Thu gọn `ModelPicker.tsx` thành một biểu tượng chip nhỏ ở thanh trạng thái (Footer) kèm thông báo pin/quota kết nối.
  * Tích hợp `PromptLibrary.tsx`, `SkillsPanel.tsx` và `TeacherSuitePanel.tsx` thành một cửa sổ tìm kiếm lệnh thông minh mở nhanh khi nhấn phím `/` hoặc nút **"Tác vụ nhanh"**.
  * Khu vực làm việc chính được phân tách rõ ràng thành 2 tab: **Trò chuyện** và **Tài liệu đang xử lý**.

### 3.3. Xem trước thay đổi trực tiếp (Inline Diff & Selective Accept)
* **File liên quan:** `addin/src/office/word.ts`, `addin/src/StandardizePreview.tsx`, `restore.ts`.
* **Cơ chế hoạt động:**
  * Trước khi ghi đè nội dung do AI sinh vào văn bản Word, hiển thị màn hình so sánh dạng Split View hoặc Inline Diff:
    * Chữ màu xanh lá (`+`): Nội dung bổ sung mới.
    * Chữ màu đỏ gạch ngang (`-`): Nội dung bị lược bỏ hoặc sửa đổi.
  * Giáo viên có thể bấm nút **"Chấp nhận tất cả"**, **"Chấp nhận đoạn này"**, hoặc **"Hủy bỏ"** để giữ lại nguyên bản tài liệu.

### 3.4. Trực quan hóa tiến trình Plan Mode
* **File liên quan:** `chatbox/src/PlanCard.tsx`, `WorkflowWindow.tsx`, `PlanRecovery.tsx`.
* **Cơ chế hoạt động:**
  * Hiển thị luồng công việc dưới dạng các khối tròn liên kết theo chiều ngang/dọc:  
    `[Khảo sát bối cảnh] ➔ [Xác định thông tin thiếu] ➔ [Sinh dự thảo] ➔ [Kiểm tra đối soát] ➔ [Hoàn tất]`.
  * Khi một bước phát sinh sự cố (lỗi quota, dữ liệu không đủ), node tương ứng chuyển màu cam kèm thông báo gợi ý rõ ràng: *"Cần thêm đề cương chương 3 để tiếp tục"* thay vì hiển thị mã lỗi `HTTP 429` hay `JSON parse error`.

---

## 4. Chi tiết Nâng cấp Chức năng Chuyên môn Giáo dục

### 4.1. Chu trình khép kín: Ma trận – Đặc tả – Đề thi – Đáp án (Chuẩn 2025)
* **File liên quan:** `skills/office-giao-an/`, `skills/office-dap-an/`, `shared/src/teacherSuite.ts`.
* **Tính năng mới:**
  * Hỗ trợ cấu trúc đề thi tốt nghiệp THPT và kiểm tra định kỳ mới nhất của Bộ GD&ĐT gồm 3 phần:
    1. Trắc nghiệm nhiều lựa chọn (4 phương án chọn 1).
    2. Trắc nghiệm Đúng/Sai (mỗi câu gồm 4 ý a, b, c, d).
    3. Trắc nghiệm trả lời ngắn (điền kết quả số/từ khóa).
  * Tự động kiểm tra chéo ma trận: Đếm số lượng câu hỏi và tỷ lệ điểm thực tế so với bảng đặc tả (ví dụ: Nhận biết 40%, Thông hiểu 30%, Vận dụng 30%), đưa ra cảnh báo nếu đề bị lệch ma trận.
  * Tự động tách và định dạng phiếu trả lời trắc nghiệm chuẩn kèm lời giải chi tiết.

### 4.2. Nâng cấp Xưởng Toán & KHTN (`MathWorkshop.tsx`, `equation.ts`)
* **Tính năng mới:**
  * Bổ sung thư viện mẫu dựng **Bảng biến thiên, Bảng xét dấu** cho môn Toán cấp THPT.
  * Tích hợp công cụ sinh hình vẽ hình học (hình học phẳng, hình không gian lăng trụ/chóp, đồ thị hàm số) xuất trực tiếp ra ảnh SVG chất lượng cao để chèn thẳng vào Word mà không bị vỡ hạt.
  * Chuẩn hóa phương trình Hóa học: Tự động cân bằng phản ứng, hiển thị điều kiện nhiệt độ/xúc tác và mũi tên kết tủa ($\downarrow$), bay hơi ($\uparrow$) đúng chuẩn hiển thị Word Equation.

### 4.3. Tự động hóa đánh giá học sinh trên Excel (`excel.ts`, `sheetbeautify.ts`)
* **Tính năng mới:**
  * Hỗ trợ đọc toàn bộ bảng điểm lớp học và nhận xét tự động theo quy định của Thông tư 22/2021/TT-BGDĐT và Thông tư 58/2011/TT-BGDĐT.
  * Thuật toán phân tích tiến bộ: So sánh điểm đánh giá thường xuyên với giữa kỳ và cuối kỳ để đưa ra nhận xét cá nhân hóa, khắc phục hiện tượng trùng lặp nhận xét giữa các học sinh có cùng điểm trung bình.

### 4.4. Kiểm tra thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP
* **File liên quan:** `skills/office-hanh-chinh/`, `addin/src/StandardizePreview.tsx`.
* **Tính năng mới:**
  * Quét nhanh văn bản Word đang mở và kiểm tra các tiêu chí:
    * Cỡ chữ và font chuẩn (Times New Roman 13–14pt cho phần thân, 12–13pt cho tiêu ngữ).
    * Canh lề trang (Trên 20–25mm, Dưới 20–25mm, Trái 30–35mm, Phải 15–20mm).
    * Định dạng bảng ký tên, số hiệu văn bản, địa danh và ngày tháng.
  * Cung cấp nút bấm **"Chuẩn hóa 1 chạm"** tự động áp dụng toàn bộ quy chuẩn vào tài liệu.

### 4.5. Chuyển đổi 1 chạm từ Kế hoạch bài dạy Word sang Slide PowerPoint
* **File liên quan:** `addin/src/office/word.ts`, `addin/src/office/powerpoint.ts`, `shared/src/filestore.ts`.
* **Tính năng mới:**
  * Tự động bóc tách 4 hoạt động sư phạm theo Công văn 5512 trong file Word:
    1. Hoạt động Khởi động (Mục tiêu, nội dung, sản phẩm, chuyển giao).
    2. Hoạt động Hình thành kiến thức.
    3. Hoạt động Luyện tập.
    4. Hoạt động Vận dụng.
  * Xuất trực tiếp sang file trình chiếu PowerPoint với bố cục thẻ (Bento layout), kích thước 16:9 và màu sắc tương thích bộ môn.

---

## 5. Tái cấu trúc Hệ thống & Mã nguồn (Architecture)

### 5.1. Hợp nhất hệ thống Kỹ năng (`Unified Skills Architecture`)
* **Cấu trúc thư mục mới đề xuất:**
```text
shared/
├── src/
│   ├── skills/
│   │   ├── giao-an-5512/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── de-thi-2025/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── xu-ly-diem-excel/
│   │   ├── slide-bai-giang-pptx/
│   │   └── hanh-chinh-nd30/
```
* **Lợi ích:** Xóa bỏ hoàn toàn tình trạng trùng lặp giữa `skills/` và `desktop-skills/`, giúp việc cập nhật quy chế giáo dục mới chỉ cần thực hiện tại một nơi duy nhất.

### 5.2. Nâng cấp bộ nạp dữ liệu RAG (`ragsource.ts`)
* Tăng giới hạn quét từ 60 tệp lên 200 tệp trong một dự án.
* Áp dụng thuật toán chunking theo đoạn văn và tiêu đề mục (Markdown/Word heading-aware) thay vì cắt vụn văn bản theo số lượng ký tự cố định.
* Tích hợp bộ nhớ đệm SQLite/IndexedDB cục bộ để tăng tốc độ tìm kiếm tài liệu cũ cho chức năng *Học hỏi trong dự án* (`ProjectLearning.tsx`).

---

## 6. Lộ trình Triển khai (Roadmap)

```text
+-------------------------------------------------------------------------------+
| Giai đoạn 1 (Tuần 1 - 2): Dọn dẹp UI & Hợp nhất Skills                         |
| - Tích hợp Teacher Simple Mode trên Desktop (`chatbox/`)                      |
| - Hợp nhất `skills/` và `desktop-skills/` vào `shared/skills/`                |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Giai đoạn 2 (Tuần 3 - 4): Nâng cấp Add-in & Cơ chế Duyệt bài                   |
| - Tái cấu trúc Taskpane Office Add-in (Command Palette)                       |
| - Hoàn thiện tính năng Inline Diff View & Selective Accept                    |
| - Trực quan hóa biểu đồ bước trong Plan Mode                                  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Giai đoạn 3 (Tuần 5 - 6): Chuyên sâu Nghiệp vụ Giáo dục                        |
| - Bộ công cụ tạo đề thi theo định dạng 2025 và kiểm tra chéo ma trận          |
| - Bảng biến thiên, hình vẽ hình học trong Xưởng Toán                          |
| - Chuẩn hóa thể thức hành chính theo Nghị định 30/2020                        |
| - Luồng chuyển đổi Word (CV 5512) -> PowerPoint Slide                         |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| Giai đoạn 4 (Tuần 7): Kiểm thử, Đóng gói & Phát hành                           |
| - Kiểm thử tích hợp trên Word, Excel, PowerPoint (Windows & macOS)            |
| - Đóng gói bộ cài đặt mới qua `installers/`                                   |
| - Cập nhật tài liệu hướng dẫn sử dụng trong `docs/`                           |
+-------------------------------------------------------------------------------+
```

---

## 7. Hướng dẫn Đưa vào Nhánh `main` của Kho lưu trữ

Do môi trường thực thi hiện tại hoạt động ở chế độ bảo mật không lưu thông tin đăng nhập tài khoản cá nhân vào GitHub, bạn có thể đưa tài liệu `update-1.md` này vào nhánh `main` của [phandinhdoc-spec/MySoft](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fphandinhdoc-spec%2FMySoft) theo một trong hai cách đơn giản sau:

### Cách 1: Thêm trực tiếp trên giao diện Web GitHub
1. Truy cập vào kho lưu trữ: [phandinhdoc-spec/MySoft](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fphandinhdoc-spec%2FMySoft).
2. Đảm bảo bạn đang ở nhánh `main`.
3. Bấm vào nút **Add file** (ở góc phải danh sách tệp) ➔ Chọn **Create new file**.
4. Nhập tên tệp: `update-1.md`.
5. Dán toàn bộ nội dung từ bản đặc tả này vào ô soạn thảo.
6. Kéo xuống phần **Commit changes**, nhập thông điệp commit:  
   `feat(spec): add update-1.md - UI/UX and functional upgrade specification`  
7. Chọn **Commit directly to the main branch** và bấm nút **Commit changes**.

### Cách 2: Commit qua dòng lệnh Git trên máy cá nhân
Nếu bạn đã clone kho lưu trữ về máy tính của mình, mở Terminal tại thư mục dự án và chạy:

```bash
# Đảm bảo đang ở nhánh main và cập nhật mới nhất
git checkout main
git pull origin main

# Tạo hoặc lưu tệp update-1.md vào thư mục gốc của dự án
# (Dán nội dung tài liệu này vào file update-1.md)

# Thêm file vào staging và tạo commit
git add update-1.md
git commit -m "feat(spec): add update-1.md - UI/UX and functional upgrade specification"

# Đẩy lên nhánh main trên GitHub
git push origin main
```
