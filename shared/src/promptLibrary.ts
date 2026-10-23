import type { OfficeHost } from "./protocol.js";

/** Lời nhắc trong thư viện. Ô trống viết dạng [mô tả] (giống Monica): bấm vào thì hiện ô điền. */
export interface LibraryPrompt {
  id: string;
  title: string;
  text: string;
  category: string;
  /** Mô tả một dòng (mẫu dựng sẵn). */
  desc?: string;
  /** Ứng dụng phù hợp; bỏ trống = mọi ứng dụng. */
  hosts?: OfficeHost[];
  /** true = do người dùng tạo (sửa / xóa được). */
  own?: boolean;
  updatedAt?: number;
}

export const PROMPT_CATEGORIES: ReadonlyArray<{ id: string; name: string }> = [
  { id: "soan-bai", name: "Soạn bài" },
  { id: "kiem-tra", name: "Kiểm tra – đánh giá" },
  { id: "diem-so", name: "Điểm số" },
  { id: "trinh-chieu", name: "Trình chiếu" },
  { id: "van-ban", name: "Văn bản – hành chính" },
  { id: "hoc-sinh", name: "Học sinh – phụ huynh" },
];

const W: OfficeHost[] = ["word"];
const X: OfficeHost[] = ["excel"];
const P: OfficeHost[] = ["powerpoint"];

