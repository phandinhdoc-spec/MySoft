# Kiểm kê RPC và sự kiện của lõi Desktop (giai đoạn 0)

Phạm vi: `core/src/desktop/runtime.ts` (`dispatchInner`), `core/src/desktop/sidecar.ts`, và các `emit` trong `core/src/desktop/*.ts`. Tài liệu này chỉ kiểm kê, chưa đổi mã.

Số liệu đo bằng `grep`: 160 tên `case` trong `runtime.ts`, cùng khoảng 160 phương thức duy nhất. Một số tên xuất hiện ở nhiều nơi nên con số chỉ mang tính tham khảo.

## 1. Cách định tuyến hiện tại

| Thành phần | Cơ chế | Hệ quả |
| --- | --- | --- |
| Tauri `rpc` (`chatbox/src-tauri/src/lib.rs`) | Ghi một dòng JSON vào stdin của sidecar; đợi phản hồi theo `id` | Đã ghép đúng phản hồi theo mã yêu cầu |
| Tauri `deliver` (`chatbox/src-tauri/src/lib.rs`) | Sự kiện có `id` khớp một yêu cầu đang chờ được `emit_to` đúng cửa sổ đã gửi yêu cầu; sự kiện không khớp (trạng thái chung) được `emit` tới mọi cửa sổ | Đã định tuyến theo cửa sổ (sửa so với bản kiểm kê ban đầu) |
| Sidecar `send` | Ghi JSON theo dòng ra stdout | Một kênh duy nhất |
| `DesktopRuntime.jobs` | Khóa theo `chatId`: lượt thứ hai trên cùng hội thoại bị từ chối với "Hội thoại đang xử lý" | Đã có khóa theo hội thoại trong lõi |

## 2. Sự kiện (`RpcEvent`)

| Sự kiện | Số điểm phát | Có `id` theo lượt gọi? | Có `chatId`? | Ghi chú |
| --- | --- | --- | --- | --- |
| `state` | 6 | Không (`id:''`) | Không | Toàn bộ `view()`; mọi cửa sổ cần dữ liệu này |
| `delta` | 2 | Có (`rpcId`) | Có | Chữ đang stream; cần gửi đúng cửa sổ |
| `progress` | 2 | Không | Không | Tiến trình AI |
| `usage` | 3 | Không | `backend` | Mức dùng model |
| `github` | 2 | Không | Không | Tiến trình GitHub |
| `notebook` | 1 | Không | Không | Sổ nguồn đổi |
| `editSession` | 1 | Không | Không (có `id` phiên sửa) | Phiên sửa tệp |
| `update` | 2 | Không | Không | Tải bản cập nhật |
| `setup` | 1 | Không | Không | Cài đặt backend |

Kết luận: chỉ `delta` (và các sự kiện phát kèm `rpcId`) có thể định tuyến chính xác theo cửa sổ gọi. Phần còn lại là trạng thái chung và có thể phát quảng bá, miễn là giao diện lọc theo hội thoại khi cần.

## 3. RPC theo phạm vi

Phân loại dưới đây dựa trên tên và tham số `chatId`/`id` đọc trong `case`. Mục đánh dấu "cần xác minh" là suy đoán từ tên, chưa đọc thân hàm.

**Gắn với hội thoại** (tham số `chatId`, hoặc `id` là kế hoạch/hội thoại): `send`, `runPlan`, `chatModel`, `cancel`, `attach`, `removeAttachment`, `approveAction`, `declineAction`, `deleteChat`, `renameChat`, `moveChat`, `pinChat`, `readDraft`, `saveDraft`, `refreshFiles`, `savePlan`, `editPlan`, `replacePlanInput`, `skipPlanStep`, `resolvePlanRecovery`, `inspectPlanRecovery`, `saveSummary`, `workflowRun`, `workflowCancel`, `workflowSave`, `workflowDelete`, `workflowPin`, `feedback`, `selfTipDecide`, `hints`, `optimize`, `selectOutput`, `outputLocation`, `officeSelect`, `favoritePrompt`, `rememberContext`.

**Gắn với dự án**: `saveProject`, `deleteProject`, `connectProject`, `addFolderProject`, `projectAddFolders`, `projectRemoveFolder`, `projectLearningAttach`, `projectLearningDraft`, `removeProjectLearningFolder`, `saveProjectLearning`, `setProjectGithubFolder`, `copyAttachmentToProject`, `suggestProjectName`.

