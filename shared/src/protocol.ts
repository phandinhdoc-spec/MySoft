/** Giao thức WebSocket giữa add-in và bridge, và kiểu dùng chung. */
import type { WriteAction } from "./writing.js";
import type { CustomMode, WritingMode } from "./modes.js";
import type { LibraryPrompt } from "./promptLibrary.js";
import type { OfficeTheme } from "./officetheme.js";
import type { RagSegment } from "./rag.js";

/** Backend chạy qua CLI và gói đăng ký. */
export type CliBackendId = "agy" | "claude" | "codex";
/** "api" = gọi thẳng API bằng khóa người dùng tự nhập (phương án dự phòng). */
export type BackendId = CliBackendId | "api";
export type ApiProvider = "anthropic" | "openai" | "gemini" | "commandcode" | "compatible";
export type PermissionLevel = "read" | "ask" | "full";
export type OfficeHost = "word" | "excel" | "powerpoint";
/** Mức suy nghĩ. Mỗi model tự khai báo mức nó hỗ trợ (xem ModelInfo.efforts); "ultra" hiện chỉ có ở một số model Codex. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max", "ultra"];
export const DEFAULT_EFFORT: Effort = "low";

export const CLI_BACKEND_IDS: readonly CliBackendId[] = ["agy", "claude", "codex"];
export const BACKEND_IDS: readonly BackendId[] = ["agy", "claude", "codex", "api"];

export interface ModelChoice {
  backend: BackendId;
  /** Mã model gửi cho CLI ("default" = để CLI tự chọn). Với api: "<nhà cung cấp>/<model>". */
  model: string;
  /** Chế độ Nhanh (nếu model hỗ trợ): mã bậc tốc độ lấy từ danh mục model ("fast", "priority"…). Bỏ trống = thường. */
  speed?: string;
}

/** Một model trong danh sách lấy từ CLI (hoặc danh sách dự phòng khi CLI không liệt kê được). */
export interface ModelInfo {
  /** Mã model gửi cho CLI. Với model có `variants`, đây là mã gốc (không gửi trực tiếp). */
  id: string;
  label: string;
  hint?: string;
  /**
   * Mức suy nghĩ model hỗ trợ. [] = cố định theo model (không cho chọn);
   * không có = chưa biết, dùng mức đọc từ `--help` của CLI.
   */
  efforts?: Effort[];
  defaultEffort?: Effort;
  /** Có chế độ Nhanh (trả lời nhanh hơn, thường tốn thêm lượt dùng). */
  fast?: boolean;
  /** Mã bậc tốc độ gửi cho CLI khi bật Nhanh. */
  fastTier?: string;
  /** Lưu ý hiện cạnh nút Nhanh (vd tính phí thêm). */
  fastNote?: string;
  /** Model mà mức suy nghĩ nằm trong mã (agy: gemini-…-low/medium/high): mức → mã model thật. */
  variants?: Partial<Record<Effort, string>>;
}

/** Danh sách model theo CLI. live = lấy từ chính CLI trên máy; false = danh sách dự phòng. */
export type ModelCatalog = Partial<Record<CliBackendId, { models: ModelInfo[]; live: boolean }>>;

/** Auto khi chưa biết máy có backend nào (bridge chọn lại theo máy, xem resolveAuto). */
export const AUTO_MODEL: ModelChoice = { backend: "agy", model: "gemini-3.8-flash-medium" };

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Một model trong danh sách lấy từ API của nhà cung cấp. */
export interface ApiModelEntry {
  id: string;
  /** Tên hiển thị do nhà cung cấp trả về (Anthropic có display_name). */
  label?: string;
}

/** Trạng thái API: KHÔNG bao giờ chứa khóa, chỉ cho biết đã cấu hình hay chưa. models = danh sách model đã tải về từ chính API đó. */
export interface ApiStatus {
  providers: Partial<Record<ApiProvider, { configured: boolean; baseUrl?: string; model?: string; models?: ApiModelEntry[] }>>;
}

