# Hợp đồng công cụ GitHub — phiên bản 1

Trạng thái: danh mục và kiểu dữ liệu đã có trong mã; các RPC mới chưa được đăng ký
trong runtime, panel hiện tại vẫn dùng RPC `github` trả chuỗi. Tài liệu này là đầu
vào cho bước triển khai thực thi và giao diện, không phải báo cáo tính năng đã chạy.

## Nguồn dữ liệu chung

`core/src/desktop/github-ops.ts` xuất `catalog()`: 50 thao tác thuộc 8 nhóm.
Mỗi thao tác có mã ổn định, tên và hướng dẫn tiếng Việt, ô nhập, điều kiện,
mức nguy hiểm, xác nhận và mô tả kết quả. Dữ liệu là JSON, mỗi lần gọi nhận bản sao.
`github-model.ts` định nghĩa kiểu, lời giải thích điều kiện và kiểm tra hình dạng
biểu mẫu. Không coi kiểm tra này là kiểm tra an toàn lệnh Git.

`GithubField.source` chỉ định dữ liệu chọn động; backend cung cấp các lựa chọn qua
`GithubStatus.choices`, nhưng vẫn phải xác minh lại giá trị được gửi lên.
Giá trị mặc định là gợi ý cho giao diện, không tự điền ngầm khi xác nhận.
Điều kiện thiếu hoặc chưa xác minh đều khóa thao tác, kèm lời giải thích.
Quyền kho phải được kiểm tra theo kho người dùng nhập, không theo origin mặc định.
Trạng thái chênh lệch nhánh có thể cũ; `observedAt` là thời điểm quan sát trên máy,
không có nghĩa vừa truy vấn GitHub.

## RPC và vòng đời

Kiểu `GithubRpcMethods` ánh xạ tên RPC sang đầu vào/kết quả; `GithubRpcRequest`
giữ mối liên hệ giữa tên phương thức và tham số. Phản hồi dùng
`GithubRpcReply<T>` để phân biệt thành công với lỗi có mã, thông báo và hướng sửa.
RPC cũ không thay đổi ngữ nghĩa: `commit` cũ chỉ lưu vùng đã chọn. Thao tác
`commit` trong danh mục mới chọn tất cả thay đổi rồi lưu, và phải hiện rõ trong
xem trước. Chỉ chuyển panel sang RPC mới khi backend đã sẵn sàng.

| RPC mới | Đầu vào | Kết quả |
|---|---|---|
| githubCatalog | phiên bản hợp đồng | nhóm và thao tác |
| githubStatus | dự án, thư mục tùy chọn | công cụ, tài khoản, trạng thái kho, lựa chọn và điều kiện |
| githubPreview | phiên bản, đích, mã thao tác, ô nhập | mã xem trước, hạn dùng, bước, cảnh báo, chữ xác nhận |
| githubRun | phiên bản, mã xem trước, chữ xác nhận, mã yêu cầu | mã lần chạy |
| githubCancel | mã lần chạy | đã tiếp nhận yêu cầu hủy hay chưa |
| githubLogin | mã yêu cầu, mục đích login/deleteScope | mã lần chạy đăng nhập |
| githubCancelLogin | mã lần chạy đăng nhập | đã tiếp nhận yêu cầu hủy hay chưa |

Backend giữ bản xem trước: tham số đã kiểm tra, tài khoản, đường dẫn thực, trạng thái
kho và mục tiêu GitHub. Trước khi chạy phải kiểm tra hạn dùng, quyền, nhánh, HEAD,
thay đổi trong kho, mục tiêu và chữ xác nhận nguyên văn. Có thay đổi liên quan thì
trả `stalePreview`, yêu cầu xem trước lại. Không nhận lệnh do client gửi về.
`requestId` chống chạy trùng khi gửi lại; cùng mã với nội dung khác phải bị từ chối.
Khóa theo đường dẫn thực của kho hoặc tài khoản/kho từ xa cho thao tác không có
thư mục. Hủy chỉ tác động tiến trình thuộc lần chạy đó.

Sự kiện `github` có `runId`, số thứ tự tăng dần và thời điểm:
tiến trình từng bước, nhật ký đã che bí mật, trạng thái đăng nhập hoặc kết quả cuối.
Mỗi lần chạy có đúng một kết quả cuối. Sự kiện đăng nhập không được lưu mã dùng
một lần vào lịch sử lâu dài. Giao diện bỏ sự kiện trùng/cũ theo runId và sequence.
`githubRun` cần trả runId trước khi phát sự kiện để không mất kết quả nhanh.

