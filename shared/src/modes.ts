import { EFFORTS, type Effort } from "./protocol.js";

/**
 * Chế độ viết: cách model trả lời. Mỗi chế độ gồm
 * - chỉ dẫn đưa vào prompt (dùng được với MỌI backend),
 * - mức suy nghĩ gợi ý (add-in đặt khi chọn chế độ, người dùng vẫn đổi được),
 * - nhiệt độ (temperature): CHỈ áp dụng khi gọi qua API và model nhận tham số này.
 *   Claude Code, Codex và agy không có cờ chỉnh nhiệt độ; nhiều model mới (Claude 5.5,
 *   GPT-5.x có suy nghĩ) cũng từ chối, khi đó bridge bỏ tham số và báo lại.
 */
export type BuiltinMode = "standard" | "exact" | "academic" | "accounting" | "creative" | "admin" | "concise" | "developer";
/** Mã chế độ: một chế độ có sẵn, hoặc chế độ người dùng tự tạo (mã dạng "c-xxxxxxxx"). */
export type WritingMode = BuiltinMode | (string & {});

export interface ModeSpec {
  id: WritingMode;
  temperature?: number;
  effort?: Effort;
  instructions: string;
}

export const WRITING_MODES: Record<BuiltinMode, ModeSpec> = {
  standard: { id: "standard", instructions: "" },
  exact: {
    id: "exact",
    temperature: 0,
    effort: "medium",
    instructions: [
      "CHẾ ĐỘ CHÍNH XÁC (Toán, Khoa học tự nhiên):",
      "- Giải từng bước, mỗi bước một dòng; nêu công thức trước khi thay số.",
      "- Giữ đơn vị SI trong mọi phép tính; không làm tròn ở bước trung gian; kết quả cuối làm tròn hợp lí và ghi đơn vị.",
      "- Tự kiểm tra lại phép tính và đơn vị trước khi trả lời; nếu thiếu dữ kiện thì nói rõ thiếu gì, không đoán.",
      "- Viết số thập phân bằng dấu phẩy theo cách viết của Việt Nam (vd 9,8 m/s²); kí hiệu, thuật ngữ đúng chương trình giáo dục phổ thông 2018.",
      "- Không thêm lời bình, ví dụ hay chi tiết không được hỏi.",
    ].join("\n"),
  },
  academic: {
    id: "academic",
    temperature: 0.3,
    effort: "medium",
    instructions: [
      "CHẾ ĐỘ HỌC THUẬT:",
      "- Văn phong khoa học, khách quan, dùng thuật ngữ chính xác; định nghĩa thuật ngữ ở lần dùng đầu.",
      "- Lập luận chặt chẽ: luận điểm → luận cứ → kết luận; phân biệt rõ dữ kiện với nhận định.",
      "- KHÔNG bịa trích dẫn, số liệu, tên tác giả hay tài liệu tham khảo; chỗ cần nguồn thì ghi [cần nguồn].",
      "- Khi góp ý, nhận xét hay phản biện nội dung: MỖI nhận định phải kèm chứng minh: lập luận từng bước, phản ví dụ, số liệu, hoặc căn cứ có thật (SGK, chương trình GDPT 2018, định luật / định nghĩa chuẩn). Nêu rõ mức độ chắc chắn; chỗ còn tranh luận thì trình bày các quan điểm.",
      "- Lời khuyên phải cụ thể: sửa câu nào, thành câu gì, vì sao tốt hơn.",
    ].join("\n"),
  },
  accounting: {
    id: "accounting",
    temperature: 0,
    effort: "medium",
    instructions: [
      "CHẾ ĐỘ KẾ TOÁN (gần Học thuật; số liệu phải chính xác tuyệt đối, trong Word, Excel và PowerPoint):",
      "- MỌI phép tính (cộng, nhân, chia, phần trăm, thuế, điểm trung bình, làm tròn) phải gọi office_calc; KHÔNG tự nhẩm. Chỉ ghi vào tài liệu con số do công cụ trả về.",
      "- Thống kê điểm/số liệu (điểm trung bình có hệ số, trung vị, độ lệch chuẩn, tỉ lệ đạt, đếm số học sinh theo ngưỡng, xếp hạng) cũng gọi office_calc bằng các hàm wavg, median, stdev_s/stdev_p, percent, count_ge…, rank; không tự đếm, không tự xếp.",
      "- Khi tài liệu đã có sẵn con số (ô, bảng, câu văn, slide): đọc ra rồi gọi office_calc_check để tính lại tổng, phần trăm, chênh lệch và báo ô nào lệch; không tự sửa số của người dùng, hãy nêu chỗ lệch và số đúng.",
      "- Mỗi con số phải có nguồn: lấy từ ô/bảng/dữ kiện nào do người dùng cung cấp. Thiếu dữ kiện, tỉ giá, thuế suất thì hỏi lại; không đoán, không bịa số liệu.",
      "- Không làm tròn ở bước trung gian; chỉ làm tròn ở kết quả cuối, nói rõ quy ước (mặc định nguyên đồng cho VND, nửa lên). Ghi rõ đơn vị tiền tệ.",
      "- Excel: ưu tiên đặt CÔNG THỨC thay vì dán số cứng; đặt xong đọc lại giá trị và đối chiếu với office_calc.",
      "- Word và PowerPoint: con số trong văn bản, bảng và các slide phải khớp nhau và khớp bảng nguồn; trước khi kết thúc, kiểm lại bằng office_calc_check.",
      "- Viết số theo cách Việt Nam khi trình bày (1.234.567,5), nhưng đưa vào office_calc bằng dấu chấm thập phân, không dấu phân cách hàng nghìn (1234567.5).",
      "- Cuối câu trả lời: một dòng báo cáo đã kiểm bao nhiêu số, lệch những chỗ nào (nếu có).",
    ].join("\n"),
  },
  developer: {
    id: "developer",
    temperature: 0.2,
    effort: "medium",
    instructions: [
      "CHẾ ĐỘ LẬP TRÌNH VIÊN: viết mã, sửa lỗi, kiểm thử và giải thích kỹ thuật.",
      "- Xác định yêu cầu, ngôn ngữ, môi trường và hành vi mong đợi; đọc mã, cấu hình, hướng dẫn dự án và lỗi liên quan trước khi đề xuất sửa. Nếu chưa truy cập được mã nguồn, nói rõ và yêu cầu phần cần thiết; không giả vờ đã đọc tệp.",
      "- Khi được yêu cầu thực hiện, dùng công cụ sẵn có để hoàn thành trong phạm vi quyền Chỉ đọc / Hỏi duyệt / Tự sửa đang chọn; chế độ này không cấp thêm quyền đọc, ghi hay chạy lệnh. Nếu không có công cụ phù hợp, cung cấp mã hoặc bản vá và hướng dẫn áp dụng, không tuyên bố đã sửa trực tiếp.",
      "- Ưu tiên thay đổi nhỏ, đúng nguyên nhân, giữ phong cách và kiến trúc hiện có; không ghi đè thay đổi của người dùng hoặc sửa phần không liên quan. Không thêm thư viện nếu chưa cần thiết.",
      "- Mã phải rõ ràng, có xử lý lỗi và trường hợp biên; không bịa API, tên hàm, phiên bản hay kết quả thực thi. Giữ nguyên tên định danh, đường dẫn và cú pháp; dùng dấu chấm thập phân trong mã.",
      "- Không ghi cứng hoặc đưa khóa API, mật khẩu, token vào mã hay nhật ký. Tuân thủ phạm vi truy cập của dự án và cơ chế duyệt thao tác hiện có.",
      "- Khi sửa lỗi: dựa vào thông báo lỗi và bằng chứng, tái hiện nếu có thể, sửa nguyên nhân rồi chạy kiểm thử phù hợp, kiểm tra kiểu hoặc build nếu môi trường cho phép. Không chạy thao tác phá hủy hoặc triển khai ngoài yêu cầu.",
      "- Trình bày mã trong khối có tên ngôn ngữ; bản vá ghi rõ tệp và vị trí áp dụng. Giải thích ngắn gọn bằng tiếng Việt trừ khi người dùng yêu cầu ngôn ngữ khác.",
      "- Kết quả cuối nêu đã thay đổi gì, vì sao, đã kiểm thử bằng cách nào và phần nào chưa kiểm chứng. Chỉ nói kiểm thử thành công khi có kết quả công cụ xác nhận.",
    ].join("\n"),
  },
  creative: {
    id: "creative",
    temperature: 1,
    instructions: [
      "CHẾ ĐỘ SÁNG TẠO:",
      "- Giàu hình ảnh, gần gũi với học sinh: ví dụ đời sống, câu chuyện ngắn, so sánh, câu hỏi gợi mở, trò chơi.",
      "- Đưa ra nhiều phương án khác nhau khi phù hợp; giọng văn tươi vui.",
      "- Sáng tạo về cách trình bày nhưng kiến thức phải đúng.",
    ].join("\n"),
  },
  admin: {
    id: "admin",
    temperature: 0.2,
    instructions: [
      "CHẾ ĐỘ HÀNH CHÍNH:",
      "- Văn phong hành chính – công vụ: chuẩn mực, khách quan, ngắn gọn, một nghĩa; không dùng từ cảm xúc hay khẩu ngữ.",
      "- Khi soạn văn bản hoàn chỉnh, theo thể thức văn bản hành chính hiện hành (Nghị định 30/2020/NĐ-CP về công tác văn thư): quốc hiệu, tiêu ngữ, số và kí hiệu, địa danh và thời gian, trích yếu, nơi nhận.",
    ].join("\n"),
  },
  concise: {
    id: "concise",
    temperature: 0.2,
    effort: "low",
    instructions: "CHẾ ĐỘ NGẮN GỌN: trả lời ngắn nhất có thể mà vẫn đủ ý; ưu tiên gạch đầu dòng; không mở bài, không tóm tắt lại.",
  },
};

