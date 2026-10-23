# Làm việc với PVTA

Đọc [brain.md](brain.md) khi tìm, đọc hoặc sửa mã nguồn. Brain tra cứu nhiều ngôn ngữ; chỉ lệnh patch hiện giới hạn C. Thiếu hướng dẫn cho một loại giao diện không chặn việc sửa: đối chiếu component, stylesheet và test hiện có.

## Định vị mã

Nếu phiên có codebase-memory MCP, ưu tiên graph trước tìm file: xác nhận project/generation bằng list_projects hoặc index_status; dùng search_graph, trace_path, get_code_snippet. Sau khi có đường dẫn, dùng check_index_coverage; đọc nguồn trực tiếp với các file/range thiếu, cũ hoặc chưa được index. Graph sạch không chứng minh đầy đủ. Mặc định dùng Tier 2, phân trang kết quả liên quan trước kết luận toàn diện.

Nếu không có MCP, dùng Brain theo brain.md. Truy vấn chỉ mục thay vì đọc tuần tự vài dòng đầu. Dùng tìm kiếm nội dung cho chữ giao diện, CSS selector, config, hoặc khi chỉ mục không đủ. Không yêu cầu người dùng tìm hộ các file mà công cụ có thể tìm.

Giao diện desktop ở `chatbox/src`; backend ở `core/src`; mã dùng chung ở `shared/src`. Tìm ký hiệu WorkflowGraph để bắt đầu điều tra sơ đồ quy trình. Xác nhận đường dẫn và nội dung hiện tại trước khi sửa.

## Sửa và kiểm chứng

Giữ nguyên thay đổi đang dở của người dùng. Chỉ sửa phần liên quan đến yêu cầu. Với TS/TSX/CSS, dùng patch theo ngữ cảnh được cấp trong phiên; không dùng Brain patch C hoặc patch_office.

Đọc package.json của workspace liên quan để chọn lệnh typecheck, test và build. Báo đúng thay đổi thực tế, kiểm tra đã chạy và giới hạn chưa kiểm chứng.

Tôn trọng quyền phiên. Brain đọc mã không cấp quyền sửa hoặc chạy shell. Nếu thiếu quyền, nêu thao tác cần bật và khả năng backend còn thiếu; không lấy việc thiếu tài liệu làm lý do dừng.