Kết quả có danh sách bước đã hoàn thành, đầu ra dạng bảng/lịch sử/khác biệt/tệp,
trạng thái success/partial/error/cancelled và tình trạng phục hồi. `effects` ghi
none/applied/unknown; lỗi mạng hoặc hủy không chứng minh thao tác từ xa chưa xảy ra.
Không tự chạy lại bước tạo/xóa/gửi lời mời khi chưa đối chiếu kết quả trên GitHub.
Danh sách bị giới hạn phải đặt `truncated`, không giả là toàn bộ.

## Quy tắc thực thi cần giữ

- Backend chỉ sinh lời gọi `execFile` từ danh mục cho phép, không qua shell.
  Kiểm tra tên kho, tài khoản, ref bằng quy tắc Git; chặn đối số bị hiểu là cờ;
  kiểm tra tệp thuộc kho bằng đường dẫn thực, không để đường dẫn hoặc symlink thoát
  phạm vi. Dùng dấu phân cách đối số khi lệnh hỗ trợ. Không cho người dùng nhập lệnh.
- Môi trường thường: `GIT_TERMINAL_PROMPT=0`, `GH_PROMPT_DISABLED=1`,
  `LC_MESSAGES=C`. Luồng đăng nhập cần đọc tiến trình lâu dài và kiểm tra thực tế
  hành vi trên từng nền tảng; không suy rằng việc mở trình duyệt nghĩa là đăng nhập xong.
- Khởi tạo chỉ khi thư mục chưa thuộc kho. Tạo kho từ thư mục yêu cầu kho đã có
  phiên bản: giao diện hướng dẫn lần lượt khởi tạo → đặt người lưu → lưu → tạo kho.
  Kho công khai mới cũng yêu cầu chữ `CÔNG KHAI`.
- `clean` gồm index, worktree và tệp mới; `noOperation` loại cả merge, rebase,
  cherry-pick, revert đang dở. Không bỏ qua điều kiện chỉ vì lệnh Git có thể chạy.
- Pull chỉ tiến thẳng. Sync tải thông tin, gộp upstream rồi push thường, không ép.
  Chỉ abort lần gộp do chính công cụ khởi tạo khi trạng thái ban đầu sạch và không
  có thay đổi ngoài luồng; không đảm bảo phục hồi được trong mọi tình huống.
  Nếu không xác minh được, trả manualRequired và giữ bằng chứng/trạng thái.
- Hoàn tác lần lưu giữ nội dung, chỉ áp dụng với HEAD một cha và đã xác minh chưa
  công bố. Nếu không đủ thông tin remote thì khóa. Revert phiên bản gộp bị từ chối
  cho tới khi có thiết kế chọn cha. Xóa nhánh dùng chế độ không ép, không xóa nhánh
  đang được dùng trong worktree khác.
- Bỏ thay đổi chỉ áp dụng tệp được theo dõi; không chạy clean để xóa tệp mới.
  Phải hiện rõ phạm vi và các tệp còn giữ. Stash lấy lại bị xung đột phải giữ bản cất.
- ZIP, tải tài sản phát hành, clone và .gitignore không ghi đè đầu ra đã có.
  Tên tài sản tải về phải nằm trong thư mục đích. Không tự ghi đè cấu hình toàn máy,
  ngoại trừ thao tác tin cậy đã xác nhận đúng một thư mục.
- Mọi thông báo/nhật ký/lỗi/xem trước phải che bí mật, URL có thông tin đăng nhập.
  PVTA không giữ token; gh quản lý thông tin đăng nhập. Không đọc token chỉ để hiển thị.
- Các xác nhận bắt buộc lấy từ danh mục, backend kiểm tra lại nguyên văn; client
  không được tự chuyển thao tác nguy hiểm thành thao tác thường.

## Tài liệu CLI đã đối chiếu ngày 20/10/2026

