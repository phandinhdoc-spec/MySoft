---
name: pvta-viet-skill
description: Viết, sửa hoặc rà soát skill PVTA (kỹ năng, SKILL.md): đặt tên, mô tả, chế độ nạp, quy định có nguồn, chạy thử. Dùng khi thầy cô nhờ tạo skill mới hoặc sửa skill chạy chưa tốt.
load: demand
---
# Viết skill cho PVTA

Mục tiêu: skill ngắn, đúng khuôn PVTA, được chọn đúng lúc và đã thử bằng việc thật.

## Khi nào dùng
- Tạo skill mới, hoặc biến một việc lặp lại (soạn đề, nhận xét học bạ, báo cáo) thành skill.
- Sửa skill chạy chưa tốt: không được chọn, làm sai bước, kết quả lệch khuôn.
- Rà soát skill người khác viết hoặc skill nhập từ cộng đồng.

## Khi nào không dùng
- Một quy tắc ngắn cho mọi việc: thêm vào Quy tắc chung trong Cài đặt.
- Chỉ đổi giọng văn: dùng Chế độ viết. Một câu lệnh hay gõ lại: lưu vào Thư viện lời nhắc.

## Quy định
- Chỉ viết điều model chưa biết; đoạn nào không xứng số chữ nó chiếm thì bỏ. (Nguồn: Hướng dẫn viết skill)
- Độ chặt theo độ mong manh: nhiều cách đúng thì chỉ nêu hướng và tiêu chí; có khuôn ưa dùng thì đưa khuôn có chỗ điền; dễ hỏng, cần đúng trình tự thì ghi bước cố định kèm câu "không thêm bớt". (Nguồn: Hướng dẫn viết skill)
- Mô tả một dòng, ngôi thứ ba, nêu làm gì và khi nào dùng, dưới 220 ký tự vì giao diện dán skill cắt phần sau. (Nguồn: Hướng dẫn viết skill; skillimport.ts)
- Mô tả chứa từ đặc trưng của việc mà thầy cô hay gõ (từ 3 chữ cái trở lên), tránh dồn từ chung không gắn với việc như "tài liệu", "giúp", "cho": PVTA Chat chọn skill bằng cách so từ trong tên và mô tả với câu hỏi, từ chung làm skill bị chọn nhầm. (Nguồn: runtime.ts)
- Tên chữ thường không dấu, số, gạch nối, tối đa 40 ký tự; không chứa "claude", "anthropic"; tránh tên mơ hồ như helper, tools. (Nguồn: Hướng dẫn viết skill; GroupsPanel.tsx)
- Tiền tố pvta- cho skill đi kèm tiện ích Office, office- cho skill đi kèm PVTA Chat; skill tự viết không dùng pvta-, learned-, cd- vì khi dán sẽ bị đổi thành ext-. (Nguồn: skillimport.ts)
- Luôn ghi dòng load: demand cho hầu hết skill; always chỉ cho quy tắc rất ngắn cần ở mọi lượt; manual khi chỉ nạp lúc gõ /tên. Skill dán tay bắt đầu ở manual và mất dòng groups. (Nguồn: skills.ts; skillimport.ts)
- Thân skill dưới 20.000 ký tự, tự chứa trong một tệp: PVTA Chat và nút Thử chỉ dùng 20.000 ký tự đầu, model không đọc được tệp đi kèm. (Nguồn: runtime.ts; learn.ts)
- Ghi đúng tên công cụ của nơi chạy: tiện ích Office dùng office_word_*, office_excel_*, office_ppt_*, office_calc; PVTA Chat dùng pvta-read, pvta-calc và đề xuất pvta-action (create_office, patch_office, edit_excel, create_typst). (Nguồn: catalog.ts; runtime.ts)
- Không viết đường dẫn web, lệnh hệ thống, mã Python, khóa bí mật, hay câu bảo model phớt lờ các quy tắc trước đó: bộ lọc an toàn sẽ từ chối. (Nguồn: skills.ts)
- Skill đứng sau quy tắc của thầy cô và sở thích đã học: viết như quy trình, không ra lệnh trái ý người dùng. (Nguồn: runtime.ts)
- Nhiều cách làm thì đưa một cách mặc định và một lối thoát cho trường hợp đặc biệt. (Nguồn: Hướng dẫn viết skill)
- Con số quy định (cỡ chữ, lề, thang điểm) phải có nguồn; quy định hay đổi thì ghi tên văn bản, không ghi mốc kiểu "trước tháng 8". Một khái niệm một thuật ngữ. (Nguồn: Hướng dẫn viết skill)
- Việc dễ hỏng (sửa hàng loạt, số liệu) phải có bước trung gian kiểm được: liệt kê thay đổi để thầy cô duyệt, tính lại bằng công cụ tính, xem trang bằng công cụ xem trước. (Nguồn: Hướng dẫn viết skill)