// ---- Add-in -> Bridge ----
/** Kết quả chuẩn hóa chỉ là bản nháp; lưu vẫn là một thao tác riêng. */
export interface StandardizePreview {
  text: string;
  fixes: string[];
  issues: {level: 'error' | 'warn' | 'info'; code: string; message: string}[];
  ok: boolean;
}
export type StandardizeReply = {type: 'standardized'; id: string; result?: StandardizePreview; error?: string};

export type ClientMessage =
  | {type: 'standardize'; id: string; kind: 'skill' | 'rule'; text: string}
  | { type: "hello"; host: OfficeHost; sessionId: string; lang: "vi" | "en"; /** Tên tệp đang mở trong cửa sổ này (nếu biết). */ doc?: string }
  | {
      type: "chat";
      id: string;
      text: string;
      model: ModelChoice | "auto";
      effort?: Effort;
      mode?: WritingMode;
      temperature?: number | null;
      /** Phần đang chọn, add-in đọc sẵn lúc gửi (bỏ được một vòng gọi công cụ đọc). */
      context?: { selection?: string; where?: string };
      /** "Làm đẹp": PVTA nhận loại văn bản, tra cách trình bày rồi sửa trực tiếp văn bản đang mở. head = vài dòng đầu văn bản (chỉ dùng cục bộ để nhận loại và tìm trên mạng). */
      beautify?: { head: string; design?: string };
    }
  /** Người dùng bắt đầu gõ / mở thẻ Viết: bridge khởi động sẵn CLI để trả lời nhanh hơn. */
  | { type: "prewarm"; kind: "chat" | "write"; model: ModelChoice | "auto"; effort?: Effort; mode?: WritingMode }
  | { type: "rpc_response"; id: string; ok: boolean; result?: unknown; error?: string }
  /** all = đồng ý luôn các thay đổi còn lại của tin nhắn đang chạy. */
  | { type: "approval"; id: string; approved: boolean; all?: boolean }
  | { type: "set_permission"; level: PermissionLevel }
  /** Lưu (hoặc xóa khi remove) khóa API của một nhà cung cấp. */
  | { type: "set_api"; provider: ApiProvider; key?: string; baseUrl?: string; model?: string; remove?: boolean }
  /**
   * Tải danh sách model từ API của nhà cung cấp. Có key/baseUrl = thử với giá trị đang gõ (chưa lưu, không ghi nhớ);
   * không có = dùng khóa đã lưu và lưu lại danh sách.
   */
  | { type: "api_models"; provider: ApiProvider; key?: string; baseUrl?: string }
  /** Dò lại các CLI trên máy (sau khi người dùng vừa cài). */
  | { type: "rescan" }
  /** Công cụ viết: một thao tác trên văn bản đang chọn (add-in tự đọc vùng chọn). */
  | {
      type: "write";
      id: string;
      action: WriteAction;
      text: string;
      /** Đoạn ngay trước vùng chọn / con trỏ, để viết liền mạch. */
      context?: string;
      /** simpler: lớp; translate: "en" | "vi"; custom: yêu cầu riêng. */
      option?: string;
      model: ModelChoice | "auto";
      effort?: Effort;
      mode?: WritingMode;
      /** Nhiệt độ tự chỉnh (null = theo chế độ). */
      temperature?: number | null;
    }
  /** Người dùng đã dùng kết quả của công cụ viết (tín hiệu cho học nền). */
  | { type: "write_feedback"; action: WriteAction; applied: "replace" | "after" | "copy"; option?: string }
  /** Viết lại câu người dùng gõ thành lời nhắc rõ ràng, hợp với model sẽ chạy. */
  | { type: "optimize"; id: string; text: string; model: ModelChoice | "auto"; hasSelection?: boolean }
  /** Thư viện lời nhắc riêng. */
  | { type: "prompts_save"; prompt: Partial<LibraryPrompt> }
  | { type: "prompts_delete"; id: string }
  | { type: "prompts_fav"; id: string; fav: boolean }
  /** Chế độ viết tự tạo: thêm (không có id) hoặc sửa; xóa; đổi thứ tự; nhập tệp JSON; khôi phục mặc định. */
  | { type: "modes_save"; mode: Partial<CustomMode> }
  | { type: "modes_delete"; id: string }
  | { type: "modes_order"; ids: string[] }
  | { type: "modes_import"; data: unknown; replace?: boolean }
  | { type: "modes_reset" }
  /** Học nền: bật/tắt, xem danh sách đã học, xóa một skill đã học (name) hoặc tất cả (all). */
  | { type: "learn_set"; enabled: boolean }
  | { type: "learn_list" }
  /** Học phong cách từ tệp (chỉ khi bấm nút): open = tệp đang mở, project = các tệp của dự án. */
  | { type: "learn_file"; from: "open" | "project" }
  /** Gợi ý thông minh: add-in gửi cấu trúc tệp đang mở khi mở khung hoặc đổi tệp; bridge trả `hints`. Bật/tắt bằng hint_set. */
  | { type: "hint_get"; id: string; profile: string; /** Vài dòng đầu văn bản (chỉ dùng cục bộ để biết đơn vị, địa phương khi tìm văn bản liên quan; không gửi cho model). */ head?: string }
  | { type: "hint_set"; enabled: boolean }
  /** Cảnh báo căn cứ: add-in gửi phần đầu văn bản (chỉ để dò số hiệu); bridge đối chiếu kho nhóm trên máy, không dùng AI, không dùng mạng. */
  | { type: "basis_check"; id: string; text: string; fileName?: string }
  | { type: "basis_mute"; no: string }
  /** Làm đẹp: người dùng đã lưu; changes = các thay đổi định dạng đã trừu tượng hóa (không có chữ của văn bản). Bridge học ở mức cao rồi tắt chế độ chờ. */
  | { type: "beautify_learn"; changes: string[] }
  /** Hủy chế độ chờ lưu → học (không học gì). */
  | { type: "beautify_cancel" }
  /** Văn bản liên quan tìm trên mạng: xem/dùng một mục (bridge mới tải nội dung, và chỉ với link đã có trong chỉ mục); xóa chỉ mục. */
  | { type: "ref_open"; id: string; refId: string }
  | { type: "ref_clear" }
  /** Hình trong văn bản Word: bản đồ hình–câu (không kèm ảnh); bridge xin ảnh của hình chưa đọc bằng img_need. */
  | { type: "img_map"; items: ImgMeta[] }
  | { type: "img_data"; items: Array<{ hash: string; data: string }> }
  | { type: "learn_delete"; name?: string; all?: boolean }
  /** Skills: xem danh sách; dò một nguồn GitHub; cài các skill đã chọn (hoặc dán SKILL.md); đổi chế độ nạp; xóa. */
  /** Cập nhật: kiểm tra bản mới; tải và cài bản mới (bridge tự khởi động lại). */
  | { type: "update_check" }
  | { type: "update_apply" }
  /** Cập nhật bằng lệnh cài đặt từ GitHub (macOS: install.sh, Windows: install.ps1), dùng khi nút Cập nhật ngay báo lỗi. */
  | { type: "update_installer" }
  /** Phản hồi cộng đồng: xem trước gói skill PVTA đã học; gửi lên GitHub (names = các mục thầy cô đã tích, bỏ trống = tất cả). */
  | { type: "community_preview" }
  | { type: "community_send"; names?: string[] }
  | { type: "skills_get" }
  | { type: "skills_scan"; source: string }
  | { type: "skills_install"; source?: string; keys?: string[]; text?: string; name?: string }
  | { type: "skills_set"; name: string; load: SkillLoad }
  | { type: "skills_delete"; name: string }
  /** Hội thoại & dự án (lưu ở bridge, dùng chung Word, Excel, PowerPoint). */
  /** Chủ đề có sẵn của Office trên máy (theo phần mềm của cửa sổ này). */
  | { type: "themes_get" }
  /** Nhờ PVTA chọn chủ đề: profile = cấu trúc tệp đang mở; wish = mô tả của giáo viên (tùy chọn). Kết quả là write_result chứa JSON {direction, picks}. */
  | { type: "theme_suggest"; id: string; profile: string; wish?: string; model: ModelChoice | "auto"; effort?: Effort }
  | { type: "ws_get" }
  /** Mở hội thoại có sẵn (id) hoặc bắt đầu hội thoại mới (không id; projectId = trong dự án nào). */
  | { type: "ws_open"; id?: string; projectId?: string }
  | { type: "ws_save"; id: string; msgs: unknown[] }
  | { type: "ws_rename"; id: string; title: string }
  | { type: "ws_move"; id: string; projectId: string | null }
  | { type: "ws_delete"; id: string }
  | { type: "ws_project"; project: { id?: string; name?: string; rules?: string } }
  | { type: "ws_project_delete"; id: string }
  | { type: "ws_rules"; rules: string }
  | { type: "ws_link"; link: boolean }
  /** Tệp đính kèm (đã trích chữ ở add-in) vào một hội thoại (id = mã hội thoại) hoặc một dự án (id = mã dự án). */
  | { type: "file_add"; scope: "chat" | "project"; id: string; name: string; text: string }
  | { type: "file_remove"; scope: "chat" | "project"; id: string; name: string }
  | { type: "reset" }
  /** RAG từ tệp đang mở: add-in gửi các đoạn đã đọc từ tài liệu; bridge dựng chỉ mục cục bộ. */
  | { type: "rag_build"; name: string; segments: RagSegment[]; fp?: string }
  | { type: "rag_set"; enabled: boolean }
  | { type: "rag_clear" }
  /** Chế độ iPad: xem trạng thái (làm mới tên/IP), bật/tắt, mở thư mục manifest, đổi mã ghép nối. */
  | { type: "ipad_get" }
  | { type: "ipad_set"; enabled: boolean }
  | { type: "ipad_reveal" }
  | { type: "ipad_reset" }
  /** Sổ nguồn (dùng chung với PVTA Chat): gọi lệnh nb.* (list, create, get, rename, remove, toggle, removeSource, addUrl, ask, clear, links, setLinks…). Kết quả: nb_reply cùng req. */
  | { type: "nb"; req: string; method: string; params?: Record<string, unknown> }
  /** Tải tệp từng phần (base64, mỗi phần ≤ ~4 MB). purpose "notebook" = thêm vào sổ nb; "ocr" = đọc chữ PDF scan, trả {text} qua nb_reply. */
  | { type: "nb_upload"; req: string; purpose: "notebook" | "ocr"; nb?: string; name: string; part: number; last: boolean; data: string }
  | { type: "nb_cancel"; req: string }
  | { type: "cancel"; id: string };