export const WRITING_MODE_IDS = Object.keys(WRITING_MODES) as BuiltinMode[];

/** Biểu tượng của các chế độ có sẵn (tên hiển thị nằm ở i18n của add-in). */
export const BUILTIN_MODE_ICONS: Record<BuiltinMode, string> = {
  standard: "📘",
  exact: "📐",
  academic: "🎓",
  accounting: "🧮",
  developer: "💻",
  creative: "🎨",
  admin: "📄",
  concise: "✂️",
};

/** Chế độ có sẵn (chỉ đọc). */
export function isWritingMode(v: unknown): v is BuiltinMode {
  return typeof v === "string" && (WRITING_MODE_IDS as string[]).includes(v);
}

// ---- Chế độ người dùng tự tạo (lưu ở bridge, tệp modes.json) ----

export interface CustomMode {
  id: string;
  name: string;
  icon?: string;
  /** Mô tả ngắn hiện dưới tên. */
  hint?: string;
  /** Chỉ dẫn đưa vào prompt. */
  instructions: string;
  effort?: Effort;
  /** 0..1, chỉ có tác dụng khi chạy qua API. */
  temperature?: number;
  /** Nhân bản từ chế độ nào (để biết nguồn gốc). */
  from?: string;
}

export const MODE_LIMITS = { count: 40, name: 40, icon: 8, hint: 120, instructions: 4000 } as const;
export const CUSTOM_MODE_ID = /^c-[a-z0-9]{6,32}$/;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Kiểm tra một chế độ tự tạo (từ add-in hoặc tệp nhập). Mã không hợp lệ thì để trống,
 * nơi lưu sẽ cấp mã mới. Trả về lỗi bằng lời dễ hiểu cho giáo viên.
 */
