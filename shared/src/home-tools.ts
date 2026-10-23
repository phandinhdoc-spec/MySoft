import {TEACHER_FEATURES, type FeatureKey} from "./teacherSuite.js";

/**
 * Chọn công cụ gợi ý cho trang chủ theo dự án đang mở.
 * Tín hiệu lấy từ tên dự án, quy tắc, tên thư mục và bản đồ Brain (đường dẫn + vai trò do model nhẹ tóm tắt).
 * Không có tín hiệu nào thì trả về danh sách mặc định, giống trước khi có Brain.
 */
export interface HomeSignal {
  projectName?: string;
  rules?: string;
  /** Tên thư mục (không phải đường dẫn đầy đủ) của các thư mục dự án. */
  folders?: string[];
  /** Dòng dạng "đường/dẫn: vai trò" lấy từ bản đồ Brain. */
  brain?: string[];
}

export type HomePrompt = {
  id: string;
  icon: string;
  label: string;
  desc: string;
  prompt: string;
  plan?: boolean;
  /** Nằm trong bộ mặc định khi chưa có tín hiệu nào. */
  fallback?: boolean;
  keywords: string[];
};

/** Thẻ tính năng sư phạm: chỉ hiện khi dự án khớp với từ khóa của tính năng. */
const FEATURE_KEYWORDS: Record<FeatureKey, string[]> = {
  assessment: ["kiểm tra", "đề thi", "ma trận", "đánh giá", "ngân hàng", "câu hỏi", "trắc nghiệm", "đề kiểm tra"],
  mixer: ["trộn đề", "mã đề", "đáp án", "trắc nghiệm", "hoán vị", "phiếu"],
  diff: ["công văn", "nghị định", "thể thức", "hành chính", "quyết định", "tờ trình", "văn bản", "thông báo"],
  gradebook: ["điểm", "học bạ", "sổ điểm", "nhận xét", "học sinh", "thông tư", "xếp loại"],
  slides: ["giáo án", "bài giảng", "slide", "powerpoint", "trình chiếu", "bài dạy"],
};

const PROMPTS: HomePrompt[] = [
  {
    id: "lesson",
    icon: "▤",
    label: "Chuẩn bị bài giảng",
    desc: "Lên ý tưởng cho tiết học tiếp theo",
    prompt: "Giúp tôi lập kế hoạch một tiết học Khoa học tự nhiên lớp 8. Hãy hỏi chủ đề và mục tiêu trước.",
    fallback: true,
    keywords: ["giáo án", "bài giảng", "tiết học", "kế hoạch dạy", "bài dạy", "chủ đề"],
  },
  {
    id: "data",
    icon: "∑",
    label: "Làm việc với số liệu",
    desc: "Kiểm tra bảng tính và đối chiếu dữ liệu",
    prompt: "Tôi muốn kiểm tra số liệu trong bảng điểm. Hãy hướng dẫn chọn tệp và dùng Python để tính.",
    fallback: true,
    keywords: ["excel", "bảng tính", "số liệu", "bảng điểm", "csv", "điểm", "thống kê"],
  },
  {
    id: "plan",
    icon: "◇",
    label: "Xây dựng kế hoạch",
    desc: "Từng bước rõ ràng, duyệt rồi thực hiện",
    prompt: "Lập kế hoạch xây dựng ngân hàng câu hỏi cho một chương. Hãy hỏi môn, lớp và chương trước.",
    plan: true,
    fallback: true,
    keywords: ["kế hoạch", "chương", "ngân hàng", "quy trình", "nhiều bước", "lịch"],
  },
  {
    id: "read",
    icon: "⌁",
    label: "Đọc hiểu tài liệu",
    desc: "Tìm câu trả lời có trích dẫn nguồn",
    prompt: "Tóm tắt tài liệu tôi đính kèm và trích dẫn vị trí các ý chính.",
    fallback: true,
    keywords: ["tài liệu", "pdf", "sách", "nguồn", "đọc", "tóm tắt", "trích dẫn"],
  },
  {
    id: "code",
    icon: "⟨⟩",
    label: "Tra cứu và sửa mã",
    desc: "Tìm đúng hàm, tệp liên quan rồi sửa có kiểm thử",
    prompt: "Tìm phần mã liên quan đến lỗi hoặc tính năng tôi cần, dùng Brain để xác định hàm và tệp, rồi đề xuất thay đổi nhỏ kèm kiểm thử.",
    keywords: ["mã nguồn", "code", "typescript", "tsx", "javascript", "rust", "python", "lỗi", "kiểm thử", "test", "build", "hàm", "component", "api", "backend", "frontend"],
  },
  {
    id: "docs-office",
    icon: "▦",
    label: "Soạn tài liệu Office",
    desc: "Tạo Word, Excel hoặc PowerPoint có định dạng sẵn",
    prompt: "Soạn giúp tôi một tài liệu Word theo mẫu của dự án. Hãy hỏi loại văn bản, người nhận và nội dung chính trước.",
    keywords: ["word", "docx", "báo cáo", "tài liệu", "văn bản", "mẫu", "soạn"],
  },
];

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Gom tín hiệu thành một chuỗi đã bỏ dấu để so từ khóa. */
export function signalText(s: HomeSignal = {}): string {
  return fold([s.projectName ?? "", s.rules ?? "", ...(s.folders ?? []), ...(s.brain ?? [])].join(" \n "));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Khớp nguyên từ hoặc nguyên cụm, không khớp chuỗi con (tránh "de" khớp "dem"). */
const hits = (text: string, k: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(fold(k))}($|[^a-z0-9])`).test(text);
const score = (text: string, keywords: string[]) => keywords.reduce((n, k) => n + (hits(text, k) ? 1 : 0), 0);

export interface HomePick {
  /** Khóa tính năng sư phạm đã khớp, xếp theo mức khớp. Rỗng nghĩa là không hiện dải thẻ. */
  features: FeatureKey[];
  /** Bốn gợi ý soạn sẵn, xếp theo mức khớp. */
  prompts: HomePrompt[];
  /** true khi không có tín hiệu nào, giao diện dùng bộ mặc định. */
  defaults: boolean;
}

/** Xếp hạng công cụ theo dự án. Hàm thuần, không đọc tệp. */
export function pickHomeTools(signal?: HomeSignal, limit = 4): HomePick {
  const text = signalText(signal);
  if (!text.trim()) {
    return {
      features: TEACHER_FEATURES.map((f) => f.key),
      prompts: PROMPTS.filter((p) => p.fallback).slice(0, limit),
      defaults: true,
    };
  }
  const features = TEACHER_FEATURES.map((f, i) => ({ key: f.key, s: score(text, FEATURE_KEYWORDS[f.key]), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.key);
  const prompts = PROMPTS.map((p, i) => ({ p, s: score(text, p.keywords), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
  return { features, prompts, defaults: false };
}