/** Quy tắc đặt tên (#khóa) tạo trong PVTA Chat; add-in chỉ đọc và áp dụng, sửa ở Chat. */
export interface SharedRule {
  key: string;
  title: string;
  text: string;
  always: boolean;
}

/** Chế độ nạp skill: always = luôn nạp; demand = model tự đọc khi cần; manual = chỉ khi gõ /tên; off = tắt. */
export type SkillLoad = "always" | "demand" | "manual" | "off";
export const SKILL_LOADS: readonly SkillLoad[] = ["always", "demand", "manual", "off"];
export interface SkillInfo {
  name: string;
  description: string;
  load: SkillLoad;
  /** builtin = đi kèm PVTA; learned = PVTA tự học; community = nhập từ ngoài; own = thầy cô tự viết. */
  kind: "builtin" | "learned" | "community" | "own";
  source?: string;
  chars: number;
}
export interface FoundSkill {
  key: string;
  name: string;
  description: string;
  chars: number;
  /** Có lý do thì không cài được (quá dài, giống chỉ dẫn độc hại…). */
  problem?: string;
}

export interface ChatMeta {
  id: string;
  title: string;
  host: OfficeHost;
  projectId?: string;
  updatedAt: number;
  /** Tóm tắt ngắn do PVTA viết cho hội thoại trong dự án (bộ nhớ của dự án). */
  digest?: string;
}
/**
 * Gợi ý cho tệp đang mở. Chỉ gửi mã (id); add-in tự tra tên hiển thị. `source`: local = luật cục bộ (tức thì, không tốn hạn mức),
 * ai = đã có thêm một lượt model nhỏ nhất tinh chỉnh.
 */