**Toàn cục** (cài đặt, tài khoản, kho dữ liệu, cập nhật, bản dựng): `init`, `view`, `refresh`, `preferences`, `saveApi`, `apiModels`, `providerUsage`, `activity`, `license.*`, `checkUpdate`, `installUpdate`, `setupBackend`, `backendInstallers`, `installSkills`, `scanSkills`, `discoverSkills`, `saveRule`, `deleteRule`, `saveModes`, `deleteMode`, `savePrompt`, `deletePrompt`, `exportData`, `importData`, `clearIndex`, `officeSetup`, `officeStart`, `officeStop`, `officeTrust`, `officeInstallTools`, `officeCreate`, `craftInstall`, `craftStatus`, `openTerminal`, `openLink`, `openOutput`, `revealOutput`, `undoOutput`, `saveOutput`, `pdfRead`, `pdfWriteBegin`, `pdfWriteChunk`, `pdfWriteFinish`, `pdfWriteAbort`, `pdfFont`, `github*`, `math.*`, `skill*`, `editOpen`/`editRead`/`editSave`/`editApply`/`editDiscard`/`editUndo`/`editRedo`/`editRender`, `prepareFileEdit`, `templateSave`/`templateInsert`/`workflowLinkResolve`/`workflowCodeDecide`/`templateDelete`/`templateFromWorkflow`, `learnNow`, `runRefineNow`, `stopRefineNow`, `syncRefine`, `catchUpRefine`, `reviewLearned`, `reviewLearnedSkill`, `reviewSkillSuggestion`, `editLearned`, `deleteLearned`, `systemSkills`, `toggleSkill`, `deleteSkill`, `createSkill`, `saveSkillEdit`, `beginSkillEdit`, `restoreSkillBackup`, `toolHealth`, `prepareTools`, `toolsMarkSeen`, `setupBackend`.

**Cần xác minh khi làm giai đoạn 1–2**: `assessmentMatrix`, `beautifyMarkdown`, `standardize`, `screenshotScan`, `fileMediaPreview`, `fileQuickPreview`, `extractText`, `pathKinds`, `attachmentImage`, `resumeCandidates`, `retryUpload`, `previewFeedback`, `sendFeedback`, `setNotebookLinks`, `templateSave`, `workflowDesignStart`, `githubUploadHistory`. Các tên này chưa đọc thân hàm nên chưa phân loại chắc chắn.

## 4. Cửa sổ phụ

Cửa sổ quy trình dùng nhãn `workflow-<id>` (`chatbox/src/PlanCard.tsx`). Cửa sổ chat dùng nhãn `chat-<uuid>` (`chatbox/src/chat-window.ts`), mở từ nút **Mở cửa sổ chat mới** hoặc menu hội thoại **Mở trong cửa sổ mới**. Tham số URL chọn hội thoại ban đầu; lựa chọn và ô soạn thuộc từng cửa sổ. Mọi cửa sổ trong một ứng dụng dùng chung một sidecar và kênh `pvta:event`; quyền Tauri đã thêm mẫu `chat-*`.

## 5. Điều cần lưu ý cho giai đoạn 1–2

- Giai đoạn 1: định tuyến theo cửa sổ đã có trong `lib.rs` (sự kiện có `id` khớp yêu cầu đang chờ đi về đúng cửa sổ). Chưa kiểm chứng trên app thật với hai cửa sổ cùng lúc.
- Với giai đoạn 2: `runtime.jobs` chỉ có tác dụng trong một tiến trình. Nếu daemon là người ghi duy nhất thì khóa này được giữ nguyên, vì tất cả client đều đi qua cùng một daemon.
- Sự kiện trạng thái (`state`) có kích thước lớn; khi có nhiều client, nên cân nhắc gửi cho client có quan tâm, nhưng bản đầu gửi cho tất cả để giữ hành vi cũ.

## 6. Trạng thái triển khai

- **Giai đoạn 0:** xong (tài liệu này).
- **Giai đoạn 1:** đã thêm mở cửa sổ chat, chọn hội thoại theo URL, quyền Tauri và test; định tuyến Rust bỏ sự kiện có mã yêu cầu đã kết thúc thay vì phát sang cửa sổ khác. Chưa kiểm thử thao tác trên hai cửa sổ app thật.
- **Giai đoạn 2:** một tiến trình giữ `DesktopRuntime` và socket cục bộ; Desktop (sidecar) và CLI là client hoặc host qua `core/src/desktop/daemon.ts`. Khóa `foreground.lock` vẫn dùng để giành quyền ghi, nhưng không còn bắt CLI và Desktop loại trừ nhau. Kiểm chứng: 9 test daemon, một test với DesktopRuntime thật và backend giả, cùng phiên CLI TTY chạy với sidecar trong gói Desktop thật.
- **Giai đoạn 3 (add-in):** chưa làm theo quyết định của người dùng.
- **Giai đoạn 4:** cập nhật tài liệu, test, build CLI và gói macOS ARM64 `.app`; bước tạo `.dmg` còn lỗi môi trường.

Lưu ý: sự kiện có `id` của yêu cầu chỉ đi về kết nối đã gửi yêu cầu; sự kiện trạng thái chung phát cho mọi kết nối. Khi host đóng, các yêu cầu đang chạy ở client bị báo lỗi "Lõi PVTA đã dừng" và phải gửi lại; dữ liệu đã lưu không mất.

## 7. Đối chiếu và kiểm chứng ngày 22/10/2026

