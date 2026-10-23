import type { GroupKind, GroupManifest } from "./types.js";

/** Danh mục nhóm có sẵn (bảng 4 cột ở đặc tả 1.3) và các gói chọn nhanh. */

type Seed = [id: string, name: string, keywords: string[], extra?: Partial<GroupManifest>];

const EDU_DOMAINS = ["moet.gov.vn", "chinhphu.vn", "vbpl.vn", "thuvienphapluat.vn"];

function make(kind: GroupKind, seeds: Seed[]): GroupManifest[] {
  return seeds.map(([id, name, keywords, extra]) => ({
    id,
    name,
    kind,
    version: "1.0.0",
    author: "PVTA",
    tier: "chinh-thuc" as const,
    skills: [],
    domains: kind === "cong-cu" ? [] : EDU_DOMAINS,
    keywords,
    related: [],
    ...extra,
  }));
}

export const BUILTIN_GROUPS: GroupManifest[] = [
  ...make("chuyen-mon", [
    ["toan", "Toán", ["toán", "đại số", "hình học", "phương trình", "hàm số"]],
    ["ly", "Vật lí", ["vật lí", "lực", "điện", "quang", "nhiệt", "chuyển động"]],
    ["hoa", "Hóa học", ["hóa", "phản ứng", "dung dịch", "nguyên tố", "mol"]],
    ["sinh", "Sinh học", ["sinh học", "tế bào", "di truyền", "hệ sinh thái"]],
    ["khtn", "Khoa học tự nhiên", ["khoa học tự nhiên", "khtn", "thí nghiệm", "năng lực khoa học"]],
    ["gdcd", "Giáo dục công dân", ["giáo dục công dân", "gdcd", "pháp luật", "đạo đức"]],
    ["tin-hoc", "Tin học", ["tin học", "thuật toán", "lập trình", "máy tính"]],
  ]),
  ...make("vai-tro", [
    ["giao-vien", "Giáo viên", ["giáo viên", "giáo dục", "giảng dạy", "giáo án", "kiểm tra đánh giá", "chuyên đề"]],
    ["to-truong", "Tổ trưởng / Tổ phó chuyên môn", ["tổ chuyên môn", "kế hoạch giáo dục", "dự giờ", "sinh hoạt chuyên môn"]],
    ["hieu-pho", "Hiệu phó", ["phó hiệu trưởng", "chuyên môn", "thời khóa biểu", "kiểm tra nội bộ"]],
    ["hieu-truong", "Hiệu trưởng", ["hiệu trưởng", "quản lý nhà trường", "quyết định", "kế hoạch năm học"]],
    ["van-thu", "Văn thư", ["văn thư", "công văn", "thể thức", "lưu trữ", "số hiệu"]],
    ["ke-toan", "Kế toán", ["kế toán", "dự toán", "thanh toán", "quyết toán", "tài chính"]],
    ["thu-vien", "Thư viện", ["thư viện", "sách", "học liệu"]],
    ["thiet-bi", "Thiết bị", ["thiết bị dạy học", "phòng thí nghiệm", "kiểm kê"]],
  ]),
  ...make("dang-doan-the", [
    ["dang-vien", "Đảng viên", ["đảng viên", "chi bộ", "nghị quyết", "sinh hoạt đảng"]],
    ["bi-thu", "Bí thư chi bộ", ["bí thư", "chi bộ", "đảng ủy", "nghị quyết"]],
    ["pho-bi-thu", "Phó bí thư", ["phó bí thư", "chi bộ"]],
    ["cong-doan", "Chủ tịch công đoàn", ["công đoàn", "đoàn viên công đoàn", "nghị quyết công đoàn"]],
    ["doan-doi", "Đoàn – Đội", ["đoàn thanh niên", "đội thiếu niên", "sao nhi đồng", "phong trào"]],
  ]),
  ...make("cong-cu", [
    ["python", "Python", ["python", "pandas", "tính toán", "biểu đồ"]],
    ["arduino", "Arduino", ["arduino", "cảm biến", "vi điều khiển", "mạch"]],
    ["am-thanh", "Âm thanh", ["âm thanh", "ghi âm", "lọc nhiễu", "audio"]],
    ["typst", "Typst", ["typst", "sắp chữ", "đề thi"]],
    ["pdf", "PDF", ["pdf", "văn bản scan", "tô sáng", "ghi chú"]],
    ["word", "Word", ["word", "soạn thảo", "định dạng văn bản"]],
    ["excel", "Excel", ["excel", "bảng tính", "công thức", "điểm số"]],
    ["powerpoint", "PowerPoint", ["powerpoint", "bài giảng điện tử", "slide"]],
  ]),
];

export interface QuickPack {
  id: string;
  name: string;
  groups: string[];
}

/** Bấm một lần là tick sẵn các nhóm phù hợp; người dùng chỉnh lại được. */
export const QUICK_PACKS: QuickPack[] = [
  { id: "gv-khtn", name: "Giáo viên THCS KHTN", groups: ["khtn", "giao-vien", "pdf", "word", "excel", "powerpoint"] },
  { id: "to-pho", name: "Tổ phó chuyên môn", groups: ["khtn", "giao-vien", "to-truong", "pdf", "word", "excel", "powerpoint"] },
  { id: "hieu-truong", name: "Hiệu trưởng", groups: ["hieu-truong", "van-thu", "pdf", "word", "excel", "powerpoint"] },
  { id: "van-thu", name: "Văn thư", groups: ["van-thu", "pdf", "word", "excel"] },
  { id: "ke-toan", name: "Kế toán", groups: ["ke-toan", "pdf", "excel", "word"] },
];

export function builtinGroup(id: string): GroupManifest | undefined {
  return BUILTIN_GROUPS.find((g) => g.id === id);
}

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  "chuyen-mon": "Chuyên môn",
  "vai-tro": "Vai trò",
  "dang-doan-the": "Đảng – Đoàn thể",
  "cong-cu": "Công cụ",
};

/**
 * Nhóm «công cụ» (Word, Excel, PowerPoint, PDF, Python…) chỉ là công tắc bật/tắt kỹ năng.
 * Chúng không có kho văn bản pháp quy: không tìm văn bản mới, không đếm văn bản, không nhắc căn cứ.
 */
export function isToolKind(kind: GroupKind): boolean {
  return kind === "cong-cu";
}

/** Tệp kết quả/đầu vào thuộc công cụ nào (dùng để đếm «đang xử lí» và «chưa xem»). */
export function toolOfFile(file: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase();
  if (!ext) return undefined;
  if (ext === "docx" || ext === "doc") return "word";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "excel";
  if (ext === "pptx" || ext === "ppt") return "powerpoint";
  if (ext === "pdf") return "pdf";
  if (ext === "typ") return "typst";
  return undefined;
}