export interface ImgMeta {
  /** H1, H2… theo thứ tự trong văn bản. */
  id: string;
  hash: string;
  /** "Câu 2" nếu hình thuộc một câu. */
  question?: string;
  caption?: string;
  /** Lời câu hỏi chứa hình (rút gọn). */
  context: string;
  w: number;
  h: number;
}

export interface RefInfo {
  id: string;
  title: string;
  url: string;
  host: string;
  why: string;
}

export interface BasisChange {
  no: string;
  text: string;
}
export interface BasisRelated {
  title: string;
  no?: string;
  url?: string;
  isNew: boolean;
  statusLabel: string;
  why: string;
}

export interface Hints {
  source: "local" | "ai";
  mode?: { id: string; reason: string };
  skills: Array<{ name: string; reason: string }>;
  project?: { id: string; reason: string };
  /** Hai câu lệnh gợi ý theo tệp đang mở (thay hai gợi ý đầu của màn hình trống). */
  starters?: string[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  rules: string;
}
export interface FileInfo {
  name: string;
  chars: number;
  truncated?: boolean;
}
export interface WorkspaceState {
  chats: ChatMeta[];
  projects: ProjectMeta[];
  globalRules: string;
  /** Hội thoại dùng chung giữa Word, Excel, PowerPoint. */
  link: boolean;
  /** Hội thoại đang mở ở cửa sổ này. */
  active?: string;
  /** Dự án của hội thoại đang mở ở cửa sổ này (kể cả hội thoại mới chưa lưu). */
  activeProject?: string;
  /** Tệp của từng dự án, và tệp của hội thoại đang mở. */
  projectFiles: Record<string, FileInfo[]>;
  chatFiles: FileInfo[];
  /** Quy tắc chung lấy từ PVTA Chat (chỉ đọc): đoạn «quy tắc chung» và các quy tắc #khóa cá nhân. */
  chatRules?: { text: string; rules: SharedRule[] };
}

/** Trạng thái chỉ mục RAG của tệp đang mở. */
export interface RagStatus {
  /** Bật (mặc định): PVTA tự chèn các đoạn liên quan vào câu hỏi. */
  enabled: boolean;
  /** Có chỉ mục dùng được. */
  ready: boolean;
  name?: string;
  chunks?: number;
  chars?: number;
  truncated?: boolean;
  builtAt?: number;
  /** Thời gian dựng chỉ mục (ms). */
  ms?: number;
  fp?: string;
}

/** Chế độ iPad: máy tính làm máy chủ cho Word/Excel trên iPad trong cùng Wi-Fi. */
export interface IpadStatus {
  /** Người dùng đã bật (lưu trong cấu hình). */
  enabled: boolean;
  /** Máy chủ iPad đang lắng nghe. */
  running: boolean;
  /** Kết nối đang xem trạng thái này đến từ iPad. */
  remote: boolean;
  /** Tên máy trong mạng (vd. phan-macbook.local). */
  host: string;
  ips: string[];
  port: number;
  /** Trang hướng dẫn mở bằng Safari trên iPad. */
  setupUrl?: string;
  setupUrlIp?: string;
  /** Thư mục chứa manifest iPad trên máy tính. */
  manifestDir?: string;
  /** Số iPad đang nối. */
  clients: number;
  error?: string;
}

/** Thông tin máy: backend nào có, Auto đang trỏ tới đâu. */
export interface MachineInfo {
  capabilities: Capabilities;
  api: ApiStatus;
  /** Model mà Auto sẽ chạy trên máy này (null = máy chưa có backend nào). */
  auto: ModelChoice | null;
  /** Danh sách model của từng CLI, lấy từ CLI trên máy này. */
  models: ModelCatalog;
  /** Hệ điều hành của máy chạy bridge, để hiện đúng lệnh cài. */
  platform: "mac" | "win" | "linux";
  /** Đang dò CLI lần đầu (chưa biết chắc máy có gì). */
  scanning: boolean;
}

// ---- Bridge -> Add-in ----
export type ServerMessage =
  | StandardizeReply
  | ({
      type: "ready";
      permission: PermissionLevel | null;
      /** Model đang ghim ("auto" nếu người dùng chọn Auto). */
      model: ModelChoice | "auto";
      effort: Effort;
      mode: WritingMode;
      /** Nhiệt độ tự chỉnh đã lưu (null = theo chế độ). */
      temperature: number | null;
      /** Phiên đang xử lý dở một tin nhắn (tải lại panel giữa chừng). */
      busy: boolean;
    } & MachineInfo)
  | ({ type: "capabilities" } & MachineInfo)
  /** Kết quả tải danh sách model (không chứa khóa). saved = danh sách đã được lưu cho nhà cung cấp này. */
  | { type: "api_models"; provider: ApiProvider; ok: boolean; models?: ApiModelEntry[]; saved?: boolean; error?: string }
  | { type: "prompts"; own: LibraryPrompt[]; favorites: string[] }
  /** Danh sách chế độ tự tạo. saved = mã vừa lưu; notice = báo kết quả nhập tệp. */
  | { type: "modes"; custom: CustomMode[]; saved?: string; notice?: string }
  /** Những gì PVTA đã học (skill learned-*), kèm công tắc và số tín hiệu đang chờ học. */
  | ({ type: "workspace" } & WorkspaceState)
  | { type: "nb_reply"; req: string; ok: boolean; data?: unknown; error?: string }
  | { type: "nb_changed"; id: string }
  | { type: "themes"; host: OfficeHost; themes: OfficeTheme[]; colors: OfficeTheme[]; fonts: OfficeTheme[]; source: "office" | "builtin"; dirs: string[] }
  | { type: "ws_chat"; id: string; msgs: unknown[] }
  /** Phiên bản đang chạy và có bản mới không. state = bước đang làm khi cập nhật. */
  | { type: "update"; current: string; available: boolean; latest?: string; notes?: string; state?: "checking" | "downloading" | "installing" | "restarting"; error?: string; canUpdate: boolean; /** Lệnh cài đặt của hệ điều hành này (không có trên Linux). */ installerCmd?: string }
  /**
   * Phản hồi cộng đồng. preview = danh sách sẽ gửi; sending = đang gửi; sent = đã tạo issue (url);
   * manual = máy không có gh đăng nhập: chép body vào bộ nhớ tạm rồi mở issueUrl; error = lỗi (message).
   */
  | { type: "community"; phase: "preview" | "sending" | "sent" | "manual" | "error"; items?: Array<{ name: string; description: string; size: number }>; skipped?: Array<{ name: string; reason: string }>; url?: string; issueUrl?: string; body?: string; file?: string; message?: string }
  /** Các skill đang có (đi kèm, đã học, nhập từ cộng đồng, tự viết). notice = kết quả lần cài vừa rồi. */
  | { type: "skills"; items: SkillInfo[]; notice?: string }
  /** Kết quả dò một nguồn GitHub: các skill tìm thấy để thầy cô chọn cài. */
  | { type: "skills_found"; source: string; items: FoundSkill[] }
  | { type: "hints"; id: string; hints: Hints }
  | { type: "hints_cfg"; enabled: boolean }
  /** Kết quả đối chiếu căn cứ; chỉ gửi khi có căn cứ đã thay đổi hoặc có văn bản mới cùng chủ đề. */
  | { type: "basis_report"; id: string; changed: BasisChange[]; related: BasisRelated[]; fixPrompt?: string; disclaimer: string }
  | ({ type: "ipad" } & IpadStatus)
  | ({ type: "rag" } & RagStatus)
  /** Trạng thái "làm đẹp": research (tra cứu) → working (đang sửa) → waiting (chờ người dùng lưu) → learning → off. */
  /** Lời nhắc thật PVTA gửi cho model thay cho câu ngắn người dùng thấy (vd khi bấm ✨ Làm đẹp). */
  | { type: "prompt_shown"; id: string; text: string }
  | { type: "beautify_state"; phase: "research" | "working" | "waiting" | "learning" | "off"; label?: string; note?: string }
  | { type: "refs"; items: RefInfo[] }
  | { type: "img_need"; hashes: string[] }
  /** Model nền đã đọc bao nhiêu hình của văn bản đang mở. */
  | { type: "img_status"; total: number; read: number }
  | { type: "ref_text"; id: string; refId: string; ok: boolean; title?: string; url?: string; text?: string; truncated?: boolean; error?: string }
  | { type: "learned"; enabled: boolean; pending: number; items: Array<{ name: string; description: string; body: string; source?: "file" }>; fileLearn?: { busy: boolean; note?: string } }
  | { type: "text_delta"; id: string; text: string }
  | { type: "rpc_request"; id: string; call: ToolCall }
  | { type: "approval_request"; id: string; call: ToolCall }
  | { type: "tool_status"; id: string; tool: string; status: "running" | "done" | "denied" | "error"; detail?: string }
  /** Cho biết model thực sự được chạy (Auto được đổi thành model cụ thể). */
  | { type: "model_used"; id: string; model: ModelChoice }
  /** Kết quả cuối của công cụ viết (đã bỏ phần bọc thừa), gửi ngay trước "done". */
  | { type: "write_result"; id: string; text: string }
  /** notes: điều chỉnh bridge đã tự làm, vd model không nhận nhiệt độ nên đã dùng mặc định. */
  | {
      type: "done";
      id: string;
      timings: Timings;
      notes?: string[];
      /** Model trả lời câu hỏi và đề nghị áp dụng một thay đổi vào tài liệu: add-in hiện nút Có / Không. */
      offer?: { summary: string };
    }
  | { type: "error"; id: string; kind: ErrorKind; message: string };

/** "missing" = backend chưa cài / chưa có khóa (gợi ý cài, không phải lỗi của model). */
export type ErrorKind = "flag" | "session" | "model" | "auth" | "denied" | "timeout" | "missing" | "other";

/** Đo thời gian từng khâu (ms), để biết chậm ở đâu. */
export interface Timings {
  spawnMs?: number;
  firstTokenMs?: number;
  totalMs: number;
  rounds: number;
  rpcMs: number[];
  /** Lần gọi CLI đầu tiên dùng tiến trình đã khởi động sẵn. */
  warm?: boolean;
}

/** Thông tin dò từ `--help` của từng CLI (lần chạy đầu / khi đổi phiên bản). */
export type Capabilities = Partial<Record<CliBackendId, { installed: boolean; version: string; efforts?: Effort[] }>>;

/**
 * Mức suy nghĩ mà từng backend/model cho phép chọn (rỗng = cố định theo model, không chọn được).
 * Ưu tiên khai báo của chính model trong danh sách lấy từ CLI; sau đó mới đến `--help`.
 */
export function effortsFor(backend: BackendId, model: string, caps?: Capabilities, catalog?: ModelCatalog): readonly Effort[] {
  if (backend === "api") {
    if (/^commandcode\/deepseek\/deepseek-(v4(?:[.-]|$)|flash$)/i.test(model)) return ["low", "high", "max"];
    if (model.startsWith("openai/")) return ["low", "medium", "high"];
    if (model.startsWith("anthropic/")) return ["low", "medium", "high", "xhigh", "max"]; // output_config.effort
    return [];
  }
  const info = findModelInfo(catalog?.[backend]?.models, model)?.info;
  if (info?.variants) return orderEfforts(Object.keys(info.variants) as Effort[]);
  if (info?.efforts) return info.efforts;
  if (backend === "agy" && /-(low|medium|high)$/i.test(model)) return [];
  const known = caps?.[backend]?.efforts; // đọc từ `--help` của chính CLI đang cài
  if (known && known.length > 0) return known;
  return []; // Không suy đoán mức của model/CLI chưa khai báo khả năng.
}

export function orderEfforts(list: readonly Effort[]): Effort[] {
  return EFFORTS.filter((e) => list.includes(e));
}

/** Tìm model theo mã (kể cả mã biến thể của agy). effort = mức mà mã biến thể đó đại diện. */
export function findModelInfo(models: ModelInfo[] | undefined, model: string): { info: ModelInfo; effort?: Effort } | undefined {
  for (const info of models ?? []) {
    if (info.id === model) return { info };
    for (const [e, slug] of Object.entries(info.variants ?? {})) if (slug === model) return { info, effort: e as Effort };
  }
  return undefined;
}

/** Lựa chọn gửi cho bridge từ một model trong danh sách, mức suy nghĩ và chế độ Nhanh. */
export function choiceFromInfo(backend: CliBackendId, info: ModelInfo, effort: Effort, fast: boolean): ModelChoice {
  let model = info.id;
  if (info.variants) {
    const have = orderEfforts(Object.keys(info.variants) as Effort[]);
    const pick = clampEffort(have, effort) ?? have[0];
    model = (pick && info.variants[pick]) || info.id;
  }
  const choice: ModelChoice = { backend, model };
  if (fast && info.fast) choice.speed = info.fastTier ?? "fast";
  return choice;
}

/** Đưa mức đã lưu về mức gần nhất backend cho phép (vd xhigh → high với agy). */
export function clampEffort(allowed: readonly Effort[], e: Effort): Effort | undefined {
  if (allowed.length === 0) return undefined;
  if (allowed.includes(e)) return e;
  // Mức gần nhất không vượt quá mức đã chọn (xhigh → high); không có thì mức thấp nhất model cho phép.
  const idx = EFFORTS.indexOf(e);
  const below = allowed.filter((a) => EFFORTS.indexOf(a) <= idx);
  return below.length > 0 ? below[below.length - 1] : allowed[0];
}

/** Mức suy nghĩ đang áp dụng thật: với model có biến thể (agy) là mức của mã đang chọn, còn lại là mức đã lưu đưa về mức model cho phép. */
export function effectiveEffort(choice: ModelChoice, saved: Effort, caps?: Capabilities, catalog?: ModelCatalog): Effort | undefined {
  if (choice.backend !== "api") {
    const hit = findModelInfo(catalog?.[choice.backend]?.models, choice.model);
    if (hit?.effort) return hit.effort;
  }
  return clampEffort(effortsFor(choice.backend, choice.model, caps, catalog), saved);
}

/** Kiểm tra lựa chọn model gửi từ add-in: backend hợp lệ, mã model ngắn và chỉ gồm ký tự an toàn. */
export function isValidModelChoice(v: unknown): v is ModelChoice {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.backend === "string" &&
    (BACKEND_IDS as readonly string[]).includes(m.backend) &&
    typeof m.model === "string" &&
    /^[A-Za-z0-9][\w.:/@+-]{0,99}$/.test(m.model) &&
    (m.speed === undefined || (typeof m.speed === "string" && /^[a-z][a-z0-9_-]{0,19}$/i.test(m.speed)))
  );
}

/** Trạng thái cập nhật PVTA gửi cho add-in. */
export type UpdateState = Extract<ServerMessage, { type: "update" }>;