Làm trực tiếp trên `feature/daemon-multiwindow`, đối chiếu bản HEAD `4e873c1` bằng bản giải nén riêng trong `/tmp`. Không commit, push, cài đè ứng dụng hoặc triển khai add-in. Chỉ mục graph có generation `2026-10-20T03:34:38Z`, không theo kịp các tệp daemon/CLI; các phạm vi liên quan được đọc nguồn trực tiếp.

### Lỗi phát hiện và đã sửa

- Đóng daemon trong lúc đang kết nối vẫn có thể tạo host sau đó: thêm kiểm tra trạng thái đóng tại các điểm chờ, giải phóng server/runtime/khóa khi khởi tạo bị hủy; không cho gọi lại daemon đã đóng.
- Sự kiện có id không còn chủ trước đây bị phát cho mọi kết nối/cửa sổ: nay bỏ sự kiện đó, chỉ phát quảng bá sự kiện không có id.
- Phản hồi trên 2 MB bị client bỏ qua, khiến yêu cầu chờ mãi: tách giới hạn yêu cầu 2 MB và phản hồi 32 MB; vượt giới hạn phản hồi thì ngắt kết nối để báo lỗi. Yêu cầu quá lớn nhận lỗi rõ ràng.
- Trong khi chờ host khác mở socket, thử lại quyền host nếu tiến trình kia đã thoát.

Ba test hồi quy đầu đã thất bại trên mã trước sửa, sau sửa đều đạt. Test `daemon-runtime.test.ts` dùng DesktopRuntime thật và mock riêng backend AI: hai hội thoại chạy đồng thời; gửi lần nữa vào hội thoại đang bận bị từ chối; delta về đúng client; cả hai kết quả còn sau chuyển host.

### Kết quả chạy

- Typecheck toàn workspace và CLI đạt. Lần chạy cuối bộ kiểm thử liên quan (daemon, DesktopRuntime tích hợp, desktop, CLI, cửa sổ chat, menu và sidebar) đạt 87/87 trong 7 tệp.
- Toàn bộ test trước khi thêm test tích hợp cuối: 1806 đạt, 16 lỗi. Đối chiếu các tệp lỗi với HEAD: 15 ca cũng thất bại trên HEAD trong cùng môi trường; không coi đó là chứng minh nguyên nhân từng lỗi giống hệt nhau.
- `project-storage`: lỗi `EEXIST /tmp/PVTA-Ket-qua/answer.txt`; chạy riêng với `PVTA_RESULT_DIR` mới thì cả tệp đạt 11/11. Không xóa tệp kết quả cũ của người dùng.
- `python-setup`: các lỗi hết khi bỏ `PVTA_BUNDLED_RUNTIME` và các biến tài nguyên ứng dụng khỏi môi trường test. Đây là biến được kế thừa từ phiên chạy bên trong ứng dụng.
- `office-live`: cổng `127.0.0.1:52734` đang được dùng, cả HEAD lẫn mã hiện tại đều lỗi; không dừng dịch vụ của người dùng.
- Các lỗi còn lại gồm test skill/community/effort trong bridge và Brain thật. Chưa sửa vì ngoài phần daemon/nhiều cửa sổ; Brain vẫn lỗi sau khi chỉ định binary mới và chỉ mục tạm.
- Phiên TTY thật: CLI làm host, sidecar trong gói `.app` nối vào; tạo hội thoại từ sidecar và đổi tên từ CLI, sidecar nhận thay đổi. Thoát CLI, sidecar nhận host và ghi tiếp được. Mở lại CLI rồi đóng sidecar, CLI nhận host và ghi tiếp được. Sau khi đóng hết, socket và khóa không còn. Không gọi AI có tính phí.

### Bản dựng và giới hạn còn lại

Build từ gốc repository bằng `CARGO_TARGET_DIR=/Users/phananh/MySoft/.build-target npm exec -w chatbox -- tauri build --bundles app` đã thành công. Gói ở `.build-target/release/bundle/macos/PVTA.app`; thư mục build được bỏ qua trong Git. CLI build bằng `npm run build:cli`, chạy qua `./cli/pvta`.

Log build/typecheck, báo cáo test hiện tại và HEAD được giữ ở `.build-cache/daemon-verification/` (không đưa vào Git). Bản checkout tạm, ứng dụng test và kho hội thoại thử đã được dọn; giữ lại gói `.app` để kiểm tra tiếp.

`Cai-PVTA.command` thực sự có ở gốc repository, nhưng đây là trình cài, không cần chạy để build kiểm chứng. Không cài đè bản người dùng đang mở. Build `.dmg` dừng ở `hdiutil: create failed - Device not configured`; `.app` dựng thành công riêng.

Chưa xác nhận giao diện hai cửa sổ trên app thật: chạy trực tiếp executable GUI thoát mã 134; công cụ điều khiển giao diện từ chối mở bản test với thông báo `Computer Use was not approved to use PVTA`. Chưa thử Windows named pipe/ACL, lượt AI thật hoặc Plan Pro đầu-cuối. Cài đặt quyền/chế độ viết vẫn dùng chung kho như trước; model riêng theo hội thoại. Add-in vẫn hoãn theo yêu cầu.