export function sanitizeCustomMode(raw: unknown): { ok: true; mode: CustomMode } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Chế độ không hợp lệ." };
  const r = raw as Record<string, unknown>;
  const name = str(r.name, MODE_LIMITS.name);
  if (!name) return { ok: false, error: "Hãy đặt tên cho chế độ." };
  if (typeof r.instructions === "string" && r.instructions.trim().length > MODE_LIMITS.instructions)
    return { ok: false, error: `Chỉ dẫn của "${name}" quá dài (tối đa ${MODE_LIMITS.instructions.toLocaleString("vi-VN")} ký tự).` };
  const instructions = typeof r.instructions === "string" ? r.instructions.replace(/\r\n?/g, "\n").trim() : "";
  if (!instructions) return { ok: false, error: `Chế độ "${name}" chưa có chỉ dẫn cho AI.` };
  const mode: CustomMode = { id: typeof r.id === "string" && CUSTOM_MODE_ID.test(r.id) ? r.id : "", name, instructions };
  const icon = str(r.icon, MODE_LIMITS.icon);
  if (icon) mode.icon = icon;
  const hint = str(r.hint, MODE_LIMITS.hint);
  if (hint) mode.hint = hint;
  if (typeof r.effort === "string" && (EFFORTS as readonly string[]).includes(r.effort)) mode.effort = r.effort as Effort;
  const temp = clampTemperature(r.temperature);
  if (temp !== undefined) mode.temperature = temp;
  if (typeof r.from === "string" && (isWritingMode(r.from) || CUSTOM_MODE_ID.test(r.from))) mode.from = r.from;
  return { ok: true, mode };
}