| Hành vi | Quyết định hợp đồng và nguồn |
|---|---|
| Đăng nhập | `gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key`; gh có thể lưu token vào tệp nếu kho thông tin xác thực không dùng được. Trạng thái auth có trường nguồn lưu, không hứa luôn dùng keyring. [gh auth login](https://cli.github.com/manual/gh_auth_login) |
| Git dùng đăng nhập gh | Sau khi xác nhận đăng nhập thành công, gọi setup-git cho riêng github.com; lỗi bước này không xóa trạng thái đã đăng nhập. [gh auth setup-git](https://cli.github.com/manual/gh_auth_setup-git) |
| Quyền xóa kho | Xin `delete_repo` riêng bằng auth refresh, không tự xin trong lần đăng nhập đầu; xóa luôn chỉ rõ chủ/tên-kho sau khi xác nhận. [gh repo delete](https://cli.github.com/manual/gh_repo_delete), [gh auth refresh](https://cli.github.com/manual/gh_auth_refresh) |
| Đăng xuất | Xóa cấu hình đăng nhập tại máy, không thu hồi token trên máy chủ; chỉ rõ tài khoản và hostname. [gh auth logout](https://cli.github.com/manual/gh_auth_logout) |
| Hủy gộp | Git cảnh báo abort có thể không khôi phục đầy đủ thay đổi chưa lưu. Hợp đồng không hứa “luôn tự hủy an toàn”. [git merge](https://git-scm.com/docs/git-merge) |
| Phát hành | Dùng nháp và verify-tag để tránh tự tạo nhãn ngoài ý muốn. [gh release create](https://cli.github.com/manual/gh_release_create) |
| Gộp đề nghị | Giữ SHA đã xem trước, kiểm tra bằng match-head-commit; không dùng admin để vượt bảo vệ. Kết quả phải phân biệt đang xếp hàng với đã gộp. [gh pr merge](https://cli.github.com/manual/gh_pr_merge) |

Đây là đối chiếu hợp đồng cho các hành vi nhạy cảm, chưa phải xác minh toàn bộ
đối số của 50 bộ dựng lệnh. Bước thực thi phải đối chiếu help/tài liệu của từng
lệnh khi xây dựng, thêm kiểm thử lệnh giả và Git thật trong thư mục tạm.
Chưa thử đăng nhập trình duyệt hay thao tác với GitHub thật.

## Bộ thực thi và RPC (bước hoàn thiện hoạt động)

`GithubTool` trong `core/src/desktop/github-tool.ts` được xuất qua `github.ts`;
`DesktopRuntime` đăng ký các RPC đã khai báo, trả `{ok,value}` hoặc `{ok:false,error}`.
RPC cũ `github` vẫn phục vụ panel hiện tại và dùng chung khóa kho với bộ thực thi mới.
Panel mới cần chuyển sang các RPC có kiểu để sử dụng xem trước, xác nhận và sự kiện.

- Backend tạo và giữ bản xem trước trong bộ nhớ, hết hạn sau 5 phút. Khi chạy,
  kiểm tra lại tham số, quyền trên kho GitHub, điều kiện kho và dấu vân tay nội dung.
  Mỗi bản xem trước chỉ chạy một lần; gửi lại cùng requestId trả cùng runId.
  Bản xem trước và mã chống lặp chỉ tồn tại trong phiên ứng dụng, không tự khôi phục
  hoặc tự chạy lại sau khi ứng dụng khởi động lại.
- Mỗi bước chỉ chạy `git`/`gh` với mảng đối số. Không nhận lệnh từ phía giao diện.
  Đường dẫn runtime phải thuộc thư mục dự án đã liên kết; các đường dẫn đích phải
  mới, trong phạm vi được phép. ZIP và `.gitignore` không ghi đè tệp hiện hữu.
- Kết quả ghi riêng các bước hoàn tất, trạng thái `success`, `partial`, `error`,
  `cancelled`, và tác động `none`, `applied`, `unknown`. Khi hủy/timeout hoặc mất
  kết nối, kết quả của thao tác từ xa có thể chưa xác định: phải kiểm tra trước
  khi người dùng chủ động tạo yêu cầu mới.
- Xung đột được giữ để phục hồi thủ công. Không tự `merge --abort`, `reset --hard`
  hay xóa tệp chưa theo dõi. Kho có thao tác dang dở hoặc tệp xung đột bị chặn ghi.
- `undoCommit` hiện bị chặn vì không thể chứng minh HEAD chưa từng được công bố;
  người dùng có thể dùng `revert` để tạo phiên bản đảo ngược. Đây là giới hạn có
  chủ ý, không phải thao tác đã được triển khai đầy đủ.
- Đăng nhập có mã thiết bị, hủy, bước `auth setup-git` và kiểm tra tài khoản thực.
  Token môi trường phải được bỏ trước khi dùng đăng nhập trình duyệt. Việc cấp
  quyền xóa kho là luồng riêng; quyền được kiểm tra lại trước khi xóa.
- Danh sách giới hạn 100 mục và báo có thể bị cắt. Đầu ra/lỗi che token, thông tin
  xác thực trong URL và header. Không tự lưu token vào dữ liệu ứng dụng.

Kiểm thử lưu tại `core/test/github-executor.test.ts` và `core/test/github-rpc.test.ts`:
Git thật trong thư mục tạm; gh giả cho đăng nhập và lỗi từ xa. Chưa xác minh đăng
nhập trình duyệt, quyền tổ chức, tạo/xóa kho, PR và release với tài khoản thật.
Nguồn CLI tham chiếu: https://cli.github.com/manual/gh_auth_login,
https://cli.github.com/manual/gh_auth_refresh và https://git-scm.com/docs/git-merge.
