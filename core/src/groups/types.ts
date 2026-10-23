/** Kiểu dữ liệu dùng chung cho Nhóm (đặc tả mục 1.2). */

export type GroupKind = "chuyen-mon" | "vai-tro" | "dang-doan-the" | "cong-cu";

/** Mức tin cậy của gói (đặc tả 1.9 bước 5): chính thức > đồng nghiệp chia sẻ > cá nhân tự học. */
export type GroupTier = "chinh-thuc" | "dong-nghiep" | "ca-nhan";

export interface GroupManifest {
  id: string;
  name: string;
  kind: GroupKind;
  version: string;
  author: string;
  tier: GroupTier;
  description?: string;
  /** Tên các skill thuộc nhóm (thư mục trong skills/). */
  skills: string[];
  /** Tên miền tin cậy để theo dõi và tải văn bản. */
  domains: string[];
  /** Nguồn tin dạng RSS/Atom (tùy chọn): ổn định hơn việc đọc trang tìm kiếm. */
  feeds?: string[];
  keywords: string[];
  related: string[];
}

export const DOC_STATUS = ["con-hieu-luc", "sap-co-hieu-luc", "da-sua-doi", "het-hieu-luc", "chua-xac-dinh"] as const;
export type DocStatus = (typeof DOC_STATUS)[number];

export const STATUS_LABEL: Record<DocStatus, string> = {
  "con-hieu-luc": "Còn hiệu lực",
  "sap-co-hieu-luc": "Sắp có hiệu lực",
  "da-sua-doi": "Đã sửa đổi",
  "het-hieu-luc": "Hết hiệu lực",
  "chua-xac-dinh": "Chưa xác định",
};

export const DOC_STATE = ["chua-tai", "dang-tai", "da-tai", "da-lap-chi-muc", "chua-doc-duoc", "nguon-khong-con"] as const;
export type DocState = (typeof DOC_STATE)[number];

export const STATE_LABEL: Record<DocState, string> = {
  "chua-tai": "Chưa tải",
  "dang-tai": "Đang tải",
  "da-tai": "Đã tải",
  "da-lap-chi-muc": "Đã lập chỉ mục",
  "chua-doc-duoc": "Chưa đọc được",
  "nguon-khong-con": "Nguồn không còn",
};

export interface DocRecord {
  id: string;
  /** Số hiệu, ví dụ "115/2020/NĐ-CP" (có thể chưa biết). */
  no?: string;
  title: string;
  agency: string;
  /** Ngày ban hành, dạng YYYY-MM-DD (hoặc rỗng nếu chưa biết). */
  issuedAt?: string;
  effectiveAt?: string;
  status: DocStatus;
  /** "tay": người dùng tự đặt (không bị ghi đè); "van-ban": rút ra từ chữ của văn bản khác. */
  statusSource?: "tay" | "van-ban";
  url?: string;
  host?: string;
  state: DocState;
  /** Đường dẫn tương đối trong kho/. */
  file?: string;
  /** SHA-256 của tệp đã tải (khóa của bản tóm tắt). */
  hash?: string;
  /** Lý do khi chưa đọc được (PDF scan, định dạng cũ…). */
  note?: string;
  isNew?: boolean;
  hidden?: boolean;
  /** Số hiệu văn bản đã thay thế văn bản này. */
  replacedBy?: string;
  amendedBy?: string[];
  /** Văn bản này thay thế / sửa đổi các số hiệu nào (đọc được từ chính nội dung). */
  replaces?: string[];
  amends?: string[];
  addedAt: number;
  source: "tay" | "tim-moi" | "goi";
}

export interface GroupsState {
  version: 1;
  /** undefined = chưa chọn nhóm lần nào (chế độ cũ: nạp mọi skill như trước). */
  enabled?: string[];
  pack?: string;
  /** Chế độ không dùng mạng: tắt mọi tìm kiếm trên mạng. */
  offline?: boolean;
  /** Nhóm bị tắt cảnh báo văn bản liên quan. */
  alertsOff?: string[];
  briefing?: { enabled?: boolean; shownDay?: string; dismissedDay?: string };
  profile?: DiscoveryProfile;
  sources?: DiscoverySource[];
  discover?: { lastRun?: Record<string, number>; reports?: DiscoveryReport[] };
}

export interface DiscoveryProfile {
  province: string;
  locality: string;
  school: string;
  level: string;
  subjects: string;
  keywords: string;
}
export interface DiscoverySource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  groups: string[];
  kind: "page" | "feed";
  lastChecked?: number;
  lastError?: string;
  found?: number;
}
export interface DiscoveryReport {
  group: string;
  at: number;
  added: number;
  checked: number;
  skipped?: string;
  errors: string[];
}