/** Đọc nội dung tệp JSON nhập vào: chấp nhận {modes:[…]}, một mảng, hoặc một chế độ. */
export function parseModesImport(data: unknown): { modes: CustomMode[]; errors: string[] } {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { modes?: unknown }).modes)
      ? (data as { modes: unknown[] }).modes
      : data && typeof data === "object"
        ? [data]
        : [];
  const modes: CustomMode[] = [];
  const errors: string[] = [];
  if (list.length === 0) errors.push("Tệp không có chế độ nào.");
  for (const item of list.slice(0, MODE_LIMITS.count)) {
    const r = sanitizeCustomMode(item);
    if (r.ok) modes.push(r.mode);
    else errors.push(r.error);
  }
  if (list.length > MODE_LIMITS.count) errors.push(`Chỉ nhận tối đa ${MODE_LIMITS.count} chế độ.`);
  return { modes, errors };
}

/** Nội dung tệp xuất (để chia sẻ trong tổ chuyên môn): không kèm mã, nơi nhập sẽ cấp mã mới. */
export function exportModes(modes: readonly CustomMode[]): string {
  const clean = modes.map(({ id: _id, ...m }) => m);
  return JSON.stringify({ pvta: "writing-modes", version: 1, modes: clean }, null, 2);
}

/** Thông số để chạy một chế độ (có sẵn hoặc tự tạo). Không tìm thấy thì trả về undefined. */
export function resolveMode(id: unknown, custom: readonly CustomMode[] = []): ModeSpec | undefined {
  if (isWritingMode(id)) return WRITING_MODES[id];
  if (typeof id !== "string") return undefined;
  const c = custom.find((m) => m.id === id);
  return c ? { id: c.id, instructions: c.instructions, effort: c.effort, temperature: c.temperature } : undefined;
}

/** Bản sao chỉnh sửa được từ một chế độ (có sẵn hoặc tự tạo). */
export function duplicateMode(id: string, name: string, custom: readonly CustomMode[] = []): CustomMode | undefined {
  const spec = resolveMode(id, custom);
  if (!spec) return undefined;
  const src = custom.find((m) => m.id === id);
  const icon = src?.icon ?? (isWritingMode(id) ? BUILTIN_MODE_ICONS[id] : undefined);
  return {
    id: "",
    name: name.slice(0, MODE_LIMITS.name),
    ...(icon ? { icon } : {}),
    ...(src?.hint ? { hint: src.hint } : {}),
    instructions: spec.instructions || "Viết rõ ràng, dễ hiểu, đúng kiến thức.",
    ...(spec.effort ? { effort: spec.effort } : {}),
    ...(spec.temperature !== undefined ? { temperature: spec.temperature } : {}),
    from: id,
  };
}

/** Nhiệt độ hợp lệ: 0..1 (thang chung của các API), làm tròn 0,05. */
export function clampTemperature(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.round(Math.min(1, Math.max(0, v)) * 20) / 20;
}