/** Mẫu dựng sẵn cho giáo viên (chương trình GDPT 2018). */
export const BUILTIN_PROMPTS: readonly LibraryPrompt[] = [
  // Soạn bài
  {
    id: "b-giao-an-5512",
    category: "soan-bai",
    hosts: W,
    title: "Giáo án theo Công văn 5512",
    desc: "Khung kế hoạch bài dạy 4 hoạt động",
    text: "Soạn kế hoạch bài dạy môn [môn học] lớp [lớp], bài \"[tên bài]\", thời lượng [số tiết] tiết, theo cấu trúc Phụ lục IV Công văn 5512/BGDĐT-GDTrH: I. Mục tiêu (kiến thức, năng lực, phẩm chất); II. Thiết bị dạy học và học liệu; III. Tiến trình dạy học gồm 4 hoạt động (Mở đầu, Hình thành kiến thức mới, Luyện tập, Vận dụng), mỗi hoạt động có a) Mục tiêu, b) Nội dung, c) Sản phẩm, d) Tổ chức thực hiện. Viết thẳng vào văn bản.",
  },
  {
    id: "b-khoi-dong",
    category: "soan-bai",
    title: "Hoạt động khởi động",
    desc: "3 ý tưởng mở đầu tiết học gây hứng thú",
    text: "Gợi ý 3 hoạt động khởi động (3–5 phút) cho bài \"[tên bài]\" lớp [lớp]: mỗi hoạt động gồm tên, cách tổ chức, câu hỏi dẫn dắt và chuẩn bị cần có. Ưu tiên tình huống gần gũi đời sống học sinh.",
  },
  {
    id: "b-phieu-hoc-tap",
    category: "soan-bai",
    hosts: W,
    title: "Phiếu học tập nhóm",
    desc: "Phiếu có nhiệm vụ, bảng ghi kết quả, câu hỏi thảo luận",
    text: "Tạo phiếu học tập cho hoạt động nhóm bài \"[tên bài]\" lớp [lớp]: tên nhóm, thời gian [số phút] phút, 3–4 nhiệm vụ từ dễ đến khó, bảng ghi kết quả, 2 câu hỏi thảo luận. Chèn vào văn bản, trình bày gọn để in.",
  },
  {
    id: "b-dien-giai",
    category: "soan-bai",
    title: "Giải thích dễ hiểu",
    desc: "Giải thích khái niệm khó kèm ví dụ đời sống",
    text: "Giải thích khái niệm \"[khái niệm]\" cho học sinh lớp [lớp]: định nghĩa chuẩn theo SGK, giải thích bằng lời dễ hiểu, 2 ví dụ đời sống, 1 lỗi hiểu sai thường gặp và cách sửa.",
  },
  {
    id: "b-stem",
    category: "soan-bai",
    title: "Ý tưởng dự án STEM",
    desc: "Dự án nhỏ gắn với bài học",
    text: "Đề xuất 3 ý tưởng dự án STEM cho bài \"[tên bài]\" lớp [lớp], làm trong [số tuần] tuần với vật liệu dễ kiếm: mục tiêu, kiến thức vận dụng, sản phẩm, tiêu chí đánh giá.",
  },
  // Kiểm tra – đánh giá
  {
    id: "b-trac-nghiem",
    category: "kiem-tra",
    title: "Đề trắc nghiệm có đáp án",
    desc: "Câu hỏi 4 lựa chọn theo mức độ nhận thức",
    text: "Soạn [số câu] câu trắc nghiệm 4 lựa chọn bài \"[tên bài]\" lớp [lớp], chia theo mức Biết – Hiểu – Vận dụng (ghi mức ở mỗi câu). Phương án nhiễu hợp lí. Cuối cùng là bảng đáp án.",
  },
  {
    id: "b-ma-tran",
    category: "kiem-tra",
    hosts: W,
    title: "Ma trận và bản đặc tả đề",
    desc: "Bảng ma trận theo chủ đề và mức độ",
    text: "Lập ma trận đề kiểm tra [giữa kì / cuối kì] môn [môn học] lớp [lớp], thời gian [số phút] phút, gồm các chủ đề: [danh sách chủ đề]. Bảng có số câu và điểm theo mức Biết – Hiểu – Vận dụng; sau đó là bản đặc tả yêu cầu cần đạt cho từng ô. Chèn bảng vào văn bản.",
  },
  {
    id: "b-dung-sai",
    category: "kiem-tra",
    title: "Câu hỏi Đúng/Sai (dạng mới)",
    desc: "Mỗi câu 4 ý a, b, c, d",
    text: "Soạn [số câu] câu hỏi dạng Đúng/Sai bài \"[tên bài]\" lớp [lớp]: mỗi câu có đoạn dẫn và 4 ý a), b), c), d); ghi đáp án Đ/S cho từng ý và giải thích ngắn ý sai.",
  },
  {
    id: "b-rubric",
    category: "kiem-tra",
    title: "Rubric đánh giá",
    desc: "Tiêu chí và mức điểm cho sản phẩm học sinh",
    text: "Xây dựng rubric đánh giá [sản phẩm, vd: bài thuyết trình nhóm] cho lớp [lớp]: 4–5 tiêu chí, mỗi tiêu chí 4 mức (Tốt, Khá, Đạt, Chưa đạt) có mô tả cụ thể và điểm. Trình bày dạng bảng.",
  },
  {
    id: "b-cham-bai",
    category: "kiem-tra",
    title: "Nhận xét bài làm học sinh",
    desc: "Góp ý phần đang chọn theo đáp án",
    text: "Đọc bài làm đang chọn, đối chiếu với yêu cầu: [đáp án hoặc yêu cầu đề]. Chỉ ra phần đúng, phần sai (vì sao), gợi ý cách sửa, và đề xuất điểm trên thang [thang điểm].",
  },
  // Điểm số – Excel
  {
    id: "b-diem-tb",
    category: "diem-so",
    hosts: X,
    title: "Tính điểm trung bình môn",
    desc: "Công thức ĐTB theo hệ số",
    text: "Trong sheet hiện tại, thêm cột \"ĐTB\" tính điểm trung bình môn theo hệ số: [các cột điểm và hệ số] (ví dụ: ĐĐGtx hệ số 1, ĐĐGgk hệ số 2, ĐĐGck hệ số 3). Làm tròn 1 chữ số thập phân, đặt công thức cho cả lớp.",
  },
  {
    id: "b-xep-loai",
    category: "diem-so",
    hosts: X,
    title: "Xếp loại kết quả học tập",
    desc: "Tốt / Khá / Đạt / Chưa đạt theo ngưỡng điểm",
    text: "Thêm cột \"Kết quả\" xếp mức theo điểm trung bình ở cột [cột ĐTB], ngưỡng: [ngưỡng xếp loại] (ví dụ: Tốt từ 8,0; Khá từ 6,5; Đạt từ 5,0; còn lại Chưa đạt), dùng công thức IF. Tô màu chữ khác nhau cho từng mức.",
  },
  {
    id: "b-thong-ke",
    category: "diem-so",
    hosts: X,
    title: "Thống kê điểm theo khoảng",
    desc: "Bảng tần số và tỉ lệ phần trăm",
    text: "Lập bảng thống kê điểm ở cột [cột điểm] theo các khoảng: dưới 3,5; 3,5–dưới 5; 5–dưới 6,5; 6,5–dưới 8; từ 8 trở lên. Có số lượng và tỉ lệ %, dùng COUNTIFS. Đặt bảng bên phải dữ liệu.",
  },
  {
    id: "b-lam-sach",
    category: "diem-so",
    hosts: X,
    title: "Làm sạch danh sách",
    desc: "Chuẩn hóa họ tên, bỏ khoảng trắng thừa, sắp xếp",
    text: "Chuẩn hóa danh sách ở sheet hiện tại: bỏ khoảng trắng thừa trong họ tên, viết hoa chữ cái đầu mỗi từ, sắp xếp theo tên (chữ cuối) rồi đến họ, đánh lại STT. Kẻ khung và tự giãn cột.",
  },
  // Trình chiếu
  {
    id: "b-dan-y-slide",
    category: "trinh-chieu",
    hosts: P,
    title: "Dựng bài trình chiếu",
    desc: "Dàn ý slide và chèn nội dung",
    text: "Tạo bài trình chiếu [số slide] slide cho bài \"[tên bài]\" lớp [lớp]: slide tiêu đề, mục tiêu, các slide nội dung chính (mỗi slide tối đa 5 ý ngắn), câu hỏi củng cố, tổng kết. Thêm slide và chèn hộp chữ vào từng slide.",
  },
  {
    id: "b-tro-choi",
    category: "trinh-chieu",
    hosts: P,
    title: "Trò chơi ôn tập",
    desc: "Ô chữ / Rung chuông vàng",
    text: "Thiết kế trò chơi [Rung chuông vàng / ô chữ] ôn tập bài \"[tên bài]\" gồm [số câu] câu từ dễ đến khó, mỗi câu một slide, đáp án ở slide kế tiếp. Chữ to, dễ đọc khi chiếu.",
  },
  {
    id: "b-gon-slide",
    category: "trinh-chieu",
    hosts: P,
    title: "Rút gọn chữ trên slide",
    desc: "Biến đoạn dài thành ý gạch đầu dòng",
    text: "Rút gọn chữ trong phần đang chọn thành tối đa 5 ý gạch đầu dòng, mỗi ý dưới 12 từ, giữ thuật ngữ chính, rồi thay vào slide.",
  },
  // Văn bản – hành chính
  {
    id: "b-ke-hoach",
    category: "van-ban",
    hosts: W,
    title: "Kế hoạch tổ chuyên môn",
    desc: "Kế hoạch đúng thể thức văn bản hành chính",
    text: "Soạn kế hoạch [tên hoạt động] của tổ [tên tổ], trường [tên trường], năm học [năm học]: căn cứ, mục đích – yêu cầu, nội dung và thời gian, phân công, kinh phí (nếu có), tổ chức thực hiện. Đúng thể thức văn bản hành chính.",
  },
  {
    id: "b-bien-ban",
    category: "van-ban",
    hosts: W,
    title: "Biên bản họp",
    desc: "Biên bản sinh hoạt tổ / họp phụ huynh",
    text: "Soạn biên bản [cuộc họp] ngày [ngày], thành phần: [thành phần], nội dung chính: [các nội dung]. Có phần thời gian – địa điểm, diễn biến, kết luận, chữ kí thư kí và chủ trì.",
  },
  {
    id: "b-bao-cao",
    category: "van-ban",
    hosts: W,
    title: "Báo cáo tổng kết",
    desc: "Ưu điểm, hạn chế, nguyên nhân, phương hướng",
    text: "Viết báo cáo tổng kết [nội dung] năm học [năm học]: đặc điểm tình hình, kết quả đạt được (có số liệu: [số liệu chính]), ưu điểm, hạn chế và nguyên nhân, phương hướng, kiến nghị. Văn phong hành chính.",
  },
  {
    id: "b-chinh-ta",
    category: "van-ban",
    title: "Rà soát chính tả và câu",
    desc: "Liệt kê lỗi trước khi sửa",
    text: "Rà soát phần đang chọn: liệt kê lỗi chính tả, dấu câu, câu sai ngữ pháp, từ dùng chưa chuẩn (dạng bảng: lỗi – sửa thành – lí do). Chưa sửa vào văn bản.",
  },
  // Học sinh – phụ huynh
  {
    id: "b-nhan-xet-hs",
    category: "hoc-sinh",
    title: "Nhận xét học sinh",
    desc: "Lời nhận xét động viên, cụ thể",
    text: "Viết 3 phương án lời nhận xét cho học sinh [tên học sinh], môn [môn học]: điểm mạnh: [điểm mạnh]; cần cố gắng: [điểm cần cố gắng]. Mỗi phương án 2–3 câu, tích cực, cụ thể, không chung chung.",
  },
  {
    id: "b-thu-phu-huynh",
    category: "hoc-sinh",
    title: "Thư gửi phụ huynh",
    desc: "Thông báo, mời họp, phối hợp giáo dục",
    text: "Viết thư gửi phụ huynh lớp [lớp] về [nội dung], lời lẽ lịch sự, ngắn gọn, nêu rõ việc cần phụ huynh phối hợp và thời hạn [thời hạn].",
  },
  {
    id: "b-phan-hoa",
    category: "hoc-sinh",
    title: "Bài tập phân hóa 3 mức",
    desc: "Cơ bản – vừa – nâng cao",
    text: "Soạn bài tập bài \"[tên bài]\" lớp [lớp] theo 3 mức: cơ bản (3 bài), vừa (2 bài), nâng cao (1 bài), có hướng dẫn giải ngắn cho từng bài.",
  },
];

export const MAX_OWN_PROMPTS = 200;