## Quy trình
1. **Thu thập.** Hỏi việc gì, đầu vào, đầu ra mong muốn, chỗ hay sai; xin 1–3 mẫu tốt. Làm thử khi chưa có skill, ghi lại chỗ model sai: skill chỉ lấp đúng những chỗ ấy. Một skill lo một loại việc.
2. **Chọn đường lưu.** Đóng góp bộ cài: thư mục skills/ hoặc desktop-skills/. Thầy cô tự viết: dán trong mục Kỹ năng rồi chọn chế độ nạp. Tự học theo nhóm: cửa sổ Nhóm, nhập tên và mục tiêu để PVTA tạo bản nháp.
3. **Phần đầu**, ví dụ:
   ```
   ---
   name: soan-de-khtn
   description: Soạn đề kiểm tra KHTN theo ma trận GDPT 2018, kiểm tổng điểm 10. Dùng khi thầy cô nhắc ma trận, đặc tả, đề giữa kì, cuối kì.
   load: demand
   ---
   ```
4. **Thân theo khuôn 7 mục**, mỗi mục một đề mục cấp hai, đúng thứ tự: Khi nào dùng; Khi nào không dùng; Quy định (mỗi dòng kết thúc bằng "(Nguồn: nhãn)", không có nguồn thì không viết); Quy trình (bước đánh số); Danh sách kiểm tra (mỗi dòng "- [ ] ...", kiểm được bằng mắt hoặc bằng máy, vì bộ chấm khi Thử dùng chính danh sách này); Tài liệu tham chiếu; Kiểm tra bàn giao.
   - Kết quả cần đúng khuôn: ghi "LUÔN dùng đúng khuôn sau" rồi đưa khuôn.
   - Việc cần đúng giọng (nhận xét, lời phê): thêm 1–2 cặp "Đầu vào → Đầu ra" ngắn.
   - Việc có nhánh (soạn mới hay sửa tài liệu đang mở): ghi điểm rẽ và bước của từng nhánh.
5. **Rà** theo Danh sách kiểm tra; sai chỗ nào sửa chỗ đó rồi rà lại.
6. **Thử và sửa.** Skill tự học: bấm Thử, đạt khi từ 7/10 và không kém bản không có skill, rồi Duyệt. Skill viết tay: chạy ít nhất 3 tình huống thật, có một ca thiếu dữ liệu, trên cả model nhỏ và lớn. Không được chọn thì thêm từ khóa vào mô tả; bỏ sót quy định thì đưa lên trước; phần không dùng tới thì cắt. Chỉ sửa chỗ đã thấy sai.

## Danh sách kiểm tra
- [ ] Tên hợp lệ, đúng tiền tố, khớp tên thư mục.
- [ ] Mô tả một dòng, có làm gì, khi nào dùng và từ khóa, dưới 220 ký tự.
- [ ] Có dòng load phù hợp.
- [ ] Đủ 7 mục đúng thứ tự; mỗi dòng Quy định có (Nguồn: ...).
- [ ] Mỗi dòng Danh sách kiểm tra kiểm được bằng mắt hoặc bằng máy.
- [ ] Thân dưới 20.000 ký tự.
- [ ] Tên công cụ đúng nơi chạy; không có đường dẫn web, lệnh hệ thống, mã, khóa bí mật.
- [ ] Thuật ngữ nhất quán; không mốc thời gian dễ lỗi thời.
- [ ] Đã thử ít nhất 3 tình huống thật.

## Tài liệu tham chiếu
- Hướng dẫn viết skill: "Skill authoring best practices" của Anthropic.
- Mã PVTA: skills.ts, skillimport.ts, learn.ts, runtime.ts, catalog.ts, GroupsPanel.tsx.

## Kiểm tra bàn giao
- Chỉ đọc mô tả, có biết khi nào dùng không.
- Báo ngắn: tên skill, nơi lưu, skill làm gì, kết quả thử, chỗ chưa thử. Không chép lại cả skill.
